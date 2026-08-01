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
  it('records the day, and puts that day s shopping in the basket', async () => {
    const { s, saved, groceryCalls } = build();
    const out = await s.lockComposedDay('u1', 2, 'individual');
    expect(out.locked).toBe(true);
    expect(saved[0]).toEqual({ composedLocks: [2] });
    // Exactly one day, dated — not the whole week.
    expect(groceryCalls[0]).toEqual(['u1', 'individual', 1, '2026-08-03']);
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
  it('reopens the day and leaves the groceries alone', async () => {
    // They may already be ticked, or bought. Removing food from somebody's
    // basket because they reopened a menu is the worse surprise.
    const { s, saved, groceryCalls } = build({ composedLocks: [1, 2] });
    const out = await s.unlockComposedDay('u1', 1);
    expect(out.locked).toBe(false);
    expect(saved[0]).toEqual({ composedLocks: [2] });
    expect(groceryCalls).toHaveLength(0);
  });
});

describe('the stored value is user-editable JSON, so it is never trusted', () => {
  it('survives rubbish in the blob', () => {
    const { s } = build();
    expect(s.lockedDays({ composedLocks: 'nope' })).toEqual([]);
    expect(s.lockedDays({ composedLocks: [3, 'x', -1, 1.5, 1, 1, 0] })).toEqual([0, 1, 3]);
    expect(s.lockedDays({})).toEqual([]);
  });
});
