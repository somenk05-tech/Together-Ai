import {
  SLOTS, SLOT_BY_CODE, type SlotCode, type MealCategory,
  resolveSchedule, type FastingPrefs, type DaySchedule,
} from './meal-engine';
import { COMPONENT_SEEDS, componentId, isPantryStaple, type ComponentSeed } from './component-recipes';

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
}

export interface DayTargets { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export interface MealIngredient { name: string; grams: number; pantry: boolean }
export interface MealComponentOut {
  recipeId: string; name: string; role: string; category: MealCategory;
  portionPct: number; grams: number;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minutes: number; ingredients: MealIngredient[];
}
export interface ComposedMeal {
  slot: SlotCode; key: string; label: string;
  title: string;                       // composite meal name (Rule 16)
  scheduledTime: string;               // core property (IF Rule 7)
  energyPct: number; targetKcal: number;
  totals: DayTargets; minutes: number;
  components: MealComponentOut[];
}
export interface ComposedDay {
  dayIndex: number;
  fasting: boolean; protocol: string | null; window: { start: string; end: string };
  meals: ComposedMeal[]; totals: DayTargets;
}
export interface GroceryItem { name: string; grams: number; unit: string; pantry: boolean; fromRecipes: string[] }
export interface ComposedWeek {
  days: ComposedDay[];
  grocery: GroceryItem[];
  targets: DayTargets;
  fasting: boolean; protocol: string | null;
  validation: { ok: boolean; issues: string[] };
}

/* ─────────────────────────── Recipe pool ─────────────────────────── */

interface PoolRecipe extends Omit<ComponentSeed, 'ing'> {
  id: string;
  ingredients: Array<{ name: string; grams: number }>;
}

const POOL: PoolRecipe[] = COMPONENT_SEEDS.map((s) => ({
  ...s, id: componentId(s.name),
  ingredients: s.ing.map(([name, grams]) => ({ name, grams })),
}));

const CUISINE_NORMALISE: Record<string, string> = { India: 'Indian', Indian: 'Indian', Global: 'Global' };
function normCuisine(c: string): string { return CUISINE_NORMALISE[c] ?? c; }

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
  banRole?: string;               // avoid a role
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

  return POOL.filter((r) => {
    if (r.role !== role) return false;
    if (!r.categories.some((c) => slotCats.includes(c))) return false;
    if (!dietOk(r.diet, userDiet)) return false;
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
  const cands = candidates(role, ctx);
  if (!cands.length) return null;
  const bucket = cuisineBucket(ctx.slot);
  const mix = ctx.prefs.cuisineBySlot?.[bucket];
  const scored = cands.map((r) => {
    const cu = normCuisine(r.cuisine);
    const w = mix ? (mix[cu] ?? mix[r.cuisine] ?? (cu === 'Global' ? 5 : 1)) : 1;
    const usedPenalty = (ctx.used.get(r.id) ?? 0) * 100;   // strongly prefer unused (variety)
    const jitter = ctx.rnd() * 5;
    return { r, score: w + jitter - usedPenalty };
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
    fat: round(r.fat * f), fiber: round(r.fiber * f), minutes: r.minutes,
    ingredients: r.ingredients.map((i) => ({ name: i.name, grams: Math.round(i.grams * f), pantry: isPantryStaple(i.name) })),
  };
}

const sumTotals = (cs: MealComponentOut[]): DayTargets => cs.reduce(
  (t, c) => ({ kcal: t.kcal + c.kcal, protein: t.protein + c.protein, carbs: t.carbs + c.carbs, fat: t.fat + c.fat, fiber: t.fiber + c.fiber }),
  { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
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

function composeMeal(slot: SlotCode, targetKcal: number, energyPct: number, scheduledTime: string, ctx: SelectCtx): ComposedMeal {
  const def = SLOT_BY_CODE[slot];
  let components: MealComponentOut[] = [];

  const use = (r: PoolRecipe | null, role: string, pct = 100) => {
    if (!r) return;
    ctx.used.set(r.id, (ctx.used.get(r.id) ?? 0) + 1);
    components.push(scaleComponent(r, pct, role));
  };

  if (slot === 'b') {
    const bf = pick('breakfast', ctx);
    // scale breakfast toward target, clamp 60–160%
    const basePct = bf ? Math.max(60, Math.min(160, Math.round((targetKcal / Math.max(1, bf.kcal)) * 100))) : 100;
    use(bf, 'breakfast', basePct);
    if (sumTotals(components).kcal < targetKcal * 0.85) use(pick('snack', { ...ctx, slot }), 'side', 60);
  } else if (slot === 'ms' || slot === 'es') {
    const sn = pick('snack', ctx) ?? pick('drink', ctx);
    const basePct = sn ? Math.max(60, Math.min(180, Math.round((targetKcal / Math.max(1, sn.kcal)) * 100))) : 100;
    use(sn, 'snack', basePct);
  } else {
    // Lunch / dinner composite plate (Rules 6, 7)
    use(pick('main', ctx), 'main');
    use(pick('dal', ctx), 'dal');
    use(pick('vegetable', ctx), 'vegetable');
    // carb: lunch rice-centric; dinner roti (avoid rice unless requested)
    const carbCands = candidates('carb', ctx);
    const wantRice = slot === 'l' && !ctx.prefs.avoidRice;
    const carb = carbCands.length
      ? (wantRice ? (carbCands.find((c) => /rice|millet/i.test(c.name)) ?? carbCands[0])
                  : (carbCands.find((c) => /roti|phulka/i.test(c.name)) ?? carbCands[0]))
      : null;
    // size carb to fill the gap to target
    if (carb) {
      const soFar = sumTotals(components).kcal;
      const gap = Math.max(0, targetKcal - soFar - 60 /* salad+curd */);
      const pct = Math.max(50, Math.min(250, Math.round((gap / Math.max(1, carb.kcal)) * 100)));
      use(carb, 'carb', pct);
    }
    use(pick('salad', ctx), 'salad');
    if (ctx.prefs.diet !== 'vegan') use(pick('dairy', ctx), 'dairy');
    if (slot === 'd') { const soup = pick('soup', ctx); if (soup && sumTotals(components).kcal < targetKcal * 0.8) use(soup, 'soup', 80); }
  }

  // Guarantee at least one component (never an empty meal — Rule 1).
  if (!components.length) {
    const any = POOL.find((r) => r.categories.some((c) => def.categories.includes(c)) && dietOk(r.diet, ctx.prefs.diet ?? 'vegetarian'));
    if (any) use(any, 'main', 100);
  }

  const totals = sumTotals(components);
  return {
    slot, key: def.key, label: def.label, title: mealTitle(slot, components, ctx.prefs),
    scheduledTime, energyPct, targetKcal,
    totals, minutes: components.reduce((m, c) => Math.max(m, c.minutes), 0),
    components,
  };
}

/* ─────────────────────────── Compose a week ─────────────────────────── */

export function composeWeek(targets: DayTargets, prefs: ComposerPrefs, days = 7, seed = 7): ComposedWeek {
  const schedule: DaySchedule = resolveSchedule(prefs.fasting);
  const rnd = mulberry(seed);
  const used = new Map<string, number>();          // week-wide variety ledger
  const bfCount = new Map<string, number>();       // breakfast repeat cap (Rule 14)
  let lastLunchMain = ''; let lastDinnerMain = '';

  const outDays: ComposedDay[] = [];
  for (let d = 0; d < days; d++) {
    const meals: ComposedMeal[] = [];
    for (const sm of schedule.meals) {
      const ctx: SelectCtx = { slot: sm.code, prefs, rnd, used };
      let meal = composeMeal(sm.code, targets.kcal * sm.energy, sm.energy, sm.scheduledTime, ctx);

      // Variety hard rules (Rule 14): breakfast ≤2×/wk; no consecutive lunch/dinner main.
      if (sm.code === 'b') {
        let tries = 0;
        while ((bfCount.get(meal.title + meal.components[0]?.recipeId) ?? 0) >= 2 && tries < 4) {
          meal = composeMeal(sm.code, targets.kcal * sm.energy, sm.energy, sm.scheduledTime, ctx); tries++;
        }
        const k = meal.components[0]?.recipeId ?? meal.title;
        bfCount.set(k, (bfCount.get(k) ?? 0) + 1);
      }
      if (sm.code === 'l' || sm.code === 'd') {
        const mainId = meal.components.find((c) => c.role === 'main')?.recipeId ?? '';
        const last = sm.code === 'l' ? lastLunchMain : lastDinnerMain;
        let tries = 0;
        while (mainId && mainId === last && tries < 4) {
          meal = composeMeal(sm.code, targets.kcal * sm.energy, sm.energy, sm.scheduledTime, ctx); tries++;
        }
        const newMain = meal.components.find((c) => c.role === 'main')?.recipeId ?? '';
        if (sm.code === 'l') lastLunchMain = newMain; else lastDinnerMain = newMain;
      }
      meals.push(meal);
    }
    outDays.push({
      dayIndex: d, fasting: schedule.fasting, protocol: schedule.protocol, window: schedule.window,
      meals, totals: sumTotals(meals.flatMap((m) => m.components)),
    });
  }

  const grocery = composeGrocery(outDays, { includePantry: prefs.includePantry ?? false });
  const validation = validateWeek(outDays, grocery, targets);
  return { days: outDays, grocery, targets, fasting: schedule.fasting, protocol: schedule.protocol, validation };
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

export function validateWeek(days: ComposedDay[], grocery: GroceryItem[], targets: DayTargets): { ok: boolean; issues: string[] } {
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
  return { ok: issues.length === 0, issues };
}
