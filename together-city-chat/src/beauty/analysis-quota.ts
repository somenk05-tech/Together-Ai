/**
 * ONE FREE ANALYSIS A MONTH, THEN ₹100 EACH — owner decision, 5 Sep.
 *
 * The Beauty photo analysis is the dearest thing the free tier does: a vision
 * model reading full-resolution photographs, the largest single AI line once
 * the daily letter went (₹1.70 of a member's ₹6.36 a month). The first
 * analysis is the personalisation itself, and a second comes when the
 * photographs are uploaded again. What this module decides is what the third
 * costs, and when the next free one is:
 *
 *   · one ACCEPTED analysis is free in any rolling 30 days;
 *   · every further accepted analysis inside that window is ₹100;
 *   · a rejected read — unclear, filtered, unreadable — costs nothing and
 *     spends nothing, because the citizen got nothing;
 *   · the skin analysis and the Look (Makeup Studio) read share one counter.
 *
 * ROLLING, NOT CALENDAR. A calendar month hands everybody a free analysis on
 * the 1st and nothing on the 31st; thirty days from the last free one is the
 * same promise on every day of the year, and it is how the 5-a-week ceiling
 * beside it already counts.
 *
 * The list this reads is ACCEPTED analyses only — `acceptedAnalysesJson` on
 * the profile row, written only when a read produced a result. It is not the
 * run log (`analysisLogJson`), which counts every attempt including rejected
 * ones and exists to stop a script, not to price a person. Two lists, two
 * jobs; a single list would have to be wrong for one of them.
 *
 * Pure. The service reads the row, asks here, and writes the row.
 */

export const FREE_WINDOW_DAYS = 30;
export const EXTRA_ANALYSIS_INR = 100;
/** How far back the accepted list is kept. Nothing reads past the window. */
const KEEP_DAYS = 90;

const DAY_MS = 86_400_000;

export interface AnalysisQuota {
  /** What the NEXT accepted analysis costs — 0 or ₹100. */
  priceInr: number;
  /** True while the free one for this window has not been used. */
  freeAvailable: boolean;
  /** When the next free one opens, ISO — null while one is available now. */
  nextFreeAt: string | null;
  freeWindowDays: number;
  extraPriceInr: number;
}

/** Accepted analyses inside the free window, oldest first. */
export function acceptedWithin(accepted: readonly string[], nowMs: number): string[] {
  const since = nowMs - FREE_WINDOW_DAYS * DAY_MS;
  return accepted
    .map((t) => ({ t, ms: Date.parse(t) }))
    .filter((e) => Number.isFinite(e.ms) && e.ms > since && e.ms <= nowMs)
    .sort((a, b) => a.ms - b.ms)
    .map((e) => e.t);
}

export function analysisQuota(accepted: readonly string[], nowMs: number): AnalysisQuota {
  const inWindow = acceptedWithin(accepted, nowMs);
  if (!inWindow.length) {
    return { priceInr: 0, freeAvailable: true, nextFreeAt: null, freeWindowDays: FREE_WINDOW_DAYS, extraPriceInr: EXTRA_ANALYSIS_INR };
  }
  // The free one was the OLDEST accepted analysis in the window; the next free
  // one opens thirty days after it, whatever was paid for since.
  const nextFreeAt = new Date(Date.parse(inWindow[0]) + FREE_WINDOW_DAYS * DAY_MS).toISOString();
  return { priceInr: EXTRA_ANALYSIS_INR, freeAvailable: false, nextFreeAt, freeWindowDays: FREE_WINDOW_DAYS, extraPriceInr: EXTRA_ANALYSIS_INR };
}

/** What the next accepted analysis costs, in rupees. */
export function analysisPrice(accepted: readonly string[], nowMs: number): number {
  return analysisQuota(accepted, nowMs).priceInr;
}

/**
 * The list with one more accepted analysis on it, trimmed to what anything
 * will ever read again. Never shorter than the window: a trim that could
 * drop the entry the price was decided from would refund a free one.
 */
export function recordAccepted(accepted: readonly string[], nowMs: number): string[] {
  const keepSince = nowMs - KEEP_DAYS * DAY_MS;
  const kept = accepted.filter((t) => {
    const ms = Date.parse(t);
    return Number.isFinite(ms) && ms > keepSince;
  });
  return [...kept, new Date(nowMs).toISOString()];
}
