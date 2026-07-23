import { computeAge, mergeShared, propagationPlan } from './master-profile.service';

describe('master profile', () => {
  it('merges with master-wins precedence, sources fill gaps in order', () => {
    const merged = mergeShared(
      { gender: 'male', heightCm: null },
      { gender: 'female', dateOfBirth: new Date('1990-01-01'), heightCm: 180 },
      { heightCm: 175, city: 'Mumbai' },
    );
    expect(merged.gender).toBe('male');                       // master wins
    expect(merged.dateOfBirth?.toISOString()).toContain('1990'); // filled from source 1
    expect(merged.heightCm).toBe(180);                        // earlier source wins
    expect(merged.city).toBe('Mumbai');                       // later source fills remaining gap
  });

  it('plans propagation into each duplicating hub table', () => {
    const plan = propagationPlan({
      gender: 'female', dateOfBirth: new Date('1995-06-15T00:00:00Z'),
      timeOfBirth: '07:10', birthCity: 'Jamshedpur', birthState: 'Jharkhand', birthCountry: 'India',
      heightCm: 165, weightKg: 60,
    });
    expect(plan.astro.birthCity).toBe('Jamshedpur');
    expect(plan.dating.birthPlace).toBe('Jamshedpur, Jharkhand, India');
    expect(plan.food.sex).toBe('female');
    expect(plan.food.heightCm).toBe(165);
    expect(plan.fitness.weightKg).toBe(60);
    expect(typeof plan.food.age).toBe('number');
    // undefined fields never appear (won't clobber hub rows)
    expect('timeZone' in plan.dating).toBe(false);
  });

  it('nonbinary gender does not overwrite binary-only hub columns', () => {
    const plan = propagationPlan({ gender: 'nonbinary' });
    expect('sex' in plan.food).toBe(false);
    expect(plan.dating.gender).toBe('nonbinary'); // dating supports it
  });

  it('computes age safely', () => {
    expect(computeAge(new Date('1985-05-22'))).toBeGreaterThanOrEqual(41);
    expect(computeAge(null)).toBeNull();
  });
});
