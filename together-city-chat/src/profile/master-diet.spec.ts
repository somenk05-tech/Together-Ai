import { mergeShared, propagationPlan, type SharedFields } from './master-profile.service';
import { dietKeyFrom, dietLabel } from '../shared/diet';

/**
 * E.19's first field, and the pattern the rest of them need.
 *
 * "Ask once" is not a matter of adding a column. Both fields that landed before
 * this one — `foodAllergens` and `activityLevel` — needed a canonicaliser
 * written FIRST (`canonicaliseDeclared`, `nearestActivityLevel`), because the
 * two hubs asking the question stored different words for the same answer.
 * Diet is the same shape: Nutrition stores keys the meal engine branches on,
 * Dating stores the label the citizen picked from a lookup.
 *
 * Three things have to hold, and each of them has already gone wrong once
 * somewhere else in this codebase:
 *
 * 1. ONE WRITE-OWNER. `syncShared()` overwrites any non-undefined field handed
 *    to it — that is how Beauty destroyed a non-binary citizen's
 *    `genderIdentity` on a skin-type save (d7b0d43).
 * 2. A DEFAULT IS NOT AN ANSWER. `FoodPref.diet` is NOT NULL, defaulting to
 *    'everything' at registration. Consolidating that would tell the engine
 *    every silent citizen eats everything — the p7 defect, arriving through the
 *    consolidation door.
 * 3. ONE VOCABULARY AT THE BOUNDARY. Comparing a key with a label is the
 *    `beautyGender` bug: a value that looks right and never matches.
 */
describe('diet joins the Master Profile', () => {
  it('names Nutrition as the write-owner in the propagation, not just in a comment', () => {
    // Master -> FoodPref carries the KEY. A label reaching that column would be
    // a second vocabulary inside the engine's own field.
    expect(propagationPlan({ dietaryPreference: 'veg' }).food).toEqual({ diet: 'veg' });
    expect(propagationPlan({ dietaryPreference: 'Vegetarian' }).food).toEqual({ diet: 'veg' });
  });

  it('propagates nothing when the citizen has not answered', () => {
    expect(propagationPlan({}).food).toEqual({});
    // And a value nobody can read is not propagated as a guess.
    expect(propagationPlan({ dietaryPreference: 'tallish' }).food).toEqual({});
  });

  it('lets Nutrition outrank Dating, which is the wrong way round for every other field', () => {
    // mergeShared takes the first source that has a value. Nutrition's source
    // is placed ABOVE dating's for this field alone, in master-profile.service,
    // because the key decides what somebody is served. This test pins the
    // consequence rather than the arrangement.
    const fromNutrition: Partial<SharedFields> = { dietaryPreference: 'jain' };
    const fromDating: Partial<SharedFields> = { dietaryPreference: dietKeyFrom('Non-vegetarian') };
    expect(mergeShared({}, fromNutrition, fromDating).dietaryPreference).toBe('jain');
  });

  it('still lets Dating fill an empty column, so nobody is asked twice', () => {
    const fromDating: Partial<SharedFields> = { dietaryPreference: dietKeyFrom('Eggetarian') };
    expect(mergeShared({}, {}, fromDating).dietaryPreference).toBe('egg');
  });

  it('keeps the master row authoritative once it holds an answer', () => {
    expect(mergeShared({ dietaryPreference: 'vegan' }, { dietaryPreference: 'nonveg' }).dietaryPreference)
      .toBe('vegan');
  });

  it('shows Dating a label, never a key', () => {
    // What the dating prefill puts in front of the citizen. 'veg' in that box
    // would be the app talking to itself.
    expect(dietLabel('veg')).toBe('Vegetarian');
    expect(dietLabel('egg')).toBe('Eggetarian');
    expect(dietLabel(undefined)).toBeUndefined();
  });
});
