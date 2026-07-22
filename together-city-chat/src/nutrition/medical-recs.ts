/**
 * Medical Nutrition Recommendations — the bridge between blood tests /
 * conditions and the user's SELECTED preferences.
 *
 * Principle (spec): analyze the blood test → determine nutrition guidelines for
 * the detected conditions → compare with the user's preferences → identify
 * conflicts → explain WHY each change is recommended → let the user apply with
 * one tap or keep their preferences. Never force, never nag, never block.
 *
 * Each rule yields personalised suggestions (computed against what the user
 * actually selected — not generic advice), an honest before/after quality
 * score, and a machine-applicable patch for the one-tap Apply.
 */

export interface MedPrefs {
  diet: string;
  proteins: string[];                 // selected protein-source chips
  weekly: Record<string, 'veg' | 'nonveg'>; // Mon..Sun
  healthConditions: string[];
  excluded: string;                   // foods the user avoids (free text)
}

export interface MedRec {
  key: string;
  label: string;                      // "Add Tofu as an additional protein option"
  reason: string;
  applyable: boolean;                 // one-tap apply can do this; else advisory
}

export interface MedRecPatch {
  addProteins?: string[];
  removeProteins?: string[];
  vegDaysTarget?: number;
}

export interface MedRecCard {
  condition: string;                  // stable key: ckd | cholesterol | diabetes | fattyLiver | uricAcid
  icon: string;
  title: string;
  intro: string;
  recs: MedRec[];
  scoreBefore: number;
  scoreAfter: number;
  patch: MedRecPatch;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const vegDayCount = (weekly: Record<string, 'veg' | 'nonveg'>): number =>
  DAYS.filter((d) => weekly?.[d] === 'veg').length;

const hasP = (p: MedPrefs, name: string) => p.proteins.some((x) => x.toLowerCase() === name.toLowerCase());
const clamp = (n: number) => Math.max(5, Math.min(98, Math.round(n)));

/** Apply a patch to preferences (pure) — used to compute the "after" score. */
export function applyPatch(p: MedPrefs, patch: MedRecPatch): MedPrefs {
  let proteins = [...p.proteins];
  for (const a of patch.addProteins ?? []) if (!proteins.some((x) => x.toLowerCase() === a.toLowerCase())) proteins.push(a);
  if (patch.removeProteins?.length) proteins = proteins.filter((x) => !patch.removeProteins!.some((r) => r.toLowerCase() === x.toLowerCase()));
  const weekly = { ...(p.weekly ?? {}) };
  if (patch.vegDaysTarget != null) {
    const order = ['Tue', 'Thu', 'Sat', 'Mon', 'Wed', 'Fri', 'Sun'];
    let cur = vegDayCount(weekly);
    for (const d of order) {
      if (cur >= patch.vegDaysTarget) break;
      if (weekly[d] !== 'veg') { weekly[d] = 'veg'; cur++; }
    }
  }
  return { ...p, proteins, weekly };
}

/* ── condition-fit scores (deterministic, preference-driven) ── */

function kidneyScore(p: MedPrefs): number {
  let s = 95;
  if (hasP(p, 'Pork')) s -= 12;
  if (hasP(p, 'Beef')) s -= 12;
  if (hasP(p, 'Mutton')) s -= 9;
  const plant = ['Soy / Tofu', 'Lentils & Dal', 'Beans & Legumes', 'Chickpeas', 'Rajma'].filter((x) => hasP(p, x)).length;
  s -= Math.max(0, (2 - plant)) * 7;                 // wants ≥2 plant options
  const veg = vegDayCount(p.weekly);
  s -= Math.max(0, 4 - veg) * 4;                     // wants ≥4 veg days
  const animal = ['Chicken', 'Mutton', 'Fish', 'Prawns', 'Beef', 'Pork', 'Egg'].filter((x) => hasP(p, x)).length;
  if (animal >= 6) s -= 6;
  return clamp(s);
}

function cholesterolScore(p: MedPrefs): number {
  let s = 95;
  if (hasP(p, 'Pork')) s -= 10;
  if (hasP(p, 'Beef')) s -= 10;
  if (hasP(p, 'Mutton')) s -= 8;
  if (!hasP(p, 'Fish')) s -= 6;
  const plant = ['Lentils & Dal', 'Beans & Legumes', 'Chickpeas', 'Rajma', 'Soy / Tofu'].filter((x) => hasP(p, x)).length;
  s -= Math.max(0, 2 - plant) * 6;
  s -= Math.max(0, 3 - vegDayCount(p.weekly)) * 3;
  return clamp(s);
}

function diabetesScore(p: MedPrefs): number {
  let s = 92;
  const plant = ['Lentils & Dal', 'Beans & Legumes', 'Chickpeas', 'Rajma'].filter((x) => hasP(p, x)).length;
  s -= Math.max(0, 2 - plant) * 6;
  if (!hasP(p, 'Egg') && !hasP(p, 'Paneer') && !hasP(p, 'Chicken') && !hasP(p, 'Fish') && !hasP(p, 'Soy / Tofu')) s -= 8;
  return clamp(s);
}

function liverScore(p: MedPrefs): number {
  let s = 92;
  if (hasP(p, 'Pork')) s -= 8;
  if (!hasP(p, 'Fish')) s -= 6;
  s -= Math.max(0, 3 - vegDayCount(p.weekly)) * 3;
  return clamp(s);
}

function uricScore(p: MedPrefs): number {
  let s = 95;
  if (hasP(p, 'Mutton')) s -= 12;
  if (hasP(p, 'Prawns')) s -= 10;
  if (hasP(p, 'Beef')) s -= 8;
  if (!hasP(p, 'Curd') && !hasP(p, 'Milk')) s -= 6;
  s -= Math.max(0, 3 - vegDayCount(p.weekly)) * 3;
  return clamp(s);
}

/**
 * Build the active Medical Nutrition Recommendation cards for this user.
 * flags = blood-marker statuses (low/normal/high); conditions = profile chips.
 */
export function buildMedicalRecs(
  prefs: MedPrefs,
  flags: Record<string, string>,
): MedRecCard[] {
  const conds = prefs.healthConditions.map((c) => c.toLowerCase());
  const has = (...k: string[]) => k.some((x) => conds.some((c) => c.includes(x)));
  const out: MedRecCard[] = [];
  const veg = vegDayCount(prefs.weekly);

  // ── Kidney (CKD) ──
  if (has('kidney', 'renal', 'ckd')) {
    const recs: MedRec[] = [];
    const patch: MedRecPatch = {};
    recs.push({ key: 'veg-servings', label: 'Increase vegetable intake to 5–7 servings/day', reason: 'Supports overall dietary quality and kidney health — the planner will emphasise vegetable-forward dishes.', applyable: false });
    if (veg < 4) {
      recs.push({ key: 'veg-days', label: `Increase vegetarian meals from ${veg} → 4 days/week`, reason: 'More plant-forward days reduce the dietary burden on the kidneys.', applyable: true });
      patch.vegDaysTarget = 4;
    }
    if (!hasP(prefs, 'Soy / Tofu') && !hasP(prefs, 'Tofu') && prefs.diet !== 'jain') {
      recs.push({ key: 'add-tofu', label: 'Add Tofu as an additional protein option', reason: 'A kidney-gentler protein that keeps meals varied while red meat is reduced.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Soy / Tofu'];
    }
    if (hasP(prefs, 'Mutton')) {
      recs.push({ key: 'less-mutton', label: 'Reduce Mutton to about 1 meal/week', reason: 'Red meat carries a higher acid and phosphorus load — the planner will down-weight it.', applyable: false });
    }
    if (hasP(prefs, 'Pork') || hasP(prefs, 'Beef')) {
      recs.push({ key: 'drop-pork', label: 'Prefer Chicken or Fish over Pork/Beef and processed meats', reason: 'Lighter proteins are easier on kidney function.', applyable: true });
      patch.removeProteins = [...(patch.removeProteins ?? []), 'Pork', 'Beef'];
    }
    const before = kidneyScore(prefs);
    const after = kidneyScore(applyPatch(prefs, patch));
    out.push({
      condition: 'ckd', icon: '🩺',
      title: 'Your kidneys need extra nutritional support',
      intro: 'Your profile and blood tests suggest your kidneys need extra nutritional support. Your current food preferences can still be used — a few adjustments would allow a more kidney-friendly meal plan.',
      recs, scoreBefore: before, scoreAfter: Math.max(after, before), patch,
    });
  }

  // ── High cholesterol ──
  if (flags.ldl === 'high' || flags.trig === 'high' || has('cholesterol')) {
    const recs: MedRec[] = [];
    const patch: MedRecPatch = {};
    recs.push({ key: 'veg-servings', label: 'Increase vegetables to 5+ servings/day', reason: 'Soluble fibre binds cholesterol — the planner will emphasise it.', applyable: false });
    if (!hasP(prefs, 'Lentils & Dal') && !hasP(prefs, 'Beans & Legumes') && !hasP(prefs, 'Legumes')) {
      recs.push({ key: 'add-legumes', label: 'Add legumes ~3 times/week', reason: 'Legume protein and fibre improve LDL — added as a protein option.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Lentils & Dal'];
    }
    if (hasP(prefs, 'Mutton') && !hasP(prefs, 'Fish') && ['everything', 'nonveg', 'pesc'].includes(prefs.diet)) {
      recs.push({ key: 'prefer-fish', label: 'Prefer Fish over Mutton', reason: 'Omega-3-rich fish improves the lipid profile where red meat worsens it.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Fish'];
    }
    if (hasP(prefs, 'Pork')) {
      recs.push({ key: 'less-pork', label: 'Reduce Pork to about once per week', reason: 'Processed and fatty pork cuts raise saturated fat quickly.', applyable: false });
    }
    recs.push({ key: 'oil-swap', label: 'Replace butter/ghee-heavy dishes with olive or mustard-oil cooking', reason: 'Unsaturated oils improve LDL:HDL — the planner already down-weights butter-heavy recipes for you.', applyable: false });
    if (flags.trig === 'high') {
      recs.push({ key: 'omega3', label: 'Eat fatty fish ~twice a week (or discuss omega-3 supplements with your doctor)', reason: '2–4 g/day EPA+DHA effectively lowers triglycerides.', applyable: false });
    }
    const before = cholesterolScore(prefs);
    const after = cholesterolScore(applyPatch(prefs, patch));
    out.push({
      condition: 'cholesterol', icon: '🫀',
      title: 'Elevated cholesterol detected',
      intro: 'Your blood test indicates elevated cholesterol. The following preference changes could improve your meal plan.',
      recs, scoreBefore: before, scoreAfter: Math.max(after, before), patch,
    });
  }

  // ── Diabetes ──
  if (flags.hba1c === 'high' || has('diabetes')) {
    const recs: MedRec[] = [];
    const patch: MedRecPatch = {};
    recs.push({ key: 'less-rice', label: 'Reduce white-rice portions', reason: 'Lower glycaemic load — the planner already favours roti/millets and smaller rice bowls for you.', applyable: false });
    recs.push({ key: 'veg-up', label: 'Increase vegetables at every meal', reason: 'Fibre slows glucose absorption.', applyable: false });
    recs.push({ key: 'no-sugary', label: 'Replace sugary drinks with water or unsweetened beverages', reason: 'Liquid sugar spikes glucose fastest — your added-sugar target is already capped at 20 g.', applyable: false });
    if (!hasP(prefs, 'Lentils & Dal') && !hasP(prefs, 'Beans & Legumes') && !hasP(prefs, 'Legumes')) {
      recs.push({ key: 'add-legumes', label: 'Add legumes several times per week', reason: 'Legumes blunt the glucose response of a meal.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Lentils & Dal'];
    }
    recs.push({ key: 'carb-spread', label: 'Spread carbohydrates across 3 moderate meals (+1–2 snacks)', reason: 'Distributing carbs through the day steadies glucose — your plan structure already follows this.', applyable: false });
    recs.push({ key: 'protein-every-meal', label: 'Include protein with every meal', reason: 'Protein flattens the glucose curve — your per-meal protein split already enforces this.', applyable: false });
    const before = diabetesScore(prefs);
    const after = diabetesScore(applyPatch(prefs, patch));
    out.push({
      condition: 'diabetes', icon: '🩸',
      title: 'Blood sugar above the recommended range',
      intro: 'Your blood sugar is above the recommended range. To improve glucose control:',
      recs, scoreBefore: before, scoreAfter: Math.max(after, before), patch,
    });
  }

  // ── Fatty liver ──
  if (has('fatty liver', 'nafld', 'masld')) {
    const recs: MedRec[] = [];
    const patch: MedRecPatch = {};
    recs.push({ key: 'veg-up', label: 'Increase vegetables', reason: 'Lower energy density helps reduce liver fat.', applyable: false });
    recs.push({ key: 'no-sugary', label: 'Reduce sugary drinks and desserts', reason: 'Fructose is a primary driver of liver fat.', applyable: false });
    recs.push({ key: 'less-fried', label: 'Limit fried food', reason: 'The planner already down-weights fried dishes for you.', applyable: false });
    recs.push({ key: 'whole-grains', label: 'Increase whole grains (millets, oats, whole wheat)', reason: 'Higher fibre supports liver-fat reduction.', applyable: false });
    if (!hasP(prefs, 'Fish') && ['everything', 'nonveg', 'pesc'].includes(prefs.diet)) {
      recs.push({ key: 'add-fish', label: 'Include fish twice weekly', reason: 'Omega-3s reduce liver triglycerides.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Fish'];
    }
    const before = liverScore(prefs);
    const after = liverScore(applyPatch(prefs, patch));
    out.push({
      condition: 'fattyLiver', icon: '🫁',
      title: 'Your liver would benefit from a few changes',
      intro: 'Your profile indicates fatty liver. These adjustments help reduce liver fat:',
      recs, scoreBefore: before, scoreAfter: Math.max(after, before), patch,
    });
  }

  // ── High uric acid / gout ──
  if (has('uric', 'gout')) {
    const recs: MedRec[] = [];
    const patch: MedRecPatch = {};
    recs.push({ key: 'avoid-purine', label: 'Avoid organ meats and small oily fish (anchovies, sardines, herring)', reason: 'The highest-purine foods — the planner already excludes them for you.', applyable: false });
    recs.push({ key: 'less-fructose', label: 'Limit sweetened soft drinks, juices and sweet pastries', reason: 'Fructose raises uric acid production directly.', applyable: false });
    if (hasP(prefs, 'Mutton')) recs.push({ key: 'less-mutton', label: 'Reduce mutton frequency', reason: 'Red and organ meats are the highest-purine foods.', applyable: false });
    if (hasP(prefs, 'Prawns')) {
      recs.push({ key: 'less-prawns', label: 'Limit prawns and shellfish', reason: 'Shellfish carry a high purine load that raises uric acid.', applyable: true });
      patch.removeProteins = [...(patch.removeProteins ?? []), 'Prawns'];
    }
    if (!hasP(prefs, 'Curd') && !hasP(prefs, 'Milk') && prefs.diet !== 'vegan') {
      recs.push({ key: 'add-dairy', label: 'Increase low-fat dairy (curd, milk)', reason: 'Dairy, eggs, vegetable protein and cherries appear protective against gout attacks.', applyable: true });
      patch.addProteins = [...(patch.addProteins ?? []), 'Curd'];
    }
    recs.push({ key: 'veg-up', label: 'Increase vegetables', reason: 'Plant purines do not raise gout risk the way meat purines do.', applyable: false });
    recs.push({ key: 'water', label: 'Drink more water through the day', reason: 'Hydration helps the kidneys clear uric acid.', applyable: false });
    const before = uricScore(prefs);
    const after = uricScore(applyPatch(prefs, patch));
    out.push({
      condition: 'uricAcid', icon: '🦴',
      title: 'Elevated uric acid',
      intro: 'Your uric acid is elevated. Recommended adjustments:',
      recs, scoreBefore: before, scoreAfter: Math.max(after, before), patch,
    });
  }

  return out;
}
