/**
 * Reading the plan's skip keys.
 *
 * The composed plan carries skips as a flat string array of keys — `d3:l` for a
 * skipped lunch on day 3, `d3:l:dal` for one dish inside it. Two readers need
 * to interpret them: the meal card, which dims a skipped dish, and the planner,
 * which holds a skipped meal's place and leaves a skipped dish out of the day's
 * shopping.
 *
 * They live here rather than in ComposedMealCard because a file that exports
 * both components and plain functions breaks Fast Refresh — the second reader
 * is what made that worth fixing rather than tolerating.
 *
 * THE TWO KEY SHAPES ARE NOT INTERCHANGEABLE. A meal key has one colon after
 * the day, a dish key has two, and `skippedSlotsFor` explicitly rejects the
 * longer form: without that check, skipping a single dal would read as skipping
 * the whole of lunch, and the planner would replace a real plate with a
 * placeholder.
 */

/** The dish roles skipped inside one meal — `d3:l:dal` → `dal`. */
export function skippedRolesFor(skips: string[], dayIndex: number, slot: string): Set<string> {
  const prefix = `d${dayIndex}:${slot}:`;
  return new Set(skips.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}

/** The whole meals skipped on one day — `d3:l` → `l`, and never `d3:l:dal`. */
export function skippedSlotsFor(skips: string[], dayIndex: number): string[] {
  const prefix = `d${dayIndex}:`;
  return skips
    .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes(':'))
    .map((k) => k.slice(prefix.length));
}
