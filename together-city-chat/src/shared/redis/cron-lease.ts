import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { RedisService } from './redis.service';

/**
 * ── ONE INSTANCE RUNS A CRON, NOT EVERY INSTANCE (launch gate, 5 Sep) ──────
 *
 * Every `@Cron` in this API ran on every replica: Railway overlaps two
 * instances on every deploy, and a scaled service runs N. So the medicine
 * reminder that fires at 08:00 fired N times, the retention purge walked the
 * same rows N times, and the external-jobs scan cost N times the calls.
 *
 * A lease is one Redis key per job, `SET NX PX`: the first instance to ask
 * gets it for the job's window, the others read "taken" and do nothing. The
 * value is this process's id so a lease is only ever released by the process
 * that holds it. When Redis is not there the job runs — a single-instance
 * deployment without Redis is exactly the case that needs nothing — and
 * that fallback is logged once, because on two instances it is the bug this
 * file exists to stop.
 */
@Injectable()
export class CronLease {
  private readonly logger = new Logger(CronLease.name);
  private readonly nodeId = randomUUID();
  private warned = false;

  constructor(@Optional() private readonly redis?: RedisService) {}

  /**
   * Run `fn` if this process wins the lease for `job`; otherwise return
   * `skipped: true`. `ttlMs` should cover the job's longest honest run and be
   * shorter than its schedule, so a crashed holder does not block the next
   * firing forever.
   */
  async run<T>(job: string, ttlMs: number, fn: () => Promise<T>): Promise<{ skipped: boolean; result?: T }> {
    const key = `cron:lease:${job}`;
    const raw = this.redis?.up ? this.redis.raw : null;
    if (!raw) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn('Redis is not available — crons run on every instance; fine on one, duplicated on two.');
      }
      return { skipped: false, result: await fn() };
    }
    let got: unknown = null;
    try {
      got = await raw.set(key, this.nodeId, 'PX', Math.max(1_000, Math.floor(ttlMs)), 'NX');
    } catch (e) {
      this.logger.warn(`lease ${job}: Redis refused (${(e as Error).message}) — running without one`);
      return { skipped: false, result: await fn() };
    }
    if (got !== 'OK') return { skipped: true };
    try {
      return { skipped: false, result: await fn() };
    } finally {
      // Release only if still ours: a lease that expired and was taken by
      // another instance must not be deleted from under it.
      try {
        const holder = await raw.get(key);
        if (holder === this.nodeId) await raw.del(key);
      } catch { /* the TTL releases it */ }
    }
  }
}

/** The one-line form the cron services use: no lease wired (a unit test) → run. */
export async function leased(lease: CronLease | undefined, job: string, ttlMs: number, fn: () => Promise<void>): Promise<void> {
  if (!lease) { await fn(); return; }
  await lease.run(job, ttlMs, fn);
}
