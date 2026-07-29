import {
  stepsFor, matchProducts, normaliseAttributes, NEUTRAL_ATTRIBUTES,
  type LookAttributes, type ShelfProduct,
} from './look-decode';

const attrs = (over: Partial<LookAttributes> = {}): LookAttributes => ({ ...NEUTRAL_ATTRIBUTES, ...over });

const shelf: ShelfProduct[] = [
  { id: 'p_moist', name: 'Ceramide Barrier Cream', category: 'Moisturiser', suitableSkin: ['all'], actives: ['Ceramides'] },
  { id: 'p_nut', name: 'Almond Glow Serum', category: 'Serum', suitableSkin: ['all'], actives: ['Almond oil'] },
  { id: 'p_makeup', name: 'Everyday Palette', category: 'Makeup', suitableSkin: ['all'], actives: [] },
  { id: 'p_oily', name: 'Oil-Control Base', category: 'Foundation', suitableSkin: ['oily'], actives: [] },
];

describe('the steps a look implies', () => {
  it('always runs prep → base → eyes → cheeks → lips → set', () => {
    const s = stepsFor(attrs());
    expect(s.map((x) => x.step)).toEqual(['Prep', 'Base', 'Eyes', 'Cheeks', 'Lips', 'Set']);
    expect(s.map((x) => x.order)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('quietens the lips when the eyes are the focus, and the reverse', () => {
    const eyes = stepsFor(attrs({ focus: 'eyes' })).find((s) => s.step === 'Lips')!;
    const lips = stepsFor(attrs({ focus: 'lips' })).find((s) => s.step === 'Eyes')!;
    expect(eyes.how).toMatch(/understated|balm|sheer/i);
    expect(lips.how).toMatch(/quiet|single neutral/i);
  });

  it('changes the base instruction with the finish', () => {
    const matte = stepsFor(attrs({ finish: 'matte' })).find((s) => s.step === 'Base')!.how;
    const dewy = stepsFor(attrs({ finish: 'dewy' })).find((s) => s.step === 'Base')!.how;
    expect(matte).not.toBe(dewy);
    expect(matte).toMatch(/matte/i);
    expect(dewy).toMatch(/sheer|damp/i);
  });

  it('tells a dewy look to skip powder and a matte one to set selectively', () => {
    expect(stepsFor(attrs({ finish: 'dewy' })).find((s) => s.step === 'Set')!.how).toMatch(/skip powder/i);
    expect(stepsFor(attrs({ finish: 'matte' })).find((s) => s.step === 'Set')!.how).toMatch(/where you shine/i);
  });

  it('carries the palette into the instructions rather than describing it once', () => {
    const s = stepsFor(attrs({ palette: 'warm bronze', intensity: 'bold', focus: 'balanced' }));
    expect(s.find((x) => x.step === 'Eyes')!.how).toMatch(/warm bronze/);
  });

  it('is deterministic', () => {
    const a = JSON.stringify(stepsFor(attrs({ finish: 'matte', intensity: 'bold' })));
    for (let i = 0; i < 10; i++) expect(JSON.stringify(stepsFor(attrs({ finish: 'matte', intensity: 'bold' })))).toBe(a);
  });
});

describe('matching products to steps', () => {
  it('matches a product to a step that wants its category', () => {
    const m = matchProducts(stepsFor(attrs()), shelf);
    expect(m.find((x) => x.step === 'Prep')!.productId).toBe('p_moist');
  });

  it('never recommends something containing a declared allergen', () => {
    // Excluded before matching, not filtered from the result afterwards.
    const m = matchProducts(stepsFor(attrs()), shelf, { allergies: ['almond'] });
    expect(m.map((x) => x.productId)).not.toContain('p_nut');
  });

  it('respects skin type when a product declares one', () => {
    const dry = matchProducts(stepsFor(attrs({ finish: 'matte' })), shelf, { skinType: 'dry' });
    expect(dry.map((x) => x.productId)).not.toContain('p_oily');
    const oily = matchProducts(stepsFor(attrs({ finish: 'matte' })), shelf, { skinType: 'oily' });
    expect(oily.map((x) => x.productId)).toContain('p_oily');
  });

  it('returns fewer matches rather than inventing one for every step', () => {
    const m = matchProducts(stepsFor(attrs()), []);
    expect(m).toEqual([]);
  });
});

describe('reading what a vision model returned', () => {
  it('accepts a well-formed reading and calls it confident', () => {
    const { attributes, confident } = normaliseAttributes({ finish: 'dewy', intensity: 'bold', focus: 'eyes', palette: 'plum', features: ['winged liner'] });
    expect(attributes.finish).toBe('dewy');
    expect(attributes.features).toEqual(['winged liner']);
    expect(confident).toBe(true);
  });

  it('is not confident when the model did not commit to the fields that matter', () => {
    // Those three change the steps; without them we are describing a default.
    expect(normaliseAttributes({ palette: 'plum' }).confident).toBe(false);
    expect(normaliseAttributes({}).confident).toBe(false);
    expect(normaliseAttributes(null).confident).toBe(false);
  });

  it('replaces a value outside the allowed set rather than trusting it', () => {
    const { attributes } = normaliseAttributes({ finish: 'holographic', intensity: 'medium', focus: 'eyes' });
    expect(attributes.finish).toBe('natural');
  });

  it('drops non-string features and caps how many it keeps', () => {
    const { attributes } = normaliseAttributes({
      finish: 'matte', intensity: 'soft', focus: 'lips',
      features: ['a', 2, null, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    });
    expect(attributes.features.every((f) => typeof f === 'string')).toBe(true);
    expect(attributes.features.length).toBeLessThanOrEqual(8);
  });

  it('falls back to neutral attributes when handed nonsense', () => {
    expect(normaliseAttributes('not an object').attributes).toEqual(NEUTRAL_ATTRIBUTES);
  });
});
