import { NutritionService } from './nutrition.service';

/**
 * Locking a day. (Planner redesign.)
 *
 * "Decide once, then shop and cook" is a different mode from "browse until it
 * looks right", and the planner only ever supported the second. A locked day
 * stops moving, and its shopping joins the basket — the grocery half is the
 * point, not a side effect: locking IS the moment a plan becomes a shopping
 * trip, and making somebody press a second button to say so is the app failing
 * to notice what they just decided.
 *
 * THE LOCK IS SERVER-SIDE. A lock the client remembers vanishes on another
 * device and forgets itself on reload while still drawing a padlock, which is
 * the exact shape of the four placebo switches deleted on 1 Aug.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function build(extras: Record<string, unknown> = {}) {
  const s: any = Object.create(NutritionService.prototype);
  const saved: Record<string, unknown>[] = [];
  const groceryCalls: unknown[][] = [];
  s.prisma = { foodPref: { findUnique: async () => ({ extras: JSON.stringify(extras) }) } };
  s.mergeExtras = async (_u: string, patch: Record<string, unknown>) => {
    saved.push(patch);
    Object.assign(extras, patch);
  };
  s.composedPlan = async () => ({ planStartDate: '2026-08-01', planDays: 21, days: [] });
  s.groceryPlan = async (...args: unknown[]) => { groceryCalls.push(args); return { aisles: [] }; };
  return { s, saved, groceryCalls, extras };
}

describe('what a lock does', () => {
  it('records the day, and rebuilds the basket from the locks', async () => {
    const { s, saved, groceryCalls } = build();
    const out = await s.lockComposedDay('u1', 2, 'individual');
    expect(out.locked).toBe(true);
    expect(saved[0]).toEqual({ composedLocks: [2], composedLockModes: { 2: 'preferred' } });
    // NO window and no date: groceryPlan reads composedLocks itself. Passing a
    // single day would double-count one locked twice and could not express a
    // day being taken back out.
    expect(groceryCalls[0]).toEqual(['u1', 'individual']);
    expect(out.groceryAdded).toBe(true);
  });

  it('says where to go next, skipping days already locked', async () => {
    const { s } = build({ composedLocks: [3, 4] });
    const out = await s.lockComposedDay('u1', 2);
    expect(out.nextDay).toBe(5);
  });

  it('has nowhere to go at the end of the plan', async () => {
    const { s } = build();
    const out = await s.lockComposedDay('u1', 20);   // planDays = 21
    expect(out.nextDay).toBeNull();
  });

  it('remembers which plan model was showing when the lock was pressed', async () => {
    // Two real menus exist for every day. A lock made from the Optimal Health
    // tab is a decision about THAT menu, and the basket shops it — recording
    // only the day is how somebody who accepted the Optimal Friday ends up
    // buying the Preferences Friday's food.
    const { s, saved } = build({ composedLocks: [1], composedLockModes: { 1: 'preferred' } });
    await s.lockComposedDay('u1', 2, 'individual', 'optimal');
    expect(saved[0]).toEqual({
      composedLocks: [1, 2],
      composedLockModes: { 1: 'preferred', 2: 'optimal' },
    });
  });

  it('a basket that fails does not fail the lock', async () => {
    // A citizen who locked Tuesday and got an error has a locked Tuesday and no
    // idea whether it worked. They can regenerate the list from Grocery.
    const { s, extras } = build();
    s.groceryPlan = async () => { throw new Error('db down'); };
    const out = await s.lockComposedDay('u1', 1);
    expect(out.locked).toBe(true);
    expect(out.groceryAdded).toBe(false);
    expect(extras.composedLocks).toEqual([1]);
  });
});

describe('what a locked day refuses', () => {
  const mutations: Array<[string, (s: any) => Promise<unknown>]> = [
    ['refresh a meal', (s) => s.refreshComposedMeal('u1', 1, 'l')],
    ['skip a meal', (s) => s.skipComposedMeal('u1', 1, 'l', true)],
    ['refresh one dish', (s) => s.refreshComposedComponent('u1', 1, 'l', 'main')],
    ['skip one dish', (s) => s.skipComposedComponent('u1', 1, 'l', 'main', true)],
    ['pin a recipe', (s) => s.pinComposedMeal('u1', 1, 'l', 'r1')],
  ];

  it.each(mutations)('refuses to %s, and names the way out', async (_label, run) => {
    const { s } = build({ composedLocks: [1] });
    await expect(run(s)).rejects.toThrow(/locked/i);
    await expect(run(s)).rejects.toThrow(/[Uu]nlock/);
  });

  it('leaves other days alone', async () => {
    const { s, extras } = build({ composedLocks: [1] });
    // Day 2 is not locked, so the guard must let it through to the real work.
    await expect(s.skipComposedMeal('u1', 2, 'l', true)).resolves.toBeTruthy();
    expect(extras.composedSkips).toEqual(['d2:l']);
  });
});

describe('unlocking', () => {
  it('reopens the day and rebuilds the basket without it', async () => {
    const { s, saved, groceryCalls } = build({ composedLocks: [1, 2] });
    const out = await s.unlockComposedDay('u1', 1);
    expect(out.locked).toBe(false);
    expect(saved[0]).toEqual({ composedLocks: [2], composedLockModes: {} });
    // The basket follows the locks in BOTH directions, or it is not following
    // them. What protects the citizen here is mergeGroceryList, not skipping
    // the rebuild: a ticked line has been bought and is kept, and a manual
    // line was never the planner's to remove. See grocery-merge.spec.ts.
    expect(groceryCalls).toEqual([['u1', 'individual']]);
  });
});

describe('the stored value is user-editable JSON, so it is never trusted', () => {
  it('survives rubbish in the blob', () => {
    const { s } = build();
    expect(s.lockedDays({ composedLocks: 'nope' })).toEqual([]);
    expect(s.lockedDays({ composedLocks: [3, 'x', -1, 1.5, 1, 1, 0] })).toEqual([0, 1, 3]);
    expect(s.lockedDays({})).toEqual([]);
  });

  it('the model map is sanitised the same way', () => {
    const { s } = build();
    expect(s.lockPlanModes({})).toEqual({});
    expect(s.lockPlanModes({ composedLockModes: 'nope' })).toEqual({});
    expect(s.lockPlanModes({ composedLockModes: ['optimal'] })).toEqual({});
    expect(s.lockPlanModes({ composedLockModes: { 1: 'optimal', 2: 'preferred', x: 'optimal', '-1': 'optimal', 3: 'keto' } }))
      .toEqual({ 1: 'optimal', 2: 'preferred' });
  });
});

function buildGrocery(extras: Record<string, unknown>) {
  const s: any = Object.create(NutritionService.prototype);
  const calls: Array<{ days: readonly number[] | undefined; planMode: string }> = [];
  const saved: Record<string, unknown>[] = [];
  s.prisma = { foodPref: { findUnique: async () => ({ extras: JSON.stringify(extras) }) } };
  s.mergeExtras = async (_u: string, patch: Record<string, unknown>) => { saved.push(patch); };
  s.resolveStartDate = async () => '2026-08-13';
  s.ownMealsForShopping = async () => ({ dayCount: 0, meals: [] });
  s.householdRaw = async () => [];   // family scale block runs before the early return
  // The aisle pipeline below the split needs these two to be quiet.
  s.syncGroceryList = async () => new Map();
  // `pantry` is a prototype GETTER, so plain assignment throws — shadow it.
  Object.defineProperty(s, 'pantry', { value: { findMany: async () => [] } });
  s.composedMealsForShopping = async (
    _u: string, _w: number, _f?: string, _h?: boolean,
    dayIndexes?: readonly number[], planMode: string = 'preferred',
  ) => {
    calls.push({ days: dayIndexes, planMode });
    return { dayCount: dayIndexes?.length ?? 0, meals: [] };
  };
  return { s, calls, saved };
}

describe('the basket shops each locked day in the model it was locked in', () => {
  // groceryPlan is stubbed down to its split: what matters here is WHICH days
  // it hands to WHICH composition, not the aisles arithmetic below them.

  it('splits mixed locks into one composition per model, merged into one basket', async () => {
    const { s, calls } = buildGrocery({ composedLocks: [1, 2, 5], composedLockModes: { 2: 'optimal' } });
    await s.groceryPlan('u1', 'individual');
    expect(calls).toEqual([
      { days: [1, 5], planMode: 'preferred' },
      { days: [2], planMode: 'optimal' },
    ]);
  });

  it('a lock with no recorded model shops My Preferences', async () => {
    // Every lock that predates the model map was made when the basket only
    // knew how to shop the preferences plan; absent must mean exactly that.
    const { s, calls } = buildGrocery({ composedLocks: [3] });
    await s.groceryPlan('u1', 'individual');
    expect(calls).toEqual([{ days: [3], planMode: 'preferred' }]);
  });

  it('all-optimal locks never compose the preferences plan', async () => {
    const { s, calls } = buildGrocery({ composedLocks: [0, 4], composedLockModes: { 0: 'optimal', 4: 'optimal' } });
    await s.groceryPlan('u1', 'family');
    expect(calls).toEqual([{ days: [0, 4], planMode: 'optimal' }]);
  });
});

describe('how many people the menu is for', () => {
  const oneMeal = {
    dayCount: 1,
    meals: [{ slot: 'l', recipeName: 'Toor Dal', dayISO: '2026-08-13', ingredients: [{ name: 'toor dal', grams: 100 }] }],
  };

  it('an individual basket cooking for three buys three portions, and says so', async () => {
    const { s, saved } = buildGrocery({ composedLocks: [0] });
    s.composedMealsForShopping = async () => oneMeal;
    const out = await s.groceryPlan('u1', 'individual', 7, undefined, 3);
    const item = out.aisles.flatMap((a: any) => a.items).find((i: any) => /dal/i.test(String(i.name)));
    expect(item.grams).toBe(300);
    expect(out.summary.people).toBe(3);
    expect(out.summary.peopleBasis).toBe('chosen');
    // …and the count persists, so the list means the same thing tomorrow.
    expect(saved).toEqual([{ groceryPeople: 3 }]);
  });

  it('reads the saved count back when none is asked for', async () => {
    const { s, saved } = buildGrocery({ composedLocks: [0], groceryPeople: 2 });
    s.composedMealsForShopping = async () => oneMeal;
    const out = await s.groceryPlan('u1', 'individual');
    const item = out.aisles.flatMap((a: any) => a.items).find((i: any) => /dal/i.test(String(i.name)));
    expect(item.grams).toBe(200);
    expect(out.summary.people).toBe(2);
    expect(saved).toEqual([]);   // nothing asked, nothing rewritten
  });

  it('family ignores the chosen count — its scale is per-member, not a headcount', async () => {
    const { s, saved } = buildGrocery({ composedLocks: [0] });
    s.composedMealsForShopping = async () => oneMeal;
    const out = await s.groceryPlan('u1', 'family', 7, undefined, 5);
    const item = out.aisles.flatMap((a: any) => a.items).find((i: any) => /dal/i.test(String(i.name)));
    expect(item.grams).toBe(100);            // householdRaw is empty → scale 1
    expect(out.summary.peopleBasis).toBe('household');
    expect(saved).toEqual([]);               // a family visit never rewrites the personal count
  });

  it('the stored count is clamped, not trusted', async () => {
    const { s } = buildGrocery({ composedLocks: [0], groceryPeople: 500 });
    s.composedMealsForShopping = async () => oneMeal;
    const out = await s.groceryPlan('u1', 'individual');
    expect(out.summary.people).toBe(12);
  });
});
