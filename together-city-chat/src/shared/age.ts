/**
 * ── HOW OLD SOMEBODY IS, DECIDED IN ONE PLACE ───────────────────────────────
 *
 * Owner, 27 Aug, after the launch audit: "fix everything related to the 18+."
 *
 * There were two age formulas in this codebase and they disagreed. Dating
 * divided elapsed milliseconds by 365.25 days; the Master Profile counted
 * calendar years. The divisor form is wrong for up to a day around a birthday
 * and wrong by a whole year at the boundary that matters — so on the day
 * somebody turned 18, the gate could still read 17 while their own profile
 * said 18. Two answers to "how old is this person" is one answer too many when
 * one of them decides whether a stranger may see them.
 *
 * This is the calendar form, and it is now the only one. Everything that asks
 * — the DTO that refuses the save, the moderation check, the age shown on a
 * card, the SQL prefilter — asks here.
 *
 * WHY WHOLE YEARS AND WHY UTC. A birth DATE has no time and no zone; the app
 * stores it at UTC midnight. Comparing in UTC keeps the answer stable wherever
 * the server happens to be, and whole years is what "18" means in every
 * jurisdiction that sets one.
 */

/** The age of majority this product enforces. One number, one name. */
export const MIN_DATING_AGE = 18;

/**
 * The oldest a date of birth may imply before we stop believing it.
 *
 * Found by this module's own test: `0000-01-01` is a VALID JavaScript date,
 * and it made the gate read an age of two thousand and passed straight
 * through as an adult. A date that implies someone is older than anybody has
 * ever been is not a conservative reading of their age, it is a typo or a
 * probe — and either way "not established" is the only safe answer.
 */
export const MAX_PLAUSIBLE_AGE = 120;

/**
 * Whole years elapsed, by the calendar. Returns null for anything that is not
 * a usable date — an unparseable string, or a date in the future, which is not
 * an age at all and must never read as a large one.
 */
export function ageOn(birthDate: Date | string, now: Date = new Date()): number | null {
  const d = birthDate instanceof Date ? birthDate : new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() > now.getTime()) return null;
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  // Not had this year's birthday yet — compare month, then day.
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1;
  if (years < 0 || years > MAX_PLAUSIBLE_AGE) return null;
  return years;
}

/**
 * Is this person old enough for the dating hub?
 *
 * FAILS CLOSED on anything it cannot read. `null` from `ageOn` — unparseable,
 * or a date in the future — is not "unknown, allow"; it is "not established",
 * and the one place we must not guess is here.
 */
export function isAdult(birthDate: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (birthDate === null || birthDate === undefined || birthDate === '') return false;
  const age = ageOn(birthDate, now);
  return age !== null && age >= MIN_DATING_AGE;
}

/** What a citizen is told when the date they entered is too young. Said once,
 *  here, so the form, the API and the audit log cannot word it differently. */
export const UNDER_AGE_MESSAGE =
  `You must be ${MIN_DATING_AGE} or older to use the matchmaking hub.`;

/**
 * The same refusal, for the doors that are not the dating hub.
 *
 * Registration has always said this — the whole city is 18+, because an
 * under-18 is a "child" under the DPDP Act and nothing here is built to hold a
 * child's data lawfully. What was missing is that the OTHER doors a date of
 * birth can be written through did not say it: Astrology took any date at all
 * and synced it to the master record, and `syncShared` — the one function every
 * hub writes shared fields through — took whatever it was handed. So the rule
 * was true at the front door and optional at the side ones.
 *
 * A citizen who mistyped a year should be told which field and why, in the same
 * words wherever they are standing.
 */
export const UNDER_AGE_CITY_MESSAGE =
  `You must be ${MIN_DATING_AGE} or older to use Together City. Check the year in your date of birth.`;

/**
 * A date of birth that may be written, or the reason it may not.
 *
 * Returns null when the date is acceptable, and the sentence to refuse with
 * otherwise. A separate function from `isAdult` because the callers that need
 * this need to tell the difference between "you are too young" and "that date
 * cannot be read" — and because a guard that returns a REASON is one a caller
 * cannot accidentally use as a boolean and get backwards.
 */
export function refuseDateOfBirth(
  value: Date | string | null | undefined,
  now: Date = new Date(),
): string | null {
  // Absent is not a claim about age. Clearing a date, or never setting one, is
  // allowed everywhere — the doors that REQUIRE a date say so in their schema.
  if (value === null || value === undefined || value === '') return null;
  const age = ageOn(value, now);
  if (age === null) return 'That date of birth cannot be read. Use YYYY-MM-DD, and a date in the past.';
  return age >= MIN_DATING_AGE ? null : UNDER_AGE_CITY_MESSAGE;
}

/**
 * ── AND WHAT AGE YOU MAY ASK FOR ────────────────────────────────────────────
 *
 * `prefAgeMin` and `prefAgeMax` live in the free-form `extras` blob, whose only
 * validation was a size cap. The client sets `min={18}` on the input, which is
 * an HTML attribute and therefore a suggestion — a direct API call could store
 * 13, and the value flows straight into a SQL birth-date range and into the
 * hard filter.
 *
 * Today that returns nothing extra, because an approved pool holds no minors.
 * That is not a reason to leave it: it is a stored, never-inspected signal of
 * intent to match with children, on exactly the field that would turn a gap in
 * the age gate from incidental exposure into a search. So it is clamped on the
 * way in, quietly and in place.
 *
 * CLAMPED, NOT REJECTED. Somebody who has never touched this field can have a
 * stale value from before this existed, and failing their whole profile save
 * over a preference they did not set this time would be punishing the wrong
 * person for our own history. The floor is applied and the save proceeds.
 */
export function floorAgePreferences(dx: Record<string, unknown>): void {
  for (const key of ['prefAgeMin', 'prefAgeMax']) {
    const v = dx[key];
    if (v === null || v === undefined || v === '') continue;
    const n = Math.floor(Number(v));
    // Unreadable is removed rather than floored: a preference nobody can parse
    // is not a preference, and leaving it would keep feeding the SQL range.
    if (!Number.isFinite(n)) { delete dx[key]; continue; }
    dx[key] = Math.max(MIN_DATING_AGE, n);
  }
  // A range that now inverts (min floored above a stale max) would silently
  // match nobody. Widen the top rather than drop the floor.
  const lo = dx.prefAgeMin, hi = dx.prefAgeMax;
  if (typeof lo === 'number' && typeof hi === 'number' && hi < lo) dx.prefAgeMax = lo;
}
