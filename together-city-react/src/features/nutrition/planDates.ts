/**
 * Calendar helpers for the composed plan.
 *
 * A composed plan is anchored to a real date — day 0 is `planStartDate`, not
 * "Monday". The older stored plan was Monday-indexed, so anything moving onto
 * the composed engine has to stop assuming weekday === index and derive the
 * date instead. Extracted so both planners agree on what "day 3" means.
 */
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Parse the plan's anchor date; falls back to today when it's missing. */
export function planStart(iso?: string): Date {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/** The real dates this plan covers, day 0 first. */
export function planDates(iso: string | undefined, n: number): Date[] {
  const start = planStart(iso);
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** How many days into the plan today is (0 when it starts today or later). */
export function planDayOffset(iso?: string): number {
  const start = planStart(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((today.getTime() - start.getTime()) / 86_400_000));
}

export const weekdayFull = (d: Date): string => WEEKDAY_FULL[d.getDay()];

/** Which of the thirteen papers a date prints on. Sunday-first, to match
 *  Date#getDay — the key the `[data-paper]` blocks in tokens.css are written
 *  against. It lives HERE, with the other calendar facts, because two pages
 *  print a day and a second copy of this array is how Thursday comes out on
 *  Wednesday's sheet on one of them. */
const PAPER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const paperFor = (d: Date): typeof PAPER[number] => PAPER[d.getDay()];
export const shortDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();

/** "Fri 8 Aug" — the shape somebody reads a date in when they are picking one. */
export const longDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The label a date picker shows.
 *
 * `Today` and `Tomorrow` earn their place: they are what somebody says to
 * themselves while deciding, and a list that makes them count forward from a
 * date to work out whether it is tonight has made them do arithmetic. The date
 * stays alongside rather than being replaced by the word — "Today" alone is
 * ambiguous once the tab has been open past midnight, which for a page about
 * dinner is not a rare case.
 *
 * `offset` is days from TODAY, not from the start of the plan.
 */
export function dayLabel(d: Date, offset: number): string {
  const rel = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : null;
  return rel ? `${rel} · ${longDate(d)}` : longDate(d);
}
