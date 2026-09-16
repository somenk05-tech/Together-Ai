/**
 * ── WHAT A MODEL COSTS, AND WHY THE NUMBER IS NOT IN THIS FILE ──────────────
 *
 * Owner, 9 Sep: "Add money spend and API cost per user data with each user id."
 *
 * The tokens are ours to count and the rates are not: they are a commercial
 * term that changes, differs by contract, and is the one number in this system
 * nobody can verify from inside it. The city's own accuracy rule — never invent
 * a price — applies to our own bill as much as to a shop's.
 *
 * So the rates live in ONE environment variable the owner sets, and a model
 * with no rate shows its tokens and says the rate is unset. A blank column is a
 * question; a plausible wrong number is an answer nobody checks.
 *
 * AI_MODEL_RATES is JSON, rupees per MILLION tokens, keyed by model id:
 *
 *   {"claude-opus-5":{"in":1250,"out":6250,"cacheRead":125,"cacheWrite":1560},
 *    "claude-sonnet-5":{"in":250,"out":1250}}
 *
 * `cacheRead` and `cacheWrite` are optional and fall back to `in` — a
 * deployment that has not broken cache pricing out is better served by a
 * slightly-high estimate it understands than by silently counting cached
 * tokens as free.
 *
 * A PREFIX MATCHES. Providers date their ids ("claude-opus-5-20260401"), and a
 * rate table that has to be re-typed on every point release is a rate table
 * that goes stale. The longest configured key that the model id starts with
 * wins, so "claude-opus-5" prices every build of it and an exact id still
 * overrides.
 */
export interface ModelRate {
  /** Rupees per million input tokens. */
  in: number;
  /** Rupees per million output tokens. */
  out: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type RateTable = Record<string, ModelRate>;

const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

/**
 * Read the table once. A malformed variable is not a reason to refuse to boot
 * or to report a wrong bill: it reads as no rates at all, and the page then
 * says the rate is unset, which is exactly what is true.
 */
export function parseRates(raw: string | undefined): RateTable {
  if (!raw || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: RateTable = {};
    for (const [model, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!v || typeof v !== 'object') continue;
      const r = v as Record<string, unknown>;
      const i = num(r.in); const o = num(r.out);
      if (i === null || o === null) continue;
      out[model] = {
        in: i, out: o,
        ...(num(r.cacheRead) !== null ? { cacheRead: num(r.cacheRead) as number } : {}),
        ...(num(r.cacheWrite) !== null ? { cacheWrite: num(r.cacheWrite) as number } : {}),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export const MODEL_RATES: RateTable = parseRates(process.env.AI_MODEL_RATES);

/** The rate for a model id, by longest configured prefix. */
export function rateFor(model: string, table: RateTable = MODEL_RATES): ModelRate | null {
  let best: { key: string; rate: ModelRate } | null = null;
  for (const [key, rate] of Object.entries(table)) {
    if (!model.startsWith(key)) continue;
    if (!best || key.length > best.key.length) best = { key, rate };
  }
  return best?.rate ?? null;
}

export interface TokenCounts {
  tokensIn: number;
  tokensOut: number;
  cacheRead?: number;
  cacheWrite?: number;
}

/**
 * What these tokens cost, in PAISE, or null when the model has no rate.
 *
 * Paise because a fraction of a rupee per call is the normal case, and a bill
 * summed from rounded rupees is a bill that reads as zero for everybody who
 * used the city lightly — which is most citizens, and exactly the row an
 * operator is trying to tell apart from a script.
 */
export function costPaise(model: string, t: TokenCounts, table: RateTable = MODEL_RATES): number | null {
  const rate = rateFor(model, table);
  if (!rate) return null;
  const per = (tokens: number, rupeesPerMillion: number) => (tokens * rupeesPerMillion * 100) / 1_000_000;
  return per(t.tokensIn, rate.in)
    + per(t.tokensOut, rate.out)
    + per(t.cacheRead ?? 0, rate.cacheRead ?? rate.in)
    + per(t.cacheWrite ?? 0, rate.cacheWrite ?? rate.in);
}

/** ₹1,234.56 from paise, for a page that has to add up. */
export function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
