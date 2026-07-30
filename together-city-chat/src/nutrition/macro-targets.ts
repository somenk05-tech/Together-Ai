/**
 * Protein, fat, carbohydrate, fibre, sugar and water — and where each came
 * from (BE-7.2).
 *
 * Companion to energy.ts, same rules: pure, traceable, every number attached to
 * a published basis so FE-7.1's disclosure has something to render. The
 * arithmetic mostly matches what computeTargets() already does inline; what it
 * adds is the two things the ticket asks for that are simply not there today.
 *
 *   AN ESSENTIAL-FAT FLOOR. Fat is a flat 27% of energy with nothing under it.
 *   27% is inside the 20–35% adult range, so on its own it is fine — but the
 *   clinical rules elsewhere in this codebase cut saturated fat hard for high
 *   LDL and fatty liver, and nothing states the point below which total fat
 *   should not be pushed. Fat is how the fat-soluble vitamins are absorbed;
 *   "less fat" has a floor and this is where it gets written down.
 *
 *   A WATER TARGET. The ticket asks for one from body weight and activity.
 *   There is none anywhere in the service.
 *
 * ON THE WATER FIGURE, because this is the one people get wrong: the familiar
 * 3.7 L / 2.7 L adequate intakes are TOTAL water, food included, and food is
 * roughly a fifth of it. An app that prints 3.7 L next to a glass icon is
 * telling somebody to drink about a litre more than the source says. Both
 * numbers are returned here and named, and the one to show beside a glass is
 * `drinkingMl`.
 */

export type Sex = 'male' | 'female';
export type Goal = 'lose' | 'maintain' | 'gain';

/** Calories per gram. */
export const KCAL_PER_G = { protein: 4, carb: 4, fat: 9 } as const;

/**
 * Protein, g per kg of body weight per day.
 *
 * The bands are the ones already cited in computeTargets, kept verbatim so this
 * is a restatement and not a second opinion: healthy adult 0.8 · over 65
 * 1.0–1.2 · weight loss 1.2–1.6 · strength/gain 1.6–2.2 · endurance 1.2–1.7 ·
 * pregnancy and lactation ≥1.1 · growth 1.0. The highest applicable indication
 * wins, and kidney disease overrides all of them downward.
 */
export const PROTEIN_G_PER_KG = {
  adult: 0.8,
  over65: 1.1,
  losing: 1.4,
  gaining: 1.8,
  endurance: 1.4,
  pregnantOrLactating: 1.1,
  growing: 1.0,
  ckdNoDialysis: 0.7,   // 0.55–0.8, restricted
  ckdDialysis: 1.1,     // 1.0–1.2, raised again by losses in dialysate
} as const;

/** Total fat as a share of energy. 20–35% is the adult range; the floor is the
 *  part that was missing. */
export const FAT_PCT = { floor: 0.20, default: 0.27, ceiling: 0.35 } as const;

/** Fibre, grams per 1,000 kcal, with the range a plan is held to. */
export const FIBRE_G_PER_1000_KCAL = 14;
export const FIBRE_MIN = 25;
export const FIBRE_MAX = 50;

/** Added sugar as a share of energy — 10% is the ceiling, 5% the further benefit. */
export const ADDED_SUGAR_PCT = { ceiling: 0.10, better: 0.05 } as const;

/**
 * Total water, ml per kg per day, by age.
 *
 * The tiering is the standard clinical one: requirement per kilo falls with
 * age, which matters because the group most at risk of dehydration is the one
 * a flat rule over-serves on paper and under-serves in practice.
 */
export const WATER_ML_PER_KG = { under55: 35, to65: 30, over65: 25 } as const;

/** Share of total water that comes from food rather than drink. */
export const WATER_FROM_FOOD = 0.2;

/** Extra drinking water per day for sustained activity, in ml. */
export const WATER_ACTIVITY_BONUS_ML = 500;

export interface MacroInput {
  kcal: number;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  goal: Goal;
  /** The activity multiplier already used for energy. */
  activity: number;
  pregnantOrLactating?: boolean;
  /** 'none' | 'noDialysis' | 'dialysis' — kidney disease overrides protein downward. */
  kidney?: 'none' | 'noDialysis' | 'dialysis';
  /** Total fat as a share of energy, if a clinical rule has moved it. */
  fatPct?: number;
}

export interface MacroResult {
  proteinG: number;
  fatG: number;
  carbG: number;
  fibreG: number;
  addedSugarMaxG: number;
  water: { totalMl: number; drinkingMl: number };
  /** g/kg actually applied, and the weight it was applied to. */
  proteinPerKg: number;
  proteinBasisWeightKg: number;
  fatPctApplied: number;
  fatFloored: boolean;
  trace: { label: string; value: string; basis: string }[];
}

/**
 * Protein is prescribed per kg of a REFERENCE weight above BMI 27, not of
 * actual weight.
 *
 * Adipose tissue is not metabolically demanding in the way lean mass is, so
 * g/kg of actual weight overshoots badly at high BMI — 1.4 g/kg for a 140 kg
 * adult is 196 g of protein a day, which is not a target, it is a dare. The
 * reference weight is the weight at BMI 25 for that height.
 */
export function proteinBasisWeight(weightKg: number, heightCm: number): number {
  const h = heightCm / 100;
  if (h <= 0) return weightKg;
  const bmi = weightKg / (h * h);
  return bmi >= 27 ? Math.round(25 * h * h) : weightKg;
}

export function proteinPerKgFor(inp: Pick<MacroInput, 'age' | 'goal' | 'activity' | 'pregnantOrLactating' | 'kidney'>): number {
  // Kidney disease is not one indication among several — it overrides them.
  if (inp.kidney === 'noDialysis') return PROTEIN_G_PER_KG.ckdNoDialysis;
  if (inp.kidney === 'dialysis') return PROTEIN_G_PER_KG.ckdDialysis;

  let g: number = PROTEIN_G_PER_KG.adult;
  if (inp.age < 18) g = Math.max(g, PROTEIN_G_PER_KG.growing);
  if (inp.age > 65) g = Math.max(g, PROTEIN_G_PER_KG.over65);
  if (inp.goal === 'lose') g = Math.max(g, PROTEIN_G_PER_KG.losing);
  if (inp.goal === 'gain') g = Math.max(g, PROTEIN_G_PER_KG.gaining);
  if (inp.activity >= 1.8 && inp.goal !== 'gain') g = Math.max(g, PROTEIN_G_PER_KG.endurance);
  if (inp.pregnantOrLactating) g = Math.max(g, PROTEIN_G_PER_KG.pregnantOrLactating);
  return g;
}

/**
 * Total and drinking water.
 *
 * `drinkingMl` is the one to put next to a glass. `totalMl` is the figure the
 * references state, and it counts the water in food.
 */
export function waterTarget(inp: { weightKg: number; age: number; activity: number }): { totalMl: number; drinkingMl: number } {
  const perKg = inp.age > 65 ? WATER_ML_PER_KG.over65 : inp.age >= 55 ? WATER_ML_PER_KG.to65 : WATER_ML_PER_KG.under55;
  const totalMl = Math.round(inp.weightKg * perKg);
  const activityBonus = inp.activity >= 1.55 ? WATER_ACTIVITY_BONUS_ML : 0;
  return { totalMl, drinkingMl: Math.round(totalMl * (1 - WATER_FROM_FOOD)) + activityBonus };
}

/**
 * The full macro prescription for a day.
 *
 * Carbohydrate is the remainder, and it is floored at zero rather than allowed
 * to go negative: a very low energy target with a high protein prescription can
 * ask for more protein and fat than the calories allow, and a negative carb
 * figure would propagate silently into a plate.
 */
export function macroTargets(inp: MacroInput): MacroResult {
  const basisWeight = proteinBasisWeight(inp.weightKg, inp.heightCm);
  const proteinPerKg = proteinPerKgFor(inp);
  const proteinG = Math.round(basisWeight * proteinPerKg);

  const requestedFatPct = inp.fatPct ?? FAT_PCT.default;
  const fatPctApplied = Math.min(FAT_PCT.ceiling, Math.max(FAT_PCT.floor, requestedFatPct));
  const fatFloored = requestedFatPct < FAT_PCT.floor;
  const fatG = Math.round((inp.kcal * fatPctApplied) / KCAL_PER_G.fat);

  const spent = proteinG * KCAL_PER_G.protein + fatG * KCAL_PER_G.fat;
  const carbG = Math.max(0, Math.round((inp.kcal - spent) / KCAL_PER_G.carb));

  const fibreG = Math.max(FIBRE_MIN, Math.min(FIBRE_MAX, Math.round((inp.kcal / 1000) * FIBRE_G_PER_1000_KCAL)));
  const addedSugarMaxG = Math.round((inp.kcal * ADDED_SUGAR_PCT.ceiling) / KCAL_PER_G.carb);
  const water = waterTarget(inp);

  const trace: { label: string; value: string; basis: string }[] = [
    {
      label: 'Protein', value: `${proteinG} g`,
      basis: `${proteinPerKg} g per kg`
        + (basisWeight !== inp.weightKg ? ` of a reference weight of ${basisWeight} kg for your height, rather than of your current weight` : ' of body weight')
        + (inp.kidney && inp.kidney !== 'none' ? ' — restricted for kidney function, which overrides every other indication' : ''),
    },
    {
      label: 'Fat', value: `${fatG} g`,
      basis: `${Math.round(fatPctApplied * 100)}% of your calories`
        + (fatFloored ? `, held at the ${Math.round(FAT_PCT.floor * 100)}% floor — fat is how the fat-soluble vitamins are absorbed` : ''),
    },
    { label: 'Carbohydrate', value: `${carbG} g`, basis: 'whatever is left after protein and fat' },
    { label: 'Fibre', value: `${fibreG} g`, basis: `${FIBRE_G_PER_1000_KCAL} g per 1,000 kcal, kept within ${FIBRE_MIN}–${FIBRE_MAX} g` },
    { label: 'Added sugar', value: `under ${addedSugarMaxG} g`, basis: `${Math.round(ADDED_SUGAR_PCT.ceiling * 100)}% of your calories — a ceiling, not a target` },
    {
      label: 'Water to drink', value: `${(water.drinkingMl / 1000).toFixed(1)} L`,
      basis: `${water.totalMl} ml total for your weight and age, less the fifth of it that comes from food`
        + (inp.activity >= 1.55 ? `, plus ${WATER_ACTIVITY_BONUS_ML} ml for activity` : ''),
    },
  ];

  return {
    proteinG, fatG, carbG, fibreG, addedSugarMaxG, water,
    proteinPerKg, proteinBasisWeightKg: basisWeight, fatPctApplied, fatFloored, trace,
  };
}
