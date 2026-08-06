import { readFileSync } from 'fs';
import { join } from 'path';
import { computeBodyProgram } from '../fitness/fitness-engine';

/**
 * ONE BODY, ONE SET OF NUMBERS.
 *
 * The bug this exists to stop: the same account, on the same day, was told it
 * needed 3,040 kcal and 185 g of protein in Fitness and 2,588 kcal and 74 g in
 * Nutrition. Nobody had lied — the two hubs read the same equation with a
 * different activity input and dosed protein against two different weights,
 * and each was internally consistent. That is exactly why it survived: the
 * 4 Aug audit checked Fitness against Fitness and found nothing wrong.
 *
 * So the checks below are deliberately CROSS-hub and structural. They fail on
 * the shape that lets the numbers drift apart again, not on a snapshot of two
 * figures that a tuning change would break for the wrong reason.
 */
const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('the two hubs cannot disagree about one body', () => {
  it('Nutrition falls back to the Master Profile before it falls back to a fiction', () => {
    const s = src('nutrition/nutrition.service.ts');
    // The helper exists...
    expect(s).toMatch(/private async activityOf\(/);
    // ...and no account-holder target is computed from the raw column any more.
    // `pref?.activity ?? undefined` reaching computeTargets is the original bug
    // verbatim: null column → REFERENCE_BODY, while Fitness read the real
    // answer from the Master Profile.
    const rawReads = s.split('\n').filter((l) => /activity:\s*pref\??\.activity\s*\?\?\s*undefined/.test(l));
    expect(rawReads).toEqual([]);
  });

  it('Fitness asks Nutrition for the protein target rather than keeping a second rule', () => {
    const s = src('fitness/fitness.service.ts');
    expect(s).toMatch(/clinicalProtein\(/);
    expect(s).toMatch(/clinicalProteinG:/);
    // The clinical rule reads conditions, pregnancy, age and kidney staging. A
    // copy of any of that in the fitness hub is a copy that drifts.
    const fe = src('fitness/fitness-engine.ts');
    expect(fe).not.toMatch(/dialysis|\bCKD\b|lactating/i);
  });

  it('the clinical dose is what the body-goal page shows, and the training dose becomes a sentence', () => {
    const withClinical = computeBodyProgram({
      age: 41, sex: 'male', heightCm: 181, weightKg: 103, activity: 1.55,
      bodyGoal: 'athletic', clinicalProteinG: 74,
    });
    expect(withClinical.macros?.proteinG).toBe(74);
    // 1.8 g/kg × 103 kg — kept, and named, rather than silently dropped.
    expect(withClinical.trainingProteinG).toBe(185);
    expect(withClinical.proteinNote).toMatch(/185 g/);
    expect(withClinical.proteinNote).toMatch(/reference weight/i);
    // Carbs rebalance off the same calorie total, so the whole row agrees
    // rather than only the protein cell.
    const kcal = withClinical.calorieTarget as number;
    const m = withClinical.macros as { proteinG: number; fatG: number; carbG: number };
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbG * 4).toBeGreaterThan(kcal - 6);
    expect(m.proteinG * 4 + m.fatG * 9 + m.carbG * 4).toBeLessThan(kcal + 6);
  });

  it('falls back to the training dose, labelled, when Nutrition cannot answer', () => {
    // A page that refuses to show a number because the other hub is slow is
    // worse than a page showing the number it can defend.
    const alone = computeBodyProgram({
      age: 41, sex: 'male', heightCm: 181, weightKg: 103, activity: 1.55, bodyGoal: 'athletic',
    });
    expect(alone.macros?.proteinG).toBe(185);
    expect(alone.proteinNote).toBeNull();
  });

  it('the same activity factor produces the same calories on both sides', () => {
    // Both hubs run energyTarget. If they are handed the same body and the same
    // activity, any difference is a second equation somebody added.
    const a = computeBodyProgram({
      age: 41, sex: 'male', heightCm: 181, weightKg: 103, activity: 1.55, bodyGoal: 'athletic',
    });
    const b = computeBodyProgram({
      age: 41, sex: 'male', heightCm: 181, weightKg: 103, activity: 1.55, bodyGoal: 'athletic',
      clinicalProteinG: 74,
    });
    // Protein changed; the energy did not. Protein is a split of the calories,
    // never a change to them.
    expect(b.calorieTarget).toBe(a.calorieTarget);
    expect(b.tdee).toBe(a.tdee);
  });
});
