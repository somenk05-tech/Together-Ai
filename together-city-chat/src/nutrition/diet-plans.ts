import { conditionMatcher } from './condition-match';

/**
 * Diet Plan Guide (uploaded reference): 24 evidence-based named diet patterns.
 * BACKEND-ASSIGNED — the engine decides which plans apply to a user from their
 * medical conditions, blood flags, goal, age and diet preference; the user
 * never picks. Assigned plans then BIAS recipe selection (small additive nudge
 * on the nutritional fit score) and are surfaced read-only ("Your plan follows
 * Renal + Diabetic principles"). Personalization stays primary, exactly as the
 * guide's own note prescribes: plans describe the outcome, they don't replace
 * the per-user prescription.
 */

export interface DietPlanDef {
  key: string;
  label: string;
  goal: string;
}

export const DIET_PLAN_CATALOG: DietPlanDef[] = [
  { key: 'mediterranean', label: 'Mediterranean', goal: 'Heart health' },
  { key: 'dash', label: 'DASH', goal: 'Lower blood pressure' },
  { key: 'mind', label: 'MIND', goal: 'Brain health' },
  { key: 'flexitarian', label: 'Flexitarian', goal: 'Balanced eating' },
  { key: 'vegetarian', label: 'Vegetarian', goal: 'Plant-based nutrition' },
  { key: 'vegan', label: 'Vegan', goal: '100% plant-based' },
  { key: 'eggetarian', label: 'Eggetarian', goal: 'Vegetarian + eggs' },
  { key: 'jain', label: 'Jain', goal: 'Religious dietary pattern' },
  { key: 'lowGlycemic', label: 'Low Glycemic', goal: 'Blood sugar control' },
  { key: 'diabetic', label: 'Diabetic Diet', goal: 'Glucose management' },
  { key: 'renal', label: 'Renal Diet', goal: 'Kidney protection' },
  { key: 'liverFriendly', label: 'Liver-Friendly', goal: 'Reduce liver fat' },
  { key: 'heartHealthy', label: 'Heart Healthy', goal: 'Improve lipids' },
  { key: 'highProtein', label: 'High Protein', goal: 'Muscle maintenance' },
  { key: 'weightLoss', label: 'Weight Loss', goal: 'Calorie deficit' },
  { key: 'weightGain', label: 'Weight Gain', goal: 'Calorie surplus' },
  { key: 'muscleGain', label: 'Muscle Gain', goal: 'Lean mass' },
  { key: 'lowCarb', label: 'Low Carb', goal: 'Reduce carbohydrate intake' },
  { key: 'lowFat', label: 'Low Fat', goal: 'Reduce dietary fat' },
  { key: 'highFibre', label: 'High Fibre', goal: 'Digestive & metabolic health' },
  { key: 'pregnancy', label: 'Pregnancy', goal: 'Maternal nutrition' },
  { key: 'pediatric', label: 'Pediatric', goal: 'Growth' },
  { key: 'geriatric', label: 'Geriatric', goal: 'Healthy ageing' },
  { key: 'sports', label: 'Sports Nutrition', goal: 'Performance' },
];

const LABEL = new Map(DIET_PLAN_CATALOG.map((p) => [p.key, p.label]));
export const planLabel = (key: string): string => LABEL.get(key) ?? key;

export interface PlanAssignInput {
  conditions: string[];               // ex.healthConditions
  flags: Record<string, string>;      // blood marker flags (low/normal/high)
  goal: string;                       // lose | maintain | gain
  diet: string;                       // everything | veg | vegan | jain | egg | pesc | nonveg
  age: number;
}

/**
 * Decide which named plans this user's profile corresponds to. Conditions come
 * first (they override generic goals — e.g. renal suppresses high-protein
 * patterns); diet-preference plans are informational labels.
 */
export function assignDietPlans(inp: PlanAssignInput): string[] {
  const out: string[] = [];
  // One matcher for the whole hub — this call site asked has('kidney')
  // alone, so 'CKD stage 4' got the ceilings and no renal PLAN.
  const has = conditionMatcher(inp.conditions);
  const renal = has('kidney');

  // Clinical plans (priority order)
  if (renal) out.push('renal');
  if (has('diabetes') || inp.flags.hba1c === 'high') { out.push('diabetic', 'lowGlycemic'); }
  if (has('hypertension')) out.push('dash');
  if (has('fatty liver')) out.push('liverFriendly');
  if (has('cholesterol') || inp.flags.ldl === 'high' || inp.flags.trig === 'high') out.push('heartHealthy', 'mediterranean');

  // Goal plans — never fight a renal protein cap
  if (inp.goal === 'lose') out.push('weightLoss');
  if (inp.goal === 'gain' && !renal) out.push('muscleGain', 'highProtein');
  if (inp.goal === 'gain' && renal) out.push('weightGain');

  // Fibre pattern rides with diabetes / lipids
  if ((has('diabetes') || inp.flags.hba1c === 'high' || inp.flags.ldl === 'high') && !out.includes('highFibre')) out.push('highFibre');

  // Diet-preference labels (informational)
  if (inp.diet === 'veg') out.push('vegetarian');
  if (inp.diet === 'vegan') out.push('vegan');
  if (inp.diet === 'egg') out.push('eggetarian');
  if (inp.diet === 'jain') out.push('jain');
  if (inp.diet === 'everything' || inp.diet === 'pesc') out.push('flexitarian');

  // Life stage
  if (inp.age >= 60) out.push('geriatric');

  return [...new Set(out)];
}

/** Ingredient / name keyword groups the biases lean on. */
const RX = {
  sweets: /sugar|jaggery|sweet|dessert|gulab|halwa|kheer|barfi|ladoo|cake|cookie|pastry|syrup|honey/i,
  fried: /deep.?fried|fried|pakora|bhaji|samosa|puri|vada|chips/i,
  satFat: /butter|ghee|cream|lard|coconut oil/i,
  redMeat: /mutton|lamb|beef|pork|goat/i,
  salty: /pickle|papad|salted|cured|sausage|bacon|salami|ham/i,
  potassiumRich: /banana|potato|tomato|spinach|coconut water|orange|beetroot/i,
  medStaples: /olive|fish|salmon|sardine|legume|chickpea|lentil|whole ?grain|oats|walnut/i,
  wholeGrain: /whole ?grain|millet|ragi|bajra|jowar|oats|barley|brown rice|quinoa/i,
};

const anyIng = (ings: Array<{ name: string }>, name: string, re: RegExp): boolean =>
  re.test(name) || ings.some((i) => re.test(i.name));

/**
 * Small additive bias on the recipe fit score for the ASSIGNED plans.
 * Negative = preferred. Bounded to ±0.5 so the per-user prescription
 * (densities + tolerance bands) always outranks the pattern.
 */
export function dietPlanBias(
  plans: string[],
  r: { name: string; ingredients: Array<{ name: string }> },
  density: { protein: number; fiber: number },   // dish grams per kcal
): number {
  let b = 0;
  const ing = r.ingredients;
  const nm = r.name;
  if (plans.includes('renal')) {
    if (anyIng(ing, nm, RX.potassiumRich)) b += 0.15;
    if (anyIng(ing, nm, RX.salty)) b += 0.2;
  }
  if (plans.includes('diabetic') || plans.includes('lowGlycemic')) {
    if (anyIng(ing, nm, RX.sweets)) b += 0.3;
    if (anyIng(ing, nm, RX.wholeGrain)) b -= 0.1;
  }
  if (plans.includes('dash') && anyIng(ing, nm, RX.salty)) b += 0.25;
  if (plans.includes('liverFriendly')) {
    if (anyIng(ing, nm, RX.fried)) b += 0.2;
    if (anyIng(ing, nm, RX.satFat)) b += 0.15;
    if (anyIng(ing, nm, RX.sweets)) b += 0.15;
  }
  if (plans.includes('heartHealthy')) {
    if (anyIng(ing, nm, RX.satFat)) b += 0.15;
    if (anyIng(ing, nm, RX.redMeat)) b += 0.15;
    if (anyIng(ing, nm, RX.medStaples)) b -= 0.1;
  }
  if (plans.includes('mediterranean') && anyIng(ing, nm, RX.medStaples)) b -= 0.08;
  if (plans.includes('highFibre') && density.fiber >= 0.006) b -= 0.08;  // ≥6 g / 1000 kcal
  if (plans.includes('weightLoss') && (anyIng(ing, nm, RX.sweets) || anyIng(ing, nm, RX.fried))) b += 0.15;
  if ((plans.includes('muscleGain') || plans.includes('highProtein')) && density.protein >= 0.05) b -= 0.1;
  return Math.max(-0.5, Math.min(0.5, b));
}
