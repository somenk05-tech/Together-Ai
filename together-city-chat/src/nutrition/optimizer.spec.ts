import {
  optimizeDayPortions, dayDeviationPct, dayTotalsFor, floorDeficitPct, solveDayPortions,
  type DayItemForOpt,
} from './nutrition.service';

/** The screenshot failure: fish-heavy day, kidney-moderated protein target. */
const TARGET = { kcal: 2573, protein: 66, carb: 404, fat: 77, fiber: 36 };

describe('day-portion optimizer (§targets)', () => {
  it('never finishes the day under 95% of calories (screenshot failure: 1048/2573)', () => {
    // protein-dense picks + capped protein target — the old optimizer starved
    // the day of calories to avoid protein overshoot. Calories come first now.
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 227, protein: 18, carbs: 12, fat: 13, fiber: 3 },
      { slot: 'l', kcal: 415, protein: 48, carbs: 10, fat: 20, fiber: 2 },
      { slot: 's', kcal: 280, protein: 40, carbs: 12, fat: 8, fiber: 4 },
      { slot: 'd', kcal: 369, protein: 60, carbs: 20, fat: 14, fiber: 7 },
    ];
    const { pcts, deficit } = solveDayPortions(items, TARGET);
    const totals = dayTotalsFor(items, pcts);
    expect(deficit).toBe(0);
    expect(totals.kcal).toBeGreaterThanOrEqual(0.95 * TARGET.kcal);
    expect(totals.protein).toBeGreaterThanOrEqual(0.95 * TARGET.protein);
    // portions stay within the human-sensible escalation band
    for (const p of Object.values(pcts)) { expect(p).toBeGreaterThanOrEqual(60); expect(p).toBeLessThanOrEqual(300); }
  });

  it('lands within tolerance when the pool actually fits the targets', () => {
    const t = { kcal: 2000, protein: 120, carb: 230, fat: 62, fiber: 32 };
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 420, protein: 26, carbs: 52, fat: 12, fiber: 7 },
      { slot: 'l', kcal: 610, protein: 38, carbs: 68, fat: 19, fiber: 9 },
      { slot: 's', kcal: 260, protein: 15, carbs: 30, fat: 8, fiber: 5 },
      { slot: 'd', kcal: 580, protein: 36, carbs: 62, fat: 18, fiber: 9 },
    ];
    const pcts = optimizeDayPortions(items, t);
    const after = dayDeviationPct(items, pcts, t);
    expect(after.worst).toBeLessThanOrEqual(5); // near-target when feasible
    expect(floorDeficitPct(items, pcts, t)).toBe(0); // and never under
  });

  it('holds plate meals fixed at 100%', () => {
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 5 },
      { slot: 'l', kcal: 700, protein: 40, carbs: 90, fat: 20, fiber: 12, minPct: 100, maxPct: 100 },
    ];
    const pcts = optimizeDayPortions(items, { kcal: 1600, protein: 90, carb: 190, fat: 50, fiber: 30 });
    expect(pcts.l).toBe(100);
  });

  it('rebalances the remaining meals up when a meal is skipped', () => {
    const t = { kcal: 2200, protein: 130, carb: 250, fat: 68, fiber: 34 };
    const fullDay: DayItemForOpt[] = [
      { slot: 'b', kcal: 520, protein: 30, carbs: 60, fat: 16, fiber: 8 },
      { slot: 'l', kcal: 640, protein: 40, carbs: 72, fat: 20, fiber: 10 },
      { slot: 's', kcal: 300, protein: 18, carbs: 34, fat: 9, fiber: 5 },
      { slot: 'd', kcal: 620, protein: 38, carbs: 70, fat: 19, fiber: 10 },
    ];
    const skippedBreakfast = fullDay.filter((it) => it.slot !== 'b');
    const { pcts, deficit } = solveDayPortions(skippedBreakfast, t);
    const totals = dayTotalsFor(skippedBreakfast, pcts);
    expect(deficit).toBe(0); // the day still reaches its targets
    expect(totals.kcal).toBeGreaterThanOrEqual(0.95 * t.kcal);
    expect(totals.protein).toBeGreaterThanOrEqual(0.95 * t.protein);
    // and it got there by making the remaining meals larger
    const avg = Object.values(pcts).reduce((s, p) => s + p, 0) / Object.values(pcts).length;
    expect(avg).toBeGreaterThan(110);
  });
});
