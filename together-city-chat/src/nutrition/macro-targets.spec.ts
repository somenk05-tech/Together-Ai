import {
  ADDED_SUGAR_PCT, FAT_PCT, KCAL_PER_G, PROTEIN_G_PER_KG, WATER_FROM_FOOD,
  macroTargets, proteinBasisWeight, proteinPerKgFor, waterTarget,
} from './macro-targets';

const adult = {
  kcal: 2000, weightKg: 70, heightCm: 172, age: 32, sex: 'male' as const,
  goal: 'maintain' as const, activity: 1.375,
};

describe('the macros reconcile with the calorie figure', () => {
  it('protein, fat and carbohydrate add back up to the energy target', () => {
    // A prescription whose parts do not sum to the whole is the fastest way to
    // lose someone's trust in every other number on the page.
    for (const kcal of [1400, 1800, 2200, 2600, 3200]) {
      const m = macroTargets({ ...adult, kcal });
      const sum = m.proteinG * KCAL_PER_G.protein + m.fatG * KCAL_PER_G.fat + m.carbG * KCAL_PER_G.carb;
      expect(Math.abs(sum - kcal)).toBeLessThanOrEqual(4);   // one gram of rounding
    }
  });

  it('never returns a negative carbohydrate figure', () => {
    // A small, very low target with a high protein prescription can ask for
    // more protein and fat than the calories allow.
    const m = macroTargets({
      ...adult, kcal: 1200, weightKg: 95, heightCm: 160, goal: 'gain', age: 30,
    });
    expect(m.carbG).toBeGreaterThanOrEqual(0);
  });
});

describe('protein', () => {
  it('takes the highest applicable indication', () => {
    expect(proteinPerKgFor({ age: 30, goal: 'maintain', activity: 1.2 })).toBe(PROTEIN_G_PER_KG.adult);
    expect(proteinPerKgFor({ age: 30, goal: 'lose', activity: 1.2 })).toBe(PROTEIN_G_PER_KG.losing);
    expect(proteinPerKgFor({ age: 30, goal: 'gain', activity: 1.2 })).toBe(PROTEIN_G_PER_KG.gaining);
    expect(proteinPerKgFor({ age: 70, goal: 'maintain', activity: 1.2 })).toBe(PROTEIN_G_PER_KG.over65);
    expect(proteinPerKgFor({ age: 30, goal: 'maintain', activity: 1.9 })).toBe(PROTEIN_G_PER_KG.endurance);
  });

  it('lets kidney disease override every one of them, downward', () => {
    // The one indication that is not "highest wins". An athlete on dialysis
    // does not get the athlete's number.
    expect(proteinPerKgFor({ age: 30, goal: 'gain', activity: 1.9, kidney: 'noDialysis' }))
      .toBe(PROTEIN_G_PER_KG.ckdNoDialysis);
    expect(proteinPerKgFor({ age: 30, goal: 'gain', activity: 1.9, kidney: 'dialysis' }))
      .toBe(PROTEIN_G_PER_KG.ckdDialysis);
    expect(PROTEIN_G_PER_KG.ckdNoDialysis).toBeLessThan(PROTEIN_G_PER_KG.adult);
  });

  it('is prescribed per kg of a reference weight above BMI 27', () => {
    // 1.4 g/kg of 140 kg is 196 g of protein a day. That is not a target.
    expect(proteinBasisWeight(70, 172)).toBe(70);          // BMI ~23.7, unchanged
    const big = proteinBasisWeight(140, 175);              // BMI ~45.7
    expect(big).toBeLessThan(140);
    expect(big).toBe(Math.round(25 * 1.75 * 1.75));        // the weight at BMI 25
  });

  it('says in the trace when it used a reference weight', () => {
    const m = macroTargets({ ...adult, weightKg: 140, heightCm: 175, goal: 'lose' });
    expect(m.proteinBasisWeightKg).toBeLessThan(140);
    expect(m.trace.find((t) => t.label === 'Protein')?.basis).toMatch(/reference weight/);
  });
});

describe('the essential-fat floor', () => {
  it('exists, and is below the default', () => {
    expect(FAT_PCT.floor).toBe(0.20);
    expect(FAT_PCT.default).toBeGreaterThan(FAT_PCT.floor);
  });

  it('stops a clinical rule pushing fat below it, and says so', () => {
    const m = macroTargets({ ...adult, fatPct: 0.12 });
    expect(m.fatPctApplied).toBe(FAT_PCT.floor);
    expect(m.fatFloored).toBe(true);
    expect(m.trace.find((t) => t.label === 'Fat')?.basis).toMatch(/fat-soluble vitamins/);
  });

  it('leaves a fat share inside the range alone', () => {
    const m = macroTargets({ ...adult, fatPct: 0.30 });
    expect(m.fatPctApplied).toBe(0.30);
    expect(m.fatFloored).toBe(false);
  });

  it('holds the ceiling too', () => {
    expect(macroTargets({ ...adult, fatPct: 0.60 }).fatPctApplied).toBe(FAT_PCT.ceiling);
  });
});

describe('water', () => {
  it('separates total water from water to drink', () => {
    // The mistake this exists to avoid: printing the total next to a glass.
    const w = waterTarget({ weightKg: 70, age: 32, activity: 1.2 });
    expect(w.totalMl).toBe(70 * 35);
    expect(w.drinkingMl).toBe(Math.round(w.totalMl * (1 - WATER_FROM_FOOD)));
    expect(w.drinkingMl).toBeLessThan(w.totalMl);
  });

  it('asks less per kilo of an older body, which is the standard tiering', () => {
    const young = waterTarget({ weightKg: 70, age: 40, activity: 1.2 });
    const older = waterTarget({ weightKg: 70, age: 70, activity: 1.2 });
    expect(older.totalMl).toBeLessThan(young.totalMl);
  });

  it('adds for sustained activity', () => {
    const still = waterTarget({ weightKg: 70, age: 32, activity: 1.2 });
    const active = waterTarget({ weightKg: 70, age: 32, activity: 1.725 });
    expect(active.drinkingMl - still.drinkingMl).toBe(500);
    expect(active.totalMl).toBe(still.totalMl);   // activity moves drink, not the per-kg rule
  });

  it('shows the litres figure, and it is the drinking one', () => {
    const m = macroTargets({ ...adult, activity: 1.2 });
    const line = m.trace.find((t) => t.label === 'Water to drink');
    expect(line?.value).toBe(`${(m.water.drinkingMl / 1000).toFixed(1)} L`);
    expect(line?.basis).toMatch(/comes from food/);
  });
});

describe('fibre and added sugar', () => {
  it('scales fibre with energy but keeps it in a sane band', () => {
    expect(macroTargets({ ...adult, kcal: 1200 }).fibreG).toBe(25);   // floor
    expect(macroTargets({ ...adult, kcal: 2000 }).fibreG).toBe(28);
    expect(macroTargets({ ...adult, kcal: 5000 }).fibreG).toBe(50);   // ceiling
  });

  it('caps added sugar at a tenth of energy, and calls it a ceiling', () => {
    const m = macroTargets({ ...adult, kcal: 2000 });
    expect(m.addedSugarMaxG).toBe(Math.round((2000 * ADDED_SUGAR_PCT.ceiling) / KCAL_PER_G.carb));
    expect(m.trace.find((t) => t.label === 'Added sugar')?.basis).toMatch(/ceiling, not a target/);
  });
});

describe('the disclosure', () => {
  it('gives every figure a stated basis, not just a value', () => {
    const m = macroTargets(adult);
    expect(m.trace.map((t) => t.label)).toEqual([
      'Protein', 'Fat', 'Carbohydrate', 'Fibre', 'Added sugar', 'Water to drink',
    ]);
    for (const t of m.trace) {
      expect([t.label, t.basis.length > 10]).toEqual([t.label, true]);
    }
  });
});
