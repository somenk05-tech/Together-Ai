/**
 * Two questions, not one (review p2, spec DB-3.1).
 *
 * The Master Profile has always had a single `gender` field doing two jobs, and
 * the code already knew that did not work. propagationPlan contained this:
 *
 *     const sexBinary = gender === 'male' || gender === 'female' ? gender : undefined;
 *
 * — a non-binary citizen's answer being silently dropped on the way to the
 * nutrition and fitness engines, because Mifflin-St Jeor has a term for male and
 * a term for female and nothing else. The result was that they got no clinical
 * personalisation at all, and were not told why.
 *
 * Splitting the field is not bookkeeping. It is what lets a non-binary or trans
 * citizen have accurate calorie and macro targets AND be addressed correctly:
 *
 *   sexAtBirth      clinical only. Feeds BMR, reference intakes, lab ranges.
 *                   Never displayed to another citizen, never used to address
 *                   anybody.
 *   genderIdentity  social only. The dating profile, how the app refers to
 *                   them. Never enters a formula.
 *
 * Keeping them apart in the type system is the point — a single string would let
 * one be passed where the other belongs, which is the bug this replaces.
 */

/**
 * Clinical sex. `intersex` and `preferNotToSay` are real answers, and neither
 * has a Mifflin-St Jeor coefficient — they resolve to "no clinical sex on file"
 * rather than to a guess. Offering the option and then quietly picking one for
 * them would be worse than not asking.
 */
export const SEX_AT_BIRTH = ['male', 'female', 'intersex', 'preferNotToSay'] as const;
export type SexAtBirth = (typeof SEX_AT_BIRTH)[number];

/** Social gender. `other` carries free text; the rest stand alone. */
export const GENDER_IDENTITY = ['male', 'female', 'nonBinary', 'other'] as const;
export type GenderIdentity = (typeof GENDER_IDENTITY)[number];

export const isSexAtBirth = (v: unknown): v is SexAtBirth =>
  typeof v === 'string' && (SEX_AT_BIRTH as readonly string[]).includes(v);

export const isGenderIdentity = (v: unknown): v is GenderIdentity =>
  typeof v === 'string' && (GENDER_IDENTITY as readonly string[]).includes(v);

/**
 * The sex a formula may use, or undefined.
 *
 * `sexAtBirth` first, because that is the question that was asked for this
 * purpose. `genderIdentity` is consulted only as a fallback for accounts that
 * predate the split, where a single field held whatever the citizen gave us and
 * male/female is the best available reading of it — and only for those two
 * values, because "nonBinary" is not a clinical answer and treating it as one
 * would be inventing data.
 *
 * Returning undefined is a real outcome, not a failure. Downstream,
 * computeTargets reports it in `assumed`, so a screen can say the number is
 * based on an average rather than on them.
 */
export function clinicalSex(p: {
  sexAtBirth?: string | null;
  genderIdentity?: string | null;
  /** The pre-split column. Read only when the two above are empty. */
  gender?: string | null;
}): 'male' | 'female' | undefined {
  if (p.sexAtBirth === 'male' || p.sexAtBirth === 'female') return p.sexAtBirth;
  if (isSexAtBirth(p.sexAtBirth)) return undefined;   // intersex / preferNotToSay: answered, and not usable
  const legacy = p.genderIdentity ?? p.gender;
  return legacy === 'male' || legacy === 'female' ? legacy : undefined;
}

/** How the app should refer to them, with free text preferred when given. */
export function displayGender(p: {
  genderIdentity?: string | null;
  genderIdentityOther?: string | null;
  gender?: string | null;
}): string | undefined {
  if (p.genderIdentity === 'other') return p.genderIdentityOther?.trim() || 'Other';
  if (isGenderIdentity(p.genderIdentity)) {
    return { male: 'Male', female: 'Female', nonBinary: 'Non-binary', other: 'Other' }[p.genderIdentity];
  }
  // Pre-split accounts stored the old lowercase vocabulary.
  const legacy = p.gender;
  if (!legacy) return undefined;
  return { male: 'Male', female: 'Female', nonbinary: 'Non-binary', other: 'Other' }[legacy] ?? legacy;
}

/**
 * Why we ask, in the citizen's words. FE-3.1 requires this to sit next to the
 * fields; keeping the copy beside the rules stops the two drifting apart.
 */
export const WHY_WE_ASK = {
  sexAtBirth:
    'Used only for health calculations — calorie and nutrient targets, and the '
    + 'reference ranges on your lab results. It is never shown to anyone else.',
  genderIdentity:
    'How Together City refers to you, and what your dating profile shows. It is '
    + 'never used in a health calculation.',
} as const;
