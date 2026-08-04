import {
  SLOT_BY_CODE, type SlotCode, type MealCategory,
  resolveSchedule, type FastingPrefs, type DaySchedule,
} from './meal-engine';
import { isAllergenSafe } from '../shared/allergens';
import { COMPONENT_SEEDS, componentId, componentSteps, isPantryStaple, type ComponentSeed } from './component-recipes';
import { screenRecipe } from './diet-tags';

/**
 * Is this dish allowed on this diet? Memoised on (dish id, diet).
 *
 * A plan re-screens the same pool thousands of times, and the verdict for one
 * dish under one diet is fixed. The cache is module-level and unbounded, which
 * is fine: the key space is the corpus times the seven diets, and the corpus is
 * loaded once per process.
 */
const ALLOWED_CACHE = new Map<string, boolean>();
function dishAllowed(r: PoolRecipe, diet: string): boolean {
  const key = `${r.id}|${diet}`;
  const hit = ALLOWED_CACHE.get(key);
  if (hit !== undefined) return hit;
  const ok = screenRecipe(diet, r.ingredients.map((i) => i.name)).ok;
  ALLOWED_CACHE.set(key, ok);
  return ok;
}
import { computeNutrients, isSalt } from './ingredient-nutrients';

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
  maxMinutes?: number;                 // cooking-time preference (soft): prefer quicker recipes
  favourites?: string[];              // favourite ingredients/foods to lean toward
  /** Per-day meal overrides (Refresh/Skip): keys "d{index}:{slotCode}". */
  skips?: string[];
  bumps?: Record<string, number>;
  /**
   * Dishes the citizen chose themselves: "d{index}:{slotCode}" → recipeId.
   *
   * A pin is honoured ONLY if the recipe is in the candidate list the composer
   * would have picked from anyway. That is the whole safety story and it is one
   * line, on purpose: a pin is stored in the profile and outlives the
   * preferences it was made under. Somebody pins a prawn curry in March and
   * declares a shellfish allergy in June — re-screening at selection is what
   * stops March's choice reappearing on June's plate. Checking against
   * candidates() rather than re-implementing the checks means the pin can never
   * drift out of step with the filters everything else obeys.
   */
  pins?: Record<string, string>;
}

/** "Inform, don't force" — how the user's preferred plan compares to the clinical ideal. */
export interface ComplianceConcern {
  key: string; label: string; message: string; direction: 'over' | 'under'; deltaPct: number; severity: 'info' | 'warn';
  /** How clinically serious this nutrient is for THIS profile — the same weight
   *  its penalty carries. Concerns are returned worst-first by it, because the
   *  UI shows concerns[0] and the first thing a citizen reads should be the
   *  thing most likely to hurt them. */
  weight: number;
}
export interface ComplianceReport {
  score: number;                       // 0–100 alignment with the ideal clinical plan
  concerns: ComplianceConcern[];
  swaps: string[];                     // gentle suggestions to raise the score
  summary: string;
}

export interface DayTargets { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export interface MealIngredient { name: string; grams: number; pantry: boolean; toTaste?: boolean }
export interface MealComponentOut extends Nutrients {
  recipeId: string; name: string; role: string; category: MealCategory;
  portionPct: number; grams: number;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  nutrientComplete: boolean;
  steps: string[]; imageUrl?: string | null;
  cuisine?: string;                   // normalised cuisine (for preference-match scoring + UI)
  diet?: Diet;                        // veg / non-veg / egg / vegan (for the veg mark)
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
  /** Clinical safety gate (QA C3 fix): true when, after regeneration attempts, a
   *  clinical plan still could not be made to meet its medical caps or a required
   *  meal could not be safely filled. The UI must warn instead of presenting it
   *  as a certified-safe plan. */
  blocked?: boolean;
  blockReason?: string[];
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

// Reconcile dataset `country` values (India, Italy, Thailand, Greece…) with the
// Food Preference Profile's cuisine labels (Indian, Italian, Thai, Mediterranean…)
// so cuisine preferences actually match dataset recipes.
const CUISINE_NORMALISE: Record<string, string> = {
  India: 'Indian', Indian: 'Indian',
  China: 'Chinese', Chinese: 'Chinese',
  Italy: 'Italian', Italian: 'Italian',
  Mexico: 'Mexican', Mexican: 'Mexican',
  Thailand: 'Thai', Thai: 'Thai',
  Japan: 'Japanese', Japanese: 'Japanese',
  Greece: 'Mediterranean', Greek: 'Mediterranean', Mediterranean: 'Mediterranean',
  Korea: 'Korean', Korean: 'Korean',
  USA: 'American', America: 'American', American: 'American',
  Continental: 'Continental', 'Middle Eastern': 'Middle Eastern', 'Middle East': 'Middle Eastern',
  Global: 'Global',
};
export function normCuisine(c: string): string { return CUISINE_NORMALISE[(c ?? '').trim()] ?? c; }

/**
 * Every spelling stored in the corpus that means this cuisine.
 *
 * The inverse of `normCuisine`, and the reason the Recipe Library could show
 * "Indian" and "India" as two cards: the facet grouped the raw column and the
 * filter compared against it, so folding the two names together in the display
 * without folding them in the QUERY would have given you one card that returned
 * half its recipes — a worse bug than the one being fixed.
 *
 * The canonical name is always included, even when it is not itself a key, so a
 * cuisine the map has never heard of ("France") still matches itself.
 */
export function cuisineAliases(canonical: string): string[] {
  const want = (canonical ?? '').trim();
  if (!want) return [];
  const raws = Object.keys(CUISINE_NORMALISE).filter((k) => CUISINE_NORMALISE[k] === want);
  return [...new Set([want, ...raws])];
}

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
  return (dietRank[userDiet] ?? dietRank.vegetarian).includes(recipeDiet);   // unknown diet → safe default, never crash
}

const MEAT_TOKENS = /chicken|mutton|fish|egg|prawn|shrimp|lamb|goat|beef|pork|keema|turkey|\bmeat\b|seafood|crab|salmon|tuna/i;
/** A meat-forward profile: nonveg diet whose chosen protein sources are ALL
 *  meat/egg. Their lunch/dinner plate should carry a second meat dish rather than
 *  the default lentil dal — so a hardcore non-veg user isn't served half lentils. */
function meatForwardPrefs(prefs: ComposerPrefs): boolean {
  const favs = (prefs.favourites ?? []).map((f) => f.trim()).filter(Boolean);
  return prefs.diet === 'nonveg' && favs.length > 0 && favs.every((f) => MEAT_TOKENS.test(f));
}

/**
 * Allergen and avoided-food matching now lives in allergens.ts, shared with the
 * weekly planner (BE-8.4).
 *
 * This file used to carry its own ALLERGEN_SYNONYMS table and expand a declared
 * term into a list of substrings. nutrition.service.ts carried a different
 * answer — no expansion at all — so the composed plan was safe and the weekly
 * and family plans were not. Two tables meant two behaviours; one table means
 * one, and the adversarial set in allergens.spec.ts is written against the food
 * rather than against either implementation.
 *
 * The old table also matched on substrings, which cost more than it looks:
 * "nut" caught coconut and nutmeg, "flour" caught besan and rice flour. A
 * coeliac citizen lost most of what they can eat and a nut-allergic one lost
 * every coconut dish in an Indian-first corpus.
 */

/** Canonical grocery key (QA M1): merges "Onion"/"Onions"/"chopped onion" etc. */
function canonicalKey(name: string): string {
  let n = name.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ');
  n = n.replace(/\b(chopped|sliced|diced|minced|grated|shredded|fresh|dried|raw|boiled|cooked|ground|powdered|large|small|medium|ripe|whole|halved|crushed|peeled)\b/g, ' ');
  n = n.replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.endsWith('es') && n.length > 4) n = n.slice(0, -2);
  else if (n.endsWith('s') && !n.endsWith('ss') && n.length > 3) n = n.slice(0, -1);
  return n || name.trim().toLowerCase();
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

/** Stable small hash of a role name — seeds a role's own reroll stream. */
function roleHash(role: string): number { let h = 0; for (const c of role) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }

/* ─────────────────────────── Selection ─────────────────────────── */

interface SelectCtx {
  slot: SlotCode; prefs: ComposerPrefs; rnd: () => number;
  used: Map<string, number>;      // recipeId → times used this week (variety)
  pool: PoolRecipe[];             // combined recipe pool (seeds + dataset mains)
  banMain?: string;               // recipeId of yesterday's main — never repeat consecutively
  dayIndex: number;               // for per-line (component) refresh/skip keys d{day}:{slot}:{role}
  seed: number;                   // this meal's base seed — lets one role reroll in isolation
}

function cuisineBucket(slot: SlotCode) { return SLOT_BY_CODE[slot].cuisineBucket; }

/** Candidate recipes for a role in a slot, filtered by diet/cuisine/excluded/category. */
function candidates(role: string, ctx: SelectCtx): PoolRecipe[] {
  const { slot, prefs } = ctx;
  const bucket = cuisineBucket(slot);
  const mix = prefs.cuisineBySlot?.[bucket];
  const locked = prefs.cuisineLocks?.[bucket];
  const allowedCuisines = mix ? Object.keys(mix).filter((k) => (mix[k] ?? 0) > 0).map(normCuisine) : null;
  /**
   * P0-A — A MIX IS A STATEMENT, NOT A LEAN.
   *
   * `cuisineLocks` is set only from the Meal-settings drawer. The Food
   * Preference Profile's cuisine mix wrote `cuisineBySlot` and nothing else, so
   * a citizen who set **Indian 100%** got Indian merely WEIGHTED — and pick()
   * gives a cuisine that is absent from the mix a default weight of 1, and
   * Global a weight of 5. A cuisine they had given zero was still five times
   * more likely than nothing. Live proof, 4 Aug: "38/59 mains in your cuisines
   * (64%)" on a 100%-Indian profile, with teriyaki, jerk seasoning, galangal,
   * Thai red curry paste and parmesan in the basket.
   *
   * Expressing a mix at all is the lock. If a citizen names cuisines and gives
   * one of them zero, zero is the answer — there is no other reading of the
   * control. A mix of Indian 60 / Italian 40 still admits both, because both
   * carry weight; it only ever removes what was set to nothing.
   *
   * This cannot strand a slot. When a bucket cannot be filled the composer
   * already retries with `cuisineLocks: undefined` (see the relax paths below),
   * so the strict pass is an attempt, not a cliff.
   */
  const mixIsAuthoritative = Boolean(allowedCuisines && allowedCuisines.length);
  const slotCats = SLOT_BY_CODE[slot].categories;
  const userDiet = prefs.diet ?? 'vegetarian';
  const excluded = prefs.excluded ?? [];

  /**
   * P0-B — TWO PROTEINS ARE NEVER ASSUMED.
   *
   * The chosen-protein list was a POSITIVE preference on two roles: prefer a
   * main or dal that matches it, and if none does, fall through to everything.
   * Nothing anywhere forbade a protein the citizen had not chosen, on any role.
   * Live proof, 4 Aug: a profile listing Chicken, Egg, Fish, Prawns, Mutton,
   * Paneer, Cheese, Curd, Milk — and a basket buying beef 128 g, pork 76 g and
   * bacon 104 g.
   *
   * "Everything" as a diet means no dietary restriction. It does not mean
   * consent to the two meats most often refused on religious grounds, and the
   * cost of getting this wrong is not a taste miss — it is a plate somebody
   * cannot eat, cooked, on a day they had locked.
   *
   * So these are opt-in: absent from the chosen list, they are excluded like an
   * allergen, on every role. Named explicitly and kept short on purpose — this
   * is a list of things that must be CHOSEN, not a guess at what a citizen
   * dislikes. Anything broader belongs in Foods to avoid, which they control.
   */
  const OPT_IN_PROTEINS: Record<string, readonly string[]> = {
    beef: ['beef', 'steak', 'veal', 'ox tail', 'oxtail', 'brisket', 'corned beef'],
    pork: ['pork', 'bacon', 'ham', 'gammon', 'lard', 'pancetta', 'prosciutto', 'chorizo', 'salami'],
  };
  const chosen = (prefs.favourites ?? []).map((f) => f.toLowerCase());
  const optInDenied = Object.entries(OPT_IN_PROTEINS)
    .filter(([key]) => !chosen.some((f) => f.includes(key)))
    .flatMap(([, terms]) => terms);

  // Renal ceilings: only genuinely low-potassium/phosphorus food may enter a
  // renal plate, per role (the last lever to meet the strict K/P cap).
  const renal = Boolean(prefs.caps?.potassiumMg && prefs.caps.potassiumMg <= 3000);
  const kCeil = renal ? (RENAL_K_CEIL[role] ?? 250) : Infinity;
  const pCeil = renal ? (RENAL_P_CEIL[role] ?? 250) : Infinity;

  // All safety/preference filters. `respectBan` is the ONLY relaxable one — it is
  // the consecutive-day main de-dupe, not a safety rule, so a narrow chosen-protein
  // pool may relax it (repeat the source) rather than switch to another protein.
  const passes = (r: PoolRecipe, respectBan: boolean): boolean => {
    if (r.role !== role) return false;
    if (respectBan && role === 'main' && ctx.banMain && r.id === ctx.banMain) return false;
    if (!r.categories.some((c) => slotCats.includes(c))) return false;
    if (!dietOk(r.diet, userDiet)) return false;
    // Belt as well as braces. dietOk reads the dish's LABEL; this reads the
    // dish. They agree across every shipped corpus — diet-integrity.spec.ts
    // holds them to it — so this costs nothing today and is what stands between
    // a citizen and a mislabelled row that arrives later.
    //
    // Cached per (dish, diet) because this is the composer's inner loop: the
    // same few thousand dishes are re-screened on every pick of every slot of
    // every day. The answer cannot change within a run.
    if (!dishAllowed(r, userDiet)) return false;
    // Clinical profiles: only build from food whose capped nutrients are known.
    if (prefs.clinical && !r.nutrientComplete) return false;
    if (renal && (r.nutrients.potassiumMg > kCeil || r.nutrients.phosphorusMg > pCeil)) return false;
    // Clinical per-serving ceilings (QA C3): no single dish may consume most of a
    // daily cap — cuts the worst sat-fat/sodium/added-sugar outliers at the source.
    if (prefs.clinical && prefs.caps) {
      const cc = prefs.caps;
      if (cc.satFatG && r.nutrients.satFatG > cc.satFatG * 0.6) return false;
      if (cc.sodiumMg && r.nutrients.sodiumMg > cc.sodiumMg * 0.6) return false;
      if (cc.sugarG && r.nutrients.addedSugarG > cc.sugarG * 0.7) return false;
    }
    const cu = normCuisine(r.cuisine);
    if (allowedCuisines && allowedCuisines.length && !allowedCuisines.includes(cu)) {
      // An explicit bucket LOCK (Meal settings) is strict about everything,
      // Global included — QA L3, unchanged.
      if (locked) return false;
      // A MIX is strict about competing cuisines only. `Global` is not a rival
      // cuisine, it is the absence of one: a fruit bowl, a handful of nuts, two
      // boiled eggs. Excluding those from an Indian profile would be reading
      // "Indian 100%" as "nothing that isn't a curry", and would strand whole
      // roles — every snack seed in the component library is Global. What the
      // mix must remove is Thailand, Italy and Jamaica, which is exactly what
      // the 4 Aug basket was full of.
      if (mixIsAuthoritative && cu !== 'Global') return false;
    }
    if (!isAllergenSafe(r.name, r.ingredients.map((i) => i.name), excluded)) return false;
    // Opt-in proteins, screened exactly like an exclusion: name and ingredients.
    if (optInDenied.length
      && !isAllergenSafe(r.name, r.ingredients.map((i) => i.name), optInDenied)) return false;
    return true;
  };

  const base = ctx.pool.filter((r) => passes(r, true));

  // Protein-source preference: the PROTEIN dish must come from a source the user
  // actually chose (their proteins/meats) whenever any qualify. Only the protein
  // roles are constrained — the rest of the plate stays flexible.
  if ((role === 'main' || role === 'dal') && prefs.favourites?.length) {
    const favs = prefs.favourites.map((f) => f.toLowerCase()).filter(Boolean);
    const matchesFav = (r: PoolRecipe) => {
      const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
      return favs.some((f) => hay.includes(f));
    };
    const fromChosen = base.filter(matchesFav);
    if (fromChosen.length) return fromChosen;
    // Narrow pool: every recipe of the chosen source was removed ONLY by the
    // consecutive-day ban. Repeating the user's protein beats silently switching
    // to a source they didn't pick — relax just the ban, keep every safety filter.
    if (role === 'main' && ctx.banMain) {
      const relaxedChosen = ctx.pool.filter((r) => passes(r, false) && matchesFav(r));
      if (relaxedChosen.length) return relaxedChosen;
    }
  }
  return base;
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
    // Preference-first nudges (soft): favour favourite ingredients + quicker recipes.
    let bonus = 0;
    if (ctx.prefs.favourites?.length) {
      const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
      if (ctx.prefs.favourites.some((f) => f && hay.includes(f.toLowerCase()))) bonus += 8;
    }
    // Prefer recipes that actually have a dish photo — a soft tiebreaker so the
    // plan users see is full of imaged meals (never overrides diet/cuisine/clinical).
    if (r.imageUrl) bonus += 7;
    const timePenalty = (ctx.prefs.maxMinutes && r.minutes > ctx.prefs.maxMinutes) ? (r.minutes - ctx.prefs.maxMinutes) * 0.3 : 0;
    return { r, score: w + jitter - usedPenalty - capPenalty * 30 + bonus - timePenalty };
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
    nutrientComplete: r.nutrientComplete, steps: r.steps, imageUrl: r.imageUrl ?? null, cuisine: normCuisine(r.cuisine), diet: r.diet, minutes: r.minutes,
    ingredients: r.ingredients.map((i) => isSalt(i.name)
      ? { name: 'Salt', grams: 0, pantry: true, toTaste: true }             // salt is always "to taste"
      : { name: i.name, grams: Math.round(i.grams * f), pantry: isPantryStaple(i.name) }),
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
  if (slot === 's') {
    const snack = comps[0];
    return `${clin}${snack ? snack.name.split('(')[0].trim() : 'Snack'}`.replace(/\s+/g, ' ').trim();
  }
  if (slot === 'es') {
    const soup = comps.find((c) => c.role === 'soup') ?? comps[0];
    return `${clin}${soup ? soup.name.split('(')[0].trim() : 'Evening Soup'}`.replace(/\s+/g, ' ').trim();
  }
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
  main: [40, 220], dal: [35, 220], carb: [30, 230], vegetable: [45, 165], salad: [40, 150],
  dairy: [40, 170], soup: [40, 165], snack: [30, 220], breakfast: [45, 220], drink: [35, 190],
  dessert: [30, 140], side: [35, 170], condiment: [45, 130],
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

/** Fresh-fruit names — the default afternoon snack (spec §3). */
const FRUIT_NAME = /\b(apple|banana|orange|papaya|water ?melon|musk ?melon|guava|\bpear\b|mango|grapes?|pomegranate|pineapple|kiwi|chikoo|sapota|litchi|lychee|peach|apricot|berries|strawberr|blueberr|\bfruit\b)\b/i;

/** Pick a fresh-fruit snack (least-used first for variety); null if none qualify. */
function pickFruit(ctx: SelectCtx): PoolRecipe | null {
  const cands = candidates('snack', ctx).filter((c) => FRUIT_NAME.test(c.name));
  if (!cands.length) return null;
  cands.sort((a, b) => (ctx.used.get(a.id) ?? 0) - (ctx.used.get(b.id) ?? 0));
  const minUse = ctx.used.get(cands[0].id) ?? 0;
  const top = cands.filter((c) => (ctx.used.get(c.id) ?? 0) === minUse);
  return top[Math.floor(ctx.rnd() * top.length)] ?? cands[0];
}

function composeMeal(slot: SlotCode, targetKcal: number, proteinTarget: number, fibreTarget: number, energyPct: number, scheduledTime: string, ctx: SelectCtx): ComposedMeal {
  const def = SLOT_BY_CODE[slot];
  const sel: Sel[] = [];
  const take = (r: PoolRecipe | null, role: string) => { if (r) { ctx.used.set(r.id, (ctx.used.get(r.id) ?? 0) + 1); sel.push({ r, role }); } };

  /**
   * The dish this citizen pinned to this slot, if it is still one they may eat.
   *
   * Resolved through candidates() rather than straight out of the pool, so a pin
   * clears exactly the filters every other selection clears — diet, exclusions,
   * clinical ceilings, cuisine locks. A pin that no longer qualifies is dropped
   * silently here and the slot composes normally; the citizen is told why on the
   * plan itself rather than by a dish quietly changing under them.
   */
  const pinnedFor = (role: string, roleCtx: SelectCtx): PoolRecipe | null => {
    const id = ctx.prefs.pins?.[`d${ctx.dayIndex}:${ctx.slot}`];
    if (!id) return null;
    return candidates(role, roleCtx).find((r) => r.id === id) ?? null;
  };

  if (slot === 'b') {
    const bf = pinnedFor('breakfast', ctx) ?? pick('breakfast', ctx);
    take(bf, 'breakfast');
    // If breakfast alone can't reach ~85% of target even at max scale, add a light side.
    if (bf && bf.kcal * 1.6 < targetKcal * 0.85) take(pick('snack', ctx), 'side');
  } else if (slot === 's') {
    // Afternoon snack — fresh fruit by default (spec §3), else a light snack/drink.
    take(pinnedFor('snack', ctx) ?? pickFruit(ctx) ?? pick('snack', ctx) ?? pick('drink', ctx), 'snack');
  } else if (slot === 'es') {
    // Dedicated ~7 PM evening course — a soup by default (spec §4), else a light drink.
    take(pick('soup', ctx) ?? pick('drink', ctx) ?? pick('snack', ctx), 'soup');
  } else {
    // Lunch / dinner composite plate (Rules 6, 7).
    // Renal (potassium-capped): dal is very high-K/P — drop it, prefer a low-K
    // rice carb and low-K vegetables, and lean on egg/paneer protein instead.
    const renal = Boolean(ctx.prefs.caps?.potassiumMg && ctx.prefs.caps.potassiumMg <= 3000);
    // Each plate role reads its OWN seeded stream (base seed ⊕ role ⊕ its per-line
    // refresh count) so a user can Refresh a single dish and only THAT role rerolls
    // like-for-like, leaving the rest of the plate untouched.
    const compBump = (role: string) => ctx.prefs.bumps?.[`d${ctx.dayIndex}:${ctx.slot}:${role}`] ?? 0;
    const ctxRole = (role: string): SelectCtx => ({ ...ctx, rnd: mulberry((ctx.seed ^ Math.imul(roleHash(role) + 1, 2654435761) ^ Math.imul(compBump(role) + 1, 40503)) >>> 0) });
    // Protein-role guarantee (HIGH-1): a plate must never render without a main.
    // Try main (respecting the consecutive-day ban), then relax the ban, then
    // fall back to a dal — so aggressive excludes/small pools can't empty it.
    let main = pinnedFor('main', ctxRole('main'))
      ?? pick('main', ctxRole('main')) ?? pick('main', { ...ctxRole('main'), banMain: undefined });
    if (!main) main = pick('dal', ctxRole('main'));
    take(main, main?.role === 'dal' ? 'dal' : 'main');
    if (!renal && main?.role !== 'dal') {
      if (meatForwardPrefs(ctx.prefs)) {
        // Meat-forward: add a SECOND meat/egg protein instead of a lentil dal.
        const second = pick('main', { ...ctxRole('main'), banMain: main?.id });
        if (second && second.id !== main?.id) take(second, 'main');
        else take(pick('dal', ctxRole('dal')), 'dal');
      } else {
        take(pick('dal', ctxRole('dal')), 'dal');
      }
    }
    take(pick('vegetable', ctxRole('vegetable')), 'vegetable');
    // Default carb honours the rice/roti preference; once the carb line has been
    // Refreshed, rotate through the whole carb pool (rice → roti → millet …).
    const carbCtx = ctxRole('carb');
    const carbCands = candidates('carb', carbCtx);
    const wantRice = (slot === 'l' && !ctx.prefs.avoidRice) || renal;   // rice is low-K
    const carb = compBump('carb') > 0
      ? pick('carb', carbCtx)
      : (carbCands.length
        ? (wantRice ? (carbCands.find((c) => /rice|millet/i.test(c.name)) ?? carbCands[0])
                    : (carbCands.find((c) => /roti|phulka/i.test(c.name)) ?? carbCands[0]))
        : null);
    take(carb, 'carb');
    take(pick('salad', ctxRole('salad')), 'salad');
    if (ctx.prefs.diet !== 'vegan' && !renal) take(pick('dairy', ctxRole('dairy')), 'dairy');  // curd is moderate-K — skip for renal
    // (Soup is now its own dedicated evening slot — no longer added to the dinner plate.)
    // Last-resort protein guarantee (SAFE — QA H2 fix): only relax the cuisine
    // LOCK, never diet, allergen excludes, clinical completeness or renal K/P
    // ceilings. If nothing safe qualifies, leave the protein role empty and let
    // the cap gate block/flag the plan rather than serving an unsafe/allergen dish.
    if (!sel.some((s) => s.role === 'main' || s.role === 'dal')) {
      const relaxed: SelectCtx = { ...ctx, banMain: undefined, prefs: { ...ctx.prefs, cuisineLocks: undefined } };
      const prot = pick('main', relaxed) ?? pick('dal', relaxed);
      take(prot, prot?.role === 'dal' ? 'dal' : 'main');
    }
  }

  // Guarantee at least one component (never an empty meal — Rule 1), still
  // respecting every safety filter (diet/excludes/clinical/renal); only the
  // cuisine lock is relaxed. An empty meal is left for the cap gate to handle
  // rather than injecting an unfiltered dish.
  if (!sel.length) {
    const relaxed: SelectCtx = { ...ctx, banMain: undefined, prefs: { ...ctx.prefs, cuisineLocks: undefined } };
    for (const role of ['breakfast', 'main', 'dal', 'snack', 'vegetable', 'carb', 'soup', 'drink', 'salad']) {
      const r = pick(role, relaxed);
      if (r) { take(r, r.role === 'dal' ? 'dal' : role); break; }
    }
  }

  // Protein topping (QA H1): if the plate can't reach its protein target even at
  // maximum portions, add one more protein-dense component before solving. Now runs
  // for CLINICAL plans too (Optimal Health) — the added dish still passes every
  // clinical/renal filter via candidates(), and reduceToCaps trims any breach — so
  // Optimal Health actually meets its protein prescription instead of undershooting.
  //
  // It tops up REPEATEDLY, and picks the densest of the candidate roles rather
  // than the first that answers. One addition was not enough: the days that
  // missed were missing by 20-25% — 65 g of 87 g, 88 g of 115 g — and a single
  // dal closes about half of that. The misses concentrated on `lose` and `gain`,
  // where the protein prescription moves away from the calorie budget in
  // opposite directions, and they were spread evenly across diets, so this was
  // never a shortage of vegetarian protein in the corpus.
  //
  // Three additions is the ceiling, and the plate cap of seven components binds
  // first in practice. A plate is a meal somebody has to want to eat; there is a
  // point past which meeting the number stops being the goal.
  for (let topUp = 0; topUp < 3 && proteinTarget > 0 && sel.length && sel.length < 7; topUp++) {
    const maxProtein = sel.reduce((t, s) => t + s.r.protein * ((ROLE_BOUNDS[s.role]?.[1] ?? 150) / 100), 0);
    if (maxProtein >= proteinTarget * 0.95) break;
    const options = [pick('dal', ctx), pick('dairy', ctx), pick('snack', ctx), pick('main', { ...ctx, banMain: undefined })]
      .filter((r): r is PoolRecipe => Boolean(r) && !sel.some((s) => s.r.id === r!.id));
    if (!options.length) break;
    // Densest by protein per calorie, so topping up does not simply add a
    // second dinner: the plate still has to fit its energy target afterwards.
    const extra = options.reduce((best, r) =>
      (r.protein / Math.max(1, r.kcal)) > (best.protein / Math.max(1, best.kcal)) ? r : best);
    take(extra, extra.role === 'dal' ? 'dal' : extra.role);
  }

  // Fibre topping: if the plate is short on fibre even at max portions, add a
  // high-fibre side (salad → vegetable → snack) before solving, so plans meet the
  // fibre target. Passes the same clinical/renal filters.
  if (fibreTarget > 0 && sel.length && sel.length < 7) {
    const maxFibre = sel.reduce((t, s) => t + s.r.fiber * ((ROLE_BOUNDS[s.role]?.[1] ?? 150) / 100), 0);
    if (maxFibre < fibreTarget * 0.9) {
      const extra = pick('salad', ctx) ?? pick('vegetable', ctx) ?? pick('snack', ctx);
      if (extra && !sel.some((s) => s.r.id === extra.id)) take(extra, extra.role === 'salad' ? 'salad' : extra.role === 'vegetable' ? 'vegetable' : 'snack');
    }
  }

  // Per-line Skip (lunch/dinner): drop any role the user explicitly skipped, then
  // let fitMeal rescale the remaining dishes to the plate's calorie target. Applied
  // last so it also removes anything a fallback/top-up re-added for a skipped role.
  let kept = sel;
  if (slot === 'l' || slot === 'd') {
    const skippedRole = (role: string) => (ctx.prefs.skips ?? []).includes(`d${ctx.dayIndex}:${ctx.slot}:${role}`);
    const trimmed = sel.filter((s) => !skippedRole(s.role));
    if (trimmed.length) kept = trimmed;   // never let a plate go fully empty
  }

  const components = fitMeal(kept, targetKcal, proteinTarget);
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
  const used = new Map<string, number>();          // week-wide variety ledger
  const bfCount = new Map<string, number>();       // breakfast repeat cap (Rule 14)
  let lastLunchMain = ''; let lastDinnerMain = '';
  // Dataset mains + curated components. Seeds win on id collisions.
  const pool: PoolRecipe[] = [...SEED_POOL, ...extraPool.filter((r) => !SEED_POOL.some((s) => s.id === r.id))];

  const outDays: ComposedDay[] = [];

  const slotHash = (code: string) => { let h = 0; for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const skips = new Set(prefs.skips ?? []);

  /** Build one day's meals. Each meal is independently seeded from
   *  (week seed, day, slot, refresh-bump, retry) so one meal can be refreshed in
   *  isolation; a skipped slot is dropped and its energy redistributed across the
   *  remaining meals so the day still hits its target. */
  const buildDayMeals = (dayIndex: number, attemptIdx: number, banL: string, banD: string): ComposedMeal[] => {
    let ll = banL; let ld = banD;
    const active = schedule.meals.filter((sm) => !skips.has(`d${dayIndex}:${sm.code}`));
    const eSum = active.reduce((t, sm) => t + sm.energy, 0) || 1;
    const meals: ComposedMeal[] = [];
    for (const sm of active) {
      const energy = sm.energy / eSum;                 // renormalised after any skip
      const bump = prefs.bumps?.[`d${dayIndex}:${sm.code}`] ?? 0;
      const mealSeed = (v: number) => (seed ^ Math.imul(dayIndex + 1, 2654435761) ^ Math.imul(slotHash(sm.code) + 1, 40503) ^ Math.imul(bump + 1, 2246822519) ^ Math.imul(attemptIdx * 11 + v + 1, 374761393)) >>> 0;
      const mkCtx = (v: number): SelectCtx => ({ slot: sm.code, prefs, rnd: mulberry(mealSeed(v)), used, pool, banMain: (sm.code === 'l' ? ll : sm.code === 'd' ? ld : undefined) || undefined, dayIndex, seed: mealSeed(v) });
      const mealKcal = targets.kcal * energy; const mealProtein = targets.protein * energy; const mealFibre = targets.fiber * energy;
      let v = 0;
      let meal = composeMeal(sm.code, mealKcal, mealProtein, mealFibre, energy, sm.scheduledTime, mkCtx(v));
      if (sm.code === 'b') {
        let tries = 0;
        while ((bfCount.get(meal.components[0]?.recipeId ?? meal.title) ?? 0) >= 2 && tries < 4) {
          v++; meal = composeMeal(sm.code, mealKcal, mealProtein, mealFibre, energy, sm.scheduledTime, mkCtx(v)); tries++;
        }
        const k = meal.components[0]?.recipeId ?? meal.title;
        bfCount.set(k, (bfCount.get(k) ?? 0) + 1);
      }
      if (sm.code === 'l' || sm.code === 'd') {
        const last = sm.code === 'l' ? ll : ld;
        let tries = 0;
        while ((meal.components.find((c) => c.role === 'main')?.recipeId ?? '') === last && last && tries < 6) {
          v++; meal = composeMeal(sm.code, mealKcal, mealProtein, mealFibre, energy, sm.scheduledTime, mkCtx(v)); tries++;
        }
        const newMain = meal.components.find((c) => c.role === 'main')?.recipeId ?? '';
        if (sm.code === 'l') ll = newMain; else ld = newMain;
      }
      meals.push(meal);
    }
    return meals;
  };

  /** Recompute the variety ledger + consecutive-main bans from committed days so
   *  regeneration attempts start from an identical, fair baseline. */
  const rebaseVariety = () => {
    used.clear(); bfCount.clear();
    for (const day of outDays) {
      for (const m of day.meals) for (const c of m.components) used.set(c.recipeId, (used.get(c.recipeId) ?? 0) + 1);
      const bid = day.meals.find((m) => m.slot === 'b')?.components[0]?.recipeId;
      if (bid) bfCount.set(bid, (bfCount.get(bid) ?? 0) + 1);
    }
    const last = outDays[outDays.length - 1];
    lastLunchMain = last?.meals.find((m) => m.slot === 'l')?.components.find((c) => c.role === 'main')?.recipeId ?? '';
    lastDinnerMain = last?.meals.find((m) => m.slot === 'd')?.components.find((c) => c.role === 'main')?.recipeId ?? '';
  };

  const blockReason: string[] = [];
  for (let d = 0; d < days; d++) {
    rebaseVariety();
    const baseUsed = new Map(used); const baseBf = new Map(bfCount);
    const attempt = (attemptIdx: number) => {
      used.clear(); baseUsed.forEach((v, k) => used.set(k, v));
      bfCount.clear(); baseBf.forEach((v, k) => bfCount.set(k, v));
      const meals = buildDayMeals(d, attemptIdx, lastLunchMain, lastDinnerMain);
      if (prefs.caps) reduceToCaps(meals, prefs.caps);   // bounded reduce for renal/HTN/DM caps
      const totals = sumTotals(meals.flatMap((m) => m.components));
      const breaches = capBreaches(totals, prefs.caps);
      const emptyMeal = meals.some((m) => !m.components.length);
      return { meals, totals, breaches, emptyMeal };
    };
    // Clinical safety gate (QA C3): regenerate a breaching clinical day and keep
    // the safest attempt; if it still can't meet caps, the week is BLOCKED below.
    const score = (x: { breaches: string[]; emptyMeal: boolean }) => x.breaches.length + (x.emptyMeal ? 20 : 0);
    let best = attempt(0);
    const maxTries = (prefs.clinical && prefs.caps) ? 6 : 1;
    for (let t = 1; t < maxTries && score(best) > 0; t++) {
      const cand = attempt(t);
      if (score(cand) < score(best)) best = cand;
    }
    outDays.push({
      dayIndex: d, fasting: schedule.fasting, protocol: schedule.protocol, window: schedule.window,
      meals: best.meals, totals: best.totals, capBreaches: best.breaches,
    });
    if (best.emptyMeal) blockReason.push(`Day ${d + 1}: a required meal could not be safely filled within your restrictions.`);
    for (const b of best.breaches) blockReason.push(`Day ${d + 1}: ${b}`);
  }

  const grocery = composeGrocery(outDays, { includePantry: prefs.includePantry ?? false });
  const validation = validateWeek(outDays, grocery, targets, prefs.caps);
  const blocked = Boolean(prefs.clinical && blockReason.length);
  return {
    days: outDays, grocery, targets, caps: prefs.caps, fasting: schedule.fasting, protocol: schedule.protocol,
    validation, blocked, blockReason: blocked ? [...new Set(blockReason)].slice(0, 20) : undefined,
  };
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
  c.sugarG = r1(c.sugarG * f); c.addedSugarG = r1(c.addedSugarG * f); c.satFatG = r1(c.satFatG * f);
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
          if (ing.toTaste || ing.grams <= 0) continue;        // "to taste" items never bought
          const key = canonicalKey(ing.name);                 // merge Onion/Onions/chopped onion (QA M1)
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
      // Meal title must not be a bare recipe name (Rule 16) — this catches a
      // composite plate that collapsed to one dish. The single-dish courses
      // (afternoon Snack, Evening Soup) are legitimately named after their dish,
      // so they're exempt.
      if (m.components.length && m.slot !== 's' && m.slot !== 'es' && m.components.some((c) => c.name === m.title)) {
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

/**
 * "Inform, don't force" (planner philosophy): score how closely the user's
 * PREFERRED plan matches the clinical ideal, list specific concerns with the
 * actual deviation, and suggest gentle swaps — without overriding the user.
 * The plan is generated from preferences first; this reports the trade-offs.
 */
export function complianceReport(days: ComposedDay[], targets: DayTargets, caps: ClinicalCaps | undefined, conditionsText: string): ComplianceReport {
  const n = days.length || 1;
  const sum = days.reduce((a, d) => ({
    kcal: a.kcal + d.totals.kcal, protein: a.protein + d.totals.protein, carbs: a.carbs + d.totals.carbs, fiber: a.fiber + d.totals.fiber,
    sodiumMg: a.sodiumMg + d.totals.sodiumMg, addedSugarG: a.addedSugarG + d.totals.addedSugarG, satFatG: a.satFatG + d.totals.satFatG,
    potassiumMg: a.potassiumMg + d.totals.potassiumMg, phosphorusMg: a.phosphorusMg + d.totals.phosphorusMg,
  }), { kcal: 0, protein: 0, carbs: 0, fiber: 0, sodiumMg: 0, addedSugarG: 0, satFatG: 0, potassiumMg: 0, phosphorusMg: 0 });
  const avg = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, v / n])) as typeof sum;

  const concerns: ComplianceConcern[] = [];
  const swaps: string[] = [];
  let penalty = 0;
  const cond = conditionsText.toLowerCase();
  const isDiab = /diabet|hba1c/.test(cond);

  const overCap = (key: string, label: string, value: number, cap: number | undefined, unit: string, weight: number, swap: string) => {
    if (!cap) return;
    const deltaPct = Math.round(((value - cap) / cap) * 100);
    if (deltaPct > 8) {
      concerns.push({ key, label, direction: 'over', deltaPct, severity: deltaPct > 25 ? 'warn' : 'info', weight, message: `${label} is ${deltaPct}% above the target (${Math.round(value)} vs ${Math.round(cap)} ${unit}).` });
      penalty += Math.min(24, deltaPct * 0.6) * weight;
      if (swap) swaps.push(swap);
    }
  };
  const underTarget = (key: string, label: string, value: number, target: number, unit: string, swap: string, weight = 0.6) => {
    const deltaPct = Math.round(((target - value) / target) * 100);
    if (deltaPct > 8) {
      concerns.push({ key, label, direction: 'under', deltaPct, severity: deltaPct > 25 ? 'warn' : 'info', weight, message: `${label} is ${Math.round(target - value)} ${unit} below your target (${Math.round(value)} vs ${Math.round(target)}).` });
      penalty += Math.min(20, deltaPct * 0.5);
      if (swap) swaps.push(swap);
    }
  };

  const kcalDev = Math.abs(avg.kcal - targets.kcal) / Math.max(1, targets.kcal);
  if (kcalDev > 0.10) { const p = Math.round(kcalDev * 100); concerns.push({ key: 'kcal', label: 'Calories', direction: avg.kcal > targets.kcal ? 'over' : 'under', deltaPct: p, severity: kcalDev > 0.2 ? 'warn' : 'info', weight: 0.6, message: `Calories are ${p}% ${avg.kcal > targets.kcal ? 'above' : 'below'} your target (${Math.round(avg.kcal)} vs ${Math.round(targets.kcal)} kcal).` }); penalty += Math.min(15, p * 0.3); }
  underTarget('protein', 'Protein', avg.protein, targets.protein, 'g', 'Add a protein side (paneer, egg, dal, tofu or fish) to hit your protein target.');
  underTarget('fiber', 'Fibre', avg.fiber, targets.fiber, 'g', 'Add a salad or a whole grain to raise fibre.');
  overCap('sodium', 'Sodium', avg.sodiumMg, caps?.sodiumMg, 'mg', 1, 'Cook with less salt and skip pickle/papad/processed items to cut sodium.');
  overCap('addedSugar', 'Added sugar', avg.addedSugarG, caps?.sugarG, 'g', 1.2, 'Swap sweet snacks/drinks for fruit or nuts to lower added sugar.');
  overCap('satFat', 'Saturated fat', avg.satFatG, caps?.satFatG, 'g', 1, 'Swap fried/creamy dishes for grilled, steamed or dal-based options.');
  overCap('potassium', 'Potassium', avg.potassiumMg, caps?.potassiumMg, 'mg', 1.4, 'Choose lower-potassium vegetables and limit potatoes/tomatoes/banana.');
  overCap('phosphorus', 'Phosphorus', avg.phosphorusMg, caps?.phosphorusMg, 'mg', 1.4, 'Limit dairy, nuts and whole-grain load to lower phosphorus.');
  if (isDiab) {
    const carbTarget = targets.carbs;
    const deltaPct = Math.round(((avg.carbs - carbTarget) / Math.max(1, carbTarget)) * 100);
    if (deltaPct > 12) { concerns.push({ key: 'carbs', label: 'Carbohydrates', direction: 'over', deltaPct, severity: deltaPct > 30 ? 'warn' : 'info', weight: 1, message: `Carbohydrates are ${deltaPct}% above the diabetes-friendly target (${Math.round(avg.carbs)} vs ${Math.round(carbTarget)} g) — this raises glycemic load.` }); penalty += Math.min(20, deltaPct * 0.5); swaps.push('Swap some white rice for millet or extra vegetables to lower glycemic load.'); }
  }

  // Worst first. The banner and the plate note both read concerns[0], and until
  // now that was whichever check happened to run first — sodium, because it sits
  // above potassium in the list. So a renal plan 12% over on sodium and 133%
  // over on potassium told the citizen about the sodium. Ranking by severity
  // then by weighted overshoot puts the dangerous one where it is read.
  const rank = (c: ComplianceConcern) => (c.severity === 'warn' ? 1e6 : 0) + c.deltaPct * c.weight;
  concerns.sort((a, b) => rank(b) - rank(a));

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const summary = concerns.length
    ? `Your preferred plan is ${score}% aligned with the ideal clinical plan for your profile. It reflects your tastes — the notes below are optional improvements, not requirements.`
    : `Your preferred plan is ${score}% aligned with the ideal clinical plan for your profile — it both fits your preferences and meets your targets.`;
  return { score, concerns, swaps: [...new Set(swaps)], summary };
}
