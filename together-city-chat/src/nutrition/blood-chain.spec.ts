import { computeTargets } from './nutrition.service';
import { composeWeek } from './meal-composer';
import { flagsFor, conditionsFromBlood, type MarkerStatus } from './clinical-engine';
import { activeMntRules, mntAvoidKeywords } from './clinical-mnt';

// Reproduces composeFor's Prisma-independent transformation for many blood panels
// (including the new markers) to catch any runtime throw the pure sim missed.
describe('blood → condition → plan chain (composeFor logic)', () => {
  it('never throws across a wide blood-panel matrix', () => {
    const panels: Record<string, number>[] = [
      {},
      { hba1c: 8.2, ldl: 165 },
      { egfr: 42 }, { egfr: 22 }, { egfr: 9 }, { creatinine: 2.4 },
      { alt: 90, ast: 70, ggt: 120 }, { uricAcid: 9.1 }, { tsh: 8.5 },
      { hdl: 32, trig: 320 }, { albumin: 2.9, hb: 9 },
      { egfr: 28, hba1c: 9.5, ldl: 200, uricAcid: 8, alt: 88 }, // stacked
      { vitd: 8, b12: 120, folate: 1.5, ferritin: 10 },
    ];
    let threw = 0; const errs: string[] = [];
    for (const bvals of panels) {
      for (const declared of [[], ['hypertension'], ['diabetes'], ['fatty liver'], ['pregnancy']]) {
        try {
          const flags = flagsFor(bvals);
          const conditions = [...new Set([...declared, ...conditionsFromBlood(bvals)])];
          const t = computeTargets({ weightKg: 72, heightCm: 168, age: 44, activity: 1.4, goal: 'maintain', conditions, flags }) as unknown as Record<string, number>;
          const mnt = mntAvoidKeywords(activeMntRules({ conditions, flags: flags as Record<string, string>, age: 44 }));
          const condText = conditions.join(' ').toLowerCase();
          const isClinical = /kidney|renal|ckd|dialysis|diabet|hba1c|hypertension|cholesterol|lipid|triglycer|fatty liver|gout/.test(condText) || flags.hba1c === 'high' || flags.ldl === 'high' || flags.trig === 'high';
          const caps = isClinical ? { sodiumMg: t.sodiumMaxMg, potassiumMg: t.potassiumMaxMg, phosphorusMg: t.phosphorusMaxMg, sugarG: t.sugarMaxG, satFatG: t.satFatMaxG } : undefined;
          const wk = composeWeek(
            { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber },
            { diet: 'vegetarian', excluded: mnt, caps, clinical: isClinical }, 7, 12345,
          );
          if (!wk.days.length) { threw++; errs.push('empty week'); }
        } catch (e) { threw++; errs.push(`${JSON.stringify(bvals)}+${declared}: ${(e as Error).message}`); }
      }
    }
    // eslint-disable-next-line no-console
    if (errs.length) console.log('CHAIN ERRORS:\n' + errs.slice(0, 10).join('\n'));
    expect(threw).toBe(0);
    void (undefined as unknown as MarkerStatus);
  });
});
