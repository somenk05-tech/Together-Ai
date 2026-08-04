import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
// Not re-exported from the package root in v5 — reached at its own path, which
// is where the interface actually lives.
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { RedisService } from './redis.service';

/**
 * RATE LIMITING THAT SURVIVES A SECOND INSTANCE.
 *
 * @nestjs/throttler's default storage is a plain object in the process. Two
 * things follow from that, and both were true in production:
 *
 *   · the limit is PER INSTANCE. Render runs more than one when it scales, and
 *     every extra instance multiplies the real limit. A "120 requests a minute"
 *     rule on three instances is 360, and the number nobody set is the one the
 *     login endpoint is actually protected by;
 *   · it is lost on every deploy and every restart. A password-spraying run
 *     gets a fresh allowance each time the API restarts, which on a starter
 *     plan is often.
 *
 * Redis is already here for presence and the socket adapter, so the counter
 * moves there — one bucket per key across every instance, and it outlives the
 * process. INCR then PEXPIRE is atomic enough for this: the worst interleaving
 * costs one extra request in a window, which is not what the limit is for.
 *
 * DEGRADATION IS DELIBERATE AND IT FAILS SOFT. If Redis is unreachable the
 * counter falls back to the in-memory storage rather than throwing. A throttler
 * that 500s when its store is down turns a cache outage into a total outage,
 * and the fallback is exactly the behaviour the application had before this
 * class existed — worse than Redis, no worse than yesterday.
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  /** The old behaviour, kept as the safety net rather than reimplemented. */
  private readonly memory = new ThrottlerStorageService();
  private warned = false;

  constructor(private readonly redis: RedisService) {}

  /**
   * The in-memory fallback arms a setTimeout per hit to decay the counter, and
   * the default storage clears them on shutdown. Delegating keeps that promise:
   * without it a shutdown hangs on live timers, which is also how this first
   * showed up — as a jest worker that would not exit.
   */
  onApplicationShutdown(): void {
    this.memory.onApplicationShutdown();
  }

  /**
   * `ttl` arrives in MILLISECONDS; `timeToExpire` is returned in SECONDS —
   * it becomes the Retry-After header. That asymmetry is the library's, checked
   * against ThrottlerStorageService rather than assumed.
   */
  async increment(key: string, ttl: number): Promise<ThrottlerStorageRecord> {
    if (!this.redis.up) return this.memory.increment(key, ttl);
    const k = `throttle:${key}`;
    try {
      const res = await this.redis.raw.multi().incr(k).pttl(k).exec();
      if (!res) return this.memory.increment(key, ttl);
      const totalHits = Number(res[0]?.[1] ?? 0);
      const pttl = Number(res[1]?.[1] ?? -1);
      // -1 is "no expiry set" and -2 "no such key"; INCR just created it, so the
      // only real case is -1 on the first hit of a window. Setting the TTL only
      // then is what makes this a FIXED window rather than a sliding one that
      // never expires under sustained traffic — the same shape as the in-memory
      // implementation, which stamps expiresAt once and lets hits accumulate.
      if (pttl < 0) {
        await this.redis.raw.pexpire(k, ttl);
        return { totalHits, timeToExpire: Math.ceil(ttl / 1000) };
      }
      return { totalHits, timeToExpire: Math.ceil(pttl / 1000) };
    } catch (e) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `Rate-limit counter fell back to in-process memory (${(e as Error).message}). `
          + 'Limits are per-instance until Redis returns.',
        );
      }
      return this.memory.increment(key, ttl);
    }
  }
}
