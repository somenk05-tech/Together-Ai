/**
 * ── HOW MANY GRAMS, WHEN THE PACK NEVER SAID ────────────────────────────────
 *
 * 174 of the 184 catalogue rows publish no kcal/kg, so `portionFor` returned
 * null and the meal card said "see pack guide". Correct, and useless to
 * somebody standing over a bowl with a scoop.
 *
 * SO THE CARD NOW SHOWS A RANGE, AND THE RANGE IS BUILT FROM PUBLISHED
 * REGULATORY FIGURES RATHER THAN FROM A NUMBER SOMEBODY LIKED.
 *
 * What the research actually found is worth stating, because it decided the
 * shape of this file: NO authority — not WSAVA, AAFCO, FEDIAF, Merck, AAHA,
 * Tufts, Cornell or Ohio State — publishes a "typical kcal/kg as fed" for
 * kibble or for wet food. Any single number claiming to be one is an app's
 * assumption wearing a citation. What IS published is a floor and a reference:
 *
 *   · AAFCO Model Regulation PF9 caps a "light / lite / low calorie" claim at
 *     3,100 kcal ME/kg (dog, <20% moisture), 3,250 (cat, <20% moisture),
 *     900 (dog, >65% moisture) and 950 (cat, >65% moisture). A food sold as
 *     light sits at or below that, so ordinary food sits at or above it. That
 *     is the bottom of the band.
 *   · AAFCO's own nutrient profiles are built on a presumed 4,000 kcal ME/kg,
 *     and Tufts' worked canned example is 1,198 kcal/kg. Those are the top.
 *
 * The band is therefore a bound, not an average, and every edge of it is a
 * figure somebody published. The UI prints it as a range, calls it an
 * estimate, and says the pack wins — because Tufts measured feeding directions
 * recommending up to 61% more calories than the dog needed, and WSAVA puts the
 * spread in an individual animal's requirement at ±50% for cats.
 */

import type { Species } from '../types';

export type FoodForm = 'dry' | 'wet' | 'treat' | 'unknown';

export interface DensityBand {
  low: number;
  high: number;
  lowSource: string;
  highSource: string;
  url: string;
}

/** kcal ME per kg, as fed. Both edges are published figures — see above. */
export const DENSITY: Record<'dry' | 'wet', Record<Species, DensityBand>> = {
  dry: {
    dog: {
      low: 3100, high: 4000,
      lowSource: 'AAFCO Model Regulation PF9 — ceiling for a “light” dry dog food',
      highSource: 'AAFCO Dog Food Nutrient Profiles — “Presumes a caloric density of 4000 kcal ME/kg”',
      url: 'https://www.aafco.org/wp-content/uploads/2023/04/9._FINAL_PFC_MBRC_for_Pet_Food_and_Specialty_Pet_Food.pdf',
    },
    cat: {
      low: 3250, high: 4000,
      lowSource: 'AAFCO Model Regulation PF9 — ceiling for a “light” dry cat food',
      highSource: 'AAFCO Cat Food Nutrient Profiles — presumed caloric density',
      url: 'https://www.aafco.org/wp-content/uploads/2023/04/9._FINAL_PFC_MBRC_for_Pet_Food_and_Specialty_Pet_Food.pdf',
    },
  },
  wet: {
    dog: {
      low: 900, high: 1198,
      lowSource: 'AAFCO Model Regulation PF9 — ceiling for a “light” wet dog food',
      highSource: 'Tufts Petfoodology worked example for a canned food, 1,198 kcal/kg as fed',
      url: 'https://www.aafco.org/wp-content/uploads/2023/04/9._FINAL_PFC_MBRC_for_Pet_Food_and_Specialty_Pet_Food.pdf',
    },
    cat: {
      low: 950, high: 1198,
      lowSource: 'AAFCO Model Regulation PF9 — ceiling for a “light” wet cat food',
      highSource: 'Tufts Petfoodology worked example for a canned food, 1,198 kcal/kg as fed',
      url: 'https://www.aafco.org/wp-content/uploads/2023/04/9._FINAL_PFC_MBRC_for_Pet_Food_and_Specialty_Pet_Food.pdf',
    },
  },
};

/** The sentence the UI prints under an estimated portion. */
export const ESTIMATE_CAVEAT =
  'Estimated: this listing doesn’t publish calories per kilogram, so the range assumes a published density band. Your pack’s own feeding guide is the number that counts — real foods vary, and an individual animal’s requirement can sit 50% either side of any formula (WSAVA).';

/** Dry, wet or a treat, read off the product's own words. */
export function foodForm(name: string, subcategory: string, category: string): FoodForm {
  const hay = `${name} ${subcategory} ${category}`.toLowerCase();
  if (/treat|chew|biscuit|jerky|stick|topper|broth/.test(hay)) return 'treat';
  if (/wet|gravy|pouch|can\b|canned|loaf|pate|paté|chunks in|jelly/.test(hay)) return 'wet';
  if (/dry|kibble/.test(hay)) return 'dry';
  return 'unknown';
}
