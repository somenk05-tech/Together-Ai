import { composeWeek, resolveDayDiets, type PoolRecipe, type Diet } from './meal-composer';

/**
 * A VEG DAY IS A VEG DAY.
 *
 * Live on the owner's account, 4 Aug 2026: Weekly Planning showed Tuesday and
 * Saturday as Veg, and Tuesday's lunch was a curry containing 227 g of chicken.
 *
 * Nothing was broken in the sense of throwing. `ex.weekly` had exactly one
 * consumer — medical-recs.ts, which counts veg days to score a recommendation —
 * and the composer, which decides the food, took a single `diet` for the whole
 * week and had never been told the map existed. The control was collected and
 * ignored: the same shape as the grocery `days`/`startDate` parameters and the
 * planner's `ready` flag, and the third time this month.
 */

function recipe(id: string, diet: Diet, protein: string): PoolRecipe {
  return {
    id, name: `${protein} ${id}`, cuisine: 'India',
    categories: ['lunch', 'dinner', 'breakfast', 'snack'], role: 'main',
    kcal: 320, protein: 14, carbs: 32, fat: 10, fiber: 5, minutes: 25, grams: 220, diet,
    ingredients: [{ name: protein, grams: 100 }, { name: 'Onion', grams: 40 }],
    nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
    nutrientComplete: true, steps: [], imageUrl: null,
  } as PoolRecipe;
}

const TARGETS = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
const POOL: PoolRecipe[] = [];
for (let i = 0; i < 30; i++) POOL.push(recipe(`ch${i}`, 'nonveg', 'Chicken'));
for (let i = 0; i < 30; i++) POOL.push(recipe(`pn${i}`, 'vegetarian', 'Paneer'));
for (let i = 0; i < 30; i++) POOL.push(recipe(`eg${i}`, 'eggetarian', 'Egg'));

/** 1 Aug 2026 is a Saturday, so day 0 = Sat, day 1 = Sun, day 3 = Tue. */
const START = '2026-08-01';
const ALL_NONVEG = { Mon: 'nonveg', Tue: 'nonveg', Wed: 'nonveg', Thu: 'nonveg', Fri: 'nonveg', Sat: 'nonveg', Sun: 'nonveg' } as const;

const dietsOn = (wk: ReturnType<typeof composeWeek>, dayIndex: number) =>
  wk.days[dayIndex].meals.flatMap((m) => m.components).map((c) => c.diet);
const namesOn = (wk: ReturnType<typeof composeWeek>, dayIndex: number) =>
  wk.days[dayIndex].meals.flatMap((m) => m.components).map((c) => c.name.toLowerCase());

describe('resolveDayDiets — the calendar half', () => {
  it('maps a weekday marked veg onto the right day index', () => {
    const out = resolveDayDiets('nonveg', { ...ALL_NONVEG, Tue: 'veg' }, START, 7);
    // Sat Sun Mon Tue Wed Thu Fri
    expect(out).toEqual(['nonveg', 'nonveg', 'nonveg', 'vegetarian', 'nonveg', 'nonveg', 'nonveg']);
  });

  it('repeats across a plan longer than a week', () => {
    const out = resolveDayDiets('nonveg', { ...ALL_NONVEG, Sat: 'veg' }, START, 21);
    expect(out).toHaveLength(21);
    expect(out?.filter((d) => d === 'vegetarian')).toHaveLength(3);   // three Saturdays
    expect(out?.[0]).toBe('vegetarian');
  });

  it('never loosens a diet that is already veg', () => {
    // The page forces all-veg when the diet is vegetarian, but an older saved
    // map can still hold 'nonveg' — and a control the citizen cannot even see
    // must not put meat on their plate.
    expect(resolveDayDiets('vegetarian', ALL_NONVEG, START, 7)).toBeUndefined();
    expect(resolveDayDiets('vegan', ALL_NONVEG, START, 7)).toBeUndefined();
  });

  it('leaves an egg diet alone, though the page writes all-veg for it', () => {
    // VEG_DIETS on the preferences page includes 'egg', so an egg-eater's weekly
    // map is written as seven veg days by a control they cannot touch. Reading
    // that literally would delete eggs from their entire plan.
    const all = { Mon: 'veg', Tue: 'veg', Wed: 'veg', Thu: 'veg', Fri: 'veg', Sat: 'veg', Sun: 'veg' } as const;
    expect(resolveDayDiets('eggetarian', all, START, 7)).toBeUndefined();
  });

  it('says nothing when there is nothing to say', () => {
    expect(resolveDayDiets('nonveg', ALL_NONVEG, START, 7)).toBeUndefined();   // no veg day
    expect(resolveDayDiets('nonveg', undefined, START, 7)).toBeUndefined();
    expect(resolveDayDiets('nonveg', { Tue: 'veg' }, '', 7)).toBeUndefined();          // no start date
    expect(resolveDayDiets('nonveg', { Tue: 'veg' }, 'not-a-date', 7)).toBeUndefined();
  });
});

describe('the composer serves no meat on a veg day', () => {
  const prefs = {
    diet: 'nonveg' as Diet,
    dayDiets: resolveDayDiets('nonveg', { ...ALL_NONVEG, Tue: 'veg' }, START, 7),
  };

  it('Tuesday carries no non-vegetarian dish', () => {
    const wk = composeWeek(TARGETS, prefs, 7, 42, POOL);
    // day 3 is Tuesday for a plan starting Sat 1 Aug
    expect(dietsOn(wk, 3).filter((d) => d === 'nonveg')).toEqual([]);
    expect(namesOn(wk, 3).filter((n) => /chicken/.test(n))).toEqual([]);
    expect(namesOn(wk, 3).length).toBeGreaterThan(0);      // and it still built a day
  });

  it('the other days are untouched — this narrows one day, not the week', () => {
    const wk = composeWeek(TARGETS, prefs, 7, 42, POOL);
    const elsewhere = [0, 1, 2, 4, 5, 6].flatMap((d) => dietsOn(wk, d));
    expect(elsewhere).toContain('nonveg');
  });

  it('a veg day is veg in the clinically optimal plan too', () => {
    // Optimal Health drops the citizen's protein-source and cook-time nudges
    // because health leads. A fast is not a nudge.
    const wk = composeWeek(TARGETS, { ...prefs, clinical: true, favourites: undefined }, 7, 42, POOL);
    expect(dietsOn(wk, 3).filter((d) => d === 'nonveg')).toEqual([]);
  });

  it('without the map the week is unchanged — nothing here is on by default', () => {
    const wk = composeWeek(TARGETS, { diet: 'nonveg' }, 7, 42, POOL);
    const all = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => dietsOn(wk, d));
    expect(all).toContain('nonveg');
  });

  it('a day that matches the base diet is composed identically', () => {
    // The per-day prefs object is only cloned when the diet actually differs, so
    // an all-nonveg week must be byte-for-byte the week it was before this.
    const withMap = composeWeek(TARGETS, {
      diet: 'nonveg', dayDiets: resolveDayDiets('nonveg', { ...ALL_NONVEG, Tue: 'veg' }, START, 7),
    }, 7, 42, POOL);
    const plain = composeWeek(TARGETS, { diet: 'nonveg' }, 7, 42, POOL);
    expect(namesOn(withMap, 0)).toEqual(namesOn(plain, 0));   // Saturday: nonveg in both
  });
});
