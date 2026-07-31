import { composeWeek, SEED_POOL, type ComposerPrefs } from './meal-composer';

/**
 * A pinned dish is the citizen choosing for themselves. The composer honours it
 * only while they may still eat it — these are the tests for "still".
 *
 * The failure being guarded against is not today's. It is six months from now:
 * somebody pins a dish, then changes their diet or declares an allergy, and the
 * pin is still sitting in their profile. Re-screening at selection is what stops
 * March's choice reappearing on June's plate.
 */

const TARGETS = { kcal: 2000, protein: 100, carbs: 250, fat: 60, fiber: 30 };
const base: ComposerPrefs = { diet: 'nonveg' };

const week = (prefs: ComposerPrefs) => composeWeek(TARGETS, prefs, 3, 42, []);
const mainsOn = (w: ReturnType<typeof composeWeek>, day: number, slot: string) =>
  (w.days[day]?.meals.find((m) => m.slot === slot)?.components ?? []).map((c) => c.recipeId);

describe('a pinned dish', () => {
  it('appears in the slot it was pinned to', () => {
    const plain = week(base);
    const someMain = mainsOn(plain, 1, 'd')[0];
    // Pin day 0 lunch to a dish the composer used elsewhere, so it is certainly
    // in the pool and certainly passes this profile's filters.
    const pinned = week({ ...base, pins: { 'd0:l': someMain } });
    expect(mainsOn(pinned, 0, 'l')).toContain(someMain);
  });

  it('leaves the other days alone', () => {
    const plain = week(base);
    const someMain = mainsOn(plain, 1, 'd')[0];
    const pinned = week({ ...base, pins: { 'd0:l': someMain } });
    expect(mainsOn(pinned, 2, 'd')).toEqual(mainsOn(plain, 2, 'd'));
  });

  it('is ignored when the recipe is not in the pool at all', () => {
    // A deleted own-recipe, or an id from another account. The slot must still
    // fill — a plate that renders empty because a pin went stale is worse than
    // one that quietly composes itself.
    const pinned = week({ ...base, pins: { 'd0:l': 'no-such-recipe-id' } });
    expect(mainsOn(pinned, 0, 'l').length).toBeGreaterThan(0);
  });

  it('is dropped once the citizen\u2019s diet rules the dish out', () => {
    // A dish that is non-veg by its own label is the unambiguous case: pin it
    // while eating everything, then read the same profile as a vegan.
    const meat = SEED_POOL.filter((r) => r.diet === 'nonveg' && r.role === 'main');
    expect(meat.length).toBeGreaterThan(0);
    const pinnedId = meat[0].id;

    const asNonveg = week({ ...base, pins: { 'd0:d': pinnedId } });
    expect(mainsOn(asNonveg, 0, 'd')).toContain(pinnedId);

    const asVegan = week({ diet: 'vegan', pins: { 'd0:d': pinnedId } });
    expect(mainsOn(asVegan, 0, 'd')).not.toContain(pinnedId);
    // and the slot still has food in it
    expect(mainsOn(asVegan, 0, 'd').length).toBeGreaterThan(0);
  });

  it('does not stop the day being composed when every pin is stale', () => {
    const pinned = week({ ...base, pins: { 'd0:b': 'gone', 'd0:l': 'gone', 'd0:d': 'gone' } });
    for (const slot of ['b', 'l', 'd']) {
      expect(mainsOn(pinned, 0, slot).length).toBeGreaterThan(0);
    }
  });

  it('is unaffected by pins for other slots and days', () => {
    const plain = week(base);
    const pinned = week({ ...base, pins: { 'd9:l': mainsOn(plain, 0, 'l')[0] } });
    expect(mainsOn(pinned, 0, 'l')).toEqual(mainsOn(plain, 0, 'l'));
  });
});
