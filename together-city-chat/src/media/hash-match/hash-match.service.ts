import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';
import { swallow } from '../../shared/swallow';
import {
  BypassHashMatchProvider,
  HASH_MATCH_OFF,
  HashMatchUnavailable,
  HttpHashMatchProvider,
  NoHashMatchProvider,
  type HashMatchProvider,
} from './hash-match.provider';

/**
 * ── THE HASH GATE, IN FRONT OF EVERY CLASSIFIER IN THE CITY ─────────────────
 *
 * One service, called by all three screening guards — dating profile photos
 * (`PhotoModerationService`), chat images and snaps (`ChatMediaGuard`), and
 * everything posted, listed or worn as an avatar (`PostMediaGuard`) — on the
 * bytes each of them has already read, immediately BEFORE Rekognition.
 *
 * Before Rekognition, not after, and not instead. `DetectModerationLabels` is
 * a taste-and-policy classifier; this is an identity check against a known-bad
 * list. They answer different questions and the identity question has to be
 * asked first, because its answer is not "hold this for a moderator", it is
 * "stop, preserve, report".
 *
 * On the bytes the caller already has, because every one of those three call
 * sites has just read the object in order to hand it to Rekognition. Screening
 * costs one more outbound call, not one more GET from the bucket.
 *
 * ── THREE ANSWERS, AND WHAT EACH ONE MEANS ──────────────────────────────────
 *
 *   'clear'        the matcher looked and found nothing. Carry on to
 *                  Rekognition; this service has no further opinion.
 *   'match'        stop. See `onMatch` below for everything that then happens.
 *                  The caller must refuse — and must NOT delete the object.
 *   'unavailable'  the matcher could not answer: unconfigured, down, timed
 *                  out, or talking nonsense. The caller must fail closed. It
 *                  must never be turned into 'clear'.
 *
 * ── WHAT HAPPENS ON A MATCH ─────────────────────────────────────────────────
 *
 * Four things, in this order, and the order matters.
 *
 * 1 · PRESERVE. The object is NOT deleted. Every other refusal in this
 *     codebase deletes the file it refused — `PostMediaGuard.refuse`,
 *     `ChatMediaGuard.refuse`, `refuseSnap`, and `decide('rejected')` in the
 *     dating pipeline all do, correctly, because for ordinary bad content the
 *     right thing is for it to stop existing. Here it is the opposite: the
 *     material is evidence in a criminal matter and destroying it destroys the
 *     report with it. The callers were changed to return a refusal WITHOUT
 *     their delete step on this one verdict.
 *
 * 2 · RECORD. A `CsamHit` row: who, which surface, which key in which bucket,
 *     the digest, what the matcher said it matched, and when. `reportedAt` and
 *     `reportRef` are null until a person files it. That table is the report
 *     queue, and its unreported rows are the backlog.
 *
 * 3 · SUSPEND. `User.suspendedAt` is written immediately. A known-hash match
 *     is not a judgement call with a false-positive rate worth waiting on, and
 *     every read path in the city already refuses a suspended account —
 *     `REACHABLE_ACCOUNT`, `jwt.strategy`, `token.service`. The account stops
 *     within one request rather than within one moderator shift.
 *
 * 4 · ALARM. `logger.error`, which is what reaches Sentry and the /dev tally.
 *     Deliberately not a moderator notification row: `tellModerators` writes
 *     in-app notifications to at most fifty grant-holders, and its own docblock
 *     admits that is a queue nobody is watching. This one needs to page.
 *
 * NOT DONE HERE, AND SAID PLAINLY: nothing files the NCMEC / national-hotline
 * report. That submission is an account-holder obligation with its own
 * credentials and its own legal review; the row and the preserved object are
 * what a person needs to file it, and `reportedAt` is where they record that
 * they did. Until that is wired, the operator must watch this table.
 *
 * ── THE CACHE ───────────────────────────────────────────────────────────────
 *
 * Keyed on the sha256 of the bytes, in Redis, and it stores CLEAR verdicts
 * only. A match is never cached: the four steps above have to run every time
 * those bytes appear, on every surface, for every account that sends them.
 * Caching the clears is what keeps the same avatar re-screened on every post
 * from being a fresh call to a paid matcher.
 *
 * With Redis down the cache is skipped and every image is checked. That is
 * slower and more expensive and it is still correct, which is the right way
 * round.
 */
export type HashResult = 'clear' | 'match' | 'unavailable';

/** Where the bytes were going when they were caught. For the record and the report. */
export type HashSurface = 'dating-photo' | 'chat-image' | 'chat-snap' | 'post-media' | 'inline-image';

export interface HashContext {
  userId: string;
  surface: HashSurface;
  /** The storage key, when there is an object. Inline data URLs have none. */
  storageKey?: string | null;
  /** Which bucket the key is in, so a person can find it: 'public' | 'private'. */
  bucket?: 'public' | 'private' | null;
}

/** Clear verdicts live this long. Long, because a digest's answer cannot change. */
const CLEAR_TTL_SEC = 30 * 24 * 60 * 60;

@Injectable()
export class HashMatchService {
  private readonly logger = new Logger(HashMatchService.name);
  private readonly provider: HashMatchProvider;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Optional() private readonly redis?: RedisService,
  ) {
    const url = (config.get<string>('csamMatch.url') ?? '').trim();
    const token = (config.get<string>('csamMatch.token') ?? '').trim();
    const timeoutMs = config.get<number>('csamMatch.timeoutMs') ?? 8_000;
    this.provider = url.toLowerCase() === HASH_MATCH_OFF
      ? new BypassHashMatchProvider()
      : url ? new HttpHashMatchProvider(url, token, timeoutMs) : new NoHashMatchProvider();
    if (this.provider.name === 'bypass') {
      // Error level on purpose: this line should be the loudest thing in a
      // boot log until a matcher is signed.
      this.logger.error(
        'CSAM_MATCH_URL=off — the known-bad hash gate is BYPASSED. Every image is waved through it '
        + '(Rekognition still screens each one). Replace "off" with a matcher URL as soon as one is signed.',
      );
    }
    if (!this.provider.ready) {
      // Said once, at boot, in the words of what is lost. assertProductionConfig
      // says it again on the problems list; this one is here so it appears in
      // the log of the process that will be refusing the photographs.
      this.logger.warn(
        'No CSAM hash matcher is configured (CSAM_MATCH_URL) — the gate fails CLOSED, so no photograph '
        + 'can be posted, sent or approved anywhere in the city until it is set.',
      );
    }
  }

  /** For the diagnostics page: which matcher, and whether it can answer. */
  get status(): { name: string; ready: boolean } {
    return { name: this.provider.name, ready: this.provider.ready };
  }

  /**
   * Check bytes. Never throws — the failure IS one of the three answers, so a
   * caller cannot accidentally catch an outage into a pass.
   */
  async check(bytes: Buffer, contentType: string, ctx: HashContext): Promise<HashResult> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    /* A BYPASS EARNS NO MEMORY. A "clear" remembered for thirty days is a
       hash a real matcher would then never be asked about; the bypass answers
       clear without looking, so it writes nothing and reads nothing. */
    if (this.provider.name === 'bypass') return 'clear';
    if (await this.cachedClear(sha256)) return 'clear';

    let verdict;
    try {
      verdict = await this.provider.check(bytes, contentType, sha256);
    } catch (e) {
      if (!(e instanceof HashMatchUnavailable)) {
        // A provider that threw something else is still a provider that did not
        // answer. Same verdict, louder log.
        this.logger.error(`hash matcher threw: ${(e as Error).message}`);
      }
      return 'unavailable';
    }

    if (!verdict.match) {
      await this.rememberClear(sha256);
      return 'clear';
    }
    await this.onMatch(sha256, verdict.source, ctx);
    return 'match';
  }

  /** Preserve, record, suspend, alarm. See the docblock. */
  private async onMatch(sha256: string, source: string, ctx: HashContext): Promise<void> {
    // The alarm first, because it is the step that cannot fail on a database
    // that has just gone away.
    this.logger.error(
      `CSAM HASH MATCH — citizen ${ctx.userId}, surface ${ctx.surface}, key ${ctx.storageKey ?? '(inline)'}, `
      + `list ${source}, sha256 ${sha256}. Object PRESERVED. Account suspended. File the report.`,
    );
    await swallow(this.hits.create({
      data: {
        userId: ctx.userId,
        surface: ctx.surface,
        storageKey: ctx.storageKey ?? null,
        bucket: ctx.bucket ?? null,
        sha256,
        source,
      },
    }), 'csam: hit recorded', { userId: ctx.userId });
    await swallow(this.prisma.user.update({
      where: { id: ctx.userId },
      data: { suspendedAt: new Date(), suspendedReason: 'Suspended automatically: content matched a known-bad hash list.' },
    }), 'csam: account suspended', { userId: ctx.userId });
  }

  /**
   * THE TABLE THIS CHECKOUT'S GENERATED CLIENT HAS NOT SEEN.
   *
   * `CsamHit` is in schema.prisma and in
   * 20260906T180000_a_hash_gate_in_front_of_the_city; the client in this
   * working tree predates both, because `prisma generate` has to reach
   * binaries.prisma.sh and this machine could not. Every deployment
   * regenerates before it builds, so the types are right where it matters and
   * wrong only here — the same escape hatch, kept to one accessor, that
   * photo-moderation.service.ts uses for `etag`.
   *
   * DELETE IT after any `npx prisma generate`: put `this.prisma.csamHit` back
   * at its one call site and this comment with it.
   */
  private get hits() {
    return (this.prisma as unknown as {
      csamHit: { create(a: { data: Record<string, unknown> }): Promise<unknown> };
    }).csamHit;
  }

  private async cachedClear(sha256: string): Promise<boolean> {
    if (!this.redis?.up) return false;
    try {
      return (await this.redis.raw.get(`csam:clear:${sha256}`)) === '1';
    } catch {
      return false;
    }
  }

  private async rememberClear(sha256: string): Promise<void> {
    if (!this.redis?.up) return;
    try {
      await this.redis.raw.set(`csam:clear:${sha256}`, '1', 'EX', CLEAR_TTL_SEC);
    } catch {
      // A cache that could not be written is a cache miss next time. Nothing else.
    }
  }
}
