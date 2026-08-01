import { swallow } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService, DEFAULT_TIMEZONE } from '../shared/clock/clock.service';
import { AdminService } from '../auth/admin';
import { MasterProfileService } from '../profile/master-profile.service';
import { datingGender } from '../profile/sex-and-gender';
import { BlockingService } from '../connections/blocking.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { NotificationsService } from '../notifications/notifications.service';
import { compatibilityScore, zodiacSign } from './astrology';
import {
  distanceNote, explain, factorScores, matchAlertBody, matchAlertReason, overallScore, preferenceNotes, sharedItems, type DXProfile, type FactorBreakdown, unreachableReason,
} from './matching';
import { LEARNING_WINDOW, learnWeights, overallScoreWith, type Decision } from './learned-weights';
import { profileCompletion } from './completion';
import { DAILY_LIKES, DAILY_SUPER_LIKES, likeLimitMessage, superLimitMessage } from './limits';
import { decide, scanText, type Check, type ModerationResult } from '../realestate/moderation';
import { nickname } from '../shared/nickname';
import type { MatchKind, UpsertDatingProfileDto } from './dto/dating.dto';

const MATCH_THRESHOLD = 75; // only curated matches ≥75% are ever shown (spec)
/** M4: a curated card must be a real profile, not a stub. Below this floor a
 *  candidate stays out of everyone's curated pool until they add substance —
 *  their own completion nudge (profileCompletion) tells them exactly what. */
const CURATED_MIN_COMPLETION = 40;

/**
 * How many profiles are scored per request.
 *
 * There is no longer a cap on how many results come BACK — §15.2 removed the
 * 24-row `slice()`, because deciding who is worth talking to is the citizen's
 * job and a silent truncation made that decision for them without saying so.
 * Everyone who passes the hard filters is returned, ranked, with their
 * percentage.
 *
 * This bound is different in kind: it is how much of the city we read in one
 * query, and it exists so a growing city cannot turn one page load into a full
 * table scan. It is reported to the citizen as `considered`, so "showing all
 * 137 of the 500 people we looked at" is a sentence the page can say honestly.
 * A silent bound is the thing this change is removing; a stated one is a fact.
 */
/**
 * How many dating conversations one citizen may have open at once.
 *
 * Was hardcoded as exactly one. Three is the same three as the free
 * connections, so the two limits in this hub are one number rather than two,
 * and it is small enough that "intentional" still means something.
 */
export const DATING_CHAT_CAP = 3;

const SCORING_POOL = 500;

/**
 * Photos sent per card in a LIST.
 *
 * Photos live in the profile's extras JSON as base64 data URLs, so every one of
 * them travels inline in the response. Six per card was already heavy at 24
 * cards; with the cap gone it decides whether the page loads at all. The list
 * sends the primary photo and the detail view sends the gallery — the same
 * photos, fetched when somebody actually wants to look at them.
 */
const LIST_PHOTOS = 1;
// Admins (by handle) allowed to read Dating Hub stats — same env as moderation.

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
    private readonly admin: AdminService,
    private readonly clock: ClockService,
    private readonly blocking: BlockingService,
  ) {}

  // ─────────────── profile ───────────────
  async getProfile(userId: string) {
    const profile = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!profile) {
      // First-time open: auto-populate shared fields from the Master Profile so
      // the user only answers dating-specific questions (spec: never ask twice).
      // A failed prefill opened a blank form for somebody the city already
      // knows — "never ask twice" silently became "ask twice".
      const pre = await swallow(this.prefillFromMaster(userId), 'dating: prefill from master', { userId });
      return pre;
    }
    return this.shapeProfile(profile);
  }

  /** A prefill object (no saved profile yet) built from the Master Profile —
   *  name, gender, DOB, birth details, languages and current location. */
  private async prefillFromMaster(userId: string) {
    const m = await this.masterProfile.get(userId);
    const hasAny = datingGender(m) || m.dateOfBirth || m.languages || m.birthCity || m.city;
    if (!hasAny) return null;
    const birthPlace = [m.birthCity, m.birthState, m.birthCountry].filter(Boolean).join(', ') || null;
    const iso = (d: Date | string | null | undefined) => {
      if (!d) return null;
      const dt = typeof d === 'string' ? new Date(d) : d;
      // Date-only values (birth date, and dates the citizen typed as YYYY-MM-DD).
      // These mean one calendar day everywhere — deliberately NOT zone-shifted.
      return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
    };
    return {
      prefilled: true as const,
      saved: false as const,
      name: m.name ?? '',
      gender: datingGender(m) ?? null,
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
      update: data,
      create: { userId, ...data },
    });

    // Master Profile sync (spec: every hub writes shared fields back to the
    // single source of truth, which propagates to astrology/nutrition/fitness).
    const place = (dto.birthPlace ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    await swallow(this.masterProfile.syncShared(userId, {
      // The identity vocabulary, not Dating's own. Writing `gender` here put a
      // value back into the column the split retired — which is how the dead
      // column kept looking alive, and why only citizens who started on the
      // Master Profile page were ever re-asked.
      genderIdentity: dto.gender === 'nonbinary' ? 'nonBinary' : dto.gender,
      dateOfBirth: new Date(dto.birthDate + 'T00:00:00Z'),
      timeOfBirth: dto.birthTime ?? null,
      birthCity: place[0], birthState: place.length > 2 ? place[1] : undefined,
      birthCountry: place.length > 1 ? place[place.length - 1] : undefined,
    }, 'dating'), 'dating: master-profile sync', { userId });

    // Every profile passes AI + rule moderation before it's visible to others.
    const result = await this.moderateProfile(userId, dto);
    await this.prisma.datingProfile.update({
      where: { userId },
      data: { moderation: result.decision, moderationJson: JSON.stringify(result) },
    });
    await this.logModeration(userId, 'system', result.decision, result.reasons.join(' · '));

    // Dynamic matching (spec §2/§6/§11): once a profile is approved and in the
    // pool, re-run matching against everyone and alert people who just gained a
    // new ≥75% match. Fire-and-forget so saving stays snappy.
    if (result.decision === 'approved' && inPool) {
      void swallow(this.reindexAfterChange(userId), 'dating: reindex after change', { userId });
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
      where: { userId: { not: userId }, visible: true, moderation: 'approved' },
      take: SCORING_POOL,
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
      // This site always checked both ways — it is what the lists disagreed with.
      if (unreachableReason(myD, candD, this.ageOf(mine.birthDate), theirAge)) continue;

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

      await swallow(this.notifications.create({
        userId: cand.userId,
        kind: 'dating_match',
        title: `You have a new ${score}% compatible match`,
        // Not "just joined" — see matchAlertReason in matching.ts. This runs on
        // every profile save, and a save is almost always somebody editing.
        body: matchAlertBody(matchAlertReason(prev)),
        href: '/dating/matches',
        actorId: userId,
      }), 'dating: match alert', { userId: cand.userId });
    }
  }

  /** Sorted-pair cached overall score (the notification ledger), or null. */
  private async readPairScore(a: string, b: string): Promise<number | null> {
    const [userA, userB] = [a, b].sort();
    const row = await swallow((this.prisma as unknown as { compatibilityScore: { findUnique(x: unknown): Promise<{ overall: number } | null> } }).compatibilityScore
      .findUnique({ where: { userA_userB: { userA, userB } } }), 'dating: pair score read', { userA, userB });
    return row ? row.overall : null;
  }

  /** Permanently delete the dating profile and everything derived from it —
   *  match states and cached compatibility rows. Removes the user from every
   *  other member's matching pool immediately. */
  async deleteProfile(userId: string) {
    // Deleting a dating profile is a privacy promise. Any of these three
    // failing silently meant match state, cached compatibility, or THE
    // PROFILE ITSELF could survive its own deletion with no trace.
    await swallow(this.prisma.datingMatch.deleteMany({ where: { OR: [{ userOneId: userId }, { userTwoId: userId }] } }), 'dating delete: match state', { userId });
    await swallow((this.prisma as unknown as { compatibilityScore: { deleteMany(a: unknown): Promise<unknown> } }).compatibilityScore
      .deleteMany({ where: { OR: [{ userA: userId }, { userB: userId }] } }), 'dating delete: compatibility cache', { userId });
    await swallow(this.prisma.datingProfile.delete({ where: { userId } }), 'dating delete: profile row', { userId });
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
    // At least ONE photo to go live; 3+ is recommended for better matches (nudged in the UI, not enforced).
    checks.push({
      name: 'photos',
      pass: photos.length >= 1 && photos.length <= 10,
      severity: 'hard',
      detail: photos.length < 1
        ? 'Add at least 1 photo (a clear face photo). 3 or more is recommended for better matches.'
        : photos.length > 10
          ? 'Upload no more than 10 photos.'
          : `${photos.length} photo${photos.length === 1 ? '' : 's'} — 3 or more is recommended for better matches.`,
    });

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
    // 0-on-failure told the fraud score this account had a clean record — an
    // absence never established, on a fraud signal.
    const rejected = (await swallow((this.prisma as unknown as { moderationLog: { count(a: unknown): Promise<number> } }).moderationLog
      .count({ where: { listingId: userId, decision: 'rejected' } }), 'dating: moderation history count', { userId })) ?? 0;
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
    // The moderation audit trail is the record of every approve/reject and
    // why — losing an entry silently is losing the review's defensibility.
    await swallow((this.prisma as unknown as { moderationLog: { create(a: unknown): Promise<unknown> } }).moderationLog
      .create({ data: { listingId, actor, decision, reason: reason.slice(0, 500) } }),
      'dating: moderation log write', { listingId, decision });
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

    // unbounded: the matching pool — every visible approved profile is scored; the pool is the product
    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });

    // unbounded: their own match states — bounded by the pool above
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
        const theirAge = this.ageOf(cand.birthDate);
        const theirD = this.parseDX((cand as { extras?: string | null }).extras);
        // Both directions. Showing somebody whose own filters exclude you is
        // offering a door that is locked from the other side.
        if (unreachableReason(myD, theirD, this.ageOf(mine.birthDate), theirAge)) continue;
      }

      // Weighted compatibility (astrology-led) with a per-factor breakdown.
      const { score: astro, signA, signB } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: this.splitInterests(mine.interests) },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      const myInterests = this.splitInterests(mine.interests);
      const theirInterests = this.splitInterests(cand.interests);
      const candDX = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility;
      // M4: near-empty profiles do not reach the curated shelf, however well
      // the stars align — a strong score over a stub oversells a stranger.
      const candCompletion = profileCompletion({
        ...(candDX as Record<string, unknown>),
        bio: cand.bio, interests: this.splitInterests(cand.interests),
      });
      if (candCompletion.percent < CURATED_MIN_COMPLETION) continue;
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
      const photos = (candPhotos.length ? candPhotos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, LIST_PHOTOS);
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
        reasons: explain(breakdown, sharedItems(myInterests, theirInterests), preferenceNotes(myD, candDX), distanceNote(myD, candDX)),
        likedByMe: state ? this.likedBy(state, userId) : false,
        matched: false,
        conversationId: state?.conversationId ?? null,
      });
    }
    // Everyone who passes the filters, best first. There is no slice here any
    // more: choosing who is worth talking to is the citizen's decision, and a
    // silent cut at 24 made it for them without ever saying it had.
    return results.sort((a, b) => b.score - a.score);
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

    // unbounded: the matching pool — every visible approved profile is scored
    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true, createdAt: true, lastSeen: true, onlineStatus: true } } },
    });
    // unbounded: their own match states — bounded by the pool above
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
        const theirAge = this.ageOf(cand.birthDate);
        const theirD = this.parseDX((cand as { extras?: string | null }).extras);
        // Both directions. Showing somebody whose own filters exclude you is
        // offering a door that is locked from the other side.
        if (unreachableReason(myD, theirD, this.ageOf(mine.birthDate), theirAge)) continue;
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
      const photos = (candPhotos.length ? candPhotos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, LIST_PHOTOS);
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
          reasons: explain(breakdown, sharedItems(myInterests, theirInterests), preferenceNotes(myD, candDX), distanceNote(myD, candDX)),
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

    // Everyone, in bands, with their percentage on every card (§15.2).
    //
    // Two caps used to sit here and neither was ever stated. `take(_, 24)` cut
    // each band at 24, and the Recommended band appeared ONLY when the curated
    // pool held fewer than six people — so in a city with seven strong matches,
    // everybody between 55% and 75% was invisible, permanently, to a citizen who
    // had never asked for that filter. Both are gone. The bands stay, because
    // ranking is useful; the truncation goes, because deciding who is worth
    // talking to is the citizen's call and 68% is a number they can read.
    const rest = scored.filter((s) => s.card.score < 55).sort((a, b) => b.card.score - a.card.score);
    const all = (arr: Scored[]) => take(arr, arr.length);

    if (ideal.length) {
      sections.push({ key: 'curated', label: 'Curated Matches', note: 'Your strongest matches \u2014 75%+ compatibility.', tier: 'ideal', matches: all(ideal) });
    }

    if (recommended.length) {
      sections.push({
        key: 'recommended', label: 'Recommended Matches', tier: 'recommended',
        note: ideal.length
          ? 'Good matches just below the curated bar (55\u201374%). Worth a look \u2014 compatibility is a starting point, not a verdict.'
          : 'Early days in your city \u2014 these are your closest matches so far. As more residents join, stronger matches will appear.',
        matches: all(recommended),
      });
    }

    if (rest.length) {
      sections.push({
        key: 'everyone', label: 'Everyone Else', tier: 'discovery',
        note: 'Below 55% on our scoring. Shown because the score is our opinion and the choice is yours.',
        matches: all(rest),
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

  /**
   * Intentional-dating "stack" (audit / product): instead of an endless list, the
   * user is shown only their SINGLE highest-compatibility match, plus a breakdown
   * of how many potential matches sit in each compatibility band (90–100, 80–90 …
   * 20–30). As more residents join, a stronger top match stacks up on top. The
   * stack is meaningful only when the user is NOT already chatting with someone —
   * `engaged` tells the client to hide it and focus the current conversation.
   */
  /**
   * Every decision this citizen has made, with the factors behind it.
   *
   * No new collection: the like/pass is on DatingMatch and the seven factor
   * scores for that pair are already in CompatibilityScore, so a decision and
   * its reasons can be put back together exactly. A pair with no cached score is
   * skipped rather than guessed at — a decision we cannot explain is not
   * evidence, and filling it in with an average is the same mistake this
   * codebase spent the week removing from everywhere else.
   */
  private async decisionsFor(userId: string): Promise<Decision[]> {
    let rows: Array<Record<string, unknown>> = [];
    try {
      rows = await this.prisma.datingMatch.findMany({
        where: { OR: [{ userOneId: userId }, { userTwoId: userId }] },
        take: LEARNING_WINDOW,
        orderBy: { updatedAt: 'desc' },
      }) as unknown as Array<Record<string, unknown>>;
    } catch { return []; }

    const out: Decision[] = [];
    for (const r0 of rows) {
      const r = r0 as unknown as {
        userOneId: string; userTwoId: string;
        likedByOne: boolean; likedByTwo: boolean; passedByOne: boolean; passedByTwo: boolean;
      };
      const meIsOne = r.userOneId === userId;
      const liked = meIsOne ? r.likedByOne : r.likedByTwo;
      const passed = meIsOne ? r.passedByOne : r.passedByTwo;
      // Only MY decision counts. Being liked by somebody says nothing about what
      // I look for, and counting it would learn other people's taste as mine.
      if (liked === passed) continue; // neither, or somehow both
      const other = meIsOne ? r.userTwoId : r.userOneId;
      const f = await this.readPairFactors(userId, other);
      if (!f) continue;
      out.push({ liked, factors: f });
    }
    return out;
  }

  /** The cached seven for a pair, or null when we never scored them. */
  private async readPairFactors(a: string, b: string): Promise<FactorBreakdown | null> {
    const [userA, userB] = [a, b].sort();
    // try/catch around the WHOLE access, not just the promise. Reaching for
    // `.findUnique` on a delegate that is not there throws synchronously, before
    // there is a promise for `.catch` to attach to — and the correct behaviour
    // when the evidence cannot be read is to learn nothing, not to take the
    // matches page down with it.
    let row: Record<string, number> | null = null;
    try {
      row = await (this.prisma as unknown as {
        compatibilityScore: { findUnique(x: unknown): Promise<Record<string, number> | null> };
      }).compatibilityScore.findUnique({ where: { userA_userB: { userA, userB } } });
    } catch { return null; }
    if (!row) return null;
    return {
      astrology: row.astrology, personality: row.personality,
      relationshipGoals: row.relationshipGoal, values: row.values,
      lifestyle: row.lifestyle, interests: row.interest, location: row.distance,
    };
  }

  async stack(userId: string, kind: MatchKind) {
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    if (!mine) throw new NotFoundException('create your dating profile first');

    // What this citizen's own choices have earned. Below the evidence bar this
    // comes back as the standard weights and says so, and the page says so too.
    const ranking = learnWeights(await this.decisionsFor(userId));

    // Already chatting with someone? (one active dating conversation at a time)
    const engagedRow = await this.prisma.datingMatch.findFirst({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: 'matched', conversationId: { not: null } },
    });
    const engaged = Boolean(engagedRow);
    // How many are actually open, so the page can say "two of three" rather than
    // hiding the stack the moment a single conversation exists.
    //
    // try/catch around the WHOLE access, not just the promise: reaching for
    // `.count` on a delegate that does not have it throws synchronously, before
    // there is a promise for `.catch` to attach to. Falling back to the boolean
    // is the honest degradation — we know there is at least one.
    let openChats = engaged ? 1 : 0;
    try {
      openChats = await this.prisma.datingMatch.count({
        where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: 'matched', conversationId: { not: null } },
      });
    } catch { /* keep the boolean-derived count */ }

    // unbounded: the matching pool — every visible approved profile is scored
    const candidates = await this.prisma.datingProfile.findMany({
      where: { userId: { not: userId }, visible: true, moderation: 'approved' },
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    // unbounded: their own match states — bounded by the pool above
    const states = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], kind },
    });
    const stateFor = (otherId: string) => states.find((s) => s.userOneId === otherId || s.userTwoId === otherId);
    const myD = this.parseDX((mine as { extras?: string | null }).extras);
    const excluded = await this.connectionExclusions(userId);
    const myInterests = this.splitInterests(mine.interests);

    const cards: Array<Record<string, unknown> & { score: number }> = [];
    // People you have MUTUALLY liked. They used to be dropped here with a bare
    // `continue`, which meant that the moment a match happened the person
    // vanished from this page — and since a mutual like does not open a chat
    // (that is a separate, paid step), they were nowhere at all. The
    // notification said "open Dating to say hi" and linked to a page that no
    // longer showed them.
    const matchedCards: Array<Record<string, unknown> & { score: number }> = [];
    for (const cand of candidates) {
      if (excluded.has(cand.userId)) continue;
      const state = stateFor(cand.userId);
      if (state && this.passedBy(state, userId)) continue;
      const isMatched = state?.status === 'matched';

      // Discovery filters decide who you are SHOWN. They must not un-show
      // someone you already chose: a preference edit after matching would
      // otherwise silently delete an existing match from the page.
      if (kind === 'romantic' && !isMatched) {
        const iWant = mine.seeking === 'any' || mine.seeking === cand.gender;
        const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
        if (!iWant || !theyWant) continue;
        const theirAge = this.ageOf(cand.birthDate);
        const theirD = this.parseDX((cand as { extras?: string | null }).extras);
        // Both directions. Showing somebody whose own filters exclude you is
        // offering a door that is locked from the other side.
        if (unreachableReason(myD, theirD, this.ageOf(mine.birthDate), theirAge)) continue;
      }

      const { score: astro, signA, signB } = compatibilityScore(
        { userId, birthDate: mine.birthDate, interests: myInterests },
        { userId: cand.userId, birthDate: cand.birthDate, interests: this.splitInterests(cand.interests) },
      );
      const theirInterests = this.splitInterests(cand.interests);
      const candDX = this.parseDX((cand as { extras?: string | null }).extras) as DXProfile & DXVisibility & { photos?: string[] };
      const breakdown = factorScores(astro, myInterests, theirInterests, myD, candDX);
      // TWO SCORES, DELIBERATELY (H2).
      //
      // `standard` is the unlearned one — the same figure for both people — and
      // it is what decides eligibility and what gets cached. `score` is scored
      // against this citizen's own weights and is what they see and are sorted
      // by.
      //
      // The split is the whole safety of the feature. If the threshold moved
      // with the weights, somebody's own swiping would start removing people
      // from their list, which is how a recommender narrows a world without
      // anybody choosing to. And if the CACHE held the learned figure, the next
      // round would learn from its own output.
      // TWO SCORES, DELIBERATELY (H2).
      //
      // `standard` is the unlearned one — the same figure for both people. It is
      // what a threshold-visibility citizen is judged against, because their
      // "only show me to people I score above N with" is a statement about the
      // pair, not about the viewer's swiping habits. `score` is scored against
      // THIS citizen's own weights and is what they see and are sorted by.
      //
      // The split is the whole safety of the feature. If eligibility moved with
      // the weights, somebody's own swiping would start removing people from
      // their list, which is how a recommender narrows a world without anybody
      // choosing to.
      const standard = overallScore(breakdown);
      const score = overallScoreWith(breakdown, ranking.weights);
      // No score floor. A 17% was dropped here silently, which is a judgement
      // about who is worth meeting made by a weighting formula the citizen
      // never saw. The number is shown on every card; they can disagree with it.
      if (!isMatched && candDX.visibility === 'threshold' && standard < (candDX.minMatchScore ?? MATCH_THRESHOLD)) continue;

      const candPhotos = candDX.photos ?? [];
      const photos = (candPhotos.length ? candPhotos : (cand.user.profileImage ? [cand.user.profileImage] : [])).slice(0, LIST_PHOTOS);
      (isMatched ? matchedCards : cards).push({
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
        reasons: explain(breakdown, sharedItems(myInterests, theirInterests), preferenceNotes(myD, candDX), distanceNote(myD, candDX)),
        likedByMe: state ? this.likedBy(state, userId) : false,
        matched: isMatched,
        // Null until Connect to Chat opens the conversation — the card reads it
        // to offer "Open chat" versus "Connect to Chat".
        conversationId: state?.conversationId ?? null,
        chatLocked: isMatched && !state?.conversationId,
      });
    }

    // Compatibility-band histogram: 90–100, 80–90 … 20–30 (highest first).
    const bands = [[90, 101], [80, 90], [70, 80], [60, 70], [50, 60], [40, 50], [30, 40], [20, 30], [0, 20]];
    const distribution = bands.map(([lo, hi]) => ({
      label: `${lo}–${hi === 101 ? 100 : hi}`,
      min: lo,
      max: hi === 101 ? 100 : hi,
      count: cards.filter((c) => c.score >= lo && c.score < hi).length,
    }));

    const top = cards.sort((a, b) => b.score - a.score)[0] ?? null;

    // Newest match first, so the person you just matched with leads the page.
    const matched = matchedCards.sort((a, b) => b.score - a.score);

    // `candidates` is the whole ranked list, not a page of it. `top` stays
    // because the page leads with it, but it is now the first element of
    // something the citizen can scroll rather than the only thing they get.
    return {
      engaged, distribution, top, candidates: cards, matched, totalCandidates: cards.length,
      openChats, chatCap: DATING_CHAT_CAP, atCapacity: openChats >= DATING_CHAT_CAP,
      // Rendered, not logged. Once the weights differ per person so does the
      // percentage, and a screen showing the new number under the old sentence
      // would be lying quietly.
      ranking: {
        learned: ranking.learned, headline: ranking.headline,
        decisions: ranking.decisions, notes: ranking.notes.map((x) => x.note),
      },
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
      // The comment above has said "both sides" since this was written; only one
      // side was ever checked. Now it is both, and the message stays deliberately
      // identical either way — "they filtered you out" is not ours to disclose.
      if (unreachableReason(myD, candD, this.ageOf(mine.birthDate), theirAge)) {
        throw new NotFoundException('This profile is not available.');
      }
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
      reasons: explain(breakdown, sharedItems(myInterests, theirInterests), preferenceNotes(myD, candD), distanceNote(myD, candD)),
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
  // ─────────────── safety, reachable from where the harm is (H6) ───────────────
  /**
   * Block a match from inside the Dating Hub.
   *
   * There was no way to do this here. Blocking lived only in People/Connections,
   * which meant a citizen in a bad dating conversation had to work out that the
   * control they needed was in a different hub, about a person they had met in
   * this one. Safety that is not reachable from where the harm happens is not
   * safety; it is a feature that exists.
   *
   * Four things, in this order, and the order matters — the block lands before
   * anything else can fail:
   *   1. the block itself, through the one writer the whole city shares
   *   2. the match torn down, so they cannot reappear in a list or a like
   *   3. the conversation archived for both, so it stops surfacing
   *   4. nothing sent to them. Not a notification, not an unmatch, nothing.
   *      A block the other person is told about is the one kind that is unsafe.
   */
  async blockMatch(userId: string, targetUserId: string, kind: MatchKind) {
    if (userId === targetUserId) throw new BadRequestException("You can't block yourself.");
    await this.blocking.block(userId, targetUserId);

    const [userOneId, userTwoId] = [userId, targetUserId].sort();
    const state = await this.prisma.datingMatch.findFirst({
      where: { OR: [{ userOneId, userTwoId }], kind },
    });
    if (state) {
      if (state.conversationId) {
        await swallow(this.conversations.archiveForAll(state.conversationId), 'dating pass: archive conversation', { userId });
      }
      // If this write fails the pass is not recorded and the person stays in
      // each other's view — the opposite of what was just asked for.
      await swallow(this.prisma.datingMatch.update({
        where: { id: state.id },
        data: {
          status: 'passed', passedByOne: true, passedByTwo: true,
          revealByOne: false, revealByTwo: false,
        },
      }), 'dating pass: record pass', { userId });
    }
    return { blocked: true as const };
  }

  /**
   * Report a match to the moderation queue.
   *
   * The same Report row the Social hub files, so it lands in the console a
   * moderator already reads rather than a second queue nobody opened. Reporting
   * does NOT block — they are different decisions and a citizen may want only
   * one — but the surface offers both together, because in the moment somebody
   * needs one of these they should not have to find the other.
   *
   * The reported citizen is told nothing, and the reporter is never named to
   * them. A report that gets back to its subject is a report nobody files.
   */
  async reportMatch(userId: string, targetUserId: string, reason?: string) {
    if (userId === targetUserId) throw new BadRequestException("You can't report yourself.");
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
    if (!target) throw new NotFoundException('No citizen with that id.');
    await this.prisma.report.create({
      data: {
        reporterId: userId,
        targetType: 'user',
        targetId: targetUserId,
        reason: (reason ?? '').trim().slice(0, 500) || null,
      },
    });
    return { reported: true as const };
  }

  private async connectionExclusions(userId: string): Promise<Set<string>> {
    const [conns, blocked] = await Promise.all([
      // unbounded: safety — connections are NEVER dating candidates; the exclusion set must be complete
      this.prisma.connection.findMany({
        where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: { in: ['ACCEPTED', 'BLOCKED'] } },
        select: { userOneId: true, userTwoId: true },
      }),
      // Blocking someone in the Social hub writes a different table, which this
      // did not read — so a blocked citizen kept turning up in Discover and
      // could still be matched with. See connections/blocking.ts.
      this.blocking.blockedWith(userId),
    ]);
    const set = new Set<string>(blocked);
    for (const c of conns) set.add(c.userOneId === userId ? c.userTwoId : c.userOneId);
    return set;
  }

  /** Best-effort precompute cache of a pair's factor scores. Stored under the
   *  SORTED pair key so there's exactly one row per pair (also the ledger that
   *  live re-matching reads to detect threshold crossings). */
  private async cacheScore(a: string, b: string, f: FactorBreakdown, overall: number) {
    const [userA, userB] = [a, b].sort();
    await swallow((this.prisma as unknown as { compatibilityScore: { upsert(a: unknown): Promise<unknown> } }).compatibilityScore
      .upsert({
        where: { userA_userB: { userA, userB } },
        update: { astrology: f.astrology, personality: f.personality, relationshipGoal: f.relationshipGoals, values: f.values, lifestyle: f.lifestyle, interest: f.interests, distance: f.location, overall },
        create: { userA, userB, astrology: f.astrology, personality: f.personality, relationshipGoal: f.relationshipGoals, values: f.values, lifestyle: f.lifestyle, interest: f.interests, distance: f.location, overall },
      }), 'dating: compatibility cache write', { userA, userB });
  }

  // ─────────────── like / pass state machine ───────────────

  /**
   * What is left of today, for this citizen, in their own timezone.
   *
   * Counted from the like TIMESTAMPS rather than a stored counter, because a
   * counter is a second source of truth that drifts the first time a write
   * half-fails, and because "reset at midnight" then becomes a job somebody has
   * to run rather than a property of the query.
   */
  async likeAllowance(userId: string) {
    const tz = await this.clock.timezoneFor(userId).catch(() => DEFAULT_TIMEZONE);
    const since = this.clock.startOfDayIn(tz);
    // unbounded: today's likes for one citizen — bounded by DAILY_LIKES itself
    const today = await this.prisma.datingMatch.findMany({
      where: {
        OR: [
          { userOneId: userId, likedAtOne: { gte: since } },
          { userTwoId: userId, likedAtTwo: { gte: since } },
        ],
      },
      select: { userOneId: true, superByOne: true, superByTwo: true },
    });
    const supers = today.filter((r) => (r.userOneId === userId ? r.superByOne : r.superByTwo)).length;
    const resetsAtLocal = `${this.clock.todayIn(tz)} · ${tz}`;
    return {
      likesUsed: today.length,
      likesLeft: Math.max(0, DAILY_LIKES - today.length),
      supersUsed: supers,
      supersLeft: Math.max(0, DAILY_SUPER_LIKES - supers),
      dailyLikes: DAILY_LIKES,
      dailySuperLikes: DAILY_SUPER_LIKES,
      resetsAtLocal,
    };
  }

  async like(userId: string, targetUserId: string, kind: MatchKind, opts: { superLike?: boolean } = {}) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;

    // Already liked → not a second like, and it must not cost a second one
    // against the allowance. Re-tapping like on a card you already liked is a
    // thing people do; charging for it would be a limit that punishes the UI.
    const alreadyLiked = meIsOne ? state.likedByOne : state.likedByTwo;
    if (!alreadyLiked) {
      const left = await this.likeAllowance(userId);
      if (left.likesLeft < 1) throw new BadRequestException(likeLimitMessage(left.resetsAtLocal));
      if (opts.superLike && left.supersLeft < 1) throw new BadRequestException(superLimitMessage(left.resetsAtLocal));
    }

    const now = new Date();
    const updated = await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: meIsOne
        ? { likedByOne: true, likedAtOne: now, ...(opts.superLike ? { superByOne: true } : {}), passedByOne: false, passedAtOne: null }
        : { likedByTwo: true, likedAtTwo: now, ...(opts.superLike ? { superByTwo: true } : {}), passedByTwo: false, passedAtTwo: null },
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
    //
    // A super-like SAYS SO to the person receiving it. That is the whole point:
    // scarcity nobody can see is not scarcity, it is a counter. It does not
    // bypass anything and it does not open a chat — it changes one sentence and
    // the order of one queue.
    void this.notifications.create({
      userId: targetUserId, actorId: userId, kind: 'dating_like',
      title: opts.superLike
        ? (kind === 'romantic' ? 'Someone super-liked you ⭐' : 'Someone really wants to connect ⭐')
        : (kind === 'romantic' ? 'You have a new like 💛' : 'Someone wants to connect'),
      body: opts.superLike
        ? 'They get one of these a day, and they used it on you — see who in your matches.'
        : 'A member likes your profile — see who in your matches.',
      href: '/dating/matches',
    });
    return { matched: false, conversationId: null, chatLocked: false, matchId: updated.id, superLike: !!opts.superLike };
  }

  /**
   * Give back the last pass. (M2 — the one people actually ask for.)
   *
   * ONLY A PASS THIS CODE RECORDED, and only the most recent one. Three things
   * fall out of that, all deliberate:
   *
   *  · A pass from before the timestamps existed has a NULL passedAt and is
   *    left alone. Offering back "your last pass" and producing a stranger from
   *    March would be worse than offering nothing.
   *  · unmatch() sets both passed flags and NO timestamp, so an unmatch can
   *    never be undone by this. Ending a conversation is a decision with
   *    somebody else in it; a swipe is not.
   *  · The row goes back to what it was, which is `matched` if they had liked
   *    you and `pending` otherwise — not blanket `pending`, which would quietly
   *    throw away their like.
   */
  async undoLastPass(userId: string, kind: MatchKind) {
    // ONE QUERY PER SIDE, then compared here.
    //
    // A single findMany with orderBy [{passedAtOne:'desc'},{passedAtTwo:'desc'}]
    // looks like it means "the latest pass" and does not: it sorts by
    // passedAtOne FIRST, so a citizen who is userTwo in their most recent pair
    // and userOne in an older one gets the older one handed back. The two
    // columns are one logical field split across the pair row, and SQL will not
    // reassemble it for us. Two indexed single-row reads, max() in JS.
    const select = {
      id: true, userOneId: true, userTwoId: true,
      passedAtOne: true, passedAtTwo: true,
      likedByOne: true, likedByTwo: true,
    };
    const [asOne, asTwo] = await Promise.all([
      this.prisma.datingMatch.findFirst({
        where: { kind, userOneId: userId, passedByOne: true, passedAtOne: { not: null } },
        orderBy: { passedAtOne: 'desc' }, select,
      }),
      this.prisma.datingMatch.findFirst({
        where: { kind, userTwoId: userId, passedByTwo: true, passedAtTwo: { not: null } },
        orderBy: { passedAtTwo: 'desc' }, select,
      }),
    ]);
    const at = (r: typeof asOne) =>
      !r ? 0 : (r.userOneId === userId ? r.passedAtOne : r.passedAtTwo)?.getTime() ?? 0;
    const row = at(asOne) >= at(asTwo) ? asOne : asTwo;
    if (!row) {
      return { undone: false as const, reason: 'There is no pass to undo — nothing you have passed on was recorded with a time.' };
    }
    const meIsOne = row.userOneId === userId;
    const passedAt = meIsOne ? row.passedAtOne : row.passedAtTwo;
    if (!passedAt) {
      return { undone: false as const, reason: 'There is no pass to undo — nothing you have passed on was recorded with a time.' };
    }

    const theyLiked = meIsOne ? row.likedByTwo : row.likedByOne;
    const iLiked = meIsOne ? row.likedByOne : row.likedByTwo;
    await this.prisma.datingMatch.update({
      where: { id: row.id },
      data: {
        ...(meIsOne ? { passedByOne: false, passedAtOne: null } : { passedByTwo: false, passedAtTwo: null }),
        status: iLiked && theyLiked ? 'matched' : 'pending',
      },
    });
    return {
      undone: true as const,
      targetUserId: meIsOne ? row.userTwoId : row.userOneId,
      theyLiked,
    };
  }

  /**
   * Connect to Chat (intentional dating). Opens an ANONYMOUS dating-hub chat with
   * a match — names hidden until both reveal. The chat lives only in the Dating
   * Hub (never the main Chats). Rules:
   *  • One person at a time — you must unmatch your current chat first.
   *  • First 3 connections are free; after that ₹199 via the Financial hub.
   *  • No People connection is created (dating chats stay private to the hub).
   */
  async connect(userId: string, targetUserId: string, kind: MatchKind, method?: 'wallet' | 'card') {
    const state = await this.upsertState(userId, targetUserId, kind);
    if (state.status !== 'matched') throw new NotFoundException('No active match to connect to.');
    if (state.conversationId) return { conversationId: state.conversationId, alreadyOpen: true, chargedInr: 0 };

    // Intentional dating: a few conversations, not one, and not endless.
    //
    // This was exactly one. Matching with somebody you could not talk to until
    // you unmatched somebody else made the second match a punishment for the
    // first, and the hub's whole job is to produce matches.
    //
    // THREE, and the number is not arbitrary. It is the same three as the free
    // connections, so the two limits a citizen meets in this hub are one number
    // rather than two — and it is small enough that "intentional" still means
    // something. Endless is the thing this product is defined against.
    // findMany + length rather than count(): this path decides whether somebody
    // is allowed to open a conversation, so it must not depend on a delegate
    // method the rest of this service never uses.
    // unbounded: their matches — the product caps how many can exist
    const others = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: 'matched', conversationId: { not: null }, id: { not: state.id } },
      select: { id: true },
    });
    const openCount = others.length;
    if (openCount >= DATING_CHAT_CAP) {
      throw new BadRequestException(
        `You have ${openCount} conversations open, which is as many as this hub allows at once. Unmatch one to start another — the match itself stays until you do.`,
      );
    }

    // First 3 connections free, then the rate-card price.
    const mine = await this.prisma.datingProfile.findUnique({ where: { userId } });
    const count = (mine as { connectCount?: number } | null)?.connectCount ?? 0;
    // Anonymous conversation (trust level 1 → the other person is a pseudonym).
    // Opened before the charge: getOrCreateDirectByIds isn't transaction-aware,
    // and an unused anonymous chat is a far smaller problem than taking ₹199 and
    // not opening one.
    const conversationId = await this.conversations.getOrCreateDirectByIds(userId, targetUserId, 1);

    let chargedInr = 0;
    if (count >= 3) {
      const amountInr = this.financial.rate('datingChatUnlock');
      // Charge, link the match to the chat, and bump the connect count together —
      // the count is what decides whether the NEXT connect is free, so a charge
      // that landed without it would quietly give away a paid unlock.
      await this.financial.paid(
        userId,
        { hub: 'Dating', category: 'dating', label: 'Connect to chat — new match', amountInr, method },
        async (tx) => {
          await tx.datingMatch.update({ where: { id: state.id }, data: { conversationId } });
          await tx.datingProfile.update({ where: { userId }, data: { connectCount: count + 1 } });
        },
      );
      chargedInr = amountInr;
    } else {
      await this.prisma.datingMatch.update({ where: { id: state.id }, data: { conversationId } });
      // The connect quota. A failed increment is a free connect, silently.
      await swallow(this.prisma.datingProfile.update({ where: { userId }, data: { connectCount: count + 1 } }), 'dating: connect-count increment', { userId });
    }

    void this.notifications.create({
      userId: targetUserId, actorId: userId, kind: 'dating_match',
      title: 'Someone connected to chat 💬', body: 'You have a new anonymous chat in the Dating Hub.', href: '/dating/chats',
    });
    return { conversationId, alreadyOpen: false, chargedInr };
  }

  /** Backward-compatible alias for the old paid "unlock chat" route. */
  async unlockChat(userId: string, targetUserId: string, kind: MatchKind, method?: 'wallet' | 'card') {
    return this.connect(userId, targetUserId, kind, method);
  }

  /** Admin-only Dating Hub stats — registered profiles, the live matching pool,
   *  moderation queue, gender split, and chat activity. Gated to MODERATION_ADMINS. */
  async adminStats(userId?: string) {
    // Resolved from User.role, not from the caller's handle: a handle is
    // renameable by its owner, so it was never an authorisation fact.
    await this.admin.assertAdmin(userId, 'Admin access required.');
    const dp = this.prisma.datingProfile;
    const dm = this.prisma.datingMatch;
    const [
      totalProfiles, approvedVisible, pendingReview, rejected, pausedHidden,
      male, female, nonbinary, connectedMembers, activeChats, totalMatches, mutualLikes,
    ] = await Promise.all([
      dp.count(),
      dp.count({ where: { visible: true, moderation: 'approved' } }),
      dp.count({ where: { moderation: { in: ['pending', 'review'] } } }),
      dp.count({ where: { moderation: 'rejected' } }),
      dp.count({ where: { visible: false } }),
      dp.count({ where: { gender: 'male' } }),
      dp.count({ where: { gender: 'female' } }),
      dp.count({ where: { gender: 'nonbinary' } }),
      dp.count({ where: { connectCount: { gt: 0 } } }),
      dm.count({ where: { status: 'matched', conversationId: { not: null } } }),
      dm.count({ where: { status: 'matched' } }),
      dm.count({ where: { status: 'matched' } }),
    ]);
    return {
      totalProfiles,
      approvedVisible,
      pendingReview,
      rejected,
      pausedHidden,
      gender: { male, female, nonbinary },
      connectedMembers,   // members who have connected to at least one chat
      activeChats,        // open anonymous dating conversations right now
      totalMatches,       // mutual matches ever formed
      mutualLikes,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Unmatch — end the dating chat and free the "one at a time" slot for both
   *  people. Keeps the conversation id on record so it stays hidden from the main
   *  Chats list, but archives it so it leaves the Dating Hub chat list too. */
  async unmatch(userId: string, targetUserId: string, kind: MatchKind) {
    const [userOneId, userTwoId] = [userId, targetUserId].sort();
    const state = await this.prisma.datingMatch.findFirst({
      where: { OR: [{ userOneId, userTwoId }], kind },
    });
    if (!state) return { ok: true as const };
    if (state.conversationId) await swallow(this.conversations.archiveForAll(state.conversationId), 'dating unmatch: archive conversation', { userId });
    await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: { status: 'passed', passedByOne: true, passedByTwo: true, revealByOne: false, revealByTwo: false },
    });
    return { ok: true as const };
  }

  /** Reveal identities in a dating chat — mutual: names show only once BOTH agree. */
  /**
   * Choose which name you chat under: your real one, or your pseudonym.
   *
   * The flag is YOURS and governs only how YOU appear. It used to take both
   * flags to change anything — one person revealing showed nobody anything and
   * merely sent a "reveal back" nudge — which meant a citizen could not simply
   * decide to be themselves. Now setting it shows your name to your match
   * straight away, and seeing THEIR name still depends entirely on their own
   * choice. You can present yourself; you can never unmask anyone else.
   *
   * Reversible: switching back to the pseudonym hides your name and photo from
   * here on. It cannot un-see what they have already read, and the caller says
   * so before letting anyone flip it.
   */
  async reveal(userId: string, targetUserId: string, kind: MatchKind, show = true) {
    const [userOneId, userTwoId] = [userId, targetUserId].sort();
    const state = await this.prisma.datingMatch.findFirst({ where: { OR: [{ userOneId, userTwoId }], kind } });
    if (!state || !state.conversationId) throw new NotFoundException('No active chat to reveal.');
    const meIsOne = state.userOneId === userId;
    const updated = await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: (meIsOne ? { revealByOne: show } : { revealByTwo: show }),
    });
    const flags = updated as { revealByOne?: boolean; revealByTwo?: boolean };
    const both = Boolean(flags.revealByOne && flags.revealByTwo);
    // anonymousTrust drops only when NEITHER side is hidden any more — it marks
    // the conversation as no longer anonymous at all.
    await this.conversations.setAnonymousTrust(state.conversationId, both ? null : 1);
    if (show && !both) {
      void this.notifications.create({
        userId: targetUserId, actorId: userId, kind: 'dating_like',
        title: 'Your match shared their name 👀',
        body: 'They’re chatting as themselves now. Share yours back whenever you’re ready.',
        href: '/dating/chats',
      });
    }
    return { revealed: both, myReveal: show };
  }

  /** The user's active Dating Hub chats — anonymous match conversations, masked
   *  until both reveal, with last-message + unread + compatibility. */
  async datingChats(userId: string) {
    // Every mutual match, INCLUDING the ones with no conversation yet.
    //
    // This used to require `conversationId: { not: null }`. But a mutual like
    // does not open a chat — Connect to Chat does, separately — so a citizen who
    // had just matched came to this page and was told "No dating chats yet",
    // with their match nowhere on it. The one screen named after their matches
    // was the one screen that denied having any.
    // unbounded: their matches — the product caps how many can exist
    const matches = await this.prisma.datingMatch.findMany({
      where: { OR: [{ userOneId: userId }, { userTwoId: userId }], status: 'matched' },
      orderBy: { updatedAt: 'desc' },
    });
    const out = [];
    for (const m of matches) {
      const otherId = m.userOneId === userId ? m.userTwoId : m.userOneId;
      const meIsOne = m.userOneId === userId;
      const r = m as { revealByOne?: boolean; revealByTwo?: boolean };
      const myReveal = Boolean(meIsOne ? r.revealByOne : r.revealByTwo);
      const otherReveal = Boolean(meIsOne ? r.revealByTwo : r.revealByOne);
      const revealed = Boolean(r.revealByOne && r.revealByTwo);

      // No conversation yet → nothing to summarise. Sorted by when the match
      // happened so a fresh match still lands at the top of the list.
      const summary = m.conversationId
        ? await this.conversations.summaryFor(m.conversationId, userId)
        : { lastMessageAt: m.updatedAt.toISOString(), lastText: null, lastSenderId: null, unread: 0 };
      const otherProfile = await this.prisma.datingProfile.findUnique({ where: { userId: otherId } });
      const otherUser = await this.prisma.user.findUnique({ where: { id: otherId }, select: { name: true, profileImage: true } });
      const candD = this.parseDX((otherProfile as { extras?: string | null } | null)?.extras) as DXProfile & { firstName?: string; photos?: string[] };
      const score = await this.readPairScore(userId, otherId);

      out.push({
        conversationId: m.conversationId,
        /** True while the match exists but the chat has not been opened yet. */
        pending: !m.conversationId,
        otherUserId: otherId,
        // ONE identity, the profile's. The Matches page shows every visible
        // candidate's first name and photos to anyone browsing — a pseudonym
        // AFTER two people matched protected nothing, and read as the person
        // changing names between screens. Same expression the match card uses.
        name: candD.firstName || otherUser?.name || 'Member',
        photo: (candD.photos && candD.photos[0]) ?? otherUser?.profileImage ?? null,
        /** Which name YOU are chatting under, so the UI can offer the switch. */
        myIdentity: (myReveal ? 'real' : 'anonymous') as 'real' | 'anonymous',
        myNickname: nickname(userId),
        sign: otherProfile ? zodiacSign(otherProfile.birthDate).name : null,
        age: otherProfile ? this.ageOf(otherProfile.birthDate) : null,
        revealed, myReveal, otherReveal,
        score: score ?? null,
        lastMessageAt: summary.lastMessageAt,
        lastText: summary.lastText,
        lastFromMe: summary.lastSenderId === userId,
        unread: summary.unread,
      });
    }
    return out.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : -1));
  }

  async pass(userId: string, targetUserId: string, kind: MatchKind) {
    const state = await this.upsertState(userId, targetUserId, kind);
    const meIsOne = state.userOneId === userId;
    // The timestamp is what makes this undoable, and what tells a swipe-pass
    // apart from an unmatch (which sets both flags and no time).
    const now = new Date();
    await this.prisma.datingMatch.update({
      where: { id: state.id },
      data: {
        ...(meIsOne ? { passedByOne: true, passedAtOne: now } : { passedByTwo: true, passedAtTwo: now }),
        status: 'passed',
      },
    });
    return { ok: true, undoable: true };
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

  /** `tz` is the viewer's zone — see shapeCard in the property hub for why this
   *  defaults to the city's zone rather than UTC. */
  private shapeActivity(a: ActivityRow, tz: string = DEFAULT_TIMEZONE) {
    return { id: a.id, text: a.text, category: a.category, date: a.date, time: a.time, groupSize: a.groupSize, description: a.description, createdOn: this.clock.dayIn(tz, a.createdAt) };
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
    // unbounded: admin stats — a computation over the whole hub
    const cands = await this.prisma.datingProfile.findMany({ where: { userId: { not: hostId }, visible: true, moderation: 'approved' } });
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
    // unbounded: their own activities — a handful by nature
    const acts = await this.activities.findMany({ where: { hostId }, orderBy: { createdAt: 'desc' } });
    const out = [];
    for (const a of acts) {
      // unbounded: their own invites — a handful by nature
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
    // unbounded: their own invites — a handful by nature
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
      birthDate: p.birthDate.toISOString().slice(0, 10), // date-only column
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
