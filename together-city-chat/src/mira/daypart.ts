/**
 * ── WHAT TIME IT IS FOR THEM ──────────────────────────────────────────────
 *
 * From the owner, at 6:06 pm, asking "What should I cook":
 *
 *     Breakfast: Veg Breakfast · Lunch: Quinoa, Leek And Tofu Casserole Thali
 *     · Evening Soup: Callaloo Soup · Dinner: Vegetarian Potato And
 *     Cauliflower Curry Dinner Plate.
 *
 * Every word of that was true and the first two thirds were useless. Nobody
 * asking what to cook at six in the evening is asking about breakfast.
 *
 * ── WHY THIS IS A MODULE AND NOT A SENTENCE IN THE PROMPT ─────────────────
 *
 * "Consider the time of day" in a persona is a hope. It is not checkable, it
 * does not apply to the deterministic lanes at all — which is where the
 * screenshot above came from, with no model involved — and it cannot be tested.
 * The daypart is a fact about the citizen, computed from the zone on their
 * profile, and it belongs beside the rest of the governor's inputs.
 *
 * ── AND THE RULE THAT OUTRANKS IT ─────────────────────────────────────────
 *
 * INTENT BEATS THE CLOCK. "What should I have for breakfast tomorrow" asked at
 * 6 pm is a question about breakfast, and a context engine that overrides it
 * has stopped listening. So the clock only narrows an answer when the citizen
 * named no meal and no other day; `mealAsked()` and `otherDayAsked()` are the
 * two escape hatches, and they are checked first at every call site.
 */

export type Daypart =
  | 'early morning' | 'late morning' | 'midday' | 'afternoon'
  | 'evening' | 'night' | 'late night';

/**
 * The buckets, from the owner's table. Deliberately coarse: this decides which
 * of four meals to lead with, not anything a minute could change.
 */
export function daypartOf(hour: number): Daypart {
  const h = ((Math.round(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 10) return 'early morning';
  if (h >= 10 && h < 12) return 'late morning';
  if (h >= 12 && h < 15) return 'midday';
  if (h >= 15 && h < 17) return 'afternoon';
  if (h >= 17 && h < 20) return 'evening';
  if (h >= 20 && h < 23) return 'night';
  return 'late night';
}

/** The plan engine's slot letters, and when each is eaten when nothing says. */
const SLOT_HOUR: Record<string, number> = { b: 9, l: 13, s: 17, d: 20 };
export const SLOT_ORDER = ['b', 'l', 's', 'd'] as const;

/**
 * A slot is still ahead if it has not been eaten yet — plus an hour of grace,
 * because somebody asking what to eat at 20:30 means dinner, not tomorrow.
 * `scheduledTime` from the plan wins over the default when it is there: a
 * household that eats at 22:00 is not a household that has missed dinner.
 */
export function slotsAhead(
  hour: number,
  meals: Array<{ slot: string; scheduledTime?: string }> = [],
): string[] {
  const when = (slot: string): number => {
    const m = meals.find((x) => x.slot === slot);
    const t = m?.scheduledTime;
    if (t && /^\d{2}:\d{2}$/.test(t)) return Number(t.slice(0, 2));
    return SLOT_HOUR[slot] ?? 12;
  };
  return SLOT_ORDER.filter((s) => when(s) + 1 >= hour);
}

/** How a person says each slot. `s` is the between-meal one and has no one name. */
export const SLOT_SAID: Record<string, string> = {
  b: 'Breakfast', l: 'Lunch', s: 'Evening soup', d: 'Dinner',
};

const NAMED: Array<{ re: RegExp; slot: string }> = [
  { re: /\b(?:breakfast|nashta|naashta)\b/i, slot: 'b' },
  { re: /\b(?:lunch|dopahar)\b/i, slot: 'l' },
  { re: /\b(?:snack|soup|evening\s+(?:meal|snack))\b/i, slot: 's' },
  { re: /\b(?:dinner|supper|raat\s*ka\s*khana)\b/i, slot: 'd' },
];

/** They named a meal. That is the answer, whatever the clock says. */
export function mealAsked(text: string): string | undefined {
  for (const { re, slot } of NAMED) if (re.test(text)) return slot;
  return undefined;
}

/**
 * They asked about a different day. "Tomorrow", "tonight" is NOT one — tonight
 * is today — and neither is "today", which is the clock's own day.
 */
export function otherDayAsked(text: string): boolean {
  return /\b(?:tomorrow|kal|day after|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend)\b/i.test(text);
}

/**
 * The whole read, for a caller that wants to narrow an answer to what can
 * still happen. `all` is true whenever the clock must not narrow anything.
 */
export function timeContext(hour: number, text: string, meals: Array<{ slot: string; scheduledTime?: string }> = []): {
  hour: number;
  daypart: Daypart;
  /** The slots worth offering, in order. Never empty. */
  slots: string[];
  /** True when the citizen's own words decided this rather than the clock. */
  theyChose: boolean;
} {
  const daypart = daypartOf(hour);
  const named = mealAsked(text);
  if (named) return { hour, daypart, slots: [named], theyChose: true };
  if (otherDayAsked(text)) return { hour, daypart, slots: [...SLOT_ORDER], theyChose: true };
  const ahead = slotsAhead(hour, meals);
  // Nothing left today — late night, and the honest answer is the whole day
  // rather than silence. The caller says which it is.
  return { hour, daypart, slots: ahead.length ? ahead : [...SLOT_ORDER], theyChose: false };
}
