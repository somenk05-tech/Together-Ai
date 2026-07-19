import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { compatibilityScore, zodiacSign } from './astrology';
import { factorScores, overallScore, hardFilterReason, explain, sharedItems, type DXProfile, type FactorBreakdown } from './matching';
import { decide, scanText, type Check, type ModerationResult } from '../realestate/moderation';
import type { MatchKind, UpsertDatingProfileDto } from './dto/dating.dto';

const MATCH_THRESHOLD = 75; // only curated matches ≥75% are ever shown (spec)

@Injectable()
export class DatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
  ) {}

  // ─────────────── profile ───────────────
  async getProfile(userId: string) {
    const profile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!profile) return null;
    return this.shapeProfile(profile);
  }

  async upsertProfile(userId: string, dto: UpsertDatingProfileDto) {
    const data = {
      gender: dto.gender,
      seeking: dto.seeking,
      bio: dto.bio ?? null,
      birthDate: new Date(dto.birthDate + 'T00:00:00Z'),
      birthTime: dto.birthTime ?? null,
      birthPlace: dto.birthPlace ?? null,
      interests: (dto.interests ?? []).join(','),
      extras: dto.extras ?? null,
      visible: dto.visible ?? true,
    };
    const profile = await this.prisma.datingProfile.upsert({
      where: { userId },
      update: data as never,
      create: { userId, ...data } as never,
    });

    // Every profile passes AI + rule moderation before it's visible to others.
    const result = await this.moderateProfile(userId, dto);
    await this.prisma.datingProfile.update({
      where: { userId },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) } as never,
    });
    await this.logModeration(userId, 'system', result.decision, result.reasons.join(' · '));

    const shaped = this.shapeProfile({ ...profile, moderation: result.decision, moderationJson: JSON.stringify(result) });
    return { ...shaped, notice: this.noticeFor(result) };
  }

  private noticeFor(r: ModerationResult): string {
    if (r.decision === 'approved') return 'Your profile is live — the city will start curating matches.';
    if (r.decision === 'review') return 'Thanks — your profile is in manual review and will go live shortly.';
    return `Your profile isn’t visible yet: ${r.reasons.join(' ')} Fix these and save again.`;
  }

  /** Rule + AI moderation for a dating profile (bio, photos, age, fraud). Photo
   *  vision checks (nudity, same-person, celebrity/stock/AI-face) need a vision
   *  model + stored images — see the dating-moderation TODO; hooks are here. */
  private async moderateProfile(userId: string, dto: UpsertDatingProfileDto): Promise<ModerationResult> {
    let photos: unknown[] = [];
    try { photos = (JSON.parse(dto.extras ?? '{}') as { photos?: unknown[] }).photos ?? []; } catch { photos = []; }
    const bio = (dto.bio ?? '').trim();
    const checks: Check[] = [];

    // Photos: 3–10, at least one.
    checks.push({ name: 'photos', pass: photos.length >= 3 && photos.length <= 10, severity: 'hard', detail: `${photos.length} photos — upload 3 to 10 (at least one clear face photo).` });

    // Age ≥ 18.
    const dob = new Date(dto.birthDate + 'T00:00:00Z');
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 86_400_000));
    checks.push({ name: 'age-18-plus', pass: age >= 18, severity: 'hard', detail: age >= 18 ? `Age ${age}.` : 'You must be 18 or older to use dating.' });

    // Bio: contact info / banned / scam.
    const scan = scanText(`${bio}`);
    checks.push({ name: 'bio-no-contact', pass: scan.contacts.length === 0, severity: 'hard', detail: scan.contacts.length ? `Remove ${scan.contacts.join(', ')} from your bio — keep chat on Together City.` : 'Bio has no off-platform contact.' });
    checks.push({ name: 'bio-safe', pass: !scan.banned, severity: 'hard', detail: scan.banned ? 'Bio contains prohibited content.' : 'Bio content is clean.' });
    checks.push({ name: 'bio-no-scam', pass: !scan.scam, severity: 'soft', detail: scan.scam ? 'Bio has scam-like phrasing — needs a look.' : 'No scam phrasing.' });

    // Account fraud score (deeper signals — device/IP/selfie — need infra; TODO).
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } });
    const rejected = await (this.prisma as unknown as { moderationLog: { count(a: unknown): Promise<number> } }).moderationLog
      .count({ where: { listingId: userId, decision: 'rejected' } }).catch(() => 0);
    let fraud = 0;
    const ageH = user ? (Date.now() - new Date(user.createdAt).getTime()) / 3600_000 : 0;
    if (ageH < 1) fraud += 15;
    fraud += Math.min(30, rejected * 10);
    checks.push({ name: 'fraud-score', pass: fraud < 50, severity: 'soft', detail: `Account risk ${fraud}/100.` });

    // AI bio check (graceful fallback when the key is off).
    const ai = bio.length >= 15 ? await this.aiBioModeration(bio) : null;

    const result = decide(checks, fraud, ai ?? undefined);
    result.decidedAt = new Date().toISOString();
    return result;
  }

  private async aiBioModeration(bio: string): Promise<{ flagged: boolean; confidence: number; reason?: string } | null> {
    const out = await this.ai.json<{ flagged: boolean; confidence: number; reason: string }>(
      'You moderate dating-profile bios. Flag sexual solicitation/escort services, hate/threats, financial or crypto scams, requests for money, off-platform contact details, or spam. ' +
        'Respond as JSON {"flagged": boolean, "confidence": 0..1, "reason": short string}.',
      `Bio:\n"""${bio.slice(0, 800)}"""`,
      null as unknown as { flagged: boolean; confidence: number; reason: string },
      250,
    );
    if (!out || typeof out.flagged !== 'boolean') return null;
    return { flagged: out.flagged, confidence: typeof out.confidence === 'number' ? Math.max(0, Math.min(1, out.confidence)) : 0.5, reason: out.reason };
  }

  private async logModeration(listingId: string, actor: string, decision: string, reason: string) {
    await (this.prisma as unknown as { moderationLog: { create(a: unknown): Promise<unknown> } }).moderationLog
      .create({ data: { listingId, actor, decision, reason: reason.slice(0, 500) } })
      .catch(() => undefined);
  }

  // ─────────────── curated matches ───────────────
  /**
   * Curated Matches (romantic) / New Friends (platonic). Scores every visible,
   * mutually-compatible profile with the astrology engine and returns only
   * pairs ≥75% that haven't been passed. Existing likes/matches carry state.
   */
  async matches(userId: string, kind: MatchKind) {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine) throw new NotFoundException('create your dating profile first');

    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' } as never,
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });

    const states = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], kind },
    });
    const stateFor = (otherId: string) =>
      states.find((s) => s.userOneId === otherId || s.userTwoId === otherId);

    const myD = this.parseDX((mine as { extras?: string | null }).extras);
    const results = [];
    for (const cand of candidates) {
      const state = stateFor(cand.userId);
      // Quality rules: skip passed (cooldown = forever here) and existing matches.
      if (state && this.passedBy(state, userId)) continue;
      if (state?.status === 'matched') continue;

      // Hard filters. Romantic respects seeking/gender both ways; friendships don't.
      if (kind === 'romantic') {
        const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
        const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
        if (!iWant || !theyWant) continue;
        const theirAge = Math.floor((Date.now() - new Date(cand.birthDate).getTime()) / (365.25 * 86_400_000));
        const theirD = this.parseDX((cand as { extras?: string | null }).extras);
        if (hardFilterReason(myD, theirD, theirAge)) continue;
      }

      // Weighted compatibility (astrology-led) with a per-factor breakdown.
      const { score: astro, signA, signB } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: this.splitInterests(mine.interests) },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      const myInterests = this.splitInterests(mine.interests);
      const theirInterests = this.splitInterests(cand.interests);
      const breakdown = factorScores(astro, myInterests, theirInterests, myD, this.parseDX((cand as { extras?: string | null }).extras));
      const score = overallScore(breakdown);
      if (score < MATCH_THRESHOLD) continue;

      void this.cacheScore(userId, cand.userId, breakdown, score);
      results.push({
        matchId: state?.id ?? null,
        user: cand.user,
        bio: cand.bio,
        interests: theirInterests,
        yourSign: signA,
        theirSign: signB,
        score,
        breakdown,
        reasons: explain(breakdown, sharedItems(myInterests, theirInterests)),
        likedByMe: state ? this.likedBy(state, userId) : false,
        matched: false,
        conversationId: state?.conversationId ?? null,
      });
    }
    // Top 3 highest-scoring only — no endless swiping.
    return results.sort((a, b) => b.score - a.score).slice(0, 3);
  }

  private parseDX(extras: string | null | undefined): DXProfile {
    try { return extras ? (JSON.parse(extras) as DXProfile) : {}; } catch { return {}; }
  }

  /** Best-effort precompute cache of a pair's factor scores. */
  private async cacheScore(userA: string, userB: string, f: FactorBreakdown, overall: number) {
    await (this.prisma as unknown as { compatibilityScore: { upsert(a: unknown): Promise<unknown> } }).compatibilityScore
      .upsert({
        where: { userA_userB: { userA, userB } },
        update: { astrology: f.astrology, personality: f.personality, relationshipGoal: f.relationshipGoals, values: f.values, lifestyle: f.lifestyle, interest: f.interests, distance: f.location, overall },
        create: { userA, userB, astrology: f.astrology, personality: f.personality, relationshipGoal: f.relationshipGoals, values: f.values, lifestyle: f.lifestyle, interest: f.interests, distance: f.location, overall },
      })
      .catch(() => undefined);
  }

  // ─────────────── like / pass state machine ───────────────
  async like(userId: string, targetUserId: string, kind: MatchKind) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;
    const updated = await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: meIsOne ? { likedByOne: true } : { likedByTwo: true },
    });

    // Mutual like → matched. Chat is NOT opened yet — it's unlocked via a paid
    // service through the Financial hub (see unlockChat).
    if (updated.likedByOne && updated.likedByTwo && updated.status !== 'matched') {
      const matched = await this.prisma.datingMatch.update({
        where: { id: updated.id },
        data: { status: 'matched' },
      });
      return { matched: true, conversationId: null, chatLocked: true, matchId: matched.id };
    }
    return { matched: false, conversationId: null, chatLocked: false, matchId: updated.id };
  }

  /**
   * Unlock chat with a match — charges the city wallet (Financial hub) at the
   * current rate-card price, then opens the connection + conversation. All money
   * flows through Financial; if the wallet can't cover it, charge() throws 400.
   */
  async unlockChat(userId: string, targetUserId: string, kind: MatchKind, method?: 'wallet' | 'card') {
    const state = await this.upsertState(userId, targetUserId, kind);
    if (state.status !== 'matched') throw new NotFoundException('no active match to unlock');
    if (state.conversationId) return { conversationId: state.conversationId, alreadyOpen: true };

    await this.financial.charge(userId, {
      hub: 'Dating', category: 'dating', label: 'Chat unlock — new match',
      amountInr: this.financial.rate('datingChatUnlock'), method,
    });

    const connectionType = kind === 'romantic' ? 'COUPLE' : 'FRIEND';
    const [userOneId, userTwoId] = [state.userOneId, state.userTwoId];
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType, status: 'ACCEPTED', requestedById: userId },
    });
    const conversation = await this.conversations.startDirect(userId, targetUserId);
    await this.prisma.datingMatch.update({ where: { id: state.id }, data: { conversationId: conversation.id } });
    return { conversationId: conversation.id, alreadyOpen: false };
  }

  async pass(userId: string, targetUserId: string, kind: MatchKind) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;
    await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: { ...(meIsOne ? { passedByOne: true } : { passedByTwo: true }), status: 'passed' },
    });
    return { ok: true };
  }

  // ─────────────── helpers ───────────────
  /** Order-independent pair row, like Connection: userOneId is the smaller id. */
  private async upsertState(userId: string, targetUserId: string, kind: MatchKind) {
    const [userOneId, userTwoId] = [userId, targetUserId].sort();
    return this.prisma.datingMatch.upsert({
      where: { userOneId_userTwoId_kind: { userOneId, userTwoId, kind } },
      update: {},
      create: { userOneId, userTwoId, kind, status: 'pending' },
    });
  }

  private likedBy(s: { userOneId: string; likedByOne: boolean; likedByTwo: boolean }, userId: string) {
    return s.userOneId === userId ? s.likedByOne : s.likedByTwo;
  }

  private passedBy(s: { userOneId: string; passedByOne: boolean; passedByTwo: boolean }, userId: string) {
    return s.userOneId === userId ? s.passedByOne : s.passedByTwo;
  }

  private splitInterests(csv: string): string[] {
    return csv ? csv.split(',').filter(Boolean) : [];
  }

  private shapeProfile(p: {
    userId: string; gender: string; seeking: string; bio: string | null;
    birthDate: Date; birthTime: string | null; birthPlace: string | null;
    interests: string; visible: boolean; extras?: string | null;
    moderation?: string; moderationJson?: string | null;
  }) {
    let reasons: string[] = [];
    try { reasons = p.moderationJson ? (JSON.parse(p.moderationJson) as ModerationResult).reasons : []; } catch { reasons = []; }
    return {
      userId: p.userId,
      gender: p.gender,
      seeking: p.seeking,
      bio: p.bio,
      birthDate: p.birthDate.toISOString().slice(0, 10),
      birthTime: p.birthTime,
      birthPlace: p.birthPlace,
      interests: this.splitInterests(p.interests),
      sign: zodiacSign(p.birthDate).name,
      visible: p.visible,
      extras: (p as { extras?: string | null }).extras ?? null,
      moderation: (p as { moderation?: string }).moderation ?? 'approved',
      moderationReasons: reasons,
    };
  }
}
