import {
  ACTIVITY_FACTORS, ENERGY_FLOOR, KCAL_PER_KG_FAT, MAX_DAILY_DELTA, MAX_WEEKLY_KG,
  basalMetabolicRate, energyTarget, nearestActivityLevel,
} from './energy';

/**
 * QA-7.1 asks for personas hand-checked against the published equations and
 * committed as fixtures. These are the equation's own arithmetic, computed by
 * hand from Mifflin–St Jeor as published, so a future refactor that changes a
 * coefficient has to change these numbers too — which is the point of a fixture.
 *
 * The clinical VALIDATION set the ticket describes still needs the reviewer it
 * names. This is the arithmetic, not the sign-off.
 */
describe('Mifflin–St Jeor, against hand-worked cases', () => {
  it('a 30-year-old man, 80 kg, 180 cm', () => {
    // 10(80) + 6.25(180) − 5(30) + 5 = 800 + 1125 − 150 + 5 = 1780
    expect(basalMetabolicRate({ weightKg: 80, heightCm: 180, age: 30, sex: 'male' })).toBe(1780);
  });

  it('a 30-year-old woman, 65 kg, 165 cm', () => {
    // 10(65) + 6.25(165) − 5(30) − 161 = 650 + 1031.25 − 150 − 161 = 1370.25
    expect(basalMetabolicRate({ weightKg: 65, heightCm: 165, age: 30, sex: 'female' })).toBeCloseTo(1370.25, 2);
  });

  it('a 70-year-old woman, 58 kg, 155 cm', () => {
    // 580 + 968.75 − 350 − 161 = 1037.75
    expect(basalMetabolicRate({ weightKg: 58, heightCm: 155, age: 70, sex: 'female' })).toBeCloseTo(1037.75, 2);
  });

  it('the only difference between the sexes is the constant', () => {
    const body = { weightKg: 70, heightCm: 170, age: 40 };
    expect(basalMetabolicRate({ ...body, sex: 'male' }) - basalMetabolicRate({ ...body, sex: 'female' }))
      .toBe(166);
  });
});

describe('the safe-rate cap', () => {
  it('is derived from the rate, not picked', () => {
    expect(MAX_DAILY_DELTA).toBe(Math.round((MAX_WEEKLY_KG * KCAL_PER_KG_FAT) / 7));
    expect(MAX_DAILY_DELTA).toBe(550);
  });

  it('leaves an ordinary deficit alone', () => {
    // ~2,400 maintenance at −18% is 432 kcal — under the cap, so untouched.
    const r = energyTarget({
      weightKg: 65, heightCm: 165, age: 30, sex: 'female',
      activity: ACTIVITY_FACTORS.light, goal: 'lose', deltaPct: -0.18,
    });
    expect(r.deltaCapped).toBe(false);
    expect(r.delta).toBeGreaterThan(-MAX_DAILY_DELTA);
    expect(r.kcal).toBe(r.tdee + r.delta);
  });

  it('reins in the deficit that a flat percentage makes too steep', () => {
    // The failure the cap exists for: the bigger the person, the more
    // aggressive a flat -18% becomes in absolute terms.
    const r = energyTarget({
      weightKg: 120, heightCm: 190, age: 35, sex: 'male',
      activity: ACTIVITY_FACTORS.active, goal: 'lose', deltaPct: -0.18,
    });
    expect(r.deltaCapped).toBe(true);
    expect(r.delta).toBe(-MAX_DAILY_DELTA);
    expect(r.trace.notes.join(' ')).toMatch(/0\.5 kg a week/);
  });

  it('caps a surplus the same way', () => {
    const r = energyTarget({
      weightKg: 110, heightCm: 185, age: 28, sex: 'male',
      activity: ACTIVITY_FACTORS.veryActive, goal: 'gain', deltaPct: 0.20,
    });
    expect(r.delta).toBe(MAX_DAILY_DELTA);
    expect(r.deltaCapped).toBe(true);
  });

  it('does nothing at all when maintaining', () => {
    const r = energyTarget({
      weightKg: 70, heightCm: 175, age: 30, sex: 'male',
      activity: ACTIVITY_FACTORS.moderate, goal: 'maintain', deltaPct: 0,
    });
    expect(r.delta).toBe(0);
    expect(r.deltaCapped).toBe(false);
    expect(r.kcal).toBe(r.tdee);
  });
});

describe('the energy floor', () => {
  it('is per sex, as the ticket sets it', () => {
    expect(ENERGY_FLOOR).toEqual({ female: 1200, male: 1500 });
  });

  it('lifts a very low target and says that it did', () => {
    // Small, older, sedentary, losing — the case a single 1400 floor handles
    // wrong for both sexes at once.
    const r = energyTarget({
      weightKg: 45, heightCm: 148, age: 72, sex: 'female',
      activity: ACTIVITY_FACTORS.sedentary, goal: 'lose', deltaPct: -0.18,
    });
    expect(r.floored).toBe(true);
    expect(r.kcal).toBe(1200);
    expect(r.trace.notes.join(' ')).toMatch(/1200 kcal floor/);
  });

  it('holds men to the higher floor', () => {
    const r = energyTarget({
      weightKg: 50, heightCm: 155, age: 75, sex: 'male',
      activity: ACTIVITY_FACTORS.sedentary, goal: 'lose', deltaPct: -0.18,
    });
    expect(r.kcal).toBeGreaterThanOrEqual(1500);
  });

  it('says nothing about a floor it did not reach', () => {
    const r = energyTarget({
      weightKg: 80, heightCm: 180, age: 30, sex: 'male',
      activity: ACTIVITY_FACTORS.moderate, goal: 'maintain', deltaPct: 0,
    });
    expect(r.floored).toBe(false);
    expect(r.trace.notes).toEqual([]);
  });
});

describe('pregnancy and lactation energy', () => {
  it('is added after the cap, because it is a requirement and not an adjustment', () => {
    const base = {
      weightKg: 62, heightCm: 163, age: 31, sex: 'female' as const,
      activity: ACTIVITY_FACTORS.light, goal: 'maintain' as const, deltaPct: 0,
    };
    const plain = energyTarget(base);
    const pregnant = energyTarget({ ...base, extraKcal: 340 });
    expect(pregnant.kcal - plain.kcal).toBe(340);
    expect(pregnant.trace.notes.join(' ')).toMatch(/pregnancy or breastfeeding/i);
  });
});

describe('activity levels', () => {
  it('holds the five published factors', () => {
    expect(Object.values(ACTIVITY_FACTORS)).toEqual([1.2, 1.375, 1.55, 1.725, 1.9]);
  });

  it('names the nearest level for a stored float that is not one of them', () => {
    // 1.4 is the codebase's default and matches no published multiplier.
    expect(nearestActivityLevel(1.4)).toBe('light');
    expect(nearestActivityLevel(1.2)).toBe('sedentary');
    expect(nearestActivityLevel(1.9)).toBe('veryActive');
    expect(nearestActivityLevel(3)).toBe('veryActive');
    expect(nearestActivityLevel(0.5)).toBe('sedentary');
  });
});

describe('the disclosure FE-7.1 has to render', () => {
  const r = energyTarget({
    weightKg: 80, heightCm: 180, age: 30, sex: 'male',
    activity: ACTIVITY_FACTORS.moderate, goal: 'lose', deltaPct: -0.18,
  });

  it('names the equation rather than showing coefficients', () => {
    expect(r.trace.equation).toBe('Mifflin–St Jeor (1990)');
  });

  it('lists every input the number was built from', () => {
    expect(Object.keys(r.trace.inputs).sort())
      .toEqual(['activityFactor', 'activityLevel', 'age', 'goal', 'heightCm', 'sex', 'weightKg']);
  });

  it('walks from resting energy to the target, ending on the number shown', () => {
    expect(r.trace.steps[0].label).toMatch(/Resting energy/);
    expect(r.trace.steps[r.trace.steps.length - 1]).toEqual({ label: 'Daily target', value: `${r.kcal} kcal` });
  });

  it('reconciles: the steps add up to the answer', () => {
    // A disclosure that does not reconcile is worse than none — it invites
    // someone to check the arithmetic and find it wrong.
    expect(r.tdee + r.delta).toBe(r.kcal);
  });
});
