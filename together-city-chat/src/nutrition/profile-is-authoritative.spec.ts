import { composeWeek, type PoolRecipe } from './meal-composer';

/**
 * THE FOOD PREFERENCE PROFILE IS AUTHORITATIVE — CUISINE AND PROTEIN.
 *
 * Both of these were live on the owner's own account on 4 Aug 2026, on a profile
 * reading *Cuisine Indian 100%* and *Protein sources: Chicken, Egg, Fish,
 * Prawns, Mutton, Paneer, Cheese, Curd, Milk*:
 *
 *   · the plan's own preference-match admitted "38/59 mains in your cuisines
 *     (64%)", and the basket carried teriyaki, jerk seasoning, galangal, Thai
 *     red curry paste and parmesan;
 *   · the same basket bought beef 128 g, pork 76 g and bacon 104 g.
 *
 * Neither was invented — both were faithfully composed. They were the profile
 * being read as a lean rather than a statement. The fixtures below are that
 * profile, and the assertions are that it now holds.
 */

function recipe(id: string, cuisine: string, protein: string, role = 'main'): PoolRecipe {
  return {
    id, name: `${protein} ${cuisine} ${id}`, cuisine, categories: ['lunch', 'dinner', 'breakfast', 'snack'],
    role, kcal: 320, protein: 14, carbs: 32, fat: 10, fiber: 5, minutes: 25, grams: 220, diet: 'nonveg',
    ingredients: [{ name: protein, grams: 100 }, { name: 'Onion', grams: 40 }],
    nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
    nutrientComplete: true, steps: [], imageUrl: null,
  } as PoolRecipe;
}

const TARGETS = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
const INDIAN_100 = { breakfast: { Indian: 100 }, lunch: { Indian: 100 }, dinner: { Indian: 100 }, snack: { Indian: 100 } };
/** The owner's list, verbatim. Note what is NOT on it. */
const CHOSEN = ['Chicken', 'Egg', 'Fish', 'Prawns', 'Mutton', 'Paneer', 'Cheese', 'Curd', 'Milk'];

const componentsOf = (wk: ReturnType<typeof composeWeek>) =>
  wk.days.flatMap((d) => d.meals.flatMap((m) => m.components));

/**
 * Only the dishes that came from the FIXTURE pool.
 *
 * composeWeek also draws on its built-in component library (SEED_POOL — dals,
 * vegetables, carbs, salads, curd), which a fixture cannot and should not
 * replace: a plate needs those roles and the library is where they live. Those
 * seeds are India and Global, so they are never the thing under test here.
 * Asserting over every component would only ever be asserting about the seeds.
 */
const fromPool = (wk: ReturnType<typeof composeWeek>, prefixes: string[]) =>
  componentsOf(wk).filter((c) => prefixes.some((p) => c.recipeId.startsWith(p)));

describe('the profile is authoritative — cuisine', () => {
  /** A pool where the out-of-cuisine dishes outnumber the Indian ones 3:1. */
  const mixedPool: PoolRecipe[] = [];
  for (let i = 0; i < 40; i++) mixedPool.push(recipe(`in${i}`, 'India', 'Chicken'));
  for (let i = 0; i < 40; i++) mixedPool.push(recipe(`th${i}`, 'Thailand', 'Chicken'));
  for (let i = 0; i < 40; i++) mixedPool.push(recipe(`it${i}`, 'Italy', 'Chicken'));
  for (let i = 0; i < 40; i++) mixedPool.push(recipe(`gl${i}`, 'Global', 'Chicken'));

  it('serves nothing outside a 100% single-cuisine mix', () => {
    const wk = composeWeek(TARGETS, { diet: 'nonveg', cuisineBySlot: INDIAN_100 }, 7, 42, mixedPool);
    // Thailand and Italy are named rival cuisines set to zero. They must be gone.
    expect(fromPool(wk, ['th', 'it']).map((c) => c.name)).toEqual([]);
    // and the Indian food from the pool did get used, so this is not an
    // empty-plan pass
    expect(fromPool(wk, ['in']).length).toBeGreaterThan(0);
  });

  it('still admits every cuisine the citizen gave weight to', () => {
    // A mix is only ever exclusive about what was set to nothing. Indian 60 /
    // Italian 40 is two cuisines, and both must survive.
    const both = { breakfast: { Indian: 60, Italian: 40 }, lunch: { Indian: 60, Italian: 40 },
      dinner: { Indian: 60, Italian: 40 }, snack: { Indian: 60, Italian: 40 } };
    const wk = composeWeek(TARGETS, { diet: 'nonveg', cuisineBySlot: both }, 7, 42, mixedPool);
    // Thailand was given nothing, so it is gone.
    expect(fromPool(wk, ['th']).map((c) => c.name)).toEqual([]);
    // Italy was given 40, so it is ELIGIBLE — which is the rule. Whether it is
    // picked on any given week is a weight, not a guarantee, and asserting that
    // it appears would be asserting about the random draw. Eligibility is shown
    // by giving Italy the whole mix and watching it fill the plate.
    const italianOnly = { breakfast: { Italian: 100 }, lunch: { Italian: 100 },
      dinner: { Italian: 100 }, snack: { Italian: 100 } };
    const wkIt = composeWeek(TARGETS, { diet: 'nonveg', cuisineBySlot: italianOnly }, 7, 42, mixedPool);
    expect(fromPool(wkIt, ['it']).length).toBeGreaterThan(0);
    expect(fromPool(wkIt, ['in', 'th']).map((c) => c.name)).toEqual([]);
  });

  it('does not strand a slot it cannot fill in-cuisine', () => {
    // The strict pass is an attempt, not a cliff: with no Indian food at all the
    // composer must still return a week rather than an empty plate.
    const noIndian = mixedPool.filter((r) => !r.id.startsWith('in'));
    const wk = composeWeek(TARGETS, { diet: 'nonveg', cuisineBySlot: INDIAN_100 }, 7, 42, noIndian);
    expect(componentsOf(wk).length).toBeGreaterThan(0);
    expect(wk.days.length).toBe(7);
  });
});

describe('the profile is authoritative — protein', () => {
  const pool: PoolRecipe[] = [];
  for (let i = 0; i < 30; i++) pool.push(recipe(`ch${i}`, 'India', 'Chicken'));
  for (let i = 0; i < 30; i++) pool.push(recipe(`bf${i}`, 'India', 'Beef'));
  for (let i = 0; i < 30; i++) pool.push(recipe(`pk${i}`, 'India', 'Pork'));
  for (let i = 0; i < 30; i++) pool.push(recipe(`bc${i}`, 'India', 'Bacon'));

  it('never serves beef or pork to a profile that did not choose them', () => {
    const wk = composeWeek(
      TARGETS, { diet: 'nonveg', cuisineBySlot: INDIAN_100, favourites: CHOSEN }, 7, 42, pool,
    );
    const names = componentsOf(wk).map((c) => c.name.toLowerCase());
    expect(names.filter((n) => /beef|pork|bacon/.test(n))).toEqual([]);
    // and it did not simply fail to build
    expect(names.length).toBeGreaterThan(0);
  });

  it('serves them the moment they ARE chosen', () => {
    // This is opt-in, not prohibition. A citizen who lists beef gets beef.
    const wk = composeWeek(
      TARGETS,
      { diet: 'nonveg', cuisineBySlot: INDIAN_100, favourites: [...CHOSEN, 'Beef', 'Pork'] },
      7, 42, pool,
    );
    const names = componentsOf(wk).map((c) => c.name.toLowerCase());
    expect(names.some((n) => /beef|pork|bacon/.test(n))).toBe(true);
  });

  it('holds even when the chosen proteins cannot fill the week', () => {
    // The relax path exists for cuisine and for the consecutive-day ban. It must
    // never relax this one: running out of chicken is not consent to beef.
    const beefOnly = pool.filter((r) => !r.id.startsWith('ch'));
    const wk = composeWeek(
      TARGETS, { diet: 'nonveg', cuisineBySlot: INDIAN_100, favourites: CHOSEN }, 7, 42, beefOnly,
    );
    const names = componentsOf(wk).map((c) => c.name.toLowerCase());
    expect(names.filter((n) => /beef|pork|bacon/.test(n))).toEqual([]);
  });
});
