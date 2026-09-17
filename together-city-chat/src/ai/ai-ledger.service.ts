import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { currentUserId, isPaidWork } from '../shared/request-context';

/** What the provider told us the call cost, in tokens. */
export interface CallUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/** How a provider call failed, in one word — never the provider's message. */
export function errorKind(e: unknown): string {
  const status = typeof e === 'object' && e !== null && 'status' in e ? Number((e as { status?: unknown }).status) : NaN;
  const name = e instanceof Error ? e.name : '';
  const msg = e instanceof Error ? e.message.toLowerCase() : '';
  if (/timeout/i.test(name) || msg.includes('timed out') || msg.includes('timeout')) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 529 || msg.includes('overloaded')) return 'overloaded';
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'auth';
  if (status >= 500) return 'server';
  return 'other';
}

/**
 * ── THE BILL, ONE LINE PER CALL (owner, 9 Sep) ──────────────────────────────
 *
 * "Add money spend and API cost per user data with each user id."
 *
 * ModelBudgetService already counts calls per citizen per day — in Redis, for a
 * ceiling, thrown away at midnight. That is the right shape for a ceiling and
 * the wrong one for a bill: it cannot answer "what has this account cost us
 * since March", which is the question ranking citizens by cost is asking.
 *
 * So every provider call also writes a row here: who it was for, which model,
 * how many tokens each way. Rupees are NOT stored — a rate can be renegotiated,
 * and a stored figure would then be wrong in a way nothing could recompute. The
 * page multiplies at read time, from the one rate table an operator sets.
 *
 * ── IT MAY NEVER COST A CITIZEN THEIR ANSWER ────────────────────────────────
 *
 * A model call that succeeded and a ledger row that did not is a slightly wrong
 * bill. A model call held up, or failed, because the ledger was slow is a
 * feature broken by its own accounting. So this is fire-and-forget and
 * swallowed: nothing awaits it, and a database that refuses costs us a line in
 * a table rather than a citizen their meal plan.
 *
 * ── AND IT NEVER HOLDS A QUESTION ───────────────────────────────────────────
 *
 * No prompt, no completion, no citizen text of any kind — an id, a model name,
 * four token counts, how long it took and, for a failure, one word for how. Mira's own ask log went to great lengths not to store what
 * people asked; a bill is a worse reason than hers to start.
 */
@Injectable()
export class AiLedgerService {
  private readonly logger = new Logger('AiLedger');
  private warned = false;

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Record one provider call. Takes the citizen from the request context, the
   * same place the budget takes it from, so a job or a socket frame is recorded
   * against the city and against no account.
   */
  record(model: string, kind: string, usage: CallUsage | null | undefined, ms: number | null = null): void {
    this.write({ model, kind, usage, ms, error: null });
  }

  /**
   * Record one provider call that FAILED (owner, 16 Sep: AI failures and
   * response time on the investor dashboard). No tokens were billed that we
   * can see; the row says which model, how long and one word for how.
   */
  fail(model: string, kind: string, e: unknown, ms: number | null = null): void {
    this.write({ model, kind, usage: null, ms, error: errorKind(e) });
  }

  private write(c: { model: string; kind: string; usage: CallUsage | null | undefined; ms: number | null; error: string | null }): void {
    if (!this.prisma) return;
    const { model, kind, usage } = c;
    const row = {
      userId: currentUserId() ?? null,
      model,
      kind,
      tokensIn: Math.max(0, Math.round(usage?.input_tokens ?? 0)),
      tokensOut: Math.max(0, Math.round(usage?.output_tokens ?? 0)),
      cacheRead: Math.max(0, Math.round(usage?.cache_read_input_tokens ?? 0)),
      cacheWrite: Math.max(0, Math.round(usage?.cache_creation_input_tokens ?? 0)),
      paid: isPaidWork(),
      ms: c.ms === null ? null : Math.max(0, Math.round(c.ms)),
      failed: c.error !== null,
      error: c.error,
    };
    void this.prisma.aiCall.create({ data: row }).catch((e: unknown) => {
      /* Once, not once per call: a broken ledger during an incident must not
         also be the thing filling the log. */
      if (this.warned) return;
      this.warned = true;
      this.logger.error(`the AI ledger is not recording — the bill will under-count until this is fixed: ${String(e)}`);
    });
  }
}
