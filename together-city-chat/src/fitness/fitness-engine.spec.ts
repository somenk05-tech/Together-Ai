import { computeBodyProgram, BODY_GOALS } from './fitness-engine';
import { ACTIVITY_FACTORS, ENERGY_FLOOR, MAX_DAILY_DELTA } from '../shared/energy';

/**
 * What the Fitness hub computes after the unification, written down.
 *
 * The previous version of this file was a golden master of the OLD behaviour,
 * recorded at 6edaef0 before anything changed. The snapshot diff between that
 * commit and this one is therefore the complete record of every calorie figure
 * that moved, and why it moved: one energy computation (shared/energy.ts)
 * instead of two, the activity factor from the Master Profile instead of from
 * ability, a safe-rate cap and an energy floor where there were neither, and a
 * refusal where a 70 kg / 172 cm body used to be substituted.
 */
const core = (p: ReturnType<typeof computeBodyProgram>) => ({
  hasMetrics: p.hasMetrics,
  bmr: p.bmr,
  tdee: p.tdee,
  calorieTarget: p.calorieTarget,
  macros: p.macros,
  proteinPerKg: p.proteinPerKg,
  nutritionGoal: p.nutrition.goal,
  missing: p.missing,
});

const person = { age: 30, sex: 'male', heightCm: 175, weightKg: 75, activity: ACTIVITY_FACTORS.moderate };

describe('the numbers the Fitness hub shows now', () => {
  it.each(BODY_GOALS.map((g) => g.key))('%s, at every activity level', (bodyGoal) => {
    const byLevel = (Object.keys(ACTIVITY_FACTORS) as (keyof typeof ACTIVITY_FACTORS)[]).map((level) =>
      [level, core(computeBodyProgram({ ...person, activity: ACTIVITY_FACTORS[level], bodyGoal }))] as const);
    expect(Object.fromEntries(byLevel)).toMatchSnapshot();
  });

  it('a woman, same body, same goal', () => {
    expect(core(computeBodyProgram({ ...person, sex: 'female', bodyGoal: 'fatLoss' })))
      .toMatchSnapshot();
  });

  it('sex "other", which the formula now refuses rather than resolves', () => {
    expect(core(computeBodyProgram({ ...person, sex: 'other', bodyGoal: 'fatLoss' })))
      .toMatchSnapshot();
  });
});

describe('the recorded behaviours, now changed', () => {
  it('no longer derives energy from ABILITY — ability is not an input at all', () => {
    // Training experience decides the programme: how many sessions, how hard.
    // How much somebody moves decides their energy. Identical bodies at
    // identical activity get identical energy needs, whatever they said about
    // their experience.
    const light = computeBodyProgram({ ...person, activity: ACTIVITY_FACTORS.light, bodyGoal: 'athletic' });
    const very = computeBodyProgram({ ...person, activity: ACTIVITY_FACTORS.veryActive, bodyGoal: 'athletic' });
    expect(light.bmr).toBe(very.bmr);                 // same body
    expect(very.tdee!).toBeGreaterThan(light.tdee!);  // more movement, more energy
  });

  it('refuses when measurements are missing, instead of substituting 70 kg / 172 cm', () => {
    const unknown = computeBodyProgram({ age: 30, sex: 'male', activity: ACTIVITY_FACTORS.moderate, bodyGoal: 'athletic' });
    expect(unknown.hasMetrics).toBe(false);
    expect(unknown.bmr).toBeNull();
    expect(unknown.calorieTarget).toBeNull();
    expect(unknown.macros).toBeNull();
    expect(unknown.missing).toEqual(['weight', 'height']);
    // The programme itself still renders; only the numbers wait for a body.
  });

  it('refuses sex "other" rather than silently applying the male constant', () => {
    const other = computeBodyProgram({ ...person, sex: 'other', bodyGoal: 'athletic' });
    expect(other.calorieTarget).toBeNull();
    expect(other.missing).toEqual(['sex']);
  });

  it('refuses when activity is unknown, rather than choosing a factor', () => {
    const na = computeBodyProgram({ age: 30, sex: 'male', heightCm: 175, weightKg: 75, bodyGoal: 'athletic' });
    expect(na.calorieTarget).toBeNull();
    expect(na.missing).toEqual(['activity level']);
  });

  it('applies the energy floor a small body used to fall through', () => {
    // OLD: 0.8 × TDEE, whatever that came to — for this body, about 1005 kcal
    // with nothing underneath it.
    const small = computeBodyProgram({ age: 30, sex: 'female', heightCm: 150, weightKg: 42, activity: ACTIVITY_FACTORS.sedentary, bodyGoal: 'fatLoss' });
    expect(small.calorieTarget).toBe(ENERGY_FLOOR.female);
  });

  it('caps a deliberate deficit at the safe rate', () => {
    // A big, very active body on fatLoss requests far more than 550 kcal/day.
    const big = computeBodyProgram({ age: 30, sex: 'male', heightCm: 190, weightKg: 120, activity: ACTIVITY_FACTORS.veryActive, bodyGoal: 'fatLoss' });
    expect(big.tdee! - big.calorieTarget!).toBeLessThanOrEqual(MAX_DAILY_DELTA + 1); // ±1 for rounding
  });
});
