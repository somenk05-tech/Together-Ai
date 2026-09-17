import {
  AGE_BANDS, CITIES, CITY_ALIASES, CITY_TIME_ZONE, MIN_FOR_TREND, MIN_GROUP, RANGES, SYSTEMS,
  type RangeKey, type SourceKey,
} from './insights.config';

/**
 * The arithmetic under /investor/analytics, pure and tested
 * (insights-math.spec.ts). No database, no clock of its own.
 */

const DAY_MS = 86_400_000;

/** A date as the city's day, YYYY-MM-DD. */
export function cityDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: CITY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** Days between two city days (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export interface Bounds {
  range: RangeKey;
  /** Inclusive first city day of the window; null for all time. */
  from: string | null;
  /** Inclusive last city day (today). */
  to: string;
  /** The equal window before it, for "vs previous period"; null for all time. */
  prevFrom: string | null;
  prevTo: string | null;
  days: number | null;
}

export function boundsOf(range: RangeKey, now: Date): Bounds {
  const to = cityDay(now);
  const days = RANGES[range];
  if (days === null) return { range, from: null, to, prevFrom: null, prevTo: null, days: null };
  const from = addDays(to, -(days - 1));
  return { range, from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1), days };
}

export interface Change {
  /** Relative change in percent, rounded to one place; null when there is nothing honest to say. */
  pct: number | null;
  /** Why pct is null, in words. */
  note: string | null;
}

/** Current vs previous. Fewer than MIN_FOR_TREND on both sides is not a trend. */
export function change(current: number | null, previous: number | null): Change {
  if (current === null || previous === null) return { pct: null, note: 'No earlier period to compare.' };
  if (Math.max(current, previous) < MIN_FOR_TREND) return { pct: null, note: 'Not enough data to establish a meaningful trend.' };
  if (previous === 0) return { pct: null, note: 'Nothing in the previous period to compare with.' };
  return { pct: Math.round(((current - previous) / previous) * 1000) / 10, note: null };
}

/** Change in percentage points between two rates (0–100). */
export function pointChange(current: number | null, previous: number | null, base: number): Change {
  if (current === null || previous === null) return { pct: null, note: 'No earlier period to compare.' };
  if (base < MIN_FOR_TREND) return { pct: null, note: 'Not enough data to establish a meaningful trend.' };
  return { pct: Math.round((current - previous) * 10) / 10, note: null };
}

export const rate = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

/** Which system an API path belongs to, or null for the rest of the city. */
export function systemOfPath(path: string): string | null {
  const p = path.split('?')[0].toLowerCase();
  for (const s of SYSTEMS) {
    if (s.paths.some((prefix) => p === prefix || p.startsWith(`${prefix}/`))) return s.key;
  }
  return null;
}

/** Where a visit came from: the utm_source when there is one, else the referrer's host. */
export function sourceOf(utmSource: string | null | undefined, utmMedium: string | null | undefined, referrerHost: string | null | undefined): SourceKey {
  const s = (utmSource ?? '').trim().toLowerCase();
  const m = (utmMedium ?? '').trim().toLowerCase();
  const r = (referrerHost ?? '').trim().toLowerCase();
  const paid = /^(cpc|ppc|paid|paid[_-]?social|ads?)$/.test(m);
  const social = /instagram|facebook|fb|meta|linkedin|twitter|x\.com|t\.co|whatsapp|snapchat/;
  if (s) {
    if (paid && social.test(s)) return 'paid_social';
    if (/google/.test(s)) return 'google';
    if (/instagram|^ig$/.test(s)) return 'instagram';
    if (/youtube|^yt$/.test(s)) return 'youtube';
    if (/referral|invite|friend/.test(s) || m === 'referral') return 'referral';
    if (paid) return 'paid_social';
    return 'other';
  }
  if (!r) return 'direct';
  if (/(^|\.)google\./.test(r)) return 'google';
  if (/instagram\.com$/.test(r)) return 'instagram';
  if (/(youtube\.com|youtu\.be)$/.test(r)) return 'youtube';
  if (/togethercity\.app$/.test(r)) return 'direct';
  return 'referral';
}

/** A browser's rough kind, from its user agent. Nothing else about it is kept. */
export function deviceOf(ua: string): 'phone' | 'tablet' | 'desktop' {
  if (/ipad|tablet|kindle|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'phone';
  return 'desktop';
}

/** A city as the reach table names it. */
export function cityOf(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  if (CITY_ALIASES[t]) return CITY_ALIASES[t];
  const hit = CITIES.find((c) => c.toLowerCase() === t || t.startsWith(`${c.toLowerCase()},`));
  return hit ?? 'Other';
}

export function ageBandOf(dob: Date | null | undefined, now: Date): string | null {
  if (!dob) return null;
  const age = Math.floor((now.getTime() - dob.getTime()) / (365.2425 * DAY_MS));
  const band = AGE_BANDS.find(([lo, hi]) => age >= lo && age <= hi);
  if (!band) return null;
  return band[1] >= 200 ? `${band[0]}+` : `${band[0]}–${band[1]}`;
}

/**
 * Groups smaller than MIN_GROUP folded into one "Other" row, so no row of a
 * small city can be read as a person. The fold is itself hidden if it is
 * still too small; a total is always given.
 */
export function foldSmall(rows: Array<{ label: string; count: number }>, min = MIN_GROUP): {
  rows: Array<{ label: string; count: number }>; hidden: number;
} {
  const shown = rows.filter((r) => r.count >= min && r.label !== 'Other').sort((a, b) => b.count - a.count);
  const rest = rows.filter((r) => r.count < min || r.label === 'Other').reduce((n, r) => n + r.count, 0);
  if (rest >= min) return { rows: [...shown, { label: 'Other', count: rest }], hidden: 0 };
  return { rows: shown, hidden: rest };
}

/** A number of seconds, for people. */
export function durationLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** The host of a referring address, lower-case, or null. The rest of the address is never kept. */
export function hostOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const h = new URL(raw).hostname.toLowerCase();
    return h || null;
  } catch {
    return null;
  }
}

/**
 * How much of [from, to) is covered by at least one of the intervals (ms).
 * Used for uptime: each server run is an interval, the gaps are downtime.
 */
export function coveredMs(intervals: Array<{ start: number; end: number }>, from: number, to: number): number {
  const xs = intervals
    .map((i) => ({ start: Math.max(i.start, from), end: Math.min(i.end, to) }))
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curS = -Infinity;
  let curE = -Infinity;
  for (const i of xs) {
    if (i.start > curE) {
      if (curE > curS) total += curE - curS;
      curS = i.start;
      curE = i.end;
    } else if (i.end > curE) {
      curE = i.end;
    }
  }
  if (curE > curS) total += curE - curS;
  return total;
}
