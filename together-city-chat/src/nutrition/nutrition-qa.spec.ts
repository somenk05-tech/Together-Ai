import { auditRecipe, atwaterKcal, lookupPer100, type QaRecipe } from './nutrition-qa';

describe('nutrition QA (ingredient-level ground truth)', () => {
  it('recomputes a wildly wrong recipe from its ingredients (the olive-oil "snack")', () => {
    // Real dataset row: stored 168 kcal, but ingredients carry 120 g olive oil.
    const rec: QaRecipe = {
      id: 'x', name: 'Italian Garden Vegetable Curry', slot: 's',
      kcal: 168, protein: 3, carbs: 3, fat: 17, fiber: 1, servings: 1, gramsPerServing: 40,
      ingredients: [
        { name: 'salt', grams: 30 }, { name: 'cilantro', grams: 100 },
        { name: 'parsley', grams: 100 }, { name: 'mixed nuts', grams: 120 },
        { name: 'olive oil', grams: 120 },
      ],
    };
    const res = auditRecipe(rec);
    expect(res.fix).not.toBeNull();
    const f = res.fix!;
    // 120 g oil (~1060) + 120 g nuts (~720) can never be a 168-kcal single serving:
    // the batch is re-declared as several servings; stored values are BATCH
    // totals (recipeShape divides by servings for display).
    expect(f.servings).toBeGreaterThan(1);
    const perServing = f.kcal / f.servings;
    expect(perServing).toBeGreaterThan(60);
    expect(perServing).toBeLessThanOrEqual(600); // plausible snack window
    // Atwater consistency of the corrected values (batch level)
    const aw = atwaterKcal(f.protein, f.carbs, f.fat);
    expect(Math.abs(aw - f.kcal) / f.kcal).toBeLessThan(0.12);
    expect(res.issues.length).toBeGreaterThan(0);
  });

  it('leaves a sane recipe essentially unchanged', () => {
    // Masala Oats seed: 60 g oats (~228) + 80 g veg (~32) + 5 g spices ≈ 263 vs 320 stored.
    const rec: QaRecipe = {
      id: 'y', name: 'Masala Oats', slot: 'b',
      kcal: 320, protein: 12, carbs: 48, fat: 8, fiber: 7, servings: 1, gramsPerServing: 280,
      ingredients: [
        { name: 'Oats', grams: 60 }, { name: 'Mixed vegetables', grams: 80 }, { name: 'Spices', grams: 5 },
      ],
    };
    const res = auditRecipe(rec);
    if (res.fix) {
      const per = res.fix.kcal / res.fix.servings;
      expect(per).toBeGreaterThan(180);
      expect(per).toBeLessThan(430);
      expect(res.fix.servings).toBe(1);
    }
  });

  it('normalises macros that cannot explain the stored calories (Atwater)', () => {
    const rec: QaRecipe = {
      id: 'z', name: 'Mystery Bowl', slot: 'l',
      kcal: 900, protein: 5, carbs: 10, fat: 5, fiber: 1, servings: 1, gramsPerServing: 300,
      ingredients: [{ name: 'secret sauce blend xyz', grams: 300 }], // unrecognised → low coverage
    };
    const res = auditRecipe(rec);
    expect(res.fix).not.toBeNull();
    const f = res.fix!;
    const aw = atwaterKcal(f.protein, f.carbs, f.fat);
    expect(Math.abs(aw - f.kcal) / f.kcal).toBeLessThan(0.12);
    expect(res.issues.join(' ')).toMatch(/Atwater|coverage/);
  });

  it('caps implausible protein for the energy present', () => {
    const rec: QaRecipe = {
      id: 'w', name: 'Green Salad', slot: 's',
      kcal: 120, protein: 50, carbs: 6, fat: 2, fiber: 3, servings: 1, gramsPerServing: 200,
      ingredients: [{ name: 'lettuce', grams: 150 }, { name: 'cucumber', grams: 80 }],
    };
    const res = auditRecipe(rec);
    expect(res.fix).not.toBeNull();
    // ≤45% of energy from protein: 120 kcal → ≤13.5 g
    expect(res.fix!.protein).toBeLessThanOrEqual(14);
  });

  it('ingredient table recognises core staples', () => {
    for (const n of ['basmati rice', 'toor dal', 'paneer', 'chicken breast', 'olive oil', 'spinach', 'salt']) {
      expect(lookupPer100(n)).not.toBeNull();
    }
  });
});
