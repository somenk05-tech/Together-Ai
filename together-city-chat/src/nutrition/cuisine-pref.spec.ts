import { composeWeek, type PoolRecipe } from './meal-composer';

/** Proof that the cuisine preference drives selection (dataset country names). */
function main(id: string, cuisine: string): PoolRecipe {
  return {
    id, name: `${cuisine} Main ${id}`, cuisine, categories: ['lunch', 'dinner'], role: 'main',
    kcal: 320, protein: 14, carbs: 32, fat: 10, fiber: 5, minutes: 25, grams: 220, diet: 'nonveg',
    ingredients: [{ name: 'Chicken', grams: 100 }, { name: 'Onion', grams: 40 }],
    nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
    nutrientComplete: true, steps: [], imageUrl: null,
  } as PoolRecipe;
}

describe('cuisine preference drives meal selection', () => {
  it('Indian-preference vs Italian-preference produce different mains', () => {
    // Pool with dataset-style country names: India + Italy.
    const pool: PoolRecipe[] = [];
    for (let i = 0; i < 30; i++) pool.push(main(`in${i}`, 'India'));
    for (let i = 0; i < 30; i++) pool.push(main(`it${i}`, 'Italy'));

    const targets = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
    const indianMix = { breakfast: { Indian: 100 }, lunch: { Indian: 100 }, dinner: { Indian: 100 }, snack: {} };
    const italianMix = { breakfast: { Italian: 100 }, lunch: { Italian: 100 }, dinner: { Italian: 100 }, snack: {} };

    const wkIndian = composeWeek(targets, { diet: 'nonveg', cuisineBySlot: indianMix }, 7, 42, pool);
    const wkItalian = composeWeek(targets, { diet: 'nonveg', cuisineBySlot: italianMix }, 7, 42, pool);

    const mainCuisines = (wk: ReturnType<typeof composeWeek>) => wk.days.flatMap((d) => d.meals.filter((m) => m.slot === 'l' || m.slot === 'd')
      .flatMap((m) => m.components.filter((c) => c.role === 'main').map((c) => c.recipeId.startsWith('in') ? 'India' : c.recipeId.startsWith('it') ? 'Italy' : '?')));

    const indianMains = mainCuisines(wkIndian);
    const italianMains = mainCuisines(wkItalian);
    const share = (arr: string[], k: string) => arr.filter((x) => x === k).length / Math.max(1, arr.length);

    // eslint-disable-next-line no-console
    console.log(`Indian-pref → India share ${(share(indianMains, 'India') * 100).toFixed(0)}%; Italian-pref → Italy share ${(share(italianMains, 'Italy') * 100).toFixed(0)}%`);

    // Changing the cuisine preference materially changes the plan (relative shift).
    expect(share(indianMains, 'India')).toBeGreaterThan(share(italianMains, 'India') + 0.3);
    expect(share(italianMains, 'Italy')).toBeGreaterThan(share(indianMains, 'Italy') + 0.3);
    expect(indianMains.join()).not.toEqual(italianMains.join());
  });
});
