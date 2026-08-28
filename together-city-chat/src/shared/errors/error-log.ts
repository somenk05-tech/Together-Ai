/**
 * WHAT BROKE, WHERE SOMEBODY CAN SEE IT, WITHOUT AN ACCOUNT ANYWHERE.
 *
 * `SENTRY_DSN` is unset in production, and the wiring behind it is fine — the
 * exception filter reports every 5xx with the route and nothing about the
 * citizen. So the finding was never "Sentry is broken"; it was that with no
 * DSN, a 500 is a line in a log stream nobody reads, and on a launch morning
 * that is the same as not having happened.
 *
 * This is the floor under that: a tally the process keeps for itself, read by
 * the operator page and by the daily digest. It costs one small object, holds
 * no request bodies and no citizen data, and it answers the two questions
 * somebody actually asks at 11am — is anything failing, and is it one thing
 * failing a lot or many things failing once.
 *
 * It is deliberately NOT a replacement for Sentry: it dies with the process,
 * it does not aggregate across instances, it has no stack traces and no
 * history. Setting the DSN is still the right thing. This is what is true
 * before somebody does.
 */
const KEEP = 20;

export interface ErrorEntry { at: string; status: number; method: string; route: string; message: string }

let total = 0;
let since = new Date().toISOString();
const recent: ErrorEntry[] = [];
const byRoute = new Map<string, number>();

/** One 5xx. Called by the exception filter, beside `report`. */
export function recordError(e: { status: number; method?: string; route?: string; message?: string }): void {
  total += 1;
  const route = e.route || 'unknown';
  byRoute.set(route, (byRoute.get(route) ?? 0) + 1);
  recent.unshift({
    at: new Date().toISOString(),
    status: e.status,
    method: e.method ?? '?',
    route,
    // The class and message only — never the payload that produced it.
    message: (e.message ?? '').slice(0, 200),
  });
  if (recent.length > KEEP) recent.length = KEEP;
}

/** The tally, for the operator page and the digest. */
export function errorSnapshot(): { total: number; since: string; recent: ErrorEntry[]; worstRoute: { route: string; count: number } | null } {
  let worstRoute: { route: string; count: number } | null = null;
  for (const [route, count] of byRoute) {
    if (!worstRoute || count > worstRoute.count) worstRoute = { route, count };
  }
  return { total, since, recent: [...recent], worstRoute };
}

/** Tests only: a fresh process, without one. */
export function resetErrorLog(): void {
  total = 0;
  since = new Date().toISOString();
  recent.length = 0;
  byRoute.clear();
}
