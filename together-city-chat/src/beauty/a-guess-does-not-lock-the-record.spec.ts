import { BeautyProfileSchema, carryEstimates } from './profile-save';

/**
 * A guess the analysis made must not lock the profile against every later edit.
 *
 * THE BUG THIS PINS (3 Sep). After a photo analysis filled in a "Don't know"
 * answer, the profile carried `aiEstimated: { skinType: true }` so the form
 * could label the guess. The form echoed that object back on Save, the PUT's
 * schema knew only primitives and string lists, and every save from then on
 * was a 400 the page never showed. Edit, tap Save, reload: the old answers.
 */

const form = {
  gender: 'Female', lifestyle: 'Active', skinType: 'Oily', skinGoals: ['Glow'],
  allergies: ['None of these'], medicalConditions: ['Diabetes'], age: 31, heightCm: 160,
};

describe('the profile the form sends', () => {
  it('is accepted with the estimate flags echoed back', () => {
    expect(BeautyProfileSchema.safeParse({ ...form, aiEstimated: { skinType: true } }).success).toBe(true);
  });

  it('is accepted without them', () => {
    expect(BeautyProfileSchema.safeParse(form).success).toBe(true);
  });

  it('still refuses any other object-valued field', () => {
    expect(BeautyProfileSchema.safeParse({ ...form, photos: { face: 'x' } }).success).toBe(false);
    expect(BeautyProfileSchema.safeParse({ ...form, aiEstimated: { skinType: 'yes' } }).success).toBe(false);
  });
});

describe('what is written to extras', () => {
  const onFile = { ...form, skinType: 'Dry', hairTexture: 'Frizzy', aiEstimated: { skinType: true, hairTexture: true } };

  it('never takes the flags from the client', () => {
    const out = carryEstimates({ ...form }, { ...form, aiEstimated: { skinType: true } });
    expect(out).not.toHaveProperty('aiEstimated');
  });

  it('keeps the label on an answer left as the model set it', () => {
    const out = carryEstimates(onFile, { ...form, skinType: 'Dry', hairTexture: 'Frizzy', aiEstimated: { hairTexture: false } });
    expect(out.aiEstimated).toEqual({ skinType: true, hairTexture: true });
  });

  it('takes the label off an answer the citizen corrected', () => {
    const out = carryEstimates(onFile, { ...form, skinType: 'Oily', hairTexture: 'Frizzy' });
    expect(out.aiEstimated).toEqual({ hairTexture: true });
    expect(out.skinType).toBe('Oily');
  });

  it('drops the key entirely once every guess has been corrected', () => {
    const out = carryEstimates(onFile, { ...form, skinType: 'Oily', hairTexture: 'Wavy' });
    expect(out).not.toHaveProperty('aiEstimated');
  });

  it('compares lists by content, not identity', () => {
    const prev = { skinGoals: ['Glow', 'Even tone'], aiEstimated: { skinGoals: true } };
    expect(carryEstimates(prev, { skinGoals: ['Glow', 'Even tone'] }).aiEstimated).toEqual({ skinGoals: true });
    expect(carryEstimates(prev, { skinGoals: ['Glow'] })).not.toHaveProperty('aiEstimated');
  });
});
