import { optimizeDayPortions, dayDeviationPct, type DayItemForOpt } from './nutrition.service';

/** The screenshot failure: fish-heavy day, kidney-moderated protein target. */
const TARGET = { kcal: 2573, protein: 66, carb: 404, fat: 77, fiber: 36 };

describe('day-portion optimizer (§targets)', () => {
  it('pulls a wildly-over-protein day toward the targets', () => {
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 227, protein: 18, carbs: 12, fat: 13, fiber: 3 },
      { slot: 'l', kcal: 415, protein: 48, carbs: 10, fat: 20, fiber: 2 },
      { slot: 's', kcal: 280, protein: 40, carbs: 12, fat: 8, fiber: 4 },
      { slot: 'd', kcal: 369, protein: 60, carbs: 20, fat: 14, fiber: 7 },
    ];
    const before = dayDeviationPct(items, {}, TARGET);
    const pcts = optimizeDayPortions(items, TARGET);
    const after = dayDeviationPct(items, pcts, TARGET);
    expect(after.worst).toBeLessThan(before.worst); // strictly better
    // protein must come DOWN toward its (medically moderated) target
    const protein = items.reduce((s, it) => s + it.protein * ((pcts[it.slot] ?? 100) / 100), 0);
    expect(protein).toBeLessThan(166);
    // every portion stays within the allowed human-sensible band
    for (const p of Object.values(pcts)) { expect(p).toBeGreaterThanOrEqual(60); expect(p).toBeLessThanOrEqual(180); }
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
    expect(after.worst).toBeLessThanOrEqual(3); // ±3% when feasible
  });

  it('holds plate meals fixed at 100%', () => {
    const items: DayItemForOpt[] = [
      { slot: 'b', kcal: 300, protein: 20, carbs: 30, fat: 10, fiber: 5 },
      { slot: 'l', kcal: 700, protein: 40, carbs: 90, fat: 20, fiber: 12, minPct: 100, maxPct: 100 },
    ];
    const pcts = optimizeDayPortions(items, { kcal: 1600, protein: 90, carb: 190, fat: 50, fiber: 30 });
    expect(pcts.l).toBe(100);
  });
});
