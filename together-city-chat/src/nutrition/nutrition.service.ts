import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
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
import { estimateDayMicros, type DayMealForMicros } from './micros-engine';

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

// ─────────── real calendar dates (spec §20) ───────────
/** The Monday (local) of the week containing `anchor`. Meal plans run Mon→Sun. */
function weekMonday(anchor: Date): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  return d;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
const isoDate = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** ISO-8601 week number (1..53) — matches "Week 30" style labels. */
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3); // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const firstDay = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - firstDay + 3);
  return 1 + Math.round((t.getTime() - firstThu.getTime()) / (7 * 24 * 3600 * 1000));
}
/** "20–26 Jul 2026" (or across months/years) for a week's Mon→Sun span. */
function weekRangeLabel(mon: Date, sun: Date): string {
  const sameMonth = mon.getMonth() === sun.getMonth() && mon.getFullYear() === sun.getFullYear();
  if (sameMonth) return `${mon.getDate()}–${sun.getDate()} ${MONTHS[mon.getMonth()]} ${mon.getFullYear()}`;
  const sameYear = mon.getFullYear() === sun.getFullYear();
  const left = `${mon.getDate()} ${MONTHS[mon.getMonth()]}${sameYear ? '' : ' ' + mon.getFullYear()}`;
  return `${left} – ${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`;
}

// ─────────── smart grocery: shelf-life buckets + human units (Grocery spec) ───────────
type ShelfBucket = 'pantry' | 'weekly' | 'daily';
// Strong pantry signals first (an "oil"/"powder"/"sauce" is pantry even if its
// base word — coconut, fish — reads perishable). Then highly-perishable (buy
// same/next day). Everything else fresh is the weekly bucket.
const PANTRY_KW = ['rice', 'atta', 'flour', 'maida', 'besan', 'rava', 'semolina', 'suji', 'poha', 'oat', 'dal', 'daal', 'lentil', 'rajma', 'chickpea', 'chana', 'chole', 'lobia', 'kidney bean', 'pasta', 'noodle', 'macaroni', 'vermicelli', 'oil', 'ghee', 'salt', 'sugar', 'jaggery', 'honey', 'turmeric', 'masala', 'powder', 'cumin', 'jeera', 'coriander powder', 'garam', 'cinnamon', 'cardamom', 'clove', 'bay leaf', 'peppercorn', 'black pepper', 'mustard seed', 'fenugreek seed', 'asafoetida', 'hing', 'tea', 'coffee', 'cocoa', 'almond', 'cashew', 'walnut', 'pistachio', 'raisin', 'dry fruit', 'seed', 'canned', 'tinned', 'protein powder', 'peanut butter', 'sauce', 'ketchup', 'vinegar', 'soy', 'stock cube', 'baking', 'cornflour', 'cornstarch', 'starch', 'papad', 'pickle', 'sabudana', 'jam', 'syrup', 'coconut milk', 'coconut powder', 'dried', 'wheat'];
const DAILY_KW = ['coriander', 'cilantro', 'mint', 'curry leaf', 'curry leaves', 'mushroom', 'prawn', 'shrimp', 'seafood', 'fish', 'salmon', 'pomfret', 'mackerel', 'sardine', 'crab', 'squid', 'berry', 'strawberr', 'raspberr', 'blueberr', 'microgreen', 'sprout', 'avocado', 'fresh bread', 'fresh coconut', 'grated coconut', 'basil', 'lettuce', 'arugula', 'rocket', 'spring onion', 'scallion'];
export function classifyShelf(name: string): ShelfBucket {
  const n = name.toLowerCase();
  if (PANTRY_KW.some((k) => n.includes(k))) return 'pantry';
  if (DAILY_KW.some((k) => n.includes(k))) return 'daily';
  return 'weekly';
}

// Ingredients counted as whole pieces, with an approx grams-per-piece so exact
// gram totals convert to a shopper-friendly count.
const PIECE_G: Array<[string, number, string]> = [
  ['egg', 50, ''], ['onion', 100, 'medium'], ['tomato', 80, 'medium'], ['potato', 120, 'medium'],
  ['lemon', 60, ''], ['lime', 50, ''], ['banana', 120, ''], ['apple', 150, ''], ['orange', 130, ''],
  ['cucumber', 200, ''], ['capsicum', 120, ''], ['bell pepper', 120, ''], ['green chilli', 5, ''], ['green chili', 5, ''],
  ['chilli', 5, ''], ['chili', 5, ''], ['coconut', 400, ''], ['avocado', 170, ''], ['bread', 400, 'loaf'], ['mango', 200, ''],
];
const BUNCH_KW = ['coriander', 'cilantro', 'mint', 'curry leaf', 'curry leaves', 'spinach', 'fenugreek', 'methi', 'dill', 'spring onion', 'microgreen', 'lettuce'];
const VOLUME_KW = ['milk', 'oil', 'ghee', 'water', 'vinegar', 'soy sauce', 'cream', 'juice', 'stock', 'buttermilk'];

/** Turn an exact gram total into a human-readable amount + unit class. */
export function formatGroceryQty(name: string, grams: number): { qtyLabel: string; unit: string; qty: number } {
  const n = name.toLowerCase();
  const g = Math.max(1, Math.round(grams));
  // Pieces (count) — but "onion powder"/"tomato sauce" etc. are pantry weights, not pieces.
  if (!PANTRY_KW.some((k) => n.includes(k))) {
    const piece = PIECE_G.find(([kw]) => n.includes(kw));
    if (piece) {
      const [, per, desc] = piece;
      const count = Math.max(1, Math.round(g / per));
      return { qtyLabel: desc ? `${count} ${desc}` : `${count}`, unit: 'pc', qty: count };
    }
    if (BUNCH_KW.some((k) => n.includes(k))) {
      const count = Math.max(1, Math.round(g / 100));
      return { qtyLabel: `${count} bunch${count > 1 ? 'es' : ''}`, unit: 'bunch', qty: count };
    }
  }
  if (VOLUME_KW.some((k) => n.includes(k))) {
    if (g >= 1000) { const l = g / 1000; return { qtyLabel: `${Number.isInteger(l) ? l : l.toFixed(1)} L`, unit: 'l', qty: Math.round(l) }; }
    return { qtyLabel: `${g} ml`, unit: 'ml', qty: g };
  }
  if (g >= 1000) { const kg = g / 1000; return { qtyLabel: `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`, unit: 'kg', qty: Math.round(kg) }; }
  return { qtyLabel: `${g} g`, unit: 'g', qty: g };
}

// ─────────── supermarket grocery: filter, normalise, aisle, units (redesign) ───────────
// Cooking-only / non-purchased items never shown on the shopping list.
const GROCERY_SKIP = /\b(water|ice|salt|cooking spray|non[- ]?stick spray|as needed|as required)\b|to taste|for greasing|for garnish|to garnish|\bgarnish\b|\boptional\b|pinch of/i;
export function skipGroceryIngredient(name: string): boolean {
  const n = (name || '').toLowerCase();
  if (!n.trim()) return true;
  // keep "salted butter" etc. — only skip when salt/water is the item itself
  if (/\bsalt\b/.test(n) && !/\b(salted|salt[- ]?free)\b/.test(n) && /^\s*(sea\s+|rock\s+|table\s+|black\s+|pink\s+|kosher\s+)?salt\b/.test(n)) return true;
  return GROCERY_SKIP.test(n) && !/\bsalted\b/.test(n);
}

// Prep descriptors stripped when deriving the canonical shopping item (identity
// qualifiers like "kidney", "olive", "greek", colours on chillies are KEPT).
const PREP_WORDS = /\b(chopped|diced|minced|sliced|finely|roughly|grated|shredded|crushed|peeled|halved|cubed|julienned|fresh|frozen|cooked|raw|ripe|large|small|medium|boneless|skinless|whole|organic|washed|trimmed|cleaned|deveined|beaten|softened|melted|warm|cold|hot|room temperature)\b/gi;
const INGREDIENT_SYNONYM: Record<string, string> = {
  matoes: 'Tomatoes', tomato: 'Tomatoes', tomatoes: 'Tomatoes', cilantro: 'Coriander',
  'chicken breast': 'Chicken', 'chicken fillet': 'Chicken', 'chicken thigh': 'Chicken', 'chicken thighs': 'Chicken', chicken: 'Chicken',
  curd: 'Yogurt', dahi: 'Yogurt', 'natural yogurt': 'Yogurt', 'greek yogurt': 'Yogurt', yoghurt: 'Yogurt', yogurt: 'Yogurt',
  'bell pepper': 'Capsicum', capsicum: 'Capsicum', 'spring onion': 'Spring Onion', scallion: 'Spring Onion',
  brinjal: 'Eggplant', aubergine: 'Eggplant', eggplant: 'Eggplant', shrimp: 'Prawns', prawn: 'Prawns', prawns: 'Prawns',
  scallions: 'Spring Onion', coriander: 'Coriander',
};
export function canonicalIngredient(name: string): string {
  let s = (name || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/,.*$/, ' ').trim(); // drop parens + trailing ", chopped"
  s = s.replace(/^matoes\b/, 'tomatoes');
  s = s.replace(PREP_WORDS, ' ').replace(/\s{2,}/g, ' ').trim();
  if (!s) return '';
  if (INGREDIENT_SYNONYM[s]) return INGREDIENT_SYNONYM[s];
  // synonym on first meaningful token phrase
  for (const [k, v] of Object.entries(INGREDIENT_SYNONYM)) if (s === k) return v;
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Supermarket aisles (in shopping order).
const GROCERY_AISLES: Array<{ key: string; icon: string; title: string; note: string }> = [
  { key: 'produce', icon: '🥬', title: 'Fresh Produce', note: 'vegetables & fresh herbs' },
  { key: 'fruit', icon: '🍎', title: 'Fruits', note: 'fresh fruit' },
  { key: 'meat', icon: '🥩', title: 'Meat & Seafood', note: 'buy fresh, keep cold' },
  { key: 'dairy', icon: '🥚', title: 'Dairy & Eggs', note: 'chilled' },
  { key: 'spices', icon: '🌶', title: 'Herbs & Spices', note: 'store cupboard' },
  { key: 'oils', icon: '🫒', title: 'Oils & Condiments', note: 'pantry' },
  { key: 'nuts', icon: '🥜', title: 'Nuts & Seeds', note: 'airtight' },
  { key: 'pantry', icon: '🌾', title: 'Pantry & Grains', note: 'long shelf life' },
];
const SHELF_INFO: Record<string, { life: string; tip: string }> = {
  produce: { life: '3–5 days', tip: 'Fridge crisper; keep herbs in a glass of water' },
  fruit: { life: '3–7 days', tip: 'Counter to ripen, then fridge' },
  meat: { life: '1–2 days', tip: 'Coldest shelf or freeze on the day' },
  dairy: { life: '1–2 weeks', tip: 'Fridge, back shelf (coldest)' },
  spices: { life: '1–2 years', tip: 'Airtight jar, away from heat' },
  oils: { life: 'Months', tip: 'Cool dark cupboard' },
  nuts: { life: 'Months', tip: 'Airtight; fridge for longer' },
  pantry: { life: 'Months', tip: 'Cool dry shelf' },
};
const AISLE_KW: Array<[string, RegExp]> = [
  ['meat', /\b(chicken|mutton|lamb|goat|beef|steak|pork|bacon|ham|sausage|fish|salmon|tuna|prawn|shrimp|crab|squid|seafood|mince|keema)\b/],
  ['dairy', /\b(milk|curd|yogurt|yoghurt|paneer|cheese|cheddar|mozzarella|butter|cream|ghee|egg|khoya|buttermilk|lassi)\b/],
  ['spices', /\b(turmeric|chilli powder|chili powder|red chilli|cumin|coriander powder|garam masala|masala|pepper|cinnamon|cardamom|clove|bay leaf|nutmeg|paprika|oregano|thyme|basil dried|asafoetida|hing|fenugreek seed|mustard seed|spice|seasoning)\b/],
  ['oils', /\b(oil|vinegar|soy sauce|sauce|ketchup|mayonnaise|peanut butter|honey|syrup|paste|stock|broth)\b/],
  ['nuts', /\b(almond|walnut|cashew|pistachio|peanut|hazelnut|pecan|chia|flax|sesame|pumpkin seed|sunflower seed|seeds?)\b/],
  ['fruit', /\b(banana|apple|orange|grape|berry|strawberr|blueberr|mango|avocado|pineapple|papaya|watermelon|pomegranate|kiwi|pear|peach|plum|lemon|lime)\b/],
  ['produce', /\b(tomato|onion|potato|carrot|spinach|garlic|ginger|chilli|chili|capsicum|cabbage|cauliflower|beans|peas|cucumber|lettuce|broccoli|mushroom|coriander|mint|curry leaf|parsley|celery|beet|radish|pumpkin|gourd|okra|brinjal|eggplant|spring onion|leek|zucchini|kale|greens?|herb)\b/],
  ['pantry', /\b(rice|atta|flour|maida|besan|rava|semolina|oat|dal|daal|lentil|rajma|kidney bean|chickpea|chana|pasta|noodle|macaroni|sugar|jaggery|poha|quinoa|millet|bread|canned|tofu|tempeh|cornflour|baking)\b/],
];
export function groceryAisle(name: string): string {
  const n = name.toLowerCase();
  // Match against the name and a de-pluralised form so canonical plurals
  // ("tomatoes", "prawns", "almonds") land in the right aisle.
  const singular = n.replace(/\bies\b/g, 'y').replace(/([a-z]{3,})es\b/g, '$1').replace(/([a-z]{3,})s\b/g, '$1');
  const forms = singular === n ? [n] : [n, singular];
  const hit = (re: RegExp) => forms.some((f) => re.test(f));
  // Coriander/mint powder → spices; fresh → produce (handled by 'powder' check).
  if (hit(/\bpowder\b|\bseeds?\b/) && hit(/\b(coriander|cumin|chilli|chili|pepper|fennel|mustard)\b/)) return 'spices';
  for (const [aisle, re] of AISLE_KW) if (hit(re)) return aisle;
  return 'pantry';
}
// Standardised shopping unit per canonical item / aisle.
const PIECE_ITEMS: Array<[RegExp, number, string]> = [
  [/\begg\b/, 50, ''], [/\bbanana\b/, 120, ''], [/\bapple\b/, 150, ''], [/\borange\b/, 130, ''],
  [/\blemon\b/, 60, ''], [/\blime\b/, 50, ''], [/\bavocado\b/, 170, ''], [/\bcucumber\b/, 200, ''],
  [/\bmango\b/, 200, ''], [/\bbread\b|\bloaf\b/, 400, 'loaf'],
];
const BULB_ITEMS = /\bgarlic\b/;
const BUNCH_ITEMS = /\b(coriander|cilantro|mint|curry leaf|parsley|dill|fenugreek|spring onion|microgreen)\b/;
const VOLUME_ITEMS = /\b(milk|oil|ghee|vinegar|soy sauce|juice|stock|broth|cream|buttermilk|water)\b/;
export function standardQty(name: string, grams: number, aisle: string): { label: string; unit: string } {
  const n = name.toLowerCase(); const g = Math.max(1, Math.round(grams));
  if (aisle !== 'oils' && aisle !== 'pantry') {
    const pc = PIECE_ITEMS.find(([re]) => re.test(n));
    if (pc) { const c = Math.max(1, Math.round(g / pc[1])); return { label: pc[2] ? `${c} ${pc[2]}${c > 1 ? 's' : ''}` : `${c}`, unit: 'pc' }; }
    if (BULB_ITEMS.test(n)) { const c = Math.max(1, Math.round(g / 50)); return { label: `${c} bulb${c > 1 ? 's' : ''}`, unit: 'bulb' }; }
    if (BUNCH_ITEMS.test(n)) { const c = Math.max(1, Math.round(g / 100)); return { label: `${c} bunch${c > 1 ? 'es' : ''}`, unit: 'bunch' }; }
  }
  if (VOLUME_ITEMS.test(n)) {
    if (g >= 1000) { const l = g / 1000; return { label: `${Number.isInteger(l) ? l : l.toFixed(1)} litre${l > 1 ? 's' : ''}`, unit: 'l' }; }
    return { label: `${g} ml`, unit: 'ml' };
  }
  if (g >= 1000) { const kg = g / 1000; return { label: `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`, unit: 'kg' }; }
  return { label: `${g} g`, unit: 'g' };
}

// Shopping-pack optimisation — round the exact required amount up to a practical
// retail pack (spec: Shopping Pack Optimisation). Returns the friendly label AND
// the rounded grams so waste can be measured.
const PACK_RULES: Array<{ re: RegExp; size: number; label: (n: number) => string }> = [
  { re: /paneer|tofu/, size: 400, label: (n) => (n === 1 ? '1 × 400 g pack' : `${n} × 400 g packs`) },
  { re: /\bmilk\b|buttermilk/, size: 1000, label: (n) => (n === 1 ? '1 L' : `${n} × 1 L`) },
  { re: /yogurt|yoghurt|\bcurd\b|\bdahi\b/, size: 1000, label: (n) => (n === 1 ? '1 kg tub' : `${n} × 1 kg tubs`) },
];
export function recommendedPack(name: string, grams: number, aisle: string): { label: string; grams: number } {
  const n = (name || '').toLowerCase();
  const g = Math.max(1, Math.round(grams));
  const rule = PACK_RULES.find((r) => r.re.test(n));
  if (rule) { const c = Math.max(1, Math.ceil(g / rule.size)); return { label: rule.label(c), grams: c * rule.size }; }
  // Discrete items (eggs, lemons, garlic, herbs) are already whole — no pack rounding.
  const q = standardQty(name, g, aisle);
  if (q.unit === 'pc' || q.unit === 'bunch' || q.unit === 'bulb') return { label: q.label, grams: g };
  if (q.unit === 'ml' || q.unit === 'l') {
    if (g >= 1000) { const L = Math.ceil(g / 500) / 2; return { label: `${Number.isInteger(L) ? L : L.toFixed(1)} L`, grams: L * 1000 }; }
    const ml = Math.ceil(g / 100) * 100; return { label: `${ml} ml`, grams: ml };
  }
  if (g >= 1000) { const kg = Math.ceil(g / 500) / 2; return { label: `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`, grams: kg * 1000 }; }
  const gg = Math.ceil(g / 100) * 100; return { label: `${gg} g`, grams: gg };
}
// Rough ₹ per kg / litre by aisle — for an at-a-glance grocery estimate only.
const COST_PER_KG: Record<string, number> = { produce: 60, fruit: 120, meat: 320, dairy: 90, spices: 800, oils: 200, nuts: 900, pantry: 90 };

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
  householdSharing?: Partial<HouseholdSharing>;
}
/** Parse a JSON string column, returning a fallback on null/invalid. */
function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function parseExtras(extras: string | null | undefined): PrefExtras {
  try { return extras ? (JSON.parse(extras) as PrefExtras) : {}; } catch { return {}; }
}
function terms(s?: string): string[] {
  return (s ?? '').split(/[,;]/).map((t) => t.trim().toLowerCase()).filter(Boolean);
}
type RecipeWithIng = { id: string; slot: string; diet: string; name: string; country: string; minutes: number; kcal?: number; gramsPerServing?: number; servings?: number; ingredients: Array<{ name: string; priceInr?: number }> };

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
// Protein token → human display name (for family substitution labels).
const PROTEIN_LABEL_DISPLAY: Record<string, string> = {
  chicken: 'Chicken', mutton: 'Mutton', fish: 'Fish', prawns: 'Prawns', beef: 'Beef',
  pork: 'Pork', egg: 'Egg', paneer: 'Paneer', tofu: 'Tofu', legumes: 'Dal',
};
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

// ── Carbohydrate base + cooking method detection (weekly variety, §variety) ──
// Same name+ingredient scan as proteins, used to rotate the staple carbohydrate
// and the cooking style across the 7 days so the week doesn't become "rice +
// curry every day". Heuristic and best-effort — a miss just returns 'other'/
// 'mixed', which the picker treats as a neutral bucket.
const CARB_PATTERNS: Record<string, RegExp> = {
  rice: /\b(rice|biryani|pulao|pilaf|risotto|jeera rice|khichdi|congee|sushi)\b/i,
  wheat: /\b(roti|chapati|chapathi|phulka|naan|paratha|paratha|bread|toast|wrap|tortilla|pita|bun|bagel|kulcha|bhatura|puri)\b/i,
  oats: /\b(oat|oatmeal|porridge|muesli|granola|overnight oats)\b/i,
  millet: /\b(millet|ragi|bajra|jowar|quinoa|barley|buckwheat|amaranth)\b/i,
  potato: /\b(potato|aloo|sweet potato|yam|mash)\b/i,
  pasta: /\b(pasta|noodle|spaghetti|macaroni|penne|lasagne|lasagna|vermicelli|ramen|hakka)\b/i,
  corn: /\b(corn|maize|polenta|couscous|tortilla chips|nachos)\b/i,
  legumeCarb: /\b(dal|daal|lentil|chickpea|chana|besan|poha|idli|dosa|upma|dhokla|sabudana|rajma)\b/i,
};
export function detectCarb(r: RecipeWithIng): string {
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  for (const [k, re] of Object.entries(CARB_PATTERNS)) if (re.test(hay)) return k;
  return 'other';
}
const METHOD_PATTERNS: Record<string, RegExp> = {
  grilled: /\b(grill|grilled|tandoori|barbecue|bbq|char|skewer|kebab|seekh)\b/i,
  baked: /\b(bake|baked|roast|roasted|gratin|casserole)\b/i,
  steamed: /\b(steam|steamed|idli|dhokla|momo|dumpling|poach|poached)\b/i,
  fried: /\b(fry|fried|stir-fry|stir fry|saute|sauté|pan-fried|tikki|pakora|fritter|cutlet|tempura|crispy)\b/i,
  curry: /\b(curry|masala|gravy|korma|makhani|kadai|butter|qorma|rogan|kofta|sabzi|bhaji)\b/i,
  soup: /\b(soup|broth|stew|rasam|shorba|chowder|bisque)\b/i,
  salad: /\b(salad|slaw|kachumber|tabbouleh|caprese)\b/i,
  bowl: /\b(bowl|buddha bowl|poke|burrito bowl)\b/i,
  wrap: /\b(wrap|roll|kathi|burrito|frankie|taco|quesadilla|sandwich)\b/i,
  smoothie: /\b(smoothie|shake|lassi|juice|smoothie bowl)\b/i,
};
export function detectMethod(r: RecipeWithIng): string {
  const hay = r.name.toLowerCase();
  for (const [k, re] of Object.entries(METHOD_PATTERNS)) if (re.test(hay)) return k;
  return 'mixed';
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
 *
 * Rule (2) is dropped when `requireAnimalMain` is false — used for a protein-
 * restricted user (e.g. kidney disease), where forcing meat at every lunch and
 * dinner fights the medically-lowered protein target. Rule (1) still holds, so
 * a disallowed animal protein is never surfaced.
 */
export function passesProtein(r: RecipeWithIng, allowed: Set<string>, requireAnimalMain = true): boolean {
  if (allowed.size === 0) return true;
  const found = detectProteins(r);
  const animalFound = [...found].filter((t) => ANIMAL_PROTEINS.has(t));
  for (const t of animalFound) if (!allowed.has(t)) return false; // disallowed animal protein
  const allowedAnimal = [...allowed].filter((t) => ANIMAL_PROTEINS.has(t));
  if (requireAnimalMain && allowedAnimal.length && (r.slot === 'l' || r.slot === 'd')) {
    if (!animalFound.some((t) => allowed.has(t))) return false;   // meat main must have their meat
  }
  return true;
}

/** Is this recipe free of any animal protein (plant-forward / lighter-protein)?
 *  Used to bias a protein-restricted plan toward lower-protein plates. */
export function isPlantForward(r: RecipeWithIng): boolean {
  return ![...detectProteins(r)].some((t) => ANIMAL_PROTEINS.has(t));
}

/** Protein-restricted diet — kidney disease / CKD lowers the protein target, so
 *  the planner must stop forcing animal protein and lean lighter. */
export function isProteinRestricted(ex: PrefExtras): boolean {
  return (ex.healthConditions ?? []).some((c) => /kidney|renal|\bckd\b|nephro/i.test(c));
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
  return Math.round(total / recipeServings({ slot: r.slot, kcal: r.kcal ?? 0, gramsPerServing: r.gramsPerServing ?? 0, servings: r.servings }));
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
 * Is this recipe substantial enough to be a planned meal for the slot? Judged on
 * per-person calories (batch kcal ÷ servings) against a per-slot floor. The
 * dataset is now cleaned of condiments, so this floor only needs to exclude
 * genuinely-trivial / batch-estimate-corrupt rows (per-serving in the single/low
 * double digits) — real light dishes (a small idli, a dhokla, a light dal) are
 * KEPT, since the thali builder flexes them up to the meal's calorie target.
 */
const MEAL_MIN_KCAL: Record<string, number> = { b: 50, l: 60, s: 35, d: 60 };
function isPlannableMeal(r: { slot: string; kcal?: number; gramsPerServing?: number }): boolean {
  if (r.kcal == null) return true; // unknown → don't exclude
  const perServing = r.kcal / recipeServings({ slot: r.slot, kcal: r.kcal, gramsPerServing: r.gramsPerServing ?? 0, servings: (r as { servings?: number }).servings });
  return perServing >= (MEAL_MIN_KCAL[r.slot] ?? 150);
}

// ─────────── meal-type appropriateness (think like a dietitian) ───────────
// A realistic per-person calorie window for each slot. The LOW ends are kept
// deliberately generous so real but light dishes stay eligible (Indian mains
// flex up to target in the thali builder); the HIGH ends still keep a snack from
// being a heavy main and reject batch-estimate outliers. Anything below the low
// end is a trivial / corrupt row, handled together with MEAL_MIN_KCAL.
const SLOT_KCAL: Record<string, [number, number]> = {
  b: [70, 700], l: [80, 950], s: [40, 300], d: [80, 850],
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
  const per = (r.kcal ?? 0) / recipeServings({ slot, kcal: r.kcal ?? 0, gramsPerServing: r.gramsPerServing ?? 0, servings: r.servings });
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
  if (!passesProtein(r, allowed)) return false;                       // 3 · preferred proteins/meats (the user's preference is honoured, even with a kidney condition — we advise, we don't override)
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
  healthGrade?: string | null; healthPercent?: number; // v2 dataset health score
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
export function recipeServings(r: { slot?: string; kcal: number; gramsPerServing: number; servings?: number }): number {
  // v2 dataset stores authoritative per-serving nutrition (servings ≥ 1) — trust
  // it and skip the batch-size estimate below.
  if (r.servings && r.servings > 0) return r.servings;
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
// Nutrition history (spec §19). The sandbox Prisma client can't be regenerated
// offline, so we type the delegate by hand; the deployed client (regenerated at
// image build) resolves `nutritionHistory` for real.
export interface NutritionHistoryRow {
  id: string; userId: string; mode: string; planKey: string; weekNumber: number;
  weekLabel: string; startDate: Date; endDate: Date; targets: string; context: string;
  days: string; weekly: string; cost: number; createdAt: Date;
}
interface NutritionHistoryDelegate {
  create(a: unknown): Promise<NutritionHistoryRow>;
  findMany(a: unknown): Promise<NutritionHistoryRow[]>;
  findUnique(a: unknown): Promise<NutritionHistoryRow | null>;
  deleteMany(a: unknown): Promise<{ count: number }>;
  count(a: unknown): Promise<number>;
}
// Family member sub-profiles (Family §). Hand-typed delegate (offline client).
export interface FamilyMemberRow {
  id: string; ownerId: string; name: string; role: string; sex: string; age: number;
  heightCm: number; weightKg: number; activity: number; goal: string; diet: string;
  extras: string | null; isSelf: boolean; createdAt: Date; updatedAt: Date;
}
interface FamilyMemberRowExt extends FamilyMemberRow { memberUserId: string | null }
interface FamilyMemberDelegate {
  create(a: unknown): Promise<FamilyMemberRow>;
  createMany(a: unknown): Promise<{ count: number }>;
  findMany(a: unknown): Promise<FamilyMemberRowExt[]>;
  findFirst(a: unknown): Promise<FamilyMemberRowExt | null>;
  update(a: unknown): Promise<FamilyMemberRow>;
  delete(a: unknown): Promise<FamilyMemberRow>;
  deleteMany(a: unknown): Promise<{ count: number }>;
}

/** Household Connection row — a real invited Together City user, PRIVATE to the
 *  Nutrition Hub and independent of the social graph (spec: separate models). */
export interface HouseholdMemberRow {
  id: string; ownerId: string; memberUserId: string; role: string; status: string;
  requestedById: string; createdAt: Date; updatedAt: Date;
}
interface HouseholdDelegate {
  create(a: unknown): Promise<HouseholdMemberRow>;
  findMany(a: unknown): Promise<HouseholdMemberRow[]>;
  findFirst(a: unknown): Promise<HouseholdMemberRow | null>;
  findUnique(a: unknown): Promise<HouseholdMemberRow | null>;
  update(a: unknown): Promise<HouseholdMemberRow>;
  upsert(a: unknown): Promise<HouseholdMemberRow>;
  delete(a: unknown): Promise<HouseholdMemberRow>;
}

/** Shared-pantry row (one pantry per household). */
export interface PantryItemRow {
  id: string; ownerId: string; name: string; aisle: string; grams: number;
  unit: string; qtyLabel: string; createdAt: Date; updatedAt: Date;
}
interface PantryDelegate {
  create(a: unknown): Promise<PantryItemRow>;
  findMany(a: unknown): Promise<PantryItemRow[]>;
  findFirst(a: unknown): Promise<PantryItemRow | null>;
  update(a: unknown): Promise<PantryItemRow>;
  delete(a: unknown): Promise<PantryItemRow>;
}

/** Household sharing permissions — what a member reveals to their household.
 *  Medical data is private by DEFAULT; the planner still uses it for safe
 *  portioning, but other members only see what's shared. */
export interface HouseholdSharing { targets: boolean; conditions: boolean; weight: boolean; bloodTests: boolean }
export const DEFAULT_SHARING: HouseholdSharing = { targets: true, conditions: false, weight: false, bloodTests: false };
export function parseSharing(raw: unknown): HouseholdSharing {
  const s = (raw ?? {}) as Partial<HouseholdSharing>;
  return {
    targets: s.targets ?? DEFAULT_SHARING.targets,
    conditions: s.conditions ?? DEFAULT_SHARING.conditions,
    weight: s.weight ?? DEFAULT_SHARING.weight,
    bloodTests: s.bloodTests ?? DEFAULT_SHARING.bloodTests,
  };
}

/** Valid household roles + what each may do (spec: Permissions). */
export const HOUSEHOLD_ROLES = ['owner', 'adult', 'child', 'guest'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];
export const HOUSEHOLD_CAPS: Record<HouseholdRole, string[]> = {
  owner: ['invite', 'remove', 'editSettings', 'generatePlan', 'placeOrder', 'editOwnProfile', 'viewPlan', 'viewGrocery', 'addPantry'],
  adult: ['editOwnProfile', 'acceptPlan', 'viewPlan', 'viewGrocery', 'addPantry'],
  child: ['viewPlan'],
  guest: ['viewPlan'],
};

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

/** Inputs for a personalised daily-target calculation. */
export interface TargetInput {
  weightKg?: number; heightCm?: number; age?: number; sex?: string;
  activity?: number; goal?: string; conditions?: string[];
  flags?: Record<string, string>; // blood-marker flags (low|normal|high)
}
/**
 * Personalised daily nutrition targets — Mifflin-St Jeor BMR → TDEE → goal
 * adjustment, protein per kg of reference weight, medical adjustments from
 * declared conditions + blood flags, then a per-meal split. Pure, so it serves
 * both the account holder and every admin-managed family member (Family §).
 */
export function computeTargets(inp: TargetInput) {
  const weight = inp.weightKg || 70;
  const height = inp.heightCm || 172;
  const age = inp.age || 30;
  const sex = inp.sex || 'male';
  const activity = inp.activity || 1.4;
  const goal = inp.goal || 'maintain';
  const flags = inp.flags ?? {};

  const h = height / 100;
  const bmi = h > 0 ? weight / (h * h) : 22;
  const overweight = bmi >= 27;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * activity;
  const adj = goal === 'lose' ? -0.18 : goal === 'gain' ? (overweight ? 0 : 0.10) : 0;
  const kcal = Math.max(1400, Math.round(tdee * (1 + adj)));

  const refWeight = bmi >= 27 ? Math.round(25 * h * h) : weight;
  let proteinPerKg = goal === 'gain' ? 2.0 : goal === 'lose' ? 1.8 : 1.6;
  const fatPct = 0.27;
  let fiber = Math.max(25, Math.min(50, Math.round((kcal / 1000) * 14)));

  const conds = new Set((inp.conditions ?? []).map((c) => c.toLowerCase()));
  const has = (...k: string[]) => k.some((x) => [...conds].some((c) => c.includes(x)));
  const diabetes = flags.hba1c === 'high' || has('diabetes');
  const highChol = flags.ldl === 'high' || flags.trig === 'high' || has('cholesterol');
  const fattyLiver = has('fatty liver');
  const hypertension = has('hypertension', 'blood pressure');
  const kidney = has('kidney', 'renal', 'ckd');
  const adjustments: string[] = [];
  let sugarMaxG = Math.round((kcal * 0.10) / 4);
  let satFatMaxG = Math.round((kcal * 0.10) / 9);
  let sodiumMaxMg = 2300;
  let potassiumMinMg = 3500;

  if (diabetes) { proteinPerKg = Math.max(proteinPerKg, 1.8); fiber = Math.max(fiber, 35); sugarMaxG = 20; adjustments.push('Diabetes: higher protein & fibre, lower-glycaemic carbs, added sugar ≤20 g'); }
  if (highChol) { satFatMaxG = Math.round((kcal * 0.06) / 9); fiber = Math.max(fiber, 35); adjustments.push('Raised cholesterol/triglycerides: saturated fat ≤6% kcal, more soluble fibre'); }
  if (fattyLiver) { proteinPerKg = Math.max(proteinPerKg, 1.8); sugarMaxG = Math.min(sugarMaxG, 20); satFatMaxG = Math.min(satFatMaxG, Math.round((kcal * 0.07) / 9)); adjustments.push('Fatty liver: lean protein up, added sugar & saturated fat down'); }
  if (hypertension) { sodiumMaxMg = 1500; potassiumMinMg = 4700; adjustments.push('Hypertension: sodium ≤1500 mg, higher potassium (DASH)'); }
  if (kidney) { proteinPerKg = Math.min(proteinPerKg, 0.8); sodiumMaxMg = Math.min(sodiumMaxMg, 2000); potassiumMinMg = 2000; adjustments.push('Kidney condition noted: protein target moderated to protect kidney function, with sodium & potassium limited — confirm targets with your nephrologist'); }

  const protein = Math.round(proteinPerKg * refWeight);
  const fat = Math.round((kcal * fatPct) / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const split: Record<'b' | 'l' | 's' | 'd', number> = { b: 0.25, l: 0.32, s: 0.13, d: 0.30 };
  const perMeal = Object.fromEntries(
    (['b', 'l', 's', 'd'] as const).map((slot) => [slot, {
      kcal: Math.round(kcal * split[slot]), protein: Math.round(protein * split[slot]),
      carb: Math.round(carb * split[slot]), fat: Math.round(fat * split[slot]),
    }]),
  );
  return { kcal, protein, carb, fat, fiber, waterMl: Math.round(weight * 35), sugarMaxG, satFatMaxG, sodiumMaxMg, potassiumMinMg, perMeal, adjustments };
}

/**
 * Day-portion optimizer (§targets): work BACKWARDS from the user's daily
 * targets. Given the day's chosen dishes (with their per-serving macros), solve
 * a portion factor (60–200%, escalating to 300% when the day would otherwise
 * finish under target) for each dish so the day's combined kcal, protein,
 * carbs, fat and fibre land as close as possible to the targets — UNDERSHOOT of
 * calories/protein is the failure mode and dominates the objective; fibre only
 * penalises undershoot. Indian thali plates already self-size to their calorie
 * budget, so they are held at 100% and the optimizer shapes the day around
 * them. Deterministic coordinate descent — no randomness, same inputs → same
 * portions everywhere (cards, dashboard, history).
 */
export interface DayItemForOpt {
  slot: string;
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minPct?: number; maxPct?: number; // plate meals pass 100/100
}
export function optimizeDayPortions(
  items: DayItemForOpt[],
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
): Record<string, number> {
  if (!items.length) return {};
  const NUTS: Array<[keyof DayItemForOpt & ('kcal' | 'protein' | 'carbs' | 'fat' | 'fiber'), number, number, number, number]> = [
    // [key, target, weight, overshootFactor, undershootFactor]
    // Priority order (spec): 1) hit calories, 2) hit protein — UNDERSHOOT is the
    // failure mode ("the day must never finish under target"), so undershoot
    // dominates the objective. Overshoot is tolerated and only gently nudged
    // down (the swap stage handles condition-capped targets by preferring
    // less-dense dishes — never by starving the day of calories).
    ['kcal', target.kcal, 6.0, 0.35, 1.0],
    ['protein', target.protein, 4.0, 0.15, 1.0],
    ['carbs', target.carb, 0.6, 1.0, 0.4],
    ['fat', target.fat, 0.6, 1.2, 0.4],
    ['fiber', target.fiber, 0.5, 0.0, 1.0],       // fibre: only undershoot hurts
  ];
  const errOf = (pcts: number[]): number => {
    let e = 0;
    for (const [key, T, w, over, under] of NUTS) {
      if (!T || T <= 0) continue;
      let tot = 0;
      for (let i = 0; i < items.length; i++) tot += (items[i][key] as number) * (pcts[i] / 100);
      const dev = (tot - T) / T;
      e += w * dev * dev * (dev > 0 ? over : under);
    }
    return e;
  };
  const pcts = items.map(() => 100);
  const OPTIONS: number[] = [];
  for (let p = 60; p <= 250; p += 5) OPTIONS.push(p);
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      const lo = items[i].minPct ?? 60, hi = items[i].maxPct ?? 200;
      let best = pcts[i], bestErr = errOf(pcts);
      for (const opt of OPTIONS) {
        if (opt < lo || opt > hi) continue;
        if (opt === pcts[i]) continue;
        const prev = pcts[i];
        pcts[i] = opt;
        const e = errOf(pcts);
        if (e < bestErr - 1e-9) { best = opt; bestErr = e; }
        pcts[i] = prev;
      }
      if (best !== pcts[i]) { pcts[i] = best; changed = true; }
    }
    if (!changed) break;
  }
  return Object.fromEntries(items.map((it, i) => [it.slot, pcts[i]]));
}

/** Worst relative deviation (abs, as %) of the day vs targets — for swap decisions. */
export function dayDeviationPct(
  items: DayItemForOpt[], pcts: Record<string, number>,
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
): { worst: number; nutrient: string } {
  const totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const it of items) {
    const f = (pcts[it.slot] ?? 100) / 100;
    totals.kcal += it.kcal * f; totals.protein += it.protein * f; totals.carbs += it.carbs * f;
    totals.fat += it.fat * f; totals.fiber += it.fiber * f;
  }
  const pairs: Array<[string, number, number]> = [
    ['calories', totals.kcal, target.kcal], ['protein', totals.protein, target.protein],
    ['carbs', totals.carbs, target.carb], ['fat', totals.fat, target.fat],
  ];
  let worst = 0, nutrient = 'calories';
  for (const [name, tot, T] of pairs) {
    if (!T) continue;
    const dev = Math.abs((tot - T) / T) * 100;
    if (dev > worst) { worst = dev; nutrient = name; }
  }
  return { worst: Math.round(worst * 10) / 10, nutrient };
}

/** Day totals for a portion assignment. */
export function dayTotalsFor(items: DayItemForOpt[], pcts: Record<string, number>) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const it of items) {
    const f = (pcts[it.slot] ?? 100) / 100;
    t.kcal += it.kcal * f; t.protein += it.protein * f; t.carbs += it.carbs * f;
    t.fat += it.fat * f; t.fiber += it.fiber * f;
  }
  return t;
}

/**
 * Final validation (spec): a day is only complete when calories AND protein are
 * ≥95% of target. Returns the combined shortfall in %-points (0 = passes).
 */
export function floorDeficitPct(
  items: DayItemForOpt[], pcts: Record<string, number>,
  target: { kcal: number; protein: number },
): number {
  const t = dayTotalsFor(items, pcts);
  const kcalPct = target.kcal > 0 ? (t.kcal / target.kcal) * 100 : 100;
  const protPct = target.protein > 0 ? (t.protein / target.protein) * 100 : 100;
  return Math.max(0, 95 - kcalPct) + Math.max(0, 95 - protPct);
}

/**
 * Tolerance bands (spec §validation): every nutrient must land inside its band
 * before a plan may be shown — a 66 g protein target must never present a
 * 189 g day. Bands are asymmetric: undershoot floors are strict (95%),
 * overshoot allowances vary by how harmful an excess is. Fibre overshoot is
 * harmless within reason.
 */
export const DAY_TOLERANCE = {
  kcal: { minPct: 95, maxPct: 108 },
  protein: { minPct: 90, maxPct: 115 },   // hard cap matters for kidney-moderated targets
  carbs: { minPct: 70, maxPct: 112 },
  fat: { minPct: 60, maxPct: 115 },
  fiber: { minPct: 70, maxPct: 160 },
} as const;

/**
 * How far (in %-points, summed) the day sits OUTSIDE its tolerance bands.
 * 0 = a valid plan. Used as the primary swap-acceptance metric so the repair
 * loop drives every nutrient into its band before polishing closeness.
 */
export function bandViolationPct(
  items: DayItemForOpt[], pcts: Record<string, number>,
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
): { total: number; worstNutrient: string; worstSide: 'over' | 'under' } {
  const t = dayTotalsFor(items, pcts);
  const rows: Array<[keyof typeof DAY_TOLERANCE, number, number]> = [
    ['kcal', t.kcal, target.kcal], ['protein', t.protein, target.protein],
    ['carbs', t.carbs, target.carb], ['fat', t.fat, target.fat], ['fiber', t.fiber, target.fiber],
  ];
  let total = 0, worst = 0, worstNutrient = 'kcal', worstSide: 'over' | 'under' = 'over';
  for (const [key, tot, T] of rows) {
    if (!T || T <= 0) continue;
    const pct = (tot / T) * 100;
    const band = DAY_TOLERANCE[key];
    const v = pct > band.maxPct ? pct - band.maxPct : pct < band.minPct ? band.minPct - pct : 0;
    total += v;
    if (v > worst) { worst = v; worstNutrient = key; worstSide = pct > band.maxPct ? 'over' : 'under'; }
  }
  return { total: Math.round(total * 10) / 10, worstNutrient, worstSide };
}

/**
 * Solve portions with the never-under-target guarantee: optimize normally
 * (60–200% per dish), and if calories or protein still land under 95% of
 * target, escalate the portion ceiling (250%, then 300%) for every dish that
 * isn't hard-pinned (thali plates stay self-sized). Portion scaling comes
 * before replacement — the caller's swap stage only runs if this can't close
 * the gap alone.
 */
export function solveDayPortions(
  items: DayItemForOpt[],
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
): { pcts: Record<string, number>; deficit: number; worst: number; nutrient: string; violation: number } {
  let use = items;
  let pcts = optimizeDayPortions(use, target);
  let deficit = floorDeficitPct(use, pcts, target);
  for (const cap of [250, 300]) {
    if (deficit <= 0) break;
    const widened = items.map((it) =>
      it.minPct === 100 && it.maxPct === 100 ? it : { ...it, maxPct: Math.max(it.maxPct ?? 200, cap) });
    const p2 = optimizeDayPortions(widened, target);
    const d2 = floorDeficitPct(widened, p2, target);
    if (d2 < deficit) { use = widened; pcts = p2; deficit = d2; }
  }
  // Guaranteed-floor fill: the balanced objective can leave a day under target
  // when every dish is macro-skewed (e.g. all-protein picks vs a capped protein
  // target). The floors are non-negotiable — raise portions greedily, 5% at a
  // time on whichever dish adds the most of what's missing, until calories AND
  // protein reach ≥95% or every dish is at its 300% ceiling.
  if (deficit > 0) {
    const HARD_CAP = 300;
    const filled = { ...pcts };
    for (let guard = 0; guard < 400 && floorDeficitPct(use, filled, target) > 0; guard++) {
      const t = dayTotalsFor(use, filled);
      const needK = target.kcal > 0 && t.kcal < 0.95 * target.kcal;
      const needP = target.protein > 0 && t.protein < 0.95 * target.protein;
      let bestIdx = -1, bestGain = 0;
      for (let i = 0; i < use.length; i++) {
        const it = use[i];
        const pinned = it.minPct === 100 && it.maxPct === 100;
        if (pinned || (filled[it.slot] ?? 100) >= HARD_CAP) continue;
        const gain = (needK ? it.kcal : 0) + (needP ? it.protein * 12 : 0);
        if (gain > bestGain) { bestGain = gain; bestIdx = i; }
      }
      if (bestIdx < 0) break; // nothing left to raise — caller's swap stage takes over
      filled[use[bestIdx].slot] = (filled[use[bestIdx].slot] ?? 100) + 5;
    }
    const dFilled = floorDeficitPct(use, filled, target);
    if (dFilled < deficit) { pcts = filled; deficit = dFilled; }
  }
  // Trim pass: pull overshooting nutrients back inside their tolerance bands
  // wherever portions allow it WITHOUT re-breaking the calorie/protein floors.
  // 5% at a time off the dish contributing most of the excess nutrient.
  {
    const trimmed = { ...pcts };
    for (let guard = 0; guard < 200; guard++) {
      const v = bandViolationPct(use, trimmed, target);
      if (v.total <= 0 || v.worstSide !== 'over') break;
      const key = v.worstNutrient as 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
      let bestIdx = -1, bestAmt = 0;
      for (let i = 0; i < use.length; i++) {
        const it = use[i];
        const pinned = it.minPct === 100 && it.maxPct === 100;
        const cur = trimmed[it.slot] ?? 100;
        if (pinned || cur <= (it.minPct ?? 60)) continue;
        const amt = (it[key] as number) ?? 0;
        if (amt > bestAmt) { bestAmt = amt; bestIdx = i; }
      }
      if (bestIdx < 0) break;
      const slot = use[bestIdx].slot;
      const attempt = { ...trimmed, [slot]: (trimmed[slot] ?? 100) - 5 };
      // never trade the floors away to fix an overshoot
      if (floorDeficitPct(use, attempt, target) > 0) break;
      const v2 = bandViolationPct(use, attempt, target);
      if (v2.total >= v.total) break;
      trimmed[slot] = attempt[slot];
    }
    if (bandViolationPct(use, trimmed, target).total < bandViolationPct(use, pcts, target).total
      && floorDeficitPct(use, trimmed, target) <= deficit) {
      pcts = trimmed;
    }
  }
  const { worst, nutrient } = dayDeviationPct(use, pcts, target);
  const violation = bandViolationPct(use, pcts, target).total;
  return { pcts, deficit, worst, nutrient, violation };
}

/**
 * Keep a meal's macros physiologically consistent with its calorie figure.
 * The 12,976-recipe world dataset carries noisy protein/carb/fat/fibre values
 * (some per-100 g, some per-batch, some simply wrong) that the per-serving
 * divisor can't fix — which is how a 548-kcal biryani ends up "reporting" 34 g
 * fibre and the daily dashboard shows 102 g fibre / 143 g protein. Calories are
 * the trusted figure (used for portioning), so we clamp each macro to a
 * plausible share of that energy: protein & fat ≤45% of kcal each, carbs to the
 * remaining energy, and fibre to a realistic ceiling (≤~16 g per 1000 kcal, and
 * never more than the carbohydrate it's part of).
 */
export function saneMacros(kcal: number, protein: number, carbs: number, fat: number, fiber: number) {
  const k = Math.max(0, Math.round(kcal || 0));
  // Generous energy-share ceilings — only trim values that are physically
  // impossible for the calorie count, so legitimately high-protein or high-fat
  // dishes are left alone. Fibre is the strict clamp (its dataset values are the
  // worst offenders and it can't realistically exceed ~16 g per 1000 kcal).
  const p = Math.min(Math.max(0, Math.round(protein || 0)), Math.round((k * 0.6) / 4));
  const f = Math.min(Math.max(0, Math.round(fat || 0)), Math.round((k * 0.6) / 9));
  const carbRoom = Math.max(0, Math.round((k * 1.1 - p * 4 - f * 9) / 4));
  const c = Math.min(Math.max(0, Math.round(carbs || 0)), carbRoom || Math.round(carbs || 0));
  const fibreCeil = Math.round((k / 1000) * 16) + 3; // ~16 g/1000 kcal + small allowance
  const fib = Math.min(Math.max(0, Math.round(fiber || 0)), Math.max(c, 1), fibreCeil);
  return { protein: p, carbs: c, fat: f, fiber: fib };
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
    // Recipe data: adopt the v2 dataset (per-serving, cleaned) on an existing DB,
    // else load it fresh. Background so it never blocks boot; both are idempotent.
    // The old dropped-rows purge is skipped once v2 is in (v2 is already clean).
    void this.ensureRecipeLibrary()
      .then(() => this.adoptDatasetV2())
      .catch(() => undefined);
  }

  /**
   * Remove the rows the dataset-cleaning pass dropped (condiments/seasonings,
   * corrupt names, no-ingredient rows, and exact duplicates) from an already-
   * loaded database. Fresh databases load the cleaned dataset directly, so this
   * only does work once on existing prod data. Idempotent + best-effort: reads a
   * shipped drop-list of recipe ids, deletes any meals referencing them (they
   * live in disposable meal plans that regenerate), then the recipes themselves
   * (ingredients cascade). Never throws — recipe cleanup must not break boot.
   */
  private async purgeDroppedRecipes(): Promise<void> {
    try {
      const candidates = [
        join(__dirname, 'data', 'recipes.dropped.json.gz'),
        join(process.cwd(), 'dist', 'nutrition', 'data', 'recipes.dropped.json.gz'),
        join(process.cwd(), 'src', 'nutrition', 'data', 'recipes.dropped.json.gz'),
      ];
      const path = candidates.find((p) => existsSync(p));
      if (!path) return;
      const ids = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as string[];
      if (!Array.isArray(ids) || !ids.length) return;

      // Quick exit once the DB is already clean (idempotent no-op on later boots).
      const stillThere = await this.prisma.recipe.count({ where: { id: { in: ids.slice(0, 1000) } } }).catch(() => 0);
      if (stillThere === 0) return;

      let removed = 0;
      const B = 500;
      for (let i = 0; i < ids.length; i += B) {
        const batch = ids.slice(i, i + B);
        await this.prisma.meal.deleteMany({ where: { recipeId: { in: batch } } }).catch(() => undefined);
        const res = await this.prisma.recipe.deleteMany({ where: { id: { in: batch } } }).catch(() => ({ count: 0 }));
        removed += res.count;
      }
      if (removed) this.logger.log(`Recipe cleanup: removed ${removed} non-meal/duplicate rows (dataset cleaning).`);
    } catch (e) {
      this.logger.warn(`Recipe cleanup skipped: ${(e as Error).message}`);
    }
  }

  // ─────────────── targets (Mifflin-St Jeor) ───────────────
  async targets(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId));
    return computeTargets({
      weightKg: pref?.weightKg ?? 70, heightCm: pref?.heightCm ?? 172, age: pref?.age ?? 30,
      sex: pref?.sex ?? 'male', activity: pref?.activity ?? 1.4, goal: pref?.goal ?? 'maintain',
      conditions: ex.healthConditions ?? [], flags,
    });
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

  // ─────────────── dietary balance & nutrition advisory ───────────────
  /**
   * Personalized Nutrition Advice: friendly, evidence-based advisories that
   * flag where the user's CHOSEN diet pattern may need attention — informational,
   * never blocking, always food-first (supplements only as a fallback note).
   * Inputs: diet + protein selections, health conditions, blood flags, targets.
   */
  async advisories(userId: string): Promise<Array<{ key: string; title: string; body: string }>> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = (pref?.diet ?? 'everything') as Diet;
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId));
    const tg = await this.targets(userId);
    const out: Array<{ key: string; title: string; body: string }> = [];

    const proteins = (ex.proteins ?? []).map((p) => p.toLowerCase());
    const plantSources = ['paneer', 'tofu', 'legumes'];
    const hasPlant = proteins.some((p) => plantSources.includes(p));
    const onlyAnimal = proteins.length > 0 && !hasPlant && ['everything', 'nonveg', 'pesc'].includes(diet);

    if (onlyAnimal) {
      out.push({
        key: 'only-nonveg', title: 'Mostly animal-protein selections',
        body: 'Your protein sources are currently all animal-based. For optimal long-term health, consider including a variety of vegetables, fruits, legumes, whole grains, nuts and seeds — they improve fibre intake, vitamins, minerals, antioxidants and gut health. Your plans will still follow your preferences.',
      });
    }
    if (diet === 'veg' || diet === 'egg') {
      out.push({
        key: 'veg', title: 'Vegetarian pattern — nutrients to watch',
        body: 'A vegetarian diet may need extra attention to protein, vitamin B12, iron, zinc, omega-3 fatty acids and vitamin D. The meal planner maximises plant-based protein (dal, paneer, tofu, legumes) where possible; if your targets can’t be met through food alone, consider discussing appropriate supplementation with your healthcare professional.',
      });
    }
    if (diet === 'vegan') {
      out.push({
        key: 'vegan', title: 'Vegan pattern — nutrients to watch',
        body: 'Ensure adequate intake of vitamin B12, vitamin D, calcium, iodine, iron, zinc, omega-3 fatty acids and high-quality plant proteins (tofu, soy, legumes, nuts and seeds). Supplementation — especially B12 — may be beneficial where dietary intake is insufficient.',
      });
    }
    if (diet === 'jain') {
      out.push({
        key: 'jain', title: 'Jain pattern — planned around your preferences',
        body: 'Your dietary preferences may limit certain nutrient sources (iron, zinc and B12 in particular, with no root vegetables). The meal planner optimises within your preferences — dairy, legumes, grains and seeds carry most of the load — and will suggest food alternatives first, with supplements only when food alone can’t close a gap.',
      });
    }
    if (diet === 'pesc' && !onlyAnimal) {
      out.push({
        key: 'pesc', title: 'Pescatarian pattern',
        body: 'Fish covers omega-3s and quality protein well. Keep legumes, whole grains, nuts and colourful vegetables in the rotation for fibre, iron and antioxidants — your plans balance these automatically.',
      });
    }

    // Blood-flag notes (food-first, only for markers the panel actually flagged).
    if (flags.b12 === 'low') {
      out.push({
        key: 'b12', title: 'Vitamin B12 is low on your latest panel',
        body: diet === 'vegan' || diet === 'veg' || diet === 'jain'
          ? 'Plant-forward diets carry little B12. Dairy and eggs help where they fit your pattern; a B12 supplement is commonly needed — worth confirming with your doctor.'
          : 'Include eggs, dairy, fish or lean meat regularly; ask your doctor whether a supplement makes sense for you.',
      });
    }
    if (flags.vitd === 'low' || flags.vitD === 'low') {
      out.push({
        key: 'vitd', title: 'Vitamin D is low on your latest panel',
        body: 'Some sunlight most days plus vitamin-D-rich foods (fortified dairy, eggs, fish where they fit your diet) helps; supplementation is often the practical fix — confirm the dose with your doctor.',
      });
    }
    if (flags.hb === 'low' || flags.ferritin === 'low') {
      out.push({
        key: 'iron', title: 'Iron stores look low',
        body: 'Your plans lean on iron-rich foods that fit your diet (legumes, greens, seeds' + (diet === 'everything' || diet === 'nonveg' ? ', lean red meat' : '') + '). Pair them with vitamin-C foods (lemon, amla, citrus) to absorb more; avoid tea/coffee right after meals.',
      });
    }

    // Feasibility note: a tight (condition-moderated) protein target with a
    // protein-dense selection, or a high target on a plant-only diet.
    const kidneyModerated = tg.adjustments?.some((a: string) => /kidney/i.test(a));
    if (kidneyModerated) {
      out.push({
        key: 'kidney-protein', title: 'Protein is intentionally moderated',
        body: `Because of your kidney condition, your protein target is ${tg.protein} g — deliberately moderate. Your plans favour lighter-protein meals to stay near it, so days may look lower-protein than typical fitness advice; that is by design. Confirm targets with your nephrologist.`,
      });
    } else if ((diet === 'vegan' || diet === 'jain') && tg.protein >= 110) {
      out.push({
        key: 'plant-protein', title: 'High protein target on a plant-based diet',
        body: `Your target is ${tg.protein} g/day from plant sources. It’s achievable with tofu, soy chunks, dals and legumes at every meal, but takes planning — the planner prioritises these. If days keep landing short, a plant protein supplement is a reasonable backstop.`,
      });
    }

    if (!out.length) {
      out.push({
        key: 'balanced', title: 'Your pattern looks well-rounded',
        body: 'No specific nutritional gaps stand out from your preferences and latest results. Keep variety high — different vegetables, whole grains, proteins and fruits across the week — and your plans will handle the numbers.',
      });
    }
    return out;
  }

  // ─────────────── health profile · calorie log ───────────────
  /** Typed accessor for the CalorieEntry model (the local, offline Prisma client
   *  may predate this model; Railway regenerates it at build). */
  private get calorie(): CalorieDelegate {
    return (this.prisma as unknown as { calorieEntry: CalorieDelegate }).calorieEntry;
  }
  private get history(): NutritionHistoryDelegate {
    return (this.prisma as unknown as { nutritionHistory: NutritionHistoryDelegate }).nutritionHistory;
  }
  private get members(): FamilyMemberDelegate {
    return (this.prisma as unknown as { familyMember: FamilyMemberDelegate }).familyMember;
  }
  private get household(): HouseholdDelegate {
    return (this.prisma as unknown as { householdMember: HouseholdDelegate }).householdMember;
  }
  private get pantry(): PantryDelegate {
    return (this.prisma as unknown as { pantryItem: PantryDelegate }).pantryItem;
  }

  // ─────────────── family members (admin-managed sub-profiles) ───────────────
  /** Shape a stored member for the client, with its computed daily targets. The
   *  owner always sees their own (self) row in full; for other members, fields
   *  are redacted per that member's own sharing permissions (medical is private
   *  by default). The planner still uses the real data server-side for safe
   *  portioning — redaction only affects what the household VIEW exposes. */
  private shapeMember(m: FamilyMemberRowExt, image?: string | null, sharing?: HouseholdSharing) {
    const ex = parseExtras(m.extras);
    const targets = computeTargets({
      weightKg: m.weightKg, heightCm: m.heightCm, age: m.age, sex: m.sex,
      activity: m.activity, goal: m.goal, conditions: ex.healthConditions ?? [],
    });
    const householdRole = m.isSelf ? 'owner' : (HOUSEHOLD_ROLES as readonly string[]).includes(m.role) ? m.role : 'adult';
    const s = m.isSelf ? { targets: true, conditions: true, weight: true, bloodTests: true } : (sharing ?? DEFAULT_SHARING);
    const zeroTargets = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0, adjustments: [] as string[] };
    return {
      id: m.id, name: m.name, role: m.role, sex: m.sex, age: m.age, heightCm: s.weight ? m.heightCm : 0,
      weightKg: s.weight ? m.weightKg : 0, activity: m.activity, goal: m.goal, diet: m.diet, isSelf: m.isSelf,
      userId: m.memberUserId ?? null,          // real Together City user (null for the owner self-row)
      image: image ?? null,                    // profile photo
      householdRole,                           // owner | adult | child | guest
      capabilities: HOUSEHOLD_CAPS[householdRole as HouseholdRole] ?? HOUSEHOLD_CAPS.adult,
      privacy: { targets: !s.targets, conditions: !s.conditions, weight: !s.weight, bloodTests: !s.bloodTests },
      proteins: ex.proteins ?? [], cuisines: ex.cuisines ?? [], allergies: ex.allergies ?? '',
      healthConditions: s.conditions ? (ex.healthConditions ?? []) : [],
      targets: s.targets
        ? { kcal: targets.kcal, protein: targets.protein, carb: targets.carb, fat: targets.fat, fiber: targets.fiber, adjustments: targets.adjustments }
        : zeroTargets,
    };
  }

  /** Every family member the account holder manages (self first, then accepted
   *  household members). Lazily seeds a "self" profile from the account holder's
   *  saved preferences, and keeps the real invited members mirrored from their
   *  own Nutrition profile so the planner/grocery/dashboard read live data. */
  /** Raw household rows + each member's profile photo and sharing permissions.
   *  Used both for the redacted member cards and for (unattributed) aggregates. */
  private async householdRaw(ownerId: string) {
    await this.ensureSelfMember(ownerId);
    await this.syncHouseholdMirrors(ownerId);
    const rows = await this.members.findMany({ where: { ownerId }, orderBy: [{ isSelf: 'desc' }, { createdAt: 'asc' }] }).catch(() => [] as FamilyMemberRowExt[]);
    const userIds = rows.map((r) => r.memberUserId).filter((x): x is string => Boolean(x));
    const [users, prefs] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, profileImage: true } }).catch(() => []) : Promise.resolve([]),
      userIds.length ? this.prisma.foodPref.findMany({ where: { userId: { in: userIds } } }).catch(() => []) : Promise.resolve([]),
    ]);
    const imageOf = new Map(users.map((u) => [u.id, u.profileImage]));
    const sharingOf = new Map((prefs as { userId: string; extras?: string | null }[]).map((p) => [p.userId, parseSharing(parseExtras(p.extras).householdSharing)]));
    return rows.map((m) => ({
      row: m,
      image: m.memberUserId ? imageOf.get(m.memberUserId) ?? null : null,
      sharing: m.memberUserId ? sharingOf.get(m.memberUserId) ?? DEFAULT_SHARING : DEFAULT_SHARING,
    }));
  }

  async familyMembers(ownerId: string) {
    const raw = await this.householdRaw(ownerId);
    return raw.map((r) => this.shapeMember(r.row, r.image, r.sharing));
  }

  /** Seed the owner's own "self" member row from their saved preferences. */
  private async ensureSelfMember(ownerId: string) {
    const rows = await this.members.findMany({ where: { ownerId, isSelf: true } }).catch(() => [] as FamilyMemberRowExt[]);
    if (rows.length) return;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId: ownerId } }).catch(() => null);
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const user = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }).catch(() => null);
    await this.members.create({
      data: {
        ownerId, memberUserId: ownerId, isSelf: true, name: user?.name ?? 'You', role: 'owner',
        sex: pref?.sex ?? 'male', age: pref?.age ?? 30, heightCm: pref?.heightCm ?? 172,
        weightKg: pref?.weightKg ?? 70, activity: pref?.activity ?? 1.4, goal: pref?.goal ?? 'maintain',
        diet: pref?.diet ?? 'everything',
        extras: JSON.stringify({ proteins: ex.proteins ?? [], cuisines: ex.cuisines ?? [], allergies: ex.allergies ?? '', healthConditions: ex.healthConditions ?? [] }),
      } as never,
    }).catch(() => undefined);
  }

  /** Build the member-row nutrition fields from a real user's own Nutrition profile. */
  private mirrorDataFromPref(name: string, role: string, pref: { sex?: string; age?: number; heightCm?: number; weightKg?: number; activity?: number; goal?: string; diet?: string; extras?: string | null } | null) {
    const ex = parseExtras(pref?.extras);
    return {
      name: name.slice(0, 60), role,
      sex: pref?.sex === 'female' ? 'female' : 'male',
      age: pref?.age ?? 30, heightCm: pref?.heightCm ?? 170, weightKg: pref?.weightKg ?? 65,
      activity: pref?.activity ?? 1.4, goal: pref?.goal ?? 'maintain', diet: pref?.diet ?? 'everything',
      extras: JSON.stringify({ proteins: ex.proteins ?? [], cuisines: ex.cuisines ?? [], allergies: ex.allergies ?? '', healthConditions: ex.healthConditions ?? [] }),
    };
  }

  /** Keep the FamilyMember mirror in step with accepted Household Connections:
   *  upsert one mirror per accepted member (from their live profile), and drop
   *  mirrors for anyone no longer accepted. Best-effort; never throws. */
  private async syncHouseholdMirrors(ownerId: string) {
    try {
      const links = await this.household.findMany({ where: { ownerId } }).catch(() => [] as HouseholdMemberRow[]);
      const accepted = links.filter((l) => l.status === 'accepted');
      const acceptedIds = new Set(accepted.map((l) => l.memberUserId));

      // Remove mirrors whose link is gone / no longer accepted (never the self row).
      const mirrors = await this.members.findMany({ where: { ownerId, isSelf: false } }).catch(() => [] as FamilyMemberRowExt[]);
      for (const mir of mirrors) {
        if (mir.memberUserId && !acceptedIds.has(mir.memberUserId)) {
          await this.members.delete({ where: { id: mir.id } }).catch(() => undefined);
        }
      }
      // Upsert a mirror for each accepted member from their live profile.
      for (const link of accepted) {
        if (link.memberUserId === ownerId) continue; // owner is the self row
        const [user, pref] = await Promise.all([
          this.prisma.user.findUnique({ where: { id: link.memberUserId }, select: { name: true } }).catch(() => null),
          this.prisma.foodPref.findUnique({ where: { userId: link.memberUserId } }).catch(() => null),
        ]);
        const data = this.mirrorDataFromPref(user?.name ?? 'Member', link.role, pref as never);
        const existing = await this.members.findFirst({ where: { ownerId, memberUserId: link.memberUserId } }).catch(() => null);
        if (existing) await this.members.update({ where: { id: existing.id }, data: data as never }).catch(() => undefined);
        else await this.members.create({ data: { ownerId, memberUserId: link.memberUserId, isSelf: false, ...data } as never }).catch(() => undefined);
      }
    } catch { /* mirror sync is best-effort */ }
  }

  private memberData(dto: Record<string, unknown>) {
    const clamp = (v: unknown, lo: number, hi: number, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    const extras = JSON.stringify({
      proteins: Array.isArray(dto.proteins) ? dto.proteins : [],
      cuisines: Array.isArray(dto.cuisines) ? dto.cuisines : [],
      allergies: typeof dto.allergies === 'string' ? dto.allergies : '',
      healthConditions: Array.isArray(dto.healthConditions) ? dto.healthConditions : [],
    });
    return {
      name: String(dto.name ?? 'Member').slice(0, 60),
      role: String(dto.role ?? 'member').toLowerCase().slice(0, 20),
      sex: dto.sex === 'female' ? 'female' : 'male',
      age: Math.round(clamp(dto.age, 1, 110, 30)),
      heightCm: Math.round(clamp(dto.heightCm, 60, 230, 170)),
      weightKg: clamp(dto.weightKg, 8, 250, 65),
      activity: clamp(dto.activity, 1.2, 1.9, 1.4),
      goal: ['lose', 'maintain', 'gain'].includes(String(dto.goal)) ? String(dto.goal) : 'maintain',
      diet: String(dto.diet ?? 'everything'),
      extras,
    };
  }

  /** Edit a member profile. Members are real users who own their own profile, so
   *  only the self (owner) row is editable here; real members edit their own. */
  async updateFamilyMember(ownerId: string, id: string, dto: Record<string, unknown>) {
    const existing = await this.members.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('family member not found');
    if (existing.memberUserId && !existing.isSelf) throw new ForbiddenException('This member manages their own profile in their Nutrition Hub.');
    await this.members.update({ where: { id }, data: this.memberData(dto) as never });
    return this.familyMembers(ownerId);
  }

  /** Remove a member from the household. For a real invited user this ends the
   *  Household Connection (their social relationship, if any, is untouched). */
  async removeFamilyMember(ownerId: string, id: string) {
    const existing = await this.members.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('family member not found');
    if (existing.isSelf) throw new BadRequestException('cannot remove your own profile');
    if (existing.memberUserId) return this.removeHouseholdMember(ownerId, existing.memberUserId);
    await this.members.delete({ where: { id } });
    return this.familyMembers(ownerId);
  }

  // ─────────────── Household Connections (Nutrition Hub only) ───────────────
  // A Household Connection is PRIVATE to the Nutrition Hub and never touches the
  // social graph. Members are real Together City users who accept an invite.

  /** Find a citizen to invite — by exact Together City user ID or @username.
   *  Deliberately private (no directory / fuzzy browsing), matching the platform. */
  async searchHouseholdUser(ownerId: string, queryRaw: string) {
    const q = (queryRaw ?? '').trim();
    if (!q) return { found: false as const };
    const handle = q.replace(/^@/, '').toLowerCase();
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ id: q }, { handle }] },
      select: { id: true, handle: true, name: true, profileImage: true },
    }).catch(() => null);
    if (!user) return { found: false as const };

    let relationship: 'self' | 'member' | 'pending' | 'none' = 'none';
    if (user.id === ownerId) relationship = 'self';
    else {
      const link = await this.household.findUnique({ where: { ownerId_memberUserId: { ownerId, memberUserId: user.id } } as never }).catch(() => null);
      if (link?.status === 'accepted') relationship = 'member';
      else if (link?.status === 'pending') relationship = 'pending';
    }
    return { found: true as const, user, relationship };
  }

  /** Invite a real user to the household (owner only). Creates a pending Household
   *  Connection + surfaces an in-app invitation the invitee can accept/decline. */
  async inviteHousehold(ownerId: string, ref: string, roleRaw?: string) {
    const res = await this.searchHouseholdUser(ownerId, ref);
    if (!res.found) throw new NotFoundException('No Together City user with that ID or username.');
    if (res.relationship === 'self') throw new BadRequestException("You're already the head of your household.");
    const role = (HOUSEHOLD_ROLES as readonly string[]).includes(String(roleRaw)) && roleRaw !== 'owner' ? String(roleRaw) : 'adult';
    const memberUserId = res.user.id;

    await this.household.upsert({
      where: { ownerId_memberUserId: { ownerId, memberUserId } } as never,
      create: { ownerId, memberUserId, role, status: 'pending', requestedById: ownerId } as never,
      update: { role, status: 'pending', requestedById: ownerId } as never,
    }).catch(async (e) => {
      // Fallback if upsert composite where isn't available on the offline client.
      const existing = await this.household.findFirst({ where: { ownerId, memberUserId } }).catch(() => null);
      if (existing) return this.household.update({ where: { id: existing.id }, data: { role, status: 'pending', requestedById: ownerId } as never });
      return this.household.create({ data: { ownerId, memberUserId, role, status: 'pending', requestedById: ownerId } as never }).catch(() => { throw e; });
    });

    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }).catch(() => null);
    return {
      invited: { id: res.user.id, handle: res.user.handle, name: res.user.name, image: res.user.profileImage, role },
      message: `${owner?.name ?? 'Someone'} has invited you to join their Household in Nutrition Hub.`,
      household: await this.familyMembers(ownerId),
    };
  }

  /** Invitations awaiting THIS user's response (the in-app notification list). */
  async householdInvites(userId: string) {
    const links = await this.household.findMany({ where: { memberUserId: userId, status: 'pending' } }).catch(() => [] as HouseholdMemberRow[]);
    if (!links.length) return [] as unknown[];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: links.map((l) => l.ownerId) } }, select: { id: true, name: true, handle: true, profileImage: true },
    }).catch(() => []);
    const by = new Map(owners.map((o) => [o.id, o]));
    return links.map((l) => {
      const o = by.get(l.ownerId);
      return {
        id: l.id, ownerId: l.ownerId, role: l.role, createdAt: l.createdAt,
        from: { name: o?.name ?? 'A citizen', handle: o?.handle ?? '', image: o?.profileImage ?? null },
        message: `${o?.name ?? 'Someone'} has invited you to join their Household in Nutrition Hub.`,
      };
    });
  }

  /** Accept or decline a household invitation (only the invitee may respond). */
  async respondHouseholdInvite(userId: string, inviteId: string, accept: boolean) {
    const link = await this.household.findUnique({ where: { id: inviteId } }).catch(() => null);
    if (!link) throw new NotFoundException('Invitation not found.');
    if (link.memberUserId !== userId) throw new ForbiddenException('This invitation is not addressed to you.');
    if (link.status !== 'pending') throw new BadRequestException('This invitation has already been answered.');
    await this.household.update({ where: { id: inviteId }, data: { status: accept ? 'accepted' : 'declined' } as never });
    if (accept) await this.syncHouseholdMirrors(link.ownerId);   // bring their profile into the owner's household
    return { ok: true, status: accept ? 'accepted' : 'declined', invites: await this.householdInvites(userId) };
  }

  /** End a Household Connection (owner only). The mirror is removed; any social
   *  relationship between the two users is left completely untouched. */
  async removeHouseholdMember(ownerId: string, memberUserId: string) {
    const link = await this.household.findFirst({ where: { ownerId, memberUserId } }).catch(() => null);
    if (link) await this.household.update({ where: { id: link.id }, data: { status: 'removed' } as never }).catch(() => undefined);
    await this.members.deleteMany({ where: { ownerId, memberUserId } }).catch(() => undefined);
    return this.familyMembers(ownerId);
  }

  // ─────────────── privacy: household sharing permissions ───────────────
  /** What the current user shares with households they belong to. Medical data is
   *  private by default; the planner still uses it server-side for safe portioning. */
  async getHouseholdSharing(userId: string): Promise<HouseholdSharing> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
    return parseSharing(parseExtras((pref as { extras?: string | null } | null)?.extras).householdSharing);
  }

  /** Update the current user's sharing permissions (applies wherever they're a member). */
  async setHouseholdSharing(userId: string, patch: Partial<HouseholdSharing>): Promise<HouseholdSharing> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
    if (!pref) throw new NotFoundException('Set up your Nutrition profile first.');
    const extras = parseExtras((pref as { extras?: string | null }).extras);
    const next = parseSharing({ ...(extras.householdSharing ?? {}), ...patch });
    extras.householdSharing = next;
    await this.prisma.foodPref.update({ where: { userId }, data: { extras: JSON.stringify(extras) } as never });
    return next;
  }

  // ─────────────── shared pantry (one per household) ───────────────
  /** The household pantry, grouped into supermarket aisles with on-hand amounts. */
  async pantryList(ownerId: string) {
    const rows = await this.pantry.findMany({ where: { ownerId }, orderBy: { name: 'asc' } }).catch(() => [] as PantryItemRow[]);
    const grouped = new Map<string, PantryItemRow[]>();
    for (const r of rows) { const arr = grouped.get(r.aisle) ?? []; arr.push(r); grouped.set(r.aisle, arr); }
    const aisles = GROCERY_AISLES
      .filter((a) => (grouped.get(a.key) ?? []).length)
      .map((a) => ({
        key: a.key, icon: a.icon, title: a.title,
        items: (grouped.get(a.key) ?? []).map((r) => ({ id: r.id, name: r.name, grams: r.grams, qtyLabel: r.qtyLabel || standardQty(r.name, r.grams, r.aisle).label, unit: r.unit, updatedAt: r.updatedAt })),
      }));
    return { aisles, itemCount: rows.length };
  }

  /** Add (or top up) a pantry item — canonicalises the name + picks its aisle/unit. */
  async addPantryItem(ownerId: string, nameRaw: string, gramsRaw?: number) {
    const name = canonicalIngredient(nameRaw);
    if (!name || skipGroceryIngredient(nameRaw)) throw new BadRequestException('Enter a real grocery item.');
    const aisle = groceryAisle(name);
    const grams = Math.max(0, Math.round(Number(gramsRaw) || 0));
    const existing = await this.pantry.findFirst({ where: { ownerId, name } }).catch(() => null);
    if (existing) {
      const total = existing.grams + grams;
      await this.pantry.update({ where: { id: existing.id }, data: { grams: total, qtyLabel: standardQty(name, total, aisle).label, unit: standardQty(name, total, aisle).unit } as never });
    } else {
      const q = standardQty(name, grams || 1, aisle);
      await this.pantry.create({ data: { ownerId, name, aisle, grams, unit: q.unit, qtyLabel: q.label } as never });
    }
    return this.pantryList(ownerId);
  }

  /** Set an item's on-hand quantity (grams). Zero or less removes it. */
  async updatePantryItem(ownerId: string, id: string, grams: number) {
    const existing = await this.pantry.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('pantry item not found');
    const g = Math.max(0, Math.round(Number(grams) || 0));
    if (g <= 0) await this.pantry.delete({ where: { id } });
    else await this.pantry.update({ where: { id }, data: { grams: g, qtyLabel: standardQty(existing.name, g, existing.aisle).label } as never });
    return this.pantryList(ownerId);
  }

  async removePantryItem(ownerId: string, id: string) {
    const existing = await this.pantry.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('pantry item not found');
    await this.pantry.delete({ where: { id } });
    return this.pantryList(ownerId);
  }

  /** Stock the pantry from the current grocery list (the "groceries ordered" event). */
  async stockPantryFromGrocery(ownerId: string, mode: PlanMode = 'family') {
    const plan = await this.groceryPlan(ownerId, mode);
    for (const aisle of plan.aisles) {
      for (const it of aisle.items) {
        await this.addPantryItem(ownerId, String(it.name), Number((it as { grams?: number }).grams) || 0).catch(() => undefined);
      }
    }
    return this.pantryList(ownerId);
  }

  /** Best-effort: fold ordered grocery items into the pantry when an order is placed. */
  private async stockPantryFromItems(ownerId: string, items: { name: string; grams?: number }[]) {
    for (const it of items) await this.addPantryItem(ownerId, it.name, it.grams ?? 0).catch(() => undefined);
  }

  /**
   * Per-member portions for a day of the FAMILY plan (Family Stage 2). One shared
   * dish per meal, scaled to each member's own calorie target for that slot — so
   * the family cooks once and each person's plate hits their personal target.
   * Portions scale by (member's slot kcal ÷ the shared dish's kcal), clamped to a
   * sensible range. Protein scales with the portion, so a kidney member's lowered
   * protein target already gives them a smaller share.
   */
  async familyPortions(userId: string, dayIndex: number) {
    await this.familyMembers(userId); // ensure the self profile is seeded
    const rows = await this.members.findMany({ where: { ownerId: userId }, orderBy: [{ isSelf: 'desc' }, { createdAt: 'asc' }] }).catch(() => [] as FamilyMemberRow[]);
    const members = rows.map((m) => {
      const ex = parseExtras(m.extras);
      const conditions = ex.healthConditions ?? [];
      const t = computeTargets({ weightKg: m.weightKg, heightCm: m.heightCm, age: m.age, sex: m.sex, activity: m.activity, goal: m.goal, conditions });
      return { id: m.id, name: m.name, role: m.role, diet: m.diet as Diet, isSelf: m.isSelf, dayKcal: t.kcal, perMeal: t.perMeal, conditions };
    });

    const latest = await this.prisma.mealPlan.findFirst({ where: { userId, mode: 'family' }, orderBy: { createdAt: 'desc' } });
    if (!latest) return { members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, dayKcal: m.dayKcal })), meals: [] };

    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: latest.key } },
      include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) return { members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, dayKcal: m.dayKcal })), meals: [] };

    const opts = await this.plateOptsFor(userId);
    const tg = await this.targets(userId);
    const dyn = perMealTargets(this.dayMealInputs(day.meals), tg.kcal);
    const SLOT_NAME: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };

    const meals = [...day.meals]
      .filter((m) => !m.skipped)
      .sort((a, b) => NutritionService.SLOT_ORDER[a.slot] - NutritionService.SLOT_ORDER[b.slot])
      .map((meal) => {
        const slot = meal.slot as 'b' | 'l' | 's' | 'd';
        const mealTarget = dyn[slot as 'l' | 'd'] ?? tg.perMeal[slot]?.kcal;
        const n = this.mealMacros(meal.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, slot, dayIndex, opts, mealTarget);
        const shape = this.recipeShape(meal.recipe);
        const refKcal = Math.max(1, n.kcal);
        const baseGrams = Math.max(1, shape.gramsPerServing);
        // Stage 3: shared base, protein split per member's diet. Find the dish's
        // swappable protein (the animal protein, or paneer for a vegan swap).
        const dishProteins = detectProteins(meal.recipe as unknown as RecipeWithIng);
        const dishAnimal = [...dishProteins].find((t) => ANIMAL_PROTEINS.has(t));
        const dishSwap = dishAnimal ?? (dishProteins.has('paneer') ? 'paneer' : null);
        const plantFor = (diet: Diet): string => (diet === 'vegan' || diet === 'jainvegan') ? 'Tofu' : diet === 'pesc' ? 'Fish' : 'Paneer';

        const perMember = members.map((mem) => {
          const memSlotKcal = mem.perMeal[slot]?.kcal ?? refKcal;
          const factor = Math.min(1.8, Math.max(0.45, memSlotKcal / refKcal));
          // Diet substitution: same gravy, swap the protein when the member's diet
          // can't eat the shared dish (veg member in a non-veg family, etc.).
          const canEat = dietAllows(mem.diet, shape.diet as Diet);
          const swap = (!canEat && dishSwap) ? { from: PROTEIN_LABEL_DISPLAY[dishSwap] ?? dishSwap, to: plantFor(mem.diet) } : null;
          // Medical variation of the SAME meal (not a different dish).
          const c = mem.conditions.map((x) => x.toLowerCase());
          const hasC = (...k: string[]) => k.some((x) => c.some((v) => v.includes(x)));
          const note = hasC('kidney', 'renal', 'ckd') ? 'low sodium · lighter protein'
            : hasC('hypertension', 'blood pressure') ? 'low sodium'
              : hasC('diabetes') ? 'less rice, more veg' : null;
          return {
            memberId: mem.id, name: mem.name, role: mem.role, factor: Math.round(factor * 100) / 100,
            grams: Math.round(baseGrams * factor), kcal: Math.round(n.kcal * factor), protein: Math.round(n.protein * factor),
            swap, note,
          };
        });
        return { slot, slotName: SLOT_NAME[slot] ?? slot, name: shape.name, sharedBase: perMember.some((p) => p.swap), refKcal: Math.round(n.kcal), perMember };
      });

    return { members: members.map((m) => ({ id: m.id, name: m.name, role: m.role, dayKcal: m.dayKcal })), meals };
  }

  /**
   * Family dashboard (Family Stage 5). Even though the household shares meals,
   * each member is validated INDEPENDENTLY: their projected daily intake (summed
   * from their own portions of the shared meals) is checked against their own
   * targets — calories, protein, and medical limits (e.g. protein above a
   * kidney-safe target is flagged). Returns a per-member summary + a family roll-up.
   */
  async familyDashboard(userId: string, dayIndex = 0) {
    await this.familyMembers(userId);
    const rows = await this.members.findMany({ where: { ownerId: userId }, orderBy: [{ isSelf: 'desc' }, { createdAt: 'asc' }] }).catch(() => [] as FamilyMemberRow[]);
    const members = rows.map((m) => {
      const ex = parseExtras(m.extras);
      const conditions = (ex.healthConditions ?? []).map((c) => c.toLowerCase());
      const t = computeTargets({ weightKg: m.weightKg, heightCm: m.heightCm, age: m.age, sex: m.sex, activity: m.activity, goal: m.goal, conditions: ex.healthConditions ?? [] });
      return { id: m.id, name: m.name, role: m.role, diet: m.diet, isSelf: m.isSelf, conditions, target: t, consumed: { kcal: 0, protein: 0, fiber: 0 } };
    });

    const latest = await this.prisma.mealPlan.findFirst({ where: { userId, mode: 'family' }, orderBy: { createdAt: 'desc' } });
    let hasPlan = false, mealsPerDay = 0;
    if (latest) {
      const day = await this.prisma.mealPlanDay.findFirst({
        where: { dayIndex, plan: { key: latest.key } },
        include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
      });
      if (day) {
        hasPlan = true;
        const active = day.meals.filter((m) => !m.skipped);
        mealsPerDay = active.length;
        const opts = await this.plateOptsFor(userId);
        const tg = await this.targets(userId);
        const dyn = perMealTargets(this.dayMealInputs(day.meals), tg.kcal);
        for (const meal of active) {
          const slot = meal.slot as 'b' | 'l' | 's' | 'd';
          const mealTarget = dyn[slot as 'l' | 'd'] ?? tg.perMeal[slot]?.kcal;
          const n = this.mealMacros(meal.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, slot, dayIndex, opts, mealTarget);
          const refKcal = Math.max(1, n.kcal);
          for (const mem of members) {
            const factor = Math.min(1.8, Math.max(0.45, (mem.target.perMeal[slot]?.kcal ?? refKcal) / refKcal));
            mem.consumed.kcal += n.kcal * factor;
            mem.consumed.protein += n.protein * factor;
            mem.consumed.fiber += n.fiber * factor;
          }
        }
      }
    }

    const summary = members.map((m) => {
      const kc = Math.round(m.consumed.kcal), pr = Math.round(m.consumed.protein), fb = Math.round(m.consumed.fiber);
      const kcalPct = m.target.kcal ? Math.round((kc / m.target.kcal) * 100) : 0;
      const proteinPct = m.target.protein ? Math.round((pr / m.target.protein) * 100) : 0;
      const calorieStatus = !hasPlan ? 'none' : kcalPct > 112 ? 'over' : kcalPct < 88 ? 'under' : 'on';
      const proteinStatus = !hasPlan ? 'none' : proteinPct > 120 ? 'over' : proteinPct < 80 ? 'low' : 'met';
      const flags: string[] = [];
      const kidney = m.conditions.some((c) => /kidney|renal|ckd/.test(c));
      if (hasPlan && kidney && proteinPct > 110) flags.push('Protein above the kidney-safe target — give a smaller protein portion');
      if (hasPlan && calorieStatus === 'over') flags.push('Projected calories above target');
      if (hasPlan && proteinStatus === 'low') flags.push('Protein below target');
      return {
        id: m.id, name: m.name, role: m.role, diet: m.diet, isSelf: m.isSelf,
        target: { kcal: m.target.kcal, protein: m.target.protein, fiber: m.target.fiber },
        consumed: { kcal: kc, protein: pr, fiber: fb },
        kcalPct, proteinPct, calorieStatus, proteinStatus,
        medicalOk: flags.length === 0, flags, adjustments: m.target.adjustments,
      };
    });

    const okCount = summary.filter((s) => s.medicalOk).length;
    return {
      hasPlan, mealsPerDay, memberCount: members.length,
      familyStatus: !hasPlan ? 'none' : okCount === summary.length ? 'all-on-track' : 'needs-attention',
      members: summary,
    };
  }

  /**
   * Family Compatibility Score (0–100) — how easily the household can share one
   * cooked meal. Deterministic (no AI): starts at 100 and deducts for the things
   * that force divergence — multiple protein swaps, vegan-vs-dairy splits, strict
   * medical restrictions (kidney needs low-sodium/low-potassium), spread of goals
   * and allergies. It also recommends the SMALLEST number of extra dishes needed
   * so the family still eats together instead of five separate plans.
   */
  private familyCompatibility(members: { diet: string; goal: string; healthConditions: string[]; allergies?: string }[]) {
    if (members.length <= 1) {
      return { score: 100, level: 'high' as const, extraDishesRecommended: 0, reasons: [] as string[], recommendation: 'Just you for now — every meal fits.' };
    }
    const proteinFor = (d: string) => d === 'vegan' ? 'tofu' : (d === 'veg' || d === 'jain') ? 'paneer' : d === 'egg' ? 'egg' : d === 'pesc' ? 'fish' : 'meat';
    const proteins = new Set(members.map((m) => proteinFor(m.diet)));
    const hasVegan = members.some((m) => m.diet === 'vegan');
    const hasDairyEater = members.some((m) => m.diet !== 'vegan');
    const conds = members.flatMap((m) => (m.healthConditions ?? []).map((c) => c.toLowerCase()));
    const renalMembers = members.filter((m) => (m.healthConditions ?? []).some((c) => /kidney|renal|ckd/i.test(c))).length;
    const otherConds = [...new Set(conds.filter((c) => /diabet|hypertens|blood pressure|cholesterol|fatty liver|pcos|thyroid/.test(c)))];
    const allergens = [...new Set(members.flatMap((m) => (m.allergies ? m.allergies.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [])))];
    const goals = new Set(members.map((m) => m.goal));

    const reasons: string[] = [];
    let score = 100;
    if (proteins.size > 1) { score -= (proteins.size - 1) * 6; reasons.push(`${proteins.size} different proteins to plate (${[...proteins].join(', ')}) — handled by swapping the protein on a shared base.`); }
    if (hasVegan && hasDairyEater) { score -= 6; reasons.push('A vegan member needs a dairy-free protein (tofu) while others have paneer — a simple protein swap, not a separate dish.'); }
    if (renalMembers > 0) { score -= 10 * renalMembers; reasons.push(`${renalMembers} member${renalMembers > 1 ? 's need' : ' needs'} kidney-safe cooking (low sodium, lower protein, low-potassium veg) — best served as one lightly-adapted portion.`); }
    if (otherConds.length) { score -= otherConds.length * 3; reasons.push(`Medical tweaks for ${otherConds.join(', ')} — mostly seasoning and side adjustments on the same meal.`); }
    if (allergens.length) { score -= allergens.length * 4; reasons.push(`Allergen${allergens.length > 1 ? 's' : ''} to avoid (${allergens.join(', ')}) across the shared base.`); }
    if (goals.has('lose') && goals.has('gain')) { score -= 4; reasons.push('Goals span weight-loss and gain — same dish, different portion sizes.'); }
    score = Math.max(30, Math.min(100, Math.round(score)));

    // Smallest number of extra dishes: only genuinely base-incompatible needs
    // (advanced kidney/renal) warrant a separate prep; everything else is a
    // portion/protein/seasoning tweak on the one shared base.
    const extraDishesRecommended = renalMembers > 0 ? 1 : 0;
    const level = score >= 80 ? 'high' as const : score >= 60 ? 'moderate' as const : 'low' as const;
    const recommendation = extraDishesRecommended === 0
      ? 'One shared base works for the whole family — just swap proteins and adjust portions per person.'
      : `Cook the shared base plus ${extraDishesRecommended} adapted dish (a low-sodium, low-potassium option for kidney-safe eating) so everyone still eats together — no need for separate meal plans.`;
    return { score, level, extraDishesRecommended, reasons, recommendation };
  }

  /**
   * Family Profile — the household's central planning object. It AGGREGATES every
   * member (never merges or overwrites their private profiles): head-count by life
   * stage, the union of diets / conditions / allergies / cuisines, household goals,
   * budget & cadence, and a shared health-dashboard roll-up. Individual medical
   * data stays on each member; this is the household-level view.
   */
  async familyProfile(userId: string, dayIndex = 0) {
    // Aggregates use REAL member data (unattributed), so privacy redaction never
    // corrupts household planning numbers. Condition/allergy chips still respect
    // each member's sharing choice.
    const raw = await this.householdRaw(userId);
    const real = raw.map(({ row, sharing }) => {
      const ex = parseExtras(row.extras);
      const t = computeTargets({ weightKg: row.weightKg, heightCm: row.heightCm, age: row.age, sex: row.sex, activity: row.activity, goal: row.goal, conditions: ex.healthConditions ?? [] });
      return { age: row.age, diet: row.diet, goal: row.goal, isSelf: row.isSelf, sharesConditions: row.isSelf || sharing.conditions,
        conditions: ex.healthConditions ?? [], allergies: ex.allergies ?? '', cuisines: ex.cuisines ?? [], targets: t };
    });
    const dash = await this.familyDashboard(userId, dayIndex);
    const [owner, ownerPref] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null),
      this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null),
    ]);
    const ownerExtras = parseExtras((ownerPref as { extras?: string | null } | null)?.extras);

    const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];
    const seniors = real.filter((m) => m.age >= 60).length;
    const children = real.filter((m) => m.age < 18).length;
    const adults = real.length - seniors - children;

    const dietLabel: Record<string, string> = { everything: 'Non-veg', nonveg: 'Non-veg', veg: 'Veg', vegan: 'Vegan', egg: 'Egg', pesc: 'Pescatarian', jain: 'Jain' };
    const dietTypes = uniq(real.map((m) => dietLabel[m.diet] ?? m.diet));
    // Only surface conditions/allergies for members who share them (+ the owner).
    const conditions = uniq(real.filter((m) => m.sharesConditions).flatMap((m) => m.conditions));
    const allergies = uniq(real.filter((m) => m.sharesConditions).flatMap((m) => (m.allergies ? m.allergies.split(',') : [])));
    const cuisines = uniq(real.flatMap((m) => m.cuisines ?? []));
    const goalLabel: Record<string, string> = { lose: 'Weight loss', maintain: 'Maintain', gain: 'Build / gain' };
    const goals = uniq(real.map((m) => goalLabel[m.goal] ?? m.goal));

    const n = Math.max(1, real.length);
    const avgKcal = Math.round(real.reduce((s, m) => s + m.targets.kcal, 0) / n);
    const avgProtein = Math.round(real.reduce((s, m) => s + m.targets.protein, 0) / n);
    const avgFiber = Math.round(real.reduce((s, m) => s + m.targets.fiber, 0) / n);
    const totalKcal = real.reduce((s, m) => s + m.targets.kcal, 0);

    const medicalAlerts = dash.members.flatMap((m) => m.flags.map((flag) => ({ member: m.name, flag })));
    const nutritionScore = dash.hasPlan ? Math.round((dash.members.filter((m) => m.medicalOk).length / n) * 100) : null;

    // Latest household grocery cost, if a family cart exists.
    const cart = await this.prisma.groceryCart.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { items: true } }).catch(() => null);
    const weeklyGroceryCost = cart?.items?.reduce((s, it) => s + ((it as { priceInr?: number }).priceInr ?? 0), 0) ?? 0;

    const compatibility = this.familyCompatibility(real.map((m) => ({ diet: m.diet, goal: m.goal, healthConditions: m.conditions, allergies: m.allergies })));

    return {
      name: owner?.name ? `${owner.name.split(' ')[0]}'s Household` : 'Your Household',
      counts: { total: real.length, adults, children, seniors },
      dietTypes, conditions, allergies, cuisines, goals,
      compatibility,
      weeklyBudgetInr: ownerExtras.budgetInr ?? null,
      cookingFrequency: dash.hasPlan ? `${dash.mealsPerDay} meals/day` : 'Not set',
      groceryFrequency: 'Weekly',
      summary: {
        members: real.length,
        avgCalories: avgKcal, avgProtein, avgFiber, totalCalories: totalKcal,
        goals, medicalAlerts,
        weeklyGroceryCostInr: weeklyGroceryCost,
        nutritionScore,
        adherenceScore: dash.hasPlan ? Math.max(0, Math.min(100, nutritionScore ?? 0)) : null,
        mealCompletion: dash.hasPlan ? 100 : 0,
        status: dash.familyStatus,
      },
    };
  }

  /**
   * Family Health command centre (Medical Hub → Family Profiles). A high-level,
   * permission-gated overview of every household member's health, read from each
   * person's OWN Medical Hub data (blood markers, tests, records, consults) — the
   * dashboard never owns or duplicates the records. Deterministic (no per-open
   * AI): the snapshot is derived from each member's latest markers + profile, so
   * it's consistent across hubs. Redacts to "Private" per each member's sharing.
   */
  async familyHealth(userId: string) {
    const raw = await this.householdRaw(userId);
    const uids = raw.map((r) => r.row.memberUserId).filter((x): x is string => Boolean(x));
    const P = this.prisma as unknown as {
      bloodMarker: { findMany(a: unknown): Promise<{ userId: string; key: string; value: number; updatedAt: Date }[]> };
      medicalBloodTest: { findMany(a: unknown): Promise<{ userId: string; takenOn: Date }[]> };
      medicalRecord: { findMany(a: unknown): Promise<{ userId: string; recordedOn: Date }[]> };
      consult: { findMany(a: unknown): Promise<{ userId: string; scheduledAt: Date | null; createdAt: Date }[]> };
    };
    const [markers, tests, records, consults] = await Promise.all([
      uids.length ? P.bloodMarker.findMany({ where: { userId: { in: uids } } }).catch(() => []) : Promise.resolve([]),
      uids.length ? P.medicalBloodTest.findMany({ where: { userId: { in: uids } }, orderBy: { takenOn: 'desc' } }).catch(() => []) : Promise.resolve([]),
      uids.length ? P.medicalRecord.findMany({ where: { userId: { in: uids } }, orderBy: { recordedOn: 'desc' } }).catch(() => []) : Promise.resolve([]),
      uids.length ? P.consult.findMany({ where: { userId: { in: uids } }, orderBy: { createdAt: 'desc' } }).catch(() => []) : Promise.resolve([]),
    ]);
    const markersBy = new Map<string, { key: string; value: number; updatedAt: Date }[]>();
    for (const m of markers) { const a = markersBy.get(m.userId) ?? []; a.push(m); markersBy.set(m.userId, a); }
    const firstBy = <T extends { userId: string }>(rows: T[]) => { const map = new Map<string, T>(); for (const r of rows) if (!map.has(r.userId)) map.set(r.userId, r); return map; };
    const lastTest = firstBy(tests), lastRecord = firstBy(records), lastConsult = firstBy(consults);
    const recordCount = new Map<string, number>();
    for (const r of records) recordCount.set(r.userId, (recordCount.get(r.userId) ?? 0) + 1);

    const ROLE_LABEL: Record<string, string> = { owner: 'Self', self: 'Self', father: 'Father', mother: 'Mother', spouse: 'Spouse', son: 'Son', daughter: 'Daughter', child: 'Child', grandparent: 'Grandparent', adult: 'Adult', guest: 'Guest', member: 'Member' };
    const clean = (s: string) => s.replace(/\(.*?\)/g, '').trim();

    const members = raw.map(({ row, image, sharing }) => {
      const uid = row.memberUserId ?? '';
      const ex = parseExtras(row.extras);
      const conditions = ex.healthConditions ?? [];
      const shareMed = row.isSelf || sharing.bloodTests;   // blood tests / score / alerts / reports
      const shareDx = row.isSelf || sharing.conditions;    // diagnoses / conditions
      const shareNut = row.isSelf || sharing.targets;

      const mrows = markersBy.get(uid) ?? [];
      const values: Record<string, number> = {};
      for (const m of mrows) values[m.key] = m.value;
      const crp = values['crp'];
      const flagged: { label: string; status: string; key: string }[] = [];
      const positives: string[] = [];
      for (const rule of MARKER_RULES) {
        if (!(rule.key in values)) continue;
        const { status } = evaluateMarker(rule, values[rule.key], crp);
        if (status !== 'normal') flagged.push({ label: rule.label, status, key: rule.key });
        else positives.push(rule.label);
      }
      const crit = criticalAlerts(values);
      const hasMarkers = mrows.length > 0;
      const healthScore = hasMarkers ? Math.max(40, Math.min(100, 100 - flagged.length * 8 - crit.length * 12)) : null;

      const alerts = shareMed ? [
        ...crit.map((c) => ({ label: c.label, level: 'red' as const })),
        ...flagged.filter((f) => !crit.some((c) => c.key === f.key)).map((f) => ({ label: `${clean(f.label)} ${f.status === 'high' ? 'High' : 'Low'}`, level: 'orange' as const })),
      ].slice(0, 6) : [];

      const snap: string[] = [];
      if (shareDx) snap.push(...conditions.slice(0, 4));
      if (shareMed) {
        snap.push(...flagged.slice(0, 4).map((f) => `${f.status === 'high' ? 'Elevated' : 'Low'} ${clean(f.label)}`));
        if (positives.length && snap.length < 7) snap.push(`Healthy ${clean(positives[0])}`);
      }
      if (row.goal === 'lose') snap.push('Weight loss in progress');
      if (row.goal === 'gain') snap.push('Building lean mass');
      const snapshot = [...new Set(snap)].slice(0, 8);

      let status: 'excellent' | 'good' | 'attention' | 'follow-up';
      if (crit.length || (shareMed && flagged.length >= 3)) status = 'follow-up';
      else if (conditions.length || flagged.length) status = 'attention';
      else if (!hasMarkers && conditions.length === 0) status = 'good';
      else if ((healthScore ?? 0) >= 85) status = 'excellent';
      else status = 'good';

      const nutritionScore = Math.max(60, Math.min(100, 100 - conditions.length * 8));
      const lastBTd = lastTest.get(uid)?.takenOn ?? (hasMarkers ? mrows.reduce((mx, m) => (m.updatedAt > mx ? m.updatedAt : mx), mrows[0].updatedAt) : null);
      const lastRepd = lastRecord.get(uid)?.recordedOn ?? null;
      const lc = lastConsult.get(uid);
      const lastVisd = lc ? (lc.scheduledAt ?? lc.createdAt) : null;
      const monthsSince = lastBTd ? (Date.now() - new Date(lastBTd).getTime()) / (1000 * 60 * 60 * 24 * 30) : Infinity;
      const bloodTestDue = shareMed ? monthsSince > 6 : false;

      return {
        id: row.id, userId: uid || null, name: row.name, image, age: row.age, sex: row.sex,
        relationship: ROLE_LABEL[row.role] ?? (row.isSelf ? 'Self' : 'Member'),
        isSelf: row.isSelf, canUpload: row.isSelf, medicalHubPath: row.isSelf ? '/medical/records' : null,
        privacy: { bloodTests: !shareMed, reports: !shareMed, diagnoses: !shareDx, summary: !(shareMed || shareDx), nutrition: !shareNut },
        lastBloodTest: lastBTd ? new Date(lastBTd).toISOString() : null,
        lastReport: lastRepd ? new Date(lastRepd).toISOString() : null,
        lastVisit: lastVisd ? new Date(lastVisd).toISOString() : null,
        reportCount: recordCount.get(uid) ?? 0,
        bloodTestDue,
        healthScore: shareMed ? healthScore : null,
        nutritionScore: shareNut ? nutritionScore : null,
        status,
        snapshot,
        alerts,
        latestDiagnosis: shareDx && conditions.length ? conditions[0] : (shareMed && flagged.length ? `${clean(flagged[0].label)} ${flagged[0].status}` : null),
        nextTest: shareMed ? (flagged.length || crit.length ? 'Recommended in ~3 months' : 'Recommended in ~12 months') : null,
        reminder: shareMed && bloodTestDue ? 'Blood test overdue — book a retest' : null,
      };
    });

    const withScore = members.filter((m) => m.healthScore != null);
    const avgHealth = withScore.length ? Math.round(withScore.reduce((s, m) => s + (m.healthScore ?? 0), 0) / withScore.length) : null;
    const nutScores = members.filter((m) => m.nutritionScore != null);
    const avgNut = nutScores.length ? Math.round(nutScores.reduce((s, m) => s + (m.nutritionScore ?? 0), 0) / nutScores.length) : null;
    const summary = {
      members: members.length,
      chronicConditions: members.filter((m) => Boolean(m.latestDiagnosis)).length,
      bloodTestsDue: members.filter((m) => m.bloodTestDue).length,
      reportsUploaded: [...recordCount.values()].reduce((a, b) => a + b, 0),
      avgHealthScore: avgHealth,
      nutritionScore: avgNut,
      reminders: members.filter((m) => m.reminder).map((m) => `${m.name.split(' ')[0]}: ${m.reminder}`),
    };
    return { summary, members };
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

  /**
   * Load the weekly plan. A saved plan is a DOCUMENT, not a live regeneration:
   * once it exists we always return it exactly as saved (with the user's edits)
   * and NEVER auto-regenerate — not even when preferences change. The user
   * regenerates explicitly (Regenerate / Start Fresh). `stale` merely flags that
   * preferences changed since the plan was made so the UI can offer a
   * "Regenerate to apply" prompt.
   *
   * `readOnly` is set by the Daily Meal Planner, which must NEVER create a plan —
   * it's only a view of the saved week. When no plan exists it returns
   * `needsPlan` and the Daily view directs the user to the Weekly planner. The
   * Weekly planner (readOnly=false) bootstraps a first plan when none exists.
   */
  async weeklyPlan(userId: string, mode: PlanMode = 'individual', readOnly = false) {
    const status = await this.profileStatus(userId);
    if (!status.complete) {
      return { incomplete: true, missing: status.missing, key: '', days: [], guidance: null };
    }
    const currentMon = weekMonday(new Date());
    const plans = await this.prisma.mealPlan.findMany({ where: { userId, mode }, orderBy: { createdAt: 'desc' } }) as unknown as Array<{ key: string; weekStart?: Date | null; createdAt: Date }>;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const current = plans.find((p) => this.planWeek(p).getTime() === currentMon.getTime());

    // No plan for the current week.
    if (!current) {
      // Daily never generates — but if a past week is saved, show that (most
      // recent) so today's plate isn't empty; otherwise point to the Weekly planner.
      if (readOnly) {
        const latest = plans[0];
        if (!latest) return { needsPlan: true, key: '', days: [], stale: false, isCurrentWeek: false, guidance: null, advisories: [] };
        const plan = await this.shapePlan(latest.key);
        const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
        return { ...plan, stale: false, isCurrentWeek: false, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
      }
      // Weekly planner: a new calendar week with no plan → generate it (a NEW
      // week; every other saved week is preserved).
      const plan = await this.generatePlan(userId, mode, currentMon);
      const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
      return { ...plan, stale: false, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
    }

    // The current week is a saved DOCUMENT: load it as-is, never auto-regenerate.
    const stale = Boolean(pref && current.createdAt < pref.updatedAt);
    const plan = await this.shapePlan(current.key);
    const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
    return { ...plan, stale, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
  }

  /** Explicit regeneration — replaces the CURRENT week only (Regenerate / Start Fresh). */
  async regenerate(userId: string, mode: PlanMode = 'individual') {
    const status = await this.profileStatus(userId);
    if (!status.complete) {
      return { incomplete: true, missing: status.missing, key: '', days: [], guidance: null };
    }
    const plan = await this.generatePlan(userId, mode, weekMonday(new Date()));
    const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
    return { ...plan, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
  }

  /** Every saved week for the user — the calendar/timeline (newest week first). */
  async weeks(userId: string, mode: PlanMode = 'individual') {
    const currentMon = weekMonday(new Date());
    const plans = await this.prisma.mealPlan.findMany({
      where: { userId, mode }, orderBy: { createdAt: 'desc' },
      include: { days: { select: { _count: { select: { meals: true } } } } },
    }) as unknown as Array<{ key: string; weekStart?: Date | null; createdAt: Date; days: Array<{ _count: { meals: number } }> }>;
    // One entry per calendar week (keep the newest plan if a week somehow dupes).
    const byWeek = new Map<number, { key: string; weekStart: string; weekEnd: string; weekLabel: string; weekNumber: number; isCurrent: boolean; meals: number; createdAt: string }>();
    for (const p of plans) {
      const mon = this.planWeek(p); const t = mon.getTime();
      if (byWeek.has(t)) continue;
      const sun = addDays(mon, 6);
      byWeek.set(t, {
        key: p.key, weekStart: isoDate(mon), weekEnd: isoDate(sun),
        weekLabel: weekRangeLabel(mon, sun), weekNumber: isoWeekNumber(mon),
        isCurrent: t === currentMon.getTime(),
        meals: p.days.reduce((s, d) => s + d._count.meals, 0),
        createdAt: p.createdAt.toISOString(),
      });
    }
    return [...byWeek.values()].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  }

  /** Load ONE saved week by its key (owner-checked) — for the timeline/revisit view. */
  async weekByKey(userId: string, key: string) {
    await this.assertOwnsPlan(key, userId);
    const plan = await this.shapePlan(key);
    const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
    const currentMon = weekMonday(new Date());
    const isCurrentWeek = plan.weekStart === isoDate(currentMon);
    return { ...plan, isCurrentWeek, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
  }

  /** Generate a brand-new week WITHOUT touching existing weeks. Defaults to the
   *  current calendar week if it has no plan, otherwise the week after the most
   *  recent saved week. */
  async newWeek(userId: string, mode: PlanMode = 'individual', weekStart?: string) {
    const status = await this.profileStatus(userId);
    if (!status.complete) return { incomplete: true, missing: status.missing, key: '', days: [], guidance: null };
    const plans = await this.prisma.mealPlan.findMany({ where: { userId, mode }, orderBy: { createdAt: 'desc' } }) as unknown as Array<{ weekStart?: Date | null; createdAt: Date }>;
    const currentMon = weekMonday(new Date());
    const weeks = new Set(plans.map((p) => this.planWeek(p).getTime()));
    let target: Date;
    if (weekStart) target = weekMonday(new Date(weekStart));
    else if (!weeks.has(currentMon.getTime())) target = currentMon;
    else {
      const latest = plans.length ? this.planWeek(plans[0]) : currentMon;
      target = addDays(latest.getTime() >= currentMon.getTime() ? latest : currentMon, 7);
    }
    const plan = await this.generatePlan(userId, mode, target);
    const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
    return { ...plan, isCurrentWeek: this.planWeek({ weekStart: target, createdAt: target }).getTime() === currentMon.getTime(), guidance, advisories: adv.advisories, healthScore: adv.healthScore };
  }

  /** Copy a saved week's meals into a NEW week (default: the next empty week). */
  async duplicateWeek(userId: string, mode: PlanMode, sourceKey: string, weekStart?: string) {
    await this.assertOwnsPlan(sourceKey, userId);
    const src = await this.prisma.mealPlan.findUnique({
      where: { key: sourceKey },
      include: { days: { include: { meals: true } } },
    });
    if (!src) throw new NotFoundException('week not found');
    const plans = await this.prisma.mealPlan.findMany({ where: { userId, mode }, orderBy: { createdAt: 'desc' } }) as unknown as Array<{ weekStart?: Date | null; createdAt: Date }>;
    const currentMon = weekMonday(new Date());
    const weeks = new Set(plans.map((p) => this.planWeek(p).getTime()));
    let target = weekStart ? weekMonday(new Date(weekStart)) : (weeks.has(currentMon.getTime()) ? addDays(this.planWeek(plans[0]), 7) : currentMon);
    while (weeks.has(target.getTime())) target = addDays(target, 7); // never clobber an existing week
    const key = 'wk_' + this.rand(8);
    await this.prisma.mealPlan.create({
      data: {
        key, userId, mode,
        days: {
          create: src.days.map((d) => ({
            dayIndex: d.dayIndex, dayName: d.dayName,
            meals: { create: d.meals.map((m) => ({ slot: m.slot, recipeId: m.recipeId, skipped: m.skipped, sidesRice: m.sidesRice, sidesRoti: m.sidesRoti, sidesCurd: m.sidesCurd, sidesSalad: m.sidesSalad })) },
          })),
        },
      },
    });
    await this.prisma.mealPlan.update({ where: { key }, data: { weekStart: target } as never }).catch(() => undefined);
    await this.snapshotWeek(userId, mode, key);
    const plan = await this.shapePlan(key);
    const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
    return { ...plan, isCurrentWeek: target.getTime() === currentMon.getTime(), guidance, advisories: adv.advisories, healthScore: adv.healthScore };
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

  /**
   * Medical advisory system (spec §21). Evidence-based recommendations derived
   * from the user's declared conditions + blood flags, shown as ADVICE — never
   * used to override the saved Food Preference Profile. The meal plan always
   * follows the user's own choices; these cards suggest optional improvements
   * with an "Update Food Preferences" / "Keep Current" decision left to the user.
   * Levels: 1 Informational · 2 Recommended · 3 Safety alert (safety-only).
   */
  private async advisoriesFor(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId));
    const conds = new Set((ex.healthConditions ?? []).map((c) => c.toLowerCase()));
    const has = (...k: string[]) => k.some((x) => [...conds].some((c) => c.includes(x)));
    const diet = pref?.diet ?? 'everything';
    const DIET_LABEL: Record<string, string> = {
      everything: 'Non-Vegetarian', nonveg: 'Non-Vegetarian', pesc: 'Pescatarian',
      egg: 'Eggetarian', veg: 'Vegetarian', vegan: 'Vegan', jain: 'Jain',
    };
    const dietName = DIET_LABEL[diet] ?? 'your current diet';
    const eatsAnimal = ['everything', 'nonveg', 'pesc', 'egg'].includes(diet) || eatsAnimalProtein(allowedProteins(ex));

    type Advisory = { key: string; condition: string; level: 1 | 2 | 3; title: string; message: string; actionable: boolean; recommendedPreference?: string };
    const A: Advisory[] = [];
    const kidney = has('kidney', 'renal', 'ckd');
    const fatty = has('fatty liver', 'nafld');
    const highChol = has('cholesterol') || flags.ldl === 'high' || flags.trig === 'high';
    const diabetes = has('diabetes') || flags.hba1c === 'high';
    const htn = has('hypertension', 'blood pressure');
    const pcos = has('pcos');

    if (kidney) A.push({ key: 'kidney', condition: 'Kidney health', level: 2,
      title: 'A more plant-forward diet may support your kidneys',
      message: `Based on your health profile, a predominantly vegetarian diet may be more beneficial for your kidney health. Your current meal plan has been generated according to your saved food preferences (${dietName}). To optimise kidney function, consider replacing some animal protein with paneer, tofu or legumes — or update your Food Preference Profile to Vegetarian / plant-forward. This may help reduce kidney workload while still meeting your protein requirements. Please confirm targets with your nephrologist.`,
      actionable: eatsAnimal, recommendedPreference: 'veg' });
    if (fatty) A.push({ key: 'fattyLiver', condition: 'Liver health', level: 2,
      title: 'Leaner, plant-forward meals may help your liver',
      message: `Reducing saturated fat and processed meat while increasing vegetables, legumes, whole grains and fibre may improve fatty-liver health. Your plan follows your saved preference (${dietName}); a more plant-forward pattern is worth considering.`,
      actionable: eatsAnimal, recommendedPreference: 'veg' });
    if (highChol) A.push({ key: 'highChol', condition: 'Cholesterol', level: 2,
      title: 'Swap some red meat for fish or plant proteins',
      message: `Consider replacing some red meat with fish, legumes, tofu or plant-based proteins and increasing soluble fibre. Your plan follows your saved preference (${dietName}); these swaps can help lower LDL over time.`,
      actionable: eatsAnimal, recommendedPreference: 'pesc' });
    if (diabetes) A.push({ key: 'diabetes', condition: 'Blood sugar', level: 1,
      title: 'Favour high-fibre, lower-glycaemic carbohydrates',
      message: 'Prioritise high-fibre, lower-glycaemic carbohydrates and lean protein sources while limiting added sugars and refined carbohydrates. Your plan already leans this way — no preference change needed.',
      actionable: false });
    if (htn) A.push({ key: 'hypertension', condition: 'Blood pressure', level: 1,
      title: 'Lower sodium, raise potassium',
      message: 'Reducing sodium and increasing potassium-rich foods may help support healthy blood pressure. Your plan already limits high-salt items automatically.',
      actionable: false });
    if (pcos) A.push({ key: 'pcos', condition: 'PCOS', level: 1,
      title: 'Higher-protein, high-fibre, lower-GI meals',
      message: 'A higher-protein, high-fibre diet with lower-glycaemic carbohydrates may improve insulin sensitivity and hormone balance.',
      actionable: false });

    // Health-score impact (§21): preferences are always honoured (100%); medical
    // optimisation reflects how well those choices align with the conditions.
    const preferenceMatch = 100;
    let medicalOptimisation = 100;
    for (const a of A) medicalOptimisation -= a.actionable ? (a.level === 2 ? 16 : 8) : (a.level === 2 ? 6 : 3);
    medicalOptimisation = Math.max(50, medicalOptimisation);
    const overall = Math.round(preferenceMatch * 0.45 + medicalOptimisation * 0.55);
    const misaligned = A.filter((a) => a.actionable);
    const note = misaligned.length
      ? `Your meal plan fully matches your food preferences. However, based on your ${misaligned.map((a) => a.condition.toLowerCase()).join(' & ')}, a more plant-forward diet may further improve long-term outcomes.`
      : 'Your meal plan matches both your food preferences and your medical profile.';
    return { advisories: A, healthScore: { preferenceMatch, medicalOptimisation, overall, note } };
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
      // Breakfast & snack: PREFER the user's selected animal proteins (egg/
      // chicken/fish first) without excluding veg options — a stable partition
      // keeps the clinical + cuisine order intact within each group. We honour
      // the user's food preference even with a medical condition (§21): the plan
      // follows their choice; medical guidance is shown as advice, not enforced.
      if ((slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)) {
        const withP = ordered.filter((r) => hasSelectedAnimalProtein(r, allowed));
        const without = ordered.filter((r) => !hasSelectedAnimalProtein(r, allowed));
        ordered = [...withP, ...without];
      }
      out[slot] = ordered;
    }
    return out;
  }

  /** Effective calendar week (Monday) a stored plan is FOR. */
  private planWeek(p: { weekStart?: Date | null; createdAt: Date }): Date {
    return weekMonday(p.weekStart ?? p.createdAt);
  }

  /**
   * Generate the plan for ONE calendar week. `weekStart` defaults to the current
   * week's Monday. Only the plan for THAT SAME week is replaced — every other
   * saved week is preserved as a permanent, editable record (spec: persistent
   * per-week plans, no overwriting other weeks).
   */
  private async generatePlan(userId: string, mode: PlanMode, weekStart?: Date) {
    const ws = weekMonday(weekStart ?? new Date());
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

    // Variety engine (§variety): a dietitian-style week rotates recipes, proteins,
    // carbohydrate bases AND cooking methods so no day feels like a repeat of the
    // last. Hard rules: never repeat a recipe; no protein signature more than
    // twice. Soft rotation (tried first, degrades gracefully so a slot is never
    // empty): spread carbohydrate staples and cooking styles across the week, and
    // avoid last week's recipes. Cuisine is left to the % preference bias (a hard
    // cuisine cap would fight an "Indian 70%" preference), so it follows the
    // user's declared distribution.
    const usedRecipe = new Map<string, number>();
    const usedProtein = new Map<string, number>();
    const usedCarb = new Map<string, number>();
    const usedMethod = new Map<string, number>();
    const count = (m: Map<string, number>, k: string) => m.get(k) ?? 0;
    const bump = (m: Map<string, number>, k: string) => m.set(k, count(m, k) + 1);
    const proteinSig = (r: RecipeWithIng) => [...detectProteins(r)].sort().join(',') || r.diet;
    const carbSig = (r: RecipeWithIng) => detectCarb(r);
    const methodSig = (r: RecipeWithIng) => detectMethod(r);
    // Soft caps across the whole week (28 meals). Generous enough that a narrow
    // recipe pool still fills every slot, tight enough to force real rotation.
    const CARB_CAP = 4, METHOD_CAP = 4;

    // ── Nutrition-first fit score (spec: the prescription is the CONSTRAINT and
    // the meals are the solution). The user's daily targets define ideal macro
    // DENSITIES (grams per kcal); a dish whose composition matches those
    // densities can be portioned onto the prescription exactly. Protein density
    // is weighted hardest — it's the axis condition-moderated targets (kidney)
    // and goals live on. Lower score = better fit. A small bonus rewards
    // micronutrient-rich ingredient profiles so RDAs fill up by construction.
    const tg = await this.targets(userId);
    const opts = await this.plateOptsFor(userId);
    const tD = {
      protein: tg.protein / Math.max(1, tg.kcal), carb: tg.carb / Math.max(1, tg.kcal),
      fat: tg.fat / Math.max(1, tg.kcal), fiber: tg.fiber / Math.max(1, tg.kcal),
    };
    const microRichnessCache = new Map<string, number>();
    const microRichness = (r: RecipeWithIng): number => {
      const hit = microRichnessCache.get(r.id);
      if (hit !== undefined) return hit;
      const keys = new Set(estimateDayMicros([{ recipeName: r.name, ingredients: r.ingredients, servings: 1, portionFactor: 1 }], 30, 'male')
        .filter((m) => m.intake > 0).map((m) => m.key));
      microRichnessCache.set(r.id, keys.size);
      return keys.size;
    };
    const fitScore = (r: RecipeWithIng, slot: Slot, dayIndex: number): number => {
      const mealKcal = tg.perMeal[slot as 'b' | 'l' | 's' | 'd']?.kcal ?? tg.kcal / 4;
      const n = this.mealMacros(r as never, slot, dayIndex, opts, mealKcal);
      const k = Math.max(1, n.kcal);
      return 3.0 * Math.abs(n.protein / k - tD.protein) / Math.max(0.005, tD.protein)
        + 1.0 * Math.abs(n.carbs / k - tD.carb) / Math.max(0.01, tD.carb)
        + 1.0 * Math.abs(n.fat / k - tD.fat) / Math.max(0.01, tD.fat)
        + 0.6 * Math.max(0, tD.fiber - n.fiber / k) / Math.max(0.002, tD.fiber)   // fibre: only shortfall hurts
        + 0.4 * Math.abs(n.kcal - mealKcal) / Math.max(1, mealKcal)               // portionable near its slot budget
        - 0.03 * microRichness(r);                                                // micro-dense food fills RDAs by default
    };
    const pick = (pool: RecipeWithIng[], dayIndex: number, slot: Slot, prefer?: (r: RecipeWithIng) => boolean): RecipeWithIng | undefined => {
      if (!pool.length) return undefined;
      const rot = pool.map((_, i) => pool[(i + dayIndex + offset) % pool.length]);
      const fresh = (r: RecipeWithIng) => count(usedRecipe, r.id) < 1;                 // not used yet THIS week
      const varied = (r: RecipeWithIng) => fresh(r) && count(usedProtein, proteinSig(r)) < 2;
      const newWeek = (r: RecipeWithIng) => !recentIds.has(r.id);                        // not in LAST week's plan
      // Most-diverse: also spread the carbohydrate base and cooking method so we
      // don't serve rice every meal or curry every day.
      const diverse = (r: RecipeWithIng) => varied(r) && newWeek(r)
        && count(usedCarb, carbSig(r)) < CARB_CAP
        && count(usedMethod, methodSig(r)) < METHOD_CAP;
      // Within each variety tier, take the BEST NUTRITIONAL FIT among the first
      // dozen candidates — not merely the first hit. Tiers still degrade
      // gracefully so a slot is never left empty.
      const bestOf = (pred: (r: RecipeWithIng) => boolean): RecipeWithIng | undefined => {
        const cands: RecipeWithIng[] = [];
        for (const r of rot) { if (pred(r)) { cands.push(r); if (cands.length >= 12) break; } }
        if (!cands.length) return undefined;
        let best = cands[0], bestS = fitScore(cands[0], slot, dayIndex);
        for (let i = 1; i < cands.length; i++) {
          const s = fitScore(cands[i], slot, dayIndex);
          if (s < bestS) { best = cands[i]; bestS = s; }
        }
        return best;
      };
      const chosen =
        (prefer ? bestOf((r) => diverse(r) && prefer(r)) : undefined) ??
        bestOf(diverse) ??
        (prefer ? bestOf((r) => varied(r) && newWeek(r) && prefer(r)) : undefined) ??
        bestOf((r) => varied(r) && newWeek(r)) ??
        (prefer ? bestOf((r) => varied(r) && prefer(r)) : undefined) ??
        bestOf(varied) ??
        (prefer ? bestOf((r) => fresh(r) && prefer(r)) : undefined) ??
        bestOf(fresh) ??
        rot[0];
      bump(usedRecipe, chosen.id);
      bump(usedProtein, proteinSig(chosen));
      bump(usedCarb, carbSig(chosen));
      bump(usedMethod, methodSig(chosen));
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
        // fish), falling back to a veg option only if none fits (spec §7). The
        // user's preference is honoured regardless of medical conditions (§21).
        // Preference nudge for breakfast/snack, but nutrition-fit decides among
        // the preferred candidates — and when the prescription is protein-capped
        // (kidney), density fit naturally steers toward lighter dishes.
        const prefer = (slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)
          ? (r: RecipeWithIng) => hasSelectedAnimalProtein(r, allowed)
          : undefined;
        const r = pick(list, d, slot, prefer);
        if (r) picks[d][slot] = r;
      }
    }

    // ── target optimization (§targets): solve portions per day, swap when portions
    // alone can't reach the goals. Plates self-size; tg/opts already loaded above.
    const portions: Record<number, Record<string, number>> = {};
    for (let d = 0; d < DAYS.length; d++) {
      const daySlots = SLOTS.filter((sl) => picks[d][sl]);
      const buildItems = (): DayItemForOpt[] => daySlots.map((sl) => {
        const r = picks[d][sl] as RecipeWithIng;
        const mealTarget = tg.perMeal[sl as 'b' | 'l' | 's' | 'd']?.kcal;
        const base = this.mealMacros(r as never, sl, d, opts, mealTarget);
        const isPlate = /india/i.test(r.country) && (sl === 'l' || sl === 'd');
        return { slot: sl, ...base, ...(isPlate ? { minPct: 100, maxPct: 100 } : {}) };
      });
      let items = buildItems();
      let sol = solveDayPortions(items, tg);
      // Swap stage — portion scaling comes first (solveDayPortions escalates to
      // 300% before we get here); replacement only runs when scaling can't
      // close the gap or the day is still >3% off balance. Acceptance is
      // floor-first: a combination that fixes a calorie/protein shortfall
      // always beats one that is merely "closer"; once floors pass, lower
      // worst-deviation wins (which also walks protein back toward
      // condition-capped targets). Same hard-filtered pools — the safety/
      // condition constraints live inside the pool, so a swap can never
      // violate them.
      // Repair loop — the plan is INVALID until every nutrient sits inside its
      // tolerance band (a 66 g protein target must never ship a 189 g day).
      // Acceptance is lexicographic: fix floors first, then band violations
      // (composition swaps toward dishes whose density matches the targets),
      // then plain closeness. Up to two sweeps over the slots, wide alternate
      // pool; same hard-filtered pools, so a swap can never violate the
      // safety/condition constraints.
      const valid = () => sol.deficit <= 0 && sol.violation <= 0 && sol.worst <= 3;
      if (!valid()) {
        const dayVeg = ex.weekly?.[SHORT_DAYS[d]] === 'veg';
        const pools = dayVeg ? vegRanked : baseRanked;
        for (let sweep = 0; sweep < 2 && !valid(); sweep++) {
          for (const sl of daySlots) {
            if (valid()) break;
            const isPlate = /india/i.test((picks[d][sl] as RecipeWithIng).country) && (sl === 'l' || sl === 'd');
            if (isPlate) continue;
            const original = picks[d][sl] as RecipeWithIng;
            // Candidates sorted by nutritional fit to the prescription — the
            // repair tries the dishes MOST LIKELY to fix the violated band
            // first, instead of walking the pool in rank order.
            const alternates = (pools[sl] ?? [])
              .filter((r) => r.id !== original.id && count(usedRecipe, r.id) < (sweep === 0 ? 1 : 2))
              .slice(0, 160)
              .map((r) => ({ r, s: fitScore(r, sl, d) }))
              .sort((a, b) => a.s - b.s)
              .slice(0, sweep === 0 ? 24 : 40)
              .map((x) => x.r);
            for (const alt of alternates) {
              picks[d][sl] = alt;
              const tryItems = buildItems();
              const trySol = solveDayPortions(tryItems, tg);
              const better = trySol.deficit < sol.deficit - 0.1
                || (trySol.deficit <= sol.deficit && trySol.violation < sol.violation - 0.1)
                || (trySol.deficit <= sol.deficit && trySol.violation <= 0 && sol.violation <= 0 && trySol.worst < sol.worst - 0.5);
              if (better) { sol = trySol; items = tryItems; bump(usedRecipe, alt.id); }
              else picks[d][sl] = original;
              if (valid()) break;
            }
          }
        }
        // recompute once more with the final picks
        items = buildItems();
        sol = solveDayPortions(items, tg);
      }
      portions[d] = sol.pcts;
    }

    // One plan per user+mode — clear old ones so the profile stays the source of truth.
    // Replace ONLY the plan for this same calendar week (preserve other weeks).
    const owned = await this.prisma.mealPlan.findMany({ where: { userId, mode } }) as unknown as Array<{ id: string; weekStart?: Date | null; createdAt: Date }>;
    const sameWeekIds = owned.filter((p) => this.planWeek(p).getTime() === ws.getTime()).map((p) => p.id);
    if (sameWeekIds.length) await this.prisma.mealPlan.deleteMany({ where: { id: { in: sameWeekIds } } });

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
                  portionPct: portions[dayIndex]?.[slot] ?? 100,
                  sidesRice: withSides ? (slot === 'l' ? 1 : 0) : 0,
                  sidesRoti: withSides ? 2 : 0,
                  sidesCurd: slot === 'l' ? 1 : 0,
                  sidesSalad: withSides ? 1 : 0,
                } as never;
              }),
            },
          })),
        },
      },
    });
    // Tag the plan with the calendar week it's for (the offline Prisma client
    // doesn't know the new column, hence the cast).
    await this.prisma.mealPlan.update({ where: { key }, data: { weekStart: ws } as never }).catch(() => undefined);
    // Permanently record this week in the user's nutrition history (spec §19) —
    // best-effort, never blocks serving the plan.
    await this.snapshotWeek(userId, mode, key);
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

  /**
   * Re-optimize one day's portions against the owner's daily targets. Runs after
   * generation, every refresh, and every skip — so the Daily Nutrition Overview
   * is always the OPTIMIZED total, never an accident of per-serving sizes.
   * Health/condition constraints live upstream (recipe filtering + computeTargets
   * adjustments) and are never relaxed here.
   */
  private async rebalanceDay(planKey: string, dayIndex: number): Promise<void> {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { plan: { select: { userId: true } }, meals: { include: { recipe: true } } },
    });
    if (!day) return;
    const tg = await this.targets(day.plan.userId);
    const opts = await this.plateOptsFor(day.plan.userId);
    const dyn = perMealTargets(this.dayMealInputs(day.meals as never), tg.kcal);
    const active = day.meals.filter((m) => !m.skipped);
    if (!active.length) return;
    const items: DayItemForOpt[] = active.map((m) => {
      const mealTarget = dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal;
      const base = this.mealMacros(m.recipe as never, m.slot, dayIndex, opts, mealTarget);
      const isPlate = /india/i.test((m.recipe as { country: string }).country) && (m.slot === 'l' || m.slot === 'd');
      return { slot: m.slot, ...base, ...(isPlate ? { minPct: 100, maxPct: 100 } : {}) };
    });
    // Floor-guaranteed solve: after a skip/refresh the remaining meals scale up
    // (to 300% if needed) so the end-of-day totals still reach ≥95% of the
    // calorie & protein targets. Plates self-size through their dynamic budget.
    const { pcts } = solveDayPortions(items, tg);
    await Promise.all(active.map((m) =>
      this.prisma.meal.update({ where: { id: m.id }, data: { portionPct: pcts[m.slot] ?? 100 } as never }).catch(() => undefined),
    ));
  }

  /** Ownership guard — a meal plan may only be read/mutated by the user it belongs to. */
  private async assertOwnsPlan(planKey: string, userId: string): Promise<void> {
    const plan = await this.prisma.mealPlan.findUnique({ where: { key: planKey }, select: { userId: true } });
    if (!plan) throw new NotFoundException('plan not found');
    if (plan.userId !== userId) throw new ForbiddenException('That meal plan is not yours.');
  }

  async daySummary(userId: string, planKey: string, dayIndex: number) {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { plan: { select: { userId: true } }, meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) throw new NotFoundException('plan day not found');
    if (day.plan.userId !== userId) throw new ForbiddenException('That meal plan is not yours.');
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
      const pf = ((m as { portionPct?: number }).portionPct ?? 100) / 100; // optimizer's portion factor
      kcal += n.kcal * pf; protein += n.protein * pf; carbs += n.carbs * pf; fat += n.fat * pf; fiber += n.fiber * pf;
      const s = recipeServings(m.recipe);
      const ing = m.recipe.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
      cost += ing > 0 ? Math.round(ing / s) : Math.round((m.recipe.kcal / s) * 0.11);
    }
    kcal = Math.round(kcal); protein = Math.round(protein); carbs = Math.round(carbs);
    fat = Math.round(fat); fiber = Math.round(fiber); cost = Math.round(cost);

    // Real micronutrient estimation from the day's ACTUAL ingredients (portion-
    // scaled), with age/sex targets and blood-marker links — replaces the old
    // placeholder coverage constants.
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const flags = flagsFor(await this.bloodValues(userId));
    const microMeals: DayMealForMicros[] = day.meals.filter((m) => !m.skipped).map((m) => ({
      recipeName: m.recipe.name,
      ingredients: m.recipe.ingredients,
      servings: recipeServings(m.recipe),
      portionFactor: ((m as { portionPct?: number }).portionPct ?? 100) / 100,
    }));
    const micros = estimateDayMicros(microMeals, pref?.age ?? 30, pref?.sex ?? 'male')
      .map((mi) => ({
        ...mi,
        markerStatus: mi.marker ? (flags[mi.marker] as string | undefined) ?? null : null,
      }));
    // fibre rides with the macros but belongs in the micro dashboard too
    const fiberTarget = tg.fiber || 36;
    micros.push({
      key: 'fiber', label: 'Fibre', unit: 'g', intake: fiber, target: fiberTarget,
      pct: Math.round((fiber / fiberTarget) * 100), marker: undefined,
      foods: ['Whole grains & millets', 'Dals & legumes', 'Vegetables with skins', 'Fruit (guava, apple)', 'Seeds'],
      topSources: [], markerStatus: null,
    });

    // Legacy coverage map (old clients) — now driven by the real estimates.
    const coverage = Object.fromEntries(micros.map((mi) => [mi.key, Math.max(0, Math.min(200, mi.pct))]));
    coverage.protein = Math.round((protein / Math.max(1, tg.protein)) * 100);

    return { kcal, protein, carbs, fat, fiber, cost, coverage, micros };
  }

  // ─────────────── nutrition history (spec §19) ───────────────
  /** Snapshot the just-generated week into permanent, versioned nutrition
   *  history. Immutable — never overwrites prior weeks. Wrapped so a snapshot
   *  failure can never break serving the plan (history is secondary). */
  private async snapshotWeek(userId: string, mode: PlanMode, key: string): Promise<void> {
    try {
      const plan = await this.prisma.mealPlan.findUnique({
        where: { key },
        include: {
          days: {
            orderBy: { dayIndex: 'asc' },
            include: { meals: { orderBy: { slot: 'asc' }, include: { recipe: { include: { ingredients: true } } } } },
          },
        },
      });
      if (!plan) return;
      const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
      const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
      const opts = await this.plateOptsFor(userId);
      const tg = await this.targets(userId);
      const latestBlood = await (this.prisma as unknown as {
        bloodAnalysis: { findFirst(a: unknown): Promise<{ analysisVersion: string; analyzedAt: Date } | null> };
      }).bloodAnalysis.findFirst({ where: { userId }, orderBy: { analyzedAt: 'desc' }, select: { analysisVersion: true, analyzedAt: true } }).catch(() => null);

      const slotOrder = NutritionService.SLOT_ORDER;
      const recipeIds = new Set<string>();
      const proteinDist: Record<string, number> = {};
      const cuisineDist: Record<string, number> = {};
      let mealCount = 0;

      // Real calendar dates (spec §20) — Mon→Sun anchored to the plan's week.
      const mon = weekMonday((plan as { weekStart?: Date | null }).weekStart ?? plan.createdAt);
      const sun = addDays(mon, 6);

      const days = plan.days.map((d) => {
        const dyn = perMealTargets(this.dayMealInputs(d.meals), tg.kcal);
        const dayDate = addDays(mon, d.dayIndex);
        let dk = 0, dp = 0, dc = 0, df = 0, dfi = 0, dcost = 0;
        const meals = [...d.meals].sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot]).map((m) => {
          const shape = this.recipeShape(m.recipe);
          const mealTarget = dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal;
          const n = this.mealMacros(m.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, m.slot, d.dayIndex, opts, mealTarget);
          const s = recipeServings(m.recipe);
          const ing = m.recipe.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
          const cost = ing > 0 ? Math.round(ing / s) : Math.round((m.recipe.kcal / s) * 0.11);
          if (!m.skipped) {
            dk += n.kcal; dp += n.protein; dc += n.carbs; df += n.fat; dfi += n.fiber; dcost += cost;
            mealCount++;
            recipeIds.add(m.recipeId);
            const psig = [...detectProteins(m.recipe as unknown as RecipeWithIng)].sort().join('+') || m.recipe.diet;
            proteinDist[psig] = (proteinDist[psig] ?? 0) + 1;
            const cuisine = /india/i.test(m.recipe.country) ? 'Indian' : (m.recipe.country || 'Other');
            cuisineDist[cuisine] = (cuisineDist[cuisine] ?? 0) + 1;
          }
          return {
            slot: m.slot, recipeId: m.recipeId, recipeName: shape.name, cuisine: m.recipe.country,
            diet: m.recipe.diet, minutes: shape.minutes, cost, skipped: m.skipped,
            kcal: Math.round(n.kcal), protein: Math.round(n.protein), carbs: Math.round(n.carbs),
            fat: Math.round(n.fat), fiber: Math.round(n.fiber),
            interactions: { generated: true, viewed: false, cooked: false, skipped: m.skipped, refreshed: false, rated: null, liked: false, disliked: false, favourite: false, notes: '' },
          };
        });
        return {
          day: d.dayName, dayIndex: d.dayIndex,
          date: isoDate(dayDate),
          dateLabel: `${d.dayName}, ${dayDate.getDate()} ${MONTHS[dayDate.getMonth()]} ${dayDate.getFullYear()}`,
          totals: { kcal: Math.round(dk), protein: Math.round(dp), carbs: Math.round(dc), fat: Math.round(df), fiber: Math.round(dfi), cost: Math.round(dcost) },
          target: { kcal: tg.kcal, protein: tg.protein, carbs: tg.carb, fat: tg.fat, fiber: tg.fiber },
          meals,
        };
      });

      const weeklyTotals = days.reduce((a, d) => ({
        kcal: a.kcal + d.totals.kcal, protein: a.protein + d.totals.protein, carbs: a.carbs + d.totals.carbs,
        fat: a.fat + d.totals.fat, fiber: a.fiber + d.totals.fiber, cost: a.cost + d.totals.cost,
      }), { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, cost: 0 });

      // Variety score: distinct recipes / meals served (0..100).
      const recipeVariety = mealCount ? Math.round((recipeIds.size / mealCount) * 100) : 0;
      const cuisineVariety = Object.keys(cuisineDist).length;
      const proteinVariety = Object.keys(proteinDist).length;

      const weekNumber = isoWeekNumber(mon);
      const weekLabel = weekRangeLabel(mon, sun);
      // One record per calendar week: replace any existing snapshot for this same
      // week (regenerating a week updates its entry, it doesn't pile up). Earlier
      // weeks are preserved — that's the historical record.
      await this.history.deleteMany({ where: { userId, mode, weekLabel } }).catch(() => undefined);
      const sequence = (await this.history.count({ where: { userId, mode } }).catch(() => 0)) + 1;

      await this.history.create({
        data: {
          userId, mode, planKey: key, weekNumber, weekLabel,
          startDate: mon, endDate: sun,
          targets: JSON.stringify(tg),
          context: JSON.stringify({
            diet: pref?.diet ?? 'everything', goal: pref?.goal ?? 'maintain',
            medicalConditions: ex.healthConditions ?? [],
            cuisineMix: ex.cuisineMix ?? (ex.cuisines?.length ? Object.fromEntries(ex.cuisines.map((c) => [c, 1])) : {}),
            weeklySchedule: ex.weekly ?? {},
            bloodVersion: latestBlood?.analysisVersion ?? null,
            bloodAnalyzedAt: latestBlood?.analyzedAt ?? null,
            profileVersion: pref?.updatedAt ?? null,
            adjustments: tg.adjustments ?? [],
            sequence, // the user's Nth generated week (ordering aid)
          }),
          days: JSON.stringify(days),
          weekly: JSON.stringify({
            totals: weeklyTotals,
            averages: { kcal: Math.round(weeklyTotals.kcal / 7), protein: Math.round(weeklyTotals.protein / 7) },
            variety: { recipeVarietyPct: recipeVariety, cuisineVariety, proteinVariety, distinctRecipes: recipeIds.size, mealsServed: mealCount },
            cuisineDistribution: cuisineDist,
            proteinDistribution: proteinDist,
          }),
          cost: weeklyTotals.cost,
        },
      });
    } catch {
      /* history is best-effort — never block plan generation */
    }
  }

  /** List a user's stored weekly plans (newest first) — compact summaries. One
   *  entry per calendar week: collapse any legacy same-week duplicates to the
   *  newest and delete the rest (self-healing cleanup of pre-dedup history). */
  async nutritionHistory(userId: string, mode?: PlanMode) {
    const all = await this.history.findMany({
      where: mode ? { userId, mode } : { userId },
      orderBy: { createdAt: 'desc' },
      take: 400,
    }).catch(() => [] as NutritionHistoryRow[]);
    const kept = new Map<string, NutritionHistoryRow>();
    const stale: string[] = [];
    for (const r of all) {
      const k = `${r.mode}|${r.weekLabel}`;
      if (kept.has(k)) stale.push(r.id); else kept.set(k, r); // newest wins (desc order)
    }
    if (stale.length) await this.history.deleteMany({ where: { id: { in: stale } } }).catch(() => undefined);
    const rows = [...kept.values()].slice(0, 104);
    return rows.map((r) => {
      const weekly = safeJson<{ totals?: Record<string, number>; variety?: Record<string, number> }>(r.weekly, {});
      const context = safeJson<Record<string, unknown>>(r.context, {});
      return {
        id: r.id, mode: r.mode, weekNumber: r.weekNumber, weekLabel: r.weekLabel,
        startDate: r.startDate, endDate: r.endDate, createdAt: r.createdAt, cost: r.cost,
        totals: weekly.totals ?? {}, variety: weekly.variety ?? {},
        diet: context.diet ?? null, cuisineMix: context.cuisineMix ?? {},
      };
    });
  }

  /** Full stored week — every day, meal, macro and the context it was built in. */
  async nutritionHistoryDetail(userId: string, id: string) {
    const r = await this.history.findUnique({ where: { id } }).catch(() => null);
    if (!r || r.userId !== userId) throw new NotFoundException('history entry not found');
    return {
      id: r.id, mode: r.mode, weekNumber: r.weekNumber, weekLabel: r.weekLabel,
      startDate: r.startDate, endDate: r.endDate, createdAt: r.createdAt, cost: r.cost,
      targets: safeJson(r.targets, {}), context: safeJson(r.context, {}),
      days: safeJson(r.days, []), weekly: safeJson(r.weekly, {}),
    };
  }

  // ─────────────── swap + sides ───────────────
  async swap(userId: string, planKey: string, dayIndex: number, slot: Slot, restoreRecipeId?: string) {
    await this.assertOwnsPlan(planKey, userId);
    const meal = await this.findMeal(planKey, dayIndex, slot);

    // Undo a refresh — restore a specific earlier recipe the user was shown before.
    // Must be a real recipe for this same slot, so the plate/macros stay coherent.
    if (restoreRecipeId) {
      const target = await this.prisma.recipe.findUnique({ where: { id: restoreRecipeId }, select: { id: true, slot: true } });
      if (!target || target.slot !== slot) throw new BadRequestException('That recipe cannot be restored for this slot.');
      await this.prisma.meal.update({ where: { id: meal.id }, data: { recipeId: target.id, skipped: false } });
      await this.rebalanceDay(planKey, dayIndex);
      return this.shapePlan(planKey);
    }

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
      if ((slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)) {
        // Breakfast/snack refresh: keep the user's selected animal proteins first
        // (spec §7 & §16) so a refresh never drops a non-veg user to a vegan dish
        // when an egg/chicken option exists.
        const withP = rankPool.filter((r) => hasSelectedAnimalProtein(r, allowed));
        if (withP.length) rankPool = withP;
      }
      const ranked = rankPool.sort((a, b) => protein(b) - protein(a));
      const top = ranked.slice(0, Math.max(1, Math.ceil(ranked.length / 3)));
      const pick = top[Math.floor(Math.random() * top.length)];
      await this.prisma.meal.update({ where: { id: meal.id }, data: { recipeId: pick.id, skipped: false } });
    }
    // A refresh changes the day's macro mix — rebalance every portion so the
    // daily totals stay on target.
    await this.rebalanceDay(planKey, dayIndex);
    return this.shapePlan(planKey);
  }

  /** Skip / un-skip a meal for the day. */
  async setSkip(userId: string, planKey: string, dayIndex: number, slot: Slot, skipped: boolean) {
    await this.assertOwnsPlan(planKey, userId);
    const meal = await this.findMeal(planKey, dayIndex, slot);
    await this.prisma.meal.update({ where: { id: meal.id }, data: { skipped } });
    // Skipping frees calories — the remaining meals grow (portions up to 180%)
    // to recover the day's targets; un-skipping shrinks them back.
    await this.rebalanceDay(planKey, dayIndex);
    return this.shapePlan(planKey);
  }

  async setSides(userId: string, planKey: string, dayIndex: number, slot: Slot, sides: { rice: number; roti: number; curd: number; salad: number }) {
    await this.assertOwnsPlan(planKey, userId);
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

    // Ingredient quantities in the DB are BATCH totals (the whole recipe yield).
    // Scale them down to ONE plate so the list matches the plate weight/macros the
    // rest of the app shows — otherwise a 284 g plate lists 1,134 g of an
    // ingredient. Scale by plateWeight / totalRecipeWeight so the scaled list sums
    // to ~the plate weight (spec); fall back to ÷ servings if the batch weight is
    // unknown. Grocery already scales the same way (ing.grams / servings), so the
    // two surfaces agree.
    const totalRecipeWeight = r.ingredients.reduce((sum, i) => sum + Math.max(0, i.grams || 0), 0);
    const plateWeight = shape.gramsPerServing;
    const factor = totalRecipeWeight > 0
      ? plateWeight / totalRecipeWeight
      : 1 / Math.max(1, shape.servings);
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const perPlateIngredients = r.ingredients.map((i) => ({
      name: i.name,
      grams: round1(Math.max(0, i.grams || 0) * factor),
      priceInr: Math.round(Math.max(0, i.priceInr || 0) * factor),
    }));

    return {
      ...shape,
      // Per-ONE-plate ingredient quantities (the UI multiplies by the chosen serving count).
      ingredients: perPlateIngredients,
      plateWeight,               // grams on a single plate (== gramsPerServing)
      totalRecipeWeight,         // full-batch weight the scaling was derived from
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
    // The v2 dataset ships pre-written cooking steps — build the structured cook
    // steps from them deterministically (timers + attention inferred by rule), so
    // there is NO AI cost. Cache the result the first time it's viewed.
    const pre = (r as { steps?: string | null }).steps;
    if (pre) {
      try {
        const arr = JSON.parse(pre) as Array<string | { text?: string; instruction?: string }>;
        const texts = Array.isArray(arr)
          ? arr.map((s) => (typeof s === 'string' ? s : (s?.instruction ?? s?.text ?? ''))).filter((t) => typeof t === 'string' && t.trim())
          : [];
        if (texts.length) {
          const result: CookStep[] = texts.slice(0, 14).map((raw) => {
            const text = raw.trim();
            const durationSec = secondsFromText(text);
            return { text, durationSec, active: isActiveStep(text, durationSec) };
          });
          await this.prisma.recipe.update({ where: { id: r.id }, data: { cookSteps: JSON.stringify(result) } as never }).catch(() => undefined);
          return result;
        }
      } catch { /* fall through to AI/fallback */ }
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
  /** Title-case an ingredient for display ("brown rice" → "Brown Rice"). */
  private static prettyIngredient(name: string): string {
    return name.trim().replace(/\s+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Supermarket-style grocery list (Grocery Planner redesign). Computed from the
   * active plan: cooking-only items removed, names normalised to canonical
   * shopping items, quantities merged in real units, grouped into supermarket
   * aisles, with a per-recipe "used in" breakdown and a recipe view. Not stored.
   */
  async groceryPlan(userId: string, mode: PlanMode = 'individual') {
    const latest = await this.prisma.mealPlan.findFirst({ where: { userId, mode }, orderBy: { createdAt: 'desc' } });
    if (!latest) return { aisles: [], recipes: [], itemCount: 0 };
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key: latest.key },
      include: { days: { include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
    });
    if (!plan) return { aisles: [], recipes: [], itemCount: 0 };

    // Household scaling factor. Individual = 1. Family = the SUM of each member's
    // portion multiplier (their daily calorie target ÷ a 2,000-kcal standard
    // serving), NOT a flat headcount. So a recipe that serves 2 scales to the
    // real number of portions the household eats (spec: Step 1–3).
    const REF_KCAL = 2000;
    let scale = 1;
    let memberScales: { name: string; dailyKcal: number; multiplier: number }[] = [];
    if (mode === 'family') {
      const raw = await this.householdRaw(userId);
      memberScales = raw.map(({ row }) => {
        const ex = parseExtras(row.extras);
        const t = computeTargets({ weightKg: row.weightKg, heightCm: row.heightCm, age: row.age, sex: row.sex, activity: row.activity, goal: row.goal, conditions: ex.healthConditions ?? [] });
        return { name: row.name, dailyKcal: t.kcal, multiplier: Math.round((t.kcal / REF_KCAL) * 100) / 100 };
      });
      scale = Math.max(1, memberScales.reduce((s, m) => s + m.multiplier, 0));
    }

    type Acc = { name: string; grams: number; usedIn: Map<string, number> };
    const items = new Map<string, Acc>();               // canonicalKey → merged item
    const recipeView = new Map<string, Map<string, number>>(); // recipeName → canonical → grams
    // Meal counts for the shopping summary.
    const slotCounts: Record<string, number> = { b: 0, l: 0, s: 0, d: 0 };
    const activeDays = plan.days.length;
    const headcount = mode === 'family' ? Math.max(1, memberScales.length) : 1;
    for (const day of plan.days) {
      for (const meal of day.meals) {
        if (meal.skipped) continue;
        slotCounts[meal.slot] = (slotCounts[meal.slot] ?? 0) + headcount;   // meals served = per-slot × people
        const s = recipeServings(meal.recipe);
        const rname = cleanRecipeName(meal.recipe.name);
        for (const ing of meal.recipe.ingredients) {
          if (skipGroceryIngredient(ing.name)) continue;      // drop water/salt/to-taste/garnish…
          const canon = canonicalIngredient(ing.name);
          if (!canon) continue;
          const grams = Math.max(0, Math.round((ing.grams / s) * scale));   // per-serving × household portions
          if (grams <= 0) continue;
          const key = canon.toLowerCase();
          const cur = items.get(key) ?? { name: canon, grams: 0, usedIn: new Map() };
          cur.grams += grams; cur.usedIn.set(rname, (cur.usedIn.get(rname) ?? 0) + grams);
          items.set(key, cur);
          const rv = recipeView.get(rname) ?? new Map();
          rv.set(canon, (rv.get(canon) ?? 0) + grams); recipeView.set(rname, rv);
        }
      }
    }

    // Group into supermarket aisles with standardised units, shelf info + a
    // recommended retail pack. Also tally required-vs-pack grams for waste + cost.
    const AISLES = GROCERY_AISLES;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    let requiredG = 0, packG = 0, estCostInr = 0;
    for (const it of items.values()) {
      const cat = groceryAisle(it.name);
      const q = standardQty(it.name, it.grams, cat);
      const pack = recommendedPack(it.name, it.grams, cat);
      const shelf = SHELF_INFO[cat] ?? { life: '', tip: '' };
      requiredG += it.grams; packG += Math.max(pack.grams, it.grams);
      estCostInr += ((COST_PER_KG[cat] ?? 90) * Math.max(pack.grams, it.grams)) / 1000;
      const entry = {
        name: it.name, aisle: cat, qtyLabel: q.label, unit: q.unit, grams: it.grams,
        pack: pack.label,                       // recommended purchase (retail pack)
        shelfLife: shelf.life, storageTip: shelf.tip,
        usedIn: [...it.usedIn.entries()].sort((a, b) => b[1] - a[1]).map(([recipe, g]) => ({ recipe, qtyLabel: standardQty(it.name, g, cat).label })),
      };
      const arr = grouped.get(cat) ?? []; arr.push(entry); grouped.set(cat, arr);
    }
    const aisles = AISLES
      .filter((a) => (grouped.get(a.key) ?? []).length)
      .map((a) => ({ key: a.key, icon: a.icon, title: a.title, note: a.note, items: (grouped.get(a.key) ?? []).sort((x, y) => String(x.name).localeCompare(String(y.name))) }));

    const recipes = [...recipeView.entries()].map(([recipe, ings]) => ({
      recipe,
      items: [...ings.entries()].map(([name, g]) => ({ name, qtyLabel: standardQty(name, g, groceryAisle(name)).label })).sort((a, b) => a.name.localeCompare(b.name)),
    }));

    const wastePct = packG > 0 ? Math.round(((packG - requiredG) / packG) * 1000) / 10 : 0;
    const summary = {
      householdSize: headcount,
      days: activeDays,
      meals: { breakfast: slotCounts.b, lunch: slotCounts.l, dinner: slotCounts.d, snacks: slotCounts.s },
      estimatedCostInr: Math.round(estCostInr),
      wastePct,                                  // overage from rounding to retail packs
      scale: Math.round(scale * 100) / 100,      // total household portions per serving
      members: memberScales,                     // per-member portion multipliers
    };

    return { aisles, recipes, itemCount: items.size, summary };
  }

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
    // Keyed by NORMALISED name so "Tomato" and "tomato" merge into one line
    // (spec: duplicate ingredients must always be merged into a single total).
    const totals = new Map<string, { name: string; grams: number; price: number }>();
    // Household headcount — 1 plate per person (individual = 1, family = N).
    const people = Math.max(1, Math.min(30, Math.round(opts.people ?? 1)));
    // Stored ingredients are whole-batch, so divide by the recipe's servings to
    // get one plate, then multiply by headcount. A plate can't be zero-grams, so
    // round up per ingredient after scaling.
    const addRecipe = (recipe: { slot?: string; kcal: number; gramsPerServing: number; ingredients: Array<{ name: string; grams: number; priceInr: number }> }) => {
      const s = recipeServings(recipe);
      const factor = people / s;
      for (const ing of recipe.ingredients) {
        const norm = ing.name.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!norm) continue;
        const cur = totals.get(norm) ?? { name: NutritionService.prettyIngredient(ing.name), grams: 0, price: 0 };
        cur.grams += Math.max(1, Math.round(ing.grams * factor));
        cur.price += Math.round(ing.priceInr * factor);
        totals.set(norm, cur);
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
    return this.writeCart(userId, totals);
  }

  /** Replace the user's grocery list from a merged {name → grams+price} map:
   *  classify each line by shelf life and format a human-readable amount. Shared
   *  by the individual and family grocery builders. */
  private async writeCart(userId: string, totals: Map<string, { name: string; grams: number; price: number }>) {
    await this.prisma.groceryCart.deleteMany({ where: { userId } });
    // grams/unit/qtyLabel are new columns the sandbox client type doesn't know
    // yet (offline generate) — cast the create input; runtime client has them.
    const itemsCreate = [...totals.values()].map((v) => {
      const q = formatGroceryQty(v.name, Math.round(v.grams));
      return {
        name: v.name,
        category: classifyShelf(v.name), // pantry | weekly | daily (shelf life)
        qty: q.qty, grams: Math.round(v.grams), unit: q.unit, qtyLabel: q.qtyLabel,
        priceInr: Math.round(v.price),
      };
    });
    return this.prisma.groceryCart.create({
      data: { userId, items: { create: itemsCreate as never } },
      include: { items: true },
    });
  }

  /**
   * Combined family grocery list (Family Stage 4). Instead of headcount × one
   * plate, this sums each MEMBER's actual portion of every shared meal — and
   * respects the Stage 3 protein swaps, so a vegetarian member's share of a
   * chicken dish buys paneer (not chicken) on the same gravy. One merged list.
   */
  async buildFamilyCart(userId: string) {
    await this.familyMembers(userId); // ensure self is seeded
    const rows = await this.members.findMany({ where: { ownerId: userId }, orderBy: [{ isSelf: 'desc' }, { createdAt: 'asc' }] }).catch(() => [] as FamilyMemberRow[]);
    const members = rows.map((m) => {
      const ex = parseExtras(m.extras);
      const t = computeTargets({ weightKg: m.weightKg, heightCm: m.heightCm, age: m.age, sex: m.sex, activity: m.activity, goal: m.goal, conditions: ex.healthConditions ?? [] });
      return { diet: m.diet as Diet, perMeal: t.perMeal };
    });
    if (!members.length) return this.buildCart(userId, { mode: 'family' });

    const latest = await this.prisma.mealPlan.findFirst({ where: { userId, mode: 'family' }, orderBy: { createdAt: 'desc' } });
    if (!latest) return this.buildCart(userId, { mode: 'family' });
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key: latest.key },
      include: { days: { include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
    });
    if (!plan) return this.buildCart(userId, { mode: 'family' });
    const opts = await this.plateOptsFor(userId);
    const tg = await this.targets(userId);

    const totals = new Map<string, { name: string; grams: number; price: number }>();
    const add = (name: string, grams: number, price: number) => {
      const norm = name.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!norm || grams <= 0) return;
      const cur = totals.get(norm) ?? { name: NutritionService.prettyIngredient(name), grams: 0, price: 0 };
      cur.grams += grams; cur.price += price;
      totals.set(norm, cur);
    };
    const plantFor = (diet: Diet): string => (diet === 'vegan' || diet === 'jainvegan') ? 'Tofu' : diet === 'pesc' ? 'Fish' : 'Paneer';
    const matchesToken = (ingName: string, token: string): boolean =>
      (PROTEIN_TOKENS[token] ?? [token]).some((k) => new RegExp(`\\b${k}s?\\b`, 'i').test(ingName));

    for (const day of plan.days) {
      const dyn = perMealTargets(this.dayMealInputs(day.meals), tg.kcal);
      for (const meal of day.meals) {
        if (meal.skipped) continue;
        const slot = meal.slot as 'b' | 'l' | 's' | 'd';
        const mealTarget = dyn[slot as 'l' | 'd'] ?? tg.perMeal[slot]?.kcal;
        const n = this.mealMacros(meal.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, slot, day.dayIndex, opts, mealTarget);
        const refKcal = Math.max(1, n.kcal);
        const s = recipeServings(meal.recipe);
        const dishProteins = detectProteins(meal.recipe as unknown as RecipeWithIng);
        const dishAnimal = [...dishProteins].find((t) => ANIMAL_PROTEINS.has(t));
        const dishSwap = dishAnimal ?? (dishProteins.has('paneer') ? 'paneer' : null);
        for (const mem of members) {
          const factor = Math.min(1.8, Math.max(0.45, (mem.perMeal[slot]?.kcal ?? refKcal) / refKcal));
          const needsSwap = dishSwap != null && !dietAllows(mem.diet, this.recipeShape(meal.recipe).diet as Diet);
          for (const ing of meal.recipe.ingredients) {
            const g = (ing.grams / s) * factor;
            const p = (ing.priceInr / s) * factor;
            if (needsSwap && dishSwap && matchesToken(ing.name, dishSwap)) {
              add(plantFor(mem.diet), g, p); // same portion of the swapped-in protein
            } else {
              add(ing.name, g, p);
            }
          }
        }
      }
    }
    if (!totals.size) return this.buildCart(userId, { mode: 'family' });
    return this.writeCart(userId, totals);
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
    // Ordered groceries flow into the shared household pantry.
    await this.stockPantryFromItems(userId, cart.items.map((i) => ({ name: i.name, grams: (i as { grams?: number }).grams ?? 0 }))).catch(() => undefined);
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
    fat: number; fiber: number; minutes: number; gramsPerServing: number; diet: string; slot?: string; servings?: number;
    healthGrade?: string | null; healthPercent?: number;
  }): RecipeShape {
    // 'jainvegan' is an internal filtering tag — surface it to the UI as 'vegan'
    // (it is fully plant-based) so existing diet chips/colours render correctly.
    const displayDiet = (r.diet === 'jainvegan' ? 'vegan' : r.diet) as Diet;
    // Normalise batch totals → one real single-person plate.
    const s = recipeServings(r);
    const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
    const kcal = per(r.kcal);
    // Clamp noisy dataset macros to be consistent with the (trusted) calories.
    const macro = saneMacros(kcal, per(r.protein), per(r.carbs), per(r.fat), per(r.fiber));
    return {
      id: r.id, recipeNo: (r as { recipeNo?: number | null }).recipeNo ?? null,
      name: cleanRecipeName(r.name), country: r.country,
      kcal, protein: macro.protein, carbs: macro.carbs,
      fat: macro.fat, fiber: macro.fiber, minutes: saneMinutes(r.minutes),
      gramsPerServing: Math.max(1, per(r.gramsPerServing)), diet: displayDiet,
      servings: s, healthGrade: r.healthGrade ?? null, healthPercent: r.healthPercent ?? 0,
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

    // Real calendar dates (spec §20): anchor the Mon→Sun week to the plan's
    // saved weekStart (the calendar week it's FOR), falling back to its creation
    // date for legacy plans — so every day carries an actual date.
    const mon = weekMonday((plan as { weekStart?: Date | null }).weekStart ?? plan.createdAt);
    const sun = addDays(mon, 6);

    return {
      key: plan.key,
      weekNumber: isoWeekNumber(mon),
      weekStart: isoDate(mon),
      weekEnd: isoDate(sun),
      weekLabel: weekRangeLabel(mon, sun),
      days: plan.days.map((d) => {
        // Same dynamic budgets the dashboard uses — skipped meals grow the rest.
        const dyn = perMealTargets(this.dayMealInputs(d.meals), tg.kcal);
        const date = addDays(mon, d.dayIndex);
        return {
        day: d.dayName,
        date: isoDate(date),
        dateLabel: `${d.dayName}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`,
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
            // Portion factor from the day optimizer: the card shows the SCALED
            // dish (kcal, macros, grams) so what you see is what the day counts.
            const pct = (m as { portionPct?: number }).portionPct ?? 100;
            const pf = pct / 100;
            const scaled = pct === 100 ? recipe : {
              ...recipe,
              kcal: Math.round(recipe.kcal * pf),
              protein: Math.round(recipe.protein * pf),
              carbs: Math.round(recipe.carbs * pf),
              fat: Math.round(recipe.fat * pf),
              fiber: Math.round(recipe.fiber * pf),
              gramsPerServing: Math.round((recipe.gramsPerServing ?? 0) * pf),
            };
            return {
              slot: m.slot,
              recipe: scaled,
              skipped: m.skipped,
              portionPct: pct,
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
        servings?: number; healthGrade?: string | null; healthPercent?: number;
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
            servings: r.servings ?? 0, healthGrade: r.healthGrade ?? null, healthPercent: r.healthPercent ?? 0,
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

  /**
   * One-time migration to the v2 recipe dataset (per-serving nutrition, pre-written
   * steps, health grades). The v2 file is already the shipped dataset; this replaces
   * the older batch-total rows in an existing database with it. Gated on the
   * `servings` column (v2 rows carry servings=1), so it runs once then no-ops.
   * Best-effort; never throws.
   */
  private async adoptDatasetV2(): Promise<void> {
    try {
      const migrated = await this.prisma.recipe.count({ where: { servings: { gt: 0 } } as never }).catch(() => -1);
      if (migrated < 0) return; // `servings` column not created yet (db push pending) — next boot
      const total = await this.prisma.recipe.count();
      if (total > 0 && migrated >= total * 0.9) return; // already on v2

      const candidates = [
        join(__dirname, 'data', 'recipes.dataset.json.gz'),
        join(process.cwd(), 'dist', 'nutrition', 'data', 'recipes.dataset.json.gz'),
        join(process.cwd(), 'src', 'nutrition', 'data', 'recipes.dataset.json.gz'),
      ];
      const path = candidates.find((p) => existsSync(p));
      if (!path) return;
      const data = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as Array<Record<string, unknown>>;
      if (!Array.isArray(data) || !data.length || data[0].servings == null) return; // not a v2 file

      this.logger.log(`Adopting v2 recipe dataset (${data.length} per-serving recipes) — replacing existing rows…`);
      // Meal plans reference recipes; drop them (they regenerate) so the FK clears.
      await this.prisma.mealPlan.deleteMany({});
      await this.prisma.recipe.deleteMany({});

      const RB = 500;
      for (let i = 0; i < data.length; i += RB) {
        const batch = data.slice(i, i + RB).map((r) => ({
          id: r.id, recipeNo: r.no, name: r.name, country: r.country, slot: r.slot, diet: r.diet,
          kcal: r.kcal, protein: r.protein, carbs: r.carbs, fat: r.fat, fiber: r.fiber,
          minutes: r.minutes, gramsPerServing: r.gramsPerServing,
          servings: r.servings ?? 1, healthGrade: r.healthGrade ?? null, healthPercent: r.healthPercent ?? 0,
          steps: JSON.stringify(r.steps ?? []),
        }));
        await this.prisma.recipe.createMany({ data: batch as never, skipDuplicates: true });
      }
      const ing = data.flatMap((r) => ((r.ingredients as Array<{ name: string; grams: number; priceInr?: number }>) ?? []).map((i) => ({
        recipeId: r.id as string, name: i.name, grams: i.grams, priceInr: i.priceInr ?? 0,
      })));
      const IB = 2000;
      for (let i = 0; i < ing.length; i += IB) {
        await this.prisma.recipeIngredient.createMany({ data: ing.slice(i, i + IB), skipDuplicates: true });
      }
      this.logger.log(`v2 dataset adopted: ${await this.prisma.recipe.count()} recipes in Postgres.`);
    } catch (e) {
      this.logger.warn(`v2 dataset adoption skipped: ${(e as Error).message}`);
    }
  }
}
