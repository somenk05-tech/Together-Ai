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

/**
 * ── SEXUAL ORIENTATION (owner, 27 Aug) ──────────────────────────────────────
 *
 * A THIRD QUESTION, and it is not a variant of the other two. `sexAtBirth`
 * feeds formulas, `genderIdentity` is how the app addresses somebody, and this
 * is neither: it is who they are drawn to. Keeping it in its own type is the
 * same discipline that split the first two — a single string would let one be
 * passed where another belongs.
 *
 * IT IS SPECIAL-CATEGORY DATA. GDPR Article 9 and its equivalents put it in a
 * different legal class from the other two, and the owner has chosen to ask it
 * at registration from every citizen, including everyone who only ever opens
 * Jobs or Nutrition. That decision is recorded in the commit that added this;
 * what is recorded HERE is what follows from it in code:
 *
 *   · IT NEVER LEAVES THE CITIZEN'S OWN RESPONSES. No card, no candidate
 *     shape, no activity party, no chat header. `nothing-about-who-you-love.
 *     spec.ts` fails if it appears in a cross-citizen path.
 *   · IT DRIVES NOTHING. The dating engine matches on `gender` and `seeking`,
 *     which are stated separately and mean something precise. Inferring
 *     `seeking` from this would be guessing at somebody's preferences from a
 *     label — bisexual does not mean "show me everyone", and asexual does not
 *     mean "show me nobody".
 *
 * `preferNotToSay` is in the list on purpose, and the reason is the one
 * `SEX_AT_BIRTH` already gives: offering an answer and quietly picking one for
 * somebody is worse than not asking. The field is required — a citizen must
 * answer — and declining is one of the answers.
 */
export const ORIENTATION = [
  'straight', 'gay', 'lesbian', 'bisexual', 'pansexual', 'asexual', 'queer',
  'other', 'preferNotToSay',
] as const;
export type Orientation = (typeof ORIENTATION)[number];

export const isOrientation = (v: unknown): v is Orientation =>
  typeof v === 'string' && (ORIENTATION as readonly string[]).includes(v);

/** How the profile page writes it. `other` carries free text; the rest stand alone. */
export function displayOrientation(p: { orientation?: string | null; orientationOther?: string | null } | null): string | null {
  if (!p?.orientation) return null;
  if (p.orientation === 'other') return p.orientationOther?.trim() || 'Other';
  if (p.orientation === 'preferNotToSay') return null;
  const labels: Record<string, string> = {
    straight: 'Straight', gay: 'Gay', lesbian: 'Lesbian', bisexual: 'Bisexual',
    pansexual: 'Pansexual', asexual: 'Asexual', queer: 'Queer',
  };
  return labels[p.orientation] ?? null;
}

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

/** The three values a dating profile stores. Deliberately its own list: the
 *  Dating Hub predates the split and its column is lowercase `nonbinary`. */
export const DATING_GENDER = ['male', 'female', 'nonbinary'] as const;
export type DatingGender = (typeof DATING_GENDER)[number];

/**
 * The citizen's gender in the vocabulary a dating profile speaks.
 *
 * This exists because the split shipped the two new columns and left this
 * boundary unguarded. `propagationPlan` sent `genderIdentity` straight into
 * `DatingProfile.gender`, so a citizen who chose Non-binary on the Master
 * Profile page had `nonBinary` written into a column whose only readers compare
 * it with `===` against `nonbinary`:
 *
 *     const iWant    = mine.seeking === 'any' || mine.seeking === cand.gender;
 *     const theyWant = cand.seeking === 'any' || cand.seeking === mine.gender;
 *
 * Six sites, all exact-match. One capital letter took them out of everyone
 * else's results and took everyone else out of theirs, silently, with a profile
 * that looked complete — and the Dating form's own select had no option that
 * matched the stored value either, so the field opened blank next time.
 *
 * `other` returns undefined rather than being flattened into one of the three.
 * A dating profile is shown to other people and matched on; putting somebody in
 * a category they did not pick is not a rounding error. They choose on the form.
 */
export function datingGender(p: {
  genderIdentity?: string | null;
  /** The pre-split column. Read only when the above is empty. */
  gender?: string | null;
}): DatingGender | undefined {
  const raw = p.genderIdentity ?? p.gender;
  if (raw === 'male' || raw === 'female') return raw;
  if (raw === 'nonBinary' || raw === 'nonbinary') return 'nonbinary';
  return undefined;
}

/**
 * The three options the Beauty hub's Skin & Hair form offers, capitalised.
 *
 * Its own vocabulary, like Dating's, and for the same reason: it predates the
 * split and its select is Female | Male | Other. Handing it 'Non-binary' would
 * match no option, the field would open blank, and somebody who had already
 * answered would be asked again — the §15.1 failure, one hub along.
 *
 * The flattening of nonBinary to 'Other' is a real loss and is written down
 * rather than hidden: it is what the hub has always stored, nothing in
 * beauty-analysis or beauty-engine branches on the value, and widening the
 * select is a product decision rather than a bug fix.
 */
export const BEAUTY_GENDER = ['Female', 'Male', 'Other'] as const;
export type BeautyGender = (typeof BEAUTY_GENDER)[number];

export function beautyGender(p: {
  genderIdentity?: string | null;
  gender?: string | null;
}): BeautyGender | undefined {
  const raw = (p.genderIdentity ?? p.gender ?? '').toLowerCase();
  if (raw === 'male') return 'Male';
  if (raw === 'female') return 'Female';
  return raw ? 'Other' : undefined;
}

/**
 * Beauty's answer, on its way back to the Master Profile.
 *
 * The hub used to sync its label straight into the retired `gender` column —
 * so 'Female' landed where 'female' was expected, and clinicalSex(), which
 * compares lowercase, returned undefined. A citizen who filled Beauty first had
 * no clinical sex anywhere in the city, and nothing said why.
 */
export function genderIdentityFromBeauty(label?: string | null): GenderIdentity | undefined {
  const raw = (label ?? '').toLowerCase();
  if (raw === 'male') return 'male';
  if (raw === 'female') return 'female';
  if (raw === 'other') return 'other';
  return undefined;
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
