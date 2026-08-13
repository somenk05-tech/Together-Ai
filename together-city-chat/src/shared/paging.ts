/**
 * Ceilings for append-only list endpoints.
 *
 * These tables only ever grow — a wallet ledger, an inbox, a medical history, an
 * order book. Every one of them was being read with an unbounded findMany, so the
 * response got slower every day a citizen used the app and would eventually time
 * out. There is no natural point at which that self-corrects.
 *
 * A ceiling is not the same as pagination, and this is deliberately the cheaper
 * of the two: it stops the query from being unbounded without changing any
 * response shape, so no client has to be updated in lockstep. The caps are set
 * far above realistic current volumes, so nobody loses rows they can see today.
 * Real cursor pagination — which these endpoints should eventually have, the way
 * /social/feed and /chat/:id/messages already do — is follow-up work.
 *
 * Where a query feeds a COMPUTATION rather than a list (trend charts, monthly
 * spend totals), it is deliberately left uncapped: truncating there would
 * silently produce wrong numbers, which is worse than a slow query.
 */

/** Orders, bookings, tickets, trips — a citizen accumulates these slowly. */
export const ORDER_HISTORY_CAP = 200;

/** Mail folders and notification feeds — higher volume, still a list. */
export const FEED_CAP = 300;

/** Medical records and comment threads — long tails worth keeping visible. */
export const RECORD_CAP = 500;

/** Ledger rows shown as a statement (the month totals are computed separately). */
export const LEDGER_CAP = 500;

/**
 * The citizen's own spending log — the page's list, not the month's arithmetic.
 *
 * It sits beside LEDGER_CAP for the same reason and with the same caveat above:
 * `spendLog` is a LIST and is capped, while the monthly totals aggregate their
 * own date window and are not. A cap that reached the totals would make them
 * quietly wrong the first month somebody wrote more than this many lines, which
 * is the failure this file's header exists to warn about.
 */
export const SPEND_LOG_CAP = 500;

/**
 * Clamp a caller-supplied `limit` to something sane.
 * Rejects junk (NaN, negatives, absurd numbers) by falling back to the default.
 */
export function pageLimit(raw: unknown, fallback: number, max = fallback): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(Math.floor(n), max);
}
