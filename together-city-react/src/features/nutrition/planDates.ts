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
export const shortDate = (d: Date): string =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
