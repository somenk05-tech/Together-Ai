import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, type ComposerPrefs, type Diet, type PoolRecipe } from './meal-composer';
import { categorizeRecipe } from './meal-engine';
import { computeNutrients } from './ingredient-nutrients';
import { guidelineCaps } from './plan-score';

/**
 * Engine load test — generation under burst. Warms the real 11k pool ONCE, then
 * generates a large burst of plans across varied users/modes back-to-back and
 * reports latency percentiles + throughput. This measures the CPU-bound plan
 * generation path (the hot path behind GET /nutrition/plan/composed) and that the
 * shared pool is built once and reused. It does NOT drive live HTTP/DB (the plan
 * endpoint is auth-guarded and the live host isn't reachable from CI).
 */
function mapDiet(d: string): Diet { const x = (d || '').toLowerCase(); return x === 'vegan' || x === 'jainvegan' ? 'vegan' : x === 'egg' ? 'eggetarian' : x === 'veg' ? 'vegetarian' : 'nonveg'; }
function roleFor(cats: string[]): string | null {
  const c = cats.join(' ');
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
    out.push({ id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role, kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number), fat: per(r.fat as number), fiber: per(r.fiber as number), minutes: (r.minutes as number) || 20, grams: per(r.gramsPerServing as number) || 200, diet: mapDiet(r.diet as string), ingredients, nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat }, nutrientComplete: n.complete, steps: [], imageUrl: null } as PoolRecipe);
  }
  POOL = out; return out;
}

describe('Nutrition engine — generation under load', () => {
  it('generates a burst of plans and reports latency percentiles', () => {
    const p = pool();
    const DIETS: Diet[] = ['vegetarian', 'vegan', 'eggetarian', 'nonveg'];
    const CUIS = ['Indian', 'Chinese', 'Thai', 'Italian', 'Mediterranean'];
    const N = 200;
    const lat: number[] = [];
    const t0 = process.hrtime.bigint();
    for (let i = 0; i < N; i++) {
      const diet = DIETS[i % DIETS.length];
      const cuisine = CUIS[i % CUIS.length];
      const clinical = i % 3 === 0;
      const t = computeTargets({ weightKg: 60 + (i % 40), heightCm: 165 + (i % 20), age: 20 + (i % 55), sex: i % 2 ? 'female' : 'male', activity: 1.4, goal: 'maintain', conditions: clinical ? ['diabetes'] : [], flags: (clinical ? { hba1c: 'high' } : {}) as Record<string, string> }) as unknown as Record<string, number>;
      const optimal = i % 2 === 0;
      const caps = { sodiumMg: t.sodiumMaxMg, potassiumMg: t.potassiumMaxMg, phosphorusMg: t.phosphorusMaxMg, sugarG: t.sugarMaxG, satFatG: t.satFatMaxG };
      const mix = { [cuisine]: 100 };
      const prefs: ComposerPrefs = { diet, cuisineBySlot: { breakfast: mix, lunch: mix, dinner: mix, snack: mix }, caps: optimal ? (clinical ? caps : guidelineCaps(t.kcal)) : undefined, clinical: optimal && clinical };
      const s = process.hrtime.bigint();
      composeWeek({ kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber }, prefs, 7, 1000 + i, p);
      lat.push(Number(process.hrtime.bigint() - s) / 1e6);
    }
    const totalMs = Number(process.hrtime.bigint() - t0) / 1e6;
    lat.sort((a, b) => a - b);
    const pctile = (q: number) => lat[Math.min(lat.length - 1, Math.floor(q * lat.length))];
    // eslint-disable-next-line no-console
    console.log(['\n============ ENGINE LOAD (burst) ============',
      `Pool: ${p.length} recipes (built once, reused)`,
      `Plans: ${N} · total ${totalMs.toFixed(0)}ms · throughput ${(N / (totalMs / 1000)).toFixed(1)} plans/sec/core`,
      `Latency ms — p50 ${pctile(0.5).toFixed(1)} · p90 ${pctile(0.9).toFixed(1)} · p95 ${pctile(0.95).toFixed(1)} · p99 ${pctile(0.99).toFixed(1)} · max ${lat[lat.length - 1].toFixed(1)}`,
      '============================================='].join('\n'));
    expect(lat.length).toBe(N);
    expect(pctile(0.95)).toBeLessThan(1500);   // p95 stays well under a request timeout
  });
});
