import { computeHealthScore, HEALTH_DISCLAIMER } from './health-score';

/**
 * The two failures the brief named, both structural rather than incidental:
 * a score must never default to zero when measurements exist, and somebody
 * without enough data must be told so instead of handed a number.
 */

const full = { heightCm: 175, weightKg: 70, workoutsLast30: 12, workoutMinutesLast30: 600, markersInRange: 0.9 };

describe('never a fake number', () => {
  it('says unavailable when nothing at all has been recorded', () => {
    const r = computeHealthScore({});
    expect(r.state).toBe('unavailable');
    expect(r.score).toBeNull();
  });

  it('says incomplete — not 0 — when only a little is known', () => {
    // Height and weight alone are 30 of 100 weight: below the coverage floor.
    const r = computeHealthScore({ heightCm: 175, weightKg: 70 });
    expect(r.state).toBe('incomplete');
    expect(r.score).toBeNull();
  });

  it('names exactly what is missing, so the gap is actionable', () => {
    const r = computeHealthScore({ heightCm: 175, weightKg: 70 });
    expect(r.missingFields).toEqual(expect.arrayContaining(['workouts', 'bloodPanel']));
  });

  it('computes once enough is known', () => {
    const r = computeHealthScore(full);
    expect(r.state).toBe('computed');
    expect(r.score).toBeGreaterThan(0);
    expect(r.band).toBeTruthy();
  });

  it('never scores zero for someone who has recorded measurements', () => {
    // The exact complaint: a poor showing on every axis is still not zero.
    const r = computeHealthScore({ heightCm: 175, weightKg: 140, workoutsLast30: 0, workoutMinutesLast30: 0, markersInRange: 0 });
    expect(r.state).toBe('computed');
    expect(r.score).toBeGreaterThan(0);
  });
});

describe('a missing component drops out rather than scoring zero into the average', () => {
  it('scores the same whether an absent component is absent or omitted', () => {
    const withMarkers = computeHealthScore({ ...full, markersInRange: 1 });
    const withoutMarkers = computeHealthScore({ heightCm: 175, weightKg: 70, workoutsLast30: 12, workoutMinutesLast30: 600 });
    // Body 100 + activity 100 → 100 either way; the missing panel must not drag it down.
    expect(withMarkers.score).toBe(100);
    expect(withoutMarkers.score).toBe(100);
  });

  it('is not penalised for sleep, which the app cannot record at all', () => {
    const r = computeHealthScore(full);
    const sleep = r.components.find((c) => c.key === 'sleep')!;
    expect(sleep.state).toBe('missing');
    expect(sleep.detail).toMatch(/isn’t tracked/i);
    // ...and it did not stop the score computing.
    expect(r.state).toBe('computed');
  });
});

describe('body measurements', () => {
  it('gives a healthy BMI full marks', () => {
    const r = computeHealthScore({ ...full, heightCm: 175, weightKg: 70 });
    expect(r.components.find((c) => c.key === 'body')!.value).toBe(100);
  });

  it('floors a BMI far outside the band well above zero', () => {
    // Being outside a healthy range is not zero health, and saying so would be
    // both wrong and unkind.
    const r = computeHealthScore({ ...full, heightCm: 175, weightKg: 160 });
    expect(r.components.find((c) => c.key === 'body')!.value).toBeGreaterThanOrEqual(40);
  });

  it('says plainly that BMI is a population measure', () => {
    const r = computeHealthScore({ ...full, weightKg: 160 });
    expect(r.components.find((c) => c.key === 'body')!.detail).toMatch(/population measure/i);
  });

  it('ignores an implausible height rather than dividing by it', () => {
    const r = computeHealthScore({ ...full, heightCm: 3, weightKg: 70 });
    expect(r.components.find((c) => c.key === 'body')!.state).toBe('missing');
  });
});

describe('movement', () => {
  it('gives full marks at the 150-minutes-a-week guideline', () => {
    const r = computeHealthScore({ ...full, workoutsLast30: 12, workoutMinutesLast30: 600 });
    expect(r.components.find((c) => c.key === 'activity')!.value).toBe(100);
  });

  it('counts consistency, not only total minutes', () => {
    // One long session a month is not the same as moving regularly.
    const oneLong = computeHealthScore({ ...full, workoutsLast30: 1, workoutMinutesLast30: 600 });
    const spread = computeHealthScore({ ...full, workoutsLast30: 12, workoutMinutesLast30: 600 });
    const v = (x: typeof oneLong) => x.components.find((c) => c.key === 'activity')!.value!;
    expect(v(oneLong)).toBeLessThan(v(spread));
  });

  it('does not exceed 100 for someone who trains a great deal', () => {
    const r = computeHealthScore({ ...full, workoutsLast30: 60, workoutMinutesLast30: 5000 });
    expect(r.components.find((c) => c.key === 'activity')!.value).toBe(100);
  });

  it('treats zero logged movement as recorded, not missing', () => {
    const r = computeHealthScore({ ...full, workoutsLast30: 0, workoutMinutesLast30: 0 });
    const a = r.components.find((c) => c.key === 'activity')!;
    expect(a.state).toBe('computed');
    expect(a.value).toBe(0);
  });
});

describe('what the number claims', () => {
  it('always states its basis — a score with no stated basis is a claim', () => {
    for (const inputs of [{}, { heightCm: 175, weightKg: 70 }, full]) {
      expect(computeHealthScore(inputs).basis.length).toBeGreaterThan(20);
    }
  });

  it('always carries the not-medical disclaimer', () => {
    for (const inputs of [{}, full]) {
      expect(computeHealthScore(inputs).disclaimer).toBe(HEALTH_DISCLAIMER);
    }
  });

  it('clamps a nonsense marker share instead of trusting it', () => {
    expect(computeHealthScore({ ...full, markersInRange: 5 }).components.find((c) => c.key === 'markers')!.value).toBe(100);
    expect(computeHealthScore({ ...full, markersInRange: -2 }).components.find((c) => c.key === 'markers')!.value).toBe(0);
  });
});
