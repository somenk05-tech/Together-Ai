import { computeBodyProgram, BODY_GOALS } from './fitness-engine';

/**
 * What the Fitness hub computes today, written down before it is changed.
 *
 * src/fitness had no tests at all — 118 spec files in this package and none in
 * the folder that turns a citizen's height, weight, age and sex into a BMR, a
 * TDEE, a daily calorie target and a macro split. The next commit unifies that
 * arithmetic with shared/energy.ts so the app stops showing two different daily
 * calorie targets for the same person, and there was nothing to tell me which
 * numbers I had moved on purpose.
 *
 * So this is a golden master, not a specification. The snapshots below assert
 * nothing about whether these numbers are RIGHT — several of them are known to
 * be wrong, and the last two tests say exactly how. They assert only that the
 * numbers are what they are, so the next commit's diff is a complete and honest
 * record of every figure that changed.
 */
const core = (p: ReturnType<typeof computeBodyProgram>) => ({
  hasMetrics: p.hasMetrics,
  bmr: p.bmr,
  tdee: p.tdee,
  calorieTarget: p.calorieTarget,
  macros: p.macros,
  proteinPerKg: p.proteinPerKg,
  nutritionGoal: p.nutrition.goal,
});

const person = { age: 30, sex: 'male', heightCm: 175, weightKg: 75 };

describe('the numbers the Fitness hub shows today', () => {
  it.each(BODY_GOALS.map((g) => g.key))('%s, at every ability level', (bodyGoal) => {
    const byLevel = ['basic', 'beginner', 'intermediate', 'advanced', 'athlete'].map((level) =>
      [level, core(computeBodyProgram({ ...person, level, bodyGoal }))] as const);
    expect(Object.fromEntries(byLevel)).toMatchSnapshot();
  });

  it('a woman, same body, same goal', () => {
    expect(core(computeBodyProgram({ ...person, sex: 'female', level: 'intermediate', bodyGoal: 'fatLoss' })))
      .toMatchSnapshot();
  });

  it('sex "other", which the formula has to resolve somehow', () => {
    expect(core(computeBodyProgram({ ...person, sex: 'other', level: 'intermediate', bodyGoal: 'fatLoss' })))
      .toMatchSnapshot();
  });
});

describe('three things the next commit changes, recorded as they are', () => {
  it('derives the activity factor from ABILITY, which is a different question', () => {
    // The Fitness form labels this field "Ability level · basic → super-athletic"
    // and its summary row calls it "Ability". It is training experience. Here it
    // is multiplied into a BMR as though it were how much somebody moves.
    const beginner = computeBodyProgram({ ...person, level: 'beginner', bodyGoal: 'athletic' });
    const advanced = computeBodyProgram({ ...person, level: 'advanced', bodyGoal: 'athletic' });

    expect(beginner.bmr).toBe(advanced.bmr);            // same body
    expect(advanced.tdee).toBeGreaterThan(beginner.tdee); // different energy need
    // The only input that differs is how experienced they say they are.
  });

  it('substitutes a 70 kg / 172 cm body when measurements are missing', () => {
    const unknown = computeBodyProgram({ age: 30, sex: 'male', level: 'beginner', bodyGoal: 'athletic' });
    const stated = computeBodyProgram({ age: 30, sex: 'male', level: 'beginner', bodyGoal: 'athletic', heightCm: 172, weightKg: 70 });

    expect(unknown.hasMetrics).toBe(false);
    expect(unknown.bmr).toBe(stated.bmr);               // somebody else's body
    expect(unknown.calorieTarget).toBeGreaterThan(0);   // and it is still rendered
    // target-substitution.spec.ts bans exactly this in nutrition. It walks
    // computeTargets() call sites, so it has never looked at this function.
  });

  it('reads sex "other" as male, silently', () => {
    // `input.sex === 'female' ? -161 : 5` — the Mifflin-St Jeor sex constant.
    // Anyone who is not female gets the male one, including anyone who has not
    // said. clinicalSex() exists to refuse this rather than guess.
    const other = computeBodyProgram({ ...person, sex: 'other', level: 'beginner', bodyGoal: 'athletic' });
    const male = computeBodyProgram({ ...person, sex: 'male', level: 'beginner', bodyGoal: 'athletic' });
    expect(other.bmr).toBe(male.bmr);
  });

  it('applies no safe-rate cap and no energy floor', () => {
    // shared/energy.ts limits a deliberate deficit to 550 kcal/day (0.5 kg/week)
    // and floors the result at ENERGY_FLOOR. This function does neither: the
    // target is a flat percentage of TDEE, whatever that comes to.
    const small = computeBodyProgram({ age: 30, sex: 'female', heightCm: 150, weightKg: 42, level: 'basic', bodyGoal: 'fatLoss' });
    expect(small.calorieTarget).toBe(Math.round(small.tdee * 0.8));
  });
});
