import { composeWeek, type PoolRecipe, type ComposerPrefs } from './meal-composer';
import { scoreDual, guidelineCaps } from './plan-score';

/** A main dish with a controllable protein source + sodium/sat-fat load. */
function main(id: string, protein: string, cuisine: string, na: number, sfat: number): PoolRecipe {
  return {
    id, name: `${protein} ${cuisine} Main ${id}`, cuisine, categories: ['lunch', 'dinner'], role: 'main',
    kcal: 320, protein: 22, carbs: 24, fat: 12, fiber: 5, minutes: 25, grams: 220, diet: 'nonveg',
    ingredients: [{ name: protein, grams: 100 }, { name: 'Onion', grams: 40 }],
    nutrients: { sodiumMg: na, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 2, satFatG: sfat },
    nutrientComplete: true, steps: [], imageUrl: null,
  } as PoolRecipe;
}

describe('dual plan scoring — Optimal is healthier, My Preferences matches the profile', () => {
  it('optimal scores higher on health; preferred scores higher on preference match', () => {
    // Chicken mains = the user's chosen source but salty/fatty; fish mains = the
    // healthier in-diet option the Optimal plan will prefer.
    const pool: PoolRecipe[] = [];
    for (let i = 0; i < 40; i++) pool.push(main(`ch${i}`, 'Chicken', 'India', 900, 8));
    for (let i = 0; i < 40; i++) pool.push(main(`fi${i}`, 'Fish', 'India', 180, 2));

    const targets = { kcal: 2000, protein: 95, carbs: 240, fat: 60, fiber: 30 };
    const cuisine = { breakfast: { Indian: 100 }, lunch: { Indian: 100 }, dinner: { Indian: 100 }, snack: {} };
    const caps = guidelineCaps(targets.kcal);

    const preferredPrefs: ComposerPrefs = { diet: 'nonveg', cuisineBySlot: cuisine, favourites: ['chicken'] };
    const optimalPrefs: ComposerPrefs = { diet: 'nonveg', cuisineBySlot: cuisine, caps };

    const wkPreferred = composeWeek(targets, preferredPrefs, 7, 42, pool);
    const wkOptimal = composeWeek(targets, optimalPrefs, 7, 143, pool);

    const inputs = { targets, healthCaps: caps, isDiabetic: false, favourites: ['chicken'], cuisines: ['Indian'], maxMinutes: undefined };
    const sPref = scoreDual(wkPreferred.days, inputs);
    const sOpt = scoreDual(wkOptimal.days, inputs);

    // eslint-disable-next-line no-console
    console.log(`Preferred: health ${sPref.health} / preference ${sPref.preference} · Optimal: health ${sOpt.health} / preference ${sOpt.preference}`);

    // Optimal is the clinically correct plan → higher (or equal) health.
    expect(sOpt.health).toBeGreaterThanOrEqual(sPref.health);
    // My Preferences honours the chosen protein source → higher preference match.
    expect(sPref.preference).toBeGreaterThanOrEqual(sOpt.preference);
    // Both scores are valid 0–100 values.
    for (const v of [sPref.health, sPref.preference, sOpt.health, sOpt.preference]) {
      expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100);
    }
  });
});
