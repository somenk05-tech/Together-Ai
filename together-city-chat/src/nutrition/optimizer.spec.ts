import {
  optimizeDayPortions, dayDeviationPct, dayTotalsFor, floorDeficitPct, solveDayPortions,
  bandViolationPct, DAY_TOLERANCE,
  type DayItemForOpt,
} from './nutrition.service';

/** The screenshot failure: fish-heavy day, kidney-moderated protein target. */
const TARGET = { kcal: 2573, protein: 66, carb: 404, fat: 77, fiber: 36 };
const allowOver = (t: number, band: { overPct: number; abs: number }) => t + Math.max((t * band.overPct) / 100, band.abs);

describe('day-portion optimizer (hard-constraint system)', () => {
  it('never finishes the day badly under calories (screenshot failure: 1048/2573)', () => {
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
    expect(totals.kcal).toBeGreaterThanOrEqual(TARGET.kcal - Math.max(TARGET.kcal * 0.02, 60));
    for (const p of Object.values(pcts)) { expect(p).toBeGreaterThanOrEqual(60); expect(p).toBeLessThanOrEqual(300); }
  });

  it('reports a band violation when portions alone cannot fix composition', () => {
    // All-protein-dense picks vs a kidney-capped 66 g target: the calorie floor
    // is only reachable by dragging protein far over its band. The solver must
    // SAY so (violation > 0) so the repair/removal ladder takes over.
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 227, protein: 18, carbs: 12, fat: 13, fiber: 3 },
      { slot: 'l', kcal: 415, protein: 48, carbs: 10, fat: 20, fiber: 2 },
      { slot: 's', kcal: 280, protein: 40, carbs: 12, fat: 8, fiber: 4 },
      { slot: 'd', kcal: 369, protein: 60, carbs: 20, fat: 14, fiber: 7 },
    ];
    const sol = solveDayPortions(items, TARGET);
    expect(sol.violation).toBeGreaterThan(0); // invalid → generatePlan must repair via swaps/removal
  });

  it('produces a fully valid day (all hard bands) when composition allows it', () => {
    // Density-matched picks for the capped 66 g protein prescription — a valid
    // solution exists by portioning alone, and the solver must find it.
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 400, protein: 9, carbs: 64, fat: 12, fiber: 6 },
      { slot: 'l', kcal: 600, protein: 15, carbs: 95, fat: 18, fiber: 8 },
      { slot: 's', kcal: 300, protein: 9, carbs: 48, fat: 10, fiber: 5 },
      { slot: 'd', kcal: 550, protein: 14, carbs: 86, fat: 15, fiber: 7 },
    ];
    const sol = solveDayPortions(items, TARGET);
    const t = dayTotalsFor(items, sol.pcts);
    expect(sol.deficit).toBe(0);
    expect(sol.violation).toBe(0);
    expect(t.protein).toBeLessThanOrEqual(allowOver(TARGET.protein, DAY_TOLERANCE.protein));
    expect(t.kcal).toBeGreaterThanOrEqual(TARGET.kcal - Math.max(TARGET.kcal * 0.02, 60));
  });

  it('lands within tolerance when the pool actually fits the targets', () => {
    const t = { kcal: 2000, protein: 120, carb: 230, fat: 62, fiber: 32 };
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 420, protein: 25, carbs: 49, fat: 13, fiber: 7 },
      { slot: 'l', kcal: 610, protein: 37, carbs: 70, fat: 19, fiber: 10 },
      { slot: 's', kcal: 260, protein: 15, carbs: 30, fat: 8, fiber: 5 },
      { slot: 'd', kcal: 580, protein: 35, carbs: 67, fat: 18, fiber: 9 },
    ];
    const sol = solveDayPortions(items, t);
    expect(sol.deficit).toBe(0);
    expect(sol.violation).toBe(0);
    expect(dayDeviationPct(items, sol.pcts, t).worst).toBeLessThanOrEqual(6);
  });

  it('holds plate meals fixed at 100%', () => {
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 5 },
      { slot: 'l', kcal: 700, protein: 40, carbs: 90, fat: 20, fiber: 12, minPct: 100, maxPct: 100 },
    ];
    const pcts = optimizeDayPortions(items, { kcal: 1600, protein: 90, carb: 190, fat: 50, fiber: 30 });
    expect(pcts.l).toBe(100);
  });

  it('quantized mode only prescribes realistic portions (½–1½ plates)', () => {
    const STEPS = [50, 75, 100, 125, 150];
    const t = { kcal: 2000, protein: 110, carb: 235, fat: 62, fiber: 30 };
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 430, protein: 23, carbs: 52, fat: 13, fiber: 6 },
      { slot: 'l', kcal: 620, protein: 35, carbs: 74, fat: 19, fiber: 10 },
      { slot: 's', kcal: 280, protein: 14, carbs: 33, fat: 9, fiber: 4 },
      { slot: 'd', kcal: 590, protein: 33, carbs: 70, fat: 18, fiber: 9 },
    ];
    const sol = solveDayPortions(items, t, { steps: STEPS, defaultMax: 150 });
    for (const p of Object.values(sol.pcts)) expect(STEPS).toContain(p);
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
    expect(deficit).toBe(0); // the day still reaches its calorie floor
    expect(totals.kcal).toBeGreaterThanOrEqual(t.kcal - Math.max(t.kcal * 0.02, 60));
    // and it got there by making the remaining meals larger
    const avg = Object.values(pcts).reduce((s, p) => s + p, 0) / Object.values(pcts).length;
    expect(avg).toBeGreaterThan(110);
  });

  it('band violation accepts complement add-ons via the extra parameter', () => {
    const t = { kcal: 2000, protein: 100, carb: 240, fat: 60, fiber: 30 };
    const items: DayItemForOpt[] = [
      { slot: 'l', kcal: 900, protein: 45, carbs: 110, fat: 27, fiber: 14 },
      { slot: 'd', kcal: 850, protein: 43, carbs: 104, fat: 26, fiber: 13 },
    ];
    const pcts = { l: 100, d: 100 };
    const without = bandViolationPct(items, pcts, t);
    expect(without.total).toBeGreaterThan(0); // 1750 kcal — under the floor
    const withAddons = bandViolationPct(items, pcts, t, { kcal: 250, protein: 12, carbs: 26, fat: 7, fiber: 3 });
    expect(withAddons.total).toBe(0); // add-ons close the day
  });

  it('floors never trade away to fix an overshoot', () => {
    const t = { kcal: 2000, protein: 80, carb: 240, fat: 60, fiber: 30 };
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 500, protein: 20, carbs: 60, fat: 14, fiber: 6 },
      { slot: 'l', kcal: 700, protein: 40, carbs: 70, fat: 20, fiber: 9 },
      { slot: 's', kcal: 300, protein: 25, carbs: 25, fat: 8, fiber: 4 },
      { slot: 'd', kcal: 700, protein: 45, carbs: 65, fat: 20, fiber: 9 },
    ];
    const sol = solveDayPortions(items, t);
    const before = bandViolationPct(items, Object.fromEntries(items.map((i) => [i.slot, 100])), t);
    const after = bandViolationPct(items, sol.pcts, t);
    expect(after.total).toBeLessThan(before.total); // strictly better than naive 100%
    expect(floorDeficitPct(items, sol.pcts, t)).toBe(0);
  });
});
