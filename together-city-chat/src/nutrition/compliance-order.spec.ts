import { complianceReport, type ComposedDay, type DayTargets, type ClinicalCaps } from './meal-composer';

/**
 * Which concern a citizen reads first.
 *
 * The UI shows `concerns[0]` — in the medical-guidance banner and again in the
 * plate note. That list used to come back in the order the checks happened to
 * run, and sodium is checked before potassium.
 *
 * The consequence, seen on a real renal plan: sodium 12% over and potassium 133%
 * over, and the banner told the citizen about the sodium. For a kidney profile
 * potassium is the one that carries real risk, and it was the one left unsaid.
 */

const targets: DayTargets = { kcal: 2000, protein: 95, carbs: 240, fat: 60, fiber: 30 };

/** Renal caps — CKD stage 1–2 / unstaged, the rule that produced the real case. */
const renalCaps: ClinicalCaps = { sodiumMg: 2000, potassiumMg: 3000, phosphorusMg: 1000, sugarG: 25, satFatG: 17 };

/** One day whose totals we control outright. */
function dayWith(t: Partial<ComposedDay['totals']>): ComposedDay {
  return {
    dayIndex: 0,
    meals: [],
    totals: {
      kcal: targets.kcal, protein: targets.protein, carbs: targets.carbs, fat: targets.fat, fiber: targets.fiber,
      sodiumMg: 0, potassiumMg: 0, phosphorusMg: 0, sugarG: 0, addedSugarG: 0, satFatG: 0,
      ...t,
    },
  } as unknown as ComposedDay;
}

describe('compliance concerns are ordered by what matters clinically', () => {
  it('names potassium before sodium on a renal plan (the shipped bug)', () => {
    // The exact shape from the screenshot: a mild sodium breach and a severe
    // potassium one.
    const days = [dayWith({ sodiumMg: 2230, potassiumMg: 7004, phosphorusMg: 2363, satFatG: 35 })];
    const rep = complianceReport(days, targets, renalCaps, 'ckd');

    expect(rep.concerns.length).toBeGreaterThan(1);
    expect(rep.concerns[0].key).not.toBe('sodium');
    // Potassium and phosphorus are the renal risks; one of them must lead.
    expect(['potassium', 'phosphorus']).toContain(rep.concerns[0].key);

    const sodiumAt = rep.concerns.findIndex((c) => c.key === 'sodium');
    const potassiumAt = rep.concerns.findIndex((c) => c.key === 'potassium');
    expect(potassiumAt).toBeLessThan(sodiumAt);
  });

  it('is ordered worst-first throughout, not just at the head', () => {
    const days = [dayWith({ sodiumMg: 2230, potassiumMg: 7004, phosphorusMg: 2363, satFatG: 35 })];
    const { concerns } = complianceReport(days, targets, renalCaps, 'ckd');
    const rank = (c: (typeof concerns)[number]) => (c.severity === 'warn' ? 1e6 : 0) + c.deltaPct * c.weight;
    for (let i = 1; i < concerns.length; i++) {
      expect(rank(concerns[i - 1])).toBeGreaterThanOrEqual(rank(concerns[i]));
    }
  });

  it('still leads with sodium when sodium really is the worst breach', () => {
    // The fix must not simply demote sodium forever.
    const days = [dayWith({ sodiumMg: 6000, potassiumMg: 3050, phosphorusMg: 900 })];
    const rep = complianceReport(days, targets, renalCaps, 'ckd');
    expect(rep.concerns[0].key).toBe('sodium');
  });

  it('carries a weight on every concern so the ranking is inspectable', () => {
    const days = [dayWith({ sodiumMg: 2230, potassiumMg: 7004, satFatG: 35 })];
    const { concerns } = complianceReport(days, targets, renalCaps, 'ckd');
    expect(concerns.length).toBeGreaterThan(0);
    for (const c of concerns) expect(typeof c.weight).toBe('number');
    // Renal nutrients outrank the general ones by weight, as the penalties do.
    const byKey = Object.fromEntries(concerns.map((c) => [c.key, c.weight]));
    if (byKey.potassium && byKey.sodium) expect(byKey.potassium).toBeGreaterThan(byKey.sodium);
  });

  it('reports nothing to worry about when the plan is inside every cap', () => {
    const days = [dayWith({ sodiumMg: 1500, potassiumMg: 2500, phosphorusMg: 800, satFatG: 10, addedSugarG: 10 })];
    const rep = complianceReport(days, targets, renalCaps, 'ckd');
    expect(rep.concerns).toEqual([]);
    expect(rep.score).toBe(100);
  });
});
