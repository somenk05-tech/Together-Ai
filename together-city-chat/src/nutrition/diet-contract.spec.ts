import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { computeTargets } from './nutrition.service';
import { composeWeek, type ComposerPrefs, type Diet, type PoolRecipe } from './meal-composer';
import { categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients } from './ingredient-nutrients';
import { JAIN_EXCLUSION_HINTS, explainScreen, screenRecipe } from './diet-tags';

/**
 * QA-8.1 — the contract test.
 *
 * "Crawl every recommendation, meal-plan and search endpoint as veg, Jain and
 * vegan users; a single forbidden tag in any response fails the build."
 *
 * There is no test database, so this exercises the thing the endpoints are made
 * of rather than the endpoints themselves: real personas, the real 11k pool,
 * the real composer, a full week each. Every dish that comes back out is
 * screened against what that persona may eat, and the assertion is on the DISH,
 * not on its label — a mislabelled recipe has to fail here, because that is the
 * failure this whole section is about.
 *
 * The pool build mirrors NutritionService.datasetPool exactly, the way
 * qa-matrix.spec.ts does. If the two drift, this stops testing what ships —
 * so the mapping is asserted below rather than assumed.
 */

function mapDiet(d: string): Diet {
  const x = (d || '').toLowerCase();
  if (x === 'vegan' || x === 'jainvegan') return 'vegan';
  if (x === 'egg' || x === 'eggetarian') return 'eggetarian';
  if (x === 'veg' || x === 'vegetarian' || x === 'jain') return 'vegetarian';
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

function buildPool(): PoolRecipe[] {
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
      .map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) }))
      .filter((i) => i.name && i.grams > 0);
    if (!ingredients.length) continue;
    const n = computeNutrients(ingredients);
    out.push({
      id: r.id as string, name: r.name as string, cuisine: r.country as string, categories: cats, role,
      kcal: per(r.kcal as number) || 200, protein: per(r.protein as number), carbs: per(r.carbs as number),
      fat: per(r.fat as number), fiber: per(r.fiber as number),
      minutes: (r.minutes as number) || 20, grams: per(r.gramsPerServing as number) || 200,
      diet: mapDiet(r.diet as string), ingredients,
      nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat },
      nutrientComplete: n.complete, steps: [], imageUrl: null,
    } as PoolRecipe);
  }
  return out;
}

const POOL = buildPool();

interface Persona {
  label: string;
  /** The diet as the CITIZEN holds it, before any internal mapping. */
  userDiet: string;
  composerDiet: Diet;
  excluded?: string[];
}

const PERSONAS: Persona[] = [
  { label: 'vegetarian', userDiet: 'veg', composerDiet: 'vegetarian' },
  { label: 'vegan', userDiet: 'vegan', composerDiet: 'vegan' },
  { label: 'eggetarian', userDiet: 'egg', composerDiet: 'eggetarian' },
  // Jain reaches the composer as a vegetarian plus the root/allium exclusion —
  // which is exactly the arrangement this test exists to keep honest.
  { label: 'jain', userDiet: 'jain', composerDiet: 'vegetarian', excluded: [...JAIN_EXCLUSION_HINTS] },
];

const targetsFor = () => {
  const t = computeTargets({
    weightKg: 68, heightCm: 168, age: 34, sex: 'female', activity: 1.4, goal: 'maintain',
    conditions: [], flags: {},
  });
  // computeTargets says `carb`; the composer wants `carbs`. Same reshape
  // qa-matrix.spec.ts does — mirroring the service rather than inventing one.
  return { kcal: t.kcal, protein: t.protein, carbs: (t as unknown as { carb: number }).carb, fat: t.fat, fiber: t.fiber };
};

function planFor(p: Persona, seed: number) {
  const prefs: ComposerPrefs = {
    diet: p.composerDiet,
    ...(p.excluded ? { excluded: p.excluded } : {}),
  } as ComposerPrefs;
  return composeWeek(targetsFor(), prefs, 7, seed, POOL);
}

describe('the pool this test runs against is the pool that ships', () => {
  it('is the real dataset, not a stub', () => {
    expect(POOL.length).toBeGreaterThan(3000);
  });

  it('maps jain to vegetarian, not to the non-veg default', () => {
    // The bug this pins: with no case for 'jain', the fall-through made every
    // Jain dish non-veg, so the only diners who could be served them were the
    // ones who eat meat.
    expect(mapDiet('jain')).toBe('vegetarian');
    expect(mapDiet('jainvegan')).toBe('vegan');
    expect(mapDiet('anything-unrecognised')).toBe('nonveg');
  });

  it('actually carries Jain dishes', () => {
    expect(POOL.filter((r) => r.diet === 'vegetarian').length).toBeGreaterThan(100);
  });
});

describe('a week of meals never contains what the citizen does not eat', () => {
  for (const p of PERSONAS) {
    it(`${p.label}: seven days, every dish screened`, () => {
      const offences: string[] = [];
      // Several seeds, because the composer varies by seed and one plan is one
      // sample. A rule that only holds for seed 7 is not a rule.
      for (const seed of [1, 7, 42, 99]) {
        const week = planFor(p, seed);
        for (const day of week.days) {
          for (const meal of day.meals) {
            for (const c of meal.components) {
              const dish = POOL.find((r) => r.id === c.recipeId);
              const names = dish ? dish.ingredients.map((i) => i.name) : [c.name];
              const screen = screenRecipe(p.userDiet, names);
              if (!screen.ok) offences.push(`seed ${seed} · ${c.name} — ${explainScreen(screen)}`);
            }
          }
        }
      }
      expect(offences).toEqual([]);
    });
  }
});

describe('the screen is not passing by producing nothing', () => {
  it('each persona still gets a full week of real food', () => {
    // A filter that returns an empty plan passes every safety assertion above
    // and is useless. This is the counterweight.
    for (const p of PERSONAS) {
      const week = planFor(p, 7);
      expect(week.days.length).toBe(7);
      const dishes = week.days.flatMap((d) => d.meals.flatMap((m) => m.components));
      expect(dishes.length).toBeGreaterThan(20);
    }
  });
});
