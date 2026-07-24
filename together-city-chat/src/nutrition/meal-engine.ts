/**
 * Meal Planning Engine — structural model (Meal-Planning-Engine-Spec.md).
 *
 * The engine thinks like a clinical dietitian designing COMPLETE meals, not a
 * macro calculator. A day is five mandatory slots; each slot is a composite
 * Meal (a titled collection of real, categorised recipes); macros are computed
 * at the meal level; grocery derives only from the recipes actually in the plan.
 *
 * This module owns the vocabulary — slots, energy split, schedule, meal
 * categories, and the recipe→category mapping — that the composer, grocery,
 * variety and validation layers all consume.
 */

/** The five mandatory meal slots (Rule 1). Order is the eating order. */
export type SlotCode = 'b' | 'ms' | 'l' | 'es' | 'd';

export interface SlotDef {
  code: SlotCode;
  key: string;            // stable machine key
  label: string;          // display name
  /** Share of the day's energy (Rule 3). Sums to 1.0. */
  energy: number;
  /** Rough eating window (Rule 2), 24h HH:MM. */
  start: string;
  end: string;
  /** Meal categories a recipe may come from to appear in this slot (Rule 13). */
  categories: MealCategory[];
  /** How many component recipes a composed meal in this slot targets. */
  minComponents: number;
  maxComponents: number;
  /** Cuisine-preference bucket this slot reads (Rule 11). */
  cuisineBucket: CuisineBucket;
}

/** Energy guardrails (Rule 3): never >35% or <8% of the day to one meal. */
export const ENERGY_MAX = 0.35;
export const ENERGY_MIN = 0.08;

export const SLOTS: SlotDef[] = [
  { code: 'b',  key: 'breakfast',     label: 'Breakfast',      energy: 0.28, start: '07:00', end: '10:00', categories: ['breakfast', 'drink', 'salad'],                         minComponents: 1, maxComponents: 2, cuisineBucket: 'breakfast' },
  { code: 'l',  key: 'lunch',         label: 'Lunch',          energy: 0.32, start: '12:00', end: '14:00', categories: ['lunch', 'side', 'salad', 'soup', 'dessert', 'drink'], minComponents: 3, maxComponents: 6, cuisineBucket: 'lunch' },
  { code: 'es', key: 'evening_snack', label: 'Evening Snack',  energy: 0.12, start: '16:00', end: '18:00', categories: ['snack', 'drink', 'salad', 'soup'],                    minComponents: 1, maxComponents: 2, cuisineBucket: 'snack' },
  { code: 'd',  key: 'dinner',        label: 'Dinner',         energy: 0.28, start: '19:00', end: '21:00', categories: ['dinner', 'side', 'salad', 'soup', 'drink'],           minComponents: 3, maxComponents: 5, cuisineBucket: 'dinner' },
];

export const SLOT_ORDER: SlotCode[] = SLOTS.map((s) => s.code);
export const SLOT_BY_CODE: Record<SlotCode, SlotDef> = Object.fromEntries(SLOTS.map((s) => [s.code, s])) as Record<SlotCode, SlotDef>;

/** Energy fraction per slot (Rule 3), clamped to the guardrails. */
export const SLOT_ENERGY: Record<SlotCode, number> = Object.fromEntries(
  SLOTS.map((s) => [s.code, Math.min(ENERGY_MAX, Math.max(ENERGY_MIN, s.energy))]),
) as Record<SlotCode, number>;

/** The ten meal categories every recipe must map to (Rule 13). */
export type MealCategory =
  | 'breakfast' | 'snack' | 'lunch' | 'dinner'
  | 'dessert' | 'drink' | 'side' | 'condiment' | 'soup' | 'salad';

export const MEAL_CATEGORIES: MealCategory[] = [
  'breakfast', 'snack', 'lunch', 'dinner', 'dessert', 'drink', 'side', 'condiment', 'soup', 'salad',
];

/** Cuisine-preference buckets (Rule 11): each slot reads one. */
export type CuisineBucket = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const CUISINE_BUCKETS: CuisineBucket[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Foods that must never be a breakfast (Rule 4) — heavy lunch/dinner mains. */
const NOT_BREAKFAST = /dal makhani|rajma|butter chicken|biryani|pulao|korma|rogan|vindaloo|curry\b|masala\s+(gravy|curry)|kadai|handi|do pyaza|mutton|lamb|goat/i;
/** Positive breakfast signals (Rule 4 allowed examples). */
const BREAKFAST_HINT = /idli|dosa|poha|upma|paratha|thepla|oats|porridge|cereal|muesli|chilla|cheela|besan|smoothie|pancake|toast|omelet|omelette|egg|paneer bhurji|bhurji|uttapam|vada|dhokla|sandwich|granola|fruit bowl|stuffed roti|aloo paratha/i;
const SNACK_HINT = /\bsnack\b|nuts|seeds|roasted chana|sprouts|buttermilk|chaas|protein (shake|bar)|smoothie|lassi|boiled egg|corn|chaat|bhel|tikki|cutlet|fruit|makhana|trail mix|yogurt|curd cup/i;
const DESSERT_HINT = /halwa|kheer|barfi|barfee|ladoo|laddu|jalebi|gulab jamun|rasgulla|dessert|pudding|ice ?cream|cake|brownie|mousse|custard|sheera|payasam|sandesh/i;
const DRINK_HINT = /juice|smoothie|shake|lassi|buttermilk|chaas|\btea\b|coffee|milk\b|\bwater\b|lemonade|coconut water|kadha|drink/i;
const SOUP_HINT = /soup|shorba|rasam|broth|stew|dal soup/i;
const SALAD_HINT = /salad|kachumber|koshimbir|raita|slaw|sprout salad/i;
const SIDE_HINT = /roti|phulka|chapati|naan|paratha(?! stuffed)|rice\b|dal\b|lentil|sabzi|sabji|poriyal|thoran|bhaji|curd|raita|papad|pickle|chutney/i;
const CONDIMENT_HINT = /chutney|pickle|achaar|achar|dip|sauce|masala paste|podi|gunpowder/i;
/**
 * A recipe that IS a condiment/sauce/spread — the whole output is a topping, not a
 * dish. These must never be served as a meal or snack (a "Mayonnaise" or "Basil
 * Pesto" recipe is not lunch). Matched precisely — either the recipe name ENDS
 * with a standalone condiment noun (so "Butter Chicken"/"White Sauce Pasta" stay
 * real dishes) or contains a specific multi-word condiment — then excluded from the
 * meal pool entirely (role → null).
 */
const PURE_CONDIMENT = /(^|\s)(mayonnaise|mayo|aioli|ketchup|catsup|mustard|vinaigrette|pesto|salsa|tzatziki|guacamole|hummus|chutney|pickle|achaar|achar|relish|marmalade|preserves|compote|marinade|glaze|gravy|podi|gunpowder|furikake|dressing)$|\b(salad dressing|ranch dressing|italian dressing|caesar dressing|honey mustard|soy sauce|fish sauce|hot sauce|bbq sauce|barbecue sauce|tartar sauce|cocktail sauce|dipping sauce|curry paste|masala paste|spice rub|dry rub|dipping|\bdip\b|spice mix|spice blend|spice powder|masala mix|masala powder|curry powder|garam masala|chaat masala|sambar powder|rasam powder|biryani masala|seasoning)\b/i;
/** Plain staple carbs (rice/roti/bread/pasta on their own) — a side, never a
 *  stand-alone snack or meal (fixes "Microwave Rice" showing up as a snack). */
const STAPLE_CARB = /\b(rice|roti|chapati|phulka|naan|bread|toast|pasta|noodles?|macaroni|spaghetti|khichdi)\b/i;

export interface CategorizeInput {
  name: string;
  /** Legacy single-slot tag on the recipe ('b' | 'l' | 's' | 'd'). */
  slot?: string | null;
  minutes?: number | null;
  kcal?: number | null;
}

/**
 * Derive a recipe's meal categories (Rule 13) from its name + legacy slot tag.
 * A recipe can belong to several (e.g. a soup is also a valid snack). The legacy
 * b/l/s/d tag seeds the primary category; name keywords add the rest.
 */
export function categorizeRecipe(r: CategorizeInput): MealCategory[] {
  const name = (r.name ?? '').toLowerCase();
  const set = new Set<MealCategory>();

  // A pure condiment/sauce/spread is NEVER a meal or snack — mark it condiment-only
  // so roleFor() drops it from the meal pool (fixes mayonnaise/pesto/dressing being
  // served as a snack or main).
  if (PURE_CONDIMENT.test(name)) return ['condiment'];

  // Strong keyword signals first (they can override a mis-tagged legacy slot).
  if (DESSERT_HINT.test(name)) set.add('dessert');
  if (DRINK_HINT.test(name)) set.add('drink');
  if (SOUP_HINT.test(name)) set.add('soup');
  if (SALAD_HINT.test(name)) set.add('salad');
  if (CONDIMENT_HINT.test(name)) set.add('condiment');
  if (SIDE_HINT.test(name)) set.add('side');
  if (BREAKFAST_HINT.test(name)) set.add('breakfast');
  if (SNACK_HINT.test(name)) set.add('snack');

  // Legacy slot tag → base category, unless it contradicts a breakfast rule.
  switch (r.slot) {
    case 'b': set.add('breakfast'); break;
    case 's': set.add('snack'); break;
    case 'l': if (!set.has('breakfast')) set.add('lunch'); break;
    case 'd': if (!set.has('breakfast')) set.add('dinner'); break;
    default: break;
  }

  // A heavy main is a lunch/dinner even if the legacy tag was odd.
  if (NOT_BREAKFAST.test(name)) {
    set.delete('breakfast');
    if (!set.has('lunch') && !set.has('dinner')) { set.add('lunch'); set.add('dinner'); }
  }

  // A plain staple carb is a side, never a stand-alone snack (unless it's genuinely
  // a snack/breakfast food like poha/upma — those carry their own hint).
  if (set.has('snack') && STAPLE_CARB.test(name) && !SNACK_HINT.test(name) && !BREAKFAST_HINT.test(name)) {
    set.delete('snack');
    set.add('side');
  }

  // Light, quick items with no strong signal make reasonable snacks — but a bare
  // staple carb still falls through to a side, not a snack.
  if (set.size === 0) {
    if (STAPLE_CARB.test(name)) set.add('side');
    else if ((r.kcal ?? 999) <= 200 || (r.minutes ?? 99) <= 10) set.add('snack');
    else { set.add('lunch'); set.add('dinner'); }
  }
  return [...set];
}

/** May a recipe with these categories be used in this slot? (Rule 13) */
export function categoryFitsSlot(categories: MealCategory[], slot: SlotCode): boolean {
  const allowed = SLOT_BY_CODE[slot].categories;
  return categories.some((c) => allowed.includes(c));
}

/* ──────────────────── Meal timing & Intermittent Fasting ──────────────────── */

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (min: number): string => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Intermittent-fasting protocols (spec IF Rule 2). `slots` = which of the five
 *  standard slots stay active; the composer redistributes energy across them. */
export interface FastingProtocol {
  key: string; label: string; window: [string, string]; slots: SlotCode[];
}
export const FASTING_PROTOCOLS: Record<string, FastingProtocol> = {
  '12:12': { key: '12:12', label: '12:12', window: ['08:00', '20:00'], slots: ['b', 'l', 'es', 'd'] },
  '14:10': { key: '14:10', label: '14:10', window: ['10:00', '20:00'], slots: ['l', 'es', 'd'] },
  '16:8':  { key: '16:8',  label: '16:8',  window: ['12:00', '20:00'], slots: ['l', 'es', 'd'] },
  '18:6':  { key: '18:6',  label: '18:6',  window: ['13:00', '19:00'], slots: ['l', 'es', 'd'] },
  '20:4':  { key: '20:4',  label: '20:4',  window: ['14:00', '18:00'], slots: ['l', 'd'] },
  omad:    { key: 'omad',  label: 'OMAD (One Meal a Day)', window: ['13:00', '14:00'], slots: ['l'] },
};
export const DEFAULT_FASTING_PROTOCOL = '16:8';

export interface FastingPrefs {
  enabled?: boolean;
  protocol?: string;                 // key of FASTING_PROTOCOLS or 'custom'
  window?: { start: string; end: string };   // for custom
  mealTimes?: Partial<Record<string, string>>; // per-slot user overrides (slot key → HH:MM)
}

export interface ScheduledMeal {
  code: SlotCode;
  key: string;
  label: string;
  scheduledTime: string;   // HH:MM — core property of the meal (spec IF Rule 7)
  energy: number;          // share of day's kcal for this meal
}
export interface DaySchedule {
  fasting: boolean;
  protocol: string | null;
  window: { start: string; end: string };
  meals: ScheduledMeal[];
}

/** How many meals to keep for a custom eating window of `hours`. */
function customSlots(hours: number): SlotCode[] {
  if (hours <= 3) return ['l'];
  if (hours <= 5) return ['l', 'd'];
  if (hours <= 8) return ['l', 'es', 'd'];
  if (hours <= 11) return ['l', 'es', 'd'];
  return ['b', 'l', 'es', 'd'];
}

/**
 * Resolve the day's eating schedule BEFORE composing meals (spec IF principle):
 * standard = five slots at their default/edited times with the 25/10/30/10/25
 * split; fasting = only the slots inside the eating window, evenly timed, with
 * energy redistributed across them so the daily prescription is still met.
 */
export function resolveSchedule(prefs?: FastingPrefs): DaySchedule {
  const times = prefs?.mealTimes ?? {};
  const timeFor = (s: SlotDef, fallback: string) => times[s.key] || fallback;

  if (!prefs?.enabled) {
    // Standard: default time = midpoint of each slot window (user override wins).
    const meals: ScheduledMeal[] = SLOTS.map((s) => ({
      code: s.code, key: s.key, label: s.label,
      scheduledTime: timeFor(s, toHHMM(Math.round((toMin(s.start) + toMin(s.end)) / 2))),
      energy: SLOT_ENERGY[s.code],
    }));
    return { fasting: false, protocol: null, window: { start: '07:00', end: '21:00' }, meals };
  }

  // Fasting: determine window + active slots.
  let window: [string, string];
  let slots: SlotCode[];
  if (prefs.protocol === 'custom' && prefs.window) {
    window = [prefs.window.start, prefs.window.end];
    const hours = (toMin(window[1]) - toMin(window[0]) + 1440) % 1440 / 60 || 8;
    slots = customSlots(hours);
  } else {
    const p = FASTING_PROTOCOLS[prefs.protocol ?? DEFAULT_FASTING_PROTOCOL] ?? FASTING_PROTOCOLS[DEFAULT_FASTING_PROTOCOL];
    window = prefs.window ? [prefs.window.start, prefs.window.end] : p.window;
    slots = p.slots;
  }

  // Evenly space meal times across the eating window (first at start, last near end).
  const start = toMin(window[0]);
  const end = toMin(window[1]);
  const span = (end - start + 1440) % 1440 || 240;
  const n = slots.length;
  const activeDefs = slots.map((c) => SLOT_BY_CODE[c]);

  // Redistribute energy: keep each active slot's relative weight, normalise to 1.
  const rawSum = activeDefs.reduce((t, s) => t + s.energy, 0) || 1;

  const meals: ScheduledMeal[] = activeDefs.map((s, i) => {
    const at = n === 1 ? start + Math.round(span / 2) : start + Math.round((span * i) / (n - 1) - (i === n - 1 ? 20 : 0));
    return {
      code: s.code, key: s.key, label: s.label,
      scheduledTime: times[s.key] || toHHMM(at),
      energy: s.energy / rawSum,   // normalised — daily prescription preserved across the window
    };
  });

  return { fasting: true, protocol: prefs.protocol ?? DEFAULT_FASTING_PROTOCOL, window: { start: window[0], end: window[1] }, meals };
}

/** Conditions where IF needs a warning / clinician sign-off (spec IF Rule 6). */
export const IF_CONTRAINDICATIONS: Array<{ key: string; match: RegExp; level: 'warn' | 'block'; note: string }> = [
  { key: 'pregnancy', match: /pregnan|breastfeed|lactat/i, level: 'block', note: 'Intermittent fasting is not advised during pregnancy or breastfeeding.' },
  { key: 'minor', match: /child|adolescent|teen|under ?18/i, level: 'block', note: 'Intermittent fasting is not advised for children or adolescents.' },
  { key: 'eatingDisorder', match: /eating disorder|anorexia|bulimia|binge/i, level: 'block', note: 'Intermittent fasting is not advised with a history of eating disorders.' },
  { key: 'underweight', match: /frail|underweight|cachexia|malnourish/i, level: 'block', note: 'Intermittent fasting is not advised with frailty or severe underweight.' },
  { key: 't1d', match: /type ?1 diabetes|t1d|type i diabetes/i, level: 'block', note: 'Type 1 diabetes requires clinician guidance before fasting.' },
  { key: 'ckdAdvanced', match: /dialysis|stage ?[45]|advanced kidney|advanced renal/i, level: 'warn', note: 'Advanced kidney disease: discuss fasting with your nephrologist.' },
  { key: 'diabetesMeds', match: /diabetes|hba1c|insulin|metformin|sulfonylurea|glucose-lowering/i, level: 'warn', note: 'On glucose-lowering medication, fasting can affect blood sugar — discuss timing and monitoring with your healthcare provider.' },
];

/** Evaluate IF safety for a user's conditions/flags text. */
export function fastingSafety(conditionsText: string): { level: 'ok' | 'warn' | 'block'; notes: string[] } {
  const hay = conditionsText.toLowerCase();
  const hits = IF_CONTRAINDICATIONS.filter((c) => c.match.test(hay));
  if (!hits.length) return { level: 'ok', notes: [] };
  const level = hits.some((h) => h.level === 'block') ? 'block' : 'warn';
  return { level, notes: hits.map((h) => h.note) };
}
