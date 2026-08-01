/**
 * THE ONE DIET VOCABULARY, AND THE TWO THAT LOOKED LIKE IT.
 *
 * The same question is asked in two hubs and stored two ways. Nutrition writes
 * KEYS on `FoodPref.diet` — everything | veg | nonveg | pesc | egg | vegan |
 * jain — and its engine branches on them. Dating writes the LOOKUP LABEL the
 * citizen picked — 'Vegetarian', 'Non-vegetarian', 'Eggetarian', 'Pescatarian'
 * — into its extras blob, and `lifestyleScore` compares those strings exactly.
 *
 * Two vocabularies for one answer is the §15.1 shape, and comparing them
 * directly is the `beautyGender` bug: one capital letter, and a value that
 * looks right never matches. So there is ONE crossing point, here, and the loss
 * it costs is written down rather than discovered.
 *
 * WRITE-OWNER: NUTRITION. The key is what the meal engine branches on, and a
 * value that decides what somebody is served should have one writer. Dating's
 * form is a social self-description; it fills a gap in the Master Profile when
 * nothing else has (see the consolidation in master-profile.service.ts), but it
 * does not overwrite the answer Nutrition holds.
 *
 * WHAT CROSSING COSTS, stated once:
 *
 * · `everything` → 'Non-vegetarian'. The distinction between "I restrict
 *   nothing" and "I eat meat" does not exist in the dating list. The engine
 *   already treats the two as one — `mapUserDiet` sends both to 'nonveg' and
 *   the allowed-recipe table gives them identical lists — so the loss is at the
 *   label, not in what anybody is served. Crossing BACK returns `nonveg`, not
 *   `everything`: a round trip through dating narrows the answer, once, and
 *   never silently widens it.
 * · `jainvegan` → 'Jain'. An internal recipe tag with no dating label; the
 *   vegan half is lost at the boundary. It is not offered by any form, and it
 *   is mapped rather than dropped so that a citizen who somehow holds it is
 *   still described as Jain rather than as nothing.
 * · Anything unrecognised → `undefined`. Never a guess, and never a default:
 *   `everything` is somebody's answer, not a fallback for silence.
 */

/** What Nutrition stores, and what the meal engine branches on. */
export type DietKeyShared =
  | 'everything' | 'nonveg' | 'pesc' | 'egg' | 'veg' | 'vegan' | 'jain';

/** Key → the label the social surfaces show. See the losses above. */
const LABEL_OF: Record<string, string> = {
  everything: 'Non-vegetarian',
  nonveg: 'Non-vegetarian',
  veg: 'Vegetarian',
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  egg: 'Eggetarian',
  pesc: 'Pescatarian',
  jain: 'Jain',
  jainvegan: 'Jain',
};

/**
 * Everything that has ever meant one of these diets, in either vocabulary, in
 * lower case. Written out rather than derived, because a derivation that is
 * clever enough to cover 'non-veg' and 'Non-vegetarian' is clever enough to
 * turn an unknown word into a diet somebody never chose.
 */
const KEY_OF: Record<string, DietKeyShared> = {
  everything: 'everything', anything: 'everything',
  nonveg: 'nonveg', 'non-veg': 'nonveg', nonvegetarian: 'nonveg', 'non-vegetarian': 'nonveg',
  veg: 'veg', vegetarian: 'veg',
  vegan: 'vegan',
  egg: 'egg', eggetarian: 'egg',
  pesc: 'pesc', pescatarian: 'pesc', fish: 'pesc',
  jain: 'jain', jainvegan: 'jain',
};

/** A diet key from whatever a hub stored, or undefined if it is not a diet. */
export function dietKeyFrom(raw?: string | null): DietKeyShared | undefined {
  const k = (raw ?? '').trim().toLowerCase();
  if (!k) return undefined;
  return KEY_OF[k];
}

/** The label a social surface shows for a stored diet, or undefined. */
export function dietLabel(raw?: string | null): string | undefined {
  const k = (raw ?? '').trim().toLowerCase();
  if (!k) return undefined;
  return LABEL_OF[k];
}
