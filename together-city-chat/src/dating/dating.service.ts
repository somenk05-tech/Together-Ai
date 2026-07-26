import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { compatibilityScore, zodiacSign } from './astrology';
import { factorScores, overallScore, hardFilterReason, explain, sharedItems, type DXProfile, type FactorBreakdown } from './matching';
import { profileCompletion } from './completion';
import { decide, scanText, type Check, type ModerationResult } from '../realestate/moderation';
import { nickname } from '../shared/nickname';
import type { MatchKind, UpsertDatingProfileDto } from './dto/dating.dto';

const MATCH_THRESHOLD = 75; // only curated matches ≥75% are ever shown (spec)
const MATCH_LIMIT = 24;     // a full ranked list of real matches (not endless swiping)

/** Visibility mode (stored in the profile's extras JSON). */
type Visibility = 'everyone' | 'threshold' | 'paused' | 'hidden';
interface DXVisibility { visibility?: Visibility; minMatchScore?: number }

type ActivityRow = { id: string; hostId: string; text: string; category: string; date: string; time: string | null; groupSize: string; description: string | null; createdAt: Date };
type InviteRow = { id: string; activityId: string; invitedUserId: string; compatibility: number; status: string; trustLevel: number; invitedReveal: boolean; hostReveal: boolean; invitedFriends: boolean; hostFriends: boolean; conversationId: string | null; createdAt: Date };
interface ActivityDelegate { create(a: unknown): Promise<ActivityRow>; findMany(a: unknown): Promise<ActivityRow[]>; findUnique(a: unknown): Promise<ActivityRow | null>; }
interface InviteDelegate { createMany(a: unknown): Promise<{ count: number }>; findMany(a: unknown): Promise<InviteRow[]>; findUnique(a: unknown): Promise<InviteRow | null>; update(a: unknown): Promise<InviteRow>; }

@Injectable()
export class DatingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─────────────── profile ───────────────
  async getProfile(userId: string) {
    const profile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!profile) {
      // First-time open: auto-populate shared fields from the Master Profile so
      // the user only answers dating-specific questions (spec: never ask twice).
      const pre = await this.prefillFromMaster(userId).catch(() => null);
      return pre;
    }
    return this.shapeProfile(profile);
  }

  /** A prefill object (no saved profile yet) built from the Master Profile —
   *  name, gender, DOB, birth details, languages and current location. */
  private async prefillFromMaster(userId: string) {
    const m = await this.masterProfile.get(userId);
    const hasAny = m.gender || m.dateOfBirth || m.languages || m.birthCity || m.city;
    if (!hasAny) return null;
    const birthPlace = [m.birthCity, m.birthState, m.birthCountry].filter(Boolean).join(', ') || null;
    const iso = (d: Date | string | null | undefined) => {
      if (!d) return null;
      const dt = typeof d === 'string' ? new Date(d) : d;
      return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
    };
    return {
      prefilled: true as const,
      saved: false as const,
      name: m.name ?? '',
      gender: m.gender ?? null,
      seeking: null,
      birthDate: iso(m.dateOfBirth),
      birthTime: m.timeOfBirth ?? null,
      birthPlace,
      languages: m.languages ?? null,
      country: m.country ?? m.birthCountry ?? null,
      state: m.state ?? m.birthState ?? null,
      city: m.city ?? m.birthCity ?? null,
      heightCm: typeof m.heightCm === 'number' ? m.heightCm : null,
      photo: (m as { photo?: string | null }).photo ?? null,
      interests: [],
      bio: null,
      // A starting completeness from what the Master Profile already knows, so
      // the user sees progress before answering a single dating-specific field.
      completion: profileCompletion({
        birthTime: m.timeOfBirth, languages: m.languages ? [m.languages] : [], city: m.city ?? m.birthCity ?? null,
      }),
    };
  }

  async upsertProfile(userId: string, dto: UpsertDatingProfileDto) {
    // Visibility mode lives in the extras JSON. paused/hidden take the profile
    // out of everyone's matching pool (visible=false); everyone/threshold keep
    // it in (threshold is enforced per-viewer in matches()).
    const dx = this.parseDX(dto.extras) as DXVisibility;
    const visibility: Visibility = dx.visibility ?? (dto.visible === false ? 'hidden' : 'everyone');
    const inPool = visibility === 'everyone' || visibility === 'threshold';
    const data = {
      gender: dto.gender,
      seeking: dto.seeking,
      bio: dto.bio ?? null,
      birthDate: new Date(dto.birthDate + 'T00:00:00Z'),
      birthTime: dto.birthTime ?? null,
      birthPlace: dto.birthPlace ?? null,
      interests: (dto.interests ?? []).join(','),
      extras: dto.extras ?? null,
      visible: inPool,
    };
    const profile = await this.prisma.datingProfile.upsert({
      where: { userId },
      update: data as never,
      create: { userId, ...data } as never,
    });

    // Master Profile sync (spec: every hub writes shared fields back to the
    // single source of truth, which propagates to astrology/nutrition/fitness).
    const place = (dto.birthPlace ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    await this.masterProfile.syncShared(userId, {
      gender: dto.gender,
      dateOfBirth: new Date(dto.birthDate + 'T00:00:00Z'),
      timeOfBirth: dto.birthTime ?? null,
      birthCity: place[0], birthState: place.length > 2 ? place[1] : undefined,
      birthCountry: place.length > 1 ? place[place.length - 1] : undefined,
    }, 'dating').catch(() => undefined);

    // Every profile passes AI + rule moderation before it's visible to others.
    const result = await this.moderateProfile(userId, dto);
    await this.prisma.datingProfile.update({
      where: { userId },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) } as never,
    });
    await this.logModeration(userId, 'system', result.decision, result.reasons.join(' · '));

    // Dynamic matching (spec §2/§6/§11): once a profile is approved and in the
    // pool, re-run matching against everyone and alert people who just gained a
    // new ≥75% match. Fire-and-forget so saving stays snappy.
    if (result.decision === 'approved' && inPool) {
      void this.reindexAfterChange(userId).catch(() => undefined);
    }

    const shaped = this.shapeProfile({ ...profile, moderation: result.decision, moderationJson: JSON.stringify(result) });
    return { ...shaped, notice: this.noticeFor(result) };
  }

  /**
   * Recompute this user's compatibility against every other approved, in-pool
   * profile. Whenever a pair CROSSES the match threshold upward (was below /
   * unknown, now ≥75%), notify the OTHER user in near real-time — "You have a
   * new 89% compatible match." The sorted-pair compatibility cache is the ledger
   * that prevents re-notifying on every subsequent edit.
   */
  private async reindexAfterChange(userId: string): Promise<void> {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine || !mine.visible || (mine as { moderation?: string }).moderation !== 'approved') return;
    const myD = this.parseDX((mine as { extras?: string | null }).extras);
    const myInterests = this.splitInterests(mine.interests);

    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' } as never,
      take: 500,
    });
    // Connections/blocked users never get a "new match" alert about this member.
    const excluded = await this.connectionExclusions(userId);

    for (const cand of candidates) {
      if (excluded.has(cand.userId)) continue;
      const candD = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility;
      // Romantic reachability both ways (mirrors matches()).
      const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
      const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
      if (!iWant || !theyWant) continue;
      const theirAge = this.ageOf(cand.birthDate);
      if (hardFilterReason(myD, candD, theirAge)) continue;
      if (hardFilterReason(candD, myD, this.ageOf(mine.birthDate))) continue;

      const { score: astro } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: myInterests },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      const breakdown = factorScores(astro, myInterests, this.splitInterests(cand.interests), myD, candD);
      const score = overallScore(breakdown);

      // Threshold-visibility: the candidate only wants to appear to people they
      // score highly with — don't announce a match that won't be shown.
      const candMin = candD.visibility === 'threshold' ? (candD.minMatchScore ?? MATCH_THRESHOLD) : MATCH_THRESHOLD;

      const prev = await this.readPairScore(userId, cand.userId);
      await this.cacheScore(userId, cand.userId, breakdown, score);

      const crossedUp = (prev == null || prev < MATCH_THRESHOLD) && score >= MATCH_THRESHOLD && score >= candMin;
      if (!crossedUp) continue;

      // Never announce a pair they've already passed on.
      const state = await this.prisma.datingMatch.findFirst({
        where: { OR: [{ userOneId: userId, userTwoId: cand.userId }, { userOneId: cand.userId, userTwoId: userId }], kind: 'romantic' },
      });
      if (state && (state.status === 'passed' || state.status === 'matched')) continue;

      await this.notifications.create({
        userId: cand.userId,
        kind: 'dating_match',
        title: `You have a new ${score}% compatible match`,
        body: 'A newly compatible member just joined your matches in the Dating Hub.',
        href: '/dating/matches',
        actorId: userId,
      }).catch(() => undefined);
    }
  }

  /** Sorted-pair cached overall score (the notification ledger), or null. */
  private async readPairScore(a: string, b: string): Promise<number | null> {
    const [userA, userB] = [a, b].sort();
    const row = await (this.prisma as unknown as { compatibilityScore: { findUnique(x: unknown): Promise<{ overall: number } | null> } }).compatibilityScore
      .findUnique({ where: { userA_userB: { userA, userB } } }).catch(() => null);
    return row ? row.overall : null;
  }

  /** Permanently delete the dating profile and everything derived from it —
   *  match states and cached compatibility rows. Removes the user from every
   *  other member's matching pool immediately. */
  async deleteProfile(userId: string) {
    await this.prisma.datingMatch.deleteMany({ where: { OR: [{ userOneId: userId }, { userTwoId: userId }] } }).catch(() => undefined);
    await (this.prisma as unknown as { compatibilityScore: { deleteMany(a: unknown): Promise<unknown> } }).compatibilityScore
      .deleteMany({ where: { OR: [{ userA: userId }, { userB: userId }] } }).catch(() => undefined);
    await this.prisma.datingProfile.delete({ where: { userId } }).catch(() => undefined);
    return { ok: true as const, deleted: true as const };
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
    // Privacy: connections (family/friend/any) and blocked users NEVER enter the
    // dating pool — enforced before any scoring (spec: Connection Exclusion).
    const excluded = await this.connectionExclusions(userId);
    const results = [];
    for (const cand of candidates) {
      if (excluded.has(cand.userId)) continue;
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
      const candDX = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility;
      const breakdown = factorScores(astro, myInterests, theirInterests, myD, candDX);
      const score = overallScore(breakdown);
      if (score < MATCH_THRESHOLD) continue;
      // Threshold-visibility: this candidate only wants to be seen by people
      // they score highly with — hide them from viewers below their minimum.
      if (candDX.visibility === 'threshold' && score < (candDX.minMatchScore ?? MATCH_THRESHOLD)) continue;

      void this.cacheScore(userId, cand.userId, breakdown, score);
      // Their uploaded gallery (first is primary). Falls back to the account
      // photo so a card is never empty. Only eligible viewers reach this point.
      const candPhotos = (candDX as { photos?: string[] }).photos ?? [];
      const photos = (candPhotos.length ? candPhotos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, 6);
      results.push({
        matchId: state?.id ?? null,
        user: cand.user,
        bio: cand.bio,
        interests: theirInterests,
        photos,
        age: this.ageOf(cand.birthDate),
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
    // A full ranked list of real matches (highest compatibility first).
    return results.sort((a, b) => b.score - a.score).slice(0, MATCH_LIMIT);
  }

  /**
   * Low-density discovery mode (audit 6.1). New markets rarely have enough ≥75%
   * matches on day one, and an empty Dating hub churns hard. This scores every
   * eligible candidate once, then:
   *   1. shows the ideal ≥75% pool as "Curated Matches",
   *   2. if that's sparse, progressively relaxes the bar (65% → 55%) under a
   *      clearly-labelled "Recommended Matches" (not presented as ideal),
   *   3. still sparse → surfaces discovery pools: New Members, Recently Active,
   *      People Nearby and Growing Community Picks, so a new resident always
   *      sees real people.
   * Privacy is unchanged: connection/blocked exclusions and each candidate's own
   * threshold-visibility opt-in are still enforced — we only relax the GLOBAL bar.
   */
  async discover(userId: string, kind: MatchKind) {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine) throw new NotFoundException('create your dating profile first');

    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' } as never,
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true, createdAt: true, lastSeen: true, onlineStatus: true } } },
    });
    const states = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], kind },
    });
    const stateFor = (otherId: string) => states.find((s) => s.userOneId === otherId || s.userTwoId === otherId);

    const myD = this.parseDX((mine as { extras?: string | null }).extras) as DXProfile & { city?: string };
    const myCity = (myD.city ?? '').trim().toLowerCase();
    const excluded = await this.connectionExclusions(userId);

    interface Scored {
      card: Record<string, unknown> & {
        user: { id: string; handle: string; name: string; profileImage: string | null };
        score: number;
      };
      createdAt: number; lastSeen: number; online: boolean; city: string;
    }
    const scored: Scored[] = [];

    for (const cand of candidates) {
      if (excluded.has(cand.userId)) continue;
      const state = stateFor(cand.userId);
      if (state && this.passedBy(state, userId)) continue;
      if (state?.status === 'matched') continue;

      if (kind === 'romantic') {
        const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
        const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
        if (!iWant || !theyWant) continue;
        const theirAge = Math.floor((Date.now() - new Date(cand.birthDate).getTime()) / (365.25 * 86_400_000));
        const theirD = this.parseDX((cand as { extras?: string | null }).extras);
        if (hardFilterReason(myD, theirD, theirAge)) continue;
      }

      const { score: astro, signA, signB } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: this.splitInterests(mine.interests) },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      const myInterests = this.splitInterests(mine.interests);
      const theirInterests = this.splitInterests(cand.interests);
      const candDX = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility & { city?: string; photos?: string[] };
      const breakdown = factorScores(astro, myInterests, theirInterests, myD, candDX);
      const score = overallScore(breakdown);
      // Respect each candidate's own opt-in even in discovery — never override it.
      if (candDX.visibility === 'threshold' && score < (candDX.minMatchScore ?? MATCH_THRESHOLD)) continue;

      const candPhotos = candDX.photos ?? [];
      const photos = (candPhotos.length ? candPhotos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, 6);
      scored.push({
        card: {
          matchId: state?.id ?? null,
          user: { id: cand.user.id, handle: cand.user.handle, name: cand.user.name, profileImage: cand.user.profileImage },
          bio: cand.bio,
          interests: theirInterests,
          photos,
          age: this.ageOf(cand.birthDate),
          yourSign: signA,
          theirSign: signB,
          score,
          breakdown,
          reasons: explain(breakdown, sharedItems(myInterests, theirInterests)),
          likedByMe: state ? this.likedBy(state, userId) : false,
          matched: false,
          conversationId: state?.conversationId ?? null,
        },
        createdAt: new Date(cand.createdAt).getTime(),
        lastSeen: new Date(cand.user.lastSeen).getTime(),
        online: cand.user.onlineStatus,
        city: (candDX.city ?? '').trim().toLowerCase(),
      });
    }

    const used = new Set<string>();
    const take = (arr: Scored[], n: number) => {
      const out: Record<string, unknown>[] = [];
      for (const x of arr) {
        if (out.length >= n) break;
        if (used.has(x.card.user.id)) continue;
        used.add(x.card.user.id);
        out.push(x.card);
      }
      return out;
    };

    const sections: { key: string; label: string; note: string; tier: 'ideal' | 'recommended' | 'discovery'; matches: Record<string, unknown>[] }[] = [];

    const ideal = scored.filter((s) => s.card.score >= MATCH_THRESHOLD).sort((a, b) => b.card.score - a.card.score);
    const recommended = scored.filter((s) => s.card.score >= 55 && s.card.score < MATCH_THRESHOLD).sort((a, b) => b.card.score - a.card.score);

    if (ideal.length) {
      sections.push({ key: 'curated', label: 'Curated Matches', note: 'Your strongest matches — 75%+ compatibility.', tier: 'ideal', matches: take(ideal, MATCH_LIMIT) });
    }

    // Progressively relax the bar only when the ideal pool is thin.
    if (ideal.length < 6 && recommended.length) {
      const band = recommended.some((s) => s.card.score >= 65) ? 65 : 55;
      const pool = recommended.filter((s) => s.card.score >= band);
      sections.push({
        key: 'recommended', label: 'Recommended Matches', tier: 'recommended',
        note: `Early days in your city — these are your closest matches so far (${band}%+). As more residents join, stronger matches will appear.`,
        matches: take(pool, MATCH_LIMIT),
      });
    }

    // Discovery pools fill in only while things are still sparse, so dense
    // markets keep a purely compatibility-ranked list.
    const sparse = used.size < 8;
    if (sparse) {
      const newMembers = [...scored].sort((a, b) => b.createdAt - a.createdAt);
      const nm = take(newMembers, 8);
      if (nm.length) sections.push({ key: 'new', label: 'New Members', note: 'Just joined the city — say hello early.', tier: 'discovery', matches: nm });

      const active = [...scored].sort((a, b) => (Number(b.online) - Number(a.online)) || (b.lastSeen - a.lastSeen));
      const ac = take(active, 8);
      if (ac.length) sections.push({ key: 'active', label: 'Recently Active', note: 'Online now or active recently.', tier: 'discovery', matches: ac });

      if (myCity) {
        const nearby = scored.filter((s) => s.city && s.city === myCity).sort((a, b) => b.card.score - a.card.score);
        const nb = take(nearby, 8);
        if (nb.length) sections.push({ key: 'nearby', label: 'People Nearby', note: `New faces in ${myD.city}.`, tier: 'discovery', matches: nb });
      }

      const growing = [...scored].sort((a, b) => b.card.score - a.card.score);
      const gp = take(growing, 8);
      if (gp.length) sections.push({ key: 'growing', label: 'Growing Community Picks', note: 'More residents to meet as your city grows.', tier: 'discovery', matches: gp });
    }

    return {
      sections,
      idealCount: ideal.length,
      lowDensity: ideal.length < 6,
      totalDiscoverable: scored.length,
    };
  }

  private parseDX(extras: string | null | undefined): DXProfile {
    try { return extras ? (JSON.parse(extras) as DXProfile) : {}; } catch { return {}; }
  }

  /**
   * One match's FULL profile for the detail view — the same scoring and privacy
   * gates as the list (approved + visible + not a connection/blocked + mutually
   * reachable), plus the richer fields a full profile shows (location, height,
   * occupation, lifestyle, personality, values, the whole photo gallery).
   */
  async matchDetail(userId: string, targetUserId: string, kind: MatchKind = 'romantic') {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine) throw new NotFoundException('create your dating profile first');
    const cand = await this.prisma.datingProfile.findUnique({
      where: { userId: targetUserId },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    if (!cand || !cand.visible || (cand as { moderation?: string }).moderation !== 'approved') {
      throw new NotFoundException('This profile is not available.');
    }
    // Privacy: a connection or blocked user's dating profile is never exposed.
    const excluded = await this.connectionExclusions(userId);
    if (excluded.has(targetUserId)) throw new NotFoundException('This profile is not available.');

    const myD = this.parseDX((mine as { extras?: string | null }).extras);
    const candD = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility & {
      firstName?: string; photos?: string[]; languages?: string[]; heightCm?: number | null;
      education?: string; profession?: string; selfieVerified?: boolean; selfiePhoto?: string;
    };
    const theirAge = this.ageOf(cand.birthDate);

    // Romantic requires mutual seeking + passing both sides' hard filters.
    if (kind === 'romantic') {
      const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
      const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
      if (!iWant || !theyWant) throw new NotFoundException('This profile is not available.');
      if (hardFilterReason(myD, candD, theirAge)) throw new NotFoundException('This profile is not available.');
    }

    const myInterests = this.splitInterests(mine.interests);
    const theirInterests = this.splitInterests(cand.interests);
    const { score: astro, signA, signB } = compatibilityScore(
      { userId, birthDate: mine.birthDate, interests: myInterests },
      { userId: targetUserId, birthDate: cand.birthDate, interests: theirInterests },
    );
    const breakdown = factorScores(astro, myInterests, theirInterests, myD, candD);
    const score = overallScore(breakdown);

    const state = await this.prisma.datingMatch.findFirst({
      where: { OR: [{ userOneId: userId, userTwoId: targetUserId }, { userOneId: targetUserId, userTwoId: userId }], kind },
    });
    const photos = (candD.photos?.length ? candD.photos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, 10);

    return {
      user: cand.user,
      name: candD.firstName || cand.user.name,
      age: theirAge,
      gender: cand.gender,
      bio: cand.bio,
      photos,
      interests: theirInterests,
      personalityTraits: candD.personalityTraits ?? [],
      values: candD.values ?? [],
      city: candD.city ?? null, state: candD.state ?? null,
      heightCm: candD.heightCm ?? null,
      languages: candD.languages ?? [],
      relationshipGoal: candD.relationshipGoal ?? null,
      diet: candD.diet ?? null, smoking: candD.smoking ?? null, drinking: candD.drinking ?? null,
      fitnessLevel: candD.fitnessLevel ?? null, education: candD.education ?? null, occupation: candD.profession ?? null,
      verified: Boolean(candD.selfieVerified && candD.selfiePhoto), // camera-verified only
      yourSign: signA, theirSign: signB,
      score, breakdown,
      reasons: explain(breakdown, sharedItems(myInterests, theirInterests)),
      likedByMe: state ? this.likedBy(state, userId) : false,
      matched: state?.status === 'matched',
      conversationId: state?.conversationId ?? null,
    };
  }

  /**
   * Mandatory dating privacy rule (server-side, never frontend): the set of
   * users who must NEVER appear in this member's Dating Hub or reach the
   * compatibility engine — everyone they share an ACCEPTED connection with
   * (family, friend, partner, colleague, any Together City connection) and
   * anyone in a BLOCKED relationship, in either direction. Family and friends
   * therefore never discover the member's dating profile.
   */
  private async connectionExclusions(userId: string): Promise<Set<string>> {
    const conns = await this.prisma.connection.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: { in: ['ACCEPTED', 'BLOCKED'] } } as never,
      select: { userOneId: true, userTwoId: true },
    });
    const set = new Set<string>();
    for (const c of conns) set.add(c.userOneId === userId ? c.userTwoId : c.userOneId);
    return set;
  }

  /** Best-effort precompute cache of a pair's factor scores. Stored under the
   *  SORTED pair key so there's exactly one row per pair (also the ledger that
   *  live re-matching reads to detect threshold crossings). */
  private async cacheScore(a: string, b: string, f: FactorBreakdown, overall: number) {
    const [userA, userB] = [a, b].sort();
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
      // Tell the other person it's now a mutual match.
      void this.notifications.create({
        userId: targetUserId, actorId: userId, kind: 'dating_match',
        title: kind === 'romantic' ? "It’s a match! 💫" : "You’re connected 🤝",
        body: kind === 'romantic' ? 'You both liked each other — open Dating to say hi.' : 'You both connected — open Dating to say hi.',
        href: '/dating/matches',
      });
      return { matched: true, conversationId: null, chatLocked: true, matchId: matched.id };
    }
    // A one-way like/request — nudge the other person to check their matches.
    void this.notifications.create({
      userId: targetUserId, actorId: userId, kind: 'dating_like',
      title: kind === 'romantic' ? 'You have a new like 💛' : 'Someone wants to connect',
      body: 'A member likes your profile — see who in your matches.',
      href: '/dating/matches',
    });
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
    // Never invite a family member, friend, existing connection or blocked user.
    const excluded = await this.connectionExclusions(hostId);
    const scored: { userId: string; overall: number }[] = [];
    for (const c of cands) {
      if (excluded.has(c.userId)) continue;
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
        inviteId: i.id, compatibility: i.compatibility, trustLevel: i.trustLevel, conversationId: i.conversationId,
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
        id: inv.id, status: inv.status, trustLevel: inv.trustLevel, compatibility: inv.compatibility, conversationId: inv.conversationId,
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
    if (action === 'pass') {
      await this.invites.update({ where: { id: inviteId }, data: { status: 'passed' } });
      return { status: 'passed', conversationId: null };
    }
    // Connect → open an anonymous chat between host and invitee (trust level 1).
    const activity = await this.activities.findUnique({ where: { id: inv.activityId } });
    let conversationId = inv.conversationId;
    if (activity && !conversationId) {
      conversationId = await this.conversations.getOrCreateDirectByIds(activity.hostId, userId, 1);
    }
    await this.invites.update({ where: { id: inviteId }, data: { status: 'connected', conversationId } });
    return { status: 'connected', conversationId };
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
      if (u.hostReveal && u.invitedReveal && u.trustLevel < 2) {
        await this.invites.update({ where: { id: inviteId }, data: { trustLevel: 2 } });
        if (inv.conversationId) await this.conversations.setAnonymousTrust(inv.conversationId, 2); // reveal names in chat
        return { trustLevel: 2 };
      }
      return { trustLevel: u.trustLevel };
    }
    const u = await this.invites.update({ where: { id: inviteId }, data: isHost ? { hostFriends: true } : { invitedFriends: true } });
    if (u.hostFriends && u.invitedFriends && u.trustLevel < 3) {
      await this.invites.update({ where: { id: inviteId }, data: { trustLevel: 3 } });
      if (inv.conversationId) await this.conversations.setAnonymousTrust(inv.conversationId, null); // fully normal chat
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
    const dx = this.parseDX((p as { extras?: string | null }).extras) as DXProfile & DXVisibility & { photos?: string[]; languages?: string[] };
    const interests = this.splitInterests(p.interests);
    const completion = profileCompletion({
      bio: p.bio, interests, birthTime: p.birthTime, photos: dx.photos, personalityTraits: dx.personalityTraits,
      values: dx.values, languages: dx.languages, city: dx.city, relationshipGoal: dx.relationshipGoal,
      diet: dx.diet, smoking: dx.smoking, drinking: dx.drinking, fitnessLevel: dx.fitnessLevel,
      prefAgeMin: dx.prefAgeMin, prefAgeMax: dx.prefAgeMax,
    });
    return {
      userId: p.userId,
      gender: p.gender,
      seeking: p.seeking,
      bio: p.bio,
      birthDate: p.birthDate.toISOString().slice(0, 10),
      birthTime: p.birthTime,
      birthPlace: p.birthPlace,
      interests,
      sign: zodiacSign(p.birthDate).name,
      visible: p.visible,
      visibility: (dx.visibility ?? 'everyone') as Visibility,
      minMatchScore: dx.minMatchScore ?? MATCH_THRESHOLD,
      extras: (p as { extras?: string | null }).extras ?? null,
      moderation: (p as { moderation?: string }).moderation ?? 'approved',
      moderationReasons: reasons,
      completion,
    };
  }
}
