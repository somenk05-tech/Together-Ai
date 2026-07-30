import {
  INGREDIENT_MACROS, computeRecipeNutrition, lookupMacro, presentNutrition,
} from './recipe-nutrition';

describe('computing a dish from what is in it', () => {
  it('adds up a dish it fully recognises', () => {
    // 100 g dry rice + 20 g oil, one serving.
    const r = computeRecipeNutrition([{ name: 'Rice', grams: 100 }, { name: 'Oil', grams: 20 }]);
    expect(r.complete).toBe(true);
    expect(r.kcal).toBe(345 + Math.round(884 * 0.2));
    expect(r.coverage).toBe(1);
  });

  it('divides by servings', () => {
    const one = computeRecipeNutrition([{ name: 'Rice', grams: 400 }], 1);
    const four = computeRecipeNutrition([{ name: 'Rice', grams: 400 }], 4);
    expect(four.kcal).toBe(Math.round(one.kcal / 4));
  });

  it('reads the names these recipes are actually written in', () => {
    expect(lookupMacro('Aloo')?.key).toBe('potato');
    expect(lookupMacro('chopped onions')?.key).toBe('onion');
    expect(lookupMacro('Arhar dal')?.key).toBe('toor dal');
    expect(lookupMacro('Whole wheat flour')?.key).toBe('wheat flour');
    expect(lookupMacro('Dahi')?.key).toBe('curd');
  });
});

/**
 * "Never trust a hand-typed calorie number" is the ticket's last line and the
 * reason this module exists. These are the tests that make it a rule.
 */
describe('what happens when it cannot be computed', () => {
  it('does not quietly return a total that is missing a third of the dish', () => {
    const r = computeRecipeNutrition([
      { name: 'Rice', grams: 100 },
      { name: 'Dragonfruit compote', grams: 80 },
    ]);
    expect(r.complete).toBe(false);
    expect(r.unknown).toEqual(['Dragonfruit compote']);
    expect(r.coverage).toBeLessThan(1);
  });

  it('prefers the computed figure when it is complete', () => {
    const computed = computeRecipeNutrition([{ name: 'Rice', grams: 100 }]);
    const p = presentNutrition(computed, { kcal: 9999, protein: 0, carb: 0, fat: 0, fibre: 0 });
    expect(p.verified).toBe(true);
    expect(p.macros.kcal).toBe(computed.kcal);
    expect(p.note).toBe('');
  });

  it('attributes the stored figure instead of passing it off as ours', () => {
    // The dataset's claim, labelled as the dataset's. This is the whole
    // difference between a number the app stands behind and one it inherited.
    const computed = computeRecipeNutrition([{ name: 'Unknowable paste', grams: 90 }]);
    const p = presentNutrition(computed, { kcal: 420, protein: 12, carb: 40, fat: 20, fibre: 3 });
    expect(p.verified).toBe(false);
    expect(p.macros.kcal).toBe(420);
    expect(p.note).toMatch(/From the recipe source/);
    expect(p.note).toMatch(/Unknowable paste/);
  });

  it('says a partial figure is probably low, rather than presenting it flat', () => {
    const computed = computeRecipeNutrition([
      { name: 'Rice', grams: 100 }, { name: 'Mystery sauce', grams: 50 },
    ]);
    const p = presentNutrition(computed, null);
    expect(p.verified).toBe(false);
    expect(p.note).toMatch(/underestimate/);
  });
});

describe('seasoning is resolved, not unknown', () => {
  it('does not mark a dish incomplete for being seasoned', () => {
    // A recipe is not unmeasurable because it contains cumin.
    const r = computeRecipeNutrition([
      { name: 'Rice', grams: 100 }, { name: 'Salt', grams: 3 },
      { name: 'Turmeric', grams: 2 }, { name: 'Cumin seeds', grams: 2 },
      { name: 'Water', grams: 200 },
    ]);
    expect(r.complete).toBe(true);
    expect(r.unknown).toEqual([]);
  });

  it('does not let water dilute the coverage figure', () => {
    const r = computeRecipeNutrition([{ name: 'Rice', grams: 100 }, { name: 'Water', grams: 900 }]);
    expect(r.coverage).toBe(1);
  });
});

describe('the table', () => {
  it('states a source on every row', () => {
    for (const m of INGREDIENT_MACROS) expect(m.source.length).toBeGreaterThan(10);
  });

  it('has no duplicate key or alias collision', () => {
    const names = INGREDIENT_MACROS.flatMap((m) => [m.key, ...m.aliases]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('marks a yield factor on anything that changes weight when cooked', () => {
    // Rice trebles when boiled. A plate of cooked rice weighed against a raw
    // figure reads three times the calories it has — the single most likely
    // way to get a plan badly wrong.
    expect(lookupMacro('rice')?.yieldFactor).toBe(3);
    expect(lookupMacro('toor dal')?.yieldFactor).toBeGreaterThan(1);
    // Things eaten as listed do not.
    expect(lookupMacro('paneer')?.yieldFactor).toBe(1);
    expect(lookupMacro('oil')?.yieldFactor).toBe(1);
  });

  it('holds macros that are internally plausible', () => {
    // 4/4/9 against the stated energy, within the slack that fibre and rounding
    // in a published table allow. Catches a transposed digit.
    for (const m of INGREDIENT_MACROS) {
      const fromMacros = m.protein * 4 + m.carb * 4 + m.fat * 9;
      const slack = Math.max(60, m.kcal * 0.25);
      expect([m.key, Math.abs(fromMacros - m.kcal) <= slack]).toEqual([m.key, true]);
    }
  });
});
