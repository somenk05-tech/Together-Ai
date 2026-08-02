/**
 * `fitnessLevel` IS TWO QUESTIONS, AND IT LOOKS LIKE A THIRD.
 *
 * Three fields in this app are about how much somebody moves. They are stored
 * apart, they decide different things, and their wording overlaps enough that
 * consolidating them would look like tidying up:
 *
 *  1. `MasterProfile.activityLevel` — sedentary | light | moderate | active |
 *     veryActive. THE ENERGY MULTIPLIER. It is multiplied by a BMR to produce
 *     the calorie target somebody is fed. See shared/energy.ts, which exists
 *     because there were once three of these and "Athlete" meant 2.0 on one
 *     page and 1.75 on another — a 14% difference in the same citizen's energy
 *     needs, decided by which form they happened to open.
 *  2. `FitnessProfile.level` — basic | beginner | intermediate | advanced |
 *     athlete. AN ABILITY TIER. It sets training DAYS PER WEEK and the starting
 *     INTENSITY CEILING (`levelDef()` in fitness-engine.ts). It is a statement
 *     about what somebody can safely be asked to do.
 *  3. Dating's `extras.fitnessLevel` — Sedentary | Lightly active | Active |
 *     Very active | Daily, from the `exercise` lookup. A SELF-DESCRIPTION,
 *     shown to another citizen on a profile and scored for compatibility
 *     against four other lifestyle attributes. It computes NOTHING about the
 *     citizen's own body: no target, no programme, no cap.
 *
 * WHAT A CROSSING WOULD COST, in the direction each is most likely to be made:
 *
 * · Dating → activity. A line somebody types in an afternoon, describing
 *   themselves for strangers, would start setting their calorie target. "Very
 *   active" chosen to look good on a profile is not a claim about training
 *   volume, and it is not a number anybody consented to be fed by.
 * · Dating → ability. A self-description would set training days and the
 *   intensity ceiling. "Daily" would become five or six sessions a week with
 *   intervals, prescribed to somebody who meant they walk the dog.
 * · Ability → dating. 'athlete' is a storage key, and 'basic' in front of
 *   another citizen is the app describing somebody in a word they never chose.
 *
 * THE TWO WORDS THAT COLLIDE. Dating's 'Sedentary' and 'Active' lower-case to
 * `sedentary` and `active`, which ARE two of the five activity-scale KEYS. So a
 * naive crossing would not fail loudly — it would succeed for two values out of
 * five and silently drop the other three. That is worse than a value that never
 * matches. It is also why `datingActivityFrom` compares EXACTLY rather than
 * case-insensitively: the dating field stores the lookup's label and the
 * activity scale stores a lower-case key, so case is the entire difference
 * between them, and folding it away is the bug rather than the tidy-up.
 *
 * NOTHING HERE CONVERTS. Each function accepts only its own vocabulary and
 * returns undefined for everything else, including — especially — the other
 * two lists. If a screen ever genuinely needs one of these questions answered
 * from another, that is a product decision with a citizen on the other end of
 * it, and it does not belong in a helper.
 */

/** Dating's self-description, mirroring the `exercise` lookup exactly. */
export const DATING_ACTIVITY_SELF_DESCRIPTIONS = [
  'Sedentary', 'Lightly active', 'Active', 'Very active', 'Daily',
] as const;
export type DatingActivitySelfDescription = (typeof DATING_ACTIVITY_SELF_DESCRIPTIONS)[number];

/** The fitness engine's ability tiers, mirroring `LEVELS` in fitness-engine.ts. */
export const FITNESS_ABILITY_LEVELS = [
  'basic', 'beginner', 'intermediate', 'advanced', 'athlete',
] as const;
export type FitnessAbilityLevel = (typeof FITNESS_ABILITY_LEVELS)[number];

const fold = (raw?: string | null) => (raw ?? '').trim().toLowerCase();

/**
 * An ability tier, or undefined. Every dating self-description returns
 * undefined ON PURPOSE — see the collision note above.
 */
export function fitnessAbilityFrom(raw?: string | null): FitnessAbilityLevel | undefined {
  const k = fold(raw);
  return FITNESS_ABILITY_LEVELS.find((l) => l === k);
}

/**
 * A dating self-description, or undefined.
 *
 * MATCHED EXACTLY, NOT FOLDED — and that is not an oversight, it is the only
 * thing separating 'Sedentary' the self-description from `sedentary` the
 * activity-scale key. Lower-casing before comparing would make those two the
 * same string, which is the collision this file exists to refuse. The dating
 * field stores the lookup's LABEL (`o?.label`); the activity scale stores a
 * lower-case KEY. Case is the whole of the difference, so case is respected.
 */
export function datingActivityFrom(raw?: string | null): DatingActivitySelfDescription | undefined {
  const exact = (raw ?? '').trim();
  if (!exact) return undefined;
  return DATING_ACTIVITY_SELF_DESCRIPTIONS.find((d) => d === exact);
}

// No one-line-purpose map here on purpose. It was written, and it had no
// caller: the two screens that explain these fields already carry their own
// words, and an export with no importer is where a feature gets built by
// mistake — the dead-export ceiling caught exactly this shape in
// relationshipStatus.ts. If a third screen ever needs to explain them, that
// screen is the reason to add one.
