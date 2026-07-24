import {
  SLOTS, SLOT_BY_CODE, type SlotCode, type MealCategory,
  resolveSchedule, type FastingPrefs, type DaySchedule,
} from './meal-engine';
import { COMPONENT_SEEDS, componentId, componentSteps, isPantryStaple, type ComponentSeed } from './component-recipes';
import { computeNutrients } from './ingredient-nutrients';

/** Clinically-capped nutrients tracked on every recipe/meal/day (Workstream A). */
export interface Nutrients { sodiumMg: number; potassiumMg: number; phosphorusMg: number; sugarG: number; addedSugarG: number; satFatG: number }
export interface ClinicalCaps { sodiumMg?: number; potassiumMg?: number; phosphorusMg?: number; sugarG?: number; satFatG?: number }
const ZERO_NUTR: Nutrients = { sodiumMg: 0, potassiumMg: 0, phosphorusMg: 0, sugarG: 0, addedSugarG: 0, satFatG: 0 };

/* ─────────────────────────── Types the frontend consumes ─────────────────────────── */

export type Diet = 'vegan' | 'vegetarian' | 'eggetarian' | 'nonveg';

export interface ComposerPrefs {
  diet?: Diet;
  excluded?: string[];                 // ingredient/recipe keywords to avoid
  /** Per-slot cuisine weights (Rule 11): bucket → { cuisine: weight }. */
  cuisineBySlot?: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Record<string, number>>>;
  /** Locked buckets (Rule 12): only those cuisines allowed. */
  cuisineLocks?: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', boolean>>;
  fasting?: FastingPrefs;
  includePantry?: boolean;             // grocery pantry toggle (Rule 10)
  clinicalTag?: string;                // e.g. 'Diabetic Friendly', 'Renal Friendly'
  avoidRice?: boolean;
  /** Daily clinical caps from computeTargets (Workstream A). When set, capped
   *  roles use only nutrition-complete recipes and selection minimises the load. */
  caps?: ClinicalCaps;
  clinical?: boolean;                  // is this a clinical profile (enforce caps hard)
}

export interface DayTargets { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export interface MealIngredient { name: string; grams: number; pantry: boolean }
export interface MealComponentOut extends Nutrients {
  recipeId: string; name: string; role: string; category: MealCategory;
  portionPct: number; grams: number;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  nutrientComplete: boolean;
  steps: string[]; imageUrl?: string | null;
  minutes: number; ingredients: MealIngredient[];
}
export interface MealTotals extends DayTargets, Nutrients {}
export interface ComposedMeal {
  slot: SlotCode; key: string; label: string;
  title: string;                       // composite meal name (Rule 16)
  scheduledTime: string;               // core property (IF Rule 7)
  energyPct: number; targetKcal: number;
  totals: MealTotals; minutes: number;
  components: MealComponentOut[];
}
export interface ComposedDay {
  dayIndex: number;
  fasting: boolean; protocol: string | null; window: { start: string; end: string };
  meals: ComposedMeal[]; totals: MealTotals;
  capBreaches?: string[];
}
export interface GroceryItem { name: string; grams: number; unit: string; pantry: boolean; fromRecipes: string[] }
export interface ComposedWeek {
  days: ComposedDay[];
  grocery: GroceryItem[];
  targets: DayTargets;
  caps?: ClinicalCaps;
  fasting: boolean; protocol: string | null;
  validation: { ok: boolean; issues: string[] };
}

/** Which caps a day's totals exceed (Workstream A enforcement + reporting). */
function capBreaches(totals: MealTotals, caps?: ClinicalCaps): string[] {
  if (!caps) return [];
  const out: string[] = [];
  if (caps.sodiumMg && totals.sodiumMg > caps.sodiumMg) out.push(`sodium ${totals.sodiumMg}/${caps.sodiumMg} mg`);
  if (caps.potassiumMg && totals.potassiumMg > caps.potassiumMg) out.push(`potassium ${totals.potassiumMg}/${caps.potassiumMg} mg`);
  if (caps.phosphorusMg && totals.phosphorusMg > caps.phosphorusMg) out.push(`phosphorus ${totals.phosphorusMg}/${caps.phosphorusMg} mg`);
  if (caps.sugarG && totals.addedSugarG > caps.sugarG) out.push(`added sugar ${totals.addedSugarG}/${caps.sugarG} g`);
  if (caps.satFatG && totals.satFatG > caps.satFatG) out.push(`sat fat ${totals.satFatG}/${caps.satFatG} g`);
  return out;
}

/* ─────────────────────────── Recipe pool ─────────────────────────── */

export interface PoolRecipe extends Omit<ComponentSeed, 'ing'> {
  id: string;
  ingredients: Array<{ name: string; grams: number }>;
  nutrients: Nutrients;               // per standard serving (Workstream A)
  nutrientComplete: boolean;
  steps: string[];                    // cooking instructions (HIGH-4)
  imageUrl?: string | null;
}

/** The curated component recipes (sides, snacks, breakfasts) — always available. */
export const SEED_POOL: PoolRecipe[] = COMPONENT_SEEDS.map((s) => {
  const ingredients = s.ing.map(([name, grams]) => ({ name, grams }));
  const n = computeNutrients(ingredients);
  return {
    ...s, id: componentId(s.name), ingredients,
    nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat },
    nutrientComplete: n.complete, steps: componentSteps(s), imageUrl: null,
  };
});

const CUISINE_NORMALISE: Record<string, string> = { India: 'Indian', Indian: 'Indian', Global: 'Global' };
function normCuisine(c: string): string { return CUISINE_NORMALISE[c] ?? c; }

/** Per-role potassium/phosphorus ceilings (mg/serving) for renal plates. */
const RENAL_K_CEIL: Record<string, number> = { main: 240, dal: 0, vegetable: 230, carb: 180, salad: 180, snack: 240, breakfast: 340, soup: 200, dessert: 240, drink: 240, side: 200, dairy: 0 };
const RENAL_P_CEIL: Record<string, number> = { main: 220, dal: 0, vegetable: 90, carb: 300, salad: 90, snack: 260, breakfast: 260, soup: 120, dessert: 120, drink: 260, side: 220, dairy: 0 };

const dietRank: Record<Diet, Diet[]> = {
  vegan: ['vegan'],
  vegetarian: ['vegan', 'vegetarian'],
  eggetarian: ['vegan', 'vegetarian', 'eggetarian'],
  nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'],
};

function dietOk(recipeDiet: Diet, userDiet: Diet): boolean {
  return dietRank[userDiet].includes(recipeDiet);
}

/** Simple seeded PRNG so week generation is deterministic (no Math.random). */
function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ─────────────────────────── Selection ─────────────────────────── */

interface SelectCtx {
  slot: SlotCode; prefs: ComposerPrefs; rnd: () => number;
  used: Map<string, number>;      // recipeId → times used this week (variety)
  pool: PoolRecipe[];             // combined recipe pool (seeds + dataset mains)
  banMain?: string;               // recipeId of yesterday's main — never repeat consecutively
}

function cuisineBucket(slot: SlotCode) { return SLOT_BY_CODE[slot].cuisineBucket; }

/** Candidate recipes for a role in a slot, filtered by diet/cuisine/excluded/category. */
function candidates(role: string, ctx: SelectCtx): PoolRecipe[] {
  const { slot, prefs } = ctx;
  const bucket = cuisineBucket(slot);
  const mix = prefs.cuisineBySlot?.[bucket];
  const locked = prefs.cuisineLocks?.[bucket];
  const allowedCuisines = mix ? Object.keys(mix).filter((k) => (mix[k] ?? 0) > 0).map(normCuisine) : null;
  const slotCats = SLOT_BY_CODE[slot].categories;
  const userDiet = prefs.diet ?? 'vegetarian';
  const excluded = (prefs.excluded ?? []).map((e) => e.toLowerCase());

  // Renal ceilings: only genuinely low-potassium/phosphorus food may enter a
  // renal plate, per role (the last lever to meet the strict K/P cap).
  const renal = Boolean(prefs.caps?.potassiumMg && prefs.caps.potassiumMg <= 3000);
  const kCeil = renal ? (RENAL_K_CEIL[role] ?? 250) : Infinity;
  const pCeil = renal ? (RENAL_P_CEIL[role] ?? 250) : Infinity;

  return ctx.pool.filter((r) => {
    if (r.role !== role) return false;
    if (role === 'main' && ctx.banMain && r.id === ctx.banMain) return false;  // no consecutive-day main
    if (!r.categories.some((c) => slotCats.includes(c))) return false;
    if (!dietOk(r.diet, userDiet)) return false;
    // Clinical profiles: only build from food whose capped nutrients are known.
    if (prefs.clinical && !r.nutrientComplete) return false;
    if (renal && (r.nutrients.potassiumMg > kCeil || r.nutrients.phosphorusMg > pCeil)) return false;
    const cu = normCuisine(r.cuisine);
    if (allowedCuisines && allowedCuisines.length && cu !== 'Global' && !allowedCuisines.includes(cu)) {
      // out-of-cuisine: allowed only if bucket not locked
      if (locked) return false;
    }
    const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
    if (excluded.some((e) => e && hay.includes(e))) return false;
    return true;
  });
}

/** Pick one recipe for a role, favouring cuisine weight + variety (least-used first). */
function pick(role: string, ctx: SelectCtx): PoolRecipe | null {
  let cands = candidates(role, ctx);
  if (!cands.length) return null;
  // Bound work for large dataset roles (e.g. thousands of mains): rotate by a
  // random offset each call and consider a window — keeps variety, caps cost.
  if (cands.length > 140) {
    const start = Math.floor(ctx.rnd() * cands.length);
    cands = [...cands.slice(start), ...cands.slice(0, start)].slice(0, 140);
  }
  const bucket = cuisineBucket(ctx.slot);
  const mix = ctx.prefs.cuisineBySlot?.[bucket];
  const caps = ctx.prefs.caps;
  const scored = cands.map((r) => {
    const cu = normCuisine(r.cuisine);
    const w = mix ? (mix[cu] ?? mix[r.cuisine] ?? (cu === 'Global' ? 5 : 1)) : 1;
    const usedPenalty = (ctx.used.get(r.id) ?? 0) * 100;   // strongly prefer unused (variety)
    const jitter = ctx.rnd() * 5;
    // Clinical: prefer low capped-nutrient load (fraction of the daily cap it uses).
    let capPenalty = 0;
    if (caps) {
      const n = r.nutrients;
      if (caps.sodiumMg) capPenalty += n.sodiumMg / caps.sodiumMg;
      if (caps.potassiumMg) capPenalty += (n.potassiumMg / caps.potassiumMg) * 1.4; // renal K weighted
      if (caps.phosphorusMg) capPenalty += (n.phosphorusMg / caps.phosphorusMg) * 1.4;
      if (caps.sugarG) capPenalty += n.addedSugarG / caps.sugarG;
      if (caps.satFatG) capPenalty += n.satFatG / caps.satFatG;
    }
    return { r, score: w + jitter - usedPenalty - capPenalty * 30 };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].r;
}

function scaleComponent(r: PoolRecipe, portionPct: number, role: string): MealComponentOut {
  const f = portionPct / 100;
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    recipeId: r.id, name: r.name, role: role, category: (r.categories[0] ?? 'side'),
    portionPct, grams: Math.round(r.grams * f),
    kcal: Math.round(r.kcal * f), protein: round(r.protein * f), carbs: round(r.carbs * f),
    fat: round(r.fat * f), fiber: round(r.fiber * f),
    sodiumMg: Math.round(r.nutrients.sodiumMg * f), potassiumMg: Math.round(r.nutrients.potassiumMg * f),
    phosphorusMg: Math.round(r.nutrients.phosphorusMg * f), sugarG: round(r.nutrients.sugarG * f), addedSugarG: round(r.nutrients.addedSugarG * f), satFatG: round(r.nutrients.satFatG * f),
    nutrientComplete: r.nutrientComplete, steps: r.steps, imageUrl: r.imageUrl ?? null, minutes: r.minutes,
    ingredients: r.ingredients.map((i) => ({ name: i.name, grams: Math.round(i.grams * f), pantry: isPantryStaple(i.name) })),
  };
}

const sumTotals = (cs: MealComponentOut[]): MealTotals => cs.reduce(
  (t, c) => ({
    kcal: t.kcal + c.kcal, protein: t.protein + c.protein, carbs: t.carbs + c.carbs, fat: t.fat + c.fat, fiber: t.fiber + c.fiber,
    sodiumMg: t.sodiumMg + c.sodiumMg, potassiumMg: t.potassiumMg + c.potassiumMg, phosphorusMg: t.phosphorusMg + c.phosphorusMg,
    sugarG: Math.round((t.sugarG + c.sugarG) * 10) / 10, addedSugarG: Math.round((t.addedSugarG + c.addedSugarG) * 10) / 10, satFatG: Math.round((t.satFatG + c.satFatG) * 10) / 10,
  }),
  { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, ...ZERO_NUTR },
);

/* ─────────────────────────── Meal naming (Rule 16) ─────────────────────────── */

function mealTitle(slot: SlotCode, comps: MealComponentOut[], prefs: ComposerPrefs): string {
  const clin = prefs.clinicalTag ? `${prefs.clinicalTag} ` : '';
  const dietWord = prefs.diet === 'vegan' ? 'Vegan' : prefs.diet === 'nonveg' ? '' : 'Veg';
  if (slot === 'b') return `${clin}${dietWord ? dietWord + ' ' : ''}Breakfast`.trim();
  if (slot === 'ms') return `${clin}Morning Snack`.trim();
  if (slot === 'es') return `${clin}Evening Snack`.trim();
  const main = comps.find((c) => c.role === 'main') ?? comps.find((c) => c.role === 'dal');
  const base = slot === 'l' ? 'Thali' : 'Dinner Plate';
  const lead = main ? main.name.split('(')[0].trim() : (dietWord || 'Balanced');
  return `${clin}${lead} ${base}`.replace(/\s+/g, ' ').trim();
}

/* ─────────────────────────── Compose one meal ─────────────────────────── */

interface Sel { r: PoolRecipe; role: string }

/** Per-role portion bounds (% of a standard serving). Removes the fixed-100%
 *  caloric floor so lower prescriptions can actually be met (fixes CRIT-2). */
const ROLE_BOUNDS: Record<string, [number, number]> = {
  main: [50, 150], dal: [45, 150], carb: [35, 180], vegetable: [55, 135], salad: [50, 130],
  dairy: [50, 130], soup: [50, 140], snack: [40, 170], breakfast: [55, 165], drink: [45, 160],
  dessert: [40, 120], side: [45, 150], condiment: [50, 120],
};

/**
 * Day-level portion solver at the meal grain (Workstream B). First scales every
 * flexible component jointly toward the meal's kcal target within per-role
 * bounds (removes the fixed-serving floor), then trades calories from
 * low-protein-density roles to high-protein-density roles at ~constant kcal to
 * hit the protein target too — so both kcal and protein track the prescription.
 */
function fitMeal(sel: Sel[], targetKcal: number, proteinTarget: number): MealComponentOut[] {
  if (!sel.length) return [];
  const bounds = (role: string): [number, number] => ROLE_BOUNDS[role] ?? [50, 150];
  const lo = (s: Sel) => bounds(s.role)[0];
  const hi = (s: Sel) => bounds(s.role)[1];

  const base = sel.reduce((t, s) => t + s.r.kcal, 0) || 1;
  const scale = sel.map((s) => Math.max(lo(s), Math.min(hi(s), (targetKcal / base) * 100)));

  // 1) Fit calories: push the residual onto components with headroom.
  for (let it = 0; it < 8; it++) {
    const total = sel.reduce((t, s, i) => t + s.r.kcal * scale[i] / 100, 0);
    const residual = targetKcal - total;
    if (Math.abs(residual) / Math.max(1, targetKcal) < 0.02) break;
    const dir = residual > 0 ? 1 : -1;
    const movable = sel.map((s, i) => ({ i, room: dir > 0 ? hi(s) - scale[i] : scale[i] - lo(s), k: s.r.kcal }))
      .filter((m) => m.room > 0.5 && m.k > 0);
    const kcalRoom = movable.reduce((t, m) => t + m.k * m.room / 100, 0);
    if (kcalRoom < 1) break;
    const apply = Math.min(Math.abs(residual), kcalRoom) * dir;
    for (const m of movable) {
      const share = (m.k / 100) / kcalRoom * apply;
      scale[m.i] = Math.max(lo(sel[m.i]), Math.min(hi(sel[m.i]), scale[m.i] + (share / m.k) * 100));
    }
  }

  // 2) Trade toward the protein target at ~constant calories: shift kcal from the
  // lowest protein-density component to the highest, keeping total kcal steady.
  const pDens = (s: Sel) => s.r.protein / Math.max(1, s.r.kcal);
  for (let it = 0; it < 8; it++) {
    const protein = sel.reduce((t, s, i) => t + s.r.protein * scale[i] / 100, 0);
    if (protein >= proteinTarget * 0.98) break;
    let hiC = -1, loC = -1, hiD = -1, loD = Infinity;
    sel.forEach((s, i) => {
      const d = pDens(s);
      if (hi(s) - scale[i] > 0.5 && d > hiD) { hiD = d; hiC = i; }
      if (scale[i] - lo(s) > 0.5 && d < loD) { loD = d; loC = i; }
    });
    if (hiC < 0 || loC < 0 || hiC === loC || pDens(sel[hiC]) <= pDens(sel[loC])) break;
    const moveKcal = Math.min(
      (hi(sel[hiC]) - scale[hiC]) / 100 * sel[hiC].r.kcal,
      (scale[loC] - lo(sel[loC])) / 100 * sel[loC].r.kcal,
      50,
    );
    if (moveKcal < 5) break;
    scale[hiC] += (moveKcal / sel[hiC].r.kcal) * 100;
    scale[loC] -= (moveKcal / sel[loC].r.kcal) * 100;
  }

  return sel.map((s, i) => scaleComponent(s.r, Math.round(scale[i]), s.role));
}

function composeMeal(slot: SlotCode, targetKcal: number, proteinTarget: number, energyPct: number, scheduledTime: string, ctx: SelectCtx): ComposedMeal {
  const def = SLOT_BY_CODE[slot];
  const sel: Sel[] = [];
  const take = (r: PoolRecipe | null, role: string) => { if (r) { ctx.used.set(r.id, (ctx.used.get(r.id) ?? 0) + 1); sel.push({ r, role }); } };

  if (slot === 'b') {
    const bf = pick('breakfast', ctx);
    take(bf, 'breakfast');
    // If breakfast alone can't reach ~85% of target even at max scale, add a light side.
    if (bf && bf.kcal * 1.6 < targetKcal * 0.85) take(pick('snack', ctx), 'side');
  } else if (slot === 'ms' || slot === 'es') {
    take(pick('snack', ctx) ?? pick('drink', ctx), 'snack');
  } else {
    // Lunch / dinner composite plate (Rules 6, 7).
    // Renal (potassium-capped): dal is very high-K/P — drop it, prefer a low-K
    // rice carb and low-K vegetables, and lean on egg/paneer protein instead.
    const renal = Boolean(ctx.prefs.caps?.potassiumMg && ctx.prefs.caps.potassiumMg <= 3000);
    // Protein-role guarantee (HIGH-1): a plate must never render without a main.
    // Try main (respecting the consecutive-day ban), then relax the ban, then
    // fall back to a dal — so aggressive excludes/small pools can't empty it.
    let main = pick('main', ctx) ?? pick('main', { ...ctx, banMain: undefined });
    if (!main) main = pick('dal', ctx);
    take(main, main?.role === 'dal' ? 'dal' : 'main');
    if (!renal && main?.role !== 'dal') take(pick('dal', ctx), 'dal');
    take(pick('vegetable', ctx), 'vegetable');
    const carbCands = candidates('carb', ctx);
    const wantRice = (slot === 'l' && !ctx.prefs.avoidRice) || renal;   // rice is low-K
    const carb = carbCands.length
      ? (wantRice ? (carbCands.find((c) => /rice|millet/i.test(c.name)) ?? carbCands[0])
                  : (carbCands.find((c) => /roti|phulka/i.test(c.name)) ?? carbCands[0]))
      : null;
    take(carb, 'carb');
    take(pick('salad', ctx), 'salad');
    if (ctx.prefs.diet !== 'vegan' && !renal) take(pick('dairy', ctx), 'dairy');  // curd is moderate-K — skip for renal
    if (slot === 'd' && !renal) take(pick('soup', ctx), 'soup');
    // Last-resort protein guarantee: relax excludes rather than serve a plate
    // with no main (a visible "adjusted for your restrictions" note can follow).
    if (!sel.some((s) => s.role === 'main' || s.role === 'dal')) {
      const diet = ctx.prefs.diet ?? 'vegetarian';
      const anyProt = ctx.pool.find((r) => (r.role === 'main' || r.role === 'dal') && dietOk(r.diet, diet) && r.categories.some((c) => c === 'lunch' || c === 'dinner'));
      take(anyProt ?? null, 'main');
    }
  }

  // Guarantee at least one component (never an empty meal — Rule 1).
  if (!sel.length) {
    const any = ctx.pool.find((r) => r.categories.some((c) => def.categories.includes(c)) && dietOk(r.diet, ctx.prefs.diet ?? 'vegetarian'));
    take(any ?? null, 'main');
  }

  const components = fitMeal(sel, targetKcal, proteinTarget);
  const totals = sumTotals(components);
  return {
    slot, key: def.key, label: def.label, title: mealTitle(slot, components, ctx.prefs),
    scheduledTime, energyPct, targetKcal,
    totals, minutes: components.reduce((m, c) => Math.max(m, c.minutes), 0),
    components,
  };
}

/* ─────────────────────────── Compose a week ─────────────────────────── */

export function composeWeek(targets: DayTargets, prefs: ComposerPrefs, days = 7, seed = 7, extraPool: PoolRecipe[] = []): ComposedWeek {
  const schedule: DaySchedule = resolveSchedule(prefs.fasting);
  const rnd = mulberry(seed);
  const used = new Map<string, number>();          // week-wide variety ledger
  const bfCount = new Map<string, number>();       // breakfast repeat cap (Rule 14)
  let lastLunchMain = ''; let lastDinnerMain = '';
  // Dataset mains + curated components. Seeds win on id collisions.
  const pool: PoolRecipe[] = [...SEED_POOL, ...extraPool.filter((r) => !SEED_POOL.some((s) => s.id === r.id))];

  const outDays: ComposedDay[] = [];
  for (let d = 0; d < days; d++) {
    const meals: ComposedMeal[] = [];
    for (const sm of schedule.meals) {
      const banMain = sm.code === 'l' ? lastLunchMain : sm.code === 'd' ? lastDinnerMain : undefined;
      const ctx: SelectCtx = { slot: sm.code, prefs, rnd, used, pool, banMain: banMain || undefined };
      const mealKcal = targets.kcal * sm.energy; const mealProtein = targets.protein * sm.energy;
      let meal = composeMeal(sm.code, mealKcal, mealProtein, sm.energy, sm.scheduledTime, ctx);

      // Variety hard rules (Rule 14): breakfast ≤2×/wk; no consecutive lunch/dinner main.
      if (sm.code === 'b') {
        let tries = 0;
        while ((bfCount.get(meal.title + meal.components[0]?.recipeId) ?? 0) >= 2 && tries < 4) {
          meal = composeMeal(sm.code, mealKcal, mealProtein, sm.energy, sm.scheduledTime, ctx); tries++;
        }
        const k = meal.components[0]?.recipeId ?? meal.title;
        bfCount.set(k, (bfCount.get(k) ?? 0) + 1);
      }
      if (sm.code === 'l' || sm.code === 'd') {
        const mainId = meal.components.find((c) => c.role === 'main')?.recipeId ?? '';
        const last = sm.code === 'l' ? lastLunchMain : lastDinnerMain;
        let tries = 0;
        while (mainId && mainId === last && tries < 4) {
          meal = composeMeal(sm.code, mealKcal, mealProtein, sm.energy, sm.scheduledTime, ctx); tries++;
        }
        const newMain = meal.components.find((c) => c.role === 'main')?.recipeId ?? '';
        if (sm.code === 'l') lastLunchMain = newMain; else lastDinnerMain = newMain;
      }
      meals.push(meal);
    }
    if (prefs.caps) reduceToCaps(meals, prefs.caps);   // bounded reduce for renal/HTN/DM caps
    const totals = sumTotals(meals.flatMap((m) => m.components));
    outDays.push({
      dayIndex: d, fasting: schedule.fasting, protocol: schedule.protocol, window: schedule.window,
      meals, totals, capBreaches: capBreaches(totals, prefs.caps),
    });
  }

  const grocery = composeGrocery(outDays, { includePantry: prefs.includePantry ?? false });
  const validation = validateWeek(outDays, grocery, targets, prefs.caps);
  return { days: outDays, grocery, targets, caps: prefs.caps, fasting: schedule.fasting, protocol: schedule.protocol, validation };
}

/**
 * Bounded reduce pass: if a day breaches a clinical cap, scale down the biggest
 * contributors of the breached nutrient (respecting per-role minimums) until the
 * cap is met or minimums are reached. Renal caps (K/P/Na) take priority; a small
 * calorie give-back is acceptable to keep a renal plan safe.
 */
function reduceToCaps(meals: ComposedMeal[], caps: ClinicalCaps): void {
  const NUTR: Array<[keyof ClinicalCaps, keyof Nutrients]> = [
    ['potassiumMg', 'potassiumMg'], ['phosphorusMg', 'phosphorusMg'], ['sodiumMg', 'sodiumMg'], ['sugarG', 'addedSugarG'], ['satFatG', 'satFatG'],
  ];
  const allComps = () => meals.flatMap((m) => m.components);
  for (const [capKey, nKey] of NUTR) {
    const cap = caps[capKey];
    if (!cap) continue;
    for (let it = 0; it < 12; it++) {
      const total = allComps().reduce((t, c) => t + (c[nKey] as number), 0);
      if (total <= cap) break;
      // biggest contributor with room to shrink
      let worst: MealComponentOut | null = null;
      for (const c of allComps()) {
        const min = (ROLE_BOUNDS[c.role]?.[0] ?? 50);
        if (c.portionPct > min + 2 && (worst === null || (c[nKey] as number) > (worst[nKey] as number))) worst = c;
      }
      if (!worst) break;
      const min = (ROLE_BOUNDS[worst.role]?.[0] ?? 50);
      const nextPct = Math.max(min, worst.portionPct - 15);
      rescale(worst, nextPct);
    }
  }
  for (const m of meals) m.totals = sumTotals(m.components);
}

/** Rescale an already-emitted component in place to a new portion %. */
function rescale(c: MealComponentOut, pct: number): void {
  const f = pct / Math.max(1, c.portionPct);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  c.grams = Math.round(c.grams * f); c.kcal = Math.round(c.kcal * f);
  c.protein = r1(c.protein * f); c.carbs = r1(c.carbs * f); c.fat = r1(c.fat * f); c.fiber = r1(c.fiber * f);
  c.sodiumMg = Math.round(c.sodiumMg * f); c.potassiumMg = Math.round(c.potassiumMg * f); c.phosphorusMg = Math.round(c.phosphorusMg * f);
  c.sugarG = r1(c.sugarG * f); c.satFatG = r1(c.satFatG * f);
  c.ingredients = c.ingredients.map((i) => ({ ...i, grams: Math.round(i.grams * f) }));
  c.portionPct = pct;
}

/** Clone + scale a component's portion by a factor (family portion scaling). */
function rescaleComponent(c: MealComponentOut, factor: number): MealComponentOut {
  const nextPct = Math.max(30, Math.min(260, Math.round(c.portionPct * factor)));
  const f = nextPct / Math.max(1, c.portionPct);
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return {
    ...c, portionPct: nextPct, grams: Math.round(c.grams * f), kcal: Math.round(c.kcal * f),
    protein: r1(c.protein * f), carbs: r1(c.carbs * f), fat: r1(c.fat * f), fiber: r1(c.fiber * f),
    sodiumMg: Math.round(c.sodiumMg * f), potassiumMg: Math.round(c.potassiumMg * f), phosphorusMg: Math.round(c.phosphorusMg * f),
    sugarG: r1(c.sugarG * f), addedSugarG: r1(c.addedSugarG * f), satFatG: r1(c.satFatG * f),
    ingredients: c.ingredients.map((i) => ({ ...i, grams: Math.round(i.grams * f) })),
  };
}

/**
 * Family-derived plan (HIGH-3): scale every meal in the owner's composed week to
 * a member's portion `factor` (member kcal / owner kcal). Same dishes and times,
 * portions and grocery scaled — the member's read-only view of the household plan.
 */
export function scaleComposedWeek(week: ComposedWeek, factor: number): ComposedWeek {
  const days = week.days.map((d) => {
    const meals = d.meals.map((m) => {
      const components = m.components.map((c) => rescaleComponent(c, factor));
      return { ...m, components, totals: sumTotals(components) };
    });
    const totals = sumTotals(meals.flatMap((m) => m.components));
    return { ...d, meals, totals, capBreaches: capBreaches(totals, week.caps) };
  });
  return { ...week, days, grocery: composeGrocery(days, { includePantry: false }) };
}

/* ─────────────────────────── Grocery (Rule 10) ─────────────────────────── */

export function composeGrocery(days: ComposedDay[], opts: { includePantry: boolean }): GroceryItem[] {
  const merged = new Map<string, GroceryItem>();
  for (const day of days) {
    for (const meal of day.meals) {
      for (const comp of meal.components) {
        for (const ing of comp.ingredients) {
          if (ing.pantry && !opts.includePantry) continue;   // pantry excluded by default
          const key = ing.name.trim().toLowerCase();
          const cur = merged.get(key);
          if (cur) {
            cur.grams += ing.grams;
            if (!cur.fromRecipes.includes(comp.recipeId)) cur.fromRecipes.push(comp.recipeId);
          } else {
            merged.set(key, { name: ing.name, grams: ing.grams, unit: 'g', pantry: ing.pantry, fromRecipes: [comp.recipeId] });
          }
        }
      }
    }
  }
  // Human units: >=1000g → kg
  return [...merged.values()].map((g) => g.grams >= 1000
    ? { ...g, grams: Math.round((g.grams / 1000) * 10) / 10, unit: 'kg' }
    : { ...g, grams: Math.round(g.grams) });
}

/* ─────────────────────────── Validation (Rule 18 + Rule 10 integrity) ─────────────────────────── */

export function validateWeek(days: ComposedDay[], grocery: GroceryItem[], targets: DayTargets, caps?: ClinicalCaps): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const recipeIds = new Set(days.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => c.recipeId))));

  for (const day of days) {
    // every scheduled slot present
    for (const m of day.meals) {
      if (!m.components.length) issues.push(`Day ${day.dayIndex + 1} ${m.label}: empty meal`);
      // breakfast must not contain lunch/dinner recipes
      if (m.slot === 'b' && m.components.some((c) => c.category === 'lunch' || c.category === 'dinner')) {
        issues.push(`Day ${day.dayIndex + 1}: breakfast contains a lunch/dinner recipe`);
      }
      // meal title must not be a bare recipe name (Rule 16)
      if (m.components.length && m.components.some((c) => c.name === m.title)) {
        issues.push(`Day ${day.dayIndex + 1} ${m.label}: title equals a recipe name`);
      }
    }
    // lunch/dinner plate structure (Rules 6/7)
    for (const code of ['l', 'd'] as SlotCode[]) {
      const meal = day.meals.find((m) => m.slot === code);
      if (meal) {
        const roles = new Set(meal.components.map((c) => c.role));
        if (!roles.has('main') && !roles.has('dal')) issues.push(`Day ${day.dayIndex + 1} ${meal.label}: missing a main/protein`);
        if (!roles.has('carb')) issues.push(`Day ${day.dayIndex + 1} ${meal.label}: missing a staple`);
      }
    }
  }
  // Grocery integrity (Rule 10): every grocery item traces to a plan recipe.
  for (const g of grocery) {
    if (!g.fromRecipes.some((id) => recipeIds.has(id))) issues.push(`Grocery "${g.name}" not traceable to any plan recipe`);
  }
  // Clinical caps enforced on the plate (Workstream A).
  if (caps) for (const day of days) {
    for (const b of capBreaches(day.totals, caps)) issues.push(`Day ${day.dayIndex + 1} clinical cap: ${b}`);
  }
  return { ok: issues.length === 0, issues };
}
