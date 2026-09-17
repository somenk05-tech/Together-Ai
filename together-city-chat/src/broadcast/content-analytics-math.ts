/**
 * ── THE ARITHMETIC OF THE CONTENT ANALYTICS (owner, 17 Sep) ────────────────
 *
 * Pure, so every rule below is proven by a spec rather than by a dashboard
 * that happened to look right.
 *
 * A READING IS A RUNNING TOTAL. A platform says "this video has 4,210 views"
 * — so a period's views are the reading at its end minus the reading at its
 * start. A post published inside the period starts from zero. A post
 * published before it, and first read after it began, starts from its first
 * reading: that undercounts, and never invents.
 *
 * NULL IS NOT ZERO. A number the platform does not give stays null through
 * every sum: a total over nothing measured is null ("—"), and a total over
 * some measured rows says how many rows it covers.
 *
 * VIEWS ARE NOT PEOPLE. Views add across platforms; people do not. The only
 * de-duplicated count of people the city has is its own: distinct browsers
 * that arrived through a link.
 */
export type RangeKey = 'today' | '7d' | '30d' | '90d' | '6m' | 'all' | 'custom';
export const RANGE_KEYS: RangeKey[] = ['today', '7d', '30d', '90d', '6m', 'all', 'custom'];

export interface Window { from: Date | null; to: Date; prevFrom: Date | null; prevTo: Date | null }

const DAY = 86_400_000;
/** The city keeps its days in India Standard Time (UTC+05:30). */
const IST = 330 * 60_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Midnight IST of the day `at` falls on. */
export const istMidnight = (at: Date): Date => new Date(Math.floor((at.getTime() + IST) / DAY) * DAY - IST);
/** YYYY-MM-DD in IST. */
export const istDay = (at: Date): string => new Date(at.getTime() + IST).toISOString().slice(0, 10);

export function windowOf(key: RangeKey, now: Date, custom: { from?: string; to?: string } = {}): Window {
  const back = (from: Date): Window => {
    const len = now.getTime() - from.getTime();
    return { from, to: now, prevFrom: new Date(from.getTime() - len), prevTo: from };
  };
  switch (key) {
    case 'today': return back(istMidnight(now));
    case '7d': return back(new Date(now.getTime() - 7 * DAY));
    case '30d': return back(new Date(now.getTime() - 30 * DAY));
    case '90d': return back(new Date(now.getTime() - 90 * DAY));
    case '6m': return back(new Date(now.getTime() - 182 * DAY));
    case 'all': return { from: null, to: now, prevFrom: null, prevTo: null };
    case 'custom': {
      if (!custom.from || !DAY_RE.test(custom.from)) return back(new Date(now.getTime() - 30 * DAY));
      const from = new Date(new Date(`${custom.from}T00:00:00Z`).getTime() - IST);
      const toDay = custom.to && DAY_RE.test(custom.to) ? custom.to : istDay(now);
      const end = new Date(new Date(`${toDay}T00:00:00Z`).getTime() - IST + DAY);
      const to = end > now ? now : end;
      if (!(from < to)) return back(new Date(now.getTime() - 30 * DAY));
      const len = to.getTime() - from.getTime();
      return { from, to, prevFrom: new Date(from.getTime() - len), prevTo: from };
    }
  }
}

export const COUNTS = ['views', 'likes', 'comments', 'shares', 'saves'] as const;
export type CountKey = (typeof COUNTS)[number];
export interface Reading { at: Date; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }

/** The last reading at or before `t`. Readings must be in time order. */
export function readingAt(readings: Reading[], t: Date): Reading | null {
  let best: Reading | null = null;
  for (const r of readings) {
    if (r.at.getTime() <= t.getTime()) best = r; else break;
  }
  return best;
}

/**
 * How much `field` grew between `from` and `to`, for a post published at
 * `publishedAt`. Null when the platform gives no such number, or when no
 * reading had been taken by `to`.
 */
export function grew(readings: Reading[], field: CountKey, publishedAt: Date, from: Date | null, to: Date): number | null {
  const end = readingAt(readings, to);
  const endValue = end?.[field];
  if (endValue === null || endValue === undefined) return null;
  if (!from || publishedAt.getTime() >= from.getTime()) return endValue;
  const start = readingAt(readings, from) ?? readings.find((r) => r[field] !== null) ?? null;
  const startValue = start?.[field];
  if (startValue === null || startValue === undefined || start === end) return start === end ? 0 : null;
  return Math.max(0, endValue - startValue);
}

/** A sum that remembers how much of it was measured. */
export interface Sum { value: number | null; measured: number; of: number }
export function sum(values: Array<number | null>): Sum {
  let value: number | null = null;
  let measured = 0;
  for (const v of values) {
    if (v === null) continue;
    value = (value ?? 0) + v;
    measured += 1;
  }
  return { value, measured, of: values.length };
}

/** a ÷ b as a percentage to one decimal; null when either is unmeasured or b is 0. */
export function pct(a: number | null, b: number | null): number | null {
  if (a === null || b === null || b <= 0) return null;
  return Math.round((a / b) * 1000) / 10;
}

/** The change from `prev` to `cur`, in percent; null without a base to compare to. */
export function change(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** likes + comments + shares + saves, over whichever of them were measured. */
export function engagements(c: Partial<Record<CountKey, number | null>>): number | null {
  return sum([c.likes ?? null, c.comments ?? null, c.shares ?? null, c.saves ?? null]).value;
}

/**
 * The best and the worst of the content, by views where views were measured,
 * by engagements otherwise. A list with one entry has a best and no worst.
 */
export function bestAndWorst<T extends { views: number | null; engagements: number | null }>(rows: T[]):
  { best: (T & { by: 'views' | 'engagements' }) | null; worst: (T & { by: 'views' | 'engagements' }) | null } {
  const by: 'views' | 'engagements' = rows.some((r) => r.views !== null) ? 'views' : 'engagements';
  const ranked = rows.filter((r) => r[by] !== null).sort((a, b) => (b[by] as number) - (a[by] as number));
  if (!ranked.length) return { best: null, worst: null };
  return {
    best: { ...ranked[0], by },
    worst: ranked.length > 1 ? { ...ranked[ranked.length - 1], by } : null,
  };
}

/** Daily values of a running total, as the growth on each IST day. */
export function dailyGrowth(readings: Reading[], field: CountKey, publishedAt: Date, days: string[]): Array<number | null> {
  return days.map((d) => {
    const start = new Date(new Date(`${d}T00:00:00Z`).getTime() - IST);
    const end = new Date(start.getTime() + DAY);
    if (end.getTime() <= publishedAt.getTime()) return null;
    return grew(readings, field, publishedAt, start, end);
  });
}

/** Every IST day from `from` to `to`, at most `cap` of them (the latest). */
export function daysBetween(from: Date, to: Date, cap = 180): string[] {
  const out: string[] = [];
  for (let t = istMidnight(from).getTime(); t <= to.getTime(); t += DAY) out.push(istDay(new Date(t)));
  return out.slice(-cap);
}
