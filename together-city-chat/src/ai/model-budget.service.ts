import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../shared/redis/redis.service';
import { currentUserId, isPaidWork } from '../shared/request-context';

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
 * anybody — which holds by construction now that the charge sits at the
 * call site: no client, no `messages.create`, no charge.
 *
 * The ceiling is AI_DAILY_CALLS_PER_CITIZEN, default 60 — generous for a
 * person (the beauty hub's own rule is five photo analyses a WEEK) and
 * a hard stop for a script.
 *
 * ── CHARGED AT THE CALL, NOT AT THE ROUTE (launch gate, third reading,
 *    4 Sep) ────────────────────────────────────────────────────────────────
 *
 * This was spent by exactly two Beauty routes, by hand. Twenty-one other
 * routes reached the model — blood-report vision reads at the dearest
 * model in the city, Mira, the CV reader, the menu scan — with the
 * per-minute throttle and nothing else: one scripted account on
 * `POST /medical/blood-tests/ingest` at 20/min was ~28,800 Opus vision calls
 * a day. `AiService.meter()` now calls `charge()` immediately before every
 * `messages.create`, reading the citizen from the request context
 * (shared/request-context.ts). A call with no citizen behind it — a job, a
 * socket frame — is charged to the GLOBAL day only.
 *
 * THE GLOBAL DAY is AI_DAILY_CALLS_GLOBAL, default 20,000: the ceiling on
 * what the whole city can spend in a day, whoever is asking. Past it the
 * model says no to everybody until midnight UTC, and the deterministic
 * fallbacks every caller already handles take over. That is a bad day; an
 * unbounded one is a worse bill.
 *
 * ── AND NEITHER CEILING APPLIES TO WORK THAT WAS PAID FOR (owner, 4 Sep) ───
 *
 * "There should be no cap for paid services for AI." Both ceilings above
 * exist for the same reason and it is a reason about FREE work: a free call
 * is unbounded, so something has to bound it. A paid call arrives already
 * bounded twice — the citizen paid for it, and the product limits what the
 * payment bought (₹99 buys five minutes of spoken consultation, about ten
 * turns, and not an eleventh). A third bound on top of those can only ever
 * do one thing: refuse somebody who has paid, mid-sentence, for a reason
 * they will read as a fault. So `charge()` steps aside for paid work.
 *
 * IT IS STILL COUNTED, ON ITS OWN KEYS. An exemption nobody can see is how a
 * bug becomes an invoice — a retry loop inside a paid path would otherwise
 * spend without limit and without trace. Paid calls increment
 * `ai:paid:<day>:<citizen>` and `ai:paid:<day>:_global`, are never refused,
 * and cross PAID_NOTICE_DAILY into the log so an anomaly is loud before it
 * is expensive. The counter is the alarm; the payment is the cap.
 *
 * WHAT COUNTS AS PAID IS DECIDED BY THE SERVER THAT TOOK THE MONEY, in
 * `runAsPaidWork` (shared/request-context.ts) — never by anything a client
 * can send, and never by "this citizen has paid us before".
 */
@Injectable()
export class ModelBudgetService {
  private readonly logger = new Logger(ModelBudgetService.name);
  private warned = false;

  constructor(private readonly redis: RedisService) {}

  static readonly DEFAULT_DAILY = 60;
  static readonly DEFAULT_GLOBAL_DAILY = 20_000;

  get dailyCap(): number {
    const n = Number(process.env.AI_DAILY_CALLS_PER_CITIZEN);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : ModelBudgetService.DEFAULT_DAILY;
  }

  get globalDailyCap(): number {
    const n = Number(process.env.AI_DAILY_CALLS_GLOBAL);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : ModelBudgetService.DEFAULT_GLOBAL_DAILY;
  }

  /** The key for today. UTC on purpose: one clock for every replica. */
  static keyFor(userId: string, now = new Date()): string {
    return `ai:budget:${now.toISOString().slice(0, 10)}:${userId}`;
  }

  /** The whole city's day. `_global` cannot be a user id. */
  static globalKeyFor(now = new Date()): string {
    return ModelBudgetService.keyFor('_global', now);
  }

  /**
   * Paid calls are counted apart from free ones, deliberately. Mixed into one
   * counter they would push ordinary citizens into a ceiling they did not
   * spend, and the paid total — the one that says what the day actually cost —
   * would be unreadable.
   */
  static paidKeyFor(userId: string, now = new Date()): string {
    return `ai:paid:${now.toISOString().slice(0, 10)}:${userId}`;
  }

  static paidGlobalKeyFor(now = new Date()): string {
    return ModelBudgetService.paidKeyFor('_global', now);
  }

  /** One citizen's paid calls in a day past which the log says something. Not a cap. */
  static readonly PAID_NOTICE_DAILY = 200;

  /**
   * What the model call site calls. The citizen comes from the request
   * context; the global counter moves for every call regardless. Both refuse
   * with a 429 the caller must not swallow into a fallback — which is why
   * `AiService` charges OUTSIDE its try/catch.
   */
  async charge(kind: string): Promise<void> {
    if (isPaidWork()) return this.record(kind);
    const userId = currentUserId();
    if (userId) await this.spend(userId, kind);
    await this.spendGlobal(kind);
  }

  /**
   * Count a paid call. Never refuses — that is the whole point — but it does
   * leave a number behind, and it says so once when one citizen's paid day
   * gets unusual. Fail-open like everything else here: a paid call is not
   * held up because Redis is away.
   */
  private async record(kind: string): Promise<void> {
    const userId = currentUserId();
    const mine = userId ? await this.count(ModelBudgetService.paidKeyFor(userId)) : null;
    await this.count(ModelBudgetService.paidGlobalKeyFor());
    if (mine === ModelBudgetService.PAID_NOTICE_DAILY) {
      this.logger.warn(
        `model budget: ${userId} has made ${mine} PAID ${kind} calls today — not refused (paid work has no cap), `
        + 'but worth a look if this is not a person.',
      );
    }
  }

  async spendGlobal(kind: string): Promise<void> {
    const used = await this.count(ModelBudgetService.globalKeyFor());
    if (used == null) return;
    if (used > this.globalDailyCap) {
      this.logger.error(`model budget: the city's day is spent — refused a ${kind} call at ${used - 1}, cap ${this.globalDailyCap}`);
      throw new HttpException(
        'Together City has used today\'s allowance of model calls. It resets at midnight UTC.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Spend one call from today's budget, or refuse.
   *
   * Call it BEFORE the model is asked, never after: a refusal that arrives
   * after the bill is a receipt, not a cap. `kind` is for the log line only.
   */
  async spend(userId: string, kind: string): Promise<void> {
    const used = await this.count(ModelBudgetService.keyFor(userId));
    if (used == null) return;
    if (used > this.dailyCap) {
      this.logger.warn(`model budget: ${userId} refused a ${kind} call — ${used - 1} today, cap ${this.dailyCap}`);
      throw new HttpException(
        'You have used today\'s allowance of photo and document analyses. It resets at midnight UTC.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /** One increment, or null when the count cannot be kept (fail-open). */
  private async count(key: string): Promise<number | null> {
    if (!this.redis.up) { this.warnOnce(); return null; }
    try {
      const used = await this.redis.raw.incr(key);
      // Set the expiry on the first increment only, so a busy day does not
      // keep pushing its own midnight back.
      if (used === 1) await this.redis.raw.expire(key, 26 * 3600);
      return used;
    } catch (e) {
      this.warnOnce(e);
      return null;
    }
  }

  private warnOnce(e?: unknown): void {
    if (this.warned) return;
    this.warned = true;
    this.logger.warn(`model budget: Redis unavailable — the daily cap is OFF and only the per-minute throttle holds${e ? ` (${(e as Error).message})` : ''}`);
  }
}
