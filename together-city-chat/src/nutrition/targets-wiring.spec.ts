import { computeTargets } from './nutrition.service';
import { ENERGY_FLOOR, MAX_DAILY_DELTA } from '../shared/energy';

/**
 * The engines are wired in — proved from the service's own output rather than
 * from the pure functions, which are tested separately.
 *
 * energy.spec.ts says the arithmetic is right. This says the arithmetic is the
 * one the app actually uses, which is the part that was not true before.
 */

const base = {
  weightKg: 70, heightCm: 175, age: 32, sex: 'male',
  activity: 1.55, goal: 'maintain', conditions: [] as string[], flags: {} as Record<string, string>,
};

describe('the deficit cap reaches the service', () => {
  it('holds a large person to 0.5 kg a week instead of a flat 18%', () => {
    // The failure: -18% of a big maintenance is a steeper deficit in absolute
    // terms than -18% of a small one, so the bigger you were the harder the app
    // pushed. 120 kg at 1.725 activity used to land ~650 kcal down.
    const big = computeTargets({ ...base, weightKg: 120, heightCm: 190, activity: 1.725, goal: 'lose' });
    expect(big.deficitCapped).toBe(true);
    expect(big.kcal).toBeGreaterThan(0);
    // The gap between maintaining and losing is now the cap, not a percentage.
    const maintain = computeTargets({ ...base, weightKg: 120, heightCm: 190, activity: 1.725, goal: 'maintain' });
    expect(maintain.kcal - big.kcal).toBe(MAX_DAILY_DELTA);
  });

  it('leaves an ordinary deficit alone', () => {
    const small = computeTargets({ ...base, weightKg: 62, heightCm: 163, sex: 'female', activity: 1.375, goal: 'lose' });
    expect(small.deficitCapped).toBe(false);
  });
});

describe('the energy floor reaches the service', () => {
  it('is per sex, not one number for everybody', () => {
    const w = computeTargets({ ...base, sex: 'female', weightKg: 45, heightCm: 148, age: 74, activity: 1.2, goal: 'lose' });
    const m = computeTargets({ ...base, sex: 'male', weightKg: 50, heightCm: 155, age: 76, activity: 1.2, goal: 'lose' });
    expect(w.kcal).toBeGreaterThanOrEqual(ENERGY_FLOOR.female);
    expect(m.kcal).toBeGreaterThanOrEqual(ENERGY_FLOOR.male);
    // The old single 1400 was above one floor and below the other.
    expect(ENERGY_FLOOR.female).toBeLessThan(1400);
    expect(ENERGY_FLOOR.male).toBeGreaterThan(1400);
  });

  it('says when it held the target rather than clamping quietly', () => {
    const t = computeTargets({ ...base, sex: 'female', weightKg: 42, heightCm: 145, age: 78, activity: 1.2, goal: 'lose' });
    expect(t.energyFloored).toBe(true);
  });
});

describe('the working is available to show', () => {
  it('names the equation and ends on the number displayed', () => {
    const t = computeTargets(base);
    expect(t.energyTrace.equation).toBe('Mifflin–St Jeor (1990)');
    const last = t.energyTrace.steps[t.energyTrace.steps.length - 1];
    expect(last).toEqual({ label: 'Daily target', value: `${t.kcal} kcal` });
  });

  it('names a real activity level for the stored float that is not one', () => {
    // 1.4 is this codebase's default and matches no published multiplier.
    const t = computeTargets({ ...base, activity: 1.4 });
    expect(t.energyTrace.inputs.activityLevel).toBe('light');
  });
});

describe('readiness travels with the numbers', () => {
  it('is ok when the citizen gave us everything', () => {
    expect(computeTargets(base).readiness).toEqual({ ok: true });
    expect(computeTargets(base).assumed).toEqual([]);
  });

  it('refuses when a required input is missing, and still returns numbers for now', () => {
    // Both are true during the migration: `readiness` says do not show these as
    // theirs, and the numbers are still returned so the surfaces that have not
    // adopted it yet are no worse than they were.
    const t = computeTargets({ ...base, weightKg: undefined });
    expect(t.readiness.ok).toBe(false);
    if (!t.readiness.ok) {
      expect(t.readiness.missing.map((m) => m.field)).toEqual(['weightKg']);
      expect(t.readiness.missing[0].href).toBe('/profile/master#body');
    }
    expect(t.kcal).toBeGreaterThan(0);
    expect(t.assumed).toContain('weightKg');
  });

  it('flags a sex the equation cannot use without calling it missing', () => {
    const t = computeTargets({ ...base, sex: 'intersex' });
    expect(t.readiness.ok).toBe(false);
    if (!t.readiness.ok) expect(t.readiness.missing).toEqual([]);
  });
});
