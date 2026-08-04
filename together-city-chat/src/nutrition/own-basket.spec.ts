import { NutritionService } from './nutrition.service';

/**
 * A DAY YOU BUILT YOURSELF HAS TO REACH THE BASKET.
 *
 * The grocery list read the composed plan and only the composed plan. So a
 * citizen who assembled Tuesday out of their own recipes, locked it, and opened
 * the grocery list found nothing there — while the button they had just pressed
 * said "Lock this day & add to grocery list". The button was telling the truth
 * about the lock and not about the shopping.
 *
 * These tests are about the SOURCE, not the aggregation: that the locked own
 * days are handed to groceryPlan in the same shape the composed plan is, so
 * both go through one set of canonical names, merged units, aisles and pantry
 * offsets. A second way to turn meals into a basket is how the two drift.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const RECIPE = (id: string, name: string, ings: Array<[string, number]>) => ({
  id, name, role: 'main', categories: ['lunch'], grams: 300,
  kcal: 400, protein: 20, carbs: 50, fat: 10, fiber: 6,
  nutrients: { sodiumMg: 300, potassiumMg: 400, phosphorusMg: 200, sugarG: 3, addedSugarG: 0, satFatG: 2 },
  nutrientComplete: true, steps: [], imageUrl: null, cuisine: 'north indian', diet: 'veg', minutes: 25,
  ingredients: ings.map(([name, grams]) => ({ name, grams })),
});

function build(extras: Record<string, unknown> = {}, pool = [
  RECIPE('r1', 'Rajma Masala', [['Rajma', 120], ['Onion', 80], ['Salt', 2]]),
  RECIPE('r2', 'Jeera Rice', [['Basmati Rice', 90], ['Cumin', 3]]),
]) {
  const s: any = Object.create(NutritionService.prototype);
  s.prisma = { foodPref: { findUnique: async () => ({ extras: JSON.stringify(extras) }) } };
  s.today = async () => '2026-08-04';
  s.poolFor = async () => pool;
  return s;
}

describe('the days a citizen built are a shopping source', () => {
  it('hands over every dish on a locked day, at one portion', async () => {
    const s = build({
      planStartDate: '2026-08-01',
      ownDays: { '3': [{ slot: 'l', recipeId: 'r1' }, { slot: 'l', recipeId: 'r2' }] },
      ownLocks: [3],
    });
    const out = await s.ownMealsForShopping('u1');
    expect(out.dayCount).toBe(1);
    expect(out.meals.map((m: any) => m.recipeName).sort()).toEqual(['Jeera Rice', 'Rajma Masala']);
    // Day 3 of a plan that started on the 1st is the 4th.
    expect(new Set(out.meals.map((m: any) => m.dayISO))).toEqual(new Set(['2026-08-04']));
    const rajma = out.meals.find((m: any) => m.recipeName === 'Rajma Masala');
    expect(rajma.ingredients).toEqual([{ name: 'Rajma', grams: 120 }, { name: 'Onion', grams: 80 }]);
  });

  it('drops salt and anything to-taste, exactly as the composed source does', async () => {
    const s = build({
      planStartDate: '2026-08-01',
      ownDays: { '3': [{ slot: 'l', recipeId: 'r1' }] },
      ownLocks: [3],
    });
    const out = await s.ownMealsForShopping('u1');
    expect(JSON.stringify(out.meals)).not.toMatch(/Salt/);
  });

  it('buys nothing for a day that is not locked', async () => {
    // Still being assembled. Buying for it is the churn the lock rule exists to
    // stop — and it is the reason the composed source works the same way.
    const s = build({
      planStartDate: '2026-08-01',
      ownDays: { '3': [{ slot: 'l', recipeId: 'r1' }] },
      ownLocks: [],
    });
    expect(await s.ownMealsForShopping('u1')).toEqual({ dayCount: 0, meals: [] });
  });

  it('buys nothing for a lock on a day that has since been emptied', async () => {
    const s = build({ planStartDate: '2026-08-01', ownDays: {}, ownLocks: [3] });
    expect(await s.ownMealsForShopping('u1')).toEqual({ dayCount: 0, meals: [] });
  });

  it('counts each locked day once, however many dishes are on it', async () => {
    const s = build({
      planStartDate: '2026-08-01',
      ownDays: {
        '2': [{ slot: 'l', recipeId: 'r1' }, { slot: 'd', recipeId: 'r2' }],
        '3': [{ slot: 'l', recipeId: 'r2' }],
        '4': [{ slot: 'l', recipeId: 'r1' }],
      },
      ownLocks: [2, 3],
    });
    const out = await s.ownMealsForShopping('u1');
    expect(out.dayCount).toBe(2);
    expect(out.meals).toHaveLength(3);
    // Day 4 is not locked and must not have come along.
    expect(out.meals.map((m: any) => m.dayISO)).not.toContain('2026-08-05');
  });

  it('skips a dish that has left the citizen\'s pool rather than shopping for a ghost', async () => {
    const s = build({
      planStartDate: '2026-08-01',
      ownDays: { '3': [{ slot: 'l', recipeId: 'gone' }, { slot: 'l', recipeId: 'r2' }] },
      ownLocks: [3],
    });
    const out = await s.ownMealsForShopping('u1');
    expect(out.meals.map((m: any) => m.recipeName)).toEqual(['Jeera Rice']);
  });

  it('falls back to today when no plan start has been written yet', async () => {
    const s = build({ ownDays: { '0': [{ slot: 'l', recipeId: 'r2' }] }, ownLocks: [0] });
    const out = await s.ownMealsForShopping('u1');
    expect(out.meals[0].dayISO).toBe('2026-08-04');
  });
});
