import { dietKeyFrom, dietLabel } from './diet';
import { FORBIDDEN_BY_DIET } from '../nutrition/diet-tags';

/**
 * One vocabulary for a question two hubs ask.
 *
 * The point of these tests is not that a map maps. It is that the crossing is
 * TOTAL in both directions and that every value it loses is named — the two
 * things §15.1 and the `beautyGender` bug were both missing.
 */

/** The diets a citizen can actually pick in the Nutrition form. */
const NUTRITION_FORM_KEYS = ['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain'];
/** The labels the dating form offers, from lookups (`diet` category). */
const DATING_LABELS = ['Vegetarian', 'Non-vegetarian', 'Vegan', 'Eggetarian', 'Jain', 'Pescatarian'];

describe('the diet crossing', () => {
  it('gives every Nutrition answer a label', () => {
    for (const key of NUTRITION_FORM_KEYS) expect(dietLabel(key)).toBeDefined();
  });

  it('gives every dating answer a key', () => {
    for (const label of DATING_LABELS) expect(dietKeyFrom(label)).toBeDefined();
  });

  it('lands every key on a diet the engine actually knows', () => {
    // The other half of "total": a key this file invents would pass the two
    // tests above and then fail in FORBIDDEN_BY_DIET, where it decides what
    // somebody is served.
    for (const label of DATING_LABELS) {
      const key = dietKeyFrom(label) as keyof typeof FORBIDDEN_BY_DIET;
      expect(FORBIDDEN_BY_DIET[key]).toBeDefined();
    }
  });

  it('round-trips every diet except the one whose loss is written down', () => {
    for (const key of NUTRITION_FORM_KEYS) {
      const back = dietKeyFrom(dietLabel(key));
      if (key === 'everything') {
        // NAMED LOSS: the dating list has no "everything". A round trip
        // narrows it to nonveg, which is what the engine already treats it as
        // — and narrowing once is safe in a way that widening never is.
        expect(back).toBe('nonveg');
      } else {
        expect(back).toBe(key);
      }
    }
  });

  it('reads the spellings both hubs have actually stored', () => {
    expect(dietKeyFrom('Non-vegetarian')).toBe('nonveg');
    expect(dietKeyFrom('non-veg')).toBe('nonveg');
    expect(dietKeyFrom('NONVEG')).toBe('nonveg');
    expect(dietKeyFrom(' Eggetarian ')).toBe('egg');
    expect(dietKeyFrom('vegetarian')).toBe('veg');
    expect(dietLabel('jainvegan')).toBe('Jain');   // named loss: the vegan half
  });

  it('refuses to guess, and refuses to default', () => {
    // A hard filter fed a guess removes strangers; a meal engine fed a guess
    // serves somebody something they said they do not eat.
    expect(dietKeyFrom('tallish')).toBeUndefined();
    expect(dietKeyFrom('')).toBeUndefined();
    expect(dietKeyFrom(null)).toBeUndefined();
    expect(dietKeyFrom(undefined)).toBeUndefined();
    expect(dietKeyFrom('vegetarian-ish')).toBeUndefined();
    expect(dietLabel('carnivore')).toBeUndefined();
    // Silence is not "everything". FoodPref.diet defaults to 'everything' at
    // registration, and that default reads exactly like an answer — the reason
    // the consolidation checks answeredAt.
    expect(dietKeyFrom(' ')).toBeUndefined();
  });
});
