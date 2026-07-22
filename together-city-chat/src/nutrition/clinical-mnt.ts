/**
 * Clinical MNT (Medical Nutrition Therapy) knowledge base — the condition
 * layer of the nutrition engine, mined from the user's clinical guideline
 * library (Krause's Food & the Nutrition Care Process 14th ed.; ESPEN
 * practical guidelines: liver disease, geriatrics, micronutrients; the joint
 * ESPEN-UEG obesity guideline).
 *
 * Structure per the platform's universal rule:
 *   condition → targets/limits → food guidance (emphasize / limit / avoid)
 *   → compare against preferences → advisories with citations.
 *
 * Consumed by computeTargets (limits + adjustment notes), the recipe fit
 * score (emphasize/limit bias), the hard exclusion filter (avoid), and the
 * Personalized Nutrition Advice section (advisories + citations).
 */

export interface MntRule {
  key: string;
  label: string;
  citation: string;
  /** protein prescription that OVERRIDES goal-based values (renal family). */
  proteinGPerKg?: { use: number; range: [number, number] };
  /** hard daily limits merged into targets. */
  limits?: {
    sodiumMaxMg?: number;
    sugarMaxG?: number;
    satFatPctKcal?: number;
    potassiumMaxMg?: number;   // renal: potassium is a CEILING, not a floor
    phosphorusMaxMg?: number;
    fluidMinMl?: number;
  };
  /** recipe-keyword guidance: emphasize (bias−), limit (bias+), avoid (hard). */
  emphasize?: RegExp;
  limit?: RegExp;
  avoid?: string[];
  /** one advisory line for the Personalized Nutrition Advice section. */
  advisory?: { title: string; body: string };
}

export const MNT_RULES: Record<string, MntRule> = {
  ckdEarly: {
    key: 'ckdEarly', label: 'CKD stage 1–2 / unstaged',
    citation: "Krause's 14th ed. (renal MNT); KDOQI ranges",
    proteinGPerKg: { use: 0.9, range: [0.8, 1.0] },
    limits: { sodiumMaxMg: 2000, potassiumMaxMg: 3000, phosphorusMaxMg: 1000 },
    emphasize: /rice|poha|vermicelli|sevai|apple|cabbage|cauliflower|capsicum|bottle gourd|lauki/i,
    limit: /banana|potato|tomato|spinach|coconut water|orange|beetroot|pickle|papad/i,
    avoid: ['organ meat', 'processed meat', 'bone broth'],
    advisory: {
      title: 'Kidney-supportive pattern active',
      body: 'Protein is prescribed at 0.8–1.0 g/kg with sodium ≤2,000 mg; potassium- and phosphorus-heavy foods are down-weighted, not banned. Confirm targets with your nephrologist.',
    },
  },
  ckdLate: {
    key: 'ckdLate', label: 'CKD stage 3–5 (not on dialysis)',
    citation: "Krause's 14th ed.: 0.5–0.8 g/kg non-dialysis",
    proteinGPerKg: { use: 0.7, range: [0.55, 0.8] },
    limits: { sodiumMaxMg: 2000, potassiumMaxMg: 2500, phosphorusMaxMg: 900 },
    emphasize: /rice|poha|vermicelli|sevai|apple|cabbage|cauliflower|capsicum|bottle gourd|lauki/i,
    limit: /banana|potato|tomato|spinach|coconut water|orange|beetroot|dal|lentil|paneer|cheese/i,
    avoid: ['organ meat', 'processed meat', 'bone broth', 'pickle', 'papad'],
    advisory: {
      title: 'Late-stage kidney protection active',
      body: 'Protein is moderated to 0.55–0.8 g/kg with tighter potassium and phosphorus limits, per renal MNT guidance. These targets need active nephrologist supervision.',
    },
  },
  dialysis: {
    key: 'dialysis', label: 'On dialysis',
    citation: "Krause's 14th ed.: 1–2 g/kg on dialysis (HD ~1.2)",
    proteinGPerKg: { use: 1.1, range: [1.0, 1.2] },
    limits: { sodiumMaxMg: 2000, potassiumMaxMg: 2500, phosphorusMaxMg: 1000 },
    emphasize: /egg|chicken|fish|paneer/i,
    limit: /banana|potato|tomato|spinach|coconut water|orange/i,
    avoid: ['organ meat', 'bone broth'],
    advisory: {
      title: 'Dialysis nutrition active',
      body: 'Dialysis raises protein needs to 1.0–1.2 g/kg (to replace treatment losses) while keeping potassium, phosphorus and sodium controlled. Follow your dialysis dietitian first.',
    },
  },
  diabetes: {
    key: 'diabetes', label: 'Diabetes / raised HbA1c',
    citation: "Krause's 14th ed. (carb distribution); ESPEN",
    limits: { sugarMaxG: 20 },
    emphasize: /millet|ragi|bajra|jowar|oats|whole ?wheat|dal|lentil|chana|rajma|methi|karela|bitter gourd/i,
    limit: /white rice|maida|refined|sugar|jaggery|sweet|dessert/i,
    advisory: {
      title: 'Glucose-control pattern active',
      body: 'Carbohydrates are spread across the day in moderate meals, fibre is raised, added sugar capped at 20 g, and low-glycaemic grains (millets, oats, dals) are preferred.',
    },
  },
  hypertension: {
    key: 'hypertension', label: 'Hypertension (DASH)',
    citation: "Krause's 14th ed. / AHA-IOM: 1,500 mg optimal for at-risk",
    limits: { sodiumMaxMg: 1500 },
    emphasize: /vegetable|fruit|curd|yogurt|dal|lentil|oats|banana/i,
    limit: /pickle|papad|salted|cured|sausage|bacon|instant noodle|soy sauce/i,
    advisory: {
      title: 'DASH pattern active',
      body: 'Sodium is capped at 1,500 mg with potassium-rich vegetables, fruit and dairy emphasised — the DASH pattern shown to lower blood pressure.',
    },
  },
  dyslipidemia: {
    key: 'dyslipidemia', label: 'Raised LDL / triglycerides',
    citation: "Krause's 14th ed.: soluble fibre; 2–4 g/d EPA+DHA for high TG",
    limits: { satFatPctKcal: 6 },
    emphasize: /oats|barley|dal|lentil|chickpea|rajma|fish|salmon|sardine|olive|walnut|flax|methi/i,
    limit: /butter|ghee|cream|red meat|mutton|beef|pork|fried/i,
    advisory: {
      title: 'Lipid-lowering pattern active',
      body: 'Saturated fat is capped at 6% of calories; soluble-fibre foods (oats, dals, legumes) and omega-3 sources are emphasised. For high triglycerides, fatty fish ~twice weekly helps (2–4 g/day EPA+DHA is the effective range — discuss supplements with your doctor).',
    },
  },
  fattyLiver: {
    key: 'fattyLiver', label: 'Fatty liver (NAFLD/MASLD)',
    citation: 'ESPEN liver guideline; ESPEN-UEG obesity: 3–5% weight loss improves steatosis, 7–10% improves fibrosis; 500–1,000 kcal/day deficit',
    emphasize: /olive|fish|whole ?grain|oats|millet|vegetable|legume|dal|walnut/i,
    limit: /fructose|corn syrup|sweetened|soda|juice|dessert|fried|butter|ghee|cream/i,
    avoid: ['fructose syrup', 'alcohol', 'beer', 'wine'],
    advisory: {
      title: 'Liver-recovery pattern active',
      body: 'A Mediterranean-leaning, lower-fructose pattern with a moderate calorie deficit — 3–5% weight loss improves liver fat and 7–10% improves most liver damage markers (ESPEN-UEG). Sugary drinks are the single biggest lever.',
    },
  },
  gout: {
    key: 'gout', label: 'High uric acid / gout',
    citation: "Krause's 14th ed., Box 39-3",
    emphasize: /curd|yogurt|milk|cherry|vegetable|egg/i,
    limit: /mutton|prawn|shrimp|shellfish|beer/i,
    avoid: ['organ meat', 'liver', 'kaleji', 'anchovy', 'sardine', 'herring', 'meat broth', 'bone broth', 'fructose syrup'],
    advisory: {
      title: 'Uric-acid-lowering pattern active',
      body: 'The highest-purine foods (organ meats, anchovies, sardines, herring, meat broths) are excluded; fructose-sweetened drinks limited; dairy, eggs and vegetable protein — which appear protective — are emphasised. Hydration helps clearance.',
    },
  },
  elderly: {
    key: 'elderly', label: 'Older adult (65+)',
    citation: 'ESPEN geriatrics: ~30 kcal/kg orientation; fluids ≥1.6 L/d (women) / 2.0 L/d (men)',
    proteinGPerKg: { use: 1.1, range: [1.0, 1.2] },
    limits: { fluidMinMl: 1600 },
    emphasize: /dal|egg|curd|paneer|milk|khichdi|soft/i,
    advisory: {
      title: 'Healthy-ageing pattern active',
      body: 'Protein is raised to 1.0–1.2 g/kg to protect muscle, energy oriented around ~30 kcal/kg, and fluids matter more with age: at least 1.6 L/day of drinks for women, 2.0 L/day for men (ESPEN geriatrics).',
    },
  },
};

export interface MntContext {
  conditions: string[];
  flags: Record<string, string>;
  age: number;
  sex: string;
}

/** Which MNT rules are active for this user (kidney staging via condition text). */
export function activeMntRules(ctx: MntContext): MntRule[] {
  const conds = ctx.conditions.map((c) => c.toLowerCase());
  const has = (...k: string[]) => k.some((x) => conds.some((c) => c.includes(x)));
  const out: MntRule[] = [];
  if (has('kidney', 'renal', 'ckd')) {
    if (has('dialysis')) out.push(MNT_RULES.dialysis);
    else if (has('stage 3', 'stage 4', 'stage 5', 'stage3', 'stage4', 'stage5')) out.push(MNT_RULES.ckdLate);
    else out.push(MNT_RULES.ckdEarly);
  }
  if (ctx.flags.hba1c === 'high' || has('diabetes')) out.push(MNT_RULES.diabetes);
  if (has('hypertension', 'blood pressure')) out.push(MNT_RULES.hypertension);
  if (ctx.flags.ldl === 'high' || ctx.flags.trig === 'high' || has('cholesterol')) out.push(MNT_RULES.dyslipidemia);
  if (has('fatty liver', 'nafld', 'masld', 'nash')) out.push(MNT_RULES.fattyLiver);
  if (has('uric', 'gout')) out.push(MNT_RULES.gout);
  if (ctx.age >= 65) out.push(MNT_RULES.elderly);
  return out;
}

/** Bounded recipe bias from the active rules: emphasize −, limit +. */
export function mntRecipeBias(
  rules: MntRule[],
  r: { name: string; ingredients: Array<{ name: string }> },
): number {
  if (!rules.length) return 0;
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`;
  let b = 0;
  for (const rule of rules) {
    if (rule.emphasize?.test(hay)) b -= 0.12;
    if (rule.limit?.test(hay)) b += 0.18;
  }
  return Math.max(-0.4, Math.min(0.4, b));
}

/** Hard-avoid keywords from the active rules (merged into the medical filter). */
export function mntAvoidKeywords(rules: MntRule[]): string[] {
  return [...new Set(rules.flatMap((r) => r.avoid ?? []))];
}
