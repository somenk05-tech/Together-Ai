import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { http } from './client';
import { firstTouch } from './origin';
import { apiGet } from './http';

/**
 * ── THE CITY COUNTS ITS VISITORS (owner, 16 Sep) ────────────────────────────
 *
 * Two calls. `countThisVisit` runs once when the app boots — every opening of
 * togethercity.app, signed in or not — and `useVisitStats` is the Investor
 * page's live counter, which the server serves only to the page password.
 * What a visit and a unique visitor are is written down once, on the server,
 * in analytics/visits.service.ts.
 */

const VISITOR_KEY = 'tc:visitor';
const COUNTED_KEY = 'tc:visit-counted';

/** Storage can be missing or throw (private mode, blocked site data); a
 *  counter must never be the reason the city fails to open. */
function stored(store: () => Storage, key: string, make?: () => string): string | null {
  try {
    const s = store();
    const have = s.getItem(key);
    if (have || !make) return have;
    const v = make();
    s.setItem(key, v);
    return v;
  } catch {
    return null;
  }
}

/** One beacon per tab: a reload or a walk between rooms is the same visit. */
export function countThisVisit(): void {
  if (stored(() => sessionStorage, COUNTED_KEY)) return;
  stored(() => sessionStorage, COUNTED_KEY, () => '1');
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? stored(() => localStorage, VISITOR_KEY, () => crypto.randomUUID())
    : null;
  // Where the visit came from travels with it (owner, 16 Sep); see origin.ts.
  const t = firstTouch();
  http.post('/visits', { id, ...(t ? { src: t.src, med: t.med, cmp: t.cmp, cnt: t.cnt, trm: t.trm, ref: t.ref } : {}) })
    .catch(() => undefined);
}

const VisitStatsSchema = z.object({
  visits: z.number(),
  uniqueVisitors: z.number(),
  members: z.number(),
  countingSince: z.string().nullable(),
  at: z.string(),
});
type VisitStats = z.infer<typeof VisitStatsSchema>;

export const readVisitStats = (password: string): Promise<VisitStats> =>
  apiGet('/visits/stats', VisitStatsSchema, { headers: { 'x-investor-password': password } });

/** Live: read again every five seconds while the page is in front of
 *  somebody, and not at all while the tab is in the background. */
export function useVisitStats(password: string | null) {
  return useQuery({
    queryKey: ['visits', 'stats'],
    queryFn: () => readVisitStats(password ?? ''),
    enabled: !!password,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
}

/** This browser's visitor id, if it has one (read only). */
export function visitorId(): string | null {
  return stored(() => localStorage, VISITOR_KEY);
}
