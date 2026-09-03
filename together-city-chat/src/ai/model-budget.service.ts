import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../shared/redis/redis.service';
import { AiService } from './ai.service';

/**
 * ── A DAILY CEILING ON WHAT ONE CITIZEN CAN SPEND ON THE MODEL ───────────────
 *
 * Every model route carries `@Throttle(MODEL_LIMIT)` — twenty a minute — and
 * `a-model-call-costs-money.spec.ts` fails the build if one does not. A
 * minute is the wrong unit for the bill, though: twenty a minute, all day,
 * is 28,800 vision calls from one account, and the throttle would call that
 * within limits. This is the other unit. One counter per citizen per UTC
 * day, in Redis, and a 429 past the ceiling.
 *
 * FAIL-OPEN, AND SAID SO. When Redis is away the count cannot be kept, and
 * the choice is between refusing every citizen their photo analysis and
 * letting the per-minute throttle carry the day alone. The throttle stays;
 * this steps aside and logs once. That is the same posture the rate limiter
 * takes for the same reason (throttler-redis.storage.ts).
 *
 * NOT CHARGED WHEN THE MODEL IS OFF. A deployment with no key answers from
 * deterministic fallbacks; those cost nothing and should not count against
 * anybody.
 *
 * The ceiling is AI_DAILY_CALLS_PER_CITIZEN, default 60 — generous for a
 * person (the beauty hub's own rule is five photo analyses a WEEK) and
 * a hard stop for a script.
 */
@Injectable()
export class ModelBudgetService {
  private readonly logger = new Logger(ModelBudgetService.name);
  private warned = false;

  constructor(
    private readonly redis: RedisService,
    private readonly ai: AiService,
  ) {}

  static readonly DEFAULT_DAILY = 60;

  get dailyCap(): number {
    const n = Number(process.env.AI_DAILY_CALLS_PER_CITIZEN);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : ModelBudgetService.DEFAULT_DAILY;
  }

  /** The key for today. UTC on purpose: one clock for every replica. */
  static keyFor(userId: string, now = new Date()): string {
    return `ai:budget:${now.toISOString().slice(0, 10)}:${userId}`;
  }

  /**
   * Spend one call from today's budget, or refuse.
   *
   * Call it BEFORE the model is asked, never after: a refusal that arrives
   * after the bill is a receipt, not a cap. `kind` is for the log line only.
   */
  async spend(userId: string, kind: string): Promise<void> {
    if (!this.ai.enabled) return;
    if (!this.redis.up) { this.warnOnce(); return; }
    const key = ModelBudgetService.keyFor(userId);
    let used: number;
    try {
      used = await this.redis.raw.incr(key);
      // Set the expiry on the first increment only, so a busy day does not
      // keep pushing its own midnight back.
      if (used === 1) await this.redis.raw.expire(key, 26 * 3600);
    } catch (e) {
      this.warnOnce(e);
      return;
    }
    if (used > this.dailyCap) {
      this.logger.warn(`model budget: ${userId} refused a ${kind} call — ${used - 1} today, cap ${this.dailyCap}`);
      throw new HttpException(
        'You have used today\'s allowance of photo and document analyses. It resets at midnight UTC.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private warnOnce(e?: unknown): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(`model budget: Redis unavailable — the daily cap is OFF and only the per-minute throttle holds${e ? ` (${(e as Error).message})` : ''}`);
  }
}
