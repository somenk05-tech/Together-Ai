import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, scaleComposedWeek, type ComposerPrefs, type Diet, type PoolRecipe } from './meal-composer';
import { categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients } from './ingredient-nutrients';
import { supplementKit, flagsFor } from './clinical-engine';
import { isAllergenSafe } from './allergens';

/**
 * Large-scale SIMULATED production test (150 virtual users) — Round-2 validation.
 * Runs the REAL engine over the exact requested distribution + behaviours and
 * counts measured pass/fail. SIMULATED at the engine/service-pure-function layer:
 * computeTargets, composeWeek (with the real 11k dataset pool), regeneration,
 * family scaling, grocery, blood→targets, supplement safety. It does NOT execute
 * live HTTP/DB/concurrency — those are assessed separately from code.
 */

// ── Real dataset pool (mirrors NutritionService.datasetPool) ──
function mapDiet(d: string): Diet {
  const x = (d || '').toLowerCase();
  if (x === 'vegan' || x === 'jainvegan') return 'vegan';
  if (x === 'egg' || x === 'eggetarian') return 'eggetarian';
  if (x === 'veg' || x === 'vegetarian') return 'vegetarian';
  return 'nonveg';
}
function roleFor(cats: MealCategory[]): string | null {
  if (cats.includes('breakfast')) return 'breakfast';
  if (cats.includes('lunch') || cats.includes('dinner')) return 'main';
  if (cats.includes('soup')) return 'soup';
  if (cats.includes('dessert')) return 'dessert';
  if (cats.includes('drink')) return 'drink';
  if (cats.includes('snack')) return 'snack';
  return null;
}
let POOL: PoolRecipe[] | null = null;
function pool(): PoolRecipe[] {
  if (POOL) return POOL;
  const gz = join(__dirname, 'data', 'recipes.dataset.json.gz');
  const rows = JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8')) as Array<Record<string, unknown>>;
  const out: PoolRecipe[] = [];
  for (const r of rows) {
    const ing0 = (r.ingredients as Array<{ name: string; grams?: number }>) ?? [];
    if (!ing0.length) continue;
    const cats = categorizeRecipe({ name: r.name as string, slot: r.slot as string, minutes: r.minutes as number, kcal: r.kcal as number });
    const role = roleFor(cats);
    if (!role) continue;
    const s = Math.max(1, (r.servings as number) ?? 1);
    const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
    const ingredients = ing0.map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) })).filter((i) => i.name && i.grams > 0);
    if (!ingredients.length) continue;
    const n = computeNutrients(ingredients);
    out.push({
      id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role,
      kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number),
      fat: per(r.fat as number), fiber: per(r.fiber as number), minutes: (r.minutes as number) || 20,
      grams: per(r.gramsPerServing as number) || 200, diet: mapDiet(r.diet as string), ingredients,
      nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat },
      nutrientComplete: n.complete, steps: [], imageUrl: null,
    } as PoolRecipe);
  }
  POOL = out;
  return out;
}

// ── Virtual user model ──
interface VUser {
  id: string; archetype: string; age: number; sex: string; heightCm: number; weightKg: number; activity: number;
  diet: Diet; goal: string; conditions: string[]; blood: Record<string, number>; excluded: string[];
  cuisineBySlot?: ComposerPrefs['cuisineBySlot']; fasting?: ComposerPrefs['fasting'];
  family?: number; // members if a family account
}
const DIETS: Diet[] = ['vegetarian', 'vegan', 'eggetarian', 'nonveg'];
const CUISINES = ['Indian', 'Chinese', 'Thai', 'Italy', 'Greece'];
const ALLERGENS = [[], ['peanut'], ['milk'], ['soy'], []];
function rr<T>(arr: T[], i: number): T { return arr[i % arr.length]; }

function makeUsers(): VUser[] {
  const u: VUser[] = [];
  let i = 0;
  const push = (archetype: string, n: number, f: (i: number) => Partial<VUser>) => {
    for (let k = 0; k < n; k++) {
      const base = f(i);
      u.push({
        id: `${archetype}-${k}`, archetype, age: 30, sex: i % 2 ? 'female' : 'male', heightCm: i % 2 ? 162 : 174,
        weightKg: i % 2 ? 64 : 76, activity: rr([1.2, 1.4, 1.6, 1.9], i), diet: rr(DIETS, i), goal: 'maintain',
        conditions: [], blood: {}, excluded: rr(ALLERGENS, i), cuisineBySlot: undefined, fasting: undefined,
        ...base,
      });
      i++;
    }
  };
  const cuis = (i: number): ComposerPrefs['cuisineBySlot'] => {
    const c = rr(CUISINES, i);
    return { breakfast: { Indian: 100 }, lunch: { [c]: 90, Indian: 10 }, dinner: { [c]: 80, Indian: 20 }, snack: {} };
  };
  const fast = (i: number): ComposerPrefs['fasting'] | undefined => (i % 4 === 0 ? { enabled: true, protocol: rr(['16:8', '14:10', '18:6'], i) } : undefined);

  push('healthy', 30, (i) => ({ age: 22 + (i % 40), goal: 'maintain', cuisineBySlot: cuis(i), fasting: fast(i) }));
  push('weightloss', 25, (i) => ({ age: 25 + (i % 35), goal: 'lose', weightKg: 82 + (i % 20), cuisineBySlot: cuis(i), fasting: fast(i) }));
  push('musclegain', 20, (i) => ({ age: 20 + (i % 20), goal: 'gain', activity: 1.7, cuisineBySlot: cuis(i) }));
  push('t2diabetes', 20, (i) => ({ age: 40 + (i % 30), conditions: ['diabetes'], blood: { hba1c: 8.1, ldl: 130 }, cuisineBySlot: cuis(i), fasting: fast(i) }));
  push('ckd', 15, (i) => ({ age: 45 + (i % 30), conditions: [rr(['kidney disease stage 3', 'kidney disease stage 4', 'kidney failure on dialysis'], i)], blood: { hb: 10.5 }, cuisineBySlot: cuis(i) }));
  push('fattyliver', 10, (i) => ({ age: 35 + (i % 25), conditions: ['fatty liver'], blood: { ldl: 150, trig: 220 }, cuisineBySlot: cuis(i) }));
  push('hypertension', 10, (i) => ({ age: 40 + (i % 30), conditions: ['hypertension'], cuisineBySlot: cuis(i) }));
  push('highchol', 5, (i) => ({ age: 45 + (i % 20), conditions: ['high cholesterol'], blood: { ldl: 190, trig: 260 }, cuisineBySlot: cuis(i) }));
  push('senior', 5, (i) => ({ age: 70 + (i % 18), activity: 1.2, cuisineBySlot: cuis(i) }));
  push('family', 10, (i) => ({ age: 38 + (i % 10), goal: 'maintain', family: 3 + (i % 4), conditions: i % 3 === 0 ? ['hypertension'] : [], cuisineBySlot: cuis(i) }));
  return u;
}

function clinicalOf(conditions: string[], blood: Record<string, number>) {
  const c = conditions.join(' ').toLowerCase();
  const flags = flagsFor(blood);
  const isClinical = /kidney|renal|ckd|dialysis|diabet|hypertension|blood pressure|cholesterol|lipid|triglycer|fatty liver|gout/.test(c) || flags.hba1c === 'high' || flags.ldl === 'high' || flags.trig === 'high';
  const tag = /kidney|renal|ckd|dialysis/.test(c) ? 'Renal Friendly' : /diabet/.test(c) ? 'Diabetic Friendly' : /hypertension|cholesterol|lipid|triglycer/.test(c) ? 'Heart Friendly' : undefined;
  return { isClinical, tag, flags };
}

function targetsFor(u: VUser) {
  return computeTargets({ weightKg: u.weightKg, heightCm: u.heightCm, age: u.age, sex: u.sex, activity: u.activity, goal: u.goal as never, conditions: u.conditions, flags: flagsFor(u.blood) as Record<string, string> }) as unknown as Record<string, number>;
}
function prefsFor(u: VUser): ComposerPrefs {
  const { isClinical, tag } = clinicalOf(u.conditions, u.blood);
  const t = targetsFor(u);
  const caps = isClinical ? { sodiumMg: t.sodiumMaxMg, potassiumMg: t.potassiumMaxMg, phosphorusMg: t.phosphorusMaxMg, sugarG: t.sugarMaxG, satFatG: t.satFatMaxG } : undefined;
  return { diet: u.diet, excluded: u.excluded, cuisineBySlot: u.cuisineBySlot, fasting: u.fasting, clinicalTag: tag, clinical: isClinical, caps, avoidRice: /diabet/.test(u.conditions.join(' ').toLowerCase()) };
}
function planFor(u: VUser, seed: number) {
  const t = targetsFor(u);
  return composeWeek({ kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber }, prefsFor(u), 7, seed, pool());
}
function hashSeed(id: string): number { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) || 7; }

describe('Nutrition Hub — 150 virtual-user simulation', () => {
  it('runs the full distribution + behaviours and reports measured results', () => {
    const users = makeUsers();
    const M = {
      users: users.length, plans: 0, days: 0, crashes: 0,
      structOk: 0, dupMealDays: 0,
      kcal10: 0, kcal20: 0, proteinMet: 0, dayCount: 0,
      dietViol: 0, allergenLeak: 0,
      groceryTraceOk: 0, groceryTotal: 0, groceryMissingSalt: 0,
      clinicalUsers: 0, breachDays: 0, blockedPlans: 0, unsafeShipped: 0,
      bloodInfluenceOk: 0, bloodInfluenceChecked: 0,
      familyOwners: 0, familyMembers: 0, familyScaleOk: 0,
      determinismChecked: 0, determinismOk: 0, varietyOk: 0,
      supplementChecked: 0, supplementUnsafe: 0,
      regenRuns: 0,
    };
    const unsafe: string[] = [];
    const supplementIssues: string[] = [];

    for (const u of users) {
      let wk;
      try { wk = planFor(u, hashSeed(u.id)); } catch (e) { M.crashes++; unsafe.push(`${u.id}: CRASH ${(e as Error).message}`); continue; }
      M.plans++;
      const t = targetsFor(u);
      const { isClinical } = clinicalOf(u.conditions, u.blood);
      if (isClinical) M.clinicalUsers++;
      if (wk.blocked) M.blockedPlans++;

      for (const day of wk.days) {
        M.days++; M.dayCount++;
        const slots = day.meals.map((m) => m.slot).join(',');
        if (u.fasting?.enabled ? day.meals.length >= 1 : slots === 'b,l,s,es,d') M.structOk++;
        // duplicate meals within a day (same lead recipe in 2 slots)
        const leadIds = day.meals.map((m) => m.components[0]?.recipeId).filter(Boolean);
        if (new Set(leadIds).size !== leadIds.length) M.dupMealDays++;
        const dev = Math.abs(day.totals.kcal - t.kcal) / t.kcal;
        if (dev <= 0.10) M.kcal10++; if (dev <= 0.20) M.kcal20++;
        if (day.totals.protein >= t.protein * 0.9) M.proteinMet++;
        for (const m of day.meals) for (const c of m.components) {
          const pr = pool().find((x) => x.id === c.recipeId);
          const ladder: Record<Diet, Diet[]> = { vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'], eggetarian: ['vegan', 'vegetarian', 'eggetarian'], nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'] };
          if (pr && !ladder[u.diet].includes(pr.diet)) M.dietViol++;
          // Measured with the matcher, not with a copy of the filter's own
          // substring test — see the note in qa-matrix.spec.ts. The matcher's
          // own correctness is proven in allergens.spec.ts.
          if (u.excluded.length && !isAllergenSafe(c.name, c.ingredients.map((i) => i.name), u.excluded)) M.allergenLeak++;
        }
        // clinical safety: any breach must be flagged blocked, never silently shipped
        const b = day.capBreaches ?? [];
        if (b.length) { M.breachDays++; if (!wk.blocked) { M.unsafeShipped++; unsafe.push(`${u.id} d${day.dayIndex + 1}: shipped breach ${JSON.stringify(b)}`); } }
      }
      // grocery traceability + salt never in grocery
      const ids = new Set(wk.days.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => c.recipeId))));
      for (const g of wk.grocery) { M.groceryTotal++; if (g.fromRecipes.some((id) => ids.has(id))) M.groceryTraceOk++; if (/^salt$/i.test(g.name.trim())) M.groceryMissingSalt++; }

      // blood influence: diabetic hba1c should tighten sugar cap vs a no-blood clone
      if (u.blood.hba1c && u.blood.hba1c >= 6.5) {
        M.bloodInfluenceChecked++;
        const withB = targetsFor(u);
        const noB = computeTargets({ weightKg: u.weightKg, heightCm: u.heightCm, age: u.age, sex: u.sex, activity: u.activity, goal: u.goal as never, conditions: u.conditions.filter((c) => !/diabet/.test(c)), flags: {} }) as unknown as Record<string, number>;
        if ((withB.sugarMaxG ?? 999) <= (noB.sugarMaxG ?? 999)) M.bloodInfluenceOk++;
      }

      // regeneration: determinism (same seed → identical) + variety (different seed → differs)
      M.regenRuns += 2;
      const again = planFor(u, hashSeed(u.id));
      M.determinismChecked++;
      const sig = (w: typeof wk) => w.days.map((d) => d.meals.map((m) => m.components[0]?.recipeId).join('|')).join('/');
      if (sig(again) === sig(wk)) M.determinismOk++;
      const diff = planFor(u, hashSeed(u.id) + 999);
      if (sig(diff) !== sig(wk)) M.varietyOk++;

      // family: members receive scaled plans; scaling should track calorie factor
      if (u.family) {
        M.familyOwners++;
        for (let mi = 0; mi < u.family; mi++) {
          M.familyMembers++;
          const memberKcalTarget = t.kcal * (0.7 + 0.1 * mi);
          const factor = Math.max(0.4, Math.min(1.9, memberKcalTarget / t.kcal));
          const mwk = scaleComposedWeek(wk, factor);
          const ownerK = wk.days[0].totals.kcal; const memberK = mwk.days[0].totals.kcal;
          // scaled day kcal should move in the factor's direction (±20% tolerance)
          if (Math.abs(memberK - ownerK * factor) / Math.max(1, ownerK * factor) <= 0.2) M.familyScaleOk++;
        }
      }

      // supplement safety (contraindications)
      M.supplementChecked++;
      const kit = supplementKit(u.goal, flagsFor(u.blood), { conditions: u.conditions, age: u.age });
      const c = u.conditions.join(' ').toLowerCase();
      const renal = /kidney|renal|ckd|dialysis/.test(c);
      if (renal && kit.some((k) => /whey|creatine/i.test(k.name))) { M.supplementUnsafe++; supplementIssues.push(`${u.id}: renal got ${kit.filter((k) => /whey|creatine/i.test(k.name)).map((k) => k.name).join(',')}`); }
      if (u.age < 18 && kit.some((k) => /whey|creatine/i.test(k.name))) { M.supplementUnsafe++; supplementIssues.push(`${u.id}: minor got performance supplement`); }
    }

    // ── dedicated life-stage safety assertions (P0-6) — not in the 150 distribution ──
    const preg = computeTargets({ weightKg: 62, heightCm: 162, age: 30, sex: 'female', activity: 1.4, goal: 'lose', conditions: ['pregnancy'], flags: {} }) as unknown as Record<string, number>;
    const base = computeTargets({ weightKg: 62, heightCm: 162, age: 30, sex: 'female', activity: 1.4, goal: 'lose', conditions: [], flags: {} }) as unknown as Record<string, number>;
    const pregOk = preg.kcal > base.kcal && preg.protein > base.protein; // no deficit + extra energy/protein
    const pregKit = supplementKit('maintain', {}, { conditions: ['pregnancy'], age: 30 });
    const pregKitOk = pregKit.some((k) => /prenatal/i.test(k.name)) && !pregKit.some((k) => /^daily multivitamin$/i.test(k.name));
    const child = computeTargets({ weightKg: 45, heightCm: 150, age: 12, sex: 'male', activity: 1.4, goal: 'lose', conditions: [], flags: {} }) as unknown as Record<string, number>;
    const childBase = computeTargets({ weightKg: 45, heightCm: 150, age: 12, sex: 'male', activity: 1.4, goal: 'maintain', conditions: [], flags: {} }) as unknown as Record<string, number>;
    const childOk = child.kcal >= childBase.kcal; // no weight-loss deficit for a child

    const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
    const rep = [
      '\n================ 150-USER SIMULATION REPORT ================',
      `Virtual users: ${M.users}   Plans generated: ${M.plans}   Regeneration runs: ${M.regenRuns}   Crashes: ${M.crashes}`,
      `Plan-days: ${M.days}   (structure correct: ${pct(M.structOk, M.dayCount)})`,
      '',
      '— Nutrition accuracy —',
      `Calorie ±10%: ${pct(M.kcal10, M.dayCount)}   ±20%: ${pct(M.kcal20, M.dayCount)}   Protein ≥90%: ${pct(M.proteinMet, M.dayCount)}`,
      `Diet violations: ${M.dietViol}   Allergen leaks: ${M.allergenLeak}   Duplicate-meal days: ${M.dupMealDays}`,
      '',
      '— Grocery accuracy —',
      `Grocery lines traceable to a recipe: ${pct(M.groceryTraceOk, M.groceryTotal)} (${M.groceryTraceOk}/${M.groceryTotal})   Salt leaked into grocery: ${M.groceryMissingSalt}`,
      '',
      '— Medical validation —',
      `Clinical users: ${M.clinicalUsers}   Clinical breach-days: ${M.breachDays}   Plans blocked/warned: ${M.blockedPlans}`,
      `UNSAFE breaches shipped without a warning: ${M.unsafeShipped}  (target 0)`,
      `Blood influence verified (hba1c tightens sugar cap): ${M.bloodInfluenceOk}/${M.bloodInfluenceChecked}`,
      `Supplement contraindications: ${M.supplementUnsafe}/${M.supplementChecked}  (target 0)`,
      `Life-stage: pregnancy targets raised = ${pregOk}; prenatal kit (no plain multivit) = ${pregKitOk}; child no-deficit = ${childOk}`,
      '',
      '— Family —',
      `Family owners: ${M.familyOwners}   Members scaled: ${M.familyMembers}   Scaling correct: ${pct(M.familyScaleOk, M.familyMembers)}`,
      '',
      '— Regeneration —',
      `Determinism (same seed → identical): ${pct(M.determinismOk, M.determinismChecked)}   Variety (diff seed → differs): ${pct(M.varietyOk, M.determinismChecked)}`,
      '',
      'Sample unsafe/shipped issues:',
      ...unsafe.slice(0, 8).map((s) => '  ' + s),
      ...supplementIssues.slice(0, 4).map((s) => '  ' + s),
      '===========================================================',
    ];
    // eslint-disable-next-line no-console
    console.log(rep.join('\n'));

    // Hard gates: no crashes, no silently-shipped clinical breaches, no supplement contraindications, life-stage safe.
    expect(M.crashes).toBe(0);
    expect(M.unsafeShipped).toBe(0);
    expect(M.supplementUnsafe).toBe(0);
    expect(M.dietViol).toBe(0);
    expect(M.allergenLeak).toBe(0);
    expect(M.groceryMissingSalt).toBe(0);
    expect(pregOk && pregKitOk && childOk).toBe(true);
    expect(M.determinismOk).toBe(M.determinismChecked);
  });
});
