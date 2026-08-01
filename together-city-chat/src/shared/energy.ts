/**
 * The daily energy target, and how it was arrived at (BE-7.1).
 *
 * §7 asks for an engine where "every output must be traceable to a published
 * equation or reference intake, and the UI must be able to show the user why
 * the number is what it is". `computeTargets()` already computes Mifflin–St
 * Jeor correctly; what it cannot do is SAY so. The equation is four unlabelled
 * coefficients inline, the activity factor is an unvalidated float, and the
 * result is a bare number with no account of how it was reached — so FE-7.1's
 * "How we calculated this" has nothing to read.
 *
 * This is that engine, pure and traceable. It also fixes two things the ticket
 * names explicitly and the current code does not do:
 *
 *   1. THE DEFICIT IS NOT CAPPED. `goal === 'lose'` applies a flat −18%, which
 *      is a percentage of a number that varies enormously. On a 2,400 kcal
 *      maintenance that is 432 kcal/day — fine. On 3,600 it is 648, which is
 *      roughly 0.6 kg a week, past the ≤0.5 kg/week the ticket sets. The larger
 *      the person, the more aggressive their deficit became, which is exactly
 *      backwards from how it reads.
 *
 *   2. THE FLOOR IS ONE NUMBER FOR EVERYONE. `Math.max(1400, …)` sits between
 *      the ticket's 1,200 ♀ and 1,500 ♂ — so it is too permissive for men and
 *      too restrictive for women, and it silently clamps rather than saying it
 *      has. A floor that is reached is a fact about the plan the person should
 *      be told, not a detail to swallow.
 *
 * Not yet wired into computeTargets: BE-7.4 (recompute triggers, per-day
 * snapshots, and refusing to compute at all when the profile is incomplete) is
 * where that lands, and it changes behaviour across every hub that reads a
 * target. This file is the arithmetic, checked, so that change can be made
 * against something already known to be right.
 */

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

/**
 * The five activity factors the ticket names. Held as a closed set rather than
 * a float, because "1.4" appears in this codebase as a default and matches none
 * of the published multipliers — a number nobody can point at the source of.
 */
export const ACTIVITY_FACTORS = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  veryActive: 1.9,
} as const;
export type ActivityLevel = keyof typeof ACTIVITY_FACTORS;

/**
 * THE ONE ACTIVITY SCALE, AND THERE WERE THREE.
 *
 *   this file            1.2   1.375  1.55  1.725  1.9    named levels
 *   Preferences.tsx      1.2   1.4    1.6   1.8    2.0    what the form offered
 *   fitness-engine.ts    1.3   1.4    1.5   1.6    1.75   derived from Ability
 *
 * Every one of those multiplies a BMR to produce a daily calorie target, and no
 * two of them agree. The word "Athlete" meant 2.0 in the Nutrition form and 1.75
 * in Fitness — a 14% difference in the same citizen's energy needs, decided by
 * which page they happened to be on.
 *
 * These five are the canonical set because this file already treated them as
 * canonical: nearestActivityLevel() exists precisely to snap the other numbers
 * onto them for display, so the disclosure has been naming a level from this
 * table while multiplying by a number from another one.
 *
 * The labels live here, next to the factors, because a scale whose wording lives
 * in a component and whose numbers live in an engine is a scale that drifts —
 * which is exactly how there came to be three.
 */
export const ACTIVITY_CHOICES: ReadonlyArray<{ level: ActivityLevel; factor: number; label: string }> = [
  { level: 'sedentary', factor: ACTIVITY_FACTORS.sedentary, label: 'Sedentary — desk days' },
  { level: 'light', factor: ACTIVITY_FACTORS.light, label: 'Lightly active — walks, errands' },
  { level: 'moderate', factor: ACTIVITY_FACTORS.moderate, label: 'Moderately active — 3–4 workouts/week' },
  { level: 'active', factor: ACTIVITY_FACTORS.active, label: 'Very active — daily training' },
  { level: 'veryActive', factor: ACTIVITY_FACTORS.veryActive, label: 'Athlete — hard training' },
];

/** Energy in one kilogram of body fat, the figure the ≤0.5 kg/week cap rests on. */
export const KCAL_PER_KG_FAT = 7700;

/** ≤0.5 kg/week, from the ticket. 0.5 × 7700 ÷ 7 = 550 kcal/day. */
export const MAX_WEEKLY_KG = 0.5;
export const MAX_DAILY_DELTA = Math.round((MAX_WEEKLY_KG * KCAL_PER_KG_FAT) / 7);

/** Below these, the plan is flagged rather than silently served. */
export const ENERGY_FLOOR: Record<Sex, number> = { female: 1200, male: 1500 };

/**
 * Mifflin–St Jeor (1990), the equation the ticket names:
 *   10 × weight(kg) + 6.25 × height(cm) − 5 × age + s,  s = +5 male, −161 female.
 */
export function basalMetabolicRate(inp: { weightKg: number; heightCm: number; age: number; sex: Sex }): number {
  const { weightKg, heightCm, age, sex } = inp;
  return 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
}

/**
 * The nearest named activity level to a stored float.
 *
 * Profiles hold a number, and some of those numbers (1.4) are not one of the
 * five. Snapping to the nearest keeps the stored value working while letting
 * the disclosure name a real level instead of printing a bare multiplier.
 */
export function nearestActivityLevel(factor: number): ActivityLevel {
  const entries = Object.entries(ACTIVITY_FACTORS) as [ActivityLevel, number][];
  return entries.reduce((best, [k, v]) =>
    Math.abs(v - factor) < Math.abs(ACTIVITY_FACTORS[best] - factor) ? k : best, entries[0][0]);
}

export interface EnergyResult {
  kcal: number;
  bmr: number;
  tdee: number;
  /** Signed, after capping. Negative for a deficit. */
  delta: number;
  /** True when the requested delta was reduced to meet the ≤0.5 kg/week rule. */
  deltaCapped: boolean;
  /** True when the floor lifted the target. The citizen is told, not clamped quietly. */
  floored: boolean;
  /** Everything FE-7.1's disclosure needs, in the order it should be read. */
  trace: {
    equation: string;
    inputs: Record<string, string | number>;
    steps: { label: string; value: string }[];
    notes: string[];
  };
}

/**
 * The daily energy target.
 *
 * `deltaPct` is the requested adjustment as a fraction of maintenance — the
 * existing −0.18 / +0.10 policy — which is then capped in ABSOLUTE terms,
 * because the safe-rate limit is a rate of weight change and not a percentage.
 *
 * `extraKcal` carries pregnancy and lactation additions, which are added AFTER
 * the cap: they are a requirement, not an adjustment, and must not be eaten by
 * a limit meant to restrain deliberate deficits.
 */
export function energyTarget(inp: {
  weightKg: number; heightCm: number; age: number; sex: Sex;
  activity: number; goal: Goal; deltaPct: number; extraKcal?: number;
}): EnergyResult {
  const bmr = basalMetabolicRate(inp);
  const tdee = bmr * inp.activity;

  const requested = tdee * inp.deltaPct;
  const capped = Math.max(-MAX_DAILY_DELTA, Math.min(MAX_DAILY_DELTA, requested));
  const deltaCapped = Math.abs(requested - capped) > 0.5;

  const extra = inp.extraKcal ?? 0;
  const beforeFloor = Math.round(tdee + capped) + extra;
  const floor = ENERGY_FLOOR[inp.sex];
  const floored = beforeFloor < floor;
  const kcal = Math.max(floor, beforeFloor);

  const level = nearestActivityLevel(inp.activity);
  const notes: string[] = [];
  if (deltaCapped) {
    notes.push(
      `Your ${inp.goal === 'lose' ? 'deficit' : 'surplus'} is limited to ${MAX_DAILY_DELTA} kcal a day, `
      + `which is about ${MAX_WEEKLY_KG} kg a week — the fastest rate this plan will aim for.`);
  }
  if (floored) {
    notes.push(
      `This target sits at the ${floor} kcal floor for ${inp.sex === 'female' ? 'women' : 'men'}. `
      + 'Eating below that makes it hard to meet your nutrient needs, so the plan does not go lower.');
  }
  if (extra) notes.push(`${extra} kcal added for pregnancy or breastfeeding, on top of the adjustment.`);

  return {
    kcal, bmr: Math.round(bmr), tdee: Math.round(tdee),
    delta: Math.round(capped), deltaCapped, floored,
    trace: {
      equation: 'Mifflin–St Jeor (1990)',
      inputs: {
        weightKg: inp.weightKg, heightCm: inp.heightCm, age: inp.age, sex: inp.sex,
        activityLevel: level, activityFactor: inp.activity, goal: inp.goal,
      },
      steps: [
        { label: 'Resting energy (BMR)', value: `${Math.round(bmr)} kcal` },
        { label: `Times your activity level (${level}, ×${inp.activity})`, value: `${Math.round(tdee)} kcal` },
        { label: inp.goal === 'maintain' ? 'No adjustment for maintaining' : `Adjusted for ${inp.goal}`, value: `${capped >= 0 ? '+' : ''}${Math.round(capped)} kcal` },
        ...(extra ? [{ label: 'Pregnancy / breastfeeding', value: `+${extra} kcal` }] : []),
        { label: 'Daily target', value: `${kcal} kcal` },
      ],
      notes,
    },
  };
}
