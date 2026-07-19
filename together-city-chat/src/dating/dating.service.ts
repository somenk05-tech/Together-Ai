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

const NICK_ADJ = ['Cosmic', 'Wandering', 'Curious', 'Easy', 'Golden', 'Northern', 'Quiet', 'Bright', 'Wildflower', 'Midnight', 'Sunlit', 'Coastal'];
const NICK_NOUN = ['Voyager', 'Stargazer', 'Explorer', 'Dreamer', 'Nomad', 'Spark', 'Compass', 'Comet', 'Willow', 'Harbor', 'Ember', 'Meadow'];
function nickname(id: string): string {
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `${NICK_ADJ[h % NICK_ADJ.length]} ${NICK_NOUN[(h >> 4) % NICK_NOUN.length]}`;
}

type ActivityRow = { id: string; hostId: string; text: string; category: string; date: string; time: string | null; groupSize: string; description: string | null; createdAt: Date };
type InviteRow = { id: string; activityId: string; invitedUserId: string; compatibility: number; status: string; trustLevel: number; invitedReveal: boolean; hostReveal: boolean; invitedFriends: boolean; hostFriends: boolean; conversationId: string | null; createdAt: Date };
interface ActivityDelegate { create(a: unknown): Promise<ActivityRow>; findMany(a: unknown): Promise<ActivityRow[]>; findUnique(a: unknown): Promise<ActivityRow | null>; }
interface InviteDelegate { createMany(a: unknown): Promise<{ count: number }>; findMany(a: unknown): Promise<InviteRow[]>; findUnique(a: unknown): Promise<InviteRow | null>; update(a: unknown): Promise<InviteRow>; }

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

  // ─────────────── activity dating ───────────────
  private get activities(): ActivityDelegate { return (this.prisma as unknown as { datingActivity: ActivityDelegate }).datingActivity; }
  private get invites(): InviteDelegate { return (this.prisma as unknown as { activityInvite: InviteDelegate }).activityInvite; }

  private shapeActivity(a: ActivityRow) {
    return { id: a.id, text: a.text, category: a.category, date: a.date, time: a.time, groupSize: a.groupSize, description: a.description, createdOn: a.createdAt.toISOString().slice(0, 10) };
  }
  private ageOf(birthDate: Date): number { return Math.floor((Date.now() - new Date(birthDate).getTime()) / (365.25 * 86_400_000)); }

  /** Anonymised view of a party; identity revealed only at trust level ≥2. */
  private async anonParty(userId: string, trustLevel: number) {
    const prof = await this.prisma.datingProfile.findUnique({ where: { userId } });
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, profileImage: true } });
    const revealed = trustLevel >= 2;
    return {
      nickname: nickname(userId),
      age: prof ? this.ageOf(prof.birthDate) : null,
      sign: prof ? zodiacSign(prof.birthDate).name : null,
      verified: (prof as { moderation?: string } | null)?.moderation === 'approved',
      name: revealed ? user?.name ?? null : null,
      photo: revealed ? user?.profileImage ?? null : null,
      interests: revealed && prof ? this.splitInterests(prof.interests) : [],
    };
  }

  async createActivity(hostId: string, dto: { text: string; category: string; date: string; time?: string; groupSize: string; description?: string }) {
    const host = await this.prisma.datingProfile.findUnique({ where: { userId: hostId } });
    if (!host) throw new NotFoundException('create your dating profile first');
    const activity = await this.activities.create({
      data: { hostId, text: dto.text, category: dto.category, date: dto.date, time: dto.time ?? null, groupSize: dto.groupSize, description: dto.description ?? null },
    });

    // AI invites the most compatible people (weighted score, mutual seeking).
    const cands = await this.prisma.datingProfile.findMany({ where: { userId: { not: hostId }, visible: true, moderation: 'approved' } as never });
    const hostD = this.parseDX((host as { extras?: string | null }).extras);
    const hostInterests = this.splitInterests(host.interests);
    const scored: { userId: string; overall: number }[] = [];
    for (const c of cands) {
      const iWant = host.seeking === 'any' || host.seeking === c.gender;
      const theyWant = c.seeking === 'any' || c.seeking === host.gender;
      if (!iWant || !theyWant) continue;
      const { score: astro } = compatibilityScore(
        { userId: hostId, birthDate: host.birthDate, interests: hostInterests },
        { userId: c.userId, birthDate: c.birthDate, interests: this.splitInterests(c.interests) },
      );
      const f = factorScores(astro, hostInterests, this.splitInterests(c.interests), hostD, this.parseDX((c as { extras?: string | null }).extras));
      scored.push({ userId: c.userId, overall: overallScore(f) });
    }
    const top = scored.sort((a, b) => b.overall - a.overall).filter((s) => s.overall >= 60).slice(0, 6);
    if (top.length) {
      await this.invites.createMany({ data: top.map((t) => ({ activityId: activity.id, invitedUserId: t.userId, compatibility: t.overall })) });
    }
    return { activity: this.shapeActivity(activity), invited: top.length };
  }

  async myActivities(hostId: string) {
    const acts = await this.activities.findMany({ where: { hostId }, orderBy: { createdAt: 'desc' } });
    const out = [];
    for (const a of acts) {
      const invs = await this.invites.findMany({ where: { activityId: a.id } });
      const connected = invs.filter((i) => i.status === 'connected');
      const connections = await Promise.all(connected.map(async (i) => ({
        inviteId: i.id, compatibility: i.compatibility, trustLevel: i.trustLevel,
        myReveal: i.hostReveal, otherReveal: i.invitedReveal, myFriends: i.hostFriends, otherFriends: i.invitedFriends,
        party: await this.anonParty(i.invitedUserId, i.trustLevel),
      })));
      out.push({ ...this.shapeActivity(a), invited: invs.length, connectedCount: connected.length, connections });
    }
    return out;
  }

  async receivedInvites(userId: string) {
    const invs = await this.invites.findMany({ where: { invitedUserId: userId, status: { in: ['pending', 'connected'] } }, orderBy: { createdAt: 'desc' } });
    const out = [];
    for (const inv of invs) {
      const activity = await this.activities.findUnique({ where: { id: inv.activityId } });
      if (!activity) continue;
      out.push({
        id: inv.id, status: inv.status, trustLevel: inv.trustLevel, compatibility: inv.compatibility,
        activity: this.shapeActivity(activity),
        host: await this.anonParty(activity.hostId, inv.trustLevel),
        myReveal: inv.invitedReveal, otherReveal: inv.hostReveal, myFriends: inv.invitedFriends, otherFriends: inv.hostFriends,
      });
    }
    return out;
  }

  async respondInvite(userId: string, inviteId: string, action: 'connect' | 'pass') {
    const inv = await this.invites.findUnique({ where: { id: inviteId } });
    if (!inv || inv.invitedUserId !== userId) throw new NotFoundException('invite not found');
    const status = action === 'connect' ? 'connected' : 'passed';
    await this.invites.update({ where: { id: inviteId }, data: { status } });
    return { status };
  }

  async advanceTrust(userId: string, inviteId: string, step: 'reveal' | 'friends') {
    const inv = await this.invites.findUnique({ where: { id: inviteId } });
    if (!inv) throw new NotFoundException('invite not found');
    const activity = await this.activities.findUnique({ where: { id: inv.activityId } });
    if (!activity) throw new NotFoundException('activity not found');
    const isHost = activity.hostId === userId;
    const isInvited = inv.invitedUserId === userId;
    if (!isHost && !isInvited) throw new NotFoundException('not your invite');
    if (inv.status !== 'connected') return { trustLevel: inv.trustLevel };

    if (step === 'reveal') {
      const u = await this.invites.update({ where: { id: inviteId }, data: isHost ? { hostReveal: true } : { invitedReveal: true } });
      if (u.hostReveal && u.invitedReveal && u.trustLevel < 2) { await this.invites.update({ where: { id: inviteId }, data: { trustLevel: 2 } }); return { trustLevel: 2 }; }
      return { trustLevel: u.trustLevel };
    }
    const u = await this.invites.update({ where: { id: inviteId }, data: isHost ? { hostFriends: true } : { invitedFriends: true } });
    if (u.hostFriends && u.invitedFriends && u.trustLevel < 3) {
      await this.invites.update({ where: { id: inviteId }, data: { trustLevel: 3 } });
      const [userOneId, userTwoId] = [activity.hostId, inv.invitedUserId].sort();
      await this.prisma.connection.upsert({
        where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'FRIEND' } },
        update: { status: 'ACCEPTED' },
        create: { userOneId, userTwoId, connectionType: 'FRIEND', status: 'ACCEPTED', requestedById: userId },
      });
      return { trustLevel: 3 };
    }
    return { trustLevel: u.trustLevel };
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
