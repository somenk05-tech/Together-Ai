/**
 * ── HOW OLD SOMEBODY IS, ON THIS SIDE OF THE WIRE ───────────────────────────
 *
 * The mirror of the server's `shared/age.ts`, and it exists for the same reason
 * that file does: there were two of these in the web app — one inside the
 * registration form and one implied by a `max` attribute — and every screen
 * that took a date of birth had its own idea of what was allowed.
 *
 * Owner, 29 Aug: "don't accept any date of birth and age below 18." The server
 * refuses at every door now, including the two it used to miss. What this file
 * does is make the FORM agree, so a citizen is told before they submit rather
 * than by a 400 afterwards — and so a date picker never offers a birthday that
 * the city will refuse.
 *
 * WHOLE CALENDAR YEARS, IN UTC, exactly as the server counts them. A form that
 * disagrees with the API about somebody's age on their birthday is a form that
 * refuses an adult, or accepts a child for one round trip.
 */

/** The age of majority this product enforces. Matches the server's constant. */
export const MIN_AGE = 18;

/** Whole calendar years, or -1 for a date that cannot be read. */
export function ageFrom(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return -1;
  const now = new Date();
  let y = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) y -= 1;
  return y;
}

/**
 * The latest date of birth that is already 18 — the ceiling for a date picker.
 *
 * `max` on `<input type="date">` is a real constraint in every browser's own
 * picker and a suggestion to anything else, which is why the server refuses as
 * well. Its job here is that the calendar simply does not offer the years that
 * would be refused.
 */
export function latestAdultDob(): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - MIN_AGE);
  return d.toISOString().slice(0, 10);
}

/** What a citizen is told, worded once. Mirrors UNDER_AGE_CITY_MESSAGE. */
export const UNDER_AGE_MESSAGE =
  `You must be ${MIN_AGE} or older to use Together City. Check the year in your date of birth.`;
