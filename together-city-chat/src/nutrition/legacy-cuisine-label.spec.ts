import { composeWeek, normCuisine, type PoolRecipe } from './meal-composer';

/**
 * A LABEL THE ENGINE HAS NEVER HEARD OF MUST NOT COST A CITIZEN THEIR DINNER.
 *
 * The vanilla site's preference form stored cuisines as regional slugs —
 * 'north-indian', 'south-indian' — and those strings are still in production
 * foodPref.extras rows. After P0-A made the cuisine mix authoritative, an
 * unrecognised label matched zero recipes, and the last-resort protein net
 * (which cleared only cuisineLocks, written before the mix could exclude
 * anything) did not catch it. The observed result, 9 Aug, on the most common
 * profile in this product's market: a 21-day plan with a banana smoothie for
 * dinner, a whey shake as the evening soup, and "missing a main/protein" in
 * the plan notes of every single day — HTTP 200 throughout.
 *
 * Two promises, tested separately because they fail separately:
 *   1. The vocabulary folds every label the product has ever written.
 *   2. Even a label from the FUTURE (one this file has never seen) degrades
 *      to a relaxed pick, never to a protein-less plate.
 */
function main(id: string, cuisine: string): PoolRecipe {
  return {
    id, name: `${cuisine} Main ${id}`, cuisine, categories: ['lunch', 'dinner'], role: 'main',
    kcal: 320, protein: 14, carbs: 32, fat: 10, fiber: 5, minutes: 25, grams: 220, diet: 'vegetarian',
    ingredients: [{ name: 'Paneer', grams: 100 }, { name: 'Onion', grams: 40 }],
    nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
    nutrientComplete: true, steps: [], imageUrl: null,
  } as PoolRecipe;
}

describe('legacy cuisine labels still reach the kitchen', () => {
  it('folds every regional slug the product has ever stored', () => {
    for (const legacy of ['north-indian', 'south-indian', 'North Indian', 'NORTH-INDIAN', 'north indian', 'Punjabi', 'Hyderabadi']) {
      expect({ legacy, folded: normCuisine(legacy) }).toEqual({ legacy, folded: 'Indian' });
    }
    // and folding is not flattening — real kitchens keep their names
    expect(normCuisine('Italy')).toBe('Italian');
    expect(normCuisine('thai')).toBe('Thai');
    expect(normCuisine('Global')).toBe('Global');
  });

  it('a north-indian-100% profile eats Indian mains, not Global fillers', () => {
    const pool: PoolRecipe[] = [];
    for (let i = 0; i < 30; i++) pool.push(main(`in${i}`, 'India'));
    const targets = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
    const mix = { breakfast: { 'north-indian': 100 }, lunch: { 'north-indian': 100 }, dinner: { 'north-indian': 100 }, snack: {} };
    const wk = composeWeek(targets, { diet: 'vegetarian', cuisineBySlot: mix }, 7, 42, pool);
    const protein = wk.days.flatMap((d) => d.meals.filter((m) => m.slot === 'l' || m.slot === 'd'))
      .map((m) => m.components.some((c) => c.role === 'main' || c.role === 'dal'));
    expect(protein.length).toBeGreaterThan(0);
    expect(protein.every(Boolean)).toBe(true);
  });

  it('even an unknown future label degrades to a relaxed pick, never to a protein-less plate', () => {
    const pool: PoolRecipe[] = [];
    for (let i = 0; i < 30; i++) pool.push(main(`in${i}`, 'India'));
    const targets = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
    const mix = { breakfast: { 'cuisine-nobody-wrote-yet': 100 }, lunch: { 'cuisine-nobody-wrote-yet': 100 }, dinner: { 'cuisine-nobody-wrote-yet': 100 }, snack: {} };
    const wk = composeWeek(targets, { diet: 'vegetarian', cuisineBySlot: mix }, 7, 42, pool);
    const protein = wk.days.flatMap((d) => d.meals.filter((m) => m.slot === 'l' || m.slot === 'd'))
      .map((m) => m.components.some((c) => c.role === 'main' || c.role === 'dal'));
    expect(protein.every(Boolean)).toBe(true);
  });
});
