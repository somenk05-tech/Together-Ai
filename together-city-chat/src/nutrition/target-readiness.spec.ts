import { clinicalSexUsable, requiredFields, targetReadiness } from './target-readiness';

const complete = { heightCm: 168, weightKg: 62, age: 34, sexAtBirth: 'female' };

describe('every link goes somewhere that can take the answer', () => {
  it('points at a route that holds the field', () => {
    const r = targetReadiness({ heightCm: null, weightKg: null, age: null, sexAtBirth: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // The first version linked to /profile#body and /profile#identity. Neither
    // anchor existed, and that page does not hold height, weight, age or sex at
    // all — the links would have sent people somewhere they could not do the
    // thing being asked of them. This test is why that cannot come back.
    // FE-3.1 built the screen these fields are actually owned by, and each
    // link now carries the section anchor as well as the page.
    expect(r.missing.map((m) => m.href)).toEqual([
      '/profile/master#body', '/profile/master#body',
      '/profile/master#identity', '/profile/master#identity',
    ]);
  });
});

describe('when a target can be computed', () => {
  it('says yes and nothing else', () => {
    expect(targetReadiness(complete)).toEqual({ ok: true });
  });

  it('does not care about activity or goal', () => {
    // Both have defensible defaults that describe a real population. Height and
    // weight do not — there is no honest default for what somebody weighs.
    expect(targetReadiness(complete).ok).toBe(true);
  });
});

describe('when it cannot', () => {
  it('names the field, why it is needed, and where to enter it', () => {
    const r = targetReadiness({ ...complete, weightKg: null });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].field).toBe('weightKg');
    expect(r.missing[0].href).toBe('/profile/master#body');
    expect(r.missing[0].why.length).toBeGreaterThan(20);
  });

  it('lists several in a sentence a person would say', () => {
    const r = targetReadiness({ heightCm: null, weightKg: null, age: null, sexAtBirth: null });
    if (r.ok) return;
    expect(requiredFields(r)).toEqual(['heightCm', 'weightKg', 'age', 'sexAtBirth']);
    expect(r.headline).toContain('height, weight, age and sex at birth');
  });

  it('explains the refusal rather than just refusing', () => {
    const r = targetReadiness({ ...complete, heightCm: null });
    if (r.ok) return;
    expect(r.body).toMatch(/someone else’s body/);
  });
});

describe('implausible values are missing, not clamped', () => {
  it('rejects a height that is a typo', () => {
    // 3 cm taken literally gives a confident absurd number; clamping to 60 gives
    // a confident wrong one. Both are worse than asking again.
    for (const heightCm of [0, 3, 900, -170, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect([heightCm, targetReadiness({ ...complete, heightCm }).ok]).toEqual([heightCm, false]);
    }
  });

  it('rejects an impossible weight or age', () => {
    expect(targetReadiness({ ...complete, weightKg: 0 }).ok).toBe(false);
    expect(targetReadiness({ ...complete, weightKg: 900 }).ok).toBe(false);
    expect(targetReadiness({ ...complete, age: 0 }).ok).toBe(false);
    expect(targetReadiness({ ...complete, age: 200 }).ok).toBe(false);
  });

  it('accepts the edges of what is plausible', () => {
    expect(targetReadiness({ ...complete, heightCm: 60 }).ok).toBe(true);
    expect(targetReadiness({ ...complete, weightKg: 15 }).ok).toBe(true);
    expect(targetReadiness({ ...complete, age: 1 }).ok).toBe(true);
  });
});

/**
 * The case that decides whether this module is respectful or not.
 */
describe('sex at birth that the equation cannot use', () => {
  it('does not tell someone who answered that they left it blank', () => {
    for (const sexAtBirth of ['intersex', 'preferNotToSay']) {
      const r = targetReadiness({ ...complete, sexAtBirth });
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      // Nothing to go and fill in — they already did.
      expect(r.missing).toEqual([]);
      expect(r.headline).not.toMatch(/^Add your/);
      expect(r.body).toMatch(/only has two settings/);
    }
  });

  it('says what still works, so the refusal is not the whole message', () => {
    const r = targetReadiness({ ...complete, sexAtBirth: 'intersex' });
    if (r.ok) return;
    expect(r.body).toMatch(/preferences, allergies and medical conditions/);
  });

  it('knows which answers the equation can actually use', () => {
    expect(clinicalSexUsable('male')).toBe(true);
    expect(clinicalSexUsable('FEMALE')).toBe(true);
    expect(clinicalSexUsable('intersex')).toBe(false);
    expect(clinicalSexUsable('preferNotToSay')).toBe(false);
    expect(clinicalSexUsable(null)).toBe(false);
    expect(clinicalSexUsable('')).toBe(false);
  });

  it('still asks when the field is genuinely blank', () => {
    const r = targetReadiness({ ...complete, sexAtBirth: '   ' });
    if (r.ok) return;
    expect(requiredFields(r)).toEqual(['sexAtBirth']);
  });
});
