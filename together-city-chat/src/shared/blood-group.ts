/**
 * Blood group, and the two different silences it can hold.
 *
 * Asked once, on the Master Profile, and SKIPPABLE by design. Nothing in the
 * city computes with it: no target, no filter, no recommendation. It is the
 * citizen's own record, shown back to them on the health record, which is the
 * whole of its job — a field that is displayed to its owner has a reader, and a
 * field with no reader is the H3 defect.
 *
 * TWO ABSENCES, AND THEY ARE NOT THE SAME.
 *
 * · The column is NULL — nobody has ever answered. "Not recorded."
 * · The value is `unknown` — the citizen answered, and the answer is that they
 *   do not know it. "You told us you don't know it."
 *
 * Collapsing those two is the mistake this codebase has already made in the
 * larger: `?? []` and `.length === 0` turning "we don't know" into "you have
 * nothing" across 281 surfaces. So the option exists, it is stored, and the two
 * read differently everywhere they are shown.
 *
 * NEVER DERIVED, NEVER GUESSED. A blood group cannot be worked out from a lab
 * report this app parses, from a family member, or from anything else here. If
 * it is not in this column, the answer is that we do not have it.
 */

/** The eight ABO/Rh groups, as stored and as displayed. */
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

/** The citizen answered, and the answer is that they do not know. */
export const BLOOD_GROUP_UNKNOWN = 'unknown';

export type BloodGroup = (typeof BLOOD_GROUPS)[number] | typeof BLOOD_GROUP_UNKNOWN;

const ALIASES: Record<string, string> = {
  POSITIVE: '+', POS: '+', P: '+',
  NEGATIVE: '-', NEG: '-', N: '-',
};

/**
 * A stored value from whatever was typed, or undefined if it is not a blood
 * group. Handles the spellings people actually use — "O positive", "a neg",
 * "AB−" with a unicode minus — and refuses everything else rather than
 * guessing, because the guess would be recorded as the citizen's own answer.
 */
export function bloodGroupFrom(raw?: string | null): BloodGroup | undefined {
  const t = (raw ?? '').trim();
  if (!t) return undefined;
  const flat = t.toUpperCase().replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ');
  if (flat === 'UNKNOWN' || flat === "DON'T KNOW" || flat === 'DONT KNOW' || flat === 'NOT SURE') {
    return BLOOD_GROUP_UNKNOWN;
  }
  const m = /^(A|B|AB|O)\s*(\+|-|POSITIVE|POS|P|NEGATIVE|NEG|N)$/.exec(flat);
  if (!m) return undefined;
  const sign = m[2].length === 1 && (m[2] === '+' || m[2] === '-') ? m[2] : ALIASES[m[2]];
  if (!sign) return undefined;
  const group = `${m[1]}${sign}`;
  return (BLOOD_GROUPS as readonly string[]).includes(group) ? group as BloodGroup : undefined;
}

/**
 * What a screen should say. Never returns an empty string: a blank where a
 * value should be is the thing that reads as "you have nothing" when the truth
 * is "nobody asked".
 */
export function bloodGroupNote(stored?: string | null): string {
  if (stored === BLOOD_GROUP_UNKNOWN) return "You told us you don't know it";
  const g = bloodGroupFrom(stored);
  return g ?? 'Not recorded';
}
