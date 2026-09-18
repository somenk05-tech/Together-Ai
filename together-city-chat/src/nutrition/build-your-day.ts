/**
 * BUILD YOUR DAY — the closed loop behind Step 03 of the Private Nutritionist.
 *
 * Owner, 18 Sep: "the profile determines what is eligible, the day's food
 * determines what is still needed, and the remaining nutrition determines what
 * Together City recommends next."
 *
 * Everything in this file is pure. The service hands it the citizen's targets,
 * what is already on the day, the eligible recipe pool and the clock; it hands
 * back numbers and sentences. Nothing here reads a database or a profile, so
 * every rule below is testable with a literal.
 *
 * THREE WORDS, NOT ONE. A calorie figure is a BUDGET (an estimate you spend),
 * protein and fibre are TARGETS (a floor to reach), fat and carbohydrate are
 * RANGES (a band, because a day at 160% of its fat target is not balanced
 * however good the protein looks — and a day at 70% is not a failure). The UI
 * prints the word with the number, so "you must hit this exact figure" is never
 * implied by a figure that never meant it.
 */
import { SLOTS, SLOT_ORDER, type SlotCode } from './meal-engine';
import { scaleComponent, type MealComponentOut, type PoolRecipe } from './meal-composer';
import { isAllergenSafe } from '../shared/allergens';

/* ────────────────────────── reading the day ────────────────────────── */

export interface DayTargets { kcal: number; protein: number; carb: number; fat: number; fiber: number }
export interface Eaten { kcal: number; protein: number; carbs: number; fat: number; fiber: number }

export type NutrientKind = 'budget' | 'target' | 'range';
export type NutrientKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
export type NutrientStatus = 'under' | 'ok' | 'over';

export interface NutrientLine {
  key: NutrientKey;
  label: string;
  unit: 'kcal' | 'g';
  kind: NutrientKind;
  /** The word the UI prints beside the figure. */
  kindLabel: string;
  eaten: number;
  target: number;
  /** For a range: the band; for a budget/target: undefined. */
  low?: number;
  high?: number;
  /** Positive = still to eat, negative = already past it. */
  remaining: number;
  status: NutrientStatus;
  /** "43g remaining" · "290 kcal over" · "on target" — one phrase, ready to print. */
  said: string;
}

/** A range is ±15% of the prescribed figure. */
export const RANGE_PCT = 0.15;
/** Protein/fibre count as reached once 95% is on the plate — a 2 g shortfall
 *  against a 125 g target is not a gap worth a sentence. */
export const TARGET_TOLERANCE = 0.95;
/** A calorie budget is over once it is past by more than 3% — ten calories
 *  over a 2,000 kcal estimate is noise, not a finding. */
export const BUDGET_TOLERANCE = 1.03;

const KIND_LABEL: Record<NutrientKind, string> = {
  budget: 'Estimated daily energy budget',
  target: 'Daily target',
  range: 'Target range',
};

const fmt = (n: number) => Math.round(Math.abs(n)).toLocaleString('en-IN');

export function readDay(targets: DayTargets, eaten: Eaten): { lines: NutrientLine[]; remaining: Eaten } {
  const line = (key: NutrientKey, label: string, unit: 'kcal' | 'g', kind: NutrientKind, got: number, target: number): NutrientLine => {
    const remaining = Math.round((target - got) * 10) / 10;
    let status: NutrientStatus = 'ok';
    let low: number | undefined;
    let high: number | undefined;
    if (kind === 'budget') {
      status = got > target * BUDGET_TOLERANCE ? 'over' : got < target * 0.5 ? 'under' : 'ok';
    } else if (kind === 'target') {
      status = got >= target * TARGET_TOLERANCE ? 'ok' : 'under';
    } else {
      low = Math.round(target * (1 - RANGE_PCT));
      high = Math.round(target * (1 + RANGE_PCT));
      status = got > high ? 'over' : got < low ? 'under' : 'ok';
    }
    const u = unit === 'kcal' ? ' kcal' : 'g';
    const said = kind === 'budget'
      ? (status === 'over' ? `${fmt(remaining)}${u} over` : remaining <= 0 ? 'budget reached' : `${fmt(remaining)}${u} left`)
      : kind === 'target'
        ? (status === 'ok' ? 'target reached' : `${fmt(remaining)}${u} remaining`)
        : (status === 'over' ? `${fmt(got - (high as number))}${u} above your range`
          : status === 'under' ? `${fmt((low as number) - got)}${u} below your range` : 'in range');
    return { key, label, unit, kind, kindLabel: KIND_LABEL[kind], eaten: Math.round(got * 10) / 10, target, low, high, remaining, status, said };
  };
  const lines = [
    line('kcal', 'Calories', 'kcal', 'budget', eaten.kcal, targets.kcal),
    line('protein', 'Protein', 'g', 'target', eaten.protein, targets.protein),
    line('carbs', 'Carbohydrates', 'g', 'range', eaten.carbs, targets.carb),
    line('fat', 'Fat', 'g', 'range', eaten.fat, targets.fat),
    line('fiber', 'Fibre', 'g', 'target', eaten.fiber, targets.fiber),
  ];
  const remaining: Eaten = {
    kcal: Math.round(targets.kcal - eaten.kcal),
    protein: Math.round(targets.protein - eaten.protein),
    carbs: Math.round(targets.carb - eaten.carbs),
    fat: Math.round(targets.fat - eaten.fat),
    fiber: Math.round(targets.fiber - eaten.fiber),
  };
  return { lines, remaining };
}

/* ────────────────────────── which meal is next ────────────────────────── */

export interface NextSlot { slot: SlotCode; key: string; label: string; start: string; /** true when the day is today and this course's window has opened */ open: boolean }

const minuteOf = (hhmm: string | null | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/**
 * The course the next dish belongs to.
 *
 * For TODAY the clock decides: the first course whose window has not closed
 * and which has nothing on it yet — so at 7:30 pm with breakfast, lunch and a
 * snack eaten, the answer is dinner. For a day ahead there is no clock, so it
 * is simply the first empty course in order. A day with every course filled
 * keeps recommending dinner; a citizen who has eaten four courses and wants a
 * fifth is asking for more food, not for a fifth course.
 */
export function nextSlot(filled: readonly SlotCode[], nowHHMM: string | null): NextSlot {
  const has = new Set(filled);
  const now = minuteOf(nowHHMM);
  const defs = SLOT_ORDER.map((c) => SLOTS.find((s) => s.code === c)!);
  const shape = (s: typeof defs[number], open: boolean): NextSlot => ({ slot: s.code, key: s.key, label: s.label, start: s.start, open });
  if (now === null) {
    const empty = defs.find((s) => !has.has(s.code));
    return shape(empty ?? defs[defs.length - 1], false);
  }
  // Today: skip courses whose window has closed, then the first empty one.
  const stillOpen = defs.filter((s) => (minuteOf(s.end) ?? 0) + 60 >= now);
  const pick = stillOpen.find((s) => !has.has(s.code)) ?? stillOpen[0] ?? defs[defs.length - 1];
  return shape(pick, (minuteOf(pick.start) ?? 0) <= now);
}

/* ────────────────────────── what the next meal should do ────────────────────────── */

export type Priority = 'protein' | 'fibre' | 'lower-fat' | 'lower-carb' | 'light';

/**
 * What the next plate has to do, read off the gaps. Order matters: the first
 * priority is the sentence the page leads with.
 */
export function priorities(lines: readonly NutrientLine[]): Priority[] {
  const by = Object.fromEntries(lines.map((l) => [l.key, l])) as Record<NutrientKey, NutrientLine>;
  const out: Priority[] = [];
  if (by.protein.status === 'under' && by.protein.remaining >= Math.max(10, by.protein.target * 0.1)) out.push('protein');
  if (by.fiber.status === 'under' && by.fiber.remaining >= 5) out.push('fibre');
  if (by.fat.status === 'over') out.push('lower-fat');
  if (by.carbs.status === 'over') out.push('lower-carb');
  if (by.kcal.status === 'over' || by.kcal.remaining < by.kcal.target * 0.15) out.push('light');
  return out;
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  protein: 'Protein ↑', fibre: 'Fibre ↑', 'lower-fat': 'Lower fat', 'lower-carb': 'Lower carbohydrate', light: 'Light',
};

/* ────────────────────────── ranking the eligible pool ────────────────────────── */

export interface RankPrefs {
  /** Cuisines from the Food Preference Profile, canonical names. */
  cuisines: readonly string[];
  /** Chosen protein sources / meats. */
  favourites: readonly string[];
  maxMinutes?: number | null;
}

export interface RankCtx {
  remaining: Eaten;
  targets: DayTargets;
  priorities: readonly Priority[];
  slot: SlotCode;
  prefs: RankPrefs;
}

const SLOT_CATS = Object.fromEntries(SLOTS.map((s) => [s.code, s.categories])) as unknown as Record<SlotCode, readonly string[]>;

/** Does this recipe belong to the course being filled? */
export function fitsSlot(r: PoolRecipe, slot: SlotCode): boolean {
  return r.categories.some((c) => SLOT_CATS[slot].includes(c));
}

/**
 * The portion of a dish that fits what is left of the day.
 *
 * A database recipe is a standard serving. Somebody with 350 kcal left does
 * not need to be told that chicken tikka is 540 — they need the 145 g of it
 * that fits. Scaled between 40% and 100%: below 40% the plate stops being a
 * meal and the honest answer is "this does not fit today".
 */
export const PORTION_MIN = 40;
export function portionFor(r: PoolRecipe, remainingKcal: number): { pct: number; fits: boolean } {
  if (!(r.kcal > 0)) return { pct: 100, fits: true };
  if (remainingKcal <= 0) return { pct: PORTION_MIN, fits: false };
  const pct = Math.min(100, Math.floor((remainingKcal / r.kcal) * 100 / 5) * 5);
  return pct >= PORTION_MIN ? { pct, fits: true } : { pct: PORTION_MIN, fits: false };
}

/**
 * NUTRITION REQUIREMENT → RECIPE. The database is searched by what the day
 * still needs, not browsed by name.
 *
 * Positive for closing the protein and fibre gaps (as a share of what is
 * missing, so a 48 g dish against a 43 g gap scores full marks and a 12 g one
 * scores a quarter); negative for overshooting the calorie budget, or for
 * carrying fat or carbohydrate when the day is already over on it; a modest
 * bonus for a cuisine or protein the citizen chose, and for cooking time under
 * the limit they set. Every term is bounded so no single one can drown the
 * rest — a favourite cuisine never outranks a dish that actually fits.
 */
export function scoreForNow(r: PoolRecipe, ctx: RankCtx): number {
  const { remaining, priorities: pri, prefs } = ctx;
  const { pct } = portionFor(r, remaining.kcal);
  const f = pct / 100;
  const kcal = r.kcal * f, protein = r.protein * f, fiber = r.fiber * f, fat = r.fat * f, carbs = r.carbs * f;
  let s = 0;

  // Fit inside the budget: a dish that overruns what is left is penalised in
  // proportion; one that leaves a little room is ideal.
  if (remaining.kcal > 0) {
    const over = kcal - remaining.kcal;
    if (over > 0) s -= Math.min(3, over / 100);
    else s += Math.min(1, kcal / Math.max(1, remaining.kcal));      // uses the budget rather than leaving it
  } else {
    s -= Math.min(3, kcal / 150);                                     // already over: lighter is better
  }

  // Close the gaps.
  const protGap = Math.max(0, remaining.protein);
  const fibGap = Math.max(0, remaining.fiber);
  const wantProt = pri.includes('protein') ? 2.5 : 1;
  const wantFib = pri.includes('fibre') ? 2 : 0.6;
  s += wantProt * Math.min(1, protGap > 0 ? protein / protGap : protein / Math.max(1, ctx.targets.protein * 0.3));
  s += wantFib * Math.min(1, fibGap > 0 ? fiber / fibGap : fiber / Math.max(1, ctx.targets.fiber * 0.3));

  // Do not add to what is already over.
  if (pri.includes('lower-fat')) s -= Math.min(2, fat / 15);
  if (pri.includes('lower-carb')) s -= Math.min(2, carbs / 40);
  if (pri.includes('light')) s -= Math.min(2, kcal / 200);

  // Preference, bounded.
  const cu = (r.cuisine ?? '').toLowerCase();
  if (prefs.cuisines.some((c) => c.toLowerCase() === cu)) s += 0.6;
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  if (prefs.favourites.some((fv) => fv && hay.includes(fv.toLowerCase()))) s += 0.5;
  if (prefs.maxMinutes && r.minutes > prefs.maxMinutes) s -= 0.4;
  // The corpus carries a lot of near-empty rows; a dish with no protein and
  // no fibre is rarely the answer to any gap.
  if (protein < 3 && fiber < 2) s -= 0.5;
  return s;
}

export interface Recommendation {
  component: MealComponentOut;
  portionPct: number;
  fits: boolean;
  why: string;
  score: number;
}

/**
 * Why this plate. One sentence, built from the same numbers that ranked it,
 * so the reason can never say something the score did not.
 */
export function whyThis(c: MealComponentOut, ctx: RankCtx): string {
  const parts: string[] = [];
  const protGap = Math.max(0, ctx.remaining.protein);
  const fibGap = Math.max(0, ctx.remaining.fiber);
  if (ctx.priorities.includes('protein') && protGap > 0) {
    const share = c.protein / protGap;
    parts.push(share >= 0.9 ? 'closes your protein gap' : share >= 0.4 ? `covers ${Math.round(share * 100)}% of the protein you still need` : 'adds some protein');
  }
  if (ctx.priorities.includes('fibre') && fibGap > 0 && c.fiber >= 3) {
    parts.push(c.fiber / fibGap >= 0.6 ? 'brings the fibre up' : 'adds fibre');
  }
  if (ctx.priorities.includes('lower-fat') && c.fat <= 10) parts.push('keeps fat low');
  if (ctx.priorities.includes('lower-carb') && c.carbs <= 30) parts.push('keeps carbohydrate low');
  const inBudget = ctx.remaining.kcal > 0 && c.kcal <= ctx.remaining.kcal;
  const budget = inBudget ? 'stays inside what is left of your calorie budget' : ctx.remaining.kcal <= 0 ? 'is light, since the budget is already spent' : 'is scaled down to fit the calories you have left';
  if (!parts.length) return `This ${budget}.`;
  const said = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `This ${said} while it ${budget}.`;
}

export function recommend(pool: readonly PoolRecipe[], ctx: RankCtx, n = 3): Recommendation[] {
  const scored = pool
    .filter((r) => fitsSlot(r, ctx.slot))
    .map((r) => ({ r, score: scoreForNow(r, ctx) }))
    .sort((a, b) => b.score - a.score);
  const out: Recommendation[] = [];
  const seen = new Set<string>();
  for (const { r, score } of scored) {
    const key = r.name.toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    const { pct, fits } = portionFor(r, ctx.remaining.kcal);
    const component = scaleComponent(r, pct, r.role);
    out.push({ component, portionPct: pct, fits, why: whyThis(component, ctx), score });
    if (out.length >= n) break;
  }
  return out;
}

/* ────────────────────────── the advice ────────────────────────── */

export type DietKey = 'vegan' | 'vegetarian' | 'eggetarian' | 'nonveg';

export interface ProteinFix {
  name: string;
  /** "150 g" · "2 eggs" · "1 serving" */
  amount: string;
  grams: number;
  proteinG: number;
  kcal: number;
  kind: 'food' | 'supplement';
  /** Does this single fix close the whole gap? */
  closes: boolean;
}

interface FixSource {
  name: string; per100: { protein: number; kcal: number };
  unit?: { label: string; grams: number; max: number };   // countable (eggs, scoops)
  maxG: number; diets: readonly DietKey[]; kind: 'food' | 'supplement'; terms: readonly string[];
}

/**
 * Reference values per 100 g (USDA / IFCT, cooked where that is how it is
 * eaten). They are estimates and the UI prints them with ≈; nothing here is
 * a brand or a lab result.
 */
const FIX_SOURCES: readonly FixSource[] = [
  { name: 'Chicken breast', per100: { protein: 31, kcal: 165 }, maxG: 250, diets: ['nonveg'], kind: 'food', terms: ['chicken'] },
  { name: 'Fish', per100: { protein: 22, kcal: 150 }, maxG: 250, diets: ['nonveg'], kind: 'food', terms: ['fish', 'seafood'] },
  { name: 'Eggs', per100: { protein: 12.6, kcal: 143 }, unit: { label: 'egg', grams: 50, max: 4 }, maxG: 200, diets: ['eggetarian', 'nonveg'], kind: 'food', terms: ['egg'] },
  { name: 'Greek yogurt', per100: { protein: 10, kcal: 59 }, maxG: 300, diets: ['vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['yogurt', 'curd', 'dairy', 'milk'] },
  { name: 'Paneer', per100: { protein: 18, kcal: 265 }, maxG: 150, diets: ['vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['paneer', 'dairy', 'milk'] },
  { name: 'Tofu', per100: { protein: 17, kcal: 144 }, maxG: 250, diets: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['tofu', 'soy', 'soya'] },
  { name: 'Soya chunks (dry)', per100: { protein: 52, kcal: 345 }, maxG: 60, diets: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['soy', 'soya'] },
  { name: 'Cooked dal', per100: { protein: 9, kcal: 116 }, maxG: 300, diets: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['lentil', 'dal', 'legume'] },
  { name: 'Cooked chickpeas', per100: { protein: 9, kcal: 164 }, maxG: 250, diets: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'], kind: 'food', terms: ['chickpea', 'chana', 'legume'] },
  { name: 'Whey protein', per100: { protein: 80, kcal: 400 }, unit: { label: 'serving', grams: 30, max: 2 }, maxG: 60, diets: ['vegetarian', 'eggetarian', 'nonveg'], kind: 'supplement', terms: ['whey', 'dairy', 'milk'] },
  { name: 'Plant protein', per100: { protein: 70, kcal: 380 }, unit: { label: 'serving', grams: 30, max: 2 }, maxG: 60, diets: ['vegan'], kind: 'supplement', terms: ['pea protein', 'soy'] },
];

/** Above this many grams short, food alone is a big ask and a supplement is
 *  named as another option. Below it, food is the whole answer. */
export const SUPPLEMENT_THRESHOLD_G = 40;

/**
 * The quick fixes for a protein gap: real amounts of real food, each one
 * computed to close THIS gap, capped at a portion a person would eat.
 * Food first; the supplement row only appears when the gap is large, and it
 * is introduced as "another option", never as the answer.
 */
export function proteinFixes(gapG: number, diet: DietKey, excluded: readonly string[]): ProteinFix[] {
  if (!(gapG > 0)) return [];
  const out: ProteinFix[] = [];
  for (const src of FIX_SOURCES) {
    if (!src.diets.includes(diet)) continue;
    if (src.kind === 'supplement' && gapG < SUPPLEMENT_THRESHOLD_G) continue;
    if (excluded.length && !isAllergenSafe(src.name, src.terms, excluded)) continue;
    const needG = (gapG / src.per100.protein) * 100;
    let grams: number;
    let amount: string;
    if (src.unit) {
      const count = Math.min(src.unit.max, Math.max(1, Math.ceil(needG / src.unit.grams)));
      grams = count * src.unit.grams;
      amount = `${count} ${src.unit.label}${count === 1 ? '' : 's'}`;
    } else {
      grams = Math.min(src.maxG, Math.max(50, Math.ceil(needG / 10) * 10));
      amount = `${grams} g`;
    }
    const proteinG = Math.round((grams / 100) * src.per100.protein);
    const kcal = Math.round((grams / 100) * src.per100.kcal);
    out.push({ name: src.name, amount, grams, proteinG, kcal, kind: src.kind, closes: proteinG >= gapG });
  }
  // Foods that close the gap first, then by least energy for the protein.
  return out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'food' ? -1 : 1)
    || Number(b.closes) - Number(a.closes)
    || (a.kcal / Math.max(1, a.proteinG)) - (b.kcal / Math.max(1, b.proteinG)));
}

export type AdviceKind = 'over-budget' | 'protein' | 'fat' | 'carbs' | 'fibre' | 'done' | 'start';

export interface Advice {
  kind: AdviceKind;
  headline: string;
  body: string;
  /** Plain food options (over-budget, fibre). */
  options?: string[];
  fixes?: ProteinFix[];
  /** What the next-meal engine is prioritising, when this advice changes it. */
  priorities?: Priority[];
}

const LOW_ENERGY_OPTIONS: Record<DietKey, string[]> = {
  vegan: ['Steamed or raw vegetables', 'Clear vegetable soup', 'A large salad, dressing on the side', 'Cucumber, tomato or carrot sticks', 'A bowl of fruit'],
  vegetarian: ['Steamed or raw vegetables', 'Clear vegetable soup', 'A large salad, dressing on the side', 'Chaas (thin buttermilk)', 'A bowl of fruit'],
  eggetarian: ['Steamed or raw vegetables', 'Clear vegetable soup', 'A large salad, dressing on the side', 'Chaas (thin buttermilk)', 'Egg whites'],
  nonveg: ['Steamed or raw vegetables', 'Clear soup', 'A large salad, dressing on the side', 'Chaas (thin buttermilk)', 'Grilled chicken or fish, no oil'],
};
const FIBRE_OPTIONS = ['Vegetables — a plate of greens or a sabzi', 'Fruit — guava, pear, apple with the skin', 'Legumes — dal, rajma, chana', 'Whole grains — oats, brown rice, millet roti', 'Seeds — chia, flax'];

/**
 * The sentences under the numbers. Every one is derived from a line's status
 * and remaining figure; none is a score. The order is the order the page
 * shows them: what is over first (it changes the next meal), then the gaps.
 */
export function advise(lines: readonly NutrientLine[], opts: { diet: DietKey; excluded: readonly string[]; eatenAnything: boolean }): Advice[] {
  const by = Object.fromEntries(lines.map((l) => [l.key, l])) as Record<NutrientKey, NutrientLine>;
  const pri = priorities(lines);
  const out: Advice[] = [];

  if (!opts.eatenAnything) {
    return [{
      kind: 'start',
      headline: 'Nothing on the day yet.',
      body: 'Add what you eat — a recipe from the city, something you cooked, food from outside — and the numbers above start moving. The recommendations below are for your first meal.',
      priorities: pri,
    }];
  }

  if (by.kcal.status === 'over') {
    out.push({
      kind: 'over-budget',
      headline: `You're ${fmt(by.kcal.remaining)} kcal over your daily budget.`,
      body: 'You have already reached your estimated calorie budget for today. If you are still hungry, choose something low in calories and dense in nutrients rather than skipping the meal.',
      options: LOW_ENERGY_OPTIONS[opts.diet],
      priorities: pri,
    });
  }

  if (by.protein.status === 'under' && by.protein.remaining >= 5) {
    const gap = Math.round(by.protein.remaining);
    const fixes = proteinFixes(gap, opts.diet, opts.excluded);
    const foodCloses = fixes.some((f) => f.kind === 'food' && f.closes);
    out.push({
      kind: 'protein',
      headline: `You need approximately ${gap} g more protein today.`,
      body: foodCloses
        ? 'You can meet today\'s protein target with food — any one of these closes the gap.'
        : gap >= SUPPLEMENT_THRESHOLD_G
          ? 'That is a lot to close with one dish. Combine two of these, or a serving of protein powder is another option if it suits you.'
          : 'Combine two of these, or add a protein-rich dish at your next meal.',
      fixes,
      priorities: pri,
    });
  }

  if (by.fat.status === 'over') {
    out.push({
      kind: 'fat',
      headline: `Fat is ${fmt(by.fat.eaten - (by.fat.high as number))} g above your range.`,
      body: 'For your next meal we are prioritising protein and fibre and keeping fat low — the recipes below are chosen that way.',
      priorities: pri,
    });
  }
  if (by.carbs.status === 'over') {
    out.push({
      kind: 'carbs',
      headline: `Carbohydrate is ${fmt(by.carbs.eaten - (by.carbs.high as number))} g above your range.`,
      body: 'For your next meal we are leaning on protein and vegetables rather than rice, bread or sweets.',
      priorities: pri,
    });
  }
  if (by.fiber.status === 'under' && by.fiber.remaining >= 5) {
    out.push({
      kind: 'fibre',
      headline: `You're ${fmt(by.fiber.remaining)} g short on fibre.`,
      body: 'Add any of these, or pick a recipe below — they are ranked so the ones that bring fibre up come first.',
      options: FIBRE_OPTIONS,
      priorities: pri,
    });
  }

  if (!out.length) {
    out.push({
      kind: 'done',
      headline: 'The day lands where it should.',
      body: 'Calories inside the budget, protein and fibre reached, fat and carbohydrate in range. Anything more is appetite, not need — keep it light.',
      priorities: pri,
    });
  }
  return out;
}

/* ────────────────────────── one line for "what to do next" ────────────────────────── */

export function whatToDoNext(pri: readonly Priority[]): string {
  if (!pri.length) return 'Nothing to correct — eat to appetite and keep it balanced.';
  const up = pri.filter((p) => p === 'protein' || p === 'fibre').map((p) => (p === 'protein' ? 'protein' : 'fibre'));
  const down = pri.filter((p) => p === 'lower-fat' || p === 'lower-carb').map((p) => (p === 'lower-fat' ? 'fat' : 'carbohydrate'));
  const parts: string[] = [];
  if (up.length) parts.push(`prioritise ${up.join(' + ')}`);
  if (down.length) parts.push(`keep ${down.join(' and ')} low`);
  if (pri.includes('light')) parts.push('keep it light');
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}
