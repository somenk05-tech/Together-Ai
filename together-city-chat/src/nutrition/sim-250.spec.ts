import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, scaleComposedWeek, type ComposerPrefs, type Diet, type PoolRecipe, type ClinicalCaps } from './meal-composer';
import { categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients } from './ingredient-nutrients';
import { flagsFor, conditionsFromBlood } from './clinical-engine';
import { guidelineCaps } from './plan-score';

/** Diet-compatible protein sources — the production profile UI only offers these,
 *  so the audit must too (assigning "Chicken" to a vegan is not a real scenario). */
const DIET_PROTEINS: Record<Diet, string[]> = {
  vegan: ['tofu', 'lentils', 'chickpeas', 'beans'],
  vegetarian: ['paneer', 'tofu', 'lentils', 'chickpeas', 'beans'],
  eggetarian: ['eggs', 'paneer', 'tofu', 'lentils'],
  nonveg: ['chicken', 'fish', 'mutton', 'eggs', 'paneer'],
};

/**
 * Round-4 comprehensive audit — 250 virtual users, BOTH plan modes.
 * SIMULATED at the engine layer (computeTargets + composeWeek over the real 11k
 * pool), mirroring composeFor's mode logic:
 *   • preferred: caps undefined, clinical false, favourites = chosen proteins.
 *   • optimal:   caps = full clinical caps, clinical = isClinical, no favourites.
 * Not an HTTP/DB/UI test. Reports measured pass/fail.
 */
function mapDiet(d: string): Diet { const x = (d || '').toLowerCase(); return x === 'vegan' || x === 'jainvegan' ? 'vegan' : x === 'egg' ? 'eggetarian' : x === 'veg' ? 'vegetarian' : 'nonveg'; }
function roleFor(c: MealCategory[]): string | null {
  if (c.includes('breakfast')) return 'breakfast'; if (c.includes('lunch') || c.includes('dinner')) return 'main';
  if (c.includes('soup')) return 'soup'; if (c.includes('dessert')) return 'dessert'; if (c.includes('drink')) return 'drink'; if (c.includes('snack')) return 'snack'; return null;
}
let POOL: PoolRecipe[] | null = null;
function pool(): PoolRecipe[] {
  if (POOL) return POOL;
  const rows = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'data', 'recipes.dataset.json.gz'))).toString('utf8')) as Array<Record<string, unknown>>;
  const out: PoolRecipe[] = [];
  for (const r of rows) {
    const ing0 = (r.ingredients as Array<{ name: string; grams?: number }>) ?? []; if (!ing0.length) continue;
    const cats = categorizeRecipe({ name: r.name as string, slot: r.slot as string, minutes: r.minutes as number, kcal: r.kcal as number });
    const role = roleFor(cats); if (!role) continue;
    const s = Math.max(1, (r.servings as number) ?? 1); const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
    const ingredients = ing0.map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) })).filter((i) => i.name && i.grams > 0);
    if (!ingredients.length) continue;
    const n = computeNutrients(ingredients);
    out.push({ id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role, kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number), fat: per(r.fat as number), fiber: per(r.fiber as number), minutes: (r.minutes as number) || 20, grams: per(r.gramsPerServing as number) || 200, diet: mapDiet(r.diet as string), ingredients, nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat }, nutrientComplete: n.complete, steps: [], imageUrl: (r.recipeNo ? `/recipe-images/${r.recipeNo}.webp` : null) } as PoolRecipe);
  }
  POOL = out; return out;
}

interface VUser { id: string; arch: string; age: number; sex: string; wt: number; ht: number; act: number; diet: Diet; goal: string; conditions: string[]; blood: Record<string, number>; excluded: string[]; proteins: string[]; cuisine: string; fasting?: boolean; family?: number }
const DIETS: Diet[] = ['vegetarian', 'vegan', 'eggetarian', 'nonveg'];
const CUIS = ['Indian', 'Chinese', 'Thai', 'Italian', 'Mediterranean'];
const PROTEIN_SETS = [['Chicken', 'Fish'], ['Fish'], ['Eggs'], ['Paneer'], ['Tofu', 'Lentils'], ['Chicken', 'Mutton', 'Fish'], []];
const COND_SETS: Array<{ tag: string; c: string[]; b: Record<string, number> }> = [
  { tag: 'healthy', c: [], b: {} },
  { tag: 't2d', c: ['diabetes'], b: { hba1c: 8 } },
  { tag: 'prediab', c: ['prediabetes'], b: { hba1c: 6 } },
  { tag: 'fattyliver', c: ['fatty liver'], b: { alt: 70 } },
  { tag: 'highchol', c: ['high cholesterol'], b: { ldl: 190, trig: 260 } },
  { tag: 'ckd2', c: [], b: { egfr: 75 } },
  { tag: 'ckd3', c: ['kidney disease stage 3'], b: { egfr: 45 } },
  { tag: 'gout', c: [], b: { uricAcid: 9 } },
  { tag: 'htn', c: ['hypertension'], b: {} },
  { tag: 'thyroid', c: ['hypothyroid'], b: { tsh: 8 } },
  { tag: 'anemia', c: [], b: { hb: 9, ferritin: 10 } },
  { tag: 'vitd', c: [], b: { vitd: 12 } },
  { tag: 'b12', c: [], b: { b12: 120 } },
  { tag: 'multi', c: ['diabetes', 'hypertension'], b: { hba1c: 9, ldl: 170 } },
];
function rr<T>(a: T[], i: number): T { return a[i % a.length]; }
function makeUsers(): VUser[] {
  const u: VUser[] = []; let i = 0;
  const push = (arch: string, n: number, f: (i: number) => Partial<VUser>) => {
    for (let k = 0; k < n; k++) { const cs = rr(COND_SETS, i); u.push({ id: `${arch}-${k}`, arch, age: 18 + (i * 7) % 70, sex: i % 2 ? 'female' : 'male', wt: 55 + (i * 3) % 45, ht: i % 2 ? 160 : 175, act: rr([1.2, 1.4, 1.6, 1.9], i), diet: rr(DIETS, i), goal: 'maintain', conditions: cs.c, blood: cs.b, excluded: [], proteins: rr(PROTEIN_SETS, i), cuisine: rr(CUIS, i), fasting: i % 5 === 0, ...f(i) }); i++; }
  };
  push('healthy', 40, () => ({ conditions: [], blood: {} }));
  push('weightloss', 30, () => ({ goal: 'lose', wt: 85 + (i % 20) }));
  push('musclegain', 25, () => ({ goal: 'gain', act: 1.8 }));
  push('diabetes', 30, (i) => ({ conditions: rr([['diabetes'], ['prediabetes']], i), blood: { hba1c: 7.5 } }));
  push('heart', 20, () => ({ conditions: ['high cholesterol'], blood: { ldl: 185, trig: 240 } }));
  push('kidney', 20, (i) => ({ conditions: [rr(['kidney disease stage 2', 'kidney disease stage 3'], i)], blood: { egfr: rr([70, 45], i) } }));
  push('liver', 15, () => ({ conditions: ['fatty liver'], blood: { alt: 75, ast: 60 } }));
  push('gout', 10, () => ({ blood: { uricAcid: 9.2 } }));
  push('elderly', 15, () => ({ age: 68 + (i % 20), act: 1.2 }));
  push('teen', 10, () => ({ age: 13 + (i % 5) }));
  push('proteinpick', 25, (i) => ({ proteins: rr([['Chicken', 'Fish'], ['Fish'], ['Eggs'], ['Paneer'], ['Tofu']], i), diet: 'nonveg' }));
  push('family', 10, (i) => ({ family: 3 + (i % 4) }));
  // Keep only diet-compatible protein picks (mirrors the production profile UI) so
  // the protein-respect metric isn't deflated by impossible combos.
  for (const usr of u) usr.proteins = usr.proteins.filter((p) => DIET_PROTEINS[usr.diet].includes(p.toLowerCase()));
  return u;
}

function targetsFor(u: VUser) { return computeTargets({ weightKg: u.wt, heightCm: u.ht, age: u.age, sex: u.sex, activity: u.act, goal: u.goal as never, conditions: [...new Set([...u.conditions, ...conditionsFromBlood(u.blood)])], flags: flagsFor(u.blood) as Record<string, string> }) as unknown as Record<string, number>; }
function isClinicalOf(u: VUser) { const c = [...u.conditions, ...conditionsFromBlood(u.blood)].join(' ').toLowerCase(); const f = flagsFor(u.blood); return /kidney|renal|ckd|dialysis|diabet|hba1c|hypertension|cholesterol|lipid|triglycer|fatty liver|gout/.test(c) || f.hba1c === 'high' || f.ldl === 'high' || f.trig === 'high'; }
function prefsFor(u: VUser, mode: 'preferred' | 'optimal'): ComposerPrefs {
  const t = targetsFor(u);
  const caps: ClinicalCaps = { sodiumMg: t.sodiumMaxMg, potassiumMg: t.potassiumMaxMg, phosphorusMg: t.phosphorusMaxMg, sugarG: t.sugarMaxG, satFatG: t.satFatMaxG };
  const optimal = mode === 'optimal'; const clin = isClinicalOf(u);
  const mix = { [u.cuisine]: 100 };
  // Mirror the service: Optimal enforces clinical caps for a real condition, else
  // general guideline caps (soft-trimmed, clinical=false → never blocks a healthy user).
  const healthCaps = clin ? caps : guidelineCaps(t.kcal);
  return { diet: u.diet, excluded: u.excluded, cuisineBySlot: { breakfast: mix, lunch: mix, dinner: mix, snack: mix }, fasting: u.fasting ? { enabled: true, protocol: '16:8' } : undefined, caps: optimal ? healthCaps : undefined, clinical: optimal && clin, favourites: optimal ? undefined : (u.proteins.length ? u.proteins : undefined), avoidRice: /diabet/.test(u.conditions.join(' ')) };
}
function planFor(u: VUser, mode: 'preferred' | 'optimal') { const t = targetsFor(u); return composeWeek({ kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber }, prefsFor(u, mode), 7, hash(u.id) + (mode === 'optimal' ? 101 : 0), pool()); }
function hash(s: string) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) || 7; }

describe('Nutrition Engine — 250-user audit (both modes)', () => {
  it('runs 250 users × 2 modes and reports measured results', () => {
    const users = makeUsers();
    const M = { users: users.length, plans: 0, crashes: 0, days: 0, structOk: 0,
      dietViol: 0, allergenLeak: 0, groceryOk: 0, groceryTot: 0,
      prefBlocked: 0, optBlocked: 0, optUnsafeShipped: 0, optClinical: 0,
      proteinChecked: 0, proteinRespected: 0, cuisineChecked: 0, cuisineReflected: 0,
      detOk: 0, detChk: 0, dupMain: 0, familyMembers: 0, familyScaleOk: 0, ms: 0 };
    const ladder: Record<Diet, Diet[]> = { vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'], eggetarian: ['vegan', 'vegetarian', 'eggetarian'], nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'] };
    const unsafe: string[] = [];
    const start = process.hrtime.bigint();

    for (const u of users) {
      for (const mode of ['preferred', 'optimal'] as const) {
        let wk; try { wk = planFor(u, mode); } catch (e) { M.crashes++; unsafe.push(`${u.id}/${mode}: CRASH ${(e as Error).message}`); continue; }
        M.plans++;
        if (mode === 'optimal') { if (isClinicalOf(u)) M.optClinical++; if (wk.blocked) M.optBlocked++; }
        else if (wk.blocked) M.prefBlocked++;
        for (const day of wk.days) {
          M.days++;
          if (u.fasting ? day.meals.length >= 1 : day.meals.map((m) => m.slot).join(',') === 'b,l,es,d') M.structOk++;
          let lastMain = '';
          for (const m of day.meals) for (const c of m.components) {
            const pr = pool().find((x) => x.id === c.recipeId);
            if (pr && !ladder[u.diet].includes(pr.diet)) M.dietViol++;
            if (u.excluded.length) { const hay = `${c.name} ${c.ingredients.map((i) => i.name).join(' ')}`.toLowerCase(); for (const ex of u.excluded) if (hay.includes(ex.toLowerCase())) M.allergenLeak++; }
          }
          for (const code of ['l', 'd'] as const) { const mid = day.meals.find((m) => m.slot === code)?.components.find((c) => c.role === 'main')?.recipeId ?? ''; if (mid && mid === lastMain) M.dupMain++; lastMain = mid; }
          // "Unsafe shipped" = a CLINICAL user's day breaches their clinical caps without a warning.
          // Healthy users' general-guideline caps are a soft ideal, not a safety breach (C1).
          const b = day.capBreaches ?? []; if (mode === 'optimal' && isClinicalOf(u) && b.length && !wk.blocked) { M.optUnsafeShipped++; unsafe.push(`${u.id} opt d${day.dayIndex + 1}: shipped ${JSON.stringify(b)}`); }
        }
        const ids = new Set(wk.days.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => c.recipeId))));
        for (const g of wk.grocery) { M.groceryTot++; if (g.fromRecipes.some((id) => ids.has(id))) M.groceryOk++; }

        // Preferred-mode: chosen protein sources respected; cuisine reflected.
        if (mode === 'preferred') {
          const mains = wk.days.flatMap((d) => d.meals.flatMap((m) => m.components.filter((c) => c.role === 'main' || c.role === 'dal')));
          if (u.proteins.length && mains.length) {
            M.proteinChecked++;
            const favs = u.proteins.map((p) => p.toLowerCase());
            const match = mains.filter((c) => { const hay = `${c.name} ${c.ingredients.map((i) => i.name).join(' ')}`.toLowerCase(); return favs.some((f) => hay.includes(f) || (f === 'lentils' && /dal|lentil/.test(hay)) || (f === 'eggs' && /egg/.test(hay))); }).length;
            if (match / mains.length >= 0.5) M.proteinRespected++;
          }
          const lunchMains = wk.days.flatMap((d) => d.meals.filter((m) => m.slot === 'l' || m.slot === 'd').flatMap((m) => m.components.filter((c) => c.role === 'main')));
          if (lunchMains.length) {
            M.cuisineChecked++;
            const norm: Record<string, string> = { India: 'Indian', Italy: 'Italian', Thailand: 'Thai', China: 'Chinese', Greece: 'Mediterranean' };
            const reflect = lunchMains.filter((c) => { const pr = pool().find((x) => x.id === c.recipeId); const cu = pr ? (norm[pr.cuisine] ?? pr.cuisine) : ''; return cu === u.cuisine; }).length;
            if (reflect / lunchMains.length >= 0.4) M.cuisineReflected++;
          }
        }
      }
      // determinism (preferred, same seed → identical) — sampled for speed
      if (hash(u.id) % 4 === 0) {
        M.detChk++;
        const a = planFor(u, 'preferred'); const b2 = planFor(u, 'preferred');
        const sig = (w: ReturnType<typeof planFor>) => w.days.map((d) => d.meals.map((m) => m.components[0]?.recipeId).join('|')).join('/');
        if (sig(a) === sig(b2)) M.detOk++;
      }
      if (u.family) { const owner = planFor(u, 'preferred'); const t = targetsFor(u); for (let mi = 0; mi < u.family; mi++) { M.familyMembers++; const factor = Math.max(0.4, Math.min(1.9, (t.kcal * (0.7 + 0.1 * mi)) / Math.max(1, t.kcal))); const mwk = scaleComposedWeek(owner, factor); if (Math.abs(mwk.days[0].totals.kcal - owner.days[0].totals.kcal * factor) / Math.max(1, owner.days[0].totals.kcal * factor) <= 0.2) M.familyScaleOk++; } }
    }
    M.ms = Number(process.hrtime.bigint() - start) / 1e6;
    const pct = (n: number, d: number) => d ? `${(100 * n / d).toFixed(1)}%` : 'n/a';
    // eslint-disable-next-line no-console
    console.log(['\n================ 250-USER NUTRITION AUDIT ================',
      `Users ${M.users} · plans ${M.plans} (2 modes) · plan-days ${M.days} · crashes ${M.crashes} · ${M.ms.toFixed(0)}ms (${(M.ms / M.plans).toFixed(1)} ms/plan)`,
      `Structure correct: ${pct(M.structOk, M.days)}   Diet violations: ${M.dietViol}   Allergen leaks: ${M.allergenLeak}   Grocery traceable: ${pct(M.groceryOk, M.groceryTot)}`,
      `Consecutive-day dup main: ${M.dupMain}   Determinism: ${pct(M.detOk, M.detChk)}`,
      '',
      '— My Preferences mode —',
      `Blocked (should be 0 — never forces): ${M.prefBlocked}`,
      `Protein source respected (≥50% mains): ${pct(M.proteinRespected, M.proteinChecked)} of ${M.proteinChecked} users`,
      `Cuisine reflected (≥40% mains): ${pct(M.cuisineReflected, M.cuisineChecked)}`,
      '',
      '— Optimal Health mode —',
      `Clinical users: ${M.optClinical}   Plans blocked/warned: ${M.optBlocked}`,
      `UNSAFE breaches shipped without warning: ${M.optUnsafeShipped}  (target 0)`,
      '',
      '— Family —',
      `Members scaled: ${M.familyMembers}   Scaling correct: ${pct(M.familyScaleOk, M.familyMembers)}`,
      ...unsafe.slice(0, 6).map((s) => '  ' + s),
      '=========================================================='].join('\n'));

    expect(M.crashes).toBe(0);
    expect(M.dietViol).toBe(0);
    expect(M.optUnsafeShipped).toBe(0);
    expect(M.prefBlocked).toBe(0);
    expect(M.detOk).toBe(M.detChk);
    expect(M.days).toBeGreaterThan(3000);
  });
});
