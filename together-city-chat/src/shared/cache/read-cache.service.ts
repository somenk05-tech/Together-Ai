import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { envInt } from '../env-int';
import { swallowed } from '../swallow';

/**
 * ── A READ CACHE THAT CANNOT BREAK A READ ───────────────────────────────────
 *
 * The 30 Aug audit's finding was blunt: "there is no caching anywhere". Every
 * feed page re-read the viewer's whole follow graph, every heart tap re-read
 * it again, and nothing between two identical requests one second apart was
 * remembered. At a few hundred citizens that is a waste; at a million it is
 * the difference between a database and a bonfire.
 *
 * THE ONE RULE THIS FILE EXISTS TO ENFORCE: a cache is an optimisation, and an
 * optimisation may not become a dependency. Every method here fails open. If
 * Redis is down, slow, or returns something that does not parse, the caller
 * gets the real value from the real source and never knows. A cache that can
 * take the site down when it fails is a second database with none of the
 * guarantees — and this deployment already has a Redis that carries presence,
 * rate limits and socket fan-out, so the failure mode was worth being explicit
 * about rather than discovering.
 *
 * WHAT MAY GO IN HERE, AND WHAT MAY NOT.
 *
 *   · May: things that are expensive to derive, read far more often than they
 *     change, and harmless to be a few seconds stale — the follow graph, a
 *     signed URL that already carries its own expiry.
 *
 *   · MAY NOT: anything a permission decision is made from where staleness
 *     widens an audience. The block set is the example, and it is the reason
 *     `graph` below is cached for thirty seconds rather than thirty minutes:
 *     a citizen who blocks somebody must stop seeing them promptly, so the
 *     block half of the graph is dropped explicitly at the moment of blocking
 *     rather than left to expire. Never cache an authorisation answer; cache
 *     the facts it is computed from, and drop them when they change.
 *
 * KEYS CARRY A VERSION. `v1:` below is bumped when the SHAPE of a cached value
 * changes, because a deploy does not empty Redis and the old shape will still
 * be sitting there answering questions in the new code's voice.
 */

/* v2 (31 Aug): the cached social graph gained `modulesJson`, because the feed's
   friends circle now asks the same question `visibleAudiences` does. A v1 entry
   read by v2 code has no modulesJson, and `parseModules(undefined)` falls back
   to the DEFAULT grant — so a stale entry would fail OPEN for thirty seconds
   after every deploy, on the exact rule being tightened. The version is what
   makes that impossible rather than merely unlikely. */
const NS = 'rc:v2:';

@Injectable()
export class ReadCache {
  private readonly logger = new Logger(ReadCache.name);
  /** Logged once per outage rather than once per miss. */
  private complained = false;

  constructor(private readonly redis: RedisService) {}

  /** Seconds. 0 anywhere disables that cache entirely — see SOCIAL_CACHE_TTL_S. */
  static ttlFromEnv(name: string, fallback: number): number {
    // One reader of the environment, in shared/env-int.ts. This was the third
    // copy of the same six lines and the only one of the three that had no
    // bug; the copy in SocialService did. See that file.
    return envInt(name, fallback, 0, 86_400);
  }

  private note(where: string, e: unknown): void {
    if (this.complained) return;
    this.complained = true;
    this.logger.warn(`read cache unavailable (${where}: ${e instanceof Error ? e.message : String(e)}) — reads go to Postgres until it returns`);
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (!this.redis.up) return undefined;
    try {
      const raw = await this.redis.raw.get(NS + key);
      if (raw === null) return undefined;
      return JSON.parse(raw) as T;
    } catch (e) {
      // Includes a JSON.parse failure on a value written by an older shape.
      // Treating that as a miss is the whole reason the namespace is versioned.
      this.note('get', e);
      return undefined;
    }
  }

  async set(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.redis.up || ttlSec <= 0) return;
    try {
      await this.redis.raw.set(NS + key, JSON.stringify(value), 'EX', ttlSec);
    } catch (e) {
      this.note('set', e);
    }
  }

  /** Forget these keys now. Used where a write makes a cached fact wrong. */
  async drop(...keys: string[]): Promise<void> {
    if (!this.redis.up || !keys.length) return;
    try {
      await this.redis.raw.del(...keys.map((k) => NS + k));
    } catch (e) {
      this.note('drop', e);
    }
  }

  /**
   * Read through: the value from cache, or `produce()` and remember it.
   *
   * `produce` runs OUTSIDE the try, deliberately. A failure in the underlying
   * read is the caller's business and must propagate with its own type and
   * message; only the caching around it is swallowed. Wrapping both would turn
   * "the database refused this query" into "cache miss", which is how a real
   * fault becomes an empty feed.
   */
  /**
   * ── THE SOCIAL GRAPH KEYS, NAMED IN ONE PLACE ───────────────────────────
   *
   * `graph:<id>` and `blocked:<id>` were spelled out in SocialService and in
   * BlockingService, and ConnectionsService — which changes the graph every
   * time somebody accepts a request or unticks a hub — did not spell them at
   * all. So accepting a connection left both citizens' cached graphs stale for
   * the TTL, and after the 31 Aug change that made the feed's circle depend on
   * `modulesJson`, unticking Social took effect up to thirty seconds late. A
   * stale grant fails OPEN, which is the direction that matters.
   *
   * Three callers, three copies of a key format, and the one that was missing
   * was missing precisely because nothing named it. The cache owns its own
   * namespace now.
   */
  dropGraph(...userIds: Array<string | null | undefined>): void {
    const ids = userIds.filter((v): v is string => Boolean(v));
    if (!ids.length) return;
    // A drop that fails leaves a stale entry for at most the TTL, so it is
    // best-effort — but named, because "the block list did not clear" is worth
    // finding in a log.
    void this.drop(...ids.flatMap((id) => [`graph:${id}`, `blocked:${id}`]))
      .catch(swallowed('cache.dropGraph', undefined, { ids: ids.length }));
  }

  async wrap<T>(key: string, ttlSec: number, produce: () => Promise<T>): Promise<T> {
    if (ttlSec > 0) {
      const hit = await this.get<T>(key);
      if (hit !== undefined) return hit;
    }
    const value = await produce();
    await this.set(key, value, ttlSec);
    return value;
  }
}
