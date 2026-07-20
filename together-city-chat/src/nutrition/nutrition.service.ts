import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import {
  CITATIONS, MARKER_RULES, criticalAlerts, evaluateMarker, supplementKit,
  flagsFor, planGuidance, rankByModes, planningModes, ruleFor,
  triggeredConditions, type MarkerStatus,
} from './clinical-engine';
import type { BloodInputDto, Diet, FoodPrefDto, PlanMode, Slot } from './dto/nutrition.dto';
import { assemblePlate, perMealTargets, type PlateOpts, type DayMealInput } from './plate';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const SLOTS: Slot[] = ['b', 'l', 's', 'd'];

/** Diet compatibility — which recipe diets a preference may be served. */
function dietAllows(pref: Diet, recipe: Diet): boolean {
  const map: Record<Diet, Diet[]> = {
    everything: ['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain', 'jainvegan'],
    nonveg: ['everything', 'veg', 'nonveg', 'pesc', 'egg', 'vegan', 'jain', 'jainvegan'],
    pesc: ['veg', 'pesc', 'egg', 'vegan', 'jain', 'jainvegan'],
    egg: ['veg', 'egg', 'vegan', 'jain', 'jainvegan'],
    veg: ['veg', 'vegan', 'jain', 'jainvegan'],
    vegan: ['vegan', 'jainvegan'],       // vegan sees all plant-based (incl. Jain-safe vegan)
    jain: ['jain', 'jainvegan'],         // Jain sees Jain dishes + Jain-safe vegan (never onion/garlic)
    jainvegan: ['jainvegan', 'vegan', 'jain'], // internal; never a user pref
  };
  return map[pref].includes(recipe);
}

const SHORT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CUISINE_BY_COUNTRY: Record<string, string> = {
  India: 'Indian', China: 'Chinese', Italy: 'Italian', Mexico: 'Mexican', Thailand: 'Thai',
  Japan: 'Japanese', USA: 'American', 'United States': 'American', America: 'American',
  Lebanon: 'Middle Eastern', Turkey: 'Middle Eastern', 'Middle East': 'Middle Eastern',
  Greece: 'Mediterranean', France: 'Continental', UK: 'Continental', England: 'Continental',
};

interface PrefExtras {
  cuisineMix?: Record<string, number>; cuisines?: string[]; proteins?: string[]; meats?: string[];
  allergies?: string; excluded?: string; maxCookMin?: number | null; weekly?: Record<string, 'veg' | 'nonveg'>;
  healthConditions?: string[]; budgetInr?: number | null;
}
function parseExtras(extras: string | null | undefined): PrefExtras {
  try { return extras ? (JSON.parse(extras) as PrefExtras) : {}; } catch { return {}; }
}
function terms(s?: string): string[] {
  return (s ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
}
type RecipeWithIng = { id: string; slot: string; diet: string; name: string; country: string; minutes: number; kcal?: number; gramsPerServing?: number; ingredients: Array<{ name: string; priceInr?: number }> };

// ─────────── protein preferences as HARD constraints ───────────
// Protein sources the planner can detect in a recipe from its name + ingredients.
const PROTEIN_TOKENS: Record<string, string[]> = {
  chicken: ['chicken'],
  mutton: ['mutton', 'lamb', 'goat'],
  fish: ['fish', 'salmon', 'tuna', 'sardine', 'mackerel', 'cod', 'tilapia', 'anchovy', 'pomfret', 'basa', 'trout', 'herring'],
  prawns: ['prawn', 'shrimp', 'crab', 'lobster', 'squid', 'calamari', 'scallop', 'oyster', 'mussel'],
  beef: ['beef', 'steak'],
  pork: ['pork', 'bacon', 'ham', 'sausage', 'chorizo'],
  egg: ['egg', 'omelet', 'omelette'],
  paneer: ['paneer', 'cottage cheese'],
  tofu: ['tofu', 'tempeh'],
  legumes: ['lentil', 'dal', 'daal', 'bean', 'chickpea', 'chana', 'rajma', 'moong', 'legume', 'chole', 'edamame', 'soybean'],
};
const ANIMAL_PROTEINS = new Set(['chicken', 'mutton', 'fish', 'prawns', 'beef', 'pork', 'egg']);
// Preference chip labels → protein tokens.
const PROTEIN_LABEL: Record<string, string> = {
  chicken: 'chicken', mutton: 'mutton', fish: 'fish', prawns: 'prawns', prawn: 'prawns',
  beef: 'beef', pork: 'pork', egg: 'egg', eggs: 'egg', paneer: 'paneer', tofu: 'tofu',
  legumes: 'legumes', legume: 'legumes', lentils: 'legumes', beans: 'legumes',
};

// Word-boundary matchers (allow a trailing plural "s"), precompiled once. Naive
// substring matching mis-fires — "eggplant" contains "egg", "graham" contains
// "ham" — which would tag a vegan dish as containing an animal protein and break
// the §9 hard filter. Boundaries fix that: \begg s?\b matches egg/eggs, not eggplant.
const PROTEIN_PATTERNS: Record<string, RegExp[]> = Object.fromEntries(
  Object.entries(PROTEIN_TOKENS).map(([token, kws]) => [token, kws.map((k) => new RegExp(`\\b${k}s?\\b`, 'i'))]),
);
export function detectProteins(r: RecipeWithIng): Set<string> {
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  const found = new Set<string>();
  for (const [token, pats] of Object.entries(PROTEIN_PATTERNS)) {
    if (pats.some((p) => p.test(hay))) found.add(token);
  }
  return found;
}
export function allowedProteins(ex: PrefExtras): Set<string> {
  const out = new Set<string>();
  for (const p of [...(ex.proteins ?? []), ...(ex.meats ?? [])]) {
    const t = PROTEIN_LABEL[p.trim().toLowerCase()];
    if (t) out.add(t);
  }
  return out;
}
/**
 * HARD protein rule. With no selection, the diet filter alone governs. Once the
 * user picks proteins/meats: (1) a recipe may NOT contain an animal protein the
 * user didn't select (a chicken-only user never sees fish/egg/pork), and (2) if
 * the user eats meat, main meals (lunch/dinner) must actually feature one of
 * their selected animal proteins — never a stray veg/paneer/tofu dish.
 */
export function passesProtein(r: RecipeWithIng, allowed: Set<string>): boolean {
  if (allowed.size === 0) return true;
  const found = detectProteins(r);
  const animalFound = [...found].filter((t) => ANIMAL_PROTEINS.has(t));
  for (const t of animalFound) if (!allowed.has(t)) return false; // disallowed animal protein
  const allowedAnimal = [...allowed].filter((t) => ANIMAL_PROTEINS.has(t));
  if (allowedAnimal.length && (r.slot === 'l' || r.slot === 'd')) {
    if (!animalFound.some((t) => allowed.has(t))) return false;   // meat main must have their meat
  }
  return true;
}

/** Does this recipe actually feature one of the user's SELECTED animal proteins?
 *  Used as a SOFT preference for breakfast & snack — a non-veg user should see
 *  their egg/chicken/fish first, while a light veg breakfast (poha, upma) stays a
 *  valid fallback. Lunch/dinner enforce the same thing as a HARD rule above. */
export function hasSelectedAnimalProtein(r: RecipeWithIng, allowed: Set<string>): boolean {
  if (allowed.size === 0) return false;
  return [...detectProteins(r)].some((t) => ANIMAL_PROTEINS.has(t) && allowed.has(t));
}
/** True when the user eats meat (selected ≥1 animal protein) — so breakfast/snack
 *  should bias toward those proteins. */
function eatsAnimalProtein(allowed: Set<string>): boolean {
  return [...allowed].some((t) => ANIMAL_PROTEINS.has(t));
}

// ─────────── medical conditions as HARD exclusions ───────────
// Keyword exclusions per condition (the recipe DB carries no micronutrient
// columns, so we exclude clear ingredient/name violators — the deterministic
// clinical engine still biases ranking on top of this).
const MEDICAL_EXCLUDE: Record<string, string[]> = {
  diabetes: ['sugar', 'syrup', 'honey', 'jaggery', 'condensed milk', 'sweetened', 'caramel', 'gulab jamun', 'jalebi', 'dessert', 'candy', 'soda'],
  hypertension: ['pickle', 'papad', 'salted', 'brine', 'bacon', 'sausage', 'ham', 'processed', 'instant noodle'],
  'kidney disease': ['pickle', 'papad', 'processed', 'organ meat', 'sardine', 'anchovy'],
  'fatty liver': ['alcohol', 'wine', 'beer', 'deep fried', 'deep-fried', 'lard', 'fructose syrup'],
  pcos: ['sugar', 'syrup', 'maida', 'refined flour', 'white bread', 'soda', 'candy'],
};
function passesMedical(r: RecipeWithIng, conditions: string[]): boolean {
  if (!conditions.length) return true;
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  for (const c of conditions) {
    const kws = MEDICAL_EXCLUDE[c.trim().toLowerCase()];
    if (kws && kws.some((k) => hay.includes(k))) return false;
  }
  return true;
}
function perPlateCost(r: RecipeWithIng): number {
  const total = r.ingredients.reduce((s, i) => s + (i.priceInr ?? 0), 0);
  if (!total) return 0; // unknown → don't exclude on price
  return Math.round(total / recipeServings({ slot: r.slot, kcal: r.kcal ?? 0, gramsPerServing: r.gramsPerServing ?? 0 }));
}

/**
 * The world dataset has messy titles: trailing dots/ellipses, embedded
 * "(servings: 4)", lowercase first letters and stray punctuation. Tidy them for
 * display without touching stored data (idempotent, so it's safe at read-time).
 */
function cleanRecipeName(raw: string): string {
  let s = (raw || '').trim();
  s = s.replace(/\((?:\s*(?:servings?|serves|makes|yield|yields)\b[^)]*)\)/gi, ' '); // drop "(servings: 4)"
  s = s.replace(/\s*\.{2,}\s*$/g, ''); // trailing ellipses
  s = s.replace(/[\s,.;:_\-–—]+$/g, ''); // trailing punctuation/space
  s = s.replace(/^[\s,.;:_\-–—]+/g, ''); // leading junk
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);
  return s || (raw || '').trim();
}

/**
 * The dataset's `minutes` field mixes cook time with pickling/marinating times
 * (up to 9540 min = days). Clamp to a believable hands-on cook window so the UI
 * never shows "9540 min". Missing/zero → a sane default.
 */
function saneMinutes(m: number | undefined | null): number {
  const v = Math.round(m ?? 0);
  if (!v || v < 3) return 15;
  return Math.min(180, v);
}

/**
 * Is this recipe substantial enough to be a planned meal for the slot? The
 * dataset carries many <20 kcal condiments (pickles, chutneys, spice blends,
 * relishes) that must never be chosen as a breakfast/lunch/dinner. Judged on the
 * per-person calories (batch kcal ÷ servings) against a per-slot floor.
 */
const MEAL_MIN_KCAL: Record<string, number> = { b: 120, l: 180, s: 45, d: 180 };
function isPlannableMeal(r: { slot: string; kcal?: number; gramsPerServing?: number }): boolean {
  if (r.kcal == null) return true; // unknown → don't exclude
  const perServing = r.kcal / recipeServings({ slot: r.slot, kcal: r.kcal, gramsPerServing: r.gramsPerServing ?? 0 });
  return perServing >= (MEAL_MIN_KCAL[r.slot] ?? 150);
}

// ─────────── meal-type appropriateness (think like a dietitian) ───────────
// A realistic per-person calorie window for each slot — a snack is ~100-300 kcal,
// lunch the largest, dinner moderate. This rejects recipes that don't fit the
// slot's ROLE even when the dataset mis-tagged the slot (e.g. a 500-kcal, 120-min
// rice dish tagged as a "snack").
const SLOT_KCAL: Record<string, [number, number]> = {
  b: [250, 700], l: [350, 950], s: [90, 300], d: [300, 850],
};
// Condiments / seasonings — never a meal in any slot.
const CONDIMENT_NAME = /(pickle|relish|chutney|marmalade|preserve|\bjam\b|\bjelly\b|seasoning|\bsyrup\b|condiment|ketchup|\bglaze\b|marinade)/i;
// A full main course / heavy dish — never an appropriate snack.
const SNACK_UNFIT_NAME = /biryani|pulao|pilaf|fried rice|\brice\b|pasta|lasagn|noodle|thali|casserole|risotto|paella|khichdi|pongal|platter|\bstew\b|\bcurry\b|\bgravy\b|dressing|\bdip\b|\bsauce\b|\bpaste\b/i;

/**
 * Mandatory meal-type validation. Is this recipe realistic for the slot?
 *  • every slot has a sensible per-person calorie window;
 *  • condiments are never a meal;
 *  • a snack must be light AND quick (≤30 min) and never a rice/curry/pasta main.
 */
function mealAppropriate(r: RecipeWithIng): boolean {
  const slot = r.slot;
  const per = (r.kcal ?? 0) / recipeServings({ slot, kcal: r.kcal ?? 0, gramsPerServing: r.gramsPerServing ?? 0 });
  const [lo, hi] = SLOT_KCAL[slot] ?? [200, 900];
  if (r.kcal != null && (per < lo || per > hi)) return false;
  if (CONDIMENT_NAME.test(r.name)) return false;
  if (slot === 's') {
    if (saneMinutes(r.minutes) > 30) return false;
    if (SNACK_UNFIT_NAME.test(r.name)) return false;
  }
  return true;
}

/**
 * HARD constraints — a recipe that fails ANY of these is never eligible, and
 * these are never relaxed. Order mirrors the recommendation pipeline:
 * diet pattern → real meal → allowed proteins → medical → allergies → avoided.
 */
function passesHard(r: RecipeWithIng, diet: Diet, ex: PrefExtras, allowed: Set<string>): boolean {
  if (!dietAllows(diet, r.diet as Diet)) return false;                 // 1 · diet pattern
  if (!isPlannableMeal(r)) return false;                               // 2 · real meal (no condiments)
  if (!passesProtein(r, allowed)) return false;                       // 3 · preferred proteins/meats
  if (!passesMedical(r, ex.healthConditions ?? [])) return false;     // 4 · medical conditions
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  if (terms(ex.allergies).some((a) => hay.includes(a))) return false; // 5 · allergies
  if (terms(ex.excluded).some((a) => hay.includes(a))) return false;  // 6 · foods user won't eat
  return true;
}

/** SOFT constraints — preferred, but relaxed if a slot would otherwise be empty. */
function passesSoft(r: RecipeWithIng, ex: PrefExtras): boolean {
  const maxCook = ex.maxCookMin ?? null;
  if (maxCook && saneMinutes(r.minutes) > maxCook) return false;      // 7 · cooking time
  const budget = ex.budgetInr ?? null;                               // 8 · budget
  if (budget) { const c = perPlateCost(r); if (c > 0 && c > budget) return false; }
  return true;
}

/** Filter recipes to a diet + the user's rules (hard + soft), in pipeline order. */
function filterByPrefs(recipes: RecipeWithIng[], diet: Diet, ex: PrefExtras): RecipeWithIng[] {
  const allowed = allowedProteins(ex);
  return recipes.filter((r) => passesHard(r, diet, ex, allowed) && passesSoft(r, ex));
}
/** Front-load recipes whose cuisine the user weighted highest (soft bias). */
function cuisineBias<T extends { country: string }>(list: T[], mix: Record<string, number>): T[] {
  const total = Object.values(mix).reduce((a, b) => a + b, 0);
  if (!total) return list;
  const w = (r: T) => mix[CUISINE_BY_COUNTRY[r.country] ?? r.country] ?? 0;
  return [...list].sort((a, b) => w(b) - w(a));
}
/** Is this recipe's cuisine one the user selected? With a set Cuisine Mix, only
 *  the chosen kitchens are used (Indian 100% ⇒ only Indian); an empty mix means
 *  no preference, so everything is allowed. */
function cuisineAllowed(country: string, mix: Record<string, number>): boolean {
  const chosen = Object.keys(mix).filter((k) => (mix[k] ?? 0) > 0);
  if (!chosen.length) return true;
  return chosen.includes(CUISINE_BY_COUNTRY[country] ?? country);
}

export interface RecipeShape {
  id: string; recipeNo: number | null; name: string; country: string; kcal: number; protein: number;
  carbs: number; fat: number; fiber: number; minutes: number; gramsPerServing: number; diet: Diet;
  servings: number; // how many one-person plates the raw recipe yields
}

/**
 * The world recipe database stores whole-recipe (batch) totals in `kcal` and
 * `gramsPerServing`, so a single dish can read 5,000 kcal / 2,000 g — that's the
 * pot, not a plate. We estimate how many one-person plates a batch yields from
 * both its weight and its energy (whichever implies more servings), using
 * per-slot reference plate sizes, so every surface can show a real single
 * portion. Family plans then multiply a plate by the household headcount.
 */
const PLATE_GRAMS: Record<string, number> = { b: 350, l: 500, s: 200, d: 500 };
const PLATE_KCAL: Record<string, number> = { b: 500, l: 700, s: 350, d: 700 };
export function recipeServings(r: { slot?: string; kcal: number; gramsPerServing: number }): number {
  const gRef = PLATE_GRAMS[r.slot ?? ''] ?? 450;
  const kRef = PLATE_KCAL[r.slot ?? ''] ?? 650;
  const byGrams = (r.gramsPerServing || 0) / gRef;
  const byKcal = (r.kcal || 0) / kRef;
  return Math.max(1, Math.min(20, Math.round(Math.max(byGrams, byKcal))));
}

export interface PlateSideItem { name: string; qty: number; unit: string; kcal: number }
export interface PlateSides {
  applicable: boolean; note: string; items: PlateSideItem[];
  sideKcal: number; plateKcal: number; targetKcal: number;
}
export interface WhyPoint { label: string; text: string }
export interface WhyForYou {
  personalised: boolean; headline: string; points: WhyPoint[];
  summary: string; cites: { id: string; label: string; ref: string }[];
}

export interface CalorieRow { id: string; userId: string; date: string; name: string; kcal: number; type: string; createdAt: Date }
interface CalorieDelegate {
  findMany(a: unknown): Promise<CalorieRow[]>;
  create(a: unknown): Promise<CalorieRow>;
  deleteMany(a: unknown): Promise<{ count: number }>;
}

/** One guided cooking step: its instruction, how long it runs unattended, and
 *  whether it needs constant attention (stir) vs. can run in the background. */
export interface CookStep { text: string; durationSec: number; active: boolean }

/** Extract a timer (seconds) from a step's wording. Ranges take the upper bound;
 *  temperatures and quantities are ignored. */
function secondsFromText(text: string): number {
  const t = text.toLowerCase();
  const U = '(hours?|hrs?|minutes?|mins?|seconds?|secs?)';
  const toSec = (n: number, u: string) => (/hour|hr/.test(u) ? Math.round(n * 3600) : /sec/.test(u) ? Math.round(n) : Math.round(n * 60));
  let m = t.match(new RegExp(`(\\d+)\\s*(?:–|-|to)\\s*(\\d+)\\s*${U}`));
  if (m) return Math.min(2 * 3600, toSec(parseInt(m[2], 10), m[3]));
  m = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${U}`));
  if (m) return Math.min(2 * 3600, toSec(parseFloat(m[1]), m[2]));
  return 0;
}

/** Whether a step needs you at the stove (true) or can run in the background (false). */
function isActiveStep(text: string, durationSec: number): boolean {
  const t = text.toLowerCase();
  if (/\b(simmer|bake|roast|marinat|chill|refrigerat|soak|proof|prove|boil|steam|slow[- ]?cook|pressure[- ]?cook|cover and cook|set aside|cool|freeze|infuse|rest|leave)\b/.test(t)) return false;
  if (/\b(stir|whisk|saut|fry|flip|toss|fold|beat|knead|scrambl|temper|deglaz|brown|sear|caramel|mix)\b/.test(t)) return true;
  if (durationSec === 0) return true;
  return durationSec < 180; // short timers keep you at the stove; long ones you can leave
}

@Injectable()
export class NutritionService implements OnModuleInit {
  private readonly logger = new Logger(NutritionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRecipes();
    await this.ensureDietitians();
    // Load the full 12,976-recipe world database into Postgres (once). Runs in
    // the background so it never blocks boot / health checks; persists forever.
    void this.ensureRecipeLibrary();
  }

  // ─────────────── targets (Mifflin-St Jeor) ───────────────
  async targets(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const weight = pref?.weightKg ?? 70;
    const height = pref?.heightCm ?? 172;
    const age = pref?.age ?? 30;
    const sex = pref?.sex ?? 'male';
    const activity = pref?.activity ?? 1.4;
    const goal = pref?.goal ?? 'maintain';

    const h = height / 100;
    const bmi = h > 0 ? weight / (h * h) : 22;
    const overweight = bmi >= 27;

    // Mifflin-St Jeor → TDEE, then a percentage goal adjustment.
    const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
    const tdee = bmr * activity;
    const adj = goal === 'lose' ? -0.18 : goal === 'gain' ? (overweight ? 0 : 0.10) : 0;
    let kcal = Math.max(1400, Math.round(tdee * (1 + adj)));

    const refWeight = bmi >= 27 ? Math.round(25 * h * h) : weight;
    let proteinPerKg = goal === 'gain' ? 2.0 : goal === 'lose' ? 1.8 : 1.6;
    let fatPct = 0.27;                 // % of kcal from fat
    let fiber = Math.max(25, Math.min(50, Math.round((kcal / 1000) * 14)));

    // ── Step 3: medical target adjustments (blood flags + declared conditions) ──
    const flags = flagsFor(await this.bloodValues(userId));
    const conds = new Set((ex.healthConditions ?? []).map((c) => c.toLowerCase()));
    const has = (...k: string[]) => k.some((x) => conds.has(x));
    const diabetes = flags.hba1c === 'high' || has('diabetes');
    const highChol = flags.ldl === 'high' || flags.trig === 'high' || has('high cholesterol');
    const fattyLiver = has('fatty liver');
    const hypertension = has('hypertension');
    const kidney = has('kidney disease');
    const adjustments: string[] = [];

    let sugarMaxG = Math.round((kcal * 0.10) / 4);   // ≤10% kcal from added sugar (WHO)
    let satFatMaxG = Math.round((kcal * 0.10) / 9);  // ≤10% kcal from saturated fat
    let sodiumMaxMg = 2300;
    let potassiumMinMg = 3500;

    if (diabetes) {
      proteinPerKg = Math.max(proteinPerKg, 1.8); fiber = Math.max(fiber, 35); sugarMaxG = 20;
      adjustments.push('Diabetes: higher protein & fibre, lower-glycaemic carbs, added sugar ≤20 g');
    }
    if (highChol) {
      satFatMaxG = Math.round((kcal * 0.06) / 9); fiber = Math.max(fiber, 35);
      adjustments.push('Raised cholesterol/triglycerides: saturated fat ≤6% kcal, more soluble fibre');
    }
    if (fattyLiver) {
      proteinPerKg = Math.max(proteinPerKg, 1.8); sugarMaxG = Math.min(sugarMaxG, 20); satFatMaxG = Math.min(satFatMaxG, Math.round((kcal * 0.07) / 9));
      adjustments.push('Fatty liver: lean protein up, added sugar & saturated fat down');
    }
    if (hypertension) {
      sodiumMaxMg = 1500; potassiumMinMg = 4700;
      adjustments.push('Hypertension: sodium ≤1500 mg, higher potassium (DASH)');
    }
    if (kidney) {
      proteinPerKg = Math.min(proteinPerKg, 0.8); sodiumMaxMg = Math.min(sodiumMaxMg, 2000); potassiumMinMg = 2000;
      adjustments.push('Kidney disease: protein moderated, sodium & potassium limited — confirm targets with your nephrologist');
    }

    const protein = Math.round(proteinPerKg * refWeight);
    const fat = Math.round((kcal * fatPct) / 9);
    const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

    // ── Step 4: distribute the day's targets across meals ──
    const split: Record<'b' | 'l' | 's' | 'd', number> = { b: 0.25, l: 0.32, s: 0.13, d: 0.30 };
    const perMeal = Object.fromEntries(
      (['b', 'l', 's', 'd'] as const).map((slot) => [slot, {
        kcal: Math.round(kcal * split[slot]),
        protein: Math.round(protein * split[slot]),
        carb: Math.round(carb * split[slot]),
        fat: Math.round(fat * split[slot]),
      }]),
    );

    return {
      kcal, protein, carb, fat, fiber, waterMl: Math.round(weight * 35),
      sugarMaxG, satFatMaxG, sodiumMaxMg, potassiumMinMg,
      perMeal, adjustments,
    };
  }

  async upsertFoodPref(userId: string, dto: FoodPrefDto) {
    // `extras` exists on Railway's freshly-generated client; cast for the local
    // (offline) client which can't be regenerated here.
    const data = dto as Record<string, unknown>;
    return this.prisma.foodPref.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    } as Parameters<typeof this.prisma.foodPref.upsert>[0]);
  }

  /** Current preferences (defaults if never saved) — powers the Preferences form. */
  async foodPref(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    return {
      diet: pref?.diet ?? 'everything',
      goal: pref?.goal ?? 'maintain',
      heightCm: pref?.heightCm ?? null,
      weightKg: pref?.weightKg ?? null,
      age: pref?.age ?? null,
      sex: pref?.sex ?? null,
      activity: pref?.activity ?? 1.4,
      extras: (pref as { extras?: string | null } | null)?.extras ?? null,
    };
  }

  // ─────────────── health profile · calorie log ───────────────
  /** Typed accessor for the CalorieEntry model (the local, offline Prisma client
   *  may predate this model; Railway regenerates it at build). */
  private get calorie(): CalorieDelegate {
    return (this.prisma as unknown as { calorieEntry: CalorieDelegate }).calorieEntry;
  }

  async healthLog(userId: string, dates: string[]) {
    const clean = dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 31);
    if (!clean.length) return { entries: [] as CalorieRow[] };
    const entries = await this.calorie.findMany({ where: { userId, date: { in: clean } }, orderBy: { createdAt: 'asc' } });
    return { entries };
  }

  async addCalorie(userId: string, dto: { date: string; name: string; kcal: number; type: string }) {
    if (dto.type === 'Extra') {
      const existing = await this.calorie.findMany({ where: { userId, date: dto.date, type: 'Extra' } });
      if (existing.length >= 5) throw new BadRequestException('Maximum 5 extra items per day.');
    }
    await this.calorie.create({ data: { userId, date: dto.date, name: dto.name, kcal: dto.kcal, type: dto.type } });
    return this.healthLog(userId, [dto.date]);
  }

  async removeCalorie(userId: string, id: string) {
    await this.calorie.deleteMany({ where: { id, userId } });
    return { ok: true };
  }

  // ─────────────── weekly plan ───────────────
  /**
   * Required-preference gate. The planner is the user's source of truth, so it
   * must never guess: if a required field is missing, we return what's missing
   * instead of generating a plan on assumptions.
   */
  async profileStatus(userId: string): Promise<{ complete: boolean; missing: { key: string; label: string }[] }> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    if (!pref) {
      return { complete: false, missing: [
        { key: 'diet', label: 'Diet pattern' },
        { key: 'proteins', label: 'Protein sources' },
        { key: 'body', label: 'Age, sex, height & weight' },
      ] };
    }
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const missing: { key: string; label: string }[] = [];
    if (!pref.age) missing.push({ key: 'age', label: 'Age' });
    if (!pref.sex) missing.push({ key: 'sex', label: 'Sex' });
    if (!pref.heightCm) missing.push({ key: 'height', label: 'Height' });
    if (!pref.weightKg) missing.push({ key: 'weight', label: 'Weight' });
    if (!(ex.proteins && ex.proteins.length)) missing.push({ key: 'proteins', label: 'Protein sources' });
    return { complete: missing.length === 0, missing };
  }

  async weeklyPlan(userId: string, mode: PlanMode = 'individual') {
    const status = await this.profileStatus(userId);
    if (!status.complete) {
      return { incomplete: true, missing: status.missing, key: '', days: [], guidance: null };
    }
    const existing = await this.prisma.mealPlan.findFirst({
      where: { userId, mode },
      orderBy: { createdAt: 'desc' },
    });
    // Rebuild when the saved profile is newer than the plan, so the plan always
    // reflects the user's current preferences.
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const stale = Boolean(existing && pref && existing.createdAt < pref.updatedAt);
    const plan = existing && !stale ? await this.shapePlan(existing.key) : await this.generatePlan(userId, mode);
    return { ...plan, guidance: await this.userPlanGuidance(userId) };
  }

  async regenerate(userId: string, mode: PlanMode = 'individual') {
    const status = await this.profileStatus(userId);
    if (!status.complete) {
      return { incomplete: true, missing: status.missing, key: '', days: [], guidance: null };
    }
    const plan = await this.generatePlan(userId, mode);
    return { ...plan, guidance: await this.userPlanGuidance(userId) };
  }

  /** Load the user's stored marker values, as a {key: value} map. */
  /**
   * Biomarkers that drive the plan — read from the Medical Hub (source of truth),
   * scoped to the LATEST panel so multiple blood tests always use the most recent.
   * Gated by the user's Nutrition consent (the "Connect to Medical Hub" toggle):
   * off ⇒ no biomarkers ⇒ a generic plan. Consent defaults to granted.
   */
  private async bloodValues(userId: string): Promise<Record<string, number>> {
    const consent = await this.prisma.medicalConsent.findFirst({ where: { userId, hub: 'nutrition' } });
    if (consent && !consent.granted) return {}; // user turned the connection off

    const test = await this.prisma.medicalBloodTest.findFirst({
      where: { userId }, orderBy: { takenOn: 'desc' }, include: { biomarkers: true },
    });
    if (test && test.biomarkers.length) {
      return Object.fromEntries(test.biomarkers.map((b) => [b.key, b.value]));
    }
    // Fallback: legacy nutrition-local markers (pre-Medical-Hub).
    const rows = await this.prisma.bloodMarker.findMany({ where: { userId } });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  /** Condition-aware planning rationale for the current markers + goal (or null). */
  private async userPlanGuidance(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const flags = flagsFor(await this.bloodValues(userId));
    return planGuidance(flags, pref?.goal ?? 'maintain');
  }

  /** Build a slot→recipes map honouring the user's diet, allergies, avoided
   *  foods, cook-time cap and cuisine-mix bias. `dayDiet` lets a single day be
   *  forced vegetarian (weekly veg/non-veg rule) on top of the base diet. */
  private rankedPools(
    recipes: RecipeWithIng[], dayDiet: Diet, ex: PrefExtras, modes: ReturnType<typeof planningModes>,
  ): Record<Slot, RecipeWithIng[]> {
    const mix = ex.cuisineMix ?? (ex.cuisines?.length ? Object.fromEntries(ex.cuisines.map((c) => [c, 1])) : {});
    const allowed = allowedProteins(ex);
    const out = {} as Record<Slot, RecipeWithIng[]>;
    for (const slot of SLOTS) {
      const inSlot = recipes.filter((r) => r.slot === slot);
      // Primary: hard + meal-type-appropriate + soft. Fallbacks drop soft rules,
      // then meal-fit, but always keep diet/protein/allergy/medical enforced so we
      // never surface a disallowed item (a rice dish can never become a snack here).
      // Cuisine Mix is enforced (only chosen kitchens), then relaxed only if a
      // slot would otherwise be empty.
      let pool = inSlot.filter((r) => passesHard(r, dayDiet, ex, allowed) && cuisineAllowed(r.country, mix) && mealAppropriate(r) && passesSoft(r, ex));
      if (!pool.length) pool = inSlot.filter((r) => passesHard(r, dayDiet, ex, allowed) && cuisineAllowed(r.country, mix) && mealAppropriate(r));
      if (!pool.length) pool = inSlot.filter((r) => passesHard(r, dayDiet, ex, allowed) && mealAppropriate(r));
      if (!pool.length) pool = inSlot.filter((r) => passesHard(r, dayDiet, ex, allowed));
      if (!pool.length) pool = inSlot.filter((r) => dietAllows(dayDiet, r.diet as Diet) && isPlannableMeal(r));
      if (!pool.length) pool = inSlot;
      const byMode = rankByModes(pool as unknown as RecipeShape[], modes) as unknown as RecipeWithIng[];
      let ordered = cuisineBias(byMode, mix);
      // Breakfast & snack: PREFER the user's selected animal proteins (egg/chicken/
      // fish first) without excluding veg options — a stable partition keeps the
      // clinical + cuisine order intact within each group.
      if ((slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)) {
        const withP = ordered.filter((r) => hasSelectedAnimalProtein(r, allowed));
        const without = ordered.filter((r) => !hasSelectedAnimalProtein(r, allowed));
        ordered = [...withP, ...without];
      }
      out[slot] = ordered;
    }
    return out;
  }

  private async generatePlan(userId: string, mode: PlanMode) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = (pref?.diet ?? 'everything') as Diet;
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const allowed = allowedProteins(ex);
    // Cross-week variety (spec §18): remember the recipes in the plan we're about
    // to replace so the new week de-prioritises them — Week 2 shouldn't repeat
    // Week 1. Read BEFORE the deleteMany below. Down-ranked, never excluded, so a
    // narrow pool can still fill every slot.
    const prior = await this.prisma.mealPlan.findFirst({
      where: { userId, mode },
      include: { days: { include: { meals: { select: { recipeId: true } } } } },
    });
    const recentIds = new Set<string>((prior?.days ?? []).flatMap((d) => d.meals.map((m) => m.recipeId)));
    // Load prices too, so the budget filter can work.
    const recipes = (await this.prisma.recipe.findMany({ include: { ingredients: { select: { name: true, priceInr: true } } } })) as unknown as RecipeWithIng[];

    // Condition-aware selection: blood flags + goal switch on planning modes.
    const modes = planningModes(flagsFor(await this.bloodValues(userId)), pref?.goal ?? 'maintain');
    const baseRanked = this.rankedPools(recipes, diet, ex, modes);
    // Some days can be forced vegetarian by the weekly rule — precompute a veg pool.
    const vegRanked = this.rankedPools(recipes, 'veg', ex, modes);

    const offset = Math.floor(Math.random() * 6);
    const key = 'wk_' + this.rand(8);

    // Variety engine: across the week, never repeat the same recipe, and no single
    // protein signature more than twice. Cuisine is left to the % preference bias
    // (capping cuisine would fight an "Indian 70%" preference), and each day's pick
    // rotates its start through the ranked pool.
    const usedRecipe = new Map<string, number>();
    const usedProtein = new Map<string, number>();
    const count = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
    const bump = (m: Map<string, number>, k: string) => m.set(k, count(m, k) + 1);
    const proteinSig = (r: RecipeWithIng) => [...detectProteins(r)].sort().join(',') || r.diet;
    const pick = (pool: RecipeWithIng[], dayIndex: number, prefer?: (r: RecipeWithIng) => boolean): RecipeWithIng | undefined => {
      if (!pool.length) return undefined;
      const rot = pool.map((_, i) => pool[(i + dayIndex + offset) % pool.length]);
      const fresh = (r: RecipeWithIng) => count(usedRecipe, r.id) < 1;                 // not used yet THIS week
      const varied = (r: RecipeWithIng) => fresh(r) && count(usedProtein, proteinSig(r)) < 2;
      const newWeek = (r: RecipeWithIng) => !recentIds.has(r.id);                        // not in LAST week's plan
      // Preference order, best → fallback. `newWeek` (cross-week variety, §18) and
      // `prefer` (breakfast/snack protein, §7) stack on top of the in-week rules,
      // but every layer degrades gracefully so a slot is never left empty.
      const chosen =
        (prefer ? rot.find((r) => varied(r) && newWeek(r) && prefer(r)) : undefined) ??
        rot.find((r) => varied(r) && newWeek(r)) ??
        (prefer ? rot.find((r) => varied(r) && prefer(r)) : undefined) ??
        rot.find(varied) ??
        (prefer ? rot.find((r) => fresh(r) && prefer(r)) : undefined) ??
        rot.find(fresh) ??
        rot[0];
      bump(usedRecipe, chosen.id);
      bump(usedProtein, proteinSig(chosen));
      return chosen;
    };

    const picks: Record<number, Partial<Record<Slot, RecipeWithIng>>> = {};
    for (let d = 0; d < DAYS.length; d++) {
      picks[d] = {};
      const dayVeg = ex.weekly?.[SHORT_DAYS[d]] === 'veg';
      const ranked = dayVeg ? vegRanked : baseRanked;
      for (const slot of SLOTS) {
        const full = ranked[slot];
        const list = modes.length ? full.slice(0, Math.max(6, Math.ceil(full.length / 2))) : full;
        // Non-veg breakfast/snack: prefer a selected animal protein (egg/chicken/
        // fish), falling back to a veg option only if none fits (spec §7).
        const prefer = (slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)
          ? (r: RecipeWithIng) => hasSelectedAnimalProtein(r, allowed)
          : undefined;
        const r = pick(list, d, prefer);
        if (r) picks[d][slot] = r;
      }
    }

    // One plan per user+mode — clear old ones so the profile stays the source of truth.
    await this.prisma.mealPlan.deleteMany({ where: { userId, mode } });

    await this.prisma.mealPlan.create({
      data: {
        key,
        userId,
        mode,
        days: {
          create: DAYS.map((dayName, dayIndex) => ({
            dayIndex,
            dayName,
            meals: {
              create: SLOTS.filter((slot) => picks[dayIndex][slot]).map((slot) => {
                const recipe = picks[dayIndex][slot] as RecipeWithIng;
                const withSides = slot === 'l' || slot === 'd';
                return {
                  slot,
                  recipeId: recipe.id,
                  skipped: false,
                  sidesRice: withSides ? (slot === 'l' ? 1 : 0) : 0,
                  sidesRoti: withSides ? 2 : 0,
                  sidesCurd: slot === 'l' ? 1 : 0,
                  sidesSalad: withSides ? 1 : 0,
                };
              }),
            },
          })),
        },
      },
    });
    return this.shapePlan(key);
  }

  // ─────────────── day summary ───────────────
  /** Diet/goal/diabetes context for the thali plate builder — shared by shapePlan
   *  (card display) and daySummary (dashboard) so the two can NEVER disagree. */
  private async plateOptsFor(userId: string): Promise<PlateOpts> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId));
    const diabetes = flags.hba1c === 'high' || (ex.healthConditions ?? []).some((c) => /diab/i.test(c));
    const lactoseFree = /lactose|dairy-free|milk/i.test(ex.allergies ?? '');
    return {
      diet: pref?.diet ?? 'everything',
      goal: (pref?.goal ?? 'maintain') as PlateOpts['goal'],
      diabetes, dairy: pref?.diet !== 'vegan' && !lactoseFree, jain: pref?.diet === 'jain',
    };
  }

  private static readonly SLOT_ORDER: Record<string, number> = { b: 0, l: 1, s: 2, d: 3 };

  /** Describe a day's meals for the dynamic budget split — which flex (Indian
   *  lunch/dinner plates) and the fixed calories of the rest. */
  private dayMealInputs(meals: Array<{ slot: string; skipped: boolean; recipe: { country: string } }>): DayMealInput[] {
    return meals.map((m) => {
      const indian = /india/i.test(m.recipe.country);
      const isPlate = (m.slot === 'l' || m.slot === 'd') && indian;
      return {
        slot: m.slot as DayMealInput['slot'],
        skipped: m.skipped,
        isPlate,
        fixedKcal: isPlate ? 0 : this.recipeShape(m.recipe as unknown as Parameters<NutritionService['recipeShape']>[0]).kcal,
      };
    });
  }

  /** The nutrition a single meal contributes — the assembled thali total for an
   *  Indian lunch/dinner (identical to the card), else the dish's per-serving
   *  values. ONE calculation, used for both the card and the dashboard. */
  private mealMacros(recipeRow: RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, slot: string, dayIndex: number, opts: PlateOpts, targetKcal?: number) {
    const shape = this.recipeShape(recipeRow);
    const indian = /india/i.test(recipeRow.country);
    if ((slot === 'l' || slot === 'd') && indian) {
      const plate = assemblePlate(shape, slot as 'l' | 'd', opts, dayIndex * 4 + NutritionService.SLOT_ORDER[slot], targetKcal);
      return { kcal: plate.totals.kcal, protein: plate.totals.protein, carbs: plate.totals.carbs, fat: plate.totals.fat, fiber: plate.totals.fiber };
    }
    return { kcal: shape.kcal, protein: shape.protein, carbs: shape.carbs, fat: shape.fat, fiber: shape.fiber };
  }

  async daySummary(planKey: string, dayIndex: number) {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { plan: { select: { userId: true } }, meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) throw new NotFoundException('plan day not found');
    const opts = await this.plateOptsFor(day.plan.userId);
    const tg = await this.targets(day.plan.userId);
    // Dynamic budgets: skipped meals redistribute to the remaining plates.
    const dyn = perMealTargets(this.dayMealInputs(day.meals), tg.kcal);

    let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, cost = 0;
    for (const m of day.meals) {
      if (m.skipped) continue;
      // Aggregate the SAME plate/dish the card shows — the single source of truth.
      const mealTarget = dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal;
      const n = this.mealMacros(m.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, m.slot, dayIndex, opts, mealTarget);
      kcal += n.kcal; protein += n.protein; carbs += n.carbs; fat += n.fat; fiber += n.fiber;
      const s = recipeServings(m.recipe);
      const ing = m.recipe.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
      cost += ing > 0 ? Math.round(ing / s) : Math.round((m.recipe.kcal / s) * 0.11);
    }
    kcal = Math.round(kcal); protein = Math.round(protein); carbs = Math.round(carbs);
    fat = Math.round(fat); fiber = Math.round(fiber); cost = Math.round(cost);
    const cov = (p: number) => Math.max(15, Math.min(140, Math.round(p)));
    return {
      kcal, protein, carbs, fat, fiber, cost,
      coverage: {
        protein: cov((protein / 130) * 100), fiber: cov((fiber / 32) * 100),
        fe: cov(protein * 0.9 + 20), ca: cov(60 + dayIndex * 3), mg: cov(75),
        zn: cov(58), b12: cov(88), va: cov(72), vc: cov(115), vd: cov(45),
      },
    };
  }

  // ─────────────── swap + sides ───────────────
  async swap(planKey: string, dayIndex: number, slot: Slot) {
    const meal = await this.findMeal(planKey, dayIndex, slot);
    const plan = await this.prisma.mealPlan.findUnique({ where: { key: planKey }, select: { userId: true } });
    const pref = plan ? await this.prisma.foodPref.findUnique({ where: { userId: plan.userId } }) : null;
    const diet = (pref?.diet ?? 'everything') as Diet;
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const effDiet: Diet = ex.weekly?.[SHORT_DAYS[dayIndex]] === 'veg' ? 'veg' : diet;

    const recipes = (await this.prisma.recipe.findMany({ where: { slot }, include: { ingredients: { select: { name: true, priceInr: true } } } })) as unknown as RecipeWithIng[];
    const allowed = allowedProteins(ex);
    const mix = ex.cuisineMix ?? (ex.cuisines?.length ? Object.fromEntries(ex.cuisines.map((c) => [c, 1])) : {});
    // Same hard + meal-type + cuisine constraints as the planner; relax only soft rules.
    let candidates = recipes.filter((r) => passesHard(r, effDiet, ex, allowed) && cuisineAllowed(r.country, mix) && mealAppropriate(r) && passesSoft(r, ex));
    if (!candidates.length) candidates = recipes.filter((r) => passesHard(r, effDiet, ex, allowed) && cuisineAllowed(r.country, mix) && mealAppropriate(r));
    if (!candidates.length) candidates = recipes.filter((r) => passesHard(r, effDiet, ex, allowed) && mealAppropriate(r));
    if (!candidates.length) candidates = recipes.filter((r) => passesHard(r, effDiet, ex, allowed));
    if (!candidates.length) candidates = recipes.filter((r) => dietAllows(effDiet, r.diet as Diet) && isPlannableMeal(r));
    if (!candidates.length) candidates = recipes;
    const others = candidates.filter((c) => c.id !== meal.recipeId);
    const pickFrom = others.length ? others : candidates;
    if (pickFrom.length) {
      // Smart refresh: the plate flexes to hit the calorie target either way, so
      // rank replacements by per-serving protein and pick from the top third —
      // a swap keeps the day's protein high instead of dropping to a random dish.
      const protein = (c: RecipeWithIng) => (c as unknown as { protein?: number }).protein ?? 0;
      let rankPool = [...pickFrom];
      // Breakfast/snack refresh: keep the user's selected animal proteins first
      // (spec §7 & §16) so a refresh never drops a non-veg user to a vegan dish
      // when an egg/chicken option exists.
      if ((slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)) {
        const withP = rankPool.filter((r) => hasSelectedAnimalProtein(r, allowed));
        if (withP.length) rankPool = withP;
      }
      const ranked = rankPool.sort((a, b) => protein(b) - protein(a));
      const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
      const pick = top[Math.floor(Math.random() * top.length)];
      await this.prisma.meal.update({ where: { id: meal.id }, data: { recipeId: pick.id, skipped: false } });
    }
    return this.shapePlan(planKey);
  }

  /** Skip / un-skip a meal for the day. */
  async setSkip(planKey: string, dayIndex: number, slot: Slot, skipped: boolean) {
    const meal = await this.findMeal(planKey, dayIndex, slot);
    await this.prisma.meal.update({ where: { id: meal.id }, data: { skipped } });
    return this.shapePlan(planKey);
  }

  async setSides(planKey: string, dayIndex: number, slot: Slot, sides: { rice: number; roti: number; curd: number; salad: number }) {
    const meal = await this.findMeal(planKey, dayIndex, slot);
    await this.prisma.meal.update({
      where: { id: meal.id },
      data: { sidesRice: sides.rice, sidesRoti: sides.roti, sidesCurd: sides.curd, sidesSalad: sides.salad },
    });
    return this.shapePlan(planKey);
  }

  private async findMeal(planKey: string, dayIndex: number, slot: Slot) {
    const meal = await this.prisma.meal.findFirst({
      where: { slot, day: { dayIndex, plan: { key: planKey } } },
    });
    if (!meal) throw new NotFoundException('meal not found');
    return meal;
  }

  // ─────────────── recipes ───────────────
  async recipes(diet?: Diet) {
    const where = diet && diet !== 'everything' ? { diet } : {};
    const rows = await this.prisma.recipe.findMany({ where, orderBy: { name: 'asc' }, take: 200 });
    return rows.map((r) => this.recipeShape(r));
  }

  async recipe(id: string, userId?: string) {
    const r = await this.prisma.recipe.findUnique({ where: { id }, include: { ingredients: true } });
    if (!r) throw new NotFoundException('recipe not found');
    const cookSteps = await this.recipeCookSteps(r);
    const shape = this.recipeShape(r);

    // Personalise the plate for whoever is viewing: complete-the-plate sides
    // sized to their individual calorie need, and a "why this is on your plate"
    // note written from their own blood results.
    let sides: PlateSides | undefined;
    let whyForYou: WhyForYou | undefined;
    if (userId) {
      const [targets, values, pref] = await Promise.all([
        this.targets(userId),
        this.bloodValues(userId), // already consent-gated
        this.prisma.foodPref.findUnique({ where: { userId } }),
      ]);
      const flags = flagsFor(values);
      sides = this.suggestSides(shape, r.country, targets, flags);
      whyForYou = this.whyForYou(shape, r.ingredients, values, flags, pref?.goal ?? 'maintain');
    }

    return {
      ...shape,
      ingredients: r.ingredients.map((i) => ({ name: i.name, grams: i.grams, priceInr: i.priceInr })),
      method: cookSteps.map((s) => s.text), // back-compat plain list
      cookSteps,                            // structured: text + timer + attention
      sides,
      whyForYou,
    };
  }

  /** Reference nutrition for a single portion of each Indian-thali side. */
  private static readonly SIDE_UNITS = {
    roti: { name: 'Roti (whole wheat)', unit: 'piece', kcal: 110, carb: 18 },
    rice: { name: 'Rice', unit: 'katori (150g)', kcal: 200, carb: 44 },
    curd: { name: 'Curd', unit: 'katori', kcal: 90, carb: 6 },
    salad: { name: 'Fresh salad', unit: 'bowl', kcal: 40, carb: 6 },
    fruit: { name: 'Seasonal fruit', unit: 'serving', kcal: 80, carb: 20 },
  } as const;

  /** Fraction of the daily calorie budget each meal slot should carry. */
  private static readonly SLOT_FRACTION: Record<string, number> = { b: 0.25, l: 0.32, s: 0.13, d: 0.30 };

  /**
   * Complete-the-plate sides, sized to the individual's own calorie need. An
   * Indian main at lunch/dinner gets roti + rice (+ salad, and curd at lunch)
   * scaled to fill the gap between the dish and that person's per-meal target.
   * Raised HbA1c / LDL / triglycerides shift the plate away from white rice
   * toward roti, salad and curd (lower glycemic / heart-friendly).
   */
  private suggestSides(
    recipe: { slot?: string; kcal: number }, country: string,
    targets: { kcal: number }, flags: Record<string, MarkerStatus>,
  ): PlateSides {
    const U = NutritionService.SIDE_UNITS;
    const slot = recipe.slot ?? 'l';
    const frac = NutritionService.SLOT_FRACTION[slot] ?? 0.3;
    const targetKcal = Math.round(targets.kcal * frac);
    const gap = targetKcal - recipe.kcal;
    const indian = /india/i.test(country);
    const items: PlateSideItem[] = [];
    const glucoseWatch = flags.hba1c === 'high';
    const heartWatch = flags.ldl === 'high' || flags.trig === 'high';

    const push = (u: { name: string; unit: string; kcal: number }, qty: number) => {
      if (qty > 0) items.push({ name: u.name, qty, unit: u.unit, kcal: u.kcal * qty });
    };

    if ((slot === 'l' || slot === 'd') && gap > 60) {
      if (indian) {
        // A real Indian thali gets both roti and rice. Rice is 1 katori by
        // default (a second only for a big gap), trimmed for raised glucose;
        // roti fills the rest. Salad always; curd at lunch if there's room.
        const riceK = glucoseWatch ? 1 : (gap > 560 ? 2 : 1);
        const afterRice = gap - riceK * U.rice.kcal;
        const rotiN = Math.max(1, Math.min(5, Math.round(afterRice / U.roti.kcal)));
        push(U.roti, rotiN);
        push(U.rice, riceK);
        push(U.salad, 1);
        const leftover = gap - rotiN * U.roti.kcal - riceK * U.rice.kcal;
        if (glucoseWatch || (slot === 'l' && leftover > 60)) push(U.curd, 1);
      } else {
        // Non-Indian mains: a whole-grain side + salad, sized to the gap.
        const grainK = Math.max(1, Math.min(2, Math.round(gap / U.rice.kcal)));
        items.push({ name: 'Whole grain (rice / quinoa / bread)', qty: grainK, unit: 'katori (150g)', kcal: U.rice.kcal * grainK });
        push(U.salad, 1);
      }
    } else if (slot === 'b' && gap > 120) {
      // Round out a light breakfast with fruit (+ curd if there's room).
      push(U.fruit, 1);
      if (gap > 220) push(U.curd, 1);
    }

    const sideKcal = items.reduce((s, i) => s + i.kcal, 0);
    let note: string;
    if (!items.length) {
      note = slot === 's'
        ? 'A standalone snack — no sides needed.'
        : `This is close to a complete ${targetKcal} kcal plate on its own.`;
    } else if (indian && (slot === 'l' || slot === 'd')) {
      const tuned = glucoseWatch ? ' We trimmed the rice and added salad + curd to keep the glycemic load low for your raised HbA1c.'
        : heartWatch ? ' We leaned to roti and salad over rice — gentler on your cholesterol/triglyceride results.' : '';
      note = `Sized to your ~${targetKcal} kcal ${slot === 'l' ? 'lunch' : 'dinner'} target.${tuned}`;
    } else {
      note = `Rounded out to your ~${targetKcal} kcal target.`;
    }

    return { applicable: items.length > 0, note, items, sideKcal, plateKcal: recipe.kcal + sideKcal, targetKcal };
  }

  /**
   * "Why this is on your plate" — written from the viewer's own blood results.
   * Deterministic and cited: it matches what the dish actually delivers (fibre,
   * lean protein, iron, omega-3, greens, whole grains) against the markers that
   * are out of range, and explains what it does and how it helps their numbers.
   */
  private whyForYou(
    recipe: { name: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number; diet: string },
    ingredients: Array<{ name: string }>,
    values: Record<string, number>, flags: Record<string, MarkerStatus>, goal: string,
  ): WhyForYou {
    const ing = ingredients.map((i) => i.name.toLowerCase()).join(', ');
    const has = (...terms: string[]) => terms.some((t) => ing.includes(t));
    const highFibre = recipe.fiber >= 6;
    const highProtein = recipe.protein >= 18;
    const fish = has('fish', 'salmon', 'sardine', 'tuna', 'mackerel', 'prawn');
    const greens = has('spinach', 'kale', 'methi', 'greens', 'broccoli', 'palak');
    const legumes = has('lentil', 'dal', 'bean', 'moong', 'chickpea', 'chana', 'rajma', 'tofu', 'soy');
    const wholegrain = has('oat', 'barley', 'millet', 'quinoa', 'brown rice', 'bajra', 'jowar', 'ragi', 'besan');
    const dairyEgg = has('curd', 'yogurt', 'paneer', 'milk', 'egg', 'cheese');
    const cites = new Set<string>();
    const points: WhyPoint[] = [];
    const addRule = (key: string) => ruleFor(key)?.citations.forEach((c) => cites.add(c));

    // Each out-of-range marker → a line tying the dish's real strengths to it.
    if (flags.hba1c === 'high' && (highFibre || legumes || wholegrain)) {
      const src = [legumes && 'legumes', wholegrain && 'whole grains', highFibre && 'fibre'].filter(Boolean).join(' and ');
      points.push({ label: `HbA1c ${values.hba1c ?? ''}%`.trim(), text: `Its ${src} slow digestion and blunt the glucose spike your raised HbA1c is telling us to avoid.` });
      addRule('hba1c');
    }
    if ((flags.ldl === 'high' || flags.trig === 'high') && (fish || legumes || wholegrain || greens || highFibre)) {
      const src = fish ? 'omega-3 from the fish' : (wholegrain || legumes) ? 'soluble fibre from the beans/whole grains' : 'fibre and vegetables';
      const which = flags.ldl === 'high' && flags.trig === 'high' ? 'LDL and triglycerides' : flags.ldl === 'high' ? 'LDL' : 'triglycerides';
      points.push({ label: which.includes('and') ? 'LDL + triglycerides' : (flags.ldl === 'high' ? `LDL ${values.ldl ?? ''}`.trim() : `Triglycerides ${values.trig ?? ''}`.trim()), text: `The ${src} here supports lowering the ${which} flagged in your report.` });
      addRule(flags.ldl === 'high' ? 'ldl' : 'trig');
    }
    if ((flags.hb === 'low' || flags.ferritin === 'low') && (legumes || greens || fish || has('meat', 'liver', 'chicken', 'mutton'))) {
      points.push({ label: flags.hb === 'low' ? `Haemoglobin ${values.hb ?? ''}`.trim() : `Ferritin ${values.ferritin ?? ''}`.trim(), text: `Iron-rich ingredients help rebuild the low iron stores your ${flags.hb === 'low' ? 'haemoglobin' : 'ferritin'} showed — pair with the vitamin-C here for better absorption.` });
      addRule(flags.hb === 'low' ? 'hb' : 'ferritin');
    }
    if (flags.vitd === 'low' && (fish || dairyEgg)) {
      points.push({ label: `Vitamin D ${values.vitd ?? ''}`.trim(), text: `Contains vitamin-D foods (${fish ? 'oily fish' : 'eggs/fortified dairy'}) to help nudge up your low vitamin D.` });
      addRule('vitd');
    }
    if (flags.b12 === 'low' && (fish || dairyEgg || has('meat', 'chicken', 'mutton'))) {
      points.push({ label: `B12 ${values.b12 ?? ''}`.trim(), text: `Provides B12 from animal foods — directly relevant to the low B12 in your panel.` });
      addRule('b12');
    }

    // What the dish is, and how it fits the goal.
    const strengths = [highProtein && `${recipe.protein} g protein`, highFibre && `${recipe.fiber} g fibre`, fish && 'omega-3', greens && 'leafy greens'].filter(Boolean).join(', ');
    const goalLine = goal === 'lose'
      ? 'Its protein and fibre keep you full on fewer calories — useful for your weight-loss goal.'
      : goal === 'gain'
        ? 'The protein here supports your muscle-gain goal.'
        : 'A balanced plate that fits your maintenance targets.';
    const personalised = points.length > 0;
    const headline = personalised ? 'Chosen for your blood results' : Object.keys(values).length ? 'How this fits your plan' : 'Why this dish';
    const summary = personalised
      ? `${recipe.name} brings ${strengths || 'a balanced macro split'} — ${goalLine}`
      : Object.keys(values).length
        ? `${recipe.name} is a balanced ${recipe.kcal} kcal plate (${strengths || 'well-rounded macros'}). ${goalLine}`
        : `${recipe.name} — ${strengths || 'a balanced plate'}. Connect your blood test to see exactly how each meal targets your results.`;

    return {
      personalised,
      headline,
      points,
      summary,
      cites: [...cites].map((id) => CITATIONS[id]).filter(Boolean),
    };
  }

  /** Structured cook steps for a recipe — AI-generated on first view and cached.
   *  Each step carries a duration (seconds it runs unattended, 0 = none) and an
   *  `active` flag (needs constant attention like stirring vs. background like a
   *  simmer). A deterministic fallback is used when AI is off. */
  private async recipeCookSteps(r: {
    id: string; name: string; country: string; minutes: number; diet: string;
    cookSteps?: string | null; steps?: string | null; ingredients: Array<{ name: string; grams: number }>;
  }): Promise<CookStep[]> {
    const cached = (r as { cookSteps?: string | null }).cookSteps;
    if (cached) {
      try {
        const s = JSON.parse(cached);
        if (Array.isArray(s) && s.length && typeof s[0]?.text === 'string') return s as CookStep[];
      } catch { /* regenerate */ }
    }
    const ingNames = r.ingredients.map((i) => i.name);
    const ingList = r.ingredients.map((i) => `${i.name} (${i.grams}g)`).join(', ');
    const mins = saneMinutes(r.minutes);
    const cleanName = cleanRecipeName(r.name);
    const fallback = this.fallbackCookSteps(cleanName, ingNames, mins);
    const ai = await this.ai.json<Array<{ text?: unknown; durationSec?: unknown; active?: unknown }>>(
      'You are a professional chef. Return the cooking method as a JSON array of 4–8 step objects. ' +
        'Each object: {"text": short one-action instruction, "durationSec": integer seconds the step runs unattended (0 if none), ' +
        '"active": true if it needs constant attention (stirring, whisking, flipping, watching closely) or false if it mostly runs on its own (simmer, bake, rest, marinate, boil)}.',
      `Recipe: "${cleanName}" (${r.country}, ${r.diet}, ~${mins} min). Ingredients: ${ingList}.\n` +
        `Return ONLY the JSON array.`,
      [],
      900,
    );
    const cleaned: CookStep[] = Array.isArray(ai)
      ? ai
          .filter((s) => s && typeof s.text === 'string' && (s.text as string).trim())
          .slice(0, 10)
          .map((s) => {
            const text = (s.text as string).trim();
            const dur = typeof s.durationSec === 'number' && s.durationSec > 0 ? Math.min(2 * 3600, Math.round(s.durationSec)) : secondsFromText(text);
            const active = typeof s.active === 'boolean' ? s.active : isActiveStep(text, dur);
            return { text, durationSec: dur, active };
          })
      : [];
    const result = cleaned.length ? cleaned : fallback;
    await this.prisma.recipe
      .update({ where: { id: r.id }, data: { cookSteps: JSON.stringify(result) } as never })
      .catch(() => undefined);
    return result;
  }

  private fallbackCookSteps(name: string, ingredients: string[], minutes: number): CookStep[] {
    const list = ingredients.length ? ingredients.join(', ') : 'your ingredients';
    const simmer = Math.max(10, Math.round(minutes * 0.6));
    const texts = [
      `Gather and prep everything: ${list}. Wash, peel and chop as needed.`,
      `Heat a pan with a little oil over medium heat and add the aromatics (onion/garlic/spices) first, stirring for about 2 minutes.`,
      `Add the main ingredients and cook, stirring, until softened and fragrant — about 5 minutes.`,
      `Season to taste, then cover and simmer on low for about ${simmer} minutes.`,
      `Check seasoning, finish, and serve ${name} hot.`,
    ];
    return texts.map((text) => {
      const durationSec = secondsFromText(text);
      return { text, durationSec, active: isActiveStep(text, durationSec) };
    });
  }

  /** Real ingredient search — recipes whose ingredients match the given terms,
   *  filtered by the user's saved profile (diet, allergies, avoided foods, cook
   *  time) and ranked by how many of your ingredients they use. */
  async searchByIngredients(userId: string, searchTerms: string[], diet?: Diet) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const effDiet = ((diet && diet !== 'everything') ? diet : (pref?.diet ?? 'everything')) as Diet;
    const clean = searchTerms.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);

    const rows = (await this.prisma.recipe.findMany({ include: { ingredients: { select: { name: true } } }, take: 300 })) as unknown as Array<RecipeWithIng & Record<string, unknown>>;
    let pool = filterByPrefs(rows, effDiet, ex);
    if (!pool.length) pool = rows.filter((r) => dietAllows(effDiet, r.diet as Diet));

    const scored = pool.map((r) => {
      const names = r.ingredients.map((i) => i.name.toLowerCase());
      const matches = clean.length ? clean.filter((t) => names.some((n) => n.includes(t))).length : 0;
      return { r, matches };
    });
    const chosen = (clean.length ? scored.filter((s) => s.matches > 0) : scored)
      .sort((a, b) => b.matches - a.matches || a.r.name.localeCompare(b.r.name))
      .slice(0, 60);
    return chosen.map(({ r, matches }) => ({ ...this.recipeShape(r as unknown as Parameters<NutritionService['recipeShape']>[0]), matches }));
  }

  // ─────────────── grocery cart ───────────────
  async getCart(userId: string) {
    const cart = await this.prisma.groceryCart.findFirst({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true },
    });
    return cart ?? { id: null, items: [] };
  }

  /** Build a grocery cart from a plan's ingredients, split fresh vs pantry. */
  /** Build a grocery list from a meal plan and/or a set of recipes, replacing
   *  the current list. Used by the weekly/daily/family planners and by recipe
   *  search / recipe detail ("generate grocery list"). */
  async buildCart(userId: string, opts: { planKey?: string; recipeIds?: string[]; people?: number; mode?: PlanMode }) {
    const totals = new Map<string, { grams: number; price: number }>();
    // Household headcount — 1 plate per person (individual = 1, family = N).
    const people = Math.max(1, Math.min(30, Math.round(opts.people ?? 1)));
    // Stored ingredients are whole-batch, so divide by the recipe's servings to
    // get one plate, then multiply by headcount. A plate can't be zero-grams, so
    // round up per ingredient after scaling.
    const addRecipe = (recipe: { slot?: string; kcal: number; gramsPerServing: number; ingredients: Array<{ name: string; grams: number; priceInr: number }> }) => {
      const s = recipeServings(recipe);
      const factor = people / s;
      for (const ing of recipe.ingredients) {
        const cur = totals.get(ing.name) ?? { grams: 0, price: 0 };
        cur.grams += Math.max(1, Math.round(ing.grams * factor));
        cur.price += Math.round(ing.priceInr * factor);
        totals.set(ing.name, cur);
      }
    };

    // No source given → build from the user's most recent plan for THIS mode
    // (individual vs family), so the family basket never pulls the solo plan.
    let planKey = opts.planKey;
    if (!planKey && !opts.recipeIds?.length) {
      const where = opts.mode ? { userId, mode: opts.mode } : { userId };
      const latest = await this.prisma.mealPlan.findFirst({ where, orderBy: { createdAt: 'desc' } });
      planKey = latest?.key;
    }
    if (planKey) {
      const plan = await this.prisma.mealPlan.findUnique({
        where: { key: planKey },
        include: { days: { include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
      });
      if (plan) for (const day of plan.days) for (const m of day.meals) { if (!m.skipped) addRecipe(m.recipe); }
    }
    if (opts.recipeIds?.length) {
      const recipes = await this.prisma.recipe.findMany({ where: { id: { in: opts.recipeIds.slice(0, 80) } }, include: { ingredients: true } });
      for (const r of recipes) addRecipe(r);
    }
    if (!totals.size) return this.getCart(userId);

    const fresh = ['tomato', 'onion', 'spinach', 'paneer', 'chicken', 'fish', 'salmon', 'curd', 'milk', 'egg', 'vegetable', 'fruit', 'avocado'];
    // One active list per user — replace the previous one.
    await this.prisma.groceryCart.deleteMany({ where: { userId } });
    return this.prisma.groceryCart.create({
      data: {
        userId,
        items: {
          create: [...totals.entries()].map(([name, v]) => ({
            name,
            category: fresh.some((f) => name.toLowerCase().includes(f)) ? 'fresh' : 'pantry',
            qty: Math.max(1, Math.round(v.grams / 200)),
            priceInr: v.price,
          })),
        },
      },
      include: { items: true },
    });
  }

  // ─────────────── wallet ───────────────
  private static readonly WALLET_SEED_INR = 5000;

  /** Balance + ledger. First call seeds a welcome credit so the demo economy works. */
  async wallet(userId: string) {
    let ledger = await this.prisma.walletLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    if (ledger.length === 0) {
      await this.prisma.walletLedger.create({
        data: { userId, amountInr: NutritionService.WALLET_SEED_INR, kind: 'credit', note: 'Welcome credit' },
      });
      ledger = await this.prisma.walletLedger.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    }
    const balanceInr = ledger.reduce(
      (sum, t) => sum + (t.kind === 'debit' ? -t.amountInr : t.amountInr),
      0,
    );
    return {
      balanceInr,
      transactions: ledger.slice(0, 20).map((t) => ({
        id: t.id, amountInr: t.amountInr, kind: t.kind, note: t.note, createdAt: t.createdAt.toISOString(),
      })),
    };
  }

  // ─────────────── orders ───────────────
  /** Place an order from the latest grocery cart: pantry ships once, fresh splits
   *  into 7 daily deliveries; total is debited from the wallet. */
  async placeOrder(userId: string, method?: 'wallet' | 'card') {
    const cart = await this.prisma.groceryCart.findFirst({
      where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true },
    });
    if (!cart || cart.items.length === 0) throw new NotFoundException('build a grocery cart first');

    const total = cart.items.reduce((s, i) => s + i.priceInr, 0);
    // Unified payment: charge the one city wallet via the Financial hub.
    await this.financial.charge(userId, { hub: 'Nutrition', category: 'nutrition', label: 'Grocery & meal order', amountInr: total, method });

    const freshTotal = cart.items.filter((i) => i.category === 'fresh').reduce((s, i) => s + i.priceInr, 0);
    const perDay = Math.round(freshTotal / 7);
    const today = new Date();

    const order = await this.prisma.nutritionOrder.create({
      data: {
        userId,
        totalInr: total,
        items: {
          create: cart.items.map((i) => ({ name: i.name, category: i.category, qty: i.qty, priceInr: i.priceInr })),
        },
        deliveries: {
          create: Array.from({ length: 7 }, (_v, dayIndex) => ({
            dayIndex,
            date: new Date(today.getTime() + dayIndex * 86_400_000),
            amountInr: dayIndex === 6 ? freshTotal - perDay * 6 : perDay,
          })),
        },
      },
      include: { items: true, deliveries: { orderBy: { dayIndex: 'asc' } } },
    });
    return this.shapeOrder(order);
  }

  async orders(userId: string) {
    const rows = await this.prisma.nutritionOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { items: true, deliveries: { orderBy: { dayIndex: 'asc' } } },
    });
    return rows.map((o) => this.shapeOrder(o));
  }

  /** Cancel a scheduled fresh delivery — its amount refunds to the wallet. */
  async cancelDelivery(userId: string, orderId: string, deliveryId: string) {
    const delivery = await this.prisma.freshDelivery.findFirst({
      where: { id: deliveryId, orderId, order: { userId } },
    });
    if (!delivery) throw new NotFoundException('delivery not found');
    if (delivery.status !== 'scheduled') throw new NotFoundException('only scheduled deliveries can be cancelled');
    await this.prisma.freshDelivery.update({ where: { id: delivery.id }, data: { status: 'cancelled' } });
    if (delivery.amountInr > 0) {
      await this.prisma.walletLedger.create({
        data: { userId, amountInr: delivery.amountInr, kind: 'refund', note: `Delivery day ${delivery.dayIndex + 1} cancelled` },
      });
    }
    return this.orders(userId);
  }

  private shapeOrder(o: {
    id: string; totalInr: number; status: string; createdAt: Date;
    items: { id: string; name: string; category: string; qty: number; priceInr: number }[];
    deliveries: { id: string; dayIndex: number; date: Date; status: string; amountInr: number }[];
  }) {
    return {
      id: o.id,
      totalInr: o.totalInr,
      status: o.status,
      createdAt: o.createdAt.toISOString(),
      items: o.items.map((i) => ({ id: i.id, name: i.name, category: i.category, qty: i.qty, priceInr: i.priceInr })),
      deliveries: o.deliveries.map((d) => ({
        id: d.id, dayIndex: d.dayIndex, date: d.date.toISOString().slice(0, 10), status: d.status, amountInr: d.amountInr,
      })),
    };
  }

  // ─────────────── blood panel (Medical bridge) ───────────────
  async bloodPanel(userId: string) {
    const rows = await this.prisma.bloodMarker.findMany({ where: { userId } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const values: Record<string, number> = {};
    for (const [k, v] of byKey) values[k] = v;
    const crp = byKey.get('crp');

    const flags: Record<string, MarkerStatus> = {};
    const markers = MARKER_RULES.filter((rule) => byKey.has(rule.key)).map((rule) => {
      const value = byKey.get(rule.key) as number;
      const { status, advice, caveat, citations } = evaluateMarker(rule, value, crp);
      flags[rule.key] = status;
      return {
        key: rule.key, label: rule.label, unit: rule.unit, value, status, advice, caveat,
        range: `${rule.min}–${rule.max}`,
        citations: citations.map((id) => CITATIONS[id]).filter(Boolean),
      };
    });

    return {
      markers,
      alerts: criticalAlerts(values),                    // "seek medical care" red flags
      conditions: triggeredConditions(flags).map((c) => ({
        key: c.key, name: c.name, principles: c.principles,
        citations: c.citations.map((id) => CITATIONS[id]).filter(Boolean),
      })),
      disclaimer: 'Educational guidance grounded in ESPEN and Krause clinical nutrition sources — not a diagnosis. Always confirm with your doctor or dietitian.',
    };
  }

  async saveBlood(userId: string, dto: BloodInputDto) {
    for (const [key, value] of Object.entries(dto)) {
      if (typeof value !== 'number') continue;
      await this.prisma.bloodMarker.upsert({
        where: { userId_key: { userId, key } },
        update: { value },
        create: { userId, key, value },
      });
    }
    return this.bloodPanel(userId);
  }

  // ─────────────── supplements (goal + biomarker matched) ───────────────
  async supplements(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const panel = await this.bloodPanel(userId);
    const flags: Record<string, MarkerStatus> = {};
    for (const m of panel.markers) flags[m.key] = m.status as MarkerStatus;
    const kit = supplementKit(pref?.goal ?? 'maintain', flags);
    return { goal: pref?.goal ?? 'maintain', kit, totalInr: kit.reduce((s, k) => s + k.priceInr, 0) };
  }

  // ─────────────── expert care (dietitians → real chat) ───────────────
  async dietitians() {
    const rows = await this.prisma.dietitian.findMany({
      include: { user: { select: { id: true, handle: true, name: true, profileImage: true } } },
    });
    return rows.map((d) => ({
      id: d.id, name: d.user.name, handle: d.user.handle, specialty: d.specialty,
      languages: d.languages.split(',').filter(Boolean), rating: d.rating, priceInr: d.priceInr,
    }));
  }

  /** Booking creates an ACCEPTED NUTRITIONIST_CLIENT connection and opens the chat. */
  async bookDietitian(userId: string, dietitianId: string) {
    const dietitian = await this.prisma.dietitian.findUnique({ where: { id: dietitianId } });
    if (!dietitian) throw new NotFoundException('dietitian not found');
    const [userOneId, userTwoId] = [userId, dietitian.userId].sort();
    await this.prisma.connection.upsert({
      where: { userOneId_userTwoId_connectionType: { userOneId, userTwoId, connectionType: 'NUTRITIONIST_CLIENT' } },
      update: { status: 'ACCEPTED' },
      create: { userOneId, userTwoId, connectionType: 'NUTRITIONIST_CLIENT', status: 'ACCEPTED', requestedById: userId },
    });
    const conversation = await this.conversations.startDirect(userId, dietitian.userId);
    const booking = await this.prisma.dietitianBooking.create({
      data: { userId, dietitianId, conversationId: conversation.id },
    });
    return { bookingId: booking.id, conversationId: conversation.id };
  }

  private async ensureDietitians(): Promise<void> {
    // Demo dietitians are fake people (real User accounts). Off by default so the
    // Expert Care list is empty until real providers are added. Set SEED_DEMO=true to restore.
    if (process.env.SEED_DEMO !== 'true') return;
    try {
      const count = await this.prisma.dietitian.count();
      if (count > 0) return;
    } catch {
      return; // table not migrated yet — ensureRecipes already logged guidance
    }
    const seed = [
      { handle: 'dr_kavita', name: 'Dr. Kavita Menon', specialty: 'Clinical nutrition · diabetes', languages: 'English,Hindi,Malayalam', rating: 4.9, priceInr: 899 },
      { handle: 'coach_arjun', name: 'Arjun Bedi', specialty: 'Sports nutrition · muscle gain', languages: 'English,Hindi,Punjabi', rating: 4.8, priceInr: 699 },
      { handle: 'dr_sana', name: 'Dr. Sana Qureshi', specialty: 'Gut health · PCOS', languages: 'English,Hindi,Urdu', rating: 4.9, priceInr: 999 },
    ];
    for (const d of seed) {
      const user = await this.prisma.user.upsert({
        where: { handle: d.handle },
        update: {},
        create: { handle: d.handle, name: d.name, passwordHash: randomBytes(24).toString('hex') },
      });
      await this.prisma.dietitian.create({
        data: { userId: user.id, specialty: d.specialty, languages: d.languages, rating: d.rating, priceInr: d.priceInr },
      });
    }
    this.logger.log(`Seeded ${seed.length} dietitians.`);
  }

  // ─────────────── shaping ───────────────
  private recipeShape(r: {
    id: string; name: string; country: string; kcal: number; protein: number; carbs: number;
    fat: number; fiber: number; minutes: number; gramsPerServing: number; diet: string; slot?: string;
  }): RecipeShape {
    // 'jainvegan' is an internal filtering tag — surface it to the UI as 'vegan'
    // (it is fully plant-based) so existing diet chips/colours render correctly.
    const displayDiet = (r.diet === 'jainvegan' ? 'vegan' : r.diet) as Diet;
    // Normalise batch totals → one real single-person plate.
    const s = recipeServings(r);
    const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
    return {
      id: r.id, recipeNo: (r as { recipeNo?: number | null }).recipeNo ?? null,
      name: cleanRecipeName(r.name), country: r.country,
      kcal: per(r.kcal), protein: per(r.protein), carbs: per(r.carbs),
      fat: per(r.fat), fiber: per(r.fiber), minutes: saneMinutes(r.minutes),
      gramsPerServing: Math.max(1, per(r.gramsPerServing)), diet: displayDiet,
      servings: s,
    };
  }

  private async shapePlan(key: string) {
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key },
      include: {
        days: {
          orderBy: { dayIndex: 'asc' },
          include: { meals: { orderBy: { slot: 'asc' }, include: { recipe: true } } },
        },
      },
    });
    if (!plan) throw new NotFoundException('plan not found');
    const slotOrder = NutritionService.SLOT_ORDER;

    // Plate context + per-meal calorie budgets — SAME source the dashboard sums.
    const plateOpts = await this.plateOptsFor(plan.userId);
    const tg = await this.targets(plan.userId);

    return {
      key: plan.key,
      days: plan.days.map((d) => {
        // Same dynamic budgets the dashboard uses — skipped meals grow the rest.
        const dyn = perMealTargets(this.dayMealInputs(d.meals), tg.kcal);
        return {
        day: d.dayName,
        meals: [...d.meals]
          .sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot])
          .map((m) => {
            const recipe = this.recipeShape(m.recipe);
            // Thali assembly is for INDIAN mains only — Western/other cuisines stay
            // a single plated dish, not a roti+rice+dal+curd thali.
            const indian = /india/i.test(m.recipe.country);
            const plate = indian && (m.slot === 'l' || m.slot === 'd')
              ? assemblePlate(recipe, m.slot as 'l' | 'd', plateOpts, d.dayIndex * 4 + slotOrder[m.slot], dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal)
              : undefined;
            return {
              slot: m.slot,
              recipe,
              skipped: m.skipped,
              sides: { rice: m.sidesRice, roti: m.sidesRoti, curd: m.sidesCurd, salad: m.sidesSalad },
              plate,
            };
          }),
        };
      }),
    };
  }

  private rand(n: number): string {
    const c = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
  }

  // ─────────────── recipe library (tops up missing recipes on every boot) ───────────────
  private async ensureRecipes(): Promise<void> {
    let existing: Set<string>;
    try {
      const rows = await this.prisma.recipe.findMany({ select: { name: true } });
      existing = new Set(rows.map((r) => r.name));
    } catch {
      this.logger.warn('Recipe table not migrated yet — run `npx prisma migrate dev` then restart.');
      return;
    }
    const R = (
      name: string, country: string, slot: Slot, kcal: number, protein: number, carbs: number,
      fat: number, fiber: number, minutes: number, g: number, diet: Diet,
      ingredients: [string, number, number][],
    ) => ({
      name, country, slot, kcal, protein, carbs, fat, fiber, minutes, gramsPerServing: g, diet,
      ingredients: { create: ingredients.map(([iname, grams, priceInr]) => ({ name: iname, grams, priceInr })) },
    });
    const seed = [
      // ───────── Breakfast (b) ─────────
      R('Masala Oats', 'India', 'b', 320, 12, 48, 8, 7, 15, 280, 'veg', [['Oats', 60, 18], ['Mixed vegetables', 80, 20], ['Spices', 5, 5]]),
      R('Poha with Peanuts', 'India', 'b', 300, 8, 52, 7, 5, 20, 250, 'veg', [['Flattened rice', 70, 15], ['Peanuts', 20, 12], ['Onion', 40, 8]]),
      R('Egg Bhurji & Toast', 'India', 'b', 380, 22, 30, 18, 3, 15, 240, 'egg', [['Egg', 100, 24], ['Bread', 60, 15], ['Onion', 30, 6]]),
      R('Avocado Toast', 'USA', 'b', 350, 10, 38, 18, 9, 10, 220, 'vegan', [['Avocado', 80, 60], ['Sourdough', 70, 30]]),
      R('Idli & Sambar', 'India', 'b', 290, 11, 54, 4, 6, 25, 300, 'veg', [['Idli batter', 150, 25], ['Sambar', 120, 20]]),
      R('Moong Dal Chilla', 'India', 'b', 280, 16, 34, 8, 6, 20, 220, 'vegan', [['Moong dal', 80, 22], ['Vegetables', 50, 12]]),
      R('Besan Cheela', 'India', 'b', 300, 15, 32, 10, 6, 18, 220, 'veg', [['Gram flour', 70, 16], ['Tomato', 40, 8], ['Coriander', 10, 4]]),
      R('Vegetable Upma', 'India', 'b', 310, 8, 50, 9, 5, 18, 250, 'veg', [['Semolina', 70, 14], ['Vegetables', 70, 18], ['Cashew', 10, 12]]),
      R('Aloo Paratha & Curd', 'India', 'b', 420, 12, 58, 15, 6, 25, 300, 'veg', [['Wheat flour', 90, 15], ['Potato', 90, 12], ['Curd', 80, 12]]),
      R('Masala Dosa', 'India', 'b', 360, 9, 60, 10, 5, 25, 280, 'vegan', [['Dosa batter', 150, 25], ['Potato masala', 100, 15]]),
      R('Ragi Porridge', 'India', 'b', 270, 8, 50, 4, 8, 12, 260, 'vegan', [['Ragi flour', 50, 14], ['Jaggery', 15, 6], ['Almond milk', 150, 20]]),
      R('Chia Pudding & Berries', 'USA', 'b', 300, 9, 34, 14, 11, 10, 220, 'vegan', [['Chia seeds', 30, 30], ['Almond milk', 180, 24], ['Berries', 50, 25]]),
      R('Greek Yogurt Parfait', 'Greece', 'b', 320, 20, 38, 8, 4, 8, 250, 'veg', [['Greek yogurt', 150, 40], ['Granola', 40, 20], ['Fruit', 60, 15]]),
      R('Overnight Oats', 'USA', 'b', 330, 12, 50, 9, 8, 8, 250, 'veg', [['Rolled oats', 60, 18], ['Milk', 150, 12], ['Banana', 60, 8]]),
      R('Tofu Scramble', 'USA', 'b', 290, 20, 16, 16, 5, 15, 230, 'vegan', [['Tofu', 150, 40], ['Bell pepper', 50, 12], ['Turmeric', 3, 3]]),
      R('Shakshuka', 'Lebanon', 'b', 340, 18, 22, 20, 6, 22, 260, 'egg', [['Egg', 100, 24], ['Tomato', 150, 18], ['Bell pepper', 60, 14]]),
      R('Paneer Bhurji', 'India', 'b', 360, 22, 14, 24, 3, 15, 230, 'veg', [['Paneer', 120, 70], ['Onion tomato', 70, 14]]),
      R('Sabudana Khichdi', 'India', 'b', 340, 6, 58, 12, 3, 20, 250, 'jain', [['Sago', 90, 20], ['Peanuts', 25, 15], ['Potato', 50, 8]]),
      R('Congee & Greens', 'China', 'b', 260, 8, 48, 4, 4, 25, 300, 'vegan', [['Rice', 70, 12], ['Greens', 80, 16], ['Ginger', 8, 4]]),
      R('Peanut Butter Banana Toast', 'USA', 'b', 360, 12, 44, 16, 6, 8, 200, 'vegan', [['Whole-grain bread', 70, 20], ['Peanut butter', 30, 22], ['Banana', 60, 8]]),
      R('Rajgira Porridge', 'India', 'b', 280, 8, 46, 7, 6, 15, 240, 'jain', [['Amaranth', 50, 18], ['Milk', 150, 12], ['Jaggery', 12, 5]]),

      // ───────── Lunch (l) ─────────
      R('Rajma Chawal', 'India', 'l', 560, 20, 92, 10, 14, 35, 400, 'veg', [['Kidney beans', 120, 30], ['Rice', 150, 25], ['Onion tomato', 80, 15]]),
      R('Grilled Chicken Bowl', 'USA', 'l', 620, 45, 55, 20, 9, 30, 380, 'nonveg', [['Chicken breast', 150, 90], ['Quinoa', 120, 40], ['Greens', 80, 20]]),
      R('Paneer Butter Masala', 'India', 'l', 590, 24, 40, 34, 6, 30, 320, 'veg', [['Paneer', 120, 70], ['Tomato gravy', 120, 25], ['Cream', 20, 15]]),
      R('Kerala Fish Curry', 'India', 'l', 520, 38, 30, 24, 5, 25, 340, 'pesc', [['Fish', 150, 110], ['Coconut', 40, 18], ['Spices', 10, 8]]),
      R('Dal Tadka & Rice', 'India', 'l', 540, 19, 88, 11, 12, 30, 400, 'veg', [['Toor dal', 100, 22], ['Rice', 150, 25]]),
      R('Chole', 'India', 'l', 520, 18, 80, 14, 13, 30, 360, 'vegan', [['Chickpeas', 130, 28], ['Onion tomato', 80, 15]]),
      R('Vegetable Biryani', 'India', 'l', 560, 14, 90, 16, 10, 40, 400, 'veg', [['Basmati rice', 150, 28], ['Vegetables', 120, 25], ['Spices', 10, 8]]),
      R('Chicken Biryani', 'India', 'l', 650, 38, 78, 22, 6, 45, 420, 'nonveg', [['Basmati rice', 150, 28], ['Chicken', 150, 90], ['Spices', 12, 10]]),
      R('Curd Rice', 'India', 'l', 460, 14, 74, 10, 4, 20, 380, 'veg', [['Rice', 140, 24], ['Curd', 150, 22], ['Tempering', 10, 6]]),
      R('Sambar Rice', 'India', 'l', 500, 16, 86, 8, 12, 30, 400, 'vegan', [['Rice', 140, 24], ['Sambar', 160, 28]]),
      R('Baingan Bharta & Roti', 'India', 'l', 480, 13, 62, 18, 12, 30, 360, 'vegan', [['Brinjal', 160, 20], ['Roti', 90, 15], ['Onion tomato', 70, 12]]),
      R('Chana Masala Bowl', 'India', 'l', 520, 19, 78, 14, 14, 28, 360, 'vegan', [['Chickpeas', 140, 30], ['Onion tomato', 80, 14], ['Rice', 100, 18]]),
      R('Egg Curry & Rice', 'India', 'l', 560, 24, 70, 20, 6, 30, 380, 'egg', [['Egg', 100, 24], ['Onion tomato gravy', 120, 20], ['Rice', 130, 22]]),
      R('Prawn Masala & Rice', 'India', 'l', 540, 34, 62, 18, 5, 30, 360, 'pesc', [['Prawns', 130, 140], ['Rice', 130, 22], ['Spices', 10, 8]]),
      R('Penne Arrabbiata', 'Italy', 'l', 520, 15, 82, 14, 8, 25, 340, 'vegan', [['Penne', 120, 30], ['Tomato sauce', 130, 22], ['Olive oil', 12, 10]]),
      R('Pesto Pasta', 'Italy', 'l', 560, 17, 74, 22, 6, 20, 330, 'veg', [['Pasta', 120, 30], ['Basil pesto', 40, 35], ['Parmesan', 20, 25]]),
      R('Veg Fried Rice', 'China', 'l', 490, 12, 82, 12, 6, 20, 360, 'veg', [['Rice', 150, 25], ['Vegetables', 100, 20], ['Soy sauce', 10, 6]]),
      R('Chicken Hakka Noodles', 'China', 'l', 580, 30, 74, 18, 6, 25, 360, 'nonveg', [['Noodles', 120, 28], ['Chicken', 120, 72], ['Vegetables', 80, 16]]),
      R('Tofu Pad Thai', 'Thailand', 'l', 540, 20, 78, 16, 7, 25, 350, 'vegan', [['Rice noodles', 120, 30], ['Tofu', 100, 28], ['Peanuts', 20, 12]]),
      R('Falafel Wrap', 'Lebanon', 'l', 520, 18, 66, 20, 12, 20, 320, 'vegan', [['Falafel', 120, 30], ['Pita', 80, 18], ['Hummus', 40, 16]]),
      R('Burrito Bowl', 'Mexico', 'l', 580, 20, 84, 18, 15, 25, 400, 'veg', [['Rice', 120, 20], ['Black beans', 120, 24], ['Salsa & cheese', 80, 25]]),
      R('Sushi Bowl', 'Japan', 'l', 500, 26, 68, 12, 5, 25, 340, 'pesc', [['Sushi rice', 140, 26], ['Salmon', 90, 100], ['Edamame', 50, 18]]),
      R('Quinoa Buddha Bowl', 'USA', 'l', 520, 18, 68, 18, 12, 22, 380, 'vegan', [['Quinoa', 120, 40], ['Roasted veg', 120, 24], ['Tahini', 20, 14]]),
      R('Greek Salad & Pita', 'Greece', 'l', 460, 14, 48, 22, 8, 15, 340, 'veg', [['Feta & veg', 150, 40], ['Pita', 70, 16], ['Olive oil', 12, 10]]),
      R('Mutton Rogan Josh & Rice', 'India', 'l', 680, 40, 62, 30, 5, 50, 400, 'nonveg', [['Mutton', 150, 180], ['Rice', 130, 22], ['Spices', 12, 10]]),

      // ───────── Snacks (s) ─────────
      R('Sprout Chaat', 'India', 's', 180, 11, 26, 3, 8, 10, 150, 'veg', [['Sprouts', 120, 20], ['Onion', 30, 6]]),
      R('Mixed Nuts', 'USA', 's', 200, 6, 8, 17, 4, 5, 40, 'vegan', [['Almonds cashews', 40, 45]]),
      R('Fruit Bowl', 'USA', 's', 150, 2, 36, 1, 6, 5, 200, 'vegan', [['Seasonal fruit', 200, 40]]),
      R('Protein Shake', 'USA', 's', 220, 25, 18, 5, 2, 5, 300, 'veg', [['Whey', 30, 45], ['Milk', 250, 15]]),
      R('Roasted Makhana', 'India', 's', 160, 5, 28, 4, 3, 12, 60, 'jain', [['Makhana', 40, 30]]),
      R('Roasted Chana', 'India', 's', 190, 11, 28, 4, 9, 8, 50, 'vegan', [['Roasted chickpeas', 50, 18]]),
      R('Bhel Puri', 'India', 's', 200, 6, 38, 4, 5, 12, 150, 'vegan', [['Puffed rice', 60, 12], ['Sev & chutney', 40, 14], ['Onion tomato', 40, 8]]),
      R('Dhokla', 'India', 's', 170, 8, 26, 4, 4, 20, 140, 'vegan', [['Gram flour', 60, 14], ['Green chutney', 20, 8]]),
      R('Hummus & Veggie Sticks', 'Lebanon', 's', 210, 8, 22, 12, 7, 10, 160, 'vegan', [['Hummus', 60, 22], ['Carrot cucumber', 90, 14]]),
      R('Edamame', 'Japan', 's', 160, 14, 12, 6, 8, 8, 120, 'vegan', [['Edamame', 120, 30], ['Sea salt', 2, 2]]),
      R('Boiled Eggs', 'USA', 's', 160, 13, 2, 11, 0, 12, 100, 'egg', [['Egg', 100, 24], ['Pepper', 2, 2]]),
      R('Paneer Tikka', 'India', 's', 240, 18, 10, 15, 2, 20, 130, 'veg', [['Paneer', 100, 60], ['Spices & curd', 40, 12]]),
      R('Trail Mix', 'USA', 's', 210, 6, 20, 13, 4, 5, 45, 'vegan', [['Nuts & dried fruit', 45, 40]]),
      R('Apple & Almond Butter', 'USA', 's', 200, 5, 26, 10, 5, 5, 160, 'vegan', [['Apple', 120, 20], ['Almond butter', 20, 20]]),
      R('Masala Corn', 'India', 's', 170, 6, 32, 4, 6, 12, 150, 'veg', [['Sweet corn', 130, 20], ['Butter & spices', 12, 8]]),
      R('Greek Yogurt & Berries', 'Greece', 's', 190, 16, 22, 4, 3, 5, 180, 'veg', [['Greek yogurt', 130, 35], ['Berries', 50, 25]]),

      // ───────── Dinner (d) ─────────
      R('Roti & Mixed Veg', 'India', 'd', 450, 15, 62, 14, 11, 30, 340, 'veg', [['Wheat flour', 90, 15], ['Vegetables', 150, 30]]),
      R('Butter Chicken', 'India', 'd', 610, 42, 24, 38, 4, 30, 320, 'nonveg', [['Chicken', 150, 90], ['Tomato cream gravy', 120, 30]]),
      R('Tofu Stir-Fry', 'China', 'd', 420, 24, 40, 18, 8, 20, 320, 'vegan', [['Tofu', 150, 40], ['Vegetables', 120, 25]]),
      R('Grilled Salmon & Greens', 'USA', 'd', 520, 40, 18, 30, 6, 25, 300, 'pesc', [['Salmon', 150, 160], ['Greens', 100, 25]]),
      R('Moong Khichdi', 'India', 'd', 400, 16, 66, 8, 9, 25, 380, 'jain', [['Rice moong', 140, 28], ['Ghee', 10, 10]]),
      R('Palak Paneer & Roti', 'India', 'd', 520, 25, 44, 28, 9, 30, 340, 'veg', [['Spinach', 150, 20], ['Paneer', 100, 60], ['Roti', 60, 12]]),
      R('Dal Makhani & Rice', 'India', 'd', 580, 20, 76, 22, 12, 35, 380, 'veg', [['Black dal', 120, 30], ['Rice', 130, 22], ['Cream', 20, 15]]),
      R('Bhindi Masala & Roti', 'India', 'd', 440, 12, 58, 16, 10, 28, 340, 'vegan', [['Okra', 150, 24], ['Roti', 90, 15], ['Onion tomato', 60, 10]]),
      R('Chicken Curry & Roti', 'India', 'd', 580, 38, 46, 24, 7, 35, 360, 'nonveg', [['Chicken', 150, 90], ['Onion tomato gravy', 120, 20], ['Roti', 60, 12]]),
      R('Egg Curry & Roti', 'India', 'd', 520, 22, 54, 22, 7, 28, 340, 'egg', [['Egg', 100, 24], ['Gravy', 120, 20], ['Roti', 60, 12]]),
      R('Veg Manchurian & Rice', 'China', 'd', 540, 14, 84, 16, 8, 30, 360, 'veg', [['Veg balls', 130, 26], ['Fried rice', 150, 25], ['Sauce', 30, 10]]),
      R('Chicken Stir-Fry', 'China', 'd', 500, 36, 40, 20, 6, 22, 340, 'nonveg', [['Chicken', 150, 90], ['Vegetables', 120, 24], ['Soy garlic', 15, 8]]),
      R('Prawn Stir-Fry', 'China', 'd', 460, 32, 34, 18, 5, 22, 320, 'pesc', [['Prawns', 130, 140], ['Vegetables', 120, 24]]),
      R('Vegetable Lasagna', 'Italy', 'd', 560, 22, 60, 26, 8, 40, 360, 'veg', [['Pasta sheets', 100, 24], ['Veg & cheese', 150, 45], ['Tomato sauce', 100, 18]]),
      R('Minestrone & Bread', 'Italy', 'd', 420, 14, 62, 12, 12, 30, 380, 'vegan', [['Mixed vegetables', 180, 30], ['Beans', 60, 14], ['Bread', 60, 15]]),
      R('Thai Red Curry & Rice', 'Thailand', 'd', 560, 15, 74, 24, 8, 28, 380, 'veg', [['Coconut curry', 160, 30], ['Vegetables', 100, 20], ['Rice', 120, 20]]),
      R('Teriyaki Tofu Bowl', 'Japan', 'd', 480, 22, 62, 14, 7, 22, 360, 'vegan', [['Tofu', 130, 36], ['Rice', 130, 22], ['Teriyaki & veg', 80, 18]]),
      R('Chicken Souvlaki & Salad', 'Greece', 'd', 540, 40, 32, 26, 7, 30, 350, 'nonveg', [['Chicken', 150, 90], ['Salad', 120, 24], ['Tzatziki', 40, 16]]),
      R('Falafel Platter', 'Lebanon', 'd', 520, 18, 60, 22, 13, 25, 340, 'vegan', [['Falafel', 130, 32], ['Hummus', 50, 18], ['Salad', 100, 18]]),
      R('Chole Bhature', 'India', 'd', 640, 18, 88, 26, 12, 35, 360, 'veg', [['Chickpeas', 130, 28], ['Bhature', 120, 24]]),
      R('Stuffed Capsicum', 'India', 'd', 420, 14, 56, 15, 9, 30, 320, 'veg', [['Bell peppers', 160, 30], ['Paneer rice stuffing', 120, 35]]),
      R('Vegetable Khichdi', 'India', 'd', 420, 15, 66, 9, 10, 25, 380, 'jain', [['Rice moong', 140, 28], ['Vegetables', 80, 16], ['Ghee', 8, 8]]),
      R('Jain Paneer Curry & Roti', 'India', 'd', 520, 24, 46, 26, 7, 30, 340, 'jain', [['Paneer', 110, 65], ['Tomato gravy', 110, 22], ['Roti', 60, 12]]),
      R('Lauki Kofta & Rice', 'India', 'd', 500, 14, 66, 20, 8, 35, 360, 'veg', [['Bottle gourd', 150, 20], ['Gravy', 110, 22], ['Rice', 110, 18]]),
      R('Baked Beans on Toast', 'UK', 'd', 430, 18, 66, 10, 14, 12, 320, 'vegan', [['Baked beans', 200, 30], ['Whole-grain toast', 80, 20]]),
    ];
    const missing = seed.filter((s) => !existing.has(s.name));
    for (const r of missing) {
      await this.prisma.recipe.create({ data: r }).catch(() => undefined);
    }
    if (missing.length) this.logger.log(`Recipe library topped up: +${missing.length} (total ${existing.size + missing.length}).`);
  }

  /**
   * One-time bulk load of the full 12,976-recipe world database from a shipped
   * gzip into Postgres. Idempotent (skips once the table is large) and additive
   * (only inserts ids not already present), so it runs once and the data then
   * lives in SQL permanently. Bulk `createMany` in batches; runs in the
   * background so it never blocks app start.
   */
  private async ensureRecipeLibrary(): Promise<void> {
    try {
      const have = await this.prisma.recipe.count();
      if (have >= 5000) return; // already loaded

      const candidates = [
        join(__dirname, 'data', 'recipes.dataset.json.gz'),
        join(process.cwd(), 'dist', 'nutrition', 'data', 'recipes.dataset.json.gz'),
        join(process.cwd(), 'src', 'nutrition', 'data', 'recipes.dataset.json.gz'),
      ];
      const path = candidates.find((p) => existsSync(p));
      if (!path) { this.logger.warn('Recipe dataset file not found — skipping world-database load.'); return; }

      type DS = {
        id: string; no: number; name: string; country: string; slot: string; diet: string;
        kcal: number; protein: number; carbs: number; fat: number; fiber: number;
        minutes: number; gramsPerServing: number; steps: string[];
        ingredients: { name: string; grams: number; priceInr: number }[];
      };
      const data = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as DS[];

      const existingIds = new Set(
        (await this.prisma.recipe.findMany({ select: { id: true } })).map((r) => r.id),
      );
      const fresh = data.filter((r) => !existingIds.has(r.id));

      if (fresh.length) {
        this.logger.log(`Loading world recipe database: ${fresh.length} recipes → Postgres…`);
        // 1) recipes (no nested writes — fastest path). recipeNo cast for stale client.
        const RB = 500;
        for (let i = 0; i < fresh.length; i += RB) {
          const batch = fresh.slice(i, i + RB).map((r) => ({
            id: r.id, recipeNo: r.no, name: r.name, country: r.country, slot: r.slot, diet: r.diet,
            kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
            minutes: r.minutes, gramsPerServing: r.gramsPerServing,
            steps: JSON.stringify(r.steps ?? []),
          }));
          await this.prisma.recipe.createMany({ data: batch as never, skipDuplicates: true });
        }
        // 2) ingredients
        const ing = fresh.flatMap((r) => (r.ingredients ?? []).map((i) => ({
          recipeId: r.id, name: i.name, grams: i.grams, priceInr: i.priceInr,
        })));
        const IB = 2000;
        for (let i = 0; i < ing.length; i += IB) {
          await this.prisma.recipeIngredient.createMany({ data: ing.slice(i, i + IB), skipDuplicates: true });
        }
      }

      // 3) Back-fill: number + cleaned names for any dataset rows loaded before
      //    this change (recipeNo still NULL). One-time; idempotent afterwards.
      const nullRows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
        'SELECT id FROM "Recipe" WHERE "recipeNo" IS NULL',
      );
      const nullSet = new Set(nullRows.map((r) => r.id));
      const toSync = data.filter((r) => nullSet.has(r.id));
      if (toSync.length) {
        this.logger.log(`Back-filling numbers + names for ${toSync.length} recipes…`);
        const SB = 100;
        for (let i = 0; i < toSync.length; i += SB) {
          await Promise.allSettled(toSync.slice(i, i + SB).map((r) =>
            this.prisma.recipe.update({ where: { id: r.id }, data: { recipeNo: r.no, name: r.name } as never }),
          ));
        }
      }

      const total = await this.prisma.recipe.count();
      this.logger.log(`World recipe database ready: ${total} recipes in Postgres.`);
    } catch (e) {
      this.logger.warn(`World-database load failed (will retry next boot): ${(e as Error).message}`);
    }
  }
}
