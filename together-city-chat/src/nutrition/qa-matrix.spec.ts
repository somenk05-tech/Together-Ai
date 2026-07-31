import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { isAllergenSafe } from './allergens';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, type ComposerPrefs, type Diet, type PoolRecipe } from './meal-composer';
import { categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients, perServingIngredients } from './ingredient-nutrients';

/**
 * Round-2 large-matrix QA harness. Faithfully mirrors NutritionService.datasetPool
 * (same mapping) so the REAL 11k dataset pool is exercised, then runs 150+ diverse
 * synthetic users through computeTargets + composeWeek and aggregates metrics.
 * Read-only; asserts only that nothing crashes. Prints a quantified report.
 */

// ── Mirror datasetPool() exactly ──
function mapDiet(d: string): Diet {
  const x = (d || '').toLowerCase();
  if (x === 'vegan' || x === 'jainvegan') return 'vegan';
  if (x === 'egg' || x === 'eggetarian') return 'eggetarian';
  if (x === 'veg' || x === 'vegetarian' || x === 'jain') return 'vegetarian';   // mirrors mapDiet()
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
function buildDatasetPool(): PoolRecipe[] {
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
    const ingredients = ing0
      .map((i) => ({ name: i.name, grams: Math.max(1, Math.round(((i.grams ?? 0)) / s)) }))
      .filter((i) => i.name && i.grams > 0);
    if (!ingredients.length) continue;
    // Normalised the way production normalises it. Every one of these harnesses
    // built its own pool and skipped this, so they measured an engine fed
    // ingredient quantities about seven times life size — and the clinical cap
    // breaches they reported were arithmetic rather than food.
    const ingredientsPerServing = perServingIngredients(ingredients, per(r.gramsPerServing as number) || 200);
    const n = computeNutrients(ingredientsPerServing);
    out.push({
      id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role,
      kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number),
      fat: per(r.fat as number), fiber: per(r.fiber as number),
      minutes: (r.minutes as number) || 20, grams: per(r.gramsPerServing as number) || 200, diet: mapDiet(r.diet as string),
      ingredients: ingredientsPerServing,
      nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat },
      nutrientComplete: n.complete,
      steps: [], imageUrl: null,
    } as PoolRecipe);
  }
  return out;
}

// ── Profile matrix generator ──
const SEXES = ['male', 'female'] as const;
const DIETS: Diet[] = ['vegetarian', 'vegan', 'eggetarian', 'nonveg'];
const GOALS = ['lose', 'maintain', 'gain'] as const;
const CONDITION_SETS: Array<{ tag: string; conditions: string[]; flags?: Record<string, string> }> = [
  { tag: 'healthy', conditions: [] },
  { tag: 'diabetes', conditions: ['diabetes'], flags: { hba1c: 'high' } },
  { tag: 'prediabetes', conditions: ['prediabetes'], flags: { hba1c: 'high' } },
  { tag: 'ckd3', conditions: ['kidney disease stage 3'] },
  { tag: 'ckd4', conditions: ['kidney disease stage 4'] },
  { tag: 'dialysis', conditions: ['kidney failure on dialysis'] },
  { tag: 'htn', conditions: ['hypertension'] },
  { tag: 'highchol', conditions: ['high cholesterol'], flags: { ldl: 'high', trig: 'high' } },
  { tag: 'fattyliver', conditions: ['fatty liver'] },
  { tag: 'gout', conditions: ['gout'] },
  { tag: 'dm+ckd+htn', conditions: ['diabetes', 'kidney disease stage 3', 'hypertension'], flags: { hba1c: 'high' } },
  { tag: 'dm+htn', conditions: ['diabetes', 'hypertension'], flags: { hba1c: 'high' } },
];
const AGES = [16, 19, 25, 34, 45, 55, 68, 82];
const ACTIVITY = [1.2, 1.4, 1.6, 1.9];

interface Profile { name: string; age: number; sex: string; diet: Diet; goal: string; activity: number; conditions: string[]; flags: Record<string, string>; excluded?: string[]; }
function makeProfiles(): Profile[] {
  const ps: Profile[] = [];
  let i = 0;
  // deterministic sweep across axes → 150+ combos
  for (const cs of CONDITION_SETS) {
    for (const diet of DIETS) {
      for (const goal of GOALS) {
        const age = AGES[i % AGES.length];
        const sex = SEXES[i % 2];
        const activity = ACTIVITY[i % ACTIVITY.length];
        ps.push({ name: `${cs.tag}|${diet}|${goal}|a${age}|${sex}`, age, sex, diet, goal, activity, conditions: cs.conditions, flags: cs.flags ?? {} });
        i++;
      }
    }
  }
  // Jain variants
  for (const goal of GOALS) ps.push({ name: `jain|veg|${goal}`, age: 40, sex: 'female', diet: 'vegetarian', goal, activity: 1.4, conditions: [], flags: {}, excluded: ['onion', 'garlic', 'potato', 'mushroom', 'ginger'] });
  // allergy variants
  for (const ex of [['peanut'], ['milk', 'paneer'], ['nuts'], ['egg'], ['soy']]) ps.push({ name: `allergy|${ex.join('+')}`, age: 30, sex: 'male', diet: 'vegetarian', goal: 'maintain', activity: 1.5, conditions: [], flags: {}, excluded: ex });
  return ps;
}

function clinicalTag(conditions: string[]): string | undefined {
  const c = conditions.join(' ').toLowerCase();
  if (/kidney|renal|ckd|dialysis/.test(c)) return 'Renal Friendly';
  if (/diabet|hba1c/.test(c)) return 'Diabetic Friendly';
  if (/hypertension|blood pressure|cholesterol|lipid|triglyceride/.test(c)) return 'Heart Friendly';
  return undefined;
}

describe('Nutrition Hub — Round-2 large matrix (real 11k pool)', () => {
  it('runs 150+ profiles and quantifies adherence, variety, clinical breaches', () => {
    const pool = buildDatasetPool();
    const profiles = makeProfiles();

    const m = {
      profiles: profiles.length, poolSize: pool.length,
      nutrientCompleteInPool: pool.filter((r) => r.nutrientComplete).length,
      days: 0, crashes: 0,
      kcalWithin10: 0, kcalWithin20: 0, kcalDays: 0,
      proteinMetDays: 0,
      structureBad: 0,
      dietViolations: 0,
      exclusionLeaks: 0,
      dupMainDays: 0,
      capBreachDays: 0, capBreachProfiles: 0,
      sodiumCapProfiles: 0, sodiumBreachDays: 0,
      groceryUntraceable: 0,
      zeroSodiumClinicalMeals: 0, clinicalMealsChecked: 0,
    };
    const breachExamples: string[] = [];
    const dietExamples: string[] = [];

    for (const p of profiles) {
      let t: Record<string, number>;
      try {
        t = computeTargets({ weightKg: p.sex === 'male' ? 74 : 62, heightCm: p.sex === 'male' ? 174 : 162, age: p.age, sex: p.sex, activity: p.activity, goal: p.goal as never, conditions: p.conditions, flags: p.flags }) as unknown as Record<string, number>;
      } catch { m.crashes++; continue; }
      const caps = {
        sodiumMg: t.sodiumMaxMg, potassiumMg: t.potassiumMaxMg, phosphorusMg: t.phosphorusMaxMg,
        sugarG: t.sugarMaxG, satFatG: t.satFatMaxG,
      };
      const isClinical = !!clinicalTag(p.conditions);
      const prefs: ComposerPrefs = {
        diet: p.diet, excluded: p.excluded,
        clinicalTag: clinicalTag(p.conditions), clinical: isClinical, caps: isClinical ? caps : undefined,
        avoidRice: /diabet|hba1c/.test((p.conditions.join(' ') + JSON.stringify(p.flags)).toLowerCase()),
      };
      const targets = { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber };

      let wk;
      try { wk = composeWeek(targets, prefs, 7, 12345, pool); }
      catch { m.crashes++; continue; }

      if (caps.sodiumMg) m.sodiumCapProfiles++;
      let profileBreached = false;
      let lastLunch = '', lastDinner = '';
      for (const day of wk.days) {
        m.days++; m.kcalDays++;
        const dev = Math.abs(day.totals.kcal - targets.kcal) / targets.kcal;
        if (dev <= 0.10) m.kcalWithin10++;
        if (dev <= 0.20) m.kcalWithin20++;
        if (day.totals.protein >= targets.protein * 0.9) m.proteinMetDays++;
        else if (process.env.PROTEIN_BREAKDOWN) {
          const k = `${p.diet}|${p.goal}|${isClinical ? 'clinical' : 'healthy'}`;
          (globalThis as never as Record<string, Map<string, number[]>>).__pb ??= new Map();
          const pb = (globalThis as never as Record<string, Map<string, number[]>>).__pb;
          const e = pb.get(k) ?? [0, 0, 0];
          e[0] += 1; e[1] += day.totals.protein; e[2] += targets.protein;
          pb.set(k, e);
        }

        const slots = day.meals.map((mm) => mm.slot).join(',');
        if (!prefs.fasting && slots !== 'b,l,s,es,d') m.structureBad++;

        for (const meal of day.meals) {
          for (const c of meal.components) {
            // diet adherence vs pool diet
            const pr = pool.find((x) => x.id === c.recipeId);
            const ladder: Record<Diet, Diet[]> = { vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'], eggetarian: ['vegan', 'vegetarian', 'eggetarian'], nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'] };
            if (pr && !ladder[p.diet].includes(pr.diet)) { m.dietViolations++; if (dietExamples.length < 6) dietExamples.push(`${p.name}: ${pr.diet} "${c.name}"`); }
            if (p.excluded?.length) {
              const hay = `${c.name} ${c.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
              // MEASURED WITH THE MATCHER, which is a narrower claim than this
              // line used to make. It was a substring test — the very substring
              // test the filter performed — so "leaks: 0" was one function
              // agreeing with itself and could not have come out otherwise. It
              // now says the planner honoured the allergen matcher. Whether the
              // MATCHER is right is a separate question with a separate answer:
              // allergens.spec.ts, an adversarial table written from what the
              // foods are rather than from what the code does.
              if (!isAllergenSafe(c.name, c.ingredients.map((i) => i.name), p.excluded)) m.exclusionLeaks++;
            }
            if (isClinical) {
              m.clinicalMealsChecked++;
              const na = (c as unknown as { sodiumMg?: number }).sodiumMg ?? 0;
              if (na === 0) m.zeroSodiumClinicalMeals++;
            }
          }
        }
        // duplicate main across consecutive days
        for (const code of ['l', 'd'] as const) {
          const main = day.meals.find((mm) => mm.slot === code)?.components.find((c) => c.role === 'main')?.recipeId ?? '';
          if (code === 'l') { if (main && main === lastLunch) m.dupMainDays++; lastLunch = main; }
          else { if (main && main === lastDinner) m.dupMainDays++; lastDinner = main; }
        }
        // clinical cap breach on the shipped plan
        const b = (day as unknown as { capBreaches?: unknown[] }).capBreaches ?? [];
        if (b.length) { m.capBreachDays++; profileBreached = true; if (breachExamples.length < 10) breachExamples.push(`${p.name} d${day.dayIndex + 1}: ${JSON.stringify(b).slice(0, 120)}`); }
        if (caps.sodiumMg && day.totals.sodiumMg > caps.sodiumMg) m.sodiumBreachDays++;
      }
      if (profileBreached) m.capBreachProfiles++;

      // grocery traceability
      const ids = new Set(wk.days.flatMap((d) => d.meals.flatMap((mm) => mm.components.map((c) => c.recipeId))));
      for (const g of wk.grocery) if (!g.fromRecipes.some((id: string) => ids.has(id))) m.groceryUntraceable++;
    }

    const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
    const rep = [
      '\n================ ROUND-2 LARGE MATRIX REPORT ================',
      `Profiles run: ${m.profiles}   Dataset pool: ${m.poolSize} recipes`,
      `Pool nutrientComplete: ${m.nutrientCompleteInPool}/${m.poolSize} (${pct(m.nutrientCompleteInPool, m.poolSize)}) — clinical filter/badge eligibility`,
      `Total plan-days generated: ${m.days}   Crashes: ${m.crashes}`,
      '',
      `Calorie adherence  ±10%: ${pct(m.kcalWithin10, m.kcalDays)}   ±20%: ${pct(m.kcalWithin20, m.kcalDays)}`,
      `Protein target met (≥90%): ${pct(m.proteinMetDays, m.kcalDays)} of days`,
      `Structure broken (≠5 slots): ${m.structureBad} days`,
      `Diet violations: ${m.dietViolations}   e.g. ${dietExamples.slice(0, 4).join(' | ') || 'none'}`,
      `Exclusion/allergen leaks: ${m.exclusionLeaks}`,
      `Consecutive-day duplicate main: ${m.dupMainDays} day-pairs`,
      '',
      `CLINICAL — profiles with a cap set: sodium ${m.sodiumCapProfiles}`,
      `Cap-breach days shipped (capBreaches non-empty): ${m.capBreachDays} across ${m.capBreachProfiles} profiles`,
      `Sodium over computed cap (days): ${m.sodiumBreachDays}`,
      `Clinical meals with computed sodium == 0: ${m.zeroSodiumClinicalMeals}/${m.clinicalMealsChecked} (${pct(m.zeroSodiumClinicalMeals, m.clinicalMealsChecked)})`,
      `Grocery lines untraceable to a recipe: ${m.groceryUntraceable}`,
      '',
      'Cap-breach examples:',
      ...breachExamples.map((e) => '  ' + e),
      '============================================================',
    ];
    // eslint-disable-next-line no-console
    console.log(rep.join('\n'));

    if (process.env.PROTEIN_BREAKDOWN) {
      const pb = (globalThis as never as Record<string, Map<string, number[]>>).__pb ?? new Map();
      // eslint-disable-next-line no-console
      console.log('\n===PROTEIN MISSES===\n' + [...pb.entries()].sort((a, b) => b[1][0] - a[1][0])
        .map(([k, [n, got, want]]) => `${String(n).padStart(4)} days  got ${Math.round(got / n)}g of ${Math.round(want / n)}g  ${k}`).join('\n'));
    }
    expect(m.crashes).toBe(0);
    expect(m.days).toBeGreaterThan(1000);

    // ── the ratchet ────────────────────────────────────────────────────
    //
    // This matrix is not the release gate. RELEASE-GATE.md's >=90% calorie
    // figure reads against sim-150, because the question it answers is whether
    // the hub works for the people who use it, and sim-150 is a realistic
    // distribution — 63 of its 150 users are clinical. This file is a
    // cross-product sweep in which EVERY profile carries a condition set, so it
    // describes the corners rather than the middle, and it is allowed to be
    // worse than the middle.
    //
    // What it is not allowed to be is quietly worse than yesterday. The two
    // harnesses report the same measure — the deviation arithmetic is identical
    // line for line — so a 23-point gap between them is a fact about who is
    // being simulated, and a gap that grows is a fact about the engine.
    //
    // Same shape as lint-ceiling.mjs on the web side: the number fails when it
    // gets worse AND when it gets better without anybody moving the floor. A
    // ratchet nobody ratchets is a floor that silently stops meaning anything.
    // The tolerance exists because these are percentages over ~1,000 plan-days
    // and a rounding-level wobble is not news.
    const floor = require('./qa-matrix-floor.json') as {
      calorieWithin10Pct: number; proteinMetPct: number; capBreachDays: number; tolerancePoints: number;
    };
    const tol = floor.tolerancePoints;
    const measured = {
      calorieWithin10Pct: Math.round(1000 * m.kcalWithin10 / m.kcalDays) / 10,
      proteinMetPct: Math.round(1000 * m.proteinMetDays / m.kcalDays) / 10,
      capBreachDays: m.capBreachDays,
    };

    const ratchet = (name: 'calorieWithin10Pct' | 'proteinMetPct', better: 'higher') => {
      void better;
      const now = measured[name];
      const was = floor[name];
      if (now < was - tol) {
        throw new Error(
          `${name} fell to ${now}% from a floor of ${was}%. The hardest profiles got worse. ` +
          'Find out which cohort moved before changing this number.',
        );
      }
      if (now > was + tol) {
        throw new Error(
          `${name} improved to ${now}% (floor ${was}%). Raise it in qa-matrix-floor.json and commit ` +
          'that alongside the change — an unratcheted floor stops protecting anything.',
        );
      }
    };
    ratchet('calorieWithin10Pct', 'higher');
    ratchet('proteinMetPct', 'higher');

    // Cap breaches move the other way: this one is a ceiling.
    if (measured.capBreachDays > floor.capBreachDays) {
      throw new Error(
        `Cap-breach days rose to ${measured.capBreachDays} from a ceiling of ${floor.capBreachDays}. ` +
        'These are days a clinical plan could not be made to meet its caps — they are reported and ' +
        'warned, never shipped silently, but more of them is a worse hub.',
      );
    }
    if (measured.capBreachDays < floor.capBreachDays) {
      throw new Error(
        `Cap-breach days fell to ${measured.capBreachDays} (ceiling ${floor.capBreachDays}). Lower it ` +
        'in qa-matrix-floor.json and commit that alongside the change.',
      );
    }
  });
});
