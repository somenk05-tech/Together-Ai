/**
 * A blood sample cannot have been drawn in the future.
 *
 * Obvious, and neither the form nor the API said so — a panel could be recorded
 * with a collection date in 2030. That is not merely untidy: panels are ordered
 * by collection date, so a future-dated one becomes "your latest panel", and the
 * latest panel drives the health summary, the marker flags, and through those
 * the nutrition targets. One mistyped year and the app is reasoning about a
 * sample that does not exist yet.
 *
 * Pure, because the interesting part is the timezone and that is exactly what a
 * database cannot check. "Today" is the citizen's today: somebody in
 * Asia/Kolkata entering today's date at 01:00 is a day ahead of UTC, and a naive
 * server-side comparison would reject their perfectly good answer.
 */

export type DateVerdict =
  | { ok: true; value: Date }
  | { ok: false; reason: string };

/** How far back is still plausible. A lab result from before this is a typo. */
export const EARLIEST_YEAR = 1900;

/**
 * Check a collection date against the citizen's own today.
 *
 * `today` must be the start of the citizen's local day — ClockService.
 * dateOnlyFor(userId) produces exactly that, and exists because this codebase
 * has already been bitten by treating a UTC instant as a date.
 */
export function checkCollectionDate(value: Date | string | null | undefined, today: Date): DateVerdict {
  if (value === null || value === undefined || value === '') {
    // Absent is fine — the caller defaults it to today.
    return { ok: true, value: today };
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, reason: 'That is not a date we can read.' };
  }

  // The end of the citizen's today, so "today" itself is always allowed however
  // the client formatted it — a date-only value, or an instant part-way through
  // the day.
  const endOfToday = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
  if (d.getTime() > endOfToday.getTime()) {
    return { ok: false, reason: 'A blood test cannot be dated in the future. Use the day the sample was taken.' };
  }
  if (d.getUTCFullYear() < EARLIEST_YEAR) {
    return { ok: false, reason: 'That date looks like a typo — check the year.' };
  }
  return { ok: true, value: d };
}
