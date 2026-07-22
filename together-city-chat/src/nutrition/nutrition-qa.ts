/**
 * Nutrition QA engine — ingredient-level ground truth for the recipe database.
 *
 * Every recipe's macros must derive from its ingredient list and gram weights,
 * not from imported estimates. This module:
 *  1. computes per-serving nutrition from ingredients (per-100g table below),
 *  2. validates with Atwater factors (P=4, C=4, F=9 kcal/g),
 *  3. flags discrepancies beyond tolerance and produces corrected values,
 *  4. fixes implausible serving counts (a 2,900-kcal "single serving" batch is
 *     re-declared as the 4 servings it actually is),
 *  5. clamps physiologically impossible values (protein/fat > energy, fibre
 *     beyond real-food ceilings) as a final safety net.
 *
 * The audit runs once per QA version over the whole table at boot (async, in
 * batches) and persists corrections — so the planner, recipe pages, grocery
 * and the Daily Nutrition Overview all read the SAME validated numbers.
 */

export interface QaIngredient { name: string; grams: number }
export interface QaRecipe {
  id: string; name: string; slot: string; kcal: number; protein: number;
  carbs: number; fat: number; fiber: number; servings?: number | null;
  gramsPerServing: number; ingredients: QaIngredient[];
}

interface Per100 { kcal: number; p: number; c: number; f: number; fb: number }

/** Per-100 g nutrition for ingredient keyword classes (Indian + global staples). */
const TABLE: Array<[RegExp, Per100]> = [
  // fats & oils
  [/ghee|clarified butter/i, { kcal: 900, p: 0, c: 0, f: 100, fb: 0 }],
  [/butter/i, { kcal: 717, p: 0.9, c: 0.1, f: 81, fb: 0 }],
  [/olive oil|sunflower oil|mustard oil|vegetable oil|sesame oil|coconut oil|\boil\b/i, { kcal: 884, p: 0, c: 0, f: 100, fb: 0 }],
  [/cream/i, { kcal: 340, p: 2, c: 3, f: 36, fb: 0 }],
  [/mayonnaise|mayo/i, { kcal: 680, p: 1, c: 1, f: 75, fb: 0 }],
  // dairy & alternatives
  [/paneer|cottage cheese/i, { kcal: 265, p: 18, c: 3, f: 21, fb: 0 }],
  [/cheese|parmesan|mozzarella|feta/i, { kcal: 350, p: 24, c: 3, f: 27, fb: 0 }],
  [/greek yogurt/i, { kcal: 73, p: 10, c: 4, f: 2, fb: 0 }],
  [/curd|yogurt|dahi|raita|buttermilk|chaas/i, { kcal: 62, p: 3.5, c: 4.7, f: 3.3, fb: 0 }],
  [/almond milk|soy milk|oat milk/i, { kcal: 40, p: 1.2, c: 4, f: 2, fb: 0.4 }],
  [/milk/i, { kcal: 62, p: 3.2, c: 4.8, f: 3.4, fb: 0 }],
  [/tofu/i, { kcal: 76, p: 8, c: 2, f: 4.5, fb: 0.3 }],
  [/soy(a)? (chunk|granule|nugget)|soybean/i, { kcal: 345, p: 43, c: 30, f: 19, fb: 9 }],
  [/whey|protein powder/i, { kcal: 400, p: 80, c: 8, f: 6, fb: 0 }],
  // meats, fish, egg
  [/chicken/i, { kcal: 165, p: 27, c: 0, f: 6, fb: 0 }],
  [/mutton|lamb|goat/i, { kcal: 240, p: 25, c: 0, f: 15, fb: 0 }],
  [/beef/i, { kcal: 250, p: 26, c: 0, f: 15, fb: 0 }],
  [/pork|bacon|ham|sausage/i, { kcal: 270, p: 24, c: 1, f: 19, fb: 0 }],
  [/salmon|mackerel|sardine|hilsa/i, { kcal: 200, p: 22, c: 0, f: 12, fb: 0 }],
  [/prawn|shrimp/i, { kcal: 100, p: 21, c: 1, f: 1.5, fb: 0 }],
  [/fish|rohu|tuna|tilapia|cod|seafood/i, { kcal: 130, p: 22, c: 0, f: 4, fb: 0 }],
  [/egg/i, { kcal: 155, p: 13, c: 1, f: 11, fb: 0 }],
  // pulses & legumes (dry-weight densities)
  [/dal|lentil|masoor|moong|toor|arhar|urad|chana(?! masala)|chickpea|garbanzo|rajma|kidney bean|black bean|lobia|bean/i, { kcal: 340, p: 22, c: 58, f: 2.5, fb: 12 }],
  [/sprout/i, { kcal: 60, p: 6, c: 9, f: 0.6, fb: 2.5 }],
  [/hummus|falafel/i, { kcal: 230, p: 8, c: 22, f: 13, fb: 6 }],
  // grains & starches
  [/basmati|rice|poha|flattened rice|idli|dosa batter|sushi rice/i, { kcal: 350, p: 7, c: 78, f: 0.8, fb: 1.5 }],
  [/quinoa/i, { kcal: 368, p: 14, c: 64, f: 6, fb: 7 }],
  [/oats|oat/i, { kcal: 380, p: 13, c: 67, f: 7, fb: 10 }],
  [/ragi|finger millet|millet|bajra|jowar|amaranth|rajgira|barley|daliya|semolina|rava|sooji/i, { kcal: 350, p: 10, c: 70, f: 3, fb: 8 }],
  [/wheat flour|atta|maida|gram flour|besan|flour/i, { kcal: 350, p: 11, c: 70, f: 2, fb: 8 }],
  [/roti|chapati|paratha|naan|pita|tortilla|bread|toast|bun|sourdough/i, { kcal: 270, p: 9, c: 50, f: 4, fb: 4 }],
  [/pasta|penne|spaghetti|noodle|macaroni/i, { kcal: 360, p: 12, c: 72, f: 2, fb: 3 }],
  [/sago|sabudana|tapioca/i, { kcal: 350, p: 0.2, c: 87, f: 0, fb: 0.9 }],
  [/makhana|foxnut/i, { kcal: 350, p: 10, c: 77, f: 0.5, fb: 7.5 }],
  [/granola|muesli|cornflake|cereal/i, { kcal: 420, p: 9, c: 70, f: 12, fb: 6 }],
  [/potato/i, { kcal: 80, p: 2, c: 17, f: 0.1, fb: 2 }],
  [/sweet potato/i, { kcal: 86, p: 1.6, c: 20, f: 0.1, fb: 3 }],
  // nuts & seeds
  [/peanut butter/i, { kcal: 590, p: 25, c: 20, f: 50, fb: 6 }],
  [/almond|cashew|walnut|pista|nuts|badam|kaju/i, { kcal: 600, p: 20, c: 20, f: 52, fb: 8 }],
  [/peanut|groundnut/i, { kcal: 570, p: 26, c: 16, f: 49, fb: 8 }],
  [/chia|flax|sunflower seed|pumpkin seed|sesame|til|seed/i, { kcal: 550, p: 20, c: 25, f: 43, fb: 25 }],
  [/coconut/i, { kcal: 350, p: 3, c: 15, f: 33, fb: 9 }],
  [/avocado/i, { kcal: 160, p: 2, c: 9, f: 15, fb: 7 }],
  // vegetables & greens
  [/spinach|palak|methi|greens|kale|amaranth leaves|saag|lettuce|cabbage|broccoli|cauliflower/i, { kcal: 30, p: 2.5, c: 4.5, f: 0.4, fb: 2.5 }],
  [/tomato/i, { kcal: 18, p: 0.9, c: 3.9, f: 0.2, fb: 1.2 }],
  [/onion/i, { kcal: 40, p: 1.1, c: 9, f: 0.1, fb: 1.7 }],
  [/carrot|beetroot|pumpkin|gourd|lauki|zucchini|cucumber|capsicum|bell pepper|brinjal|eggplant|okra|bhindi|beans?\b|peas|matar|mixed vegetable|vegetable|veg\b/i, { kcal: 40, p: 1.8, c: 8, f: 0.3, fb: 2.5 }],
  [/mushroom/i, { kcal: 22, p: 3.1, c: 3.3, f: 0.3, fb: 1 }],
  [/corn|sweetcorn/i, { kcal: 96, p: 3.4, c: 21, f: 1.5, fb: 2.4 }],
  // fruit
  [/banana/i, { kcal: 89, p: 1.1, c: 23, f: 0.3, fb: 2.6 }],
  [/mango|chikoo|sapota/i, { kcal: 65, p: 0.6, c: 16, f: 0.3, fb: 1.8 }],
  [/apple|pear|guava|orange|mosambi|papaya|melon|berries|berry|grape|pomegranate|fruit/i, { kcal: 55, p: 0.7, c: 13.5, f: 0.3, fb: 2.5 }],
  [/dates|raisin|dry fruit/i, { kcal: 300, p: 2.5, c: 75, f: 0.4, fb: 7 }],
  // sweeteners & condiments
  [/sugar|jaggery|honey|syrup/i, { kcal: 390, p: 0, c: 98, f: 0, fb: 0 }],
  [/chocolate|cocoa/i, { kcal: 500, p: 6, c: 55, f: 30, fb: 7 }],
  [/tomato sauce|salsa|gravy|curry paste|pesto/i, { kcal: 90, p: 2.5, c: 10, f: 4.5, fb: 1.5 }],
  [/soy sauce|vinegar|lemon|lime|tamarind/i, { kcal: 30, p: 1, c: 6, f: 0, fb: 0.3 }],
  [/salt/i, { kcal: 0, p: 0, c: 0, f: 0, fb: 0 }],
  [/spice|masala|turmeric|chilli|chili|pepper|cumin|coriander seed|garam|ginger|garlic|herbs?|cilantro|parsley|mint|pudina|curry leaves|tempering/i, { kcal: 60, p: 3, c: 10, f: 1.5, fb: 3 }],
  [/water|ice/i, { kcal: 0, p: 0, c: 0, f: 0, fb: 0 }],
];

export function lookupPer100(name: string): Per100 | null {
  for (const [re, v] of TABLE) if (re.test(name)) return v;
  return null;
}

export const atwaterKcal = (p: number, c: number, f: number): number => 4 * p + 4 * c + 9 * f;

/** Plausible per-serving calorie windows per slot (QA rule + servings repair). */
const SLOT_KCAL: Record<string, { min: number; max: number; typical: number }> = {
  b: { min: 140, max: 900, typical: 420 },
  l: { min: 200, max: 1100, typical: 620 },
  d: { min: 200, max: 1100, typical: 580 },
  s: { min: 60, max: 600, typical: 250 },
};

export interface QaResult {
  issues: string[];
  /** null → recipe passed; otherwise the corrected values to persist. */
  fix: null | {
    kcal: number; protein: number; carbs: number; fat: number; fiber: number;
    servings: number; gramsPerServing: number;
  };
  coverage: number; // fraction of ingredient grams the table recognised
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Audit ONE recipe. Ingredient-derived nutrition is the ground truth when the
 * table recognises enough of the ingredient mass (≥60%); otherwise the stored
 * kcal is kept and macros are Atwater-normalised to it. All results pass the
 * physiological clamps.
 */
export function auditRecipe(rec: QaRecipe, tolerancePct = 5): QaResult {
  const issues: string[] = [];
  const totalGrams = rec.ingredients.reduce((s, i) => s + Math.max(0, i.grams), 0);
  let matchedGrams = 0;
  const tot = { kcal: 0, p: 0, c: 0, f: 0, fb: 0 };
  for (const ing of rec.ingredients) {
    const v = lookupPer100(ing.name);
    if (!v) continue;
    const g = Math.max(0, ing.grams);
    matchedGrams += g;
    tot.kcal += (v.kcal * g) / 100; tot.p += (v.p * g) / 100; tot.c += (v.c * g) / 100;
    tot.f += (v.f * g) / 100; tot.fb += (v.fb * g) / 100;
  }
  const coverage = totalGrams > 0 ? matchedGrams / totalGrams : 0;

  let kcal: number, p: number, c: number, f: number, fb: number;
  let servings = Math.max(1, Math.round(rec.servings ?? 1));
  let gramsPerServing = rec.gramsPerServing;

  if (coverage >= 0.6 && tot.kcal > 0) {
    // Ground truth: the ingredients. Macros come straight from ingredient mass;
    // calories are DERIVED from them (Atwater) so kcal and macros can never
    // disagree. Servings are re-declared so each serving lands in a realistic
    // calorie window for its slot.
    //
    // STORAGE CONVENTION (matches recipeShape/recipeServings): rows store
    // BATCH TOTALS + the serving count; every consumer divides by servings.
    const totalAw = atwaterKcal(tot.p, tot.c, tot.f);
    const win = SLOT_KCAL[rec.slot] ?? SLOT_KCAL.l;
    servings = Math.max(1, Math.round(totalAw / win.typical)) || 1;
    let per = totalAw / servings;
    if (per > win.max) { servings = Math.ceil(totalAw / win.max); per = totalAw / servings; }
    if (per < win.min && servings > 1) { servings = Math.max(1, Math.floor(totalAw / win.min)); per = totalAw / servings; }
    // batch totals (per-serving = these ÷ servings, done by recipeShape)
    p = r1(tot.p); c = r1(tot.c); f = r1(tot.f);
    kcal = Math.round(atwaterKcal(p, c, f));
    fb = r1(tot.fb);
    gramsPerServing = Math.max(40, Math.round(totalGrams));
    const storedServings = Math.max(1, Math.round(rec.servings ?? 1));
    const storedPer = rec.kcal / storedServings;
    const drift = storedPer > 0 ? Math.abs(per - storedPer) / storedPer : 1;
    if (drift * 100 > tolerancePct) issues.push(`ingredient-derived kcal ${Math.round(per)}/serving vs stored ${Math.round(storedPer)} (${Math.round(drift * 100)}% off)`);
    if (storedServings !== servings) issues.push(`servings ${storedServings} → ${servings} (batch of ${Math.round(totalAw)} kcal)`);
    // fibre ceiling is the only clamp needed — macros are real ingredient mass
    fb = Math.max(0, Math.min(fb, r1((kcal / 1000) * 16), r1(Math.max(c, 0))));
  } else {
    // Table can't see enough of the dish — keep stored kcal, normalise macros
    // to it with Atwater and apply the physiological clamps.
    kcal = rec.kcal; p = rec.protein; c = rec.carbs; f = rec.fat; fb = rec.fiber;
    if (coverage < 0.6) issues.push(`low ingredient coverage (${Math.round(coverage * 100)}%) — Atwater-normalised only`);
    const aw = atwaterKcal(p, c, f);
    if (kcal > 0 && Math.abs(aw - kcal) / kcal * 100 > tolerancePct) {
      issues.push(`Atwater ${Math.round(aw)} kcal vs ${kcal} kcal`);
      if (aw > 0) {
        const scale = kcal / aw;
        p = r1(p * scale); c = r1(c * scale); f = r1(f * scale);
      }
    }
    p = Math.min(p, r1((kcal * 0.45) / 4));
    f = Math.min(f, r1((kcal * 0.65) / 9));
    c = Math.max(0, Math.min(c, r1(Math.max(0, kcal - 4 * p - 9 * f) / 4)));
    fb = Math.max(0, Math.min(fb, r1((kcal / 1000) * 16), r1(Math.max(c, 0))));
  }

  const changed = Math.abs(kcal - rec.kcal) > 1 || Math.abs(p - rec.protein) > 0.5
    || Math.abs(c - rec.carbs) > 1 || Math.abs(f - rec.fat) > 0.5
    || Math.abs(fb - rec.fiber) > 0.5 || servings !== Math.max(1, Math.round(rec.servings ?? 1))
    || Math.abs(gramsPerServing - rec.gramsPerServing) > 5;

  // Implausibility flags on PER-SERVING values (reported even when fixed).
  const win = SLOT_KCAL[rec.slot] ?? SLOT_KCAL.l;
  const perK = kcal / servings, perP = p / servings, perF = f / servings;
  if (perK > win.max || perK < win.min) issues.push(`kcal ${Math.round(perK)}/serving outside plausible ${rec.slot}-slot window ${win.min}–${win.max}`);
  if (perP > 60) issues.push(`protein ${r1(perP)} g/serving implausible`);
  if (perK > 700 && perF < 8) issues.push(`${Math.round(perK)} kcal with only ${r1(perF)} g fat — implausible energy source`);

  return {
    issues,
    coverage: r1(coverage),
    fix: changed ? { kcal, protein: r1(p), carbs: r1(c), fat: r1(f), fiber: r1(fb), servings, gramsPerServing } : null,
  };
}
