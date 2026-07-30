import { clinicalSex, displayGender, isGenderIdentity, isSexAtBirth, WHY_WE_ASK } from './sex-and-gender';

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
