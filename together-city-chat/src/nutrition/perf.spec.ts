import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, type Diet, type PoolRecipe } from './meal-composer';
import { categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients } from './ingredient-nutrients';

/**
 * Measured engine throughput (Phase-3 performance signal). This is the CPU cost
 * of plan generation once the pool is warm — the per-request compute the server
 * pays. It is NOT an HTTP/DB load test (that needs the live deployment — see
 * scripts/load-test.js); it measures the pure composition the app runs per plan.
 */
function roleFor(c: MealCategory[]): string | null {
  if (c.includes('breakfast')) return 'breakfast';
  if (c.includes('lunch') || c.includes('dinner')) return 'main';
  if (c.includes('soup')) return 'soup'; if (c.includes('dessert')) return 'dessert';
  if (c.includes('drink')) return 'drink'; if (c.includes('snack')) return 'snack';
  return null;
}
function mapDiet(d: string): Diet { const x = (d || '').toLowerCase(); return x === 'vegan' || x === 'jainvegan' ? 'vegan' : x === 'egg' ? 'eggetarian' : x === 'veg' ? 'vegetarian' : 'nonveg'; }

describe('engine throughput (measured)', () => {
  it('generates 150 weekly plans and reports ms/plan', () => {
    const rows = JSON.parse(gunzipSync(readFileSync(join(__dirname, 'data', 'recipes.dataset.json.gz'))).toString('utf8')) as Array<Record<string, unknown>>;
    const pool: PoolRecipe[] = [];
    for (const r of rows) {
      const ing0 = (r.ingredients as Array<{ name: string; grams?: number }>) ?? []; if (!ing0.length) continue;
      const cats = categorizeRecipe({ name: r.name as string, slot: r.slot as string, minutes: r.minutes as number, kcal: r.kcal as number });
      const role = roleFor(cats); if (!role) continue;
      const s = Math.max(1, (r.servings as number) ?? 1); const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
      const ingredients = ing0.map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) })).filter((i) => i.name && i.grams > 0);
      if (!ingredients.length) continue;
      const n = computeNutrients(ingredients);
      pool.push({ id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role, kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number), fat: per(r.fat as number), fiber: per(r.fiber as number), minutes: (r.minutes as number) || 20, grams: per(r.gramsPerServing as number) || 200, diet: mapDiet(r.diet as string), ingredients, nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat }, nutrientComplete: n.complete, steps: [], imageUrl: null } as PoolRecipe);
    }
    const t = computeTargets({ weightKg: 72, heightCm: 170, age: 40, sex: 'male', activity: 1.5, goal: 'maintain', conditions: [], flags: {} }) as unknown as Record<string, number>;
    const targets = { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber };
    const N = 150; const start = process.hrtime.bigint();
    for (let i = 0; i < N; i++) composeWeek(targets, { diet: 'vegetarian' }, 7, 1000 + i, pool);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    // eslint-disable-next-line no-console
    console.log(`\nENGINE THROUGHPUT: ${N} plans in ${ms.toFixed(0)} ms = ${(ms / N).toFixed(1)} ms/plan (~${Math.round(1000 / (ms / N))} plans/sec/core, pool ${pool.length})`);
    expect(ms / N).toBeLessThan(200); // generous ceiling; typical is far lower
  });
});
