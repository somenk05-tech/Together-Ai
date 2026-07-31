import {
  BEAUTY_GENDER, beautyGender, clinicalSex, DATING_GENDER, datingGender, displayGender,
  GENDER_IDENTITY, genderIdentityFromBeauty, isGenderIdentity, isSexAtBirth, WHY_WE_ASK,
} from './sex-and-gender';
import { propagationPlan } from './master-profile.service';

describe('sex at birth and gender identity are different questions', () => {
  describe('clinicalSex', () => {
    it('uses sexAtBirth when it is one the formulas can take', () => {
      expect(clinicalSex({ sexAtBirth: 'female' })).toBe('female');
      expect(clinicalSex({ sexAtBirth: 'male' })).toBe('male');
    });

    it('never lets gender identity override a stated sex at birth', () => {
      // The whole point of the split. A trans woman's targets should come from
      // the clinical answer, and the app should still address her as female.
      expect(clinicalSex({ sexAtBirth: 'male', genderIdentity: 'female' })).toBe('male');
      expect(displayGender({ genderIdentity: 'female' })).toBe('Female');
    });

    it('returns undefined for answers that have no coefficient', () => {
      // Answered, and not usable. Offering "intersex" and then quietly picking
      // male would be worse than not offering it.
      expect(clinicalSex({ sexAtBirth: 'intersex' })).toBeUndefined();
      expect(clinicalSex({ sexAtBirth: 'preferNotToSay' })).toBeUndefined();
    });

    it('does not fall back to identity once sex at birth is answered', () => {
      expect(clinicalSex({ sexAtBirth: 'preferNotToSay', genderIdentity: 'male' })).toBeUndefined();
    });

    it('reads a pre-split account from whichever single field it has', () => {
      expect(clinicalSex({ gender: 'male' })).toBe('male');
      expect(clinicalSex({ genderIdentity: 'female' })).toBe('female');
    });

    it('will not treat non-binary as a clinical answer', () => {
      // This is the case the old code silently dropped. It still resolves to
      // "unknown" — but now the citizen can supply sexAtBirth separately and
      // get real numbers, instead of being stuck with the reference body.
      expect(clinicalSex({ gender: 'nonbinary' })).toBeUndefined();
      expect(clinicalSex({ genderIdentity: 'nonBinary' })).toBeUndefined();
      expect(clinicalSex({ genderIdentity: 'nonBinary', sexAtBirth: 'female' })).toBe('female');
    });

    it('returns undefined when nothing has been said', () => {
      expect(clinicalSex({})).toBeUndefined();
      expect(clinicalSex({ sexAtBirth: null, genderIdentity: null, gender: null })).toBeUndefined();
    });
  });

  describe('displayGender', () => {
    it('prefers the free text when the answer is "other"', () => {
      expect(displayGender({ genderIdentity: 'other', genderIdentityOther: 'Agender' })).toBe('Agender');
    });

    it('falls back to "Other" when the free text is blank', () => {
      expect(displayGender({ genderIdentity: 'other', genderIdentityOther: '   ' })).toBe('Other');
      expect(displayGender({ genderIdentity: 'other' })).toBe('Other');
    });

    it('renders the standard answers readably', () => {
      expect(displayGender({ genderIdentity: 'nonBinary' })).toBe('Non-binary');
    });

    it('still renders a pre-split account', () => {
      expect(displayGender({ gender: 'nonbinary' })).toBe('Non-binary');
    });

    it('says nothing when nothing was answered', () => {
      expect(displayGender({})).toBeUndefined();
    });
  });

  describe('datingGender — the boundary the split forgot', () => {
    it('speaks the Dating Hub\u2019s lowercase vocabulary, not the identity one', () => {
      expect(datingGender({ genderIdentity: 'nonBinary' })).toBe('nonbinary');
      expect(datingGender({ genderIdentity: 'male' })).toBe('male');
      expect(datingGender({ genderIdentity: 'female' })).toBe('female');
    });

    it('still reads a pre-split account', () => {
      expect(datingGender({ gender: 'nonbinary' })).toBe('nonbinary');
      expect(datingGender({ gender: 'female' })).toBe('female');
    });

    it('prefers the identity the citizen set over the superseded column', () => {
      expect(datingGender({ genderIdentity: 'nonBinary', gender: 'male' })).toBe('nonbinary');
    });

    it('does not put anybody in a category they did not pick', () => {
      // 'other' is a real answer with no dating equivalent. Flattening it into
      // one of the three would show other people a claim the citizen never made.
      expect(datingGender({ genderIdentity: 'other', genderIdentityOther: 'Agender' } as never)).toBeUndefined();
      expect(datingGender({})).toBeUndefined();
      expect(datingGender({ gender: null, genderIdentity: null })).toBeUndefined();
    });

    it('never returns a value the matching comparisons cannot match', () => {
      // The whole defect in one assertion: every value this can produce has to
      // be one that `seeking === cand.gender` can be true for.
      for (const identity of [...GENDER_IDENTITY, 'nonbinary', 'other', '', null, undefined]) {
        const out = datingGender({ genderIdentity: identity as string | null });
        if (out !== undefined) expect(DATING_GENDER).toContain(out);
      }
    });
  });

  describe('propagationPlan cannot corrupt a dating profile', () => {
    it('sends the Dating Hub only values it can compare', () => {
      for (const identity of [...GENDER_IDENTITY, 'nonbinary', 'other', null]) {
        const plan = propagationPlan({ genderIdentity: identity as string | null });
        const sent = plan.dating.gender;
        // Either we send nothing, or we send something matching can match.
        if (sent !== undefined) expect(DATING_GENDER).toContain(sent as string);
      }
    });

    it('specifically stops nonBinary reaching the column that stores nonbinary', () => {
      // This is the regression. Before the fix this was 'nonBinary', which made
      // the citizen invisible to everyone seeking non-binary people.
      expect(propagationPlan({ genderIdentity: 'nonBinary' }).dating.gender).toBe('nonbinary');
    });

    it('leaves the clinical side alone — dating never receives sex at birth', () => {
      const plan = propagationPlan({ sexAtBirth: 'female', genderIdentity: 'nonBinary' });
      expect(plan.dating.gender).toBe('nonbinary');
      expect(plan.food.sex).toBe('female');
      expect(plan.fitness.sex).toBe('female');
    });
  });

  describe('the vocabularies', () => {
    it('accepts only its own values', () => {
      expect(isSexAtBirth('intersex')).toBe(true);
      expect(isSexAtBirth('nonBinary')).toBe(false);
      expect(isGenderIdentity('nonBinary')).toBe(true);
      expect(isGenderIdentity('intersex')).toBe(false);
    });
  });

  it('explains why each is asked, and promises different things', () => {
    // FE-3.1 wants this copy beside the fields. It lives here so the promise
    // and the rule cannot drift apart.
    expect(WHY_WE_ASK.sexAtBirth).toMatch(/never shown to anyone else/i);
    expect(WHY_WE_ASK.genderIdentity).toMatch(/never used in a health calculation/i);
  });
});

describe('beautyGender — the boundary at the Beauty hub', () => {
  it('speaks the form’s three capitalised options and nothing else', () => {
    for (const id of ['male', 'female', 'nonBinary', 'other', 'nonbinary', '', null, undefined]) {
      const out = beautyGender({ genderIdentity: id as string | null });
      if (out !== undefined) expect(BEAUTY_GENDER).toContain(out);
    }
  });
  it('never hands the form a value its select cannot show', () => {
    // 'Non-binary' is what displayGender returns and what would have opened the
    // field blank — the §15.1 failure, one hub along.
    expect(beautyGender({ genderIdentity: 'nonBinary' })).toBe('Other');
    expect(beautyGender({ genderIdentity: 'female' })).toBe('Female');
    expect(beautyGender({ gender: 'male' })).toBe('Male');
  });
  it('says nothing when nothing was answered', () => {
    expect(beautyGender({})).toBeUndefined();
    expect(beautyGender({ gender: '' })).toBeUndefined();
  });
});

describe('genderIdentityFromBeauty — the way back', () => {
  it('lowercases into the identity vocabulary', () => {
    expect(genderIdentityFromBeauty('Female')).toBe('female');
    expect(genderIdentityFromBeauty('Male')).toBe('male');
    expect(genderIdentityFromBeauty('Other')).toBe('other');
  });
  it('produces a value clinicalSex can actually read', () => {
    // The live bug: Beauty synced its capitalised label into the retired
    // column, so clinicalSex compared 'Female' against 'female' and returned
    // undefined. Anyone who filled Beauty first had no clinical sex anywhere.
    expect(clinicalSex({ gender: 'Female' })).toBeUndefined();          // what was stored
    expect(clinicalSex({ genderIdentity: genderIdentityFromBeauty('Female') })).toBe('female');
  });
  it('refuses anything that is not one of the three', () => {
    expect(genderIdentityFromBeauty('Non-binary')).toBeUndefined();
    expect(genderIdentityFromBeauty('')).toBeUndefined();
    expect(genderIdentityFromBeauty(undefined)).toBeUndefined();
  });
  it('round-trips without drifting', () => {
    for (const label of BEAUTY_GENDER) {
      const back = genderIdentityFromBeauty(label);
      expect(beautyGender({ genderIdentity: back })).toBe(label);
    }
  });
});
