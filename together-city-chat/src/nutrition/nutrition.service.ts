import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { ConversationsService } from '../conversations/conversations.service';
import { FinancialService } from '../financial/financial.service';
import { AiService } from '../ai/ai.service';
import { ConnectionsService } from '../connections/connections.service';
import {
  CITATIONS, MARKER_RULES, criticalAlerts, evaluateMarker, supplementKit,
  flagsFor, planGuidance, rankByModes, planningModes, ruleFor,
  triggeredConditions, conditionsFromBlood, type MarkerStatus,
} from './clinical-engine';
import type { BloodInputDto, Diet, FoodPrefDto, PlanMode, Slot } from './dto/nutrition.dto';
import { assemblePlate, perMealTargets, type PlateOpts, type DayMealInput } from './plate';
import { estimateDayMicros, type DayMealForMicros } from './micros-engine';
import { assignDietPlans, dietPlanBias, planLabel, DIET_PLAN_CATALOG } from './diet-plans';
import { addonLabel, addonMacros, complementByKey, fillGapWithComplements, type AddonPick } from './complements';
import { auditRecipe, type QaRecipe } from './nutrition-qa';
import { buildMedicalRecs, applyPatch, type MedPrefs } from './medical-recs';
import { activeMntRules, mntRecipeBias, mntAvoidKeywords, type MntRule } from './clinical-mnt';
import { composeWeek, scaleComposedWeek, complianceReport, normCuisine, SEED_POOL, type ComposerPrefs, type Diet as ComposerDiet, type PoolRecipe } from './meal-composer';
import { scoreDual, buildScorecard, guidelineCaps } from './plan-score';
import { recipeImageUrl } from './recipe-image-set';
import { resolveSchedule, fastingSafety, categorizeRecipe, type MealCategory } from './meal-engine';
import { computeNutrients, computeMicros, isSalt } from './ingredient-nutrients';
import {
  QC_PROVIDERS, buildQcMeta, compareStores, applyBadges, refreshTotals, quoteStore, trackFromMeta,
  type QcListItem, type QcMeta, type QcStoreQuote,
} from './quick-commerce';
import { QuickCommerceClient } from './quick-commerce-client';

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
  /** Per-slot cuisine preferences + locks (Meal-Planning-Engine-Spec Rule 11/12). */
  cuisineBySlot?: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', Record<string, number>>>;
  cuisineLocks?: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'snack', boolean>>;
  /** Intermittent fasting settings (spec IF). */
  fasting?: { enabled?: boolean; protocol?: string; window?: { start: string; end: string }; mealTimes?: Record<string, string> };
  /** Grocery pantry-staple toggle (Rule 10). Default excludes pantry items. */
  includePantry?: boolean;
  /** Preferred daily delivery time for fresh items, 'HH:MM' (24h). */
  deliveryTime?: string;
  /** Last date whose meals were auto-deducted from the pantry (YYYY-MM-DD). */
  pantrySettledThrough?: string;
  /** Composed-plan per-meal overrides (Refresh/Skip). Keys "d{index}:{slotCode}". */
  composedSkips?: string[];
  composedBumps?: Record<string, number>;
  /** 3-week plan anchor: the plan runs PLAN_DAYS days from this date (YYYY-MM-DD).
   *  Lazily set to "today" on first plan, so day 0 is the day the user started. */
  planStartDate?: string;
  /** Bumped when the user starts a fresh 3-week plan, to reseed the meals. */
  planSeedBump?: number;
  /** Family-level setting (stored on the household OWNER's pref). Default ON:
   *  one shared master plan with personalised portions. OFF: every connected
   *  member gets an independent AI plan while staying in the family. */
  familyMealPlanning?: boolean;
  /** Saved / favourited recipe ids (server-side favourites). */
  savedRecipes?: string[];
}
/** Parse a JSON string column, returning a fallback on null/invalid. */
function safeJson<T>(s: string | null | undefined, fallback: T): T {
  try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; }
}
function parseExtras(extras: string | null | undefined): PrefExtras {
  try { return extras ? (JSON.parse(extras) as PrefExtras) : {}; } catch { return {}; }
}

/** The meal plan spans three weeks (21 days), generated in one go; the user is
 *  prompted to review/adjust after it ends. */
const PLAN_DAYS = 21;
const todayISO = (): string => new Date().toISOString().slice(0, 10);
const addDaysISO = (iso: string, n: number): string => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Map a stored FoodPref diet value to a composer diet (single source of truth). */
function mapUserDiet(raw?: string | null): ComposerDiet {
  const d = (raw ?? '').toLowerCase();
  const M: Record<string, ComposerDiet> = {
    everything: 'nonveg', nonveg: 'nonveg', 'non-veg': 'nonveg', nonvegetarian: 'nonveg', 'non-vegetarian': 'nonveg',
    pesc: 'nonveg', pescatarian: 'nonveg', fish: 'nonveg',
    egg: 'eggetarian', eggetarian: 'eggetarian',
    veg: 'vegetarian', vegetarian: 'vegetarian', jain: 'vegetarian',
    vegan: 'vegan',
  };
  return M[d] ?? 'vegetarian';
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
  // Grouped protein-source chips (v2 preferences UI). Plant/dairy selections
  // never restrict recipes (only animal tokens are hard-filtered) — these map
  // so family-swap and preference logic still recognise them.
  'lentils & dal': 'legumes', dal: 'legumes', chickpeas: 'legumes', 'beans & legumes': 'legumes',
  rajma: 'legumes', peas: 'legumes', sprouts: 'legumes',
  'soy / tofu': 'tofu', soy: 'tofu',
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
  // Krause's (14th ed., Box 39-3): highest-purine foods + fructose sources.
  // Note: NOT generic "gravy" — Indian onion-tomato gravies are fine; the
  // guideline targets meat-based broths/stocks.
  'high uric acid': ['organ meat', 'liver', 'gizzard', 'kaleji', 'brain', 'anchovy', 'anchovies', 'sardine', 'herring', 'meat broth', 'bone broth', 'fructose syrup', 'sweetened soda'],
  gout: ['organ meat', 'liver', 'gizzard', 'kaleji', 'brain', 'anchovy', 'anchovies', 'sardine', 'herring', 'meat broth', 'bone broth', 'fructose syrup', 'sweetened soda'],
};
function passesMedical(r: RecipeWithIng, conditions: string[]): boolean {
  if (!conditions.length) return true;
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  for (const c of conditions) {
    const key = c.trim().toLowerCase();
    const kws = MEDICAL_EXCLUDE[key]
      ?? (key.includes('uric') || key.includes('gout') ? MEDICAL_EXCLUDE.gout : undefined)
      ?? (key.includes('kidney') || key.includes('renal') || key.includes('ckd') ? MEDICAL_EXCLUDE['kidney disease'] : undefined);
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
  if (!allergySafe(r, ex)) return false;                              // 5·6 · allergies + avoided foods
  return true;
}

/**
 * Allergies + foods the user won't eat. Split out of `passesHard` because this
 * is the ONE rule that must survive every fallback: a slot with no candidates
 * is an inconvenience, but an allergen on someone's plate is a safety incident.
 */
function allergySafe(r: RecipeWithIng, ex: PrefExtras): boolean {
  const allergies = terms(ex.allergies);
  const excluded = terms(ex.excluded);
  if (!allergies.length && !excluded.length) return true;
  const hay = `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
  if (allergies.some((a) => hay.includes(a))) return false;
  if (excluded.some((a) => hay.includes(a))) return false;
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
  imageUrl?: string | null; // /recipe-images/{no}.webp when available
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

  // Life-stage groups (QA H4 fix): pregnancy, lactation and pediatrics change
  // energy/protein/micronutrients and must never be put on a calorie deficit.
  const condLower = (inp.conditions ?? []).map((x) => x.toLowerCase()).join(' ');
  const pregnant = /pregnan/.test(condLower) || flags.pregnant === 'yes' || flags.pregnancy === 'yes';
  const lactating = /breastfeed|lactat|nursing/.test(condLower) || flags.lactating === 'yes';
  const trimester = Number(flags.trimester) || 0;
  const pediatric = age < 18;

  const h = height / 100;
  const bmi = h > 0 ? weight / (h * h) : 22;
  const overweight = bmi >= 27;
  const bmr = 10 * weight + 6.25 * height - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * activity;
  const adj0 = goal === 'lose' ? -0.18 : goal === 'gain' ? (overweight ? 0 : 0.10) : 0;
  // No calorie deficit during pregnancy, lactation or childhood/adolescence.
  const adj = (pregnant || lactating || pediatric) ? Math.max(0, adj0) : adj0;
  let energyExtra = 0;
  if (pregnant) energyExtra += trimester >= 3 ? 450 : trimester === 1 ? 0 : 340; // ACOG/IOM by trimester
  if (lactating) energyExtra += 400;
  const kcal = Math.max(1400, Math.round(tdee * (1 + adj)) + energyExtra);

  const refWeight = bmi >= 27 ? Math.round(25 * h * h) : weight;
  // Evidence-based protein prescription (g/kg/day):
  //   healthy adult 0.8 · older adults >65 1.0–1.2 · weight loss 1.2–1.6 ·
  //   strength/muscle gain 1.6–2.2 · endurance 1.2–1.7 · T2 diabetes 1.0–1.5 ·
  //   CKD 1–2 0.8–1.0 · CKD 3–5 (no dialysis) 0.55–0.8 · dialysis 1.0–1.2.
  // The highest applicable indication wins; kidney disease overrides all
  // (applied below with the other conditions).
  let proteinPerKg = 0.8;                                                    // healthy adult baseline
  if (age > 65) proteinPerKg = Math.max(proteinPerKg, 1.1);                  // healthy ageing 1.0–1.2
  if (goal === 'lose') proteinPerKg = Math.max(proteinPerKg, 1.4);           // weight loss 1.2–1.6
  if (goal === 'gain') proteinPerKg = Math.max(proteinPerKg, 1.8);           // strength / muscle gain 1.6–2.2
  if (activity >= 1.8 && goal !== 'gain') proteinPerKg = Math.max(proteinPerKg, 1.4); // endurance 1.2–1.7
  if (pregnant || lactating) proteinPerKg = Math.max(proteinPerKg, 1.1);     // pregnancy/lactation ≥1.1 g/kg
  if (pediatric) proteinPerKg = Math.max(proteinPerKg, 1.0);                 // growth
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

  if (diabetes) {
    // T2 diabetes (healthy kidneys): 1.0–1.5 g/kg individualized — floor 1.0,
    // capped at 1.5 unless a muscle-gain goal justifies more.
    proteinPerKg = Math.max(proteinPerKg, 1.0);
    if (goal !== 'gain') proteinPerKg = Math.min(proteinPerKg, 1.5);
    fiber = Math.max(fiber, 35); sugarMaxG = 20;
    adjustments.push('Diabetes: protein 1.0–1.5 g/kg, higher fibre, lower-glycaemic carbs, added sugar ≤20 g');
  }
  if (highChol) { satFatMaxG = Math.round((kcal * 0.06) / 9); fiber = Math.max(fiber, 35); adjustments.push('Raised cholesterol/triglycerides: saturated fat ≤6% kcal, more soluble fibre'); }
  if (fattyLiver) { proteinPerKg = Math.max(proteinPerKg, 1.2); sugarMaxG = Math.min(sugarMaxG, 20); satFatMaxG = Math.min(satFatMaxG, Math.round((kcal * 0.07) / 9)); adjustments.push('Fatty liver: lean protein maintained, added sugar & saturated fat down'); }
  if (hypertension) { sodiumMaxMg = 1500; potassiumMinMg = 4700; adjustments.push('Hypertension: sodium ≤1500 mg, higher potassium (DASH)'); }
  let potassiumMaxMg: number | undefined;
  let phosphorusMaxMg: number | undefined;
  if (kidney) {
    // Kidney disease OVERRIDES every other protein indication. Note the renal
    // potassium semantics: a CEILING (hyperkalemia risk), never a floor.
    const dialysis = has('dialysis');
    const lateStage = has('stage 3', 'stage 4', 'stage 5', 'stage3', 'stage4', 'stage5');
    if (dialysis) {
      proteinPerKg = 1.1; // dialysis: 1.0–1.2 g/kg (or higher if advised)
      potassiumMaxMg = 2500; phosphorusMaxMg = 1000;
      adjustments.push("Dialysis: protein 1.0–1.2 g/kg to replace dialysate losses (Krause's) — follow your nephrologist/dietitian if advised higher");
    } else if (lateStage) {
      proteinPerKg = 0.7; // CKD stage 3–5, not on dialysis: 0.55–0.8 g/kg
      potassiumMaxMg = 2500; phosphorusMaxMg = 900;
      adjustments.push("CKD stage 3–5 (no dialysis): protein 0.55–0.8 g/kg (Krause's), potassium ≤2,500 mg, phosphorus ≤900 mg — confirm with your nephrologist");
    } else {
      proteinPerKg = Math.min(proteinPerKg, 0.9); // CKD stage 1–2 / unstaged: 0.8–1.0 g/kg
      potassiumMaxMg = 3000; phosphorusMaxMg = 1000;
      adjustments.push('Kidney condition: protein moderated to ~0.8–1.0 g/kg, sodium ≤2,000 mg, potassium & phosphorus capped — confirm targets with your nephrologist');
    }
    sodiumMaxMg = Math.min(sodiumMaxMg, 2000);
    potassiumMinMg = 0; // the DASH-style floor does not apply to renal patients
  }
  // Geriatric fluids (ESPEN): ≥1.6 L/day drinks for women, ≥2.0 L/day for men.
  const geriatricFluidMl = age >= 65 ? (sex === 'female' ? 1600 : 2000) : 0;

  // Pregnancy/lactation add ~25 g/day on top of the per-kg prescription.
  const proteinExtraG = (pregnant ? 25 : 0) + (lactating ? 25 : 0);
  const micro: { ironMgMin?: number; folateMcgMin?: number; calciumMgMin?: number } = {};
  if (pregnant) { micro.ironMgMin = 27; micro.folateMcgMin = 600; micro.calciumMgMin = 1000; adjustments.push('Pregnancy: energy raised by trimester, protein +25 g/day (≥1.1 g/kg), iron 27 mg, folate 600 mcg, calcium 1,000 mg — no calorie deficit. Confirm with your obstetrician.'); }
  if (lactating) { micro.ironMgMin = Math.max(micro.ironMgMin ?? 0, 9); micro.folateMcgMin = Math.max(micro.folateMcgMin ?? 0, 500); micro.calciumMgMin = 1000; adjustments.push('Breastfeeding: +~400 kcal/day, protein +25 g/day, adequate iron/folate/calcium — no calorie deficit.'); }
  if (pediatric) adjustments.push('Under 18: growth-appropriate energy (no weight-loss deficit) and protein ≥1.0 g/kg. Pediatric nutrition should be supervised by a pediatric dietitian — these targets are a general guide only.');

  const protein = Math.round(proteinPerKg * refWeight) + proteinExtraG;
  const fat = Math.round((kcal * fatPct) / 9);
  const carb = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  const split: Record<'b' | 'l' | 's' | 'd', number> = { b: 0.25, l: 0.32, s: 0.13, d: 0.30 };
  // Protein is spread EVENLY through the day (muscle protein synthesis +
  // satiety) rather than back-loaded at dinner — e.g. 120 g → 30/30/20/40.
  const proteinSplit: Record<'b' | 'l' | 's' | 'd', number> = { b: 0.25, l: 0.25, s: 0.17, d: 0.33 };
  const perMeal = Object.fromEntries(
    (['b', 'l', 's', 'd'] as const).map((slot) => [slot, {
      kcal: Math.round(kcal * split[slot]), protein: Math.round(protein * proteinSplit[slot]),
      carb: Math.round(carb * split[slot]), fat: Math.round(fat * split[slot]),
    }]),
  );
  return {
    kcal, protein, carb, fat, fiber,
    waterMl: Math.max(Math.round(weight * 35), geriatricFluidMl),
    sugarMaxG, satFatMaxG, sodiumMaxMg, potassiumMinMg,
    ...(potassiumMaxMg ? { potassiumMaxMg } : {}),
    ...(phosphorusMaxMg ? { phosphorusMaxMg } : {}),
    pregnant, lactating, pediatric,
    ...(micro.ironMgMin ? { ironMgMin: micro.ironMgMin } : {}),
    ...(micro.folateMcgMin ? { folateMcgMin: micro.folateMcgMin } : {}),
    ...(micro.calciumMgMin ? { calciumMgMin: micro.calciumMgMin } : {}),
    perMeal, adjustments,
  };
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
export interface SolveOpts {
  /** Allowed portion steps (e.g. quantized [50,75,100,125,150] — "½–1½ plates"). */
  steps?: number[];
  /** Default per-item ceiling when the item doesn't set maxPct. */
  defaultMax?: number;
}

export function optimizeDayPortions(
  items: DayItemForOpt[],
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
  solveOpts?: SolveOpts,
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
  let OPTIONS: number[];
  if (solveOpts?.steps?.length) OPTIONS = [...solveOpts.steps].sort((a, b) => a - b);
  else { OPTIONS = []; for (let p = 60; p <= 250; p += 5) OPTIONS.push(p); }
  const loDefault = OPTIONS[0];
  const hiDefault = solveOpts?.defaultMax ?? (solveOpts?.steps?.length ? OPTIONS[OPTIONS.length - 1] : 200);
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    for (let i = 0; i < items.length; i++) {
      const lo = items[i].minPct ?? loDefault, hi = items[i].maxPct ?? hiDefault;
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
  // Floors derive from the HARD bands: target minus the allowed under-tolerance.
  const kAllow = Math.max(target.kcal * 0.02, 60);
  const pAllow = Math.max(target.protein * 0.02, 5);
  const kDef = target.kcal > 0 ? Math.max(0, (target.kcal - kAllow - t.kcal) / target.kcal) * 100 : 0;
  const pDef = target.protein > 0 ? Math.max(0, (target.protein - pAllow - t.protein) / target.protein) * 100 : 0;
  return kDef + pDef;
}

/**
 * HARD tolerance system (spec): the Daily Nutrition Targets are non-negotiable
 * CONSTRAINTS. A plan may only be shown when every nutrient is inside its band.
 * Percent tolerances follow the prescription (±2% kcal/protein, ±3% carbs/fat,
 * fibre 100–110%); each carries a small ABSOLUTE allowance because food is
 * discrete — a boiled egg is 78 kcal and cannot be eaten fractionally. The
 * effective allowance is max(pct-of-target, abs).
 */
export const DAY_TOLERANCE = {
  kcal: { underPct: 2, overPct: 2, abs: 60 },
  protein: { underPct: 2, overPct: 2, abs: 5 },
  carbs: { underPct: 3, overPct: 3, abs: 14 },
  fat: { underPct: 3, overPct: 3, abs: 6 },
  fiber: { underPct: 0, overPct: 10, abs: 4 },  // minimum 100% of target, max 110%
} as const;

/**
 * WEEKLY hard clinical constraints (spec): asymmetric, non-negotiable.
 *   protein  ≤100% (never over — the defining rule)
 *   carbs    95–100%
 *   calories 98–100%
 *   fat      95–100%
 *   fibre    100–110%
 * Small absolute allowances account for food being discrete at week scale.
 */
export const WEEK_TOLERANCE = {
  kcal: { minPct: 98, maxPct: 100, abs: 120 },
  protein: { minPct: 95, maxPct: 100, abs: 5 },
  carbs: { minPct: 95, maxPct: 100, abs: 25 },
  fat: { minPct: 95, maxPct: 100, abs: 9 },
  fiber: { minPct: 100, maxPct: 110, abs: 7 },
} as const;

/** Weekly totals vs the weekly bands. Protein-over and carbs-under — the two
 *  "never display" violations — count 3×. 0 = presentable week. */
export function weekBandViolation(
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number },
  daily: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
): { total: number; worstNutrient: string; worstSide: 'over' | 'under' } {
  const rows: Array<[keyof typeof WEEK_TOLERANCE, number, number]> = [
    ['kcal', totals.kcal, daily.kcal * 7], ['protein', totals.protein, daily.protein * 7],
    ['carbs', totals.carbs, daily.carb * 7], ['fat', totals.fat, daily.fat * 7], ['fiber', totals.fiber, daily.fiber * 7],
  ];
  let total = 0, worst = 0, worstNutrient = 'kcal', worstSide: 'over' | 'under' = 'over';
  for (const [key, tot, T] of rows) {
    if (!T || T <= 0) continue;
    const band = WEEK_TOLERANCE[key];
    const hi = (T * band.maxPct) / 100 + band.abs;
    const lo = (T * band.minPct) / 100 - band.abs;
    const isOver = tot > hi;
    const beyond = isOver ? tot - hi : tot < lo ? lo - tot : 0;
    const critical = (key === 'protein' && isOver) || (key === 'carbs' && !isOver && beyond > 0);
    const v = (beyond / T) * 100 * (critical ? 3 : 1);
    total += v;
    if (v > worst) { worst = v; worstNutrient = key; worstSide = isOver ? 'over' : 'under'; }
  }
  return { total: Math.round(total * 10) / 10, worstNutrient, worstSide };
}

/**
 * How far (in %-points of target, summed) the day sits OUTSIDE its hard bands.
 * 0 = a valid plan. The primary metric for the validation gate and every
 * swap/removal acceptance decision.
 */
export function bandViolationPct(
  items: DayItemForOpt[], pcts: Record<string, number>,
  target: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
  extra?: { kcal: number; protein: number; carbs: number; fat: number; fiber: number },
): { total: number; worstNutrient: string; worstSide: 'over' | 'under' } {
  const t = dayTotalsFor(items, pcts);
  if (extra) { t.kcal += extra.kcal; t.protein += extra.protein; t.carbs += extra.carbs; t.fat += extra.fat; t.fiber += extra.fiber; }
  const rows: Array<[keyof typeof DAY_TOLERANCE, number, number]> = [
    ['kcal', t.kcal, target.kcal], ['protein', t.protein, target.protein],
    ['carbs', t.carbs, target.carb], ['fat', t.fat, target.fat], ['fiber', t.fiber, target.fiber],
  ];
  let total = 0, worst = 0, worstNutrient = 'kcal', worstSide: 'over' | 'under' = 'over';
  for (const [key, tot, T] of rows) {
    if (!T || T <= 0) continue;
    const band = DAY_TOLERANCE[key];
    const overAllow = Math.max((T * band.overPct) / 100, band.abs);
    const underAllow = Math.max((T * band.underPct) / 100, band.abs);
    const isOver = tot > T + overAllow;
    const beyond = isOver ? tot - (T + overAllow) : tot < T - underAllow ? (T - underAllow) - tot : 0;
    // A dietitian NEVER exceeds a prescribed limit: overshoot counts 3× so the
    // search always eliminates excess before polishing a shortfall.
    const v = (beyond / T) * 100 * (isOver ? 3 : 1);
    total += v;
    if (v > worst) { worst = v; worstNutrient = key; worstSide = isOver ? 'over' : 'under'; }
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
  solveOpts?: SolveOpts,
): { pcts: Record<string, number>; deficit: number; worst: number; nutrient: string; violation: number } {
  const quantized = Boolean(solveOpts?.steps?.length);
  // Single-step mode ([100]) = fixed standard servings: no fill/trim movement.
  const step = quantized
    ? (solveOpts!.steps!.length > 1
      ? Math.min(...solveOpts!.steps!.slice(1).map((v, i) => v - solveOpts!.steps![i]))
      : 0)
    : 5;
  const hardCap = quantized ? (solveOpts?.defaultMax ?? Math.max(...solveOpts!.steps!)) : 300;
  const floorOf = (it: DayItemForOpt) => it.minPct ?? (quantized ? Math.min(...solveOpts!.steps!) : 60);
  let use = items;
  let pcts = optimizeDayPortions(use, target, solveOpts);
  let deficit = floorDeficitPct(use, pcts, target);
  // Non-quantized mode may escalate ceilings; quantized (realistic-portion)
  // mode never does — energy gaps are closed by complement foods instead.
  for (const cap of quantized ? [] : [250, 300]) {
    if (deficit <= 0) break;
    const widened = items.map((it) =>
      it.minPct === 100 && it.maxPct === 100 ? it : { ...it, maxPct: Math.max(it.maxPct ?? 200, cap) });
    const p2 = optimizeDayPortions(widened, target, solveOpts);
    const d2 = floorDeficitPct(widened, p2, target);
    if (d2 < deficit) { use = widened; pcts = p2; deficit = d2; }
  }
  // Guaranteed-floor fill: the balanced objective can leave a day under target
  // when every dish is macro-skewed (e.g. all-protein picks vs a capped protein
  // target). The floors are non-negotiable — raise portions greedily, 5% at a
  // time on whichever dish adds the most of what's missing, until calories AND
  // protein reach ≥95% or every dish is at its 300% ceiling.
  if (deficit > 0 && step > 0) {
    const filled = { ...pcts };
    for (let guard = 0; guard < 400 && floorDeficitPct(use, filled, target) > 0; guard++) {
      const t = dayTotalsFor(use, filled);
      const needK = target.kcal > 0 && t.kcal < target.kcal - Math.max(target.kcal * 0.02, 60);
      const needP = target.protein > 0 && t.protein < target.protein - Math.max(target.protein * 0.02, 5);
      let bestIdx = -1, bestGain = 0;
      for (let i = 0; i < use.length; i++) {
        const it = use[i];
        const pinned = it.minPct === 100 && it.maxPct === 100;
        if (pinned || (filled[it.slot] ?? 100) >= Math.min(it.maxPct ?? hardCap, hardCap)) continue;
        const gain = (needK ? it.kcal : 0) + (needP ? it.protein * 12 : 0);
        if (gain > bestGain) { bestGain = gain; bestIdx = i; }
      }
      if (bestIdx < 0) break; // nothing left to raise — complements / swaps take over
      filled[use[bestIdx].slot] = (filled[use[bestIdx].slot] ?? 100) + step;
    }
    const dFilled = floorDeficitPct(use, filled, target);
    if (dFilled < deficit) { pcts = filled; deficit = dFilled; }
  }
  // Trim pass: pull overshooting nutrients back inside their tolerance bands
  // wherever portions allow it WITHOUT re-breaking the calorie/protein floors.
  // 5% at a time off the dish contributing most of the excess nutrient.
  if (step > 0) {
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
        if (pinned || cur <= floorOf(it)) continue;
        const amt = (it[key] as number) ?? 0;
        if (amt > bestAmt) { bestAmt = amt; bestIdx = i; }
      }
      if (bestIdx < 0) break;
      const slot = use[bestIdx].slot;
      const attempt = { ...trimmed, [slot]: (trimmed[slot] ?? 100) - step };
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
    private readonly masterProfile: MasterProfileService,
    private readonly conversations: ConversationsService,
    private readonly financial: FinancialService,
    private readonly ai: AiService,
    private readonly connections: ConnectionsService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureRecipes();
    await this.ensureDietitians();
    // Recipe data: adopt the v2 dataset (per-serving, cleaned) on an existing DB,
    // else load it fresh. Background so it never blocks boot; both are idempotent.
    // The old dropped-rows purge is skipped once v2 is in (v2 is already clean).
    // The nutrition QA audit then validates EVERY recipe from its ingredients
    // (Atwater + plausibility) and persists corrections — once per QA version.
    void this.ensureRecipeLibrary()
      .then(() => this.adoptDatasetV2())
      .then(() => this.runNutritionQa())
      .then(() => { this.warmDatasetPool(); })   // warm the composite pool at boot (load-issue fix)
      .catch(() => undefined);
  }

  // ─────────────── nutrition QA (ingredient-level ground truth) ───────────────
  private static readonly QA_VERSION = 2;
  private qaReport: {
    at: string; scanned: number; corrected: number; flagged: number;
    byIssue: Record<string, number>; samples: Array<{ name: string; issues: string[] }>;
  } | null = null;

  /** Last audit report (admin/debug view). */
  qaReportView() {
    return this.qaReport ?? { at: null, scanned: 0, corrected: 0, flagged: 0, byIssue: {}, samples: [], note: 'QA has not run yet on this instance.' };
  }

  /**
   * Audit the entire recipe table for nutritional accuracy: derive nutrition
   * from ingredient gram weights, validate with Atwater factors, repair
   * implausible serving counts, clamp impossible values, persist corrections.
   * Runs once per QA_VERSION (rows are stamped), in batches, off the boot path.
   */
  private async runNutritionQa(): Promise<void> {
    try {
      const pending = (await this.prisma.recipe.findMany({
        where: { qaVersion: { lt: NutritionService.QA_VERSION } } as never,
        include: { ingredients: { select: { name: true, grams: true } } },
      })) as unknown as Array<QaRecipe & { recipeNo?: number | null }>;
      if (!pending.length) return;
      this.logger.log(`Nutrition QA v${NutritionService.QA_VERSION}: auditing ${pending.length} recipes from their ingredients…`);
      let corrected = 0, flagged = 0;
      const byIssue: Record<string, number> = {};
      const samples: Array<{ name: string; issues: string[] }> = [];
      const CHUNK = 100;
      for (let i = 0; i < pending.length; i += CHUNK) {
        const batch = pending.slice(i, i + CHUNK);
        await Promise.all(batch.map(async (rec) => {
          const res = auditRecipe(rec);
          if (res.issues.length) {
            flagged++;
            for (const iss of res.issues) { const k = iss.split(' ')[0]; byIssue[k] = (byIssue[k] ?? 0) + 1; }
            if (samples.length < 25) samples.push({ name: rec.name, issues: res.issues });
          }
          const data: Record<string, unknown> = { qaVersion: NutritionService.QA_VERSION };
          if (res.fix) {
            corrected++;
            data.kcal = Math.round(res.fix.kcal);
            data.protein = Math.round(res.fix.protein);
            data.carbs = Math.round(res.fix.carbs);
            data.fat = Math.round(res.fix.fat);
            data.fiber = Math.round(res.fix.fiber);
            data.servings = res.fix.servings;
            data.gramsPerServing = Math.round(res.fix.gramsPerServing);
          }
          await this.prisma.recipe.update({ where: { id: rec.id }, data: data as never }).catch(() => undefined);
        }));
      }
      this.qaReport = { at: new Date().toISOString(), scanned: pending.length, corrected, flagged, byIssue, samples };
      this.logger.log(`Nutrition QA: ${pending.length} scanned, ${corrected} corrected, ${flagged} flagged. Top issues: ${Object.entries(byIssue).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}×${v}`).join(', ')}`);
    } catch (e) {
      this.logger.warn(`Nutrition QA skipped: ${(e as Error).message}`);
    }
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

  /** Derive a short clinical meal-name tag from the user's conditions (Rule 16). */
  private clinicalTag(conditions: string[]): string | undefined {
    const c = conditions.join(' ').toLowerCase();
    if (/kidney|renal|ckd|dialysis/.test(c)) return 'Renal Friendly';
    if (/diabet|hba1c/.test(c)) return 'Diabetic Friendly';
    if (/hypertension|blood pressure/.test(c)) return 'Heart Friendly';
    if (/cholesterol|lipid|triglyceride/.test(c)) return 'Heart Friendly';
    return undefined;
  }

  private datasetPoolCache: PoolRecipe[] | null = null;

  /** Normalise a dataset recipe's stored steps (JSON array or delimited text). */
  private parseSteps(raw?: string | null): string[] {
    if (!raw) return [];
    try { const j = JSON.parse(raw); if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean).slice(0, 14); } catch { /* not json */ }
    return raw.split(/\r?\n|(?<=\.)\s+/).map((x) => x.trim()).filter((x) => x.length > 3).slice(0, 14);
  }

  /** Map a dataset diet string to the composer's diet ladder. */
  private mapDiet(d: string): ComposerDiet {
    const x = (d || '').toLowerCase();
    if (x === 'vegan' || x === 'jainvegan') return 'vegan';
    if (x === 'egg' || x === 'eggetarian') return 'eggetarian';
    if (x === 'veg' || x === 'vegetarian') return 'vegetarian';
    return 'nonveg';
  }

  /** Primary plate role for a set of categories (dataset injection: big slots only). */
  private roleFor(cats: MealCategory[]): string | null {
    if (cats.includes('breakfast')) return 'breakfast';
    if (cats.includes('lunch') || cats.includes('dinner')) return 'main';
    if (cats.includes('soup')) return 'soup';
    if (cats.includes('dessert')) return 'dessert';
    if (cats.includes('drink')) return 'drink';
    if (cats.includes('snack')) return 'snack';
    return null; // skip dataset sides/condiments/salads — plate sides stay curated
  }

  /**
   * Build the injectable dataset pool (11k recipes) for the composite engine:
   * per-serving macros + per-serving ingredient grams, categorised, tagged with
   * a plate role. Cached (user-independent). Grocery stays exact because every
   * ingredient carries real grams from RecipeIngredient.
   */
  private async datasetPool(): Promise<PoolRecipe[]> {
    if (this.datasetPoolCache) return this.datasetPoolCache;
    const rows = (await this.prisma.recipe.findMany({
      include: { ingredients: { select: { name: true, grams: true } } },
    })) as unknown as Array<{
      id: string; name: string; country: string; slot: string; diet: string; recipeNo?: number | null;
      kcal: number; protein: number; carbs: number; fat: number; fiber: number;
      minutes: number; gramsPerServing: number; servings?: number;
      steps?: string | null; cookSteps?: string | null; image?: string | null; imageUrl?: string | null;
      ingredients: Array<{ name: string; grams?: number | null }>;
    }>;
    const out: PoolRecipe[] = [];
    for (const r of rows) {
      if (!r.ingredients?.length) continue;
      const cats = categorizeRecipe({ name: r.name, slot: r.slot, cuisine: r.country, minutes: r.minutes, kcal: r.kcal });
      const role = this.roleFor(cats);
      if (!role) continue;
      const s = Math.max(1, r.servings ?? 1);
      const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
      let ingredients = r.ingredients
        .map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) }))
        .filter((i) => i.name && (i.grams ?? 0) > 0);
      if (!ingredients.length) continue;
      // Batch-quantity normalisation: some dataset rows carry whole-batch ingredient
      // weights with servings=1, which inflates the computed sodium/potassium/etc.
      // (e.g. a "breakfast" reading 8,800 mg K). Scale the ingredient list down to
      // the plate serving weight so the computed micronutrients are realistic.
      const gps = per(r.gramsPerServing) || 200;
      const totalW = ingredients.reduce((t, i) => t + i.grams, 0);
      if (gps > 0 && totalW > gps * 1.6) {
        const f = gps / totalW;
        ingredients = ingredients.map((i) => ({ name: i.name, grams: Math.max(1, Math.round(i.grams * f)) }));
      }
      const n = computeNutrients(ingredients);
      out.push({
        id: r.id, name: r.name, cuisine: r.country, categories: cats, role,
        kcal: per(r.kcal) || 200, protein: per(r.protein), carbs: per(r.carbs), fat: per(r.fat), fiber: per(r.fiber),
        minutes: r.minutes || 20, grams: per(r.gramsPerServing) || 200, diet: this.mapDiet(r.diet),
        ingredients,
        nutrients: { sodiumMg: n.na, potassiumMg: n.k, phosphorusMg: n.p, sugarG: n.sug, addedSugarG: n.addedSug, satFatG: n.sfat },
        nutrientComplete: n.complete,
        steps: this.parseSteps(r.cookSteps ?? r.steps), imageUrl: recipeImageUrl(r.recipeNo) ?? r.imageUrl ?? r.image ?? null,
      });
    }
    this.datasetPoolCache = out;
    this.logger.log(`Composite meal engine: dataset pool built (${out.length} recipes).`);
    return out;
  }

  private datasetPoolPromise: Promise<PoolRecipe[]> | null = null;
  /** Kick off the 11k-recipe pool build once (shared promise). */
  private warmDatasetPool(): void {
    if (this.datasetPoolCache || this.datasetPoolPromise) return;
    this.datasetPoolPromise = this.datasetPool()
      .catch((e) => { this.logger.error(`dataset pool build failed: ${(e as Error)?.message ?? e}`); return [] as PoolRecipe[]; });
  }
  /**
   * The dataset pool, WAITING up to maxWaitMs for the (once-per-boot) build so the
   * plan actually contains the full recipe set — non-veg mains and photos live
   * here, not in the small curated seed pool. Bounded so it can't hang (the outer
   * composedPlan timeout is longer); returns the seed-only pool ([]) if it's slow.
   */
  private async datasetPoolReady(maxWaitMs = 6500): Promise<PoolRecipe[]> {
    if (this.datasetPoolCache) return this.datasetPoolCache;
    this.warmDatasetPool();
    const timeout = new Promise<PoolRecipe[]>((res) => setTimeout(() => res(this.datasetPoolCache ?? []), maxWaitMs));
    return Promise.race([this.datasetPoolPromise ?? Promise.resolve([] as PoolRecipe[]), timeout]);
  }

  /** Stable numeric seed from a user id so week generation is deterministic. */
  private seedFor(userId: string): number {
    let h = 2166136261;
    for (let i = 0; i < userId.length; i++) { h ^= userId.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  /**
   * Composite 5-slot meal plan (Meal-Planning-Engine-Spec). Reuses the clinical
   * target computation, then composes complete titled meals from real recipes
   * with per-slot cuisine, variety, intermittent-fasting schedule and a strictly
   * recipe-derived grocery list.
   */
  /**
   * Composite plan with family derivation (HIGH-3). A connected member whose
   * household has Family Meal Planning ON gets the OWNER's composed week scaled
   * to their own calorie target — same dishes/times, portions + grocery scaled,
   * read-only. Everyone else gets their own composition.
   */
  async composedPlan(
    userId: string,
    mode: 'preferred' | 'optimal' = 'preferred',
    opts: { household?: boolean } = {},
  ) {
    // Food Preference Profile is the master source of truth — never generate a
    // plan until it's saved. Members of a family with shared planning inherit the
    // owner's saved profile, so they're allowed through.
    const pref0 = await this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
    const ex0 = parseExtras((pref0 as { extras?: string | null } | null)?.extras);
    const profileSaved = !!pref0 && Object.keys(ex0).length > 0;
    if (!profileSaved) {
      const ctx0 = await this.familyContext(userId).catch(() => null);
      const sharedMember = !!ctx0 && ctx0.role === 'member' && !!ctx0.familyMealPlanning;
      if (!sharedMember) return { needsProfile: true as const };
    }
    try {
      // Timeout race (load-issue fix): a hung DB query never throws, so a plain
      // try/catch can't rescue it — the HTTP request would just time out and the
      // planner would blank. Cap the personalised build; on timeout OR error we
      // fall through to the fast, pure fallback below.
      return await Promise.race([
        this.buildComposedPlan(userId, mode, opts),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('composed-plan timeout (8s)')), 8000)),
      ]);
    } catch (e) {
      // Resilience (load-issue fix): never blank the planner on an unexpected
      // error. Log the real cause (visible in server logs) and fall back to a
      // safe general plan the user can reload to personalise.
      this.logger.error(`composedPlan failed for user=${userId}: ${(e as Error)?.stack ?? String(e)}`);
      try {
        // Even the fallback honours the user's diet (never veg for a non-veg user).
        const prefF = await this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
        const t = computeTargets({ weightKg: prefF?.weightKg ?? 70, heightCm: prefF?.heightCm ?? 172, age: prefF?.age ?? 30, sex: prefF?.sex ?? 'male', activity: prefF?.activity ?? 1.4, goal: prefF?.goal ?? 'maintain', conditions: [], flags: {} });
        const pool = await this.datasetPoolReady();
        const week = composeWeek(
          { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber },
          { diet: mapUserDiet(prefF?.diet as string | undefined) }, 7, this.seedFor(userId), pool,
        );
        return {
          ...week, prescription: t, fastingSafety: { level: 'ok' as const, notes: [] },
          degraded: true,
          degradedReason: 'We had trouble reading your full profile, so this is a general starter plan. Reload to personalise it — and if it keeps happening, re-save your food preferences.',
        };
      } catch (e2) {
        this.logger.error(`composedPlan fallback also failed for user=${userId}: ${(e2 as Error)?.stack ?? String(e2)}`);
        throw e;
      }
    }
  }

  private async buildComposedPlan(
    userId: string,
    mode: 'preferred' | 'optimal' = 'preferred',
    opts: { household?: boolean } = {},
  ) {
    const ctx = await this.familyContext(userId).catch(() => null);
    if (ctx && ctx.role === 'member' && ctx.familyMealPlanning) {
      const mpref = await this.prisma.foodPref.findUnique({ where: { userId } });
      const mex = parseExtras((mpref as { extras?: string | null } | null)?.extras);
      const mFlags = flagsFor(await this.bloodValues(userId));
      const mConds = mex.healthConditions ?? [];
      const mDiet = ((mpref?.diet as string) ?? 'vegetarian').toLowerCase();
      const mAllergies = [
        ...(mex.excluded ? mex.excluded.split(',') : []),
        ...(mex.allergies ? mex.allergies.split(',') : []),
      ].map((s) => s.trim()).filter(Boolean);
      const mClinical = mConds.length > 0 || mFlags.hba1c === 'high' || mFlags.ldl === 'high' || mFlags.trig === 'high';

      // SAFETY (QA H6): a member may only be served the owner's scaled dishes when
      // those dishes are actually safe for them — i.e. the member has no allergies,
      // no clinical conditions, is not Jain, and their diet is at least as permissive
      // as the owner's (so every owner dish fits the member's diet). Otherwise the
      // member gets their OWN personalized, safety-filtered plan.
      const ownerPref = await this.prisma.foodPref.findUnique({ where: { userId: ctx.ownerId } });
      const ownerDiet = ((ownerPref?.diet as string) ?? 'vegetarian').toLowerCase();
      const level: Record<string, number> = { vegan: 0, jain: 0, veg: 1, vegetarian: 1, egg: 2, eggetarian: 2, pesc: 2, pescatarian: 2, nonveg: 3, everything: 3 };
      const dietCompatible = mDiet !== 'jain' && ownerDiet !== 'jain'
        && (level[mDiet] ?? 1) >= (level[ownerDiet] ?? 1);
      const shareable = dietCompatible && !mAllergies.length && !mClinical;

      if (shareable) {
        const ownerPlan = await this.composeFor(ctx.ownerId, mode);
        const mt = computeTargets({
          weightKg: mpref?.weightKg ?? 70, heightCm: mpref?.heightCm ?? 172, age: mpref?.age ?? 30,
          sex: mpref?.sex ?? 'male', activity: mpref?.activity ?? 1.4, goal: mpref?.goal ?? 'maintain',
          conditions: mConds, flags: mFlags,
        });
        const factor = Math.max(0.4, Math.min(1.9, mt.kcal / Math.max(1, ownerPlan.targets.kcal)));
        const owner = await this.prisma.user.findUnique({ where: { id: ctx.ownerId }, select: { name: true } }).catch(() => null);
        const scaled = scaleComposedWeek(ownerPlan, factor);
        return {
          ...scaled, prescription: mt, fastingSafety: ownerPlan.fastingSafety,
          basedOnFamily: { ownerName: owner?.name ?? 'your family', factor: Math.round(factor * 100) / 100 }, readOnly: true,
        };
      }
      // Not shareable → the member's own diet/allergies/conditions are respected.
      const own = await this.composeFor(userId, mode);
      const reason = mAllergies.length ? 'your allergies/exclusions'
        : mClinical ? 'your medical needs' : 'your dietary preference';
      return { ...own, personalizedForMember: true, personalizedReason: reason };
    }
    return this.composeFor(userId, mode, opts);
  }

  private async composeFor(
    userId: string,
    mode: 'preferred' | 'optimal' = 'preferred',
    opts: { household?: boolean } = {},
  ) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    let ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    // HOUSEHOLD SAFETY. When this plan is being composed to feed a household —
    // today that means the family grocery list, which shops off the composed
    // plan — every member's allergies, exclusions and conditions must apply,
    // exactly as generatePlan() already does for the stored family plan. The
    // owner's own preferences alone would let a shared dish carry a child's
    // allergen, and the family basket would then buy the ingredient for it.
    if (opts.household) ex = await this.withHouseholdAllergies(userId, ex);
    // 3-week plan anchor: day 0 = the day the user started this plan. Lazily set on
    // first generation so the plan progresses day-by-day and can prompt a review
    // once its three weeks are up.
    let planStartDate = (typeof ex.planStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(ex.planStartDate)) ? ex.planStartDate : '';
    const planSeedBump = Number(ex.planSeedBump) || 0;
    if (!planStartDate) { planStartDate = todayISO(); await this.mergeExtras(userId, { planStartDate }); }
    const bvals = await this.bloodValues(userId);
    // Declared conditions + conditions DERIVED from abnormal blood values (QA H5).
    const conditions = [...new Set([...(ex.healthConditions ?? []), ...conditionsFromBlood(bvals)])];
    const flags = flagsFor(bvals);
    const t = computeTargets({
      weightKg: pref?.weightKg ?? 70, heightCm: pref?.heightCm ?? 172, age: pref?.age ?? 30,
      sex: pref?.sex ?? 'male', activity: pref?.activity ?? 1.4, goal: pref?.goal ?? 'maintain',
      conditions, flags,
    });
    // Jain is vegetarian + automatic exclusion of onion, garlic and root vegetables.
    const rawDiet = ((pref?.diet as string) ?? 'vegetarian').toLowerCase();
    const isJain = rawDiet === 'jain';
    const composerDiet: ComposerDiet = mapUserDiet(rawDiet);
    const jainExcludes = isJain ? ['onion', 'garlic', 'potato', 'carrot', 'radish', 'beetroot', 'mushroom', 'ginger'] : [];
    // MNT hard-avoid lists (QA M8): organ/processed meat for gout & CKD, alcohol
    // for fatty liver, etc. — now actually applied to the composed plan.
    const mntAvoids = mntAvoidKeywords(activeMntRules({ conditions, flags: flags as Record<string, string>, age: pref?.age ?? 30, sex: pref?.sex ?? 'male' }));
    const excluded = [
      ...(ex.excluded ? ex.excluded.split(',') : []),
      ...(ex.allergies ? ex.allergies.split(',') : []),
      ...jainExcludes,
      ...mntAvoids,
    ].map((s) => s.trim()).filter(Boolean);

    // Default to an Indian-first per-slot cuisine when the user hasn't set one,
    // so dataset variety doesn't surface unexpected cuisines by default.
    // Cuisine preference is a PRIMARY driver: use the planner's per-slot override
    // if set, else the SAVED PROFILE's cuisine mix (applied to every meal so the
    // plan visibly reflects the user's taste), else an Indian-first default.
    const profileMix: Record<string, number> | null =
      (ex.cuisineMix && Object.keys(ex.cuisineMix).length) ? ex.cuisineMix
        : (ex.cuisines && ex.cuisines.length) ? Object.fromEntries(ex.cuisines.map((c) => [c, 1])) : null;
    const cuisineBySlot = (ex.cuisineBySlot && Object.keys(ex.cuisineBySlot).length)
      ? ex.cuisineBySlot
      : profileMix
        ? { breakfast: profileMix, lunch: profileMix, dinner: profileMix, snack: profileMix }
        : { breakfast: { Indian: 100 }, lunch: { Indian: 90, Continental: 10 }, dinner: { Indian: 90, Chinese: 10 }, snack: {} };

    // Planner philosophy — "inform, don't force". My Preferences hard-enforces
    // NOTHING clinical (not even renal limits): it is purely the user's choices,
    // and the compliance banner simply WARNS and points to Optimal Health. Optimal
    // Health is where clinical caps are actually enforced. Allergens and diet stay
    // absolute in both modes (they live in `excluded`/`diet`).
    const condText = conditions.join(' ').toLowerCase();
    const isClinical = /kidney|renal|ckd|dialysis|diabet|hba1c|hypertension|blood pressure|cholesterol|lipid|triglycer|fatty liver|gout/.test(condText)
      || flags.hba1c === 'high' || flags.ldl === 'high' || flags.trig === 'high';
    const capsRaw = t as unknown as { sodiumMaxMg?: number; potassiumMaxMg?: number; phosphorusMaxMg?: number; sugarMaxG?: number; satFatMaxG?: number };
    const fullCaps = {
      sodiumMg: capsRaw.sodiumMaxMg, potassiumMg: capsRaw.potassiumMaxMg, phosphorusMg: capsRaw.phosphorusMaxMg,
      sugarG: capsRaw.sugarMaxG, satFatG: capsRaw.satFatMaxG,
    };

    const favourites = [...(ex.proteins ?? []), ...(ex.meats ?? [])].filter(Boolean);
    const targets = { kcal: t.kcal, protein: t.protein, carbs: (t as { carb: number }).carb, fat: t.fat, fiber: t.fiber };
    const isDiabetic = /diabet|hba1c/.test(condText);
    const chosenCuisines = profileMix ? Object.keys(profileMix) : [];
    // The single yardstick BOTH plans are graded against: clinical caps for a
    // diagnosed user, otherwise general WHO guideline caps for a healthy adult.
    const healthCaps = isClinical ? fullCaps : guidelineCaps(targets.kcal);

    // Two modes:
    //  • preferred (default) — the user's saved preferences drive everything; their
    //    chosen protein sources appear regardless of conditions; NOTHING clinical is
    //    hard-enforced. Medical guidance is informational.
    //  • optimal — the clinically ideal plan. Caps are enforced toward the ideal:
    //    clinical caps (hard, best-of-N, can BLOCK) for a real condition; general
    //    guideline caps (soft portion-trim, never blocks) for a healthy user — so
    //    Optimal genuinely meets nutrition guidelines and scores ~100 on health.
    //    Protein-source and cook-time nudges are dropped so health leads; diet,
    //    allergies and cuisine taste are still respected.
    const cprefsFor = (m: 'preferred' | 'optimal'): ComposerPrefs => {
      const optimal = m === 'optimal';
      return {
        diet: composerDiet,
        excluded,
        cuisineBySlot,
        cuisineLocks: ex.cuisineLocks,
        fasting: ex.fasting,
        includePantry: ex.includePantry ?? false,
        // Clinical labelling + rules apply ONLY in Optimal Health. My Preferences
        // is purely the user's choices — no "Renal Friendly"/"Diabetic" naming and
        // no avoid-rice; it just reflects what they picked (and warns via compliance).
        clinicalTag: optimal ? this.clinicalTag(conditions) : undefined,
        avoidRice: optimal && isClinical && isDiabetic,
        caps: optimal ? healthCaps : undefined,
        clinical: optimal && isClinical,   // hard gate / blocking only for a real condition
        maxMinutes: optimal ? undefined : (ex.maxCookMin ?? undefined),
        favourites: optimal ? undefined : (favourites.length ? favourites : undefined),
        skips: ex.composedSkips,
        bumps: ex.composedBumps,
      };
    };

    const datasetPool = await this.datasetPoolReady();   // wait (bounded) for the full 11k pool — non-veg mains + photos live here
    const weekFor = (m: 'preferred' | 'optimal') =>
      composeWeek(targets, cprefsFor(m), PLAN_DAYS, this.seedFor(userId) + Math.imul(planSeedBump, 7919) + (m === 'optimal' ? 101 : 0), datasetPool);

    const week = weekFor(mode);

    // Score BOTH plans on health + preference-match so each tab can show its two
    // scores AND the difference vs the other mode ("Optimal is correct, My
    // Preferences is yours"). The counterpart week is composed once for scoring.
    const scoreInputs = { targets, healthCaps, isDiabetic, favourites, cuisines: chosenCuisines, maxMinutes: ex.maxCookMin ?? undefined };
    const otherMode: 'preferred' | 'optimal' = mode === 'optimal' ? 'preferred' : 'optimal';
    const otherWeek = weekFor(otherMode);
    const selfScore = scoreDual(week.days, scoreInputs);
    const otherScore = scoreDual(otherWeek.days, scoreInputs);
    const preferredScore = mode === 'preferred' ? selfScore : otherScore;
    const optimalScore = mode === 'optimal' ? selfScore : otherScore;
    const scorecard = buildScorecard(mode, preferredScore, optimalScore);

    // Inform-and-recommend: how THIS plan compares to the clinical ideal (both modes).
    const compliance = isClinical ? complianceReport(week.days, targets, fullCaps, condText) : undefined;
    const safety = ex.fasting?.enabled ? fastingSafety(conditions.join(' ')) : { level: 'ok' as const, notes: [] };
    return { ...week, mode, prescription: t, fastingSafety: safety, skips: ex.composedSkips ?? [], scorecard, planStartDate, reviewDate: addDaysISO(planStartDate, PLAN_DAYS), planDays: PLAN_DAYS, ...(compliance ? { compliance } : {}) };
  }

  /** DB diet values that satisfy a requested diet (ladder). Real DB values:
   *  nonveg, vegan, veg, egg, pesc, jain, jainvegan. (QA H7 fix — every diet
   *  now filters correctly; jain counts as vegetarian; pesc/nonveg handled.) */
  private dietDbValues(diet: string): string[] {
    switch ((diet || '').toLowerCase()) {
      case 'vegan': return ['vegan', 'jainvegan'];
      case 'jain': return ['jain', 'jainvegan'];
      case 'vegetarian': case 'veg': return ['vegan', 'jainvegan', 'veg', 'jain'];
      case 'eggetarian': case 'egg': return ['vegan', 'jainvegan', 'veg', 'jain', 'egg'];
      case 'pescatarian': case 'pesc': return ['vegan', 'jainvegan', 'veg', 'jain', 'egg', 'pesc'];
      case 'nonveg': case 'non-veg': case 'nonvegetarian': return ['vegan', 'jainvegan', 'veg', 'jain', 'egg', 'pesc', 'nonveg'];
      default: return [];
    }
  }

  /** Build a library recipe card from a dataset row (per-serving macros + badges). */
  private recipeCard(r: {
    id: string; recipeNo?: number | null; name: string; country: string; kcal: number; protein: number; carbs: number; fat: number; fiber: number;
    minutes: number; gramsPerServing: number; diet: string; servings?: number; healthPercent?: number | null; healthGrade?: string | null;
    image?: string | null; imageUrl?: string | null; ingredients?: Array<{ name: string; grams?: number | null }>;
  }) {
    const s = Math.max(1, r.servings ?? 1);
    const per = (n: number) => Math.max(0, Math.round((n || 0) / s));
    const kcal = per(r.kcal);
    const ings = (r.ingredients ?? []).map((i) => ({ name: i.name, grams: Math.max(1, Math.round((i.grams ?? 0) / s)) }));
    const n = computeNutrients(ings);
    const micro = computeMicros(ings);
    const diet = r.diet === 'jainvegan' ? 'vegan' : r.diet;
    const difficulty = r.minutes <= 15 ? 'Easy' : r.minutes <= 40 ? 'Medium' : 'Hard';
    return {
      id: r.id, name: r.name, cuisine: r.country, kcal, protein: per(r.protein), carbs: per(r.carbs), fat: per(r.fat), fiber: per(r.fiber),
      minutes: r.minutes, servings: 1, difficulty, diet, healthScore: r.healthPercent ?? null, healthGrade: r.healthGrade ?? null,
      sodiumMg: n.complete ? n.na : null, potassiumMg: n.complete ? n.k : null, sugarG: n.complete ? n.sug : null,
      ironMg: micro.ironMg || null, calciumMg: micro.calciumMg || null, vitDUg: micro.vitDUg || null, vitCMg: micro.vitCMg || null,
      imageUrl: recipeImageUrl(r.recipeNo) ?? r.imageUrl ?? r.image ?? null,
      badges: {
        diabetes: n.complete && n.addedSug <= 6,
        kidney: n.complete && n.k <= 250 && n.p <= 220,
        heart: n.complete && n.sfat <= 5,
        vegan: diet === 'vegan', vegetarian: diet === 'vegan' || diet === 'veg' || diet === 'vegetarian',
      },
    };
  }

  /** Cuisine facet for the library grid (top countries by recipe count). */
  private async cuisineFacet() {
    const rows = await (this.prisma as unknown as { recipe: { groupBy: (a: unknown) => Promise<Array<{ country: string; _count: { _all: number } }>> } }).recipe
      .groupBy({ by: ['country'], _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 24 })
      .catch(() => [] as Array<{ country: string; _count: { _all: number } }>);
    return rows.filter((r) => r.country).map((r) => ({ name: r.country, count: r._count._all }));
  }

  /**
   * Recipe Library — the complete, searchable recipe database for browsing
   * (Netflix-style): pick a cuisine → every recipe in it, filterable and paged.
   */
  async recipeLibrary(q: { search?: string; cuisine?: string; mealType?: string; diet?: string; sort?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(60, Math.max(12, q.pageSize ?? 24));
    const where: Record<string, unknown> = {};
    // Hide bare generic one-word titles (QA L1 data hygiene) — e.g. a recipe
    // literally named "Chili"/"Chicken" is noise in a browsable library.
    const JUNK_TITLES = ['Chili', 'Chilli', 'Chicken', 'Curry', 'Dal', 'Rice', 'Soup', 'Salad', 'Sauce', 'Bread', 'Cake', 'Fish', 'Beef', 'Pork', 'Lamb', 'Snack', 'Drink', 'Dessert', 'Gravy', 'Stew'];
    where.NOT = { name: { in: JUNK_TITLES } };
    if (q.cuisine) where.country = q.cuisine;
    // Search matches a recipe's NAME or its INGREDIENTS, so "paneer" finds
    // dishes made with paneer, not only ones with it in the title.
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { ingredients: { some: { name: { contains: q.search, mode: 'insensitive' } } } },
      ];
    }
    if (q.mealType) {
      const slot = ({ breakfast: 'b', lunch: 'l', dinner: 'd', snack: 's' } as Record<string, string>)[q.mealType];
      if (slot) where.slot = slot;
    }
    if (q.diet) { const dv = this.dietDbValues(q.diet); if (dv.length) where.diet = { in: dv }; }
    const orderBy = (q.sort === 'rated' || q.sort === 'health' || q.sort === 'trending')
      ? [{ healthPercent: 'desc' as const }]
      : q.sort === 'name' ? [{ name: 'asc' as const }] : [{ recipeNo: 'desc' as const }];

    const [rows, total] = await Promise.all([
      this.prisma.recipe.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize, include: { ingredients: { select: { name: true, grams: true } } } } as never) as unknown as Promise<Parameters<NutritionService['recipeCard']>[0][]>,
      this.prisma.recipe.count({ where } as never),
    ]);
    return {
      items: rows.map((r) => this.recipeCard(r)),
      total, page, pageSize, pages: Math.ceil(total / pageSize),
      cuisines: page === 1 ? await this.cuisineFacet() : [],
    };
  }

  /** Read the meal-planning settings (cuisine per slot, fasting, pantry). */
  async mealSettings(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const conditions = ex.healthConditions ?? [];
    return {
      cuisineBySlot: ex.cuisineBySlot ?? {},
      cuisineLocks: ex.cuisineLocks ?? {},
      fasting: ex.fasting ?? { enabled: false, protocol: '16:8' },
      includePantry: ex.includePantry ?? false,
      schedule: resolveSchedule(ex.fasting),
      fastingSafety: fastingSafety(conditions.join(' ')),
    };
  }

  /** Merge a partial meal-settings patch into the pref extras JSON. */
  async setMealSettings(userId: string, patch: Partial<Pick<PrefExtras, 'cuisineBySlot' | 'cuisineLocks' | 'fasting' | 'includePantry'>>) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const next: PrefExtras = {
      ...ex,
      ...(patch.cuisineBySlot !== undefined ? { cuisineBySlot: patch.cuisineBySlot } : {}),
      ...(patch.cuisineLocks !== undefined ? { cuisineLocks: patch.cuisineLocks } : {}),
      ...(patch.fasting !== undefined ? { fasting: patch.fasting } : {}),
      ...(patch.includePantry !== undefined ? { includePantry: patch.includePantry } : {}),
    };
    await this.prisma.foodPref.upsert({
      where: { userId },
      update: { extras: JSON.stringify(next) },
      create: { userId, extras: JSON.stringify(next) },
    } as Parameters<typeof this.prisma.foodPref.upsert>[0]);
    return this.mealSettings(userId);
  }

  /** Merge arbitrary extras keys and persist (used by Refresh/Skip). */
  private async mergeExtras(userId: string, patch: Partial<PrefExtras>): Promise<void> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const next = { ...ex, ...patch };
    await this.prisma.foodPref.upsert({
      where: { userId },
      update: { extras: JSON.stringify(next) },
      create: { userId, extras: JSON.stringify(next) },
    } as Parameters<typeof this.prisma.foodPref.upsert>[0]);
  }

  /** Refresh ONE meal — bump that slot's seed so it re-picks different recipes,
   *  keeping the day's targets and every preference. Returns the updated plan. */
  async refreshComposedMeal(userId: string, day: number, slot: string) {
    const key = `d${day}:${slot}`;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const bumps = { ...(ex.composedBumps ?? {}) };
    bumps[key] = (bumps[key] ?? 0) + 1;
    await this.mergeExtras(userId, { composedBumps: bumps });
    return this.composedPlan(userId);
  }

  /** Skip / unskip ONE meal — the day's energy is redistributed across the
   *  remaining meals and the grocery list is recomputed. Returns the updated plan. */
  async skipComposedMeal(userId: string, day: number, slot: string, skipped: boolean) {
    const key = `d${day}:${slot}`;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const set = new Set(ex.composedSkips ?? []);
    if (skipped) set.add(key); else set.delete(key);
    await this.mergeExtras(userId, { composedSkips: [...set] });
    return this.composedPlan(userId);
  }

  /** Refresh ONE dish within a meal — reroll just that plate role (like-for-like:
   *  a carb stays a carb, a vegetable stays a vegetable) while every other dish on
   *  the plate is untouched. Keyed by d{day}:{slot}:{role}. */
  async refreshComposedComponent(userId: string, day: number, slot: string, role: string) {
    const key = `d${day}:${slot}:${role}`;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const bumps = { ...(ex.composedBumps ?? {}) };
    bumps[key] = (bumps[key] ?? 0) + 1;
    await this.mergeExtras(userId, { composedBumps: bumps });
    return this.composedPlan(userId);
  }

  /** Skip / unskip ONE dish within a meal — that plate role is dropped and the
   *  remaining dishes rescale to the meal's calorie target. Keyed by
   *  d{day}:{slot}:{role}. */
  async skipComposedComponent(userId: string, day: number, slot: string, role: string, skipped: boolean) {
    const key = `d${day}:${slot}:${role}`;
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const set = new Set(ex.composedSkips ?? []);
    if (skipped) set.add(key); else set.delete(key);
    await this.mergeExtras(userId, { composedSkips: [...set] });
    return this.composedPlan(userId);
  }

  /** Restore every skipped meal for the week. */
  async restoreComposedSkips(userId: string) {
    await this.mergeExtras(userId, { composedSkips: [] });
    return this.composedPlan(userId);
  }

  /** Start a FRESH 3-week plan: re-anchor day 0 to today, reseed the meals so the
   *  new block differs, and clear any per-dish Refresh/Skip overrides. */
  async renewComposedPlan(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    await this.mergeExtras(userId, {
      planStartDate: todayISO(),
      planSeedBump: (Number(ex.planSeedBump) || 0) + 1,
      composedBumps: {},
      composedSkips: [],
    });
    return this.composedPlan(userId);
  }

  async upsertFoodPref(userId: string, dto: FoodPrefDto) {
    // `extras` exists on Railway's freshly-generated client; cast for the local
    // (offline) client which can't be regenerated here.
    const data = dto as Record<string, unknown>;
    const saved = await this.prisma.foodPref.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    } as Parameters<typeof this.prisma.foodPref.upsert>[0]);
    // Master Profile sync — body metrics are shared fields (spec: no duplicates).
    await this.masterProfile.syncShared(userId, {
      heightCm: (dto as { heightCm?: number }).heightCm,
      weightKg: (dto as { weightKg?: number }).weightKg,
      gender: (dto as { sex?: string }).sex,
    }, 'nutrition').catch(() => undefined);
    return saved;
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

  // ─────────────── medical nutrition recommendations ───────────────
  /**
   * Active Medical Nutrition Recommendation cards: blood test → condition
   * guidelines → compared against the user's SELECTED preferences → personalised
   * suggestions + honest before/after quality score. Cards the user has already
   * decided on (applied or kept) stay hidden — no nagging.
   */
  async medicalRecs(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId)) as Record<string, string>;
    const prefs: MedPrefs = {
      diet: (pref?.diet ?? 'everything'),
      proteins: ex.proteins ?? [],
      weekly: (ex.weekly ?? {}) as Record<string, 'veg' | 'nonveg'>,
      healthConditions: ex.healthConditions ?? [],
      excluded: ex.excluded ?? '',
    };
    const cards = buildMedicalRecs(prefs, flags);
    const decided = ((ex as { medRecChoices?: Record<string, string> }).medRecChoices) ?? {};
    return {
      cards: cards.filter((c) => !decided[c.condition]),
      decided,
    };
  }

  /** One-tap Apply / Keep for a recommendation card. Apply patches the stored
   *  preferences; both record the choice so the card never nags again. */
  async decideMedicalRec(userId: string, condition: string, choice: 'apply' | 'keep') {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    if (!pref) throw new NotFoundException('preferences not found');
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras) as Record<string, unknown>;
    const flags = flagsFor(await this.bloodValues(userId)) as Record<string, string>;
    const prefs: MedPrefs = {
      diet: (pref.diet ?? 'everything'),
      proteins: (ex.proteins as string[]) ?? [],
      weekly: ((ex.weekly as Record<string, 'veg' | 'nonveg'>) ?? {}),
      healthConditions: (ex.healthConditions as string[]) ?? [],
      excluded: (ex.excluded as string) ?? '',
    };
    const card = buildMedicalRecs(prefs, flags).find((c) => c.condition === condition);
    if (choice === 'apply' && card) {
      const next = applyPatch(prefs, card.patch);
      ex.proteins = next.proteins;
      ex.weekly = next.weekly;
    }
    const choices = ((ex.medRecChoices as Record<string, string>) ?? {});
    choices[condition] = choice === 'apply' ? 'applied' : 'kept';
    ex.medRecChoices = choices;
    await this.prisma.foodPref.update({
      where: { userId },
      data: { extras: JSON.stringify(ex) } as never,
    });
    return {
      ok: true,
      choice,
      message: choice === 'apply'
        ? 'Preferences updated — regenerate your week to apply the kidney-friendlier plan.'
        : "We'll respect your choices and create the best possible meal plan within your selected preferences. Some recommendations may be less effective because of these constraints.",
    };
  }

  // ─────────────── dietary balance & nutrition advisory ───────────────
  /** The backend-assigned diet plans for this user (read-only; auto-updates
   *  with profile/blood changes). */
  async dietPlans(userId: string) {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const flags = flagsFor(await this.bloodValues(userId));
    const assigned = assignDietPlans({
      conditions: ex.healthConditions ?? [], flags: flags as Record<string, string>,
      goal: pref?.goal ?? 'maintain', diet: (pref?.diet ?? 'everything') as Diet, age: pref?.age ?? 30,
    });
    return {
      assigned: assigned.map((k) => DIET_PLAN_CATALOG.find((p) => p.key === k)).filter(Boolean),
      note: 'Assigned automatically from your profile, conditions, blood tests and goals — personalization always takes priority over any single named plan.',
    };
  }

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

    // Backend-assigned diet pattern (Diet Plan Guide) — shown read-only, first.
    const assigned = assignDietPlans({
      conditions: ex.healthConditions ?? [], flags: flags as Record<string, string>,
      goal: pref?.goal ?? 'maintain', diet, age: pref?.age ?? 30,
    });
    if (assigned.length) {
      out.push({
        key: 'diet-plans', title: 'Your diet pattern — assigned for you',
        body: `Based on your medical conditions, blood tests, goals and preferences, your meal plans follow ${assigned.map(planLabel).join(' + ')} principles. This is decided automatically and updates whenever your profile or blood results change — nothing to configure.`,
      });
    }
    // Clinical MNT patterns (Krause's / ESPEN) active for this user, with sources.
    const mnt = activeMntRules({
      conditions: ex.healthConditions ?? [], flags: flags as Record<string, string>,
      age: pref?.age ?? 30, sex: pref?.sex ?? 'male',
    });
    for (const rule of mnt) {
      if (!rule.advisory) continue;
      out.push({
        key: `mnt-${rule.key}`, title: rule.advisory.title,
        body: rule.advisory.body,
      });
    }

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
    // Two-way sync: removing inside Nutrition immediately turns the People
    // `nutrition` module OFF on the shared connection record (no drift).
    await this.connections.revokeModuleForPair(ownerId, memberUserId, 'nutrition').catch(() => undefined);
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

  // ─────────────── Family Meal Planning mode (family-level setting) ───────────────
  /** The household's Family-Meal-Planning flag (stored on the OWNER's pref).
   *  Defaults to ON — one shared master plan with personalised portions. */
  async getFamilyMealPlanning(ownerId: string): Promise<boolean> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId: ownerId } }).catch(() => null);
    return parseExtras((pref as { extras?: string | null } | null)?.extras).familyMealPlanning !== false;
  }

  /** Set the household's Family-Meal-Planning flag (owner only). */
  async setFamilyMealPlanning(ownerId: string, on: boolean): Promise<{ familyMealPlanning: boolean }> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId: ownerId } }).catch(() => null);
    if (!pref) throw new NotFoundException('Set up your Nutrition profile first.');
    const extras = parseExtras((pref as { extras?: string | null }).extras);
    extras.familyMealPlanning = !!on;
    await this.prisma.foodPref.update({ where: { userId: ownerId }, data: { extras: JSON.stringify(extras) } as never });
    return { familyMealPlanning: !!on };
  }

  /** The household owner this user is an ACCEPTED member of (or null). */
  private async householdOwnerFor(memberUserId: string): Promise<string | null> {
    const link = await this.household.findFirst({ where: { memberUserId, status: 'accepted' } }).catch(() => null);
    return link?.ownerId ?? null;
  }

  /**
   * Resolve how the planner should behave for this user:
   *  - `owner`  : head of a household with ≥1 accepted member.
   *  - `member` : an accepted member of someone else's household.
   *  - `solo`   : nobody connected → always an independent plan.
   * `familyMealPlanning` is the household's shared flag (default ON). When ON,
   * members follow one master family plan (read-only personalised view); when
   * OFF, every member gets an independent AI plan while staying connected.
   */
  async familyContext(userId: string): Promise<{ role: 'owner' | 'member' | 'solo'; ownerId: string; familyMealPlanning: boolean; hasFamily: boolean }> {
    const asOwner = await this.household.findFirst({ where: { ownerId: userId, memberUserId: { not: null }, status: 'accepted' } as never }).catch(() => null);
    if (asOwner) {
      return { role: 'owner', ownerId: userId, familyMealPlanning: await this.getFamilyMealPlanning(userId), hasFamily: true };
    }
    const ownerId = await this.householdOwnerFor(userId);
    if (ownerId) {
      return { role: 'member', ownerId, familyMealPlanning: await this.getFamilyMealPlanning(ownerId), hasFamily: true };
    }
    return { role: 'solo', ownerId: userId, familyMealPlanning: true, hasFamily: false };
  }

  /**
   * A member's READ-ONLY view derived from the household's master family plan:
   * the same meals, scaled to this member's own daily-calorie target (with their
   * macros recomputed proportionally). Returns null when the household has no
   * family plan yet (caller then falls back to the member's own plan). This is
   * the single-source-of-truth read for the Individual planner in Family Mode.
   */
  private async familyDerivedWeekly(memberUserId: string, ownerId: string, currentMon: Date) {
    const plans = await this.prisma.mealPlan.findMany({ where: { userId: ownerId, mode: 'family' }, orderBy: { createdAt: 'desc' } }) as unknown as Array<{ key: string; weekStart?: Date | null; createdAt: Date }>;
    const master = plans.find((p) => this.planWeek(p).getTime() === currentMon.getTime()) ?? plans[0];
    if (!master) return null;

    const shaped = await this.shapePlan(master.key);
    // Personalisation factor: this member's daily target vs the plan owner's.
    const [mine, theirs] = await Promise.all([this.targets(memberUserId), this.targets(ownerId)]);
    const factor = Math.min(1.9, Math.max(0.4, (mine.kcal || 1) / (theirs.kcal || 1)));
    const owner = await this.prisma.user.findUnique({ where: { id: ownerId }, select: { name: true } }).catch(() => null);

    const scaleMeal = (m: Record<string, unknown>): Record<string, unknown> => ({
      ...m,
      grams: typeof m.grams === 'number' ? Math.round((m.grams as number) * factor) : m.grams,
      kcal: typeof m.kcal === 'number' ? Math.round((m.kcal as number) * factor) : m.kcal,
      protein: typeof m.protein === 'number' ? Math.round((m.protein as number) * factor) : m.protein,
      carbs: typeof m.carbs === 'number' ? Math.round((m.carbs as number) * factor) : m.carbs,
      fat: typeof m.fat === 'number' ? Math.round((m.fat as number) * factor) : m.fat,
      fiber: typeof m.fiber === 'number' ? Math.round((m.fiber as number) * factor) : m.fiber,
    });

    const days = (shaped.days as Array<Record<string, unknown>>).map((d) => ({
      ...d,
      meals: (d.meals as Array<Record<string, unknown>>).map(scaleMeal),
    }));

    return {
      ...shaped,
      days,
      familyMode: true as const,
      readOnly: true as const,
      basedOnFamily: { ownerName: owner?.name ?? 'your family', factor: Math.round(factor * 100) / 100 },
    };
  }

  // ─────────────── shared pantry (one per household) ───────────────
  /** The household pantry, grouped into supermarket aisles with on-hand amounts. */
  /**
   * Read the pantry, first settling any day that has fully elapsed.
   *
   * NOTE: settlement calls markMealCooked, which returns the pantry — so it must
   * use pantryListRaw, never this method, or the two would call each other
   * forever.
   */
  async pantryList(ownerId: string) {
    await this.settleElapsedDays(ownerId).catch(() => undefined);
    // Same visit, look ahead: anything that must be soaked/fermented/marinated
    // in advance gets its notification while there's still time to act.
    void this.prepAlerts(ownerId).catch(() => undefined);
    return this.pantryListRaw(ownerId);
  }

  /** The pantry exactly as stored — no settlement pass (re-entrancy safe). */
  private async pantryListRaw(ownerId: string) {
    const rows = await this.pantry.findMany({ where: { ownerId }, orderBy: { name: 'asc' } }).catch(() => [] as PantryItemRow[]);
    const grouped = new Map<string, PantryItemRow[]>();
    for (const r of rows) { const arr = grouped.get(r.aisle) ?? []; arr.push(r); grouped.set(r.aisle, arr); }
    const aisles = GROCERY_AISLES
      .filter((a) => (grouped.get(a.key) ?? []).length)
      .map((a) => ({
        key: a.key, icon: a.icon, title: a.title,
        items: (grouped.get(a.key) ?? []).map((r) => {
          const start = Math.max((r as unknown as { startGrams?: number }).startGrams ?? 0, r.grams);
          const remainingPct = start > 0 ? Math.max(0, Math.min(100, Math.round((r.grams / start) * 100))) : 0;
          return {
            id: r.id, name: r.name, grams: r.grams, startGrams: start,
            // Drives the depletion bar: 100 = a full jar, falling as meals cook.
            remainingPct,
            startQtyLabel: standardQty(r.name, start, r.aisle).label,
            qtyLabel: r.qtyLabel || standardQty(r.name, r.grams, r.aisle).label,
            unit: r.unit, updatedAt: r.updatedAt,
          };
        }),
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
      // Re-stocking raises the "full" mark so the depletion bar refills.
      const start = Math.max(total, (existing as { startGrams?: number }).startGrams ?? 0);
      await this.pantry.update({ where: { id: existing.id }, data: { grams: total, startGrams: start, qtyLabel: standardQty(name, total, aisle).label, unit: standardQty(name, total, aisle).unit } as never });
    } else {
      const q = standardQty(name, grams || 1, aisle);
      await this.pantry.create({ data: { ownerId, name, aisle, grams, startGrams: grams, unit: q.unit, qtyLabel: q.label } as never });
    }
    return this.pantryList(ownerId);
  }

  /** Set an item's on-hand quantity (grams). Zero or less removes it. */
  async updatePantryItem(ownerId: string, id: string, grams: number) {
    const existing = await this.pantry.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('pantry item not found');
    const g = Math.max(0, Math.round(Number(grams) || 0));
    if (g <= 0) await this.pantry.delete({ where: { id } });
    else {
      const start = Math.max(g, (existing as { startGrams?: number }).startGrams ?? 0);
      await this.pantry.update({ where: { id }, data: { grams: g, startGrams: start, qtyLabel: standardQty(existing.name, g, existing.aisle).label } as never });
    }
    return this.pantryList(ownerId);
  }

  async removePantryItem(ownerId: string, id: string) {
    const existing = await this.pantry.findFirst({ where: { id, ownerId } }).catch(() => null);
    if (!existing) throw new NotFoundException('pantry item not found');
    await this.pantry.delete({ where: { id } });
    return this.pantryList(ownerId);
  }

  /**
   * COOKED — draw a meal's ingredients down from the pantry.
   *
   * This closes the loop the pantry was missing: stock only ever went up, so
   * "products remaining" was never true. `mealKey` (e.g. "2026-07-29:l") makes
   * the draw idempotent — cooking the same meal twice deducts once, so a double
   * tap or a retry can't empty the shelves.
   *
   * Ingredients come from the composed plan (the plan the citizen is shown), and
   * are matched to pantry rows on the SAME canonical key the grocery list uses,
   * so "Chicken Breast" draws down "Chicken".
   */
  async markMealCooked(ownerId: string, input: { mealKey: string; label?: string; people?: number }) {
    const mealKey = (input.mealKey ?? '').trim().slice(0, 64);
    if (!mealKey) throw new BadRequestException('Which meal was cooked?');
    const log = (this.prisma as unknown as {
      pantryConsumption: {
        findFirst(a: unknown): Promise<{ id: string } | null>;
        create(a: unknown): Promise<unknown>;
        findMany(a: unknown): Promise<Array<{ mealKey: string; itemsJson: string; createdAt: Date; label: string }>>;
      };
    }).pantryConsumption;

    const already = await log.findFirst({ where: { ownerId, mealKey } }).catch(() => null);
    if (already) return { ...(await this.pantryListRaw(ownerId)), alreadyCooked: true };

    // Find the meal in the composed plan by "<YYYY-MM-DD>:<slot>".
    const [dateISO, slot] = mealKey.split(':');
    const composed = await this.composedMealsForShopping(ownerId, 28).catch(() => ({ dayCount: 0, meals: [] as Array<{ slot: string; recipeName: string; dayISO?: string; ingredients: Array<{ name: string; grams: number }> }> }));
    const meals = (composed.meals as Array<{ slot: string; recipeName: string; dayISO?: string; ingredients: Array<{ name: string; grams: number }> }>)
      .filter((m) => (m.dayISO ? m.dayISO === dateISO : true) && (slot ? m.slot === slot : true));
    if (!meals.length) throw new NotFoundException('That meal is not in your current plan.');

    const people = Math.max(1, Math.min(30, Math.round(input.people ?? 1)));
    // Sum what this meal needs, canonicalised like the grocery list.
    const need = new Map<string, number>();
    for (const m of meals) {
      for (const ing of m.ingredients) {
        if (skipGroceryIngredient(ing.name)) continue;
        const canon = canonicalIngredient(ing.name);
        if (!canon) continue;
        const grams = Math.max(0, Math.round(ing.grams * people));
        if (grams <= 0) continue;
        need.set(canon, (need.get(canon) ?? 0) + grams);
      }
    }
    if (!need.size) throw new BadRequestException('That meal has nothing to draw from the pantry.');

    // Deduct what we actually hold; never go below zero, and keep the row (at 0)
    // so the citizen can see it ran out rather than having it vanish.
    const rows = await this.pantry.findMany({ where: { ownerId } }).catch(() => [] as PantryItemRow[]);
    const byKey = new Map(rows.map((r) => [canonicalIngredient(r.name).toLowerCase(), r]));
    const deducted: Array<{ name: string; grams: number }> = [];
    for (const [name, grams] of need) {
      const row = byKey.get(name.toLowerCase());
      if (!row) continue;                       // not stocked — nothing to draw
      const take = Math.min(row.grams, grams);
      if (take <= 0) continue;
      const left = row.grams - take;
      await this.pantry.update({
        where: { id: row.id },
        data: { grams: left, qtyLabel: standardQty(row.name, left, row.aisle).label } as never,
      }).catch(() => undefined);
      deducted.push({ name: row.name, grams: take });
    }

    await log.create({
      data: { ownerId, mealKey, label: (input.label ?? '').slice(0, 120), itemsJson: JSON.stringify(deducted) },
    }).catch(() => undefined);

    return { ...(await this.pantryListRaw(ownerId)), cooked: true, deducted };
  }

  /**
   * END-OF-DAY SETTLEMENT.
   *
   * A day's meals shouldn't need a button press to leave the pantry — once the
   * day is over, what was planned is treated as eaten. This settles every day
   * that has fully elapsed in the citizen's own timezone and hasn't been
   * settled yet, so stock reflects reality even if they never opened Cook Mode.
   *
   * Idempotent twice over: each meal is logged under a unique
   * "<date>:<slot>" key (so a meal already marked cooked isn't deducted again),
   * and `pantrySettledThrough` short-circuits the whole pass once a day is done.
   * Bounded to the last 14 days so a long-dormant account can't drain its
   * shelves in one go.
   */
  async settleElapsedDays(ownerId: string): Promise<{ settledDays: number; settledMeals: number }> {
    const none = { settledDays: 0, settledMeals: 0 };
    const pref = await this.prisma.foodPref.findUnique({ where: { userId: ownerId } }).catch(() => null);
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);

    // "Today" in the citizen's timezone — a day is only settled once THEIR day
    // has ended, not the server's.
    const tz = await this.prisma.masterProfile
      .findUnique({ where: { userId: ownerId }, select: { timeZone: true } })
      .then((m) => (m as { timeZone?: string | null } | null)?.timeZone ?? null)
      .catch(() => null);
    let todayLocal = todayISO();
    if (tz) {
      try { todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
      catch { /* bad tz string → server day */ }
    }
    const yesterday = addDaysISO(todayLocal, -1);
    if (ex.pantrySettledThrough && ex.pantrySettledThrough >= yesterday) return none; // already done

    const plan = (await this.composedPlan(ownerId).catch(() => null)) as unknown as {
      needsProfile?: boolean; planStartDate?: string;
      days?: Array<{ dayIndex: number; meals: Array<{ slot: string; title: string; components: Array<{ name: string; ingredients?: Array<{ name: string; grams: number; toTaste?: boolean }> }> }> }>;
    } | null;
    if (!plan?.days?.length || plan.needsProfile) return none;

    const startISO = plan.planStartDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.planStartDate) ? plan.planStartDate : todayLocal;
    const floor = addDaysISO(todayLocal, -14);
    let settledDays = 0, settledMeals = 0;
    for (const d of plan.days) {
      const dayISO = addDaysISO(startISO, d.dayIndex);
      if (dayISO >= todayLocal) continue;   // today isn't over yet
      if (dayISO < floor) continue;         // don't reach back further than 14 days
      let touched = false;
      for (const m of d.meals) {
        const res = await this.markMealCooked(ownerId, { mealKey: `${dayISO}:${m.slot}`, label: m.title })
          .catch(() => null);
        if (res && (res as { cooked?: boolean }).cooked) { settledMeals++; touched = true; }
      }
      if (touched) settledDays++;
    }
    await this.mergeExtras(ownerId, { pantrySettledThrough: yesterday }).catch(() => undefined);
    return { settledDays, settledMeals };
  }

  /**
   * ADVANCE-PREP ALERTS.
   *
   * Some dishes can't be started at mealtime: idli/dosa batter ferments
   * overnight, rajma soaks 8 hours, biryani meat marinates. If breakfast is at
   * 09:00 and the batter needed to be down by 21:00 the night before, telling
   * the citizen at 09:00 is useless. This looks ahead at the plan and tells them
   * while there's still time to act.
   *
   * Lead time is read from the recipe's own words, so it's honest about what a
   * dish actually needs rather than guessing a flat number.
   */
  private static prepLeadHours(text: string): { hours: number; what: string } | null {
    const t = (text || '').toLowerCase();
    // Longest/most specific first — "overnight" beats a bare "soak".
    if (/\bferment(ing|ed|ation)?\b.*\bovernight\b|\bovernight\b.*\bferment/.test(t)) return { hours: 12, what: 'ferment overnight' };
    if (/\bovernight\b/.test(t)) return { hours: 12, what: 'prep overnight' };
    if (/\bferment/.test(t)) return { hours: 8, what: 'ferment' };
    if (/\bsoak(ing|ed)?\b/.test(t)) {
      const m = t.match(/soak[^.]{0,40}?(\d{1,2})\s*(hour|hr)/);
      const h = m ? Math.min(24, Math.max(1, Number(m[1]))) : 8;
      return { hours: h, what: `soak ${h}h` };
    }
    if (/\bmarinat/.test(t)) {
      const m = t.match(/marinat[^.]{0,40}?(\d{1,2})\s*(hour|hr)/);
      const h = m ? Math.min(24, Math.max(1, Number(m[1]))) : 2;
      return { hours: h, what: `marinate ${h}h` };
    }
    if (/\bsprout(ing|ed)?\b/.test(t)) return { hours: 12, what: 'sprout' };
    if (/\bproof(ing|ed)?\b|\brise\b.*\bdough\b|\bdough\b.*\brise\b/.test(t)) return { hours: 3, what: 'prove the dough' };
    if (/\bchill\b.*\b(\d{1,2})\s*(hour|hr)|\brefrigerate\b.*\bovernight\b/.test(t)) return { hours: 4, what: 'chill' };
    return null;
  }

  /**
   * Look ahead over the next ~2 days of the plan and notify about anything that
   * must be started in advance. Fires while there is still time (at the latest
   * moment that still works), and only once per meal — the notification's
   * entityId is the meal key, so re-opening the app never re-notifies.
   *
   * Works for both individual and family plans: family mode says who it feeds.
   */
  async prepAlerts(userId: string, mode: PlanMode = 'individual'): Promise<{ alerts: Array<{ mealKey: string; title: string; what: string; startBy: string; notified: boolean }> }> {
    const plan = (await this.composedPlan(userId).catch(() => null)) as unknown as {
      needsProfile?: boolean; planStartDate?: string;
      days?: Array<{ dayIndex: number; meals: Array<{ slot: string; title: string; label: string; scheduledTime?: string; components: Array<{ name: string; steps?: string[]; ingredients?: Array<{ name: string }> }> }> }>;
    } | null;
    if (!plan?.days?.length || plan.needsProfile) return { alerts: [] };

    const startISO = plan.planStartDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.planStartDate) ? plan.planStartDate : todayISO();
    const now = Date.now();
    const horizon = now + 60 * 3600 * 1000;      // look ~2.5 days ahead
    const householdSize = mode === 'family'
      ? Math.max(1, (await this.prisma.familyMember.count({ where: { ownerId: userId } }).catch(() => 0)) || 1)
      : 1;

    const out: Array<{ mealKey: string; title: string; what: string; startBy: string; notified: boolean }> = [];
    for (const d of plan.days) {
      const dayISO = addDaysISO(startISO, d.dayIndex);
      for (const m of d.meals) {
        // When this meal is served (falls back to a sensible hour per slot).
        const time = /^\d{2}:\d{2}$/.test(m.scheduledTime ?? '')
          ? (m.scheduledTime as string)
          : ({ b: '09:00', l: '13:00', s: '17:00', d: '20:00' } as Record<string, string>)[m.slot] ?? '12:00';
        const servedAt = Date.parse(`${dayISO}T${time}:00`);
        if (!Number.isFinite(servedAt) || servedAt < now || servedAt > horizon) continue;

        // Does anything in this meal need a head start?
        const hay = m.components.map((c) => `${c.name} ${(c.steps ?? []).join(' ')} ${(c.ingredients ?? []).map((i) => i.name).join(' ')}`).join(' ');
        const lead = NutritionService.prepLeadHours(hay);
        if (!lead) continue;

        const startBy = new Date(servedAt - lead.hours * 3600 * 1000);
        // Only worth saying while they can still act on it.
        if (startBy.getTime() < now - 3600 * 1000) continue;

        const mealKey = `${dayISO}:${m.slot}`;
        const when = startBy.toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
        const forWhom = mode === 'family' && householdSize > 1 ? ` for ${householdSize} people` : '';
        const notified = await this.notifyOnce(userId, {
          kind: 'meal_prep',
          entityId: `prep:${mealKey}`,
          title: `Start ${m.title} by ${when}`,
          body: `${m.label} on ${new Date(`${dayISO}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} needs to ${lead.what}${forWhom}. Get it going and it'll be ready on time.`,
          href: '/nutrition/daily',
        });
        out.push({ mealKey, title: m.title, what: lead.what, startBy: startBy.toISOString(), notified });
      }
    }
    return { alerts: out };
  }

  /** Create a notification only if one with this entityId doesn't already exist. */
  private async notifyOnce(userId: string, input: { kind: string; entityId: string; title: string; body: string; href: string }): Promise<boolean> {
    const existing = await (this.prisma as unknown as {
      notification: { findFirst(a: unknown): Promise<{ id: string } | null> };
    }).notification.findFirst({ where: { userId, entityId: input.entityId } }).catch(() => null);
    if (existing) return false;
    await this.notifications.create({ userId, kind: input.kind, title: input.title, body: input.body, href: input.href, entityId: input.entityId }).catch(() => undefined);
    return true;
  }

  /** Recent pantry draw-downs (what the household actually got through). */
  async pantryHistory(ownerId: string, limit = 30) {
    const log = (this.prisma as unknown as {
      pantryConsumption: { findMany(a: unknown): Promise<Array<{ mealKey: string; label: string; itemsJson: string; createdAt: Date }>> };
    }).pantryConsumption;
    const rows = await log.findMany({ where: { ownerId }, orderBy: { createdAt: 'desc' }, take: Math.min(100, limit) }).catch(() => []);
    return {
      items: rows.map((r) => {
        let items: Array<{ name: string; grams: number }> = [];
        try { items = JSON.parse(r.itemsJson) as Array<{ name: string; grams: number }>; } catch { items = []; }
        return { mealKey: r.mealKey, label: r.label, items, at: r.createdAt.toISOString() };
      }),
    };
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
        // Real adherence: how many of the last 7 days the household actually
        // logged plan meals. Previously this echoed nutritionScore (and
        // mealCompletion was a flat 100 whenever a plan existed), which made a
        // household that had eaten nothing look perfectly on track.
        ...(await this.householdAdherence(userId, dash.hasPlan)),
        status: dash.familyStatus,
      },
    };
  }

  /**
   * Adherence measured from what was actually logged, not from having a plan.
   * `adherenceScore` = % of the last 7 days with at least one logged plan meal;
   * `mealCompletion` = logged plan meals vs the plan's slots over that window.
   * Both are null when there's no plan to adhere to — an unmeasurable number is
   * reported as unknown rather than invented.
   */
  private async householdAdherence(userId: string, hasPlan: boolean): Promise<{ adherenceScore: number | null; mealCompletion: number | null }> {
    if (!hasPlan) return { adherenceScore: null, mealCompletion: null };
    const days = 7;
    const keys: string[] = [];
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today.getTime() - i * 86_400_000);
      keys.push(d.toISOString().slice(0, 10));
    }
    const entries = await this.prisma.calorieEntry
      .findMany({ where: { userId, date: { in: keys } }, select: { date: true, type: true } })
      .catch(() => [] as Array<{ date: string; type: string }>);
    if (!entries.length) return { adherenceScore: 0, mealCompletion: 0 };
    const planEntries = entries.filter((e) => e.type === 'Meal Plan');
    const daysLogged = new Set(planEntries.map((e) => e.date)).size;
    const expectedMeals = days * SLOTS.length;
    return {
      adherenceScore: Math.round((daysLogged / days) * 100),
      mealCompletion: Math.min(100, Math.round((planEntries.length / Math.max(1, expectedMeals)) * 100)),
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

    // Planner mode is the single switch between the household's SHARED plan
    // (family) and this user's OWN independent plan (individual). A user can
    // only be in family mode when they truly belong to a household that has
    // Family Meal Planning on — otherwise fall back to their individual plan.
    const ctx = await this.familyContext(userId).catch(() => null);
    if (mode === 'family' && !(ctx?.hasFamily && ctx.familyMealPlanning)) mode = 'individual';

    // FAMILY MODE for a connected MEMBER: a READ-ONLY, personalised view of the
    // household's master family plan (single source of truth). Owners fall
    // through and load their own stored master plan (mode='family') below.
    if (mode === 'family' && ctx?.role === 'member') {
      const derived = await this.familyDerivedWeekly(userId, ctx.ownerId, currentMon).catch(() => null);
      if (derived) {
        const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
        return { ...derived, stale: false, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
      }
      // The household hasn't built its master plan yet — nothing to show.
      return { needsPlan: true, key: '', days: [], stale: false, isCurrentWeek: false, guidance: null, advisories: [], familyMode: true, readOnly: true };
    }

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
    // In Family Mode a member cannot regenerate the master — return the
    // read-only family-derived view instead (the owner regenerates the master).
    const ctx = await this.familyContext(userId).catch(() => null);
    if (mode === 'family' && !(ctx?.hasFamily && ctx.familyMealPlanning)) mode = 'individual';
    if (mode === 'family' && ctx?.role === 'member') {
      const derived = await this.familyDerivedWeekly(userId, ctx.ownerId, weekMonday(new Date())).catch(() => null);
      if (derived) {
        const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
        return { ...derived, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
      }
      return { needsPlan: true, key: '', days: [], guidance: null, advisories: [], familyMode: true, readOnly: true };
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
    // Family Mode: members don't author their own weeks — hand back the read-only
    // family-derived view (the owner owns the master plan).
    const ctx = await this.familyContext(userId).catch(() => null);
    if (mode === 'family' && !(ctx?.hasFamily && ctx.familyMealPlanning)) mode = 'individual';
    if (mode === 'family' && ctx?.role === 'member') {
      const derived = await this.familyDerivedWeekly(userId, ctx.ownerId, weekMonday(new Date())).catch(() => null);
      if (derived) {
        const [guidance, adv] = await Promise.all([this.userPlanGuidance(userId), this.advisoriesFor(userId)]);
        return { ...derived, isCurrentWeek: true, guidance, advisories: adv.advisories, healthScore: adv.healthScore };
      }
      return { needsPlan: true, key: '', days: [], guidance: null, advisories: [], familyMode: true, readOnly: true };
    }
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
  /**
   * Score the citizen's CURRENT composed plan with the real scorer — averaged
   * day totals measured against their targets and clinical caps. Returns null
   * when there's no plan to score, so callers can say "not yet" instead of
   * printing a made-up number.
   */
  private async scorePlanForUser(userId: string): Promise<{ health: number; preference: number } | null> {
    const plan = (await this.composedPlan(userId)) as unknown as {
      needsProfile?: boolean;
      scorecard?: { health?: number; preference?: number };
    };
    if (plan?.needsProfile) return null;
    const h = plan?.scorecard?.health;
    const p = plan?.scorecard?.preference;
    if (typeof h !== 'number' || typeof p !== 'number') return null;
    return { health: Math.max(0, Math.min(100, Math.round(h))), preference: Math.max(0, Math.min(100, Math.round(p))) };
  }

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

    // Health-score impact (§21). `medicalOptimisation` reflects how well the
    // plan's choices align with declared conditions.
    let medicalOptimisation = 100;
    for (const a of A) medicalOptimisation -= a.actionable ? (a.level === 2 ? 16 : 8) : (a.level === 2 ? 6 : 3);
    medicalOptimisation = Math.max(50, medicalOptimisation);

    // `preferenceMatch` used to be the constant 100 — so this score never looked
    // at the food at all and could not fall below ~72 no matter how badly the
    // plan missed the citizen's targets. Score the ACTUAL plan with the real
    // scorer (the same one the composed plan's scorecard uses). If the plan
    // can't be scored we report null rather than inventing a number.
    const scored = await this.scorePlanForUser(userId).catch(() => null);
    const preferenceMatch = scored?.preference ?? null;
    const nutritionalHealth = scored?.health ?? null;
    const overall = scored
      ? Math.round((scored.health * 0.35) + (scored.preference * 0.25) + (medicalOptimisation * 0.40))
      : null;
    const misaligned = A.filter((a) => a.actionable);
    const note = misaligned.length
      ? `Your meal plan fully matches your food preferences. However, based on your ${misaligned.map((a) => a.condition.toLowerCase()).join(' & ')}, a more plant-forward diet may further improve long-term outcomes.`
      : 'Your meal plan matches both your food preferences and your medical profile.';
    return { advisories: A, healthScore: { preferenceMatch, medicalOptimisation, nutritionalHealth, overall, note } };
  }

  /** Build a slot→recipes map honouring the user's diet, allergies, avoided
   *  foods, cook-time cap and cuisine-mix bias. `dayDiet` lets a single day be
   *  forced vegetarian (weekly veg/non-veg rule) on top of the base diet. */
  private rankedPools(
    recipes: RecipeWithIng[], dayDiet: Diet, ex: PrefExtras, modes: ReturnType<typeof planningModes>,
    preferAnimalProtein = true,
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
      // Last-resort pools relax diet-fit and meal-fit, but NEVER allergies or
      // avoided foods. If nothing is safe the slot is left empty on purpose —
      // previously this fell back to the unfiltered slot and could plate an
      // allergen for someone who had declared it.
      if (!pool.length) pool = inSlot.filter((r) => dietAllows(dayDiet, r.diet as Diet) && isPlannableMeal(r) && allergySafe(r, ex));
      if (!pool.length) pool = inSlot.filter((r) => dietAllows(dayDiet, r.diet as Diet) && allergySafe(r, ex));
      if (!pool.length) pool = inSlot.filter((r) => allergySafe(r, ex));
      const byMode = rankByModes(pool as unknown as RecipeShape[], modes) as unknown as RecipeWithIng[];
      let ordered = cuisineBias(byMode, mix);
      // Breakfast & snack: PREFER the user's selected animal proteins (egg/
      // chicken/fish first) without excluding veg options — a stable partition
      // keeps the clinical + cuisine order intact within each group. We honour
      // the user's food preference even with a medical condition (§21): the plan
      // follows their choice; medical guidance is shown as advice, not enforced.
      if (preferAnimalProtein && (slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)) {
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
  /** Union every family member's allergies/exclusions into the planning prefs. */
  private async withHouseholdAllergies(userId: string, ex: PrefExtras): Promise<PrefExtras> {
    const members = await this.prisma.familyMember
      .findMany({ where: { ownerId: userId }, select: { extras: true } })
      .catch(() => [] as Array<{ extras: string | null }>);
    if (!members.length) return ex;
    const allergies = new Set(terms(ex.allergies));
    const excluded = new Set(terms(ex.excluded));
    const conditions = new Set(ex.healthConditions ?? []);
    for (const m of members) {
      let mx: { allergies?: unknown; excluded?: unknown; healthConditions?: unknown } = {};
      try { mx = m.extras ? JSON.parse(m.extras) : {}; } catch { mx = {}; }
      const asList = (v: unknown): string[] =>
        Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',') : [];
      for (const a of asList(mx.allergies)) { const t = a.trim().toLowerCase(); if (t) allergies.add(t); }
      for (const a of asList(mx.excluded)) { const t = a.trim().toLowerCase(); if (t) excluded.add(t); }
      for (const c of asList(mx.healthConditions)) { const t = c.trim(); if (t) conditions.add(t); }
    }
    return {
      ...ex,
      allergies: [...allergies].join(','),
      excluded: [...excluded].join(','),
      healthConditions: [...conditions],
    };
  }

  private async generatePlan(userId: string, mode: PlanMode, weekStart?: Date) {
    const ws = weekMonday(weekStart ?? new Date());
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const diet = (pref?.diet ?? 'everything') as Diet;
    let ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    // FAMILY plans feed everyone from the same dishes, so the household's
    // allergies and avoided foods must ALL apply — the owner's preferences
    // alone would let a shared dish carry a child's allergen.
    if (mode === 'family') ex = await this.withHouseholdAllergies(userId, ex);
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
    const bloodFlags = flagsFor(await this.bloodValues(userId));
    const modes = planningModes(bloodFlags, pref?.goal ?? 'maintain');
    // Backend-assigned diet plans (Diet Plan Guide): decided from the profile,
    // never picked by the user; they bias recipe selection below.
    const dietPlans = assignDietPlans({
      conditions: ex.healthConditions ?? [], flags: bloodFlags as Record<string, string>,
      goal: pref?.goal ?? 'maintain', diet, age: pref?.age ?? 30,
    });
    // Clinical MNT layer (mined from Krause's + ESPEN): condition-specific
    // emphasize/limit food guidance biases every recipe decision.
    const mntRules: MntRule[] = activeMntRules({
      conditions: ex.healthConditions ?? [], flags: bloodFlags as Record<string, string>,
      age: pref?.age ?? 30, sex: pref?.sex ?? 'male',
    });
    // Targets drive selection, so compute them BEFORE ranking the pools. The
    // protein DENSITY target (g per kcal) decides whether this is a genuinely
    // high-protein prescription. Only then do we let breakfast/snack lean into
    // animal-protein dishes; a modest-protein plan (the common case, and the
    // one that used to "spill" past 100 %) must NOT be pushed toward dense
    // protein foods it can't stay under.
    const tg = await this.targets(userId);
    const opts = await this.plateOptsFor(userId);
    const proteinDensityTarget = tg.protein / Math.max(1, tg.kcal);
    const proteinCapped = isProteinRestricted(ex);
    // High-protein prescription ≈ ≥0.04 g/kcal (~103 g at 2,573 kcal). Below
    // that, protein is the binding ceiling, so we suppress every protein-seeking
    // heuristic and hard-cap per-dish protein density instead.
    const preferAnimalProtein = !proteinCapped && proteinDensityTarget >= 0.04;
    const baseRanked = this.rankedPools(recipes, diet, ex, modes, preferAnimalProtein);
    // Some days can be forced vegetarian by the weekly rule — precompute a veg pool.
    const vegRanked = this.rankedPools(recipes, 'veg', ex, modes, preferAnimalProtein);

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
    let usedRecipe = new Map<string, number>();
    let usedProtein = new Map<string, number>();
    let usedCarb = new Map<string, number>();
    let usedMethod = new Map<string, number>();
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
      // Protein is ASYMMETRIC: weekly protein must stay ≤100 %, so a dish that
      // is denser than the target is far worse than one that is lighter. Over-
      // target density is penalised ~3× harder than under — this is what stops
      // the optimiser from ever "spilling" protein past the prescription.
      const pDev = (n.protein / k - tD.protein) / Math.max(0.005, tD.protein);
      return 3.0 * (pDev > 0 ? pDev * 3 : -pDev)
        + 1.0 * Math.abs(n.carbs / k - tD.carb) / Math.max(0.01, tD.carb)
        + 1.0 * Math.abs(n.fat / k - tD.fat) / Math.max(0.01, tD.fat)
        + 0.6 * Math.max(0, tD.fiber - n.fiber / k) / Math.max(0.002, tD.fiber)   // fibre: only shortfall hurts
        + 1.2 * Math.abs(n.kcal - mealKcal) / Math.max(1, mealKcal)               // a dietitian sizes each meal to its slot
        - 0.03 * microRichness(r)                                                 // micro-dense food fills RDAs by default
        + dietPlanBias(dietPlans, r, { protein: n.protein / k, fiber: n.fiber / k })  // assigned-plan nudge (±0.5 max)
        + mntRecipeBias(mntRules, r);                                             // clinical MNT guidance (±0.4 max)
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

    // ── Dynamic meal structure (spec: the NUMBER of meals is an optimization
    // outcome, not a fixed design decision). For each day we trial 4-meal
    // (b/l/s/d), 3-meal (b/l/d) and 2-meal (l/d) structures, pick + portion-
    // solve each, and keep the structure whose day best satisfies the
    // prescription. The standard 4-meal day wins ties; fewer meals take over
    // only when they MEANINGFULLY improve validity — e.g. a kidney-moderated
    // 66 g protein target that four dishes can't stay under. Very high targets
    // are covered by larger portions plus the card's split-into-two-servings
    // guidance (effectively 5–6 eating occasions without new slots).
    const STRUCTURES: Slot[][] = [
      [...SLOTS],                                        // 4 meals — standard
      SLOTS.filter((s) => s !== 's') as Slot[],          // 3 meals — no snack
      SLOTS.filter((s) => s === 'l' || s === 'd') as Slot[], // 2 meals — lunch + dinner
    ];
    const snapMaps = () => [new Map(usedRecipe), new Map(usedProtein), new Map(usedCarb), new Map(usedMethod)] as const;
    const restoreMaps = (s: readonly [Map<string, number>, Map<string, number>, Map<string, number>, Map<string, number>]) => {
      usedRecipe = new Map(s[0]); usedProtein = new Map(s[1]); usedCarb = new Map(s[2]); usedMethod = new Map(s[3]);
    };

    // ── Weekly nutritional budgeting: the WEEK is the optimization unit under
    // HARD weekly rules (protein ≤100%, carbs ≥95%, kcal 98–100%…). Each day
    // aims at its share of the REMAINING weekly budget, so the caps are
    // enforced arithmetically as the week is composed — then a final week
    // validation gate rejects and regenerates if anything still escapes.
    const initState = snapMaps();
    const composeWeek = (weekShift: number) => {
      restoreMaps(initState);
      const picks: Record<number, Partial<Record<Slot, RecipeWithIng>>> = {};
      const portions: Record<number, Record<string, number>> = {};
      const dayAddons: Record<number, Record<string, AddonPick[]>> = {};
      const consumed = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };
      for (let d = 0; d < DAYS.length; d++) {
      const dayVeg = ex.weekly?.[SHORT_DAYS[d]] === 'veg';
      const ranked = dayVeg ? vegRanked : baseRanked;
      const pickSlot = (slot: Slot, rotShift = 0): RecipeWithIng | undefined => {
        const full = ranked[slot];
        const sliced = modes.length ? full.slice(0, Math.max(6, Math.ceil(full.length / 2))) : full;
        // HARD protein-density ceiling: no dish denser than ~1.5× the target
        // protein density may even enter the candidate set (portioning can't
        // lower a dish's density, so an over-dense dish spills protein at ANY
        // serving size). Relax the cap only if the slot would go under-stocked,
        // and never for a genuinely high-protein prescription (cap is high there).
        const densityCap = Math.max(proteinDensityTarget * 1.5, 0.03);
        const rDensity = (r: RecipeWithIng): number => {
          const m = r as unknown as { protein?: number; kcal?: number };
          return (m.protein ?? 0) / Math.max(1, m.kcal ?? 1);
        };
        const capped = (() => {
          for (let t = 0, f = 1; t < 6; t++, f *= 1.3) {
            const kept = sliced.filter((r) => rDensity(r) <= densityCap * f);
            if (kept.length >= 10) return kept;
          }
          return sliced;
        })();
        // Preference nudge for breakfast/snack — ONLY when the prescription
        // genuinely wants dense protein; suppressed otherwise so it can't spill.
        const prefer = preferAnimalProtein && (slot === 'b' || slot === 's') && eatsAnimalProtein(allowed)
          ? (r: RecipeWithIng) => hasSelectedAnimalProtein(r, allowed)
          : undefined;
        return pick(capped, d + rotShift + weekShift, slot, prefer);
      };
      // Evaluate a candidate set of picks: quantized solve (½–1½ plates) with
      // shared plate budgets, then complement fill, then the HARD gate. Score
      // is the total band violation of the COMPLETE day (dishes + add-ons).
      const tgDay = this.weekBudgetTarget(tg, consumed, d, proteinCapped);
      const mealsLikeOf = (p: Partial<Record<Slot, RecipeWithIng>>) =>
        SLOTS.filter((sl) => p[sl]).map((sl) => ({ slot: sl as string, skipped: false, recipe: p[sl] as unknown }));
      const evalPicks = (p: Partial<Record<Slot, RecipeWithIng>>) => {
        const solved = this.solveDayQ(mealsLikeOf(p), d, tgDay, opts);
        const planned = this.planDayAddons(solved.items, solved.pcts, tgDay, diet, dietPlans);
        const addonItems = Object.values(planned.addons).reduce((n, a) => n + a.length, 0);
        // A dietitian prefers the day whose MEALS carry the nutrition: add-on
        // items cost score, so recipe swaps win over patching whenever possible.
        return { ...solved, ...planned, score: planned.violation.total + addonItems * 0.35 };
      };

      // Trial every structure from the same starting variety state; keep the best.
      const baseState = snapMaps();
      type Trial = { picksT: Partial<Record<Slot, RecipeWithIng>>; ev: ReturnType<typeof evalPicks>; state: ReturnType<typeof snapMaps> };
      let best: Trial | null = null;
      for (const S of STRUCTURES) {
        restoreMaps(baseState);
        const trial: Partial<Record<Slot, RecipeWithIng>> = {};
        for (const slot of S) { const r = pickSlot(slot); if (r) trial[slot] = r; }
        const ev = evalPicks(trial);
        // First (standard) structure sets the bar; later, smaller structures
        // must beat it by a real margin to be worth losing a meal.
        if (!best || ev.score < best.ev.score - 0.5) best = { picksT: trial, ev, state: snapMaps() };
        if (best.ev.score <= 0) break;   // valid — no need to try smaller structures
      }
      const chosen = best as Trial;
      restoreMaps(chosen.state);
      picks[d] = chosen.picksT;
      let ev = chosen.ev;

      // HARD-GATE repair: the plan is INVALID until every nutrient (including
      // the complement add-ons) sits inside its band. Swap recipes — fit-sorted
      // candidates most likely to fix the violated nutrient first — until the
      // gate passes or the pool is exhausted. Pools are hard-filtered, so a
      // swap can never violate diet/medical constraints.
      if (ev.score > 0) {
        const pools = dayVeg ? vegRanked : baseRanked;
        for (let sweep = 0; sweep < 3 && ev.score > 0; sweep++) {
          for (const sl of SLOTS.filter((s) => picks[d][s])) {
            if (ev.score <= 0) break;
            const original = picks[d][sl] as RecipeWithIng;
            const isPlate = /india/i.test(original.country) && (sl === 'l' || sl === 'd');
            if (isPlate) continue;
            const alternates = (pools[sl] ?? [])
              .filter((r) => r.id !== original.id && count(usedRecipe, r.id) < (sweep === 0 ? 1 : 2))
              .slice(0, 300)
              .map((r) => ({ r, s: fitScore(r, sl, d) }))
              .sort((a, b) => a.s - b.s)
              .slice(0, sweep === 0 ? 40 : sweep === 1 ? 80 : 120)
              .map((x) => x.r);
            for (const alt of alternates) {
              picks[d][sl] = alt;
              const tryEv = evalPicks(picks[d]);
              if (tryEv.score < ev.score - 0.1) { ev = tryEv; bump(usedRecipe, alt.id); }
              else picks[d][sl] = original;
              if (ev.score <= 0) break;
            }
          }
        }
        if (ev.score > 0) ev = evalPicks(picks[d]); // settle on the final picks

        // Full-day REDESIGN (dietitian rule: if a day can't be balanced, don't
        // patch it — compose a new one). Up to two attempts from different
        // rotations; keep whichever day reviews best.
        for (const rotShift of [3, 5]) {
          if (ev.score <= 0) break;
          const redesignState = snapMaps();
          restoreMaps(baseState);
          const redesign: Partial<Record<Slot, RecipeWithIng>> = {};
          for (const slot of SLOTS) {
            if (!chosen.picksT[slot] && !picks[d][slot]) continue;
            const r = pickSlot(slot, rotShift);
            if (r) redesign[slot] = r;
          }
          const savedPicks = picks[d];
          picks[d] = redesign;
          const evR = evalPicks(redesign);
          if (evR.score < ev.score - 0.1) { ev = evR; }
          else { picks[d] = savedPicks; restoreMaps(redesignState); }
        }
      }
      portions[d] = ev.pcts;
      dayAddons[d] = ev.addons;
      // Consume this day's outcome from the weekly budget.
      const dayTot = dayTotalsFor(ev.items, ev.pcts);
      consumed.kcal += dayTot.kcal + ev.extra.kcal;
      consumed.protein += dayTot.protein + ev.extra.protein;
      consumed.carb += dayTot.carbs + ev.extra.carbs;
      consumed.fat += dayTot.fat + ev.extra.fat;
      consumed.fiber += dayTot.fiber + ev.extra.fiber;
      }
      const weekTotals = { kcal: consumed.kcal, protein: consumed.protein, carbs: consumed.carb, fat: consumed.fat, fiber: consumed.fiber };
      const gate = weekBandViolation(weekTotals, tg);
      return { picks, portions, dayAddons, weekTotals, gate };
    };

    // WEEK VALIDATION GATE: compose, and if any weekly hard rule fails,
    // reject the whole week and regenerate from a different rotation —
    // keep whichever attempt satisfies the constraints best.
    let weekPlan = composeWeek(0);
    if (weekPlan.gate.total > 0) {
      const retry = composeWeek(11);
      if (retry.gate.total < weekPlan.gate.total) weekPlan = retry;
    }
    if (weekPlan.gate.total > 0) {
      this.logger.warn(`Week gate not fully satisfied after regeneration: worst=${weekPlan.gate.worstNutrient} ${weekPlan.gate.worstSide} (${weekPlan.gate.total} pts)`);
    }
    const picks = weekPlan.picks;
    const portions = weekPlan.portions;
    const dayAddons = weekPlan.dayAddons;

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
                  addonsJson: JSON.stringify(dayAddons[dayIndex]?.[slot] ?? []),
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
  private dayMealInputs(meals: Array<{ slot: string; skipped: boolean; portionPct?: number | null; recipe: { country: string } }>): DayMealInput[] {
    return meals.map((m) => {
      const indian = /india/i.test(m.recipe.country);
      const isPlate = (m.slot === 'l' || m.slot === 'd') && indian;
      // Portion-aware: plate budgets must see the PORTIONED contribution of
      // the fixed dishes, or the plates absorb a phantom remainder.
      const pf = ((m.portionPct ?? 100) as number) / 100;
      return {
        slot: m.slot as DayMealInput['slot'],
        skipped: m.skipped,
        isPlate,
        fixedKcal: isPlate ? 0 : this.recipeShape(m.recipe as unknown as Parameters<NutritionService['recipeShape']>[0]).kcal * pf,
      };
    });
  }

  /** Dietitian portion control: servings quantized to ½ / ¾ / 1 / 1¼ / 1½
   *  plates. The card shows the PORTIONED values (what you eat) plus the
   *  serving size; the recipe page shows per-full-plate values. Every consumer
   *  counts the same portioned numbers, so totals always reconcile. */
  private static readonly QSOLVE: SolveOpts = { steps: [50, 75, 100, 125, 150], defaultMax: 150 };

  /**
   * THE one day-measurement everyone shares (generator, repair, rebalance,
   * overview): plate budgets from perMealTargets with portion-aware fixed
   * kcal, plates pinned at 100%, other dishes carry base per-serving macros.
   */
  private buildDayItems(
    meals: Array<{ slot: string; skipped: boolean; portionPct?: number | null; recipe: unknown }>,
    pcts: Record<string, number>,
    dayIndex: number,
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    opts: PlateOpts,
  ): DayItemForOpt[] {
    const withPcts = meals.map((m) => ({ ...m, portionPct: pcts[m.slot] ?? m.portionPct ?? 100 }));
    const dyn = perMealTargets(this.dayMealInputs(withPcts as never), tg.kcal);
    return withPcts.filter((m) => !m.skipped).map((m) => {
      const country = (m.recipe as { country: string }).country;
      const isPlate = (m.slot === 'l' || m.slot === 'd') && /india/i.test(country);
      const mealTarget = isPlate ? dyn[m.slot as 'l' | 'd'] : undefined;
      const base = this.mealMacros(m.recipe as never, m.slot, dayIndex, opts, mealTarget);
      return { slot: m.slot, ...base, ...(isPlate ? { minPct: 100, maxPct: 100 } : {}) };
    });
  }

  /**
   * Iterated quantized solve: portions and plate budgets feed each other, so
   * solve to a fixed point (2–3 rounds converge — plates absorb the remainder,
   * a negative feedback). Returns the FINAL items so validation and totals are
   * computed on exactly what will be stored and displayed.
   */
  private solveDayQ(
    meals: Array<{ slot: string; skipped: boolean; portionPct?: number | null; recipe: unknown }>,
    dayIndex: number,
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    opts: PlateOpts,
  ): { pcts: Record<string, number>; sol: ReturnType<typeof solveDayPortions>; items: DayItemForOpt[] } {
    let pcts: Record<string, number> = {};
    for (const m of meals) if (!m.skipped) pcts[m.slot] = 100;
    let items = this.buildDayItems(meals, pcts, dayIndex, tg, opts);
    let sol = solveDayPortions(items, tg, NutritionService.QSOLVE);
    for (let round = 0; round < 2; round++) {
      const next = { ...pcts, ...sol.pcts };
      const changed = Object.keys(next).some((k) => next[k] !== pcts[k]);
      pcts = next;
      items = this.buildDayItems(meals, pcts, dayIndex, tg, opts);
      sol = solveDayPortions(items, tg, NutritionService.QSOLVE);
      if (!changed) break;
    }
    return { pcts: { ...pcts, ...sol.pcts }, sol, items };
  }

  /**
   * Close the remaining gap to the prescription with realistic complement
   * foods (whole units — egg, curd, fruit, nuts, roti…), then run the HARD
   * validation gate on totals INCLUDING the add-ons.
   */
  private planDayAddons(
    items: DayItemForOpt[],
    pcts: Record<string, number>,
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    diet: string,
    plans: string[],
  ): { addons: Record<string, AddonPick[]>; extra: ReturnType<typeof addonMacros>; violation: ReturnType<typeof bandViolationPct> } {
    const t = dayTotalsFor(items, pcts);
    const kAllow = Math.max(tg.kcal * 0.02, 60);
    const pAllow = Math.max(tg.protein * 0.02, 5);
    const gapKcal = tg.kcal - t.kcal;
    let addons: Record<string, AddonPick[]> = {};
    // Dietitian rule: swaps fix composition; an accompaniment is only added for
    // a genuinely meaningful remaining gap, max one per meal / two per day.
    if (gapKcal > Math.max(kAllow, 120)) {
      addons = fillGapWithComplements({
        gapKcal,
        gapProtein: (tg.protein - pAllow) - t.protein,
        proteinCeiling: tg.protein + pAllow - t.protein,
        diet,
        plans,
        slots: items.map((i) => i.slot),
      });
    }
    const extra = addonMacros(Object.values(addons).flat());
    const violation = bandViolationPct(items, pcts, tg, extra);
    return { addons, extra, violation };
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
    const userId = day.plan.userId;
    const tg = await this.targets(userId);
    const opts = await this.plateOptsFor(userId);
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const active = day.meals.filter((m) => !m.skipped);
    if (!active.length) return;
    // Same machinery as generation: quantized solve on the SHARED measurement,
    // then complement fill — after a skip/refresh the remaining meals and
    // add-ons re-close the day to the prescription. Weekly budgeting: this
    // day's working target absorbs the deviation of the days BEFORE it.
    const tgDay = await this.weekAwareTarget(planKey, dayIndex, tg, opts, isProteinRestricted(ex));
    const { pcts, items } = this.solveDayQ(day.meals as never, dayIndex, tgDay, opts);
    const plans = assignDietPlans({
      conditions: ex.healthConditions ?? [], flags: flagsFor(await this.bloodValues(userId)) as Record<string, string>,
      goal: pref?.goal ?? 'maintain', diet: (pref?.diet ?? 'everything') as Diet, age: pref?.age ?? 30,
    });
    const { addons } = this.planDayAddons(items, pcts, tgDay, (pref?.diet ?? 'everything') as string, plans);
    await Promise.all(active.map((m) =>
      this.prisma.meal.update({
        where: { id: m.id },
        data: { portionPct: pcts[m.slot] ?? 100, addonsJson: JSON.stringify(addons[m.slot] ?? []) } as never,
      }).catch(() => undefined),
    ));
  }

  /**
   * Full in-place day repair (spec: the user gets the most optimal diet — the
   * app never asks them to fix it). Re-runs the same swap + portion machinery
   * the generator uses against the SAVED day: if the day's totals violate the
   * tolerance bands, dishes are replaced with better-fitting ones from the
   * user's hard-filtered pools and portions re-solved, then persisted. Also
   * heals plans generated by older engine versions the moment they're viewed.
   * Returns whether the day now sits fully inside its bands.
   */
  async repairDay(userId: string, planKey: string, dayIndex: number) {
    await this.assertOwnsPlan(planKey, userId);
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) throw new NotFoundException('plan day not found');
    const tg = await this.targets(userId);
    const opts = await this.plateOptsFor(userId);
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const dayVeg = ex.weekly?.[SHORT_DAYS[dayIndex]] === 'veg';
    const diet = dayVeg ? 'veg' : ((pref?.diet ?? 'everything') as Diet);
    const active = day.meals.filter((m) => !m.skipped);
    if (!active.length) return { repaired: false, valid: true };

    const picks = new Map<string, RecipeWithIng>();
    const mealIdBySlot = new Map<string, string>();
    const skippedSlots = new Set<string>();
    for (const m of day.meals) mealIdBySlot.set(m.slot, m.id);
    for (const m of active) picks.set(m.slot, m.recipe as unknown as RecipeWithIng);
    const isPlate = (r: RecipeWithIng, sl: string) => /india/i.test(r.country) && (sl === 'l' || sl === 'd');
    const plans = assignDietPlans({
      conditions: ex.healthConditions ?? [], flags: flagsFor(await this.bloodValues(userId)) as Record<string, string>,
      goal: pref?.goal ?? 'maintain', diet, age: pref?.age ?? 30,
    });
    const tgDay = await this.weekAwareTarget(planKey, dayIndex, tg, opts, isProteinRestricted(ex));
    const mealsLike = () => [...picks.entries()]
      .filter(([sl]) => !skippedSlots.has(sl))
      .map(([sl, r]) => ({ slot: sl, skipped: false, recipe: r as unknown }));
    const evalNow = () => {
      const solved = this.solveDayQ(mealsLike(), dayIndex, tgDay, opts);
      const planned = this.planDayAddons(solved.items, solved.pcts, tgDay, diet as string, plans);
      const addonItems = Object.values(planned.addons).reduce((n, a) => n + a.length, 0);
      return { ...solved, ...planned, score: planned.violation.total + addonItems * 0.35 };
    };

    let ev = evalNow();
    let changedRecipes = false;
    if (ev.score > 0) {
      const recipes = (await this.prisma.recipe.findMany({ include: { ingredients: { select: { name: true, priceInr: true } } } })) as unknown as RecipeWithIng[];
      const modes = planningModes(flagsFor(await this.bloodValues(userId)), pref?.goal ?? 'maintain');
      const pools = this.rankedPools(recipes, diet, ex, modes);
      const tD = {
        protein: tg.protein / Math.max(1, tg.kcal), carb: tg.carb / Math.max(1, tg.kcal),
        fat: tg.fat / Math.max(1, tg.kcal), fiber: tg.fiber / Math.max(1, tg.kcal),
      };
      const fit = (r: RecipeWithIng, sl: string): number => {
        const mealKcal = tg.perMeal[sl as 'b' | 'l' | 's' | 'd']?.kcal ?? tg.kcal / 4;
        const n = this.mealMacros(r as never, sl, dayIndex, opts, mealKcal);
        const k = Math.max(1, n.kcal);
        return 3.0 * Math.abs(n.protein / k - tD.protein) / Math.max(0.005, tD.protein)
          + 1.0 * Math.abs(n.carbs / k - tD.carb) / Math.max(0.01, tD.carb)
          + 1.0 * Math.abs(n.fat / k - tD.fat) / Math.max(0.01, tD.fat)
          + 1.2 * Math.abs(n.kcal - mealKcal) / Math.max(1, mealKcal)
          + dietPlanBias(plans, r, { protein: n.protein / k, fiber: n.fiber / k });
      };
      const inUse = () => new Set([...picks.values()].map((r) => r.id));
      // Stage 1+2: portions are inside evalNow; swap recipes until the gate passes.
      for (let sweep = 0; sweep < 2 && ev.score > 0; sweep++) {
        for (const sl of [...picks.keys()]) {
          if (ev.score <= 0) break;
          if (skippedSlots.has(sl)) continue;
          const original = picks.get(sl) as RecipeWithIng;
          if (isPlate(original, sl)) continue;
          const used = inUse();
          const alternates = (pools[sl as Slot] ?? [])
            .filter((r) => !used.has(r.id))
            .slice(0, 300)
            .map((r) => ({ r, s: fit(r, sl) }))
            .sort((a, b) => a.s - b.s)
            .slice(0, sweep === 0 ? 40 : 100)
            .map((x) => x.r);
          for (const alt of alternates) {
            picks.set(sl, alt);
            const tryEv = evalNow();
            if (tryEv.score < ev.score - 0.1) { ev = tryEv; changedRecipes = true; }
            else picks.set(sl, original);
            if (ev.score <= 0) break;
          }
        }
      }
      // Stage 3 (removal ladder): if the day is still over its targets with
      // every dish at minimum portion, drop the snack, then breakfast — the
      // objective is the most accurate day, not keeping every planned meal.
      for (const dropSlot of ['s', 'b']) {
        if (ev.score <= 0) break;
        if (!picks.has(dropSlot) || skippedSlots.has(dropSlot)) continue;
        skippedSlots.add(dropSlot);
        const tryEv = evalNow();
        if (tryEv.score < ev.score - 0.1) { ev = tryEv; changedRecipes = true; }
        else skippedSlots.delete(dropSlot);
      }
      if (ev.score > 0) ev = evalNow();
    }

    // Persist the repaired day: swaps, portions, add-ons, and any dropped meals.
    await Promise.all([...picks.entries()].map(([sl, r]) => {
      const id = mealIdBySlot.get(sl);
      if (!id) return Promise.resolve(undefined);
      const dropped = skippedSlots.has(sl);
      return this.prisma.meal.update({
        where: { id },
        data: {
          recipeId: r.id,
          skipped: dropped,
          portionPct: dropped ? 100 : (ev.pcts[sl] ?? 100),
          addonsJson: JSON.stringify(dropped ? [] : (ev.addons[sl] ?? [])),
        } as never,
      }).catch(() => undefined);
    }));
    const valid = ev.score <= 0;
    let limiting: { nutrient: string; side: string; achieved: number; target: number } | null = null;
    if (!valid) {
      const totals = dayTotalsFor(ev.items, ev.pcts);
      const ex2 = ev.extra;
      const key = ev.violation.worstNutrient as 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
      const achievedMap = {
        kcal: totals.kcal + ex2.kcal, protein: totals.protein + ex2.protein,
        carbs: totals.carbs + ex2.carbs, fat: totals.fat + ex2.fat, fiber: totals.fiber + ex2.fiber,
      };
      const targetMap = { kcal: tg.kcal, protein: tg.protein, carbs: tg.carb, fat: tg.fat, fiber: tg.fiber };
      limiting = {
        nutrient: ev.violation.worstNutrient, side: ev.violation.worstSide,
        achieved: Math.round(achievedMap[key] ?? 0), target: Math.round(targetMap[key] ?? 0),
      };
    }
    return {
      repaired: changedRecipes || true,
      valid,
      violation: ev.violation.total,
      // Only meaningful when the EXHAUSTIVE search failed: the single
      // constraint the recipe library cannot satisfy, with the closest
      // achievable value so the user sees exactly why.
      limiting,
    };
  }

  // ── plate-component → library-recipe matching (clickable thali items) ──
  private recipeNameIndex: Array<{ id: string; name: string }> | null = null;
  private async nameIndex(): Promise<Array<{ id: string; name: string }>> {
    if (!this.recipeNameIndex) {
      const rows = await this.prisma.recipe.findMany({ select: { id: true, name: true } }).catch(() => []);
      this.recipeNameIndex = rows.map((r) => ({ id: r.id, name: r.name.toLowerCase() }));
    }
    return this.recipeNameIndex;
  }
  /** Best-effort library match for a plate component name ("Masoor Dal" → the
   *  Masoor Dal recipe) so every thali item can open a real recipe page. */
  private matchComponentRecipe(index: Array<{ id: string; name: string }>, compName: string): string | undefined {
    const q = compName.toLowerCase().replace(/\(.*?\)/g, '').replace(/plain |mixed |seasonal |sprouts? & /g, '').trim();
    if (q.length < 3) return undefined;
    const exact = index.find((r) => r.name === q);
    if (exact) return exact.id;
    const contains = index.find((r) => r.name.includes(q));
    if (contains) return contains.id;
    // last word match ("Cauliflower Sabzi" → any sabzi/curry with cauliflower)
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    if (words.length >= 2) {
      const hit = index.find((r) => words.every((w) => r.name.includes(w)));
      if (hit) return hit.id;
    }
    return undefined;
  }

  /** Ownership guard — a meal plan may only be read/mutated by the user it belongs to. */
  private async assertOwnsPlan(planKey: string, userId: string): Promise<void> {
    const plan = await this.prisma.mealPlan.findUnique({ where: { key: planKey }, select: { userId: true } });
    if (!plan) throw new NotFoundException('plan not found');
    if (plan.userId !== userId) throw new ForbiddenException('That meal plan is not yours.');
  }

  /**
   * Remaining-budget day target: each day aims at (weekly remaining ÷ days
   * left), with directional safety factors that make the weekly HARD rules
   * arithmetically enforceable — protein aims 1.5% under its share (so day
   * overshoot tolerance can never push the week past 100%), calories aim
   * 0.5% under, fibre 2% over. Clamped to sane daily ranges; renal protein
   * NEVER exceeds the prescribed daily cap.
   */
  private weekBudgetTarget(
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    consumed: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
    dayIdx: number,
    proteinCapped: boolean,
  ) {
    const remain = Math.max(1, 7 - dayIdx);
    const budget = (dailyT: number, cons: number) => (dailyT * 7 - cons) / remain;
    const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));
    const proteinHi = proteinCapped ? tg.protein : tg.protein * 1.06;
    return {
      ...tg,
      kcal: clamp(budget(tg.kcal, consumed.kcal) * 0.995, tg.kcal * 0.9, tg.kcal * 1.06),
      protein: clamp(budget(tg.protein, consumed.protein) * 0.985, tg.protein * 0.8, proteinHi),
      carb: clamp(budget(tg.carb, consumed.carb) * 1.0, tg.carb * 0.85, tg.carb * 1.15),
      fat: clamp(budget(tg.fat, consumed.fat) * 0.99, tg.fat * 0.85, tg.fat * 1.1),
      fiber: clamp(budget(tg.fiber, consumed.fiber) * 1.02, tg.fiber * 0.9, tg.fiber * 1.18),
    };
  }

  /** Working target for one day of a SAVED plan, absorbing prior days' deviation. */
  private async weekAwareTarget(
    planKey: string,
    dayIndex: number,
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    opts: PlateOpts,
    proteinCapped: boolean,
  ) {
    if (dayIndex <= 0) return tg;
    const prior = await this.prisma.mealPlanDay.findMany({
      where: { plan: { key: planKey }, dayIndex: { lt: dayIndex } },
      include: { meals: { include: { recipe: { include: { ingredients: true } } } } },
    }).catch(() => []);
    const consumed = { kcal: 0, protein: 0, carb: 0, fat: 0, fiber: 0 };
    for (const d of prior) {
      const t = this.dayTotalsCore(d.meals as never, d.dayIndex, tg, opts);
      consumed.kcal += t.kcal; consumed.protein += t.protein;
      consumed.carb += t.carbs; consumed.fat += t.fat; consumed.fiber += t.fiber;
    }
    return this.weekBudgetTarget(tg, consumed, dayIndex, proteinCapped);
  }

  /**
   * Weekly budgeting: nudge a day's working target by the week's accumulated
   * deviation (Monday ran 150 kcal over → Tuesday aims slightly lower). Bounded
   * to safe daily ranges, and protein NEVER rises above the prescribed daily
   * cap for protein-restricted (renal) users — disease limits stay daily.
   */
  private carryAdjustedTarget(
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    carry: { kcal: number; protein: number; carb: number; fat: number; fiber: number },
    proteinCapped: boolean,
  ) {
    const c = (base: number, dev: number, loPct: number, hiPct: number) =>
      Math.round(Math.min(base * hiPct, Math.max(base * loPct, base + dev * 0.5)));
    const protein = proteinCapped
      ? Math.min(tg.protein, c(tg.protein, carry.protein, 0.88, 1.0))
      : c(tg.protein, carry.protein, 0.88, 1.1);
    return { ...tg, kcal: c(tg.kcal, carry.kcal, 0.92, 1.08), protein, carb: c(tg.carb, carry.carb, 0.85, 1.15), fat: c(tg.fat, carry.fat, 0.85, 1.12), fiber: c(tg.fiber, carry.fiber, 0.9, 1.15) };
  }

  /** Shared per-day totals (dishes + add-ons) — the same numbers the cards show. */
  private dayTotalsCore(
    meals: Array<{ slot: string; skipped: boolean; portionPct?: number | null; recipe: unknown; addonsJson?: string | null }>,
    dayIndex: number,
    tg: Awaited<ReturnType<NutritionService['targets']>>,
    opts: PlateOpts,
  ) {
    const dyn = perMealTargets(this.dayMealInputs(meals as never), tg.kcal);
    let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0;
    for (const m of meals) {
      if (m.skipped) continue;
      const mealTarget = dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal;
      const n = this.mealMacros(m.recipe as never, m.slot, dayIndex, opts, mealTarget);
      const pf = ((m.portionPct ?? 100) as number) / 100;  // portioned = what's eaten
      kcal += n.kcal * pf; protein += n.protein * pf; carbs += n.carbs * pf; fat += n.fat * pf; fiber += n.fiber * pf;
    }
    const addonPicks: AddonPick[] = meals.filter((m) => !m.skipped).flatMap((m) => {
      try { return JSON.parse((m.addonsJson) ?? '[]') as AddonPick[]; } catch { return []; }
    });
    const a = addonMacros(addonPicks);
    return {
      kcal: Math.round(kcal + a.kcal), protein: Math.round(protein + a.protein),
      carbs: Math.round(carbs + a.carbs), fat: Math.round(fat + a.fat), fiber: Math.round(fiber + a.fiber),
    };
  }

  /**
   * Weekly Nutrition Progress (spec §weekly budgeting): per-day totals,
   * cumulative intake vs cumulative target for every day, and the Sunday
   * weekly score + compliance. A dietitian judges the WEEK; daily medical
   * caps still gate each individual day elsewhere.
   */
  async weekSummary(userId: string, planKey: string) {
    await this.assertOwnsPlan(planKey, userId);
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key: planKey },
      include: { days: { orderBy: { dayIndex: 'asc' }, include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
    });
    if (!plan) throw new NotFoundException('plan not found');
    const tg = await this.targets(userId);
    const opts = await this.plateOptsFor(userId);
    const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const;
    const targetOf = { kcal: tg.kcal, protein: tg.protein, carbs: tg.carb, fat: tg.fat, fiber: tg.fiber };

    const mon = weekMonday((plan as { weekStart?: Date | null }).weekStart ?? plan.createdAt);
    const perDay = plan.days.map((d) => ({
      dayIndex: d.dayIndex, day: d.dayName,
      dateShort: (() => { const dt = addDays(mon, d.dayIndex); return `${d.dayName.slice(0, 3)}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}`; })(),
      ...this.dayTotalsCore(d.meals as never, d.dayIndex, tg, opts),
    }));
    const weeklyTargetOf = Object.fromEntries(KEYS.map((k) => [k, Math.round(targetOf[k] * 7)])) as Record<typeof KEYS[number], number>;
    const cum = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
    const days = perDay.map((p, i) => {
      for (const k of KEYS) cum[k] += p[k];
      return {
        ...p,
        cumulative: { ...cum },
        cumulativeTarget: Object.fromEntries(KEYS.map((k) => [k, Math.round(targetOf[k] * (i + 1))])),
        // Remaining weekly allowance after this day — the budget still to eat.
        remaining: Object.fromEntries(KEYS.map((k) => [k, Math.max(0, weeklyTargetOf[k] - cum[k])])),
      };
    });
    const weeklyTarget = weeklyTargetOf;
    // Weekly score straight from the HARD weekly bands (protein ≤100%,
    // carbs ≥95%, kcal 98–100%…). 100 = every rule satisfied.
    const gate = weekBandViolation({ ...cum }, tg);
    let complianceSum = 0;
    for (const k of KEYS) {
      const T = weeklyTarget[k]; if (!T) continue;
      complianceSum += Math.min(100, Math.max(0, 100 - (Math.abs(cum[k] - T) / T) * 100));
    }
    const weeklyScore = Math.max(0, Math.min(100, Math.round(100 - gate.total)));
    const compliancePct = Math.round(complianceSum / KEYS.length);
    return {
      key: planKey, days, weeklyTarget, weeklyIntake: { ...cum }, weeklyScore, compliancePct,
      dailyTarget: targetOf,
      weekStartLabel: `${DAYS[0].slice(0, 3)}, ${mon.getDate()} ${MONTHS[mon.getMonth()]} ${mon.getFullYear()}`,
    };
  }

  async daySummary(userId: string, planKey: string, dayIndex: number) {
    const day = await this.prisma.mealPlanDay.findFirst({
      where: { dayIndex, plan: { key: planKey } },
      include: { plan: { select: { userId: true } }, meals: { include: { recipe: { include: { ingredients: true } } } } },
    });
    if (!day) throw new NotFoundException('plan day not found');
    const planOwner = day.plan.userId;
    // A household MEMBER may total the SHARED family plan (read-only). Their
    // numbers are personalised by the same factor the scaled meal cards use, so
    // the information bar matches the plates. Anyone else is refused.
    let factor = 1;
    if (planOwner !== userId) {
      const ctx = await this.familyContext(userId).catch(() => null);
      const allowed = ctx?.role === 'member' && ctx.ownerId === planOwner && ctx.familyMealPlanning;
      if (!allowed) throw new ForbiddenException('That meal plan is not yours.');
      const [mine, theirs] = await Promise.all([this.targets(userId), this.targets(planOwner)]);
      factor = Math.min(1.9, Math.max(0.4, (mine.kcal || 1) / (theirs.kcal || 1)));
    }
    const reqTg = planOwner === userId ? null : await this.targets(userId);
    const opts = await this.plateOptsFor(planOwner);
    const tg = await this.targets(planOwner);
    // Dynamic budgets: skipped meals redistribute to the remaining plates.
    const dyn = perMealTargets(this.dayMealInputs(day.meals), tg.kcal);

    let kcal = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, cost = 0;
    for (const m of day.meals) {
      if (m.skipped) continue;
      // Aggregate the SAME plate/dish the card shows — the single source of truth.
      const mealTarget = dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal;
      const n = this.mealMacros(m.recipe as unknown as RecipeWithIng & { kcal: number; protein: number; carbs: number; fat: number; fiber: number; gramsPerServing: number }, m.slot, dayIndex, opts, mealTarget);
      const pf = (((m as { portionPct?: number }).portionPct ?? 100) / 100) * factor;  // portioned = what the (scaled) card shows
      kcal += n.kcal * pf; protein += n.protein * pf; carbs += n.carbs * pf; fat += n.fat * pf; fiber += n.fiber * pf;
      const s = recipeServings(m.recipe);
      const ing = m.recipe.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
      cost += (ing > 0 ? Math.round(ing / s) : Math.round((m.recipe.kcal / s) * 0.11)) * factor;
    }
    // Complement add-ons are part of the day's nutrition — same source the
    // cards display.
    const addonPicks: AddonPick[] = day.meals.filter((m) => !m.skipped).flatMap((m) => {
      try { return JSON.parse(((m as { addonsJson?: string | null }).addonsJson) ?? '[]') as AddonPick[]; } catch { return []; }
    });
    const addonTotals = addonMacros(addonPicks);
    kcal += addonTotals.kcal * factor; protein += addonTotals.protein * factor; carbs += addonTotals.carbs * factor;
    fat += addonTotals.fat * factor; fiber += addonTotals.fiber * factor;

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
      portionFactor: (((m as { portionPct?: number }).portionPct ?? 100) / 100) * factor,
    }));
    // Add-ons contribute micros too (their keywords feed the same estimator).
    if (addonPicks.length) {
      microMeals.push({
        recipeName: 'Add-ons',
        ingredients: addonPicks.map((p) => ({ name: complementByKey.get(p.key)?.microKeyword ?? p.key })),
        servings: 1,
        portionFactor: factor,
      });
    }
    const micros = estimateDayMicros(microMeals, pref?.age ?? 30, pref?.sex ?? 'male')
      .map((mi) => ({
        ...mi,
        markerStatus: mi.marker ? (flags[mi.marker] as string | undefined) ?? null : null,
      }));
    // fibre rides with the macros but belongs in the micro dashboard too
    const fiberTarget = (reqTg ?? tg).fiber || 36;
    micros.push({
      key: 'fiber', label: 'Fibre', unit: 'g', intake: fiber, target: fiberTarget,
      pct: Math.round((fiber / fiberTarget) * 100), marker: undefined,
      foods: ['Whole grains & millets', 'Dals & legumes', 'Vegetables with skins', 'Fruit (guava, apple)', 'Seeds'],
      topSources: [], markerStatus: null,
    });

    // Legacy coverage map (old clients) — now driven by the real estimates.
    const coverage = Object.fromEntries(micros.map((mi) => [mi.key, Math.max(0, Math.min(200, mi.pct))]));
    coverage.protein = Math.round((protein / Math.max(1, (reqTg ?? tg).protein)) * 100);

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
    if (!r) {
      // Curated component recipe (dal/curd/salad/snack) — not a dataset row, so it
      // has no DB record. Resolve it from the seed pool so it opens a real recipe
      // page (with its ingredients, steps and macros) instead of a dead modal (L1).
      const seed = SEED_POOL.find((s) => s.id === id);
      if (seed) return this.curatedRecipe(seed);
      throw new NotFoundException('recipe not found');
    }
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
    const perPlateIngredients = r.ingredients.map((i) => isSalt(i.name)
      ? { name: 'Salt', grams: 0, priceInr: 0, toTaste: true }               // salt is always "to taste"
      : {
        name: i.name,
        grams: round1(Math.max(0, i.grams || 0) * factor),
        priceInr: Math.round(Math.max(0, i.priceInr || 0) * factor),
      });

    // Computed micronutrient/clinical panel for ONE plate (same engine the meal
    // planner uses) — sodium/sugar/sat-fat + iron/calcium/vit D/C. Honest: values
    // are 0 where an ingredient doesn't resolve; `complete` flags coverage.
    const nutSrc = perPlateIngredients.map((i) => ({ name: i.name, grams: i.grams }));
    const nut = computeNutrients(nutSrc);
    const mic = computeMicros(nutSrc);

    return {
      ...shape,
      // Per-ONE-plate ingredient quantities (the UI multiplies by the chosen serving count).
      ingredients: perPlateIngredients,
      plateWeight,               // grams on a single plate (== gramsPerServing)
      totalRecipeWeight,         // full-batch weight the scaling was derived from
      nutrients: { sodiumMg: nut.na, potassiumMg: nut.k, phosphorusMg: nut.p, sugarG: nut.sug, addedSugarG: nut.addedSug, satFatG: nut.sfat, complete: nut.complete },
      micros: mic,               // ironMg, calciumMg, vitDUg, vitCMg
      method: cookSteps.map((s) => s.text), // back-compat plain list
      cookSteps,                            // structured: text + timer + attention
      sides,
      whyForYou,
    };
  }

  /** Build a recipe-detail payload for a curated component recipe (seed pool). It
   *  carries real ingredients, steps and macros; it has no dataset photo, so the
   *  UI renders its gradient tile (photos need the image dataset). */
  /** The seasonings/aromatics a curated component's method actually uses but that
   *  aren't in its macro-bearing ingredient tuple — added to the DISPLAY list (as
   *  "to taste") so the ingredient list is complete and matches the steps. Skips
   *  anything already present. Display-only: nutrition stays from the seed. */
  private curatedSeasonings(role: string, names: string[]): Array<{ name: string; grams: number; priceInr: number; toTaste?: boolean }> {
    const have = (k: string) => names.some((n) => n.includes(k));
    // [display label, dedupe keys, grams] — realistic per-serving amounts. Only
    // salt stays "to taste" (grams 0); every other spice carries a measurement.
    const add: Array<[string, string[], number]> = [];
    const push = (label: string, keys: string[], grams: number) => { if (!keys.some((k) => have(k))) add.push([label, keys, grams]); };
    switch (role) {
      case 'dal':
        push('Turmeric', ['turmeric'], 1); push('Cumin seeds', ['cumin'], 2); push('Red chilli powder', ['chilli', 'chili'], 1);
        push('Ginger-garlic', ['ginger', 'garlic'], 6); push('Fresh coriander', ['coriander'], 5); push('Salt', ['salt'], 0); break;
      case 'main':
        push('Turmeric', ['turmeric'], 1); push('Red chilli powder', ['chilli', 'chili'], 2); push('Coriander powder', ['coriander'], 2);
        push('Garam masala', ['garam'], 1); push('Ginger-garlic', ['ginger', 'garlic'], 8); push('Fresh coriander', ['coriander'], 5); push('Salt', ['salt'], 0); break;
      case 'vegetable':
        push('Mustard seeds', ['mustard'], 1); push('Cumin seeds', ['cumin'], 2); push('Turmeric', ['turmeric'], 1);
        push('Curry leaves', ['curry leaf', 'curry leaves'], 1); push('Fresh coriander', ['coriander'], 4); push('Salt', ['salt'], 0); break;
      case 'carb':
        if (have('flour')) push('Ghee', ['ghee'], 5); push('Salt', ['salt'], 0); break;
      case 'salad':
        push('Lemon juice', ['lemon', 'lime'], 5); push('Roasted cumin', ['cumin'], 1); push('Black pepper', ['pepper'], 1); push('Salt', ['salt'], 0); break;
      case 'dairy':
        push('Roasted cumin', ['cumin'], 1); push('Salt', ['salt'], 0); break;
      case 'soup':
        push('Black pepper', ['pepper'], 1); push('Salt', ['salt'], 0); break;
      case 'breakfast':
        push('Salt', ['salt'], 0); break;
      default:
        push('Salt', ['salt'], 0); break;
    }
    return add.map(([label, , grams]) => grams > 0
      ? { name: label, grams, priceInr: 0 }
      : { name: label, grams: 0, priceInr: 0, toTaste: true });
  }

  private curatedRecipe(seed: PoolRecipe) {
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const seedNames = seed.ingredients.map((i) => i.name.toLowerCase());
    const ingredients = [
      ...seed.ingredients.map((i) => isSalt(i.name)
        ? { name: 'Salt', grams: 0, priceInr: 0, toTaste: true }
        : { name: i.name, grams: round1(i.grams), priceInr: 0 }),
      ...this.curatedSeasonings(seed.role, seedNames),   // complete the list with the method's seasonings
    ];
    const cookSteps = (seed.steps ?? []).map((text) => ({ text }));
    return {
      id: seed.id, recipeNo: null,
      name: seed.name, country: seed.cuisine,
      kcal: seed.kcal, protein: round1(seed.protein), carbs: round1(seed.carbs),
      fat: round1(seed.fat), fiber: round1(seed.fiber), minutes: seed.minutes,
      gramsPerServing: Math.max(1, seed.grams), diet: seed.diet,
      servings: 1, healthGrade: null, healthPercent: 0, imageUrl: null,
      curated: true,
      ingredients,
      plateWeight: Math.max(1, seed.grams),
      totalRecipeWeight: seed.ingredients.reduce((t, i) => t + Math.max(0, i.grams || 0), 0),
      nutrients: { sodiumMg: seed.nutrients.sodiumMg, potassiumMg: seed.nutrients.potassiumMg, phosphorusMg: seed.nutrients.phosphorusMg, sugarG: seed.nutrients.sugarG, addedSugarG: seed.nutrients.addedSugarG, satFatG: seed.nutrients.satFatG, complete: seed.nutrientComplete },
      micros: computeMicros(seed.ingredients.map((i) => ({ name: i.name, grams: i.grams }))),
      method: cookSteps.map((s) => s.text),
      cookSteps,
    };
  }

  /* ─────────────────── Saved recipes (server-side favourites) ─────────────────── */

  /** Map a composer diet to the frontend DietKey used for card colours. */
  private dietKey(d: string): string {
    return d === 'vegan' ? 'vegan' : d === 'eggetarian' ? 'egg' : d === 'vegetarian' ? 'veg' : 'nonveg';
  }
  /** Lightweight recipe card from a pool/seed recipe (for saved + variant lists). */
  private poolCard(r: PoolRecipe) {
    return {
      id: r.id, recipeNo: null as number | null, name: r.name, country: r.cuisine,
      kcal: Math.round(r.kcal), protein: Math.round(r.protein), carbs: Math.round(r.carbs), fat: Math.round(r.fat), fiber: Math.round(r.fiber),
      minutes: r.minutes, gramsPerServing: r.grams, diet: this.dietKey(r.diet), imageUrl: r.imageUrl ?? null, healthPercent: 0,
    };
  }

  async savedRecipeIds(userId: string): Promise<string[]> {
    const pref = await this.prisma.foodPref.findUnique({ where: { userId } });
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    return ex.savedRecipes ?? [];
  }

  async setSavedRecipe(userId: string, recipeId: string, saved: boolean): Promise<{ saved: boolean; ids: string[] }> {
    const ids = new Set(await this.savedRecipeIds(userId));
    if (saved) ids.add(recipeId); else ids.delete(recipeId);
    const next = [...ids].slice(-500);                 // sane upper bound
    await this.mergeExtras(userId, { savedRecipes: next });
    return { saved: ids.has(recipeId), ids: next };
  }

  /** The user's saved recipes, resolved to cards (dataset + curated). */
  async savedRecipes(userId: string) {
    const ids = await this.savedRecipeIds(userId);
    if (!ids.length) return { ids: [], recipes: [] as ReturnType<NutritionService['poolCard']>[] };
    const pool = await this.datasetPoolReady();
    const byId = new Map<string, PoolRecipe>([...SEED_POOL, ...pool].map((r) => [r.id, r]));
    const recipes = ids.map((id) => byId.get(id)).filter((r): r is PoolRecipe => Boolean(r)).map((r) => this.poolCard(r));
    return { ids, recipes };
  }

  /* ─────────────────── AI-style recipe variants (real dataset swaps) ─────────────────── */

  private static readonly VARIANT_META: Record<string, { label: string; note: string }> = {
    higher_protein: { label: 'Higher protein', note: 'Similar dishes with noticeably more protein.' },
    reduce_calories: { label: 'Fewer calories', note: 'Lighter versions of this kind of dish.' },
    reduce_carbs: { label: 'Lower carb', note: 'Comparable dishes with fewer carbohydrates.' },
    kidney: { label: 'Kidney-friendly', note: 'Low potassium, phosphorus and sodium.' },
    liver: { label: 'Liver-friendly', note: 'Low in saturated fat and added sugar.' },
    vegetarian: { label: 'Vegetarian', note: 'The same kind of dish, made vegetarian.' },
    vegan: { label: 'Vegan', note: 'Fully plant-based versions.' },
    jain: { label: 'Jain', note: 'No onion, garlic or root vegetables.' },
    gluten_free: { label: 'Gluten-free', note: 'Without wheat, maida or other gluten sources.' },
    budget: { label: 'Budget', note: 'Simpler dishes with fewer ingredients.' },
    premium: { label: 'Premium', note: 'Richer dishes, more protein and ingredients.' },
    similar: { label: 'Similar recipes', note: 'Closest dishes to this one.' },
  };

  /**
   * "AI variants" — one-tap alternatives (Higher protein, Vegan, Kidney-friendly…).
   * Rather than fabricate a modified recipe with made-up nutrition, we return the
   * closest REAL dataset recipes that satisfy the constraint, ranked by similarity
   * to the current dish. Nutrition is therefore always accurate (real recipes).
   */
  async recipeVariants(id: string, type: string) {
    const meta = NutritionService.VARIANT_META[type] ?? NutritionService.VARIANT_META.similar;
    const pool = await this.datasetPoolReady();
    const all = [...SEED_POOL, ...pool];
    const cur = all.find((r) => r.id === id);
    if (!cur) throw new NotFoundException('recipe not found');

    const ladder: Record<string, string[]> = {
      vegan: ['vegan'], vegetarian: ['vegan', 'vegetarian'],
      eggetarian: ['vegan', 'vegetarian', 'eggetarian'], nonveg: ['vegan', 'vegetarian', 'eggetarian', 'nonveg'],
    };
    const inDiet = ladder[cur.diet] ?? ladder.nonveg;
    const glutenRe = /wheat|maida|\bflour\b|bread|\broti\b|phulka|paratha|naan|pasta|noodle|semolina|rava|barley|seitan|bulgur|couscous|macaroni|spaghetti/i;
    const jainRe = /onion|garlic|potato|carrot|radish|beetroot|mushroom|ginger/i;
    const hay = (r: PoolRecipe) => `${r.name} ${r.ingredients.map((i) => i.name).join(' ')}`.toLowerCase();
    const sameKind = (r: PoolRecipe) => r.role === cur.role || r.categories.some((c) => cur.categories.includes(c));

    let cands = all.filter((r) => r.id !== cur.id && sameKind(r));
    const keepDiet = (r: PoolRecipe) => inDiet.includes(r.diet);
    switch (type) {
      case 'vegetarian': cands = cands.filter((r) => ['vegan', 'vegetarian'].includes(r.diet)); break;
      case 'vegan': cands = cands.filter((r) => r.diet === 'vegan'); break;
      case 'jain': cands = cands.filter((r) => ['vegan', 'vegetarian'].includes(r.diet) && !jainRe.test(hay(r))); break;
      case 'gluten_free': cands = cands.filter((r) => keepDiet(r) && !glutenRe.test(hay(r))); break;
      case 'higher_protein': cands = cands.filter((r) => keepDiet(r) && r.protein >= cur.protein * 1.12 + 2); break;
      case 'reduce_calories': cands = cands.filter((r) => keepDiet(r) && r.kcal <= cur.kcal * 0.85); break;
      case 'reduce_carbs': cands = cands.filter((r) => keepDiet(r) && r.carbs <= cur.carbs * 0.8); break;
      case 'kidney': cands = cands.filter((r) => keepDiet(r) && r.nutrientComplete && r.nutrients.potassiumMg <= 400 && r.nutrients.phosphorusMg <= 250 && r.nutrients.sodiumMg <= 500); break;
      case 'liver': cands = cands.filter((r) => keepDiet(r) && r.nutrients.satFatG <= 6 && r.nutrients.addedSugarG <= 8); break;
      case 'budget': cands = cands.filter((r) => keepDiet(r) && r.ingredients.length <= cur.ingredients.length); break;
      case 'premium': cands = cands.filter((r) => keepDiet(r) && r.protein >= cur.protein && r.ingredients.length >= cur.ingredients.length); break;
      default: cands = cands.filter((r) => keepDiet(r)); break;
    }

    const curCui = normCuisine(cur.cuisine);
    const closeness = (r: PoolRecipe) => -(Math.abs(r.kcal - cur.kcal) / 60) - (Math.abs(r.protein - cur.protein) / 6) + (normCuisine(r.cuisine) === curCui ? 3 : 0);
    const rankers: Record<string, (r: PoolRecipe) => number> = {
      higher_protein: (r) => r.protein, reduce_calories: (r) => -r.kcal, reduce_carbs: (r) => -r.carbs,
      kidney: (r) => -r.nutrients.potassiumMg, liver: (r) => -r.nutrients.satFatG,
      budget: (r) => -r.ingredients.length, premium: (r) => r.protein,
    };
    const rank = rankers[type] ?? closeness;
    cands.sort((a, b) => (rank(b) - rank(a)) || (closeness(b) - closeness(a)));

    return { type, label: meta.label, note: meta.note, items: cands.slice(0, 6).map((r) => this.poolCard(r)) };
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

    // Expand each term with its known aliases, BOTH directions, so "yogurt"
    // also finds curd/dahi and "cilantro" finds coriander. Previously search was
    // a raw substring test over an arbitrary 300-recipe slice of an ~11k
    // library, so most recipes were simply unreachable and synonyms never hit.
    const expand = (term: string): string[] => {
      const t = term.toLowerCase().trim();
      const out = new Set<string>([t]);
      const canon = canonicalIngredient(t).toLowerCase();
      if (canon) out.add(canon);
      for (const [alias, target] of Object.entries(INGREDIENT_SYNONYM)) {
        const tgt = target.toLowerCase();
        if (alias === t || tgt === t || tgt === canon) { out.add(alias); out.add(tgt); }
      }
      return [...out].filter(Boolean);
    };
    const expanded = clean.map((t) => ({ term: t, variants: expand(t) }));

    // Ask the DATABASE which recipes contain these ingredients (indexed), instead
    // of pulling a slice of the library into memory and scanning it.
    let rows: Array<RecipeWithIng & Record<string, unknown>>;
    if (expanded.length) {
      const hits = await this.prisma.recipeIngredient.findMany({
        where: { OR: expanded.flatMap((e) => e.variants.map((v) => ({ name: { contains: v, mode: 'insensitive' as const } }))) },
        select: { recipeId: true },
        take: 8000,
      }).catch(() => [] as Array<{ recipeId: string }>);
      const ids = [...new Set(hits.map((h) => h.recipeId))].slice(0, 1200);
      if (!ids.length) return [];
      rows = (await this.prisma.recipe.findMany({
        where: { id: { in: ids } },
        include: { ingredients: { select: { name: true } } },
      })) as unknown as Array<RecipeWithIng & Record<string, unknown>>;
    } else {
      rows = (await this.prisma.recipe.findMany({ include: { ingredients: { select: { name: true } } }, take: 300 })) as unknown as Array<RecipeWithIng & Record<string, unknown>>;
    }

    let pool = filterByPrefs(rows, effDiet, ex);
    if (!pool.length) pool = rows.filter((r) => dietAllows(effDiet, r.diet as Diet));

    const scored = pool.map((r) => {
      const names = r.ingredients.map((i) => i.name.toLowerCase());
      const canonNames = names.map((n) => canonicalIngredient(n).toLowerCase());
      // A term matches if ANY of its aliases appears in the raw or canonical
      // ingredient names.
      const matched = expanded.filter((e) =>
        e.variants.some((v) => names.some((n) => n.includes(v)) || canonNames.some((n) => n.includes(v))));
      const matches = matched.length;
      // What the cook would still need to buy — the useful second sort key.
      const missing = Math.max(0, expanded.length - matches);
      return { r, matches, missing };
    });
    const chosen = (expanded.length ? scored.filter((s) => s.matches > 0) : scored)
      .sort((a, b) => b.matches - a.matches || a.missing - b.missing || a.r.name.localeCompare(b.r.name))
      .slice(0, 60);
    return chosen.map(({ r, matches, missing }) => ({
      ...this.recipeShape(r as unknown as Parameters<NutritionService['recipeShape']>[0]),
      matches, missingCount: missing,
    }));
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
  /**
   * The meals to shop for: the NEXT `days` days of the citizen's composed plan,
   * starting from where they are in it today — because that's the plan the app
   * actually shows them. Each returned ingredient's grams are one person's
   * portion (the composer has already scaled components).
   *
   * If the composed plan is unavailable (no saved food profile, or generation
   * fails), we fall back to the stored weekly MealPlan so the basket still
   * builds rather than coming back empty.
   */
  private async composedMealsForShopping(
    userId: string,
    days: number,
    fromISO?: string,
    household = false,
  ): Promise<{
    dayCount: number;
    meals: Array<{ slot: string; recipeName: string; dayISO?: string; ingredients: Array<{ name: string; grams: number }> }>;
  }> {
    const empty = { dayCount: 0, meals: [] as Array<{ slot: string; recipeName: string; dayISO?: string; ingredients: Array<{ name: string; grams: number }> }> };
    try {
      const plan = (await this.composedPlan(userId, 'preferred', { household })) as unknown as {
        needsProfile?: boolean;
        planStartDate?: string;
        days?: Array<{ dayIndex: number; meals: Array<{ slot: string; title: string; components: Array<{ name: string; ingredients?: Array<{ name: string; grams: number; toTaste?: boolean; pantry?: boolean }> }> }> }>;
      };
      if (plan?.needsProfile || !plan?.days?.length) return await this.storedPlanMealsForShopping(userId, days);

      // Day 0 of the plan is planStartDate. Shop from the requested day —
      // which is always the LIVE date or later (today / tomorrow / a chosen
      // future day), never a day that has already passed.
      let offset = 0;
      const wanted = fromISO && /^\d{4}-\d{2}-\d{2}$/.test(fromISO) ? fromISO : todayISO();
      if (plan.planStartDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.planStartDate)) {
        const start = Date.parse(`${plan.planStartDate}T00:00:00Z`);
        const target = Date.parse(`${wanted}T00:00:00Z`);
        if (Number.isFinite(start) && Number.isFinite(target)) {
          offset = Math.max(0, Math.round((target - start) / 86_400_000));
        }
      }
      const slice = plan.days.filter((d) => d.dayIndex >= offset).slice(0, days);
      const use = slice.length ? slice : plan.days.slice(0, days);
      const startISO = plan.planStartDate && /^\d{4}-\d{2}-\d{2}$/.test(plan.planStartDate) ? plan.planStartDate : todayISO();
      const meals = use.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => ({
        slot: m.slot,
        recipeName: c.name || m.title,
        // Calendar date of this plan day — the key cooking uses to draw down.
        dayISO: addDaysISO(startISO, d.dayIndex),
        ingredients: (c.ingredients ?? [])
          .filter((i) => !i.toTaste && (i.grams ?? 0) > 0)
          .map((i) => ({ name: i.name, grams: i.grams })),
      }))));
      if (!meals.length) return await this.storedPlanMealsForShopping(userId, days);
      return { dayCount: use.length, meals };
    } catch {
      return await this.storedPlanMealsForShopping(userId, days).catch(() => empty);
    }
  }

  /** Fallback source: the stored weekly MealPlan (per-serving grams → one portion). */
  private async storedPlanMealsForShopping(userId: string, days: number) {
    const latest = await this.prisma.mealPlan.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (!latest) return { dayCount: 0, meals: [] };
    const plan = await this.prisma.mealPlan.findUnique({
      where: { key: latest.key },
      include: { days: { include: { meals: { include: { recipe: { include: { ingredients: true } } } } } } },
    });
    if (!plan) return { dayCount: 0, meals: [] };
    const use = plan.days.slice(0, days);
    const meals = use.flatMap((d) => d.meals
      .filter((m) => !m.skipped)
      .map((m) => {
        const servings = recipeServings(m.recipe);
        return {
          slot: m.slot,
          recipeName: m.recipe.name,
          // Stored recipes are whole-batch → divide to one portion so both
          // sources feed the aggregator in the same units.
          ingredients: m.recipe.ingredients.map((i) => ({ name: i.name, grams: i.grams / servings })),
        };
      }));
    return { dayCount: use.length, meals };
  }

  /**
   * Normalise a requested shopping start date against the LIVE date.
   * You can shop for today or any future day; a date already gone is snapped
   * forward to today, because you can't buy groceries for yesterday.
   */
  private resolveStartDate(startDate?: string): string {
    const today = todayISO();
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return today;
    return startDate < today ? today : startDate;
  }

  /** Save the citizen's preferred fresh-delivery time ("HH:MM", 24h). */
  async setDeliveryTime(userId: string, timeRaw: string) {
    const time = (timeRaw || '').trim();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new BadRequestException('Enter a time as HH:MM, e.g. 08:00.');
    }
    await this.mergeExtras(userId, { deliveryTime: time });
    return { ok: true, deliveryTime: time };
  }

  async groceryPlan(userId: string, mode: PlanMode = 'individual', days = 7, startDate?: string) {
    // SOURCE OF TRUTH: the COMPOSED plan — the same plan the Meal Plan page
    // shows. Previously this read the separately-generated MealPlan rows, so
    // the basket could be built from meals the user was never shown. Falls back
    // to the stored weekly plan only if the composed plan can't be produced.
    const window = Math.max(1, Math.min(28, Math.round(days)));
    const fromISO = this.resolveStartDate(startDate);
    // mode==='family' composes with every household member's allergies and
    // exclusions applied, so the basket can never buy an ingredient for a dish
    // one of them can't eat.
    const composed = await this.composedMealsForShopping(userId, window, fromISO, mode === 'family');

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

    type Acc = { name: string; grams: number; usedIn: Map<string, number>; neededOn?: string };
    const items = new Map<string, Acc>();               // canonicalKey → merged item
    const recipeView = new Map<string, Map<string, number>>(); // recipeName → canonical → grams
    // Meal counts for the shopping summary.
    const slotCounts: Record<string, number> = { b: 0, l: 0, s: 0, d: 0 };
    const activeDays = composed.dayCount;
    const headcount = mode === 'family' ? Math.max(1, memberScales.length) : 1;
    if (!composed.meals.length) return { aisles: [], recipes: [], itemCount: 0 };
    for (const meal of composed.meals) {
      slotCounts[meal.slot] = (slotCounts[meal.slot] ?? 0) + headcount;   // meals served = per-slot × people
      const rname = cleanRecipeName(meal.recipeName);
      const mealDay = meal.dayISO;
      for (const ing of meal.ingredients) {
        if (skipGroceryIngredient(ing.name)) continue;        // drop water/salt/to-taste/garnish…
        const canon = canonicalIngredient(ing.name);
        if (!canon) continue;
        // Composed-plan grams are ALREADY one person's portion, so we only
        // apply the household multiplier (no per-serving division).
        const grams = Math.max(0, Math.round(ing.grams * scale));
        if (grams <= 0) continue;
        const key = canon.toLowerCase();
        const cur: Acc = items.get(key) ?? { name: canon, grams: 0, usedIn: new Map<string, number>() };
        cur.grams += grams; cur.usedIn.set(rname, (cur.usedIn.get(rname) ?? 0) + grams);
        // Earliest day this ingredient is actually cooked — what a fresh item's
        // delivery should be scheduled against.
        if (mealDay && (!cur.neededOn || mealDay < cur.neededOn)) cur.neededOn = mealDay;
        items.set(key, cur);
        const rv = recipeView.get(rname) ?? new Map();
        rv.set(canon, (rv.get(canon) ?? 0) + grams); recipeView.set(rname, rv);
      }
    }

    // Group into supermarket aisles with standardised units, shelf info + a
    // recommended retail pack. Also tally required-vs-pack grams for waste + cost.
    const AISLES = GROCERY_AISLES;
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    let requiredG = 0, packG = 0, estCostInr = 0;
    // What the household ALREADY has — so the list shows what's actually left
    // to buy instead of asking them to re-buy a full jar of rice every week.
    const onHand = new Map<string, number>();
    for (const row of await this.pantry.findMany({ where: { ownerId: userId } }).catch(() => [] as PantryItemRow[])) {
      const k = canonicalIngredient(row.name).toLowerCase();
      if (k) onHand.set(k, (onHand.get(k) ?? 0) + row.grams);
    }
    for (const it of items.values()) {
      const cat = groceryAisle(it.name);
      const q = standardQty(it.name, it.grams, cat);
      const pack = recommendedPack(it.name, it.grams, cat);
      const shelf = SHELF_INFO[cat] ?? { life: '', tip: '' };
      requiredG += it.grams; packG += Math.max(pack.grams, it.grams);
      estCostInr += ((COST_PER_KG[cat] ?? 90) * Math.max(pack.grams, it.grams)) / 1000;
      const have = Math.min(it.grams, onHand.get(it.name.toLowerCase()) ?? 0);
      const toBuy = Math.max(0, it.grams - have);
      const shelfBucket = classifyShelf(it.name);   // pantry | weekly | daily
      const entry = {
        name: it.name, aisle: cat, qtyLabel: q.label, unit: q.unit, grams: it.grams,
        // Perishability + when it's first needed, so delivery can be scheduled
        // per item instead of dumping the whole basket on day one.
        shelf: shelfBucket,
        perishable: shelfBucket !== 'pantry',
        neededOn: it.neededOn ?? fromISO,
        // Pantry-aware split: needed vs already owned vs still to buy.
        haveGrams: have, toBuyGrams: toBuy,
        haveQtyLabel: have > 0 ? standardQty(it.name, have, cat).label : '',
        toBuyQtyLabel: standardQty(it.name, toBuy, cat).label,
        inPantry: have > 0,
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
    const windowEndISO = addDaysISO(fromISO, Math.max(0, activeDays - 1));

    // ── Delivery schedule (spec) ───────────────────────────────────────────
    // Non-perishables + anything fresh needed on day one travel in the FIRST
    // drop. Everything else fresh is scheduled on the day it's actually cooked,
    // at the citizen's preferred time — so herbs for Friday arrive Friday
    // instead of wilting in the fridge since Monday.
    const prefRow = await this.prisma.foodPref.findUnique({ where: { userId } }).catch(() => null);
    const prefEx = parseExtras((prefRow as { extras?: string | null } | null)?.extras);
    const deliveryTime = /^\d{2}:\d{2}$/.test(prefEx.deliveryTime ?? '') ? (prefEx.deliveryTime as string) : '08:00';
    const flatItems = aisles.flatMap((a) => a.items as Array<Record<string, unknown>>);
    const firstDrop: Array<Record<string, unknown>> = [];
    const laterByDay = new Map<string, Array<Record<string, unknown>>>();
    for (const it of flatItems) {
      const perishable = Boolean(it.perishable);
      const need = String(it.neededOn ?? fromISO);
      if (!perishable || need <= fromISO) firstDrop.push(it);
      else { const arr = laterByDay.get(need) ?? []; arr.push(it); laterByDay.set(need, arr); }
    }
    const deliverySchedule = {
      preferredTime: deliveryTime,
      // Pantry staples + day-one fresh — can go out straight away.
      first: { date: fromISO, time: deliveryTime, itemCount: firstDrop.length, items: firstDrop.map((i) => i.name) },
      // Future fresh, one drop per cooking day.
      daily: [...laterByDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, list]) => ({ date, time: deliveryTime, itemCount: list.length, items: list.map((i) => i.name) })),
    };
    const summary = {
      // The exact dates this basket covers, so the UI can say what it's for.
      startDate: fromISO, endDate: windowEndISO,
      householdSize: headcount,
      days: activeDays,
      meals: { breakfast: slotCounts.b, lunch: slotCounts.l, dinner: slotCounts.d, snacks: slotCounts.s },
      estimatedCostInr: Math.round(estCostInr),
      wastePct,                                  // overage from rounding to retail packs
      scale: Math.round(scale * 100) / 100,      // total household portions per serving
      members: memberScales,                     // per-member portion multipliers
      perishableCount: flatItems.filter((i) => i.perishable).length,
      pantryCount: flatItems.filter((i) => !i.perishable).length,
    };

    return { aisles, recipes, itemCount: items.size, summary, deliverySchedule };
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
  async buildCart(userId: string, opts: { planKey?: string; recipeIds?: string[]; people?: number; mode?: PlanMode; days?: number; startDate?: string }) {
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
        // Canonicalise exactly like groceryPlan() does — strip prep words and
        // apply synonyms — so the SAVED cart merges the same lines the displayed
        // list merges. Raw lowercasing kept "Chicken Breast" and "Chicken" (and
        // curd/dahi/yogurt) as separate rows the user then bought twice.
        const canon = canonicalIngredient(ing.name);
        const norm = canon.toLowerCase();
        if (!norm) continue;
        const cur = totals.get(norm) ?? { name: canon, grams: 0, price: 0 };
        cur.grams += Math.max(1, Math.round(ing.grams * factor));
        cur.price += Math.round(ing.priceInr * factor);
        totals.set(norm, cur);
      }
    };

    // No source given → build from the user's most recent plan for THIS mode
    // (individual vs family), so the family basket never pulls the solo plan.
    let planKey = opts.planKey;
    if (!planKey && !opts.recipeIds?.length) {
      // Same source of truth as the displayed list: the COMPOSED plan the user
      // is actually shown. Composed grams are already one portion, so scale by
      // headcount only; price is the same per-aisle estimate groceryPlan uses,
      // so the saved cart and the on-screen list agree on both items and cost.
      const composed = await this.composedMealsForShopping(
        userId,
        Math.max(1, Math.min(28, Math.round(opts.days ?? 7))),
        this.resolveStartDate(opts.startDate),
        opts.mode === 'family',   // saved cart mirrors the displayed family list
      );
      if (composed.meals.length) {
        for (const meal of composed.meals) {
          for (const ing of meal.ingredients) {
            if (skipGroceryIngredient(ing.name)) continue;
            const canon = canonicalIngredient(ing.name);
            if (!canon) continue;
            const grams = Math.max(1, Math.round(ing.grams * people));
            const key = canon.toLowerCase();
            const cur = totals.get(key) ?? { name: canon, grams: 0, price: 0 };
            cur.grams += grams;
            cur.price += Math.round(((COST_PER_KG[groceryAisle(canon)] ?? 90) * grams) / 1000);
            totals.set(key, cur);
          }
        }
        if (totals.size) return this.writeCart(userId, totals);
      }
      // Composed plan unavailable → fall back to the stored weekly plan.
      const where = opts.mode ? { userId, mode: opts.mode } : { userId };
      const latest = await this.prisma.mealPlan.findFirst({ where, orderBy: { createdAt: 'desc' } });
      planKey = latest?.key;
    }
    if (planKey) {
      // planKey can arrive straight off the request body, so it is scoped to the
      // caller here the way every other plan-key route scopes it via
      // assertOwnsPlan. Without this, another citizen's key copied their whole
      // week's ingredients into this cart and handed them back in the response.
      const plan = await this.prisma.mealPlan.findFirst({
        where: { key: planKey, userId },
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

  // ───────────────────────── Quick Commerce API ─────────────────────────
  // Find the grocery list across online stores (Blinkit, Zepto, Instamart,
  // BigBasket, JioMart + TC Express): per-store prices, availability, fees and
  // ETA for the SAME list — then order through whichever store wins. Live data
  // comes from quickcommerceapi.com when QUICKCOMMERCE_API_KEY is set; the
  // deterministic simulator covers every gap so the feature always works.

  private readonly qcClient = new QuickCommerceClient();
  private static readonly QC_DEFAULT_LAT = parseFloat(process.env.QC_DEFAULT_LAT || '19.08');
  private static readonly QC_DEFAULT_LON = parseFloat(process.env.QC_DEFAULT_LON || '72.88');

  /** The saved grocery list flattened into priceable items. */
  private async qcListItems(userId: string, mode: PlanMode): Promise<QcListItem[]> {
    const plan = await this.groceryPlan(userId, mode);
    const items: QcListItem[] = [];
    for (const aisle of plan.aisles as Array<{ key: string; items: Array<{ name: string; grams: number }> }>) {
      for (const it of aisle.items) {
        const baseInr = Math.max(8, Math.round(((COST_PER_KG[aisle.key] ?? 90) * Math.max(120, it.grams)) / 1000));
        items.push({ name: it.name, grams: it.grams, baseInr });
      }
    }
    return items;
  }

  /** Overlay live prices/ETAs from the QuickCommerce API onto simulator quotes.
   *  Credit budget: only the QC_LIVE_MAX_ITEMS most expensive items are priced
   *  live (per-platform mode costs one credit per store per item) — the rest
   *  keep estimates. Cached six hours, so this spends once per day in practice. */
  private async qcLiveOverlay(quotes: QcStoreQuote[], items: QcListItem[], lat: number, lon: number): Promise<boolean> {
    if (!this.qcClient.enabled || !items.length) return false;
    const maxLive = Math.max(1, parseInt(process.env.QC_LIVE_MAX_ITEMS || '12', 10));
    const liveItems = [...items].sort((a, b) => b.baseInr - a.baseInr).slice(0, maxLive);
    let anyLive = false;
    // Chunked so a big list doesn't open too many sockets at once.
    const chunk = 4;
    for (let i = 0; i < liveItems.length; i += chunk) {
      await Promise.all(liveItems.slice(i, i + chunk).map(async (it) => {
        const live = await this.qcClient.searchItem(it.name, lat, lon);
        if (!live) return;
        for (const lp of live) {
          const q = quotes.find((x) => x.provider.key === lp.platformKey);
          const iq = q?.items.find((x) => x.name === it.name);
          if (!q || !iq) continue;
          iq.priceInr = lp.priceInr;
          iq.available = lp.available;
          iq.note = lp.available ? (lp.packLabel ? `live · ${lp.packLabel}` : 'live') : 'out of stock';
          anyLive = true;
        }
      }));
    }
    if (anyLive) {
      for (const q of quotes) refreshTotals(q);
      const etas = await this.qcClient.etas(lat, lon);
      for (const e of etas) {
        const q = quotes.find((x) => x.provider.key === e.platformKey);
        if (q && e.storeOpen) q.etaMinutes = e.etaMinutes;
      }
      applyBadges(quotes);
    }
    return anyLive;
  }

  /** Compare the whole grocery list across every store. */
  async qcCompare(userId: string, mode: PlanMode = 'individual', lat?: number, lon?: number) {
    const items = await this.qcListItems(userId, mode);
    if (!items.length) return { itemCount: 0, live: false, liveEnabled: this.qcClient.enabled, quotes: [], note: 'Generate a meal plan first — the grocery list drives the comparison.' };
    const quotes = compareStores(items, new Date(), this.qcClient.enabled);
    const live = await this.qcLiveOverlay(
      quotes, items, lat ?? NutritionService.QC_DEFAULT_LAT, lon ?? NutritionService.QC_DEFAULT_LON,
    ).catch(() => false);
    // The full per-item breakdown is heavy — trim to what the UI shows.
    const maxLive = Math.max(1, parseInt(process.env.QC_LIVE_MAX_ITEMS || '12', 10));
    return {
      itemCount: items.length,
      live,
      liveEnabled: this.qcClient.enabled,
      liveNote: live && items.length > maxLive
        ? `Live prices applied to your ${maxLive} biggest items to conserve API credits; the rest use estimates. Raise QC_LIVE_MAX_ITEMS to widen coverage.`
        : undefined,
      // Without a live feed there is nothing to compare against, and we will not
      // print invented prices under other retailers' names.
      comparisonNote: this.qcClient.enabled
        ? undefined
        : 'Store-by-store price comparison needs a live pricing provider. Until one is connected, only Together City fulfilment is quoted.',
      quotes: quotes.map((q) => ({
        ...q,
        items: undefined,
        unavailable: q.unavailable.slice(0, 6),
        unavailableCount: q.unavailable.length,
      })),
    };
  }

  /** Find ONE product across all the stores (search across apps). */
  async qcSearch(q: string, lat?: number, lon?: number) {
    const name = q.trim();
    if (!name) return { query: q, live: false, liveEnabled: this.qcClient.enabled, results: [] };
    const cat = groceryAisle(name);
    const base: QcListItem = { name, grams: 500, baseInr: Math.max(10, Math.round(((COST_PER_KG[cat] ?? 90) * 400) / 1000)) };
    const quotes = QC_PROVIDERS.map((p) => quoteStore(p, [base]));
    let live = false;
    if (this.qcClient.enabled) {
      const lp = await this.qcClient.searchItem(name, lat ?? NutritionService.QC_DEFAULT_LAT, lon ?? NutritionService.QC_DEFAULT_LON).catch(() => null);
      if (lp) {
        for (const l of lp) {
          const quote = quotes.find((x) => x.provider.key === l.platformKey);
          const iq = quote?.items[0];
          if (!quote || !iq) continue;
          iq.priceInr = l.priceInr; iq.available = l.available;
          iq.note = l.available ? (l.packLabel ? `live · ${l.packLabel}` : 'live') : 'out of stock';
          refreshTotals(quote);
          live = true;
        }
      }
    }
    const results = quotes
      .map((quote) => ({
        provider: quote.provider,
        priceInr: quote.items[0].priceInr,
        available: quote.items[0].available,
        note: quote.items[0].note,
        etaMinutes: quote.etaMinutes,
        deliveryFeeInr: quote.deliveryFeeInr,
      }))
      .sort((a, b) => Number(b.available) - Number(a.available) || a.priceInr - b.priceInr);
    return { query: name, live, liveEnabled: this.qcClient.enabled, results };
  }

  /** Order the list through a chosen store — charged via the city wallet,
   *  delivered express with live tracking. */
  async qcOrder(userId: string, providerKey: string, mode: PlanMode = 'individual', method?: 'wallet' | 'card') {
    const items = await this.qcListItems(userId, mode);
    if (!items.length) throw new NotFoundException('Generate a meal plan first — your grocery list is empty.');
    const quotes = compareStores(items, new Date(), this.qcClient.enabled);
    await this.qcLiveOverlay(quotes, items, NutritionService.QC_DEFAULT_LAT, NutritionService.QC_DEFAULT_LON).catch(() => false);
    const quote = quotes.find((x) => x.provider.key === providerKey);
    if (!quote) throw new NotFoundException('Unknown store.');
    if (!quote.availableCount) throw new BadRequestException(`${quote.provider.name} has none of your items in stock right now.`);

    await this.financial.charge(userId, {
      hub: 'Nutrition', category: 'nutrition',
      label: `Quick commerce · ${quote.provider.name} (${quote.availableCount} items)`,
      amountInr: quote.totalInr, method,
    });
    const FRESH = new Set(['produce', 'fruit', 'meat', 'dairy']);
    const order = await this.prisma.nutritionOrder.create({
      data: {
        userId,
        totalInr: quote.totalInr,
        qcJson: '',
        items: {
          create: quote.items.filter((i) => i.available).map((i) => ({
            name: i.name, category: FRESH.has(groceryAisle(i.name)) ? 'fresh' : 'pantry', qty: 1, priceInr: i.priceInr,
          })),
        },
      } as never,
      include: { items: true, deliveries: true },
    });
    const meta = buildQcMeta(quote, order.id);
    await this.prisma.nutritionOrder.update({ where: { id: order.id }, data: { qcJson: JSON.stringify(meta) } as never });
    await this.stockPantryFromItems(userId, quote.items.filter((i) => i.available).map((i) => ({ name: i.name, grams: i.grams }))).catch(() => undefined);
    return { ...this.shapeOrder(order), qc: { ...meta, tracking: trackFromMeta(meta) } };
  }

  /** Live tracking for a quick-commerce order — advances purely with time. */
  async qcTrack(userId: string, orderId: string) {
    const order = await this.prisma.nutritionOrder.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new NotFoundException('order not found');
    const raw = (order as { qcJson?: string | null }).qcJson;
    if (!raw) throw new NotFoundException('not a quick-commerce order');
    let meta: QcMeta;
    try { meta = JSON.parse(raw) as QcMeta; } catch { throw new NotFoundException('tracking unavailable'); }
    return { orderId, totalInr: order.totalInr, tracking: trackFromMeta(meta) };
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
    // Quick-commerce orders carry provider + live tracking (computed from time).
    let qc: (QcMeta & { tracking: ReturnType<typeof trackFromMeta> }) | null = null;
    const rawQc = (o as { qcJson?: string | null }).qcJson;
    if (rawQc) {
      try { const meta = JSON.parse(rawQc) as QcMeta; qc = { ...meta, tracking: trackFromMeta(meta) }; }
      catch { qc = null; }
    }
    return {
      id: o.id,
      totalInr: o.totalInr,
      status: o.status,
      qc,
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
    const ex = parseExtras((pref as { extras?: string | null } | null)?.extras);
    const conditions = [...new Set([...(ex.healthConditions ?? []), ...conditionsFromBlood(await this.bloodValues(userId))])];
    const panel = await this.bloodPanel(userId);
    const flags: Record<string, MarkerStatus> = {};
    for (const m of panel.markers) flags[m.key] = m.status as MarkerStatus;
    const kit = supplementKit(pref?.goal ?? 'maintain', flags, { conditions, age: pref?.age ?? 30 });
    // Condition-specific safety cautions surfaced alongside the kit (QA H3).
    const c = conditions.join(' ').toLowerCase();
    const cautions: string[] = [];
    if (/kidney|renal|ckd|dialysis|nephro/.test(c)) cautions.push('Kidney disease: avoid protein powders, creatine, and standard multivitamins/electrolyte or potassium supplements unless your nephrologist approves — they can raise potassium, phosphorus and nitrogen load.');
    if (/pregnan/.test(c)) cautions.push('Pregnancy: use a prenatal formula and avoid high-dose preformed vitamin A (retinol). Confirm every supplement with your obstetrician.');
    if (/breastfeed|lactat|nursing/.test(c)) cautions.push('Breastfeeding: continue a prenatal/postnatal multivitamin; confirm doses with your clinician.');
    if (/liver|cirrhosis|hepat/.test(c)) cautions.push('Liver disease: avoid megadose vitamin A, niacin and herbal/“fat-burner” supplements — several are hepatotoxic. Confirm with your hepatologist.');
    if ((pref?.age ?? 30) < 18) cautions.push('Under 18: performance supplements (whey, creatine) are omitted — use food-first nutrition and a pediatric clinician’s guidance.');
    return { goal: pref?.goal ?? 'maintain', kit, cautions, totalInr: kit.reduce((s, k) => s + k.priceInr, 0) };
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
      imageUrl: recipeImageUrl((r as { recipeNo?: number | null }).recipeNo),
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
    const nameIdx = await this.nameIndex();

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
            const rawPlate = indian && (m.slot === 'l' || m.slot === 'd')
              ? assemblePlate(recipe, m.slot as 'l' | 'd', plateOpts, d.dayIndex * 4 + slotOrder[m.slot], dyn[m.slot as 'l' | 'd'] ?? tg.perMeal[m.slot as 'b' | 'l' | 's' | 'd']?.kcal)
              : undefined;
            // Every thali component is clickable: the main links to its own
            // recipe; sides best-effort-match to library recipes by name.
            const plate = rawPlate ? {
              ...rawPlate,
              components: rawPlate.components.map((c) => ({
                ...c,
                recipeId: c.role === 'main' ? m.recipe.id : this.matchComponentRecipe(nameIdx, c.name),
              })),
            } : undefined;
            // The card carries the PORTIONED values (what this meal actually
            // contributes); the serving size is shown alongside, and the recipe
            // page keeps per-full-plate values.
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
            // Complement foods on this plate (whole units, dietitian-style).
            let addons: Array<{ key: string; units: number; label: string; kcal: number }> = [];
            try {
              const picks = JSON.parse(((m as { addonsJson?: string | null }).addonsJson) ?? '[]') as AddonPick[];
              addons = picks.map((p) => ({
                key: p.key, units: p.units, label: addonLabel(p.key, p.units),
                kcal: Math.round((complementByKey.get(p.key)?.kcal ?? 0) * p.units),
              }));
            } catch { addons = []; }
            return {
              slot: m.slot,
              recipe: scaled,
              skipped: m.skipped,
              portionPct: pct,
              addons,
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
      ingredients: [string, number, number][], steps?: string[],
    ) => ({
      name, country, slot, kcal, protein, carbs, fat, fiber, minutes, gramsPerServing: g, diet,
      // Pre-written cooking steps ship with the recipe so the page renders them
      // instantly (recipeCookSteps builds structured steps from this, no AI cost).
      ...(steps && steps.length ? { steps: JSON.stringify(steps) } : {}),
      ingredients: { create: ingredients.map(([iname, grams, priceInr]) => ({ name: iname, grams, priceInr })) },
    });
    // Stamp sequential public Recipe Numbers onto a block of recipes so old→new
    // numbering stays traceable. Used for the "LowProtein 300 (new)" range.
    const withRecipeNos = <T>(start: number, arr: T[]): (T & { recipeNo: number })[] =>
      arr.map((r, i) => ({ ...r, recipeNo: start + i }));
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

      // ───────── Protein-gap expansion (paneer · dal · tofu · protein breakfasts ·
      // kidney-friendly light-protein) — closes the library's thin categories ─────────
      // Paneer-forward
      R('Paneer Tikka Skewers', 'India', 's', 280, 19, 10, 18, 2, 25, 160, 'veg', [['Paneer', 100, 60], ['Capsicum', 50, 10], ['Curd', 30, 5], ['Spices', 6, 4]]),
      R('Paneer Paratha & Curd', 'India', 'b', 470, 21, 46, 22, 5, 25, 300, 'veg', [['Wheat flour', 80, 13], ['Paneer', 80, 48], ['Curd', 80, 12], ['Ghee', 6, 6]]),
      R('Matar Paneer & Roti', 'India', 'l', 540, 25, 52, 26, 9, 30, 360, 'veg', [['Paneer', 100, 60], ['Green peas', 70, 12], ['Tomato gravy', 110, 20], ['Roti', 60, 12]]),
      R('Paneer Bhurji Wrap', 'India', 'b', 420, 22, 40, 19, 5, 20, 280, 'veg', [['Paneer', 90, 54], ['Roti', 70, 14], ['Onion tomato', 60, 10]]),
      R('Kadai Paneer & Roti', 'India', 'd', 540, 25, 46, 28, 8, 30, 350, 'veg', [['Paneer', 110, 66], ['Capsicum', 70, 14], ['Onion tomato gravy', 100, 18], ['Roti', 60, 12]]),
      R('Chilli Paneer (Dry)', 'China', 's', 300, 18, 18, 18, 3, 20, 170, 'veg', [['Paneer', 100, 60], ['Capsicum', 60, 12], ['Soy garlic sauce', 20, 8]]),
      R('Paneer Salad Bowl', 'India', 'l', 380, 24, 22, 22, 6, 15, 320, 'veg', [['Paneer', 110, 66], ['Salad vegetables', 150, 28], ['Peanuts', 15, 9], ['Lemon', 10, 2]]),
      R('Paneer Stuffed Besan Cheela', 'India', 'b', 400, 24, 34, 18, 6, 22, 260, 'veg', [['Gram flour', 60, 14], ['Paneer', 70, 42], ['Tomato', 40, 8], ['Coriander', 8, 3]]),
      // Dal / legume-forward
      R('Dal Palak & Roti', 'India', 'd', 470, 20, 62, 12, 12, 30, 360, 'vegan', [['Toor dal', 90, 20], ['Spinach', 100, 14], ['Roti', 90, 15]]),
      R('Panchmel Dal & Jeera Rice', 'India', 'l', 540, 20, 84, 12, 13, 35, 400, 'vegan', [['Mixed dal', 100, 24], ['Rice', 140, 24], ['Cumin tempering', 8, 5]]),
      R('Moong Dal Khichdi Bowl', 'India', 'd', 430, 18, 66, 9, 10, 25, 380, 'vegan', [['Moong dal', 70, 16], ['Rice', 90, 15], ['Vegetables', 80, 16]]),
      R('Rajma Salad Bowl', 'India', 'l', 420, 18, 62, 10, 14, 20, 340, 'vegan', [['Kidney beans', 120, 26], ['Onion tomato', 80, 14], ['Corn', 50, 10], ['Lemon', 10, 2]]),
      R('Dal Chilla with Mint Chutney', 'India', 'b', 360, 19, 48, 9, 8, 25, 240, 'vegan', [['Moong dal', 90, 22], ['Onion', 30, 5], ['Mint chutney', 25, 6]]),
      R('Chana Sundal', 'India', 's', 230, 11, 32, 6, 8, 15, 140, 'vegan', [['Chickpeas', 90, 20], ['Coconut', 15, 6], ['Mustard tempering', 6, 4]]),
      R('Masoor Dal Soup', 'India', 's', 210, 13, 30, 4, 6, 20, 260, 'vegan', [['Masoor dal', 60, 14], ['Tomato', 60, 10], ['Garlic', 8, 3]]),
      R('Hara Bhara Kabab', 'India', 's', 260, 12, 34, 9, 8, 25, 150, 'veg', [['Spinach', 80, 12], ['Green peas', 60, 10], ['Chana dal', 40, 9], ['Potato', 50, 6]]),
      R('Sambar with Brown Rice', 'India', 'l', 500, 17, 82, 10, 12, 35, 400, 'vegan', [['Toor dal', 80, 18], ['Mixed vegetables', 100, 18], ['Brown rice', 140, 26]]),
      R('Lobia Curry & Roti', 'India', 'd', 480, 19, 68, 12, 12, 35, 360, 'vegan', [['Black-eyed beans', 110, 22], ['Onion tomato gravy', 100, 18], ['Roti', 90, 15]]),
      // Tofu / soy
      R('Tofu Bhurji', 'India', 'b', 320, 21, 16, 19, 4, 15, 250, 'vegan', [['Tofu', 180, 48], ['Onion tomato', 70, 12], ['Turmeric spices', 5, 4]]),
      R('Soy Chunk Curry & Rice', 'India', 'l', 520, 28, 68, 12, 9, 30, 380, 'vegan', [['Soy chunks', 60, 16], ['Onion tomato gravy', 120, 20], ['Rice', 140, 24]]),
      R('Tofu Tikka Skewers', 'India', 's', 240, 17, 12, 14, 3, 25, 150, 'vegan', [['Tofu', 140, 38], ['Capsicum', 50, 10], ['Spice marinade', 15, 6]]),
      R('Soy Keema Pav', 'India', 'b', 420, 24, 52, 12, 8, 25, 280, 'vegan', [['Soy granules', 60, 16], ['Onion tomato', 80, 14], ['Whole-grain pav', 80, 18]]),
      R('Silken Tofu Miso Soup', 'Japan', 's', 180, 12, 14, 8, 3, 15, 300, 'vegan', [['Silken tofu', 120, 34], ['Miso', 15, 10], ['Spring onion', 15, 4]]),
      R('Tofu Green Curry & Rice', 'Thailand', 'd', 520, 22, 62, 20, 7, 30, 380, 'vegan', [['Tofu', 130, 36], ['Green curry vegetables', 120, 24], ['Rice', 130, 22]]),
      // Protein-rich breakfasts
      R('Masala Egg White Omelette & Toast', 'India', 'b', 340, 26, 30, 12, 4, 15, 260, 'egg', [['Egg whites', 150, 30], ['Whole-grain toast', 70, 18], ['Onion chilli', 40, 6]]),
      R('Curd Oats Power Bowl', 'India', 'b', 380, 20, 50, 10, 7, 10, 300, 'veg', [['Oats', 55, 16], ['Greek yogurt', 130, 35], ['Seeds', 12, 8], ['Banana', 50, 6]]),
      R('Moong Sprout Poha', 'India', 'b', 350, 15, 56, 8, 8, 20, 280, 'vegan', [['Flattened rice', 60, 13], ['Moong sprouts', 90, 16], ['Peanuts', 18, 10]]),
      R('Egg Bhurji Multigrain Wrap', 'India', 'b', 430, 26, 40, 18, 6, 18, 280, 'egg', [['Egg', 120, 28], ['Multigrain roti', 80, 18], ['Onion tomato', 50, 8]]),
      R('Quinoa Upma with Peanuts', 'India', 'b', 380, 14, 52, 13, 7, 22, 280, 'vegan', [['Quinoa', 70, 26], ['Vegetables', 80, 14], ['Peanuts', 20, 11]]),
      R('Paneer & Corn Sandwich', 'India', 'b', 420, 22, 46, 17, 6, 15, 260, 'veg', [['Whole-grain bread', 80, 20], ['Paneer', 70, 42], ['Sweetcorn', 50, 10]]),
      R('Dahi Chia Parfait', 'India', 'b', 330, 17, 34, 13, 8, 10, 260, 'veg', [['Greek yogurt', 150, 40], ['Chia seeds', 20, 20], ['Fruit', 80, 14]]),
      R('Besan Moong Waffle', 'India', 'b', 360, 20, 44, 11, 7, 25, 220, 'veg', [['Gram flour', 50, 12], ['Moong dal', 40, 10], ['Curd', 60, 9], ['Vegetables', 50, 9]]),
      // Kidney-friendly light-protein (lower protein density, gentle sodium)
      R('Vegetable Sevai Upma', 'India', 'b', 340, 7, 60, 8, 5, 20, 280, 'vegan', [['Rice vermicelli', 80, 14], ['Vegetables', 90, 16], ['Oil tempering', 8, 7]]),
      R('Ghee Rice with Sautéed Veg', 'India', 'l', 520, 9, 84, 16, 6, 25, 380, 'veg', [['Rice', 160, 27], ['Mixed vegetables', 120, 22], ['Ghee', 12, 12]]),
      R('Lemon Poha with Vegetables', 'India', 'b', 330, 6, 58, 8, 4, 15, 270, 'vegan', [['Flattened rice', 75, 16], ['Vegetables', 80, 14], ['Lemon', 12, 3], ['Oil', 8, 7]]),
      R('Aloo Capsicum & Phulka', 'India', 'd', 450, 10, 74, 13, 8, 28, 350, 'vegan', [['Potato', 130, 14], ['Capsicum', 80, 16], ['Phulka roti', 90, 15]]),
      R('Vegetable Pulao (Light)', 'India', 'l', 490, 9, 84, 13, 7, 30, 380, 'vegan', [['Basmati rice', 150, 28], ['Mixed vegetables', 120, 22], ['Oil whole spices', 10, 9]]),
      R('Sabudana Fruit Bowl', 'India', 's', 260, 3, 52, 5, 3, 20, 240, 'jain', [['Sago', 60, 13], ['Fruit', 100, 18], ['Coconut', 10, 4]]),
      R('Rice Sevai with Coconut', 'India', 'd', 430, 7, 74, 12, 5, 25, 340, 'vegan', [['Rice vermicelli', 100, 18], ['Coconut', 25, 10], ['Vegetables', 70, 12], ['Oil', 8, 7]]),
      R('Honey Fruit Chaat', 'India', 's', 190, 2, 44, 1, 5, 10, 220, 'vegan', [['Seasonal fruit', 220, 40], ['Honey', 12, 6], ['Lemon chaat masala', 5, 3]]),

      // ───────── Low-protein library (100 recipes) — makes kidney-moderated
      // prescriptions (protein ≤0.9 g/kg) satisfiable at full calories. Protein
      // density ≤ ~4 g/100 kcal; macros computed from ingredient weights. ─────────
      R('Lemon Sevai Upma', 'India', 'b', 382, 7, 69, 9, 3, 20, 168, 'vegan', [['Rice vermicelli', 80, 14], ['Vegetables', 60, 10], ['Lemon', 15, 3], ['Oil', 8, 7], ['Spices', 5, 4]]),
      R('Sweet Poha with Coconut', 'India', 'b', 414, 5, 74, 11, 2, 20, 108, 'vegan', [['Poha', 70, 14], ['Jaggery', 18, 7], ['Coconut', 15, 6], ['Ghee', 5, 5]]),
      R('Aloo Poha', 'India', 'b', 405, 7, 72, 10, 3, 20, 204, 'vegan', [['Poha', 70, 14], ['Potato', 80, 9], ['Onion', 40, 6], ['Oil', 9, 8], ['Spices', 5, 4]]),
      R('Sabudana Kheer', 'India', 'b', 370, 6, 71, 7, 0, 20, 268, 'veg', [['Sago', 50, 11], ['Milk', 200, 15], ['Sugar', 18, 7]]),
      R('Vegetable Semiya', 'India', 'b', 379, 7, 66, 10, 3, 20, 174, 'vegan', [['Rice vermicelli', 75, 13], ['Carrot', 50, 9], ['Capsicum', 40, 8], ['Oil', 9, 8]]),
      R('Rice Kanji Bowl', 'India', 'b', 232, 5, 51, 1, 2, 20, 114, 'vegan', [['Rice', 60, 10], ['Vegetables', 50, 9], ['Spices', 4, 3]]),
      R('Suji Kesari Bath', 'India', 'b', 367, 6, 60, 12, 4, 20, 87, 'veg', [['Semolina', 55, 11], ['Sugar', 22, 8], ['Ghee', 10, 10]]),
      R('Plain Dosa with Coconut Chutney', 'India', 'b', 447, 8, 71, 14, 4, 20, 207, 'vegan', [['Idli batter', 180, 26], ['Coconut', 20, 8], ['Oil', 7, 6]]),
      R('Steamed Idli with Tomato Chutney', 'India', 'b', 406, 9, 79, 6, 3, 20, 270, 'vegan', [['Idli batter', 200, 28], ['Tomato', 60, 9], ['Oil', 5, 5], ['Spices', 5, 4]]),
      R('Vegetable Uttapam', 'India', 'b', 407, 8, 74, 9, 3, 20, 268, 'vegan', [['Idli batter', 180, 26], ['Onion', 40, 6], ['Tomato', 40, 6], ['Oil', 8, 7]]),
      R('Banana Sheera', 'India', 'b', 393, 6, 68, 11, 6, 20, 154, 'veg', [['Semolina', 50, 10], ['Banana', 80, 9], ['Sugar', 15, 6], ['Ghee', 9, 9]]),
      R('Fruit & Honey Toast', 'India', 'b', 329, 7, 58, 8, 5, 20, 168, 'veg', [['Bread', 70, 17], ['Mixed fruit', 80, 14], ['Honey', 12, 6], ['Butter', 6, 6]]),
      R('Aloo Sandwich (Grilled)', 'India', 'b', 341, 9, 56, 9, 5, 20, 181, 'veg', [['Bread', 80, 20], ['Potato', 90, 10], ['Butter', 7, 7], ['Spices', 4, 3]]),
      R('Sweet Corn Upma', 'India', 'b', 323, 7, 50, 11, 6, 20, 128, 'vegan', [['Semolina', 50, 10], ['Corn', 70, 12], ['Oil', 8, 7]]),
      R('Tomato Onion Upma', 'India', 'b', 301, 6, 44, 11, 6, 20, 164, 'vegan', [['Semolina', 55, 11], ['Tomato', 60, 9], ['Onion', 40, 6], ['Oil', 9, 8]]),
      R('Mango Rice Flakes Bowl', 'India', 'b', 354, 5, 74, 4, 4, 20, 180, 'vegan', [['Poha', 60, 12], ['Mango', 100, 18], ['Coconut', 10, 4], ['Jaggery', 10, 4]]),
      R('Apple Cinnamon Porridge (Rice)', 'India', 'b', 373, 10, 68, 7, 3, 20, 320, 'veg', [['Rice', 50, 9], ['Milk', 180, 14], ['Apple', 80, 14], ['Honey', 10, 5]]),
      R('Ghee Rice Flakes (Aval)', 'India', 'b', 374, 5, 69, 9, 1, 20, 93, 'veg', [['Poha', 70, 14], ['Ghee', 8, 8], ['Jaggery', 15, 6]]),
      R('Vegetable Appam with Stew (Light)', 'India', 'b', 437, 8, 70, 14, 5, 20, 266, 'vegan', [['Idli batter', 160, 24], ['Vegetables', 80, 14], ['Coconut', 20, 8], ['Oil', 6, 5]]),
      R('Carrot Semolina Pancakes', 'India', 'b', 313, 8, 45, 11, 6, 20, 163, 'veg', [['Semolina', 55, 11], ['Carrot', 60, 10], ['Curd', 40, 6], ['Oil', 8, 7]]),
      R('Tamarind Poha', 'India', 'b', 332, 5, 56, 10, 1, 20, 100, 'vegan', [['Poha', 70, 14], ['Tamarind', 15, 4], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Banana Coconut Smoothie Bowl', 'India', 'b', 296, 6, 46, 9, 4, 20, 292, 'veg', [['Banana', 120, 14], ['Milk', 150, 11], ['Coconut', 12, 5], ['Honey', 10, 5]]),
      R('Toast with Tomato & Olive Oil', 'Italy', 'b', 324, 8, 43, 13, 4, 20, 170, 'vegan', [['Bread', 80, 20], ['Tomato', 80, 12], ['Oil', 10, 9]]),
      R('Congee with Vegetables', 'China', 'b', 245, 6, 54, 1, 3, 20, 145, 'vegan', [['Rice', 60, 10], ['Vegetables', 80, 14], ['Spices', 5, 4]]),
      R('Fruit Couscous Breakfast Bowl', 'Lebanon', 'b', 287, 7, 62, 1, 4, 20, 155, 'vegan', [['Couscous', 55, 14], ['Mixed fruit', 90, 16], ['Honey', 10, 5]]),
      R('Lemon Rice with Vegetables', 'India', 'l', 440, 8, 77, 11, 3, 30, 191, 'vegan', [['Rice', 90, 15], ['Vegetables', 70, 12], ['Lemon', 15, 3], ['Oil', 10, 9], ['Spices', 6, 5]]),
      R('Tamarind Rice (Puliyodarai)', 'India', 'l', 431, 7, 72, 13, 2, 30, 130, 'vegan', [['Rice', 90, 15], ['Tamarind', 20, 5], ['Oil', 12, 11], ['Spices', 8, 6]]),
      R('Vegetable Pulao (Kidney-Light)', 'India', 'l', 461, 8, 82, 11, 4, 30, 201, 'vegan', [['Rice', 95, 16], ['Vegetables', 90, 16], ['Oil', 10, 9], ['Spices', 6, 5]]),
      R('Jeera Aloo with Rice', 'India', 'l', 481, 9, 87, 11, 4, 30, 221, 'vegan', [['Rice', 85, 14], ['Potato', 120, 13], ['Oil', 10, 9], ['Spices', 6, 5]]),
      R('Cabbage Rice Bowl', 'India', 'l', 428, 9, 75, 10, 4, 30, 204, 'vegan', [['Rice', 90, 15], ['Cabbage', 100, 15], ['Oil', 9, 8], ['Spices', 5, 4]]),
      R('Pumpkin Curry with Rice', 'India', 'l', 481, 9, 80, 14, 6, 30, 248, 'vegan', [['Rice', 85, 14], ['Pumpkin', 140, 20], ['Coconut', 15, 6], ['Oil', 8, 7]]),
      R('Bottle Gourd Curry & Rice', 'India', 'l', 439, 9, 78, 10, 5, 30, 240, 'vegan', [['Rice', 85, 14], ['Bottle gourd', 140, 18], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Aloo Capsicum Rice', 'India', 'l', 470, 9, 86, 10, 5, 30, 244, 'vegan', [['Rice', 85, 14], ['Potato', 90, 10], ['Capsicum', 60, 12], ['Oil', 9, 8]]),
      R('Curd Rice (Light)', 'India', 'l', 441, 10, 79, 9, 2, 30, 205, 'veg', [['Rice', 95, 16], ['Curd', 100, 15], ['Oil', 5, 5], ['Spices', 5, 4]]),
      R('Coconut Rice', 'India', 'l', 480, 7, 74, 17, 4, 30, 128, 'vegan', [['Rice', 90, 15], ['Coconut', 25, 10], ['Oil', 8, 7], ['Spices', 5, 4]]),
      R('Veg Fried Rice (Light)', 'China', 'l', 458, 8, 81, 11, 4, 30, 195, 'vegan', [['Rice', 95, 16], ['Vegetables', 90, 16], ['Oil', 10, 9]]),
      R('Hakka Noodles with Vegetables', 'China', 'l', 429, 12, 68, 12, 5, 30, 185, 'vegan', [['Noodles', 85, 20], ['Vegetables', 90, 16], ['Oil', 10, 9]]),
      R('Penne in Tomato Basil Sauce', 'Italy', 'l', 407, 11, 66, 11, 4, 30, 214, 'vegan', [['Pasta', 85, 21], ['Tomato sauce', 120, 20], ['Oil', 9, 8]]),
      R('Mexican Vegetable Rice', 'Mexico', 'l', 481, 9, 87, 11, 4, 30, 209, 'vegan', [['Rice', 90, 15], ['Corn', 60, 10], ['Capsicum', 50, 10], ['Oil', 9, 8]]),
      R('Thai Pumpkin Curry with Rice', 'Thailand', 'l', 491, 9, 79, 16, 6, 30, 233, 'vegan', [['Rice', 85, 14], ['Pumpkin', 120, 17], ['Coconut', 20, 8], ['Oil', 8, 7]]),
      R('Roasted Vegetable Couscous', 'Lebanon', 'l', 419, 12, 66, 12, 5, 30, 200, 'vegan', [['Couscous', 80, 20], ['Vegetables', 110, 19], ['Oil', 10, 9]]),
      R('Aloo Gobi with Phulka', 'India', 'l', 384, 11, 61, 11, 9, 30, 249, 'vegan', [['Wheat flour', 60, 10], ['Potato', 90, 10], ['Cauliflower', 90, 14], ['Oil', 9, 8]]),
      R('Mixed Vegetable Sabzi & Phulka', 'India', 'l', 345, 9, 53, 11, 8, 30, 209, 'vegan', [['Wheat flour', 60, 10], ['Vegetables', 140, 24], ['Oil', 9, 8]]),
      R('Tinda Masala with Rice', 'India', 'l', 441, 9, 79, 10, 5, 30, 274, 'vegan', [['Rice', 85, 14], ['Bottle gourd', 130, 17], ['Tomato', 50, 8], ['Oil', 9, 8]]),
      R('Mushroom Rice (Light)', 'China', 'l', 422, 9, 74, 10, 2, 30, 193, 'vegan', [['Rice', 90, 15], ['Mushroom', 90, 20], ['Oil', 9, 8], ['Spices', 4, 3]]),
      R('Vegetable Paella (Light)', 'Continental', 'l', 448, 8, 79, 11, 4, 30, 205, 'vegan', [['Rice', 90, 15], ['Vegetables', 100, 17], ['Oil', 10, 9], ['Spices', 5, 4]]),
      R('Carrot Peas-Free Pulao', 'India', 'l', 448, 8, 81, 10, 4, 30, 190, 'jain', [['Rice', 95, 16], ['Carrot', 80, 14], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Ash Gourd Stew with Rice', 'India', 'l', 479, 9, 79, 14, 6, 30, 240, 'vegan', [['Rice', 85, 14], ['Bottle gourd', 130, 17], ['Coconut', 18, 7], ['Oil', 7, 6]]),
      R('Capsicum Masala Rice', 'India', 'l', 435, 8, 78, 10, 4, 30, 195, 'vegan', [['Rice', 90, 15], ['Capsicum', 90, 18], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Sweet Potato Coconut Curry & Rice', 'India', 'l', 499, 9, 86, 14, 5, 30, 225, 'vegan', [['Rice', 80, 13], ['Sweet potato', 120, 16], ['Coconut', 18, 7], ['Oil', 7, 6]]),
      R('Vegetable Khichdi (Kidney-Light)', 'India', 'd', 425, 8, 78, 9, 4, 30, 193, 'jain', [['Rice', 90, 15], ['Vegetables', 90, 16], ['Ghee', 8, 8], ['Spices', 5, 4]]),
      R('Tomato Rice', 'India', 'd', 418, 7, 75, 10, 3, 30, 205, 'vegan', [['Rice', 90, 15], ['Tomato', 100, 15], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Ghee Phulka with Lauki Sabzi', 'India', 'd', 356, 10, 57, 10, 9, 30, 218, 'veg', [['Wheat flour', 65, 11], ['Bottle gourd', 140, 18], ['Ghee', 8, 8], ['Spices', 5, 4]]),
      R('Aloo Tamatar Curry & Phulka', 'India', 'd', 379, 10, 64, 9, 8, 30, 258, 'vegan', [['Wheat flour', 60, 10], ['Potato', 110, 12], ['Tomato', 80, 12], ['Oil', 8, 7]]),
      R('Vegetable Chow Mein (Light)', 'China', 'd', 428, 13, 69, 11, 6, 30, 224, 'vegan', [['Noodles', 85, 20], ['Cabbage', 80, 12], ['Carrot', 50, 9], ['Oil', 9, 8]]),
      R('Spaghetti Aglio e Olio', 'Italy', 'd', 431, 10, 62, 16, 3, 30, 105, 'vegan', [['Pasta', 85, 21], ['Oil', 14, 12], ['Spices', 6, 5]]),
      R('Pumpkin Soup with Bread', 'Continental', 'd', 346, 10, 51, 11, 8, 30, 278, 'vegan', [['Pumpkin', 200, 28], ['Bread', 70, 17], ['Oil', 8, 7]]),
      R('Potato Leek-Style Soup & Toast', 'Continental', 'd', 385, 12, 60, 11, 5, 30, 316, 'veg', [['Potato', 150, 16], ['Milk', 100, 8], ['Bread', 60, 15], ['Butter', 6, 6]]),
      R('Vegetable Stew with Appam', 'India', 'd', 382, 8, 68, 8, 6, 30, 272, 'vegan', [['Idli batter', 150, 22], ['Vegetables', 100, 17], ['Coconut', 22, 9]]),
      R('Cabbage Poriyal & Rice', 'India', 'd', 440, 9, 74, 12, 5, 30, 224, 'vegan', [['Rice', 85, 14], ['Cabbage', 120, 18], ['Coconut', 12, 5], ['Oil', 7, 6]]),
      R('Carrot Beans-Free Poriyal & Rice', 'India', 'd', 448, 8, 77, 12, 5, 30, 214, 'jain', [['Rice', 85, 14], ['Carrot', 110, 19], ['Coconut', 12, 5], ['Oil', 7, 6]]),
      R('Turai Sabzi with Phulka', 'India', 'd', 335, 9, 53, 10, 8, 30, 203, 'vegan', [['Wheat flour', 60, 10], ['Bottle gourd', 130, 17], ['Oil', 8, 7], ['Spices', 5, 4]]),
      R('Vegetable Daliya (Light)', 'India', 'd', 339, 8, 54, 10, 8, 30, 173, 'vegan', [['Semolina', 65, 13], ['Vegetables', 100, 17], ['Oil', 8, 7]]),
      R('Baingan Bharta (Light) & Phulka', 'India', 'd', 349, 9, 54, 11, 8, 30, 215, 'vegan', [['Wheat flour', 60, 10], ['Vegetables', 140, 24], ['Oil', 9, 8], ['Spices', 6, 5]]),
      R('Tomato Basil Risotto (Light)', 'Italy', 'd', 394, 7, 74, 7, 3, 30, 208, 'veg', [['Rice', 90, 15], ['Tomato sauce', 110, 18], ['Butter', 8, 8]]),
      R('Stir-Fried Rice Noodles with Veg', 'Thailand', 'd', 415, 11, 66, 12, 5, 30, 190, 'vegan', [['Noodles', 80, 19], ['Vegetables', 100, 17], ['Oil', 10, 9]]),
      R('Aloo Capsicum & Phulka (Dinner)', 'India', 'd', 383, 10, 65, 10, 9, 30, 238, 'vegan', [['Wheat flour', 60, 10], ['Potato', 100, 11], ['Capsicum', 70, 14], ['Oil', 8, 7]]),
      R('Pumpkin Sabzi & Ghee Rice', 'India', 'd', 434, 8, 77, 10, 5, 30, 229, 'veg', [['Rice', 85, 14], ['Pumpkin', 130, 18], ['Ghee', 9, 9], ['Spices', 5, 4]]),
      R('Mushroom Stir-Fry with Noodles', 'China', 'd', 392, 13, 61, 11, 3, 30, 189, 'vegan', [['Noodles', 80, 19], ['Mushroom', 100, 22], ['Oil', 9, 8]]),
      R('Vegetable Sevai (Dinner)', 'India', 'd', 414, 8, 74, 10, 4, 30, 184, 'vegan', [['Rice vermicelli', 85, 15], ['Vegetables', 90, 16], ['Oil', 9, 8]]),
      R('Sweet Potato Tikki Plate', 'India', 'd', 311, 5, 51, 9, 4, 30, 204, 'vegan', [['Sweet potato', 160, 21], ['Poha', 30, 6], ['Oil', 9, 8], ['Spices', 5, 4]]),
      R('Ratatouille with Bread', 'Continental', 'd', 336, 9, 48, 12, 8, 30, 329, 'vegan', [['Vegetables', 180, 31], ['Tomato', 80, 12], ['Bread', 60, 15], ['Oil', 9, 8]]),
      R('Corn Capsicum Rice', 'India', 'd', 466, 9, 85, 10, 4, 30, 213, 'vegan', [['Rice', 85, 14], ['Corn', 70, 12], ['Capsicum', 50, 10], ['Oil', 8, 7]]),
      R('Light Tomato Khow Suey (Veg)', 'Thailand', 'd', 429, 11, 63, 15, 5, 30, 185, 'vegan', [['Noodles', 80, 19], ['Coconut', 18, 7], ['Tomato', 80, 12], ['Oil', 7, 6]]),
      R('Jain Vegetable Pulao (Dinner)', 'India', 'd', 455, 9, 82, 10, 4, 30, 224, 'jain', [['Rice', 95, 16], ['Capsicum', 60, 12], ['Cabbage', 60, 9], ['Oil', 9, 8]]),
      R('Fruit Chaat (Low-Protein)', 'India', 's', 124, 2, 28, 1, 5, 15, 213, 'vegan', [['Mixed fruit', 200, 35], ['Lemon', 10, 2], ['Spices', 3, 2]]),
      R('Boiled Sweet Corn Cup', 'India', 's', 206, 5, 32, 6, 4, 15, 163, 'vegan', [['Corn', 150, 25], ['Butter', 5, 5], ['Lemon', 8, 2]]),
      R('Baked Sweet Potato Wedges', 'India', 's', 181, 3, 26, 7, 3, 15, 161, 'vegan', [['Sweet potato', 150, 20], ['Oil', 7, 6], ['Spices', 4, 3]]),
      R('Cucumber Tomato Sandwich', 'India', 's', 268, 8, 41, 8, 5, 15, 156, 'veg', [['Bread', 70, 17], ['Vegetables', 80, 14], ['Butter', 6, 6]]),
      R('Murmura Bhel (Light)', 'India', 's', 177, 4, 40, 0, 2, 15, 118, 'vegan', [['Murmura', 40, 8], ['Onion', 30, 5], ['Tomato', 40, 6], ['Lemon', 8, 2]]),
      R('Tomato Soup with Croutons', 'Continental', 's', 178, 4, 23, 8, 4, 15, 236, 'vegan', [['Tomato', 200, 30], ['Bread', 30, 8], ['Oil', 6, 5]]),
      R('Vegetable Clear Soup', 'China', 's', 66, 3, 12, 1, 4, 15, 155, 'vegan', [['Vegetables', 150, 26], ['Spices', 5, 4]]),
      R('Banana with Honey', 'India', 's', 166, 1, 39, 0, 3, 15, 132, 'vegan', [['Banana', 120, 14], ['Honey', 12, 6]]),
      R('Apple Slices with Cinnamon', 'India', 's', 138, 1, 32, 1, 4, 15, 188, 'vegan', [['Apple', 180, 32], ['Honey', 8, 4]]),
      R('Lemon Sago Pearls', 'India', 's', 207, 0, 52, 0, 0, 15, 67, 'vegan', [['Sago', 45, 10], ['Lemon', 10, 2], ['Sugar', 12, 5]]),
      R('Rice Cakes with Fruit', 'India', 's', 225, 3, 52, 0, 3, 15, 143, 'vegan', [['Murmura', 35, 7], ['Mixed fruit', 100, 18], ['Honey', 8, 4]]),
      R('Roasted Makhana (Small Bowl)', 'India', 's', 124, 2, 19, 4, 2, 15, 29, 'jain', [['Makhana', 25, 19], ['Ghee', 4, 4]]),
      R('Mango Slices Plate', 'India', 's', 138, 1, 32, 1, 4, 15, 200, 'vegan', [['Mango', 200, 36]]),
      R('Steamed Corn & Capsicum Cup', 'India', 's', 134, 4, 25, 2, 4, 15, 158, 'vegan', [['Corn', 100, 17], ['Capsicum', 50, 10], ['Lemon', 8, 2]]),
      R('Sabudana Fruit Pudding', 'India', 's', 301, 4, 61, 4, 2, 15, 250, 'veg', [['Sago', 40, 9], ['Milk', 120, 9], ['Mixed fruit', 80, 14], ['Sugar', 10, 4]]),
      R('Grilled Pineapple-Style Fruit Skewers', 'Continental', 's', 146, 1, 34, 1, 4, 15, 190, 'vegan', [['Mixed fruit', 180, 32], ['Honey', 10, 5]]),
      R('Veg Suji Toast (Small)', 'India', 's', 325, 9, 52, 9, 6, 15, 141, 'veg', [['Bread', 60, 15], ['Semolina', 25, 5], ['Vegetables', 50, 9], ['Oil', 6, 5]]),
      R('Carrot Cucumber Sticks with Lemon', 'India', 's', 78, 3, 15, 1, 5, 15, 190, 'vegan', [['Carrot', 100, 17], ['Vegetables', 80, 14], ['Lemon', 10, 2]]),
      R('Watermelon-Style Fruit Bowl', 'India', 's', 149, 2, 34, 1, 6, 15, 250, 'vegan', [['Mixed fruit', 250, 44]]),
      R('Honey Lemon Rice Flakes', 'India', 's', 206, 3, 47, 0, 1, 15, 65, 'vegan', [['Poha', 45, 9], ['Honey', 12, 6], ['Lemon', 8, 2]]),
      R('Baked Potato Smiley Plate', 'India', 's', 249, 4, 39, 8, 3, 15, 168, 'vegan', [['Potato', 140, 15], ['Poha', 20, 4], ['Oil', 8, 7]]),
      R('Coconut Water Fruit Cup', 'India', 's', 126, 1, 22, 4, 5, 15, 160, 'vegan', [['Mixed fruit', 150, 26], ['Coconut', 10, 4]]),
      R('Tomato Bruschetta (Light)', 'Italy', 's', 254, 6, 34, 11, 3, 15, 158, 'vegan', [['Bread', 60, 15], ['Tomato', 90, 14], ['Oil', 8, 7]]),
      R('Veg Momos Soup Bowl (Light)', 'China', 's', 230, 7, 35, 7, 5, 15, 121, 'vegan', [['Wheat flour', 45, 8], ['Cabbage', 70, 11], ['Oil', 6, 5]]),
      R('Kaju-Free Suji Ladoo (2 pc)', 'India', 's', 299, 4, 46, 11, 3, 15, 68, 'veg', [['Semolina', 40, 8], ['Sugar', 18, 7], ['Ghee', 10, 10]]),

      // ───────── Energy-dense low-protein library (60 recipes) — fills the
      // weekly calorie/carb/fat budget to ~100% without letting protein escape.
      // Dishes are sized near their slot budgets (b~640, l~820, d~770, s~330 kcal)
      // with protein density ≤ ~4.3 g/100 kcal; macros from ingredient weights. ─────────
      R('Grand Aloo Poha Platter', 'India', 'b', 617, 11, 110, 15, 5, 25, 290, 'vegan', [['Poha', 110, 20], ['Potato', 110, 12], ['Onion', 50, 8], ['Oil', 14, 12], ['Spices', 6, 5]]),
      R('Big Lemon Sevai with Coconut', 'India', 'b', 637, 10, 102, 21, 5, 25, 228, 'vegan', [['Rice vermicelli', 120, 21], ['Coconut', 20, 8], ['Lemon', 15, 3], ['Oil', 13, 11], ['Vegetables', 60, 10]]),
      R('Sheera & Fruit Breakfast Plate', 'India', 'b', 628, 9, 106, 19, 9, 25, 216, 'veg', [['Semolina', 80, 16], ['Sugar', 30, 11], ['Ghee', 16, 16], ['Banana', 90, 10]]),
      R('Double Dosa with Potato Masala', 'India', 'b', 635, 12, 114, 14, 5, 25, 389, 'vegan', [['Idli batter', 240, 34], ['Potato', 130, 14], ['Oil', 13, 11], ['Spices', 6, 5]]),
      R('Idli Trio with Coconut Chutney', 'India', 'b', 678, 12, 111, 20, 6, 25, 324, 'vegan', [['Idli batter', 280, 40], ['Coconut', 30, 12], ['Oil', 9, 8], ['Spices', 5, 4]]),
      R('Banana Jaggery Pancake Stack', 'India', 'b', 617, 11, 112, 14, 10, 25, 235, 'veg', [['Wheat flour', 85, 14], ['Banana', 110, 13], ['Jaggery', 28, 10], ['Ghee', 12, 12]]),
      R('Sweet Coconut Poha Bowl (Large)', 'India', 'b', 646, 8, 115, 17, 4, 25, 168, 'vegan', [['Poha', 105, 19], ['Jaggery', 30, 11], ['Coconut', 25, 10], ['Ghee', 8, 8]]),
      R('Fruit & Sago Breakfast Pudding', 'India', 'b', 578, 8, 119, 8, 3, 25, 426, 'veg', [['Sago', 80, 17], ['Milk', 220, 17], ['Sugar', 26, 10], ['Mixed fruit', 100, 18]]),
      R('French Toast with Honey (Eggless)', 'Continental', 'b', 556, 14, 84, 18, 4, 25, 266, 'veg', [['Bread', 110, 27], ['Milk', 120, 9], ['Honey', 24, 12], ['Butter', 12, 12]]),
      R('Vegetable Semiya Feast', 'India', 'b', 567, 10, 98, 15, 4, 25, 225, 'vegan', [['Rice vermicelli', 115, 20], ['Vegetables', 90, 16], ['Oil', 14, 12], ['Spices', 6, 5]]),
      R('Mango Coconut Rice Flakes (Large)', 'India', 'b', 556, 8, 115, 7, 6, 25, 269, 'vegan', [['Poha', 95, 18], ['Mango', 140, 25], ['Coconut', 18, 7], ['Jaggery', 16, 6]]),
      R('Kesari Bath & Banana Plate', 'India', 'b', 595, 9, 103, 17, 9, 25, 217, 'veg', [['Semolina', 75, 15], ['Sugar', 28, 10], ['Ghee', 14, 14], ['Banana', 100, 11]]),
      R('Tomato Onion Uttapam (Double)', 'India', 'b', 572, 11, 102, 13, 4, 25, 372, 'vegan', [['Idli batter', 250, 36], ['Tomato', 60, 9], ['Onion', 50, 8], ['Oil', 12, 10]]),
      R('Congee Breakfast Bowl (Hearty)', 'China', 'b', 539, 10, 99, 11, 5, 25, 240, 'vegan', [['Rice', 115, 20], ['Vegetables', 110, 20], ['Oil', 10, 11], ['Spices', 5, 6]]),
      R('Apple Date Porridge (Rice, Large)', 'India', 'b', 563, 14, 108, 9, 6, 25, 420, 'veg', [['Rice', 80, 14], ['Milk', 220, 17], ['Apple', 90, 16], ['Dates', 30, 12]]),
      R('Grand Lemon Rice Thali-Style', 'India', 'l', 717, 12, 125, 19, 5, 35, 272, 'vegan', [['Rice', 150, 25], ['Vegetables', 80, 14], ['Lemon', 18, 4], ['Oil', 17, 15], ['Spices', 7, 6]]),
      R('Tamarind Rice Feast', 'India', 'l', 705, 11, 119, 20, 3, 35, 203, 'vegan', [['Rice', 150, 25], ['Tamarind', 25, 6], ['Oil', 19, 17], ['Spices', 9, 7]]),
      R('Vegetable Pulao (Full Plate)', 'India', 'l', 733, 13, 130, 18, 5, 35, 288, 'vegan', [['Rice', 155, 26], ['Vegetables', 110, 19], ['Oil', 16, 14], ['Spices', 7, 6]]),
      R('Coconut Rice with Roasted Veg', 'India', 'l', 774, 13, 125, 25, 7, 35, 272, 'vegan', [['Rice', 145, 25], ['Coconut', 35, 14], ['Oil', 12, 10], ['Vegetables', 80, 14]]),
      R('Jeera Aloo Rice Bowl (Large)', 'India', 'l', 741, 13, 135, 16, 5, 35, 312, 'vegan', [['Rice', 140, 24], ['Potato', 150, 16], ['Oil', 15, 13], ['Spices', 7, 6]]),
      R('Curd Rice Platter with Fruit', 'India', 'l', 710, 15, 131, 14, 4, 35, 348, 'veg', [['Rice', 150, 25], ['Curd', 130, 20], ['Oil', 8, 7], ['Mixed fruit', 60, 11]]),
      R('Pumpkin Coconut Curry & Rice (Full)', 'India', 'l', 745, 14, 126, 21, 9, 35, 345, 'vegan', [['Rice', 140, 24], ['Pumpkin', 170, 24], ['Coconut', 24, 10], ['Oil', 11, 9]]),
      R('Aloo Capsicum Rice (Full Plate)', 'India', 'l', 738, 14, 136, 15, 6, 35, 354, 'vegan', [['Rice', 140, 24], ['Potato', 120, 13], ['Capsicum', 80, 16], ['Oil', 14, 12]]),
      R('Veg Fried Rice (Full Plate)', 'China', 'l', 728, 13, 130, 18, 5, 35, 281, 'vegan', [['Rice', 155, 26], ['Vegetables', 110, 19], ['Oil', 16, 14]]),
      R('Hakka Noodles (Full Plate)', 'China', 'l', 716, 20, 118, 18, 8, 35, 285, 'vegan', [['Noodles', 150, 35], ['Vegetables', 120, 20], ['Oil', 15, 15]]),
      R('Penne Pomodoro (Full Plate)', 'Italy', 'l', 737, 21, 122, 19, 7, 35, 345, 'vegan', [['Pasta', 160, 39], ['Tomato sauce', 170, 29], ['Oil', 15, 13]]),
      R('Mexican Rice Bowl (Full)', 'Mexico', 'l', 759, 14, 138, 17, 6, 35, 319, 'vegan', [['Rice', 145, 25], ['Corn', 90, 15], ['Capsicum', 70, 14], ['Oil', 14, 12]]),
      R('Thai Fruit & Veg Rice', 'Thailand', 'l', 711, 12, 130, 16, 6, 35, 319, 'vegan', [['Rice', 145, 25], ['Mixed fruit', 80, 14], ['Vegetables', 80, 14], ['Oil', 14, 12]]),
      R('Roasted Veg Couscous (Large)', 'Lebanon', 'l', 709, 20, 116, 18, 8, 35, 305, 'vegan', [['Couscous', 145, 36], ['Vegetables', 145, 25], ['Oil', 15, 15]]),
      R('Aloo Gobi with 3 Phulkas', 'India', 'l', 719, 19, 121, 18, 16, 35, 425, 'vegan', [['Wheat flour', 120, 20], ['Potato', 150, 16], ['Vegetables', 140, 24], ['Oil', 15, 14]]),
      R('Ghee Rice with Lauki Curry (Full)', 'India', 'l', 705, 13, 126, 17, 6, 35, 316, 'veg', [['Rice', 145, 25], ['Bottle gourd', 150, 20], ['Ghee', 15, 15], ['Spices', 6, 5]]),
      R('Capsicum Corn Rice (Full)', 'India', 'l', 730, 14, 132, 17, 6, 35, 304, 'vegan', [['Rice', 140, 24], ['Corn', 80, 14], ['Capsicum', 70, 14], ['Oil', 14, 12]]),
      R('Sweet Potato Coconut Curry & Rice (Full)', 'India', 'l', 755, 13, 134, 18, 7, 35, 317, 'vegan', [['Rice', 135, 23], ['Sweet potato', 150, 20], ['Coconut', 22, 9], ['Oil', 10, 9]]),
      R('Vegetable Paella (Full Plate)', 'Continental', 'l', 719, 13, 127, 18, 5, 35, 292, 'vegan', [['Rice', 150, 25], ['Vegetables', 120, 21], ['Oil', 16, 14], ['Spices', 6, 5]]),
      R('Jain Pulao Feast', 'India', 'l', 732, 14, 131, 17, 6, 35, 330, 'jain', [['Rice', 155, 26], ['Capsicum', 80, 16], ['Cabbage', 80, 12], ['Oil', 15, 13]]),
      R('Tomato Rice (Full Plate)', 'India', 'd', 692, 12, 123, 17, 4, 35, 315, 'vegan', [['Rice', 150, 26], ['Tomato', 140, 22], ['Oil', 15, 13], ['Spices', 10, 6]]),
      R('Vegetable Khichdi (Hearty)', 'India', 'd', 707, 13, 127, 17, 5, 35, 285, 'jain', [['Rice', 150, 25], ['Vegetables', 115, 20], ['Ghee', 15, 14], ['Spices', 5, 5]]),
      R('Aloo Tamatar with 3 Phulkas', 'India', 'd', 703, 18, 118, 18, 14, 35, 420, 'vegan', [['Wheat flour', 120, 20], ['Potato', 175, 19], ['Tomato', 110, 17], ['Oil', 15, 12]]),
      R('Veg Chow Mein (Full Plate)', 'China', 'd', 663, 19, 106, 18, 8, 35, 290, 'vegan', [['Noodles', 135, 32], ['Cabbage', 80, 12], ['Carrot', 60, 10], ['Oil', 15, 13]]),
      R('Aglio e Olio (Full Plate)', 'Italy', 'd', 663, 16, 98, 23, 4, 35, 163, 'vegan', [['Pasta', 135, 33], ['Oil', 20, 18], ['Spices', 8, 6]]),
      R('Vegetable Stew with 2 Appams', 'India', 'd', 686, 15, 126, 13, 10, 35, 475, 'vegan', [['Idli batter', 285, 42], ['Vegetables', 155, 27], ['Coconut', 35, 14]]),
      R('Cabbage Poriyal Rice (Full)', 'India', 'd', 688, 14, 118, 18, 7, 35, 307, 'vegan', [['Rice', 140, 24], ['Cabbage', 140, 21], ['Coconut', 16, 6], ['Oil', 11, 9]]),
      R('Turai Sabzi with Ghee Phulkas', 'India', 'd', 676, 18, 109, 18, 16, 35, 370, 'veg', [['Wheat flour', 130, 22], ['Bottle gourd', 215, 29], ['Ghee', 15, 17], ['Spices', 10, 7]]),
      R('Tomato Risotto (Full Plate)', 'Italy', 'd', 699, 13, 131, 14, 4, 35, 335, 'veg', [['Rice', 160, 27], ['Tomato sauce', 160, 26], ['Butter', 15, 15]]),
      R('Pad-Style Rice Noodles with Veg', 'Thailand', 'd', 681, 19, 110, 18, 7, 35, 275, 'vegan', [['Noodles', 140, 33], ['Vegetables', 120, 21], ['Oil', 15, 14]]),
      R('Pumpkin Sabzi & Ghee Rice (Full)', 'India', 'd', 666, 13, 119, 16, 6, 35, 315, 'veg', [['Rice', 135, 23], ['Pumpkin', 160, 22], ['Ghee', 14, 14], ['Spices', 6, 5]]),
      R('Ratatouille with Garlic Bread', 'Continental', 'd', 691, 18, 95, 26, 15, 35, 595, 'vegan', [['Vegetables', 305, 52], ['Tomato', 140, 22], ['Bread', 130, 32], ['Oil', 20, 17]]),
      R('Corn Capsicum Rice (Full)', 'India', 'd', 706, 14, 130, 15, 6, 35, 307, 'vegan', [['Rice', 135, 23], ['Corn', 90, 15], ['Capsicum', 70, 14], ['Oil', 12, 10]]),
      R('Veg Khow Suey (Hearty)', 'Thailand', 'd', 699, 18, 105, 23, 8, 35, 270, 'vegan', [['Noodles', 135, 32], ['Coconut', 30, 11], ['Tomato', 95, 15], ['Oil', 10, 10]]),
      R('Sweet Potato Dinner Platter', 'India', 'd', 676, 12, 110, 21, 8, 35, 420, 'vegan', [['Sweet potato', 320, 43], ['Poha', 70, 14], ['Oil', 20, 18], ['Spices', 10, 8]]),
      R('Fruit Chaat Grande', 'India', 's', 309, 3, 72, 1, 10, 15, 415, 'vegan', [['Mixed fruit', 380, 67], ['Honey', 20, 9], ['Lemon', 15, 3]]),
      R('Sweet Potato Wedges (Big Bowl)', 'India', 's', 289, 5, 44, 10, 5, 15, 270, 'vegan', [['Sweet potato', 255, 34], ['Oil', 10, 10], ['Spices', 5, 5]]),
      R('Corn Butter Cup (Large)', 'India', 's', 298, 7, 42, 11, 5, 15, 218, 'veg', [['Corn', 200, 34], ['Butter', 10, 10], ['Lemon', 8, 2]]),
      R('Banana Date Bowl', 'India', 's', 385, 8, 73, 7, 6, 15, 360, 'veg', [['Banana', 140, 16], ['Milk', 180, 14], ['Dates', 30, 12], ['Honey', 10, 5]]),
      R('Murmura Bhel (Big)', 'India', 's', 306, 6, 69, 0, 3, 15, 218, 'vegan', [['Murmura', 60, 12], ['Onion', 40, 6], ['Tomato', 50, 8], ['Potato', 60, 7], ['Lemon', 8, 2]]),
      R('Sago Fruit Pudding (Large)', 'India', 's', 424, 6, 87, 6, 3, 15, 334, 'veg', [['Sago', 60, 13], ['Milk', 160, 12], ['Mixed fruit', 100, 18], ['Sugar', 14, 6]]),
      R('Suji Ladoo Plate (3 pc)', 'India', 's', 445, 6, 67, 17, 5, 15, 101, 'veg', [['Semolina', 60, 12], ['Sugar', 26, 10], ['Ghee', 15, 15]]),
      R('Honey Toast Plate', 'Continental', 's', 383, 8, 62, 12, 3, 15, 115, 'veg', [['Bread', 85, 21], ['Honey', 20, 10], ['Butter', 10, 10]]),
      R('Mango Coconut Cup (Large)', 'India', 's', 306, 2, 58, 7, 7, 15, 310, 'vegan', [['Mango', 280, 51], ['Coconut', 20, 8], ['Honey', 10, 5]]),
      R('Baked Potato Chaat Bowl', 'India', 's', 306, 10, 60, 3, 7, 15, 430, 'vegan', [['Potato', 315, 35], ['Curd', 80, 13], ['Tamarind', 25, 6], ['Spices', 10, 8]]),
    ];

    // "LowProtein 300 (new)" — 150 high-calorie low-protein mains + 150 snack
    // soups, numbered Recipe No 11223–11522 in order (old→new mapping).
    const lowProtein300 = withRecipeNos(11223, [
      // ───────── High-calorie low-protein library (150 recipes) — salads,
      // rice/grain bowls, pasta, wraps, potato & breakfast dishes engineered
      // to add calories/carbs/fibre with protein held to 5–8 g (ingredient-
      // derived, matches the QA audit). Complements high-protein meals. ─────────
      R('Garden Caesar Salad with Chicken Crumble', 'Italy', 'l', 359, 7.6, 36.3, 20.4, 5.9, 20, 291, 'nonveg', [['Lettuce', 50, 2], ['Tomato', 60, 2], ['Sourdough croutons', 14, 2], ['Potato', 63, 5], ['Parmesan cheese', 4, 2], ['Chicken', 4, 2], ['Olive oil', 18, 4], ['Lemon', 8, 2], ['Herbs', 6, 2], ['Sweet potato', 64, 5]], ['Cook the Potato until just tender, then cool.', 'Chop the Lettuce and Tomato into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Mediterranean Chopped Salad', 'Greece', 'l', 355, 6.5, 37.5, 19.9, 8.2, 20, 397, 'veg', [['Cucumber', 79, 3], ['Tomato', 90, 4], ['Onion', 30, 2], ['Bell pepper', 70, 3], ['Sweet potato', 90, 7], ['Feta cheese', 4, 2], ['Olive oil', 18, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Cucumber, Tomato and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Classic Greek Village Salad Bowl', 'Greece', 'l', 355, 6.5, 35.2, 20.9, 7, 20, 395, 'veg', [['Cucumber', 80, 3], ['Tomato', 110, 4], ['Onion', 30, 2], ['Bell pepper', 60, 2], ['Potato', 72, 6], ['Feta cheese', 4, 2], ['Olive oil', 19, 4], ['Lemon', 10, 2], ['Herbs', 6, 2], ['Sago', 4, 2]], ['Cook the Potato and Sago until just tender, then cool.', 'Chop the Cucumber, Tomato and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Lemon Chickpea Garden Salad', 'Lebanon', 'l', 360, 6.6, 43.2, 17.9, 8.5, 20, 360, 'vegan', [['Chickpea', 8, 2], ['Cucumber', 90, 4], ['Tomato', 80, 3], ['Onion', 25, 2], ['Sweet potato', 124, 10], ['Olive oil', 17, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Cucumber, Tomato and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Herbed Couscous Salad', 'Morocco', 'l', 367, 6.7, 46.4, 17.2, 8.9, 20, 369, 'vegan', [['Couscous', 15, 2], ['Cucumber', 80, 3], ['Tomato', 80, 3], ['Bell pepper', 60, 2], ['Sweet potato', 102, 8], ['Olive oil', 16, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato and Couscous until just tender, then cool.', 'Chop the Cucumber, Tomato and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Sundried Tomato Pasta Salad', 'Italy', 'l', 383, 6.7, 42.1, 20.9, 6.1, 20, 342, 'veg', [['Pasta', 16, 2], ['Tomato', 90, 4], ['Bell pepper', 70, 3], ['Onion', 25, 2], ['Potato', 107, 9], ['Olive oil', 20, 4], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Cook the Potato and Pasta until just tender, then cool.', 'Chop the Tomato, Bell pepper and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Dill Potato Salad', 'Germany', 'l', 342, 6.7, 44, 15.5, 6.2, 20, 348, 'veg', [['Potato', 200, 16], ['Onion', 30, 2], ['Cucumber', 60, 2], ['Olive oil', 14, 3], ['Yogurt', 30, 2], ['Dill herbs', 6, 2], ['Lemon', 8, 2]], ['Cook the Potato until just tender, then cool.', 'Chop the Onion and Cucumber into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Dill herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Roasted Sweet Potato Salad', 'USA', 'l', 360, 6.7, 54.4, 12.8, 9, 20, 399, 'vegan', [['Sweet potato', 211, 17], ['Bell pepper', 70, 3], ['Onion', 30, 2], ['Lettuce', 60, 2], ['Olive oil', 12, 3], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Bell pepper, Onion and Lettuce into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Quinoa Rainbow Vegetable Salad', 'Peru', 'l', 374, 6.7, 43.1, 19.4, 8.6, 20, 368, 'vegan', [['Quinoa', 10, 2], ['Bell pepper', 70, 3], ['Cucumber', 80, 3], ['Tomato', 70, 3], ['Sweet potato', 104, 8], ['Olive oil', 18, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato and Quinoa until just tender, then cool.', 'Chop the Bell pepper, Cucumber and Tomato into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Roasted Vegetable Medley Salad', 'Italy', 'l', 362, 6.6, 34.9, 21.8, 6.7, 20, 336, 'vegan', [['Zucchini', 86, 3], ['Bell pepper', 86, 3], ['Eggplant', 10, 2], ['Onion', 40, 2], ['Potato', 76, 6], ['Olive oil', 20, 4], ['Lemon', 8, 2], ['Herbs', 6, 2], ['Sago', 4, 2]], ['Cook the Potato and Sago until just tender, then cool.', 'Chop the Zucchini, Bell pepper and Eggplant into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Sweet Corn & Pepper Salad', 'Mexico', 'l', 330, 6.8, 42.6, 14.7, 6.8, 20, 358, 'vegan', [['Sweetcorn', 74, 6], ['Bell pepper', 70, 3], ['Tomato', 70, 3], ['Onion', 25, 2], ['Potato', 90, 7], ['Olive oil', 13, 3], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Potato until just tender, then cool.', 'Chop the Sweetcorn, Bell pepper and Tomato into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Avocado Garden Salad', 'Mexico', 'l', 361, 6.7, 38, 20.2, 9, 20, 402, 'vegan', [['Avocado', 76, 6], ['Lettuce', 59, 2], ['Tomato', 80, 3], ['Cucumber', 70, 3], ['Sweet potato', 93, 7], ['Olive oil', 8, 2], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Lettuce, Tomato and Cucumber into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Beetroot & Orange Salad', 'France', 'l', 342, 6.7, 49.4, 13.1, 8.6, 20, 433, 'vegan', [['Beetroot', 132, 5], ['Orange fruit', 80, 3], ['Lettuce', 60, 2], ['Onion', 25, 2], ['Sweet potato', 110, 9], ['Olive oil', 12, 3], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Beetroot, Lettuce and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Kale & Apple Crunch Salad', 'USA', 'l', 324, 5.4, 46.8, 12.8, 8.1, 20, 358, 'vegan', [['Kale', 80, 3], ['Apple', 90, 4], ['Sweet potato', 140, 11], ['Onion', 20, 2], ['Olive oil', 12, 3], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Kale and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Cucumber Dill Yogurt Salad', 'Greece', 'l', 321, 7, 35.9, 16.6, 6, 20, 344, 'veg', [['Cucumber', 116, 5], ['Yogurt', 60, 5], ['Potato', 104, 8], ['Onion', 20, 2], ['Olive oil', 14, 3], ['Dill herbs', 6, 2], ['Lemon', 8, 2], ['Sweet potato', 16, 2]], ['Cook the Potato until just tender, then cool.', 'Chop the Cucumber and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Dill herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Rainbow Coleslaw Bowl', 'USA', 'l', 328, 6.7, 35, 17.9, 7.4, 20, 351, 'vegan', [['Cabbage', 96, 4], ['Carrot', 80, 3], ['Onion', 25, 2], ['Potato', 118, 9], ['Olive oil', 17, 4], ['Lemon', 8, 2], ['Herbs', 6, 2], ['Sago', 1, 2]], ['Cook the Potato and Sago until just tender, then cool.', 'Chop the Cabbage, Carrot and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Raw Mango Crunch Salad', 'Thailand', 'l', 336, 5.7, 60.2, 8.1, 8.4, 20, 443, 'vegan', [['Mango', 150, 12], ['Cucumber', 80, 3], ['Bell pepper', 60, 2], ['Onion', 20, 2], ['Sweet potato', 110, 9], ['Olive oil', 7, 2], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Cucumber, Bell pepper and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Asian Sesame Slaw', 'China', 'l', 341, 6.7, 34.9, 19.4, 8, 20, 307, 'vegan', [['Cabbage', 56, 2], ['Carrot', 77, 3], ['Bell pepper', 60, 2], ['Sesame seeds', 6, 2], ['Potato', 70, 6], ['Olive oil', 16, 4], ['Soy sauce', 8, 2], ['Herbs', 6, 2], ['Sago', 8, 2]], ['Cook the Potato and Sago until just tender, then cool.', 'Chop the Cabbage, Carrot and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Mexican Black Bean Salad', 'Mexico', 'l', 362, 6.6, 42.5, 18.4, 7.5, 20, 326, 'vegan', [['Black bean', 6, 2], ['Sweetcorn', 46, 4], ['Tomato', 80, 3], ['Bell pepper', 60, 2], ['Sweet potato', 101, 8], ['Olive oil', 17, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Sweetcorn, Tomato and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Israeli Chopped Salad', 'Israel', 'l', 341, 6.7, 43, 15.8, 8, 20, 439, 'vegan', [['Cucumber', 120, 5], ['Tomato', 110, 4], ['Onion', 30, 2], ['Potato', 148, 12], ['Olive oil', 15, 3], ['Lemon', 10, 2], ['Parsley herbs', 6, 2]], ['Cook the Potato until just tender, then cool.', 'Chop the Cucumber, Tomato and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Parsley herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Farmhouse Barley Salad', 'UK', 'l', 357, 6.6, 46.3, 16.2, 8.9, 20, 366, 'vegan', [['Barley', 15, 2], ['Cucumber', 80, 3], ['Tomato', 80, 3], ['Bell pepper', 60, 2], ['Sweet potato', 102, 8], ['Olive oil', 15, 3], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato and Barley until just tender, then cool.', 'Chop the Cucumber, Tomato and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Roasted Pumpkin & Rocket Salad', 'Australia', 'l', 337, 6.7, 35, 18.9, 7.9, 20, 368, 'vegan', [['Pumpkin', 160, 6], ['Lettuce', 60, 2], ['Onion', 25, 2], ['Potato', 90, 7], ['Olive oil', 18, 4], ['Lemon', 8, 2], ['Herbs', 6, 2], ['Sago', 1, 2]], ['Cook the Potato and Sago until just tender, then cool.', 'Chop the Pumpkin, Lettuce and Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Lemon Herb Rice Bowl', 'India', 'l', 430, 7.1, 57.7, 19, 6, 20, 289, 'vegan', [['Basmati rice', 47, 7], ['Mixed vegetable', 150, 6], ['Onion', 30, 2], ['Olive oil', 18, 4], ['Lemon', 12, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 24, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Mixed vegetable and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Lemon.']),
      R('Garden Vegetable Pilaf', 'India', 'l', 447, 7.2, 61.7, 19, 6, 20, 280, 'vegan', [['Basmati rice', 52, 7], ['Carrot', 80, 3], ['Peas', 60, 2], ['Onion', 30, 2], ['Olive oil', 18, 4], ['Garam masala', 8, 2], ['Sweet potato', 32, 3]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Garam masala.', 'Add the Carrot, Peas and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Buttered Corn Rice Bowl', 'Mexico', 'l', 433, 7.5, 62.9, 16.8, 6.1, 20, 274, 'veg', [['Basmati rice', 36, 5], ['Sweetcorn', 76, 6], ['Bell pepper', 60, 2], ['Onion', 25, 2], ['Olive oil', 15, 3], ['Herbs', 6, 2], ['Sweet potato', 56, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Sweetcorn, Bell pepper and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Mexican Tomato Rice', 'Mexico', 'l', 435, 7.5, 62.4, 17.3, 6.1, 20, 347, 'vegan', [['Basmati rice', 48, 7], ['Tomato', 110, 4], ['Bell pepper', 60, 2], ['Onion', 30, 2], ['Olive oil', 15, 3], ['Salsa', 30, 2], ['Herbs', 6, 2], ['Sweet potato', 48, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Tomato, Bell pepper and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('South Indian Tomato Rice', 'India', 'l', 429, 7.7, 77, 10, 5.2, 20, 312, 'vegan', [['Basmati rice', 71, 10], ['Tomato', 120, 5], ['Onion', 30, 2], ['Olive oil', 9, 2], ['Curry leaves spice', 8, 2], ['Tamarind', 10, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Tomato and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Tamarind.']),
      R('Coconut Vegetable Rice', 'India', 'l', 439, 6.7, 54.6, 21.5, 6, 20, 228, 'vegan', [['Basmati rice', 51, 7], ['Coconut', 20, 3], ['Mixed vegetable', 110, 4], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Curry leaves spice', 8, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Mixed vegetable and Onion and sauté until tender.', 'Fold in the cooked basmati rice and coconut, season, and finish with fresh herbs.']),
      R('Mediterranean Herbed Rice', 'Greece', 'l', 434, 7.7, 69.4, 14, 6.1, 20, 328, 'vegan', [['Basmati rice', 58, 8], ['Zucchini', 80, 3], ['Tomato', 80, 3], ['Onion', 25, 2], ['Olive oil', 13, 3], ['Olive herbs', 6, 2], ['Lemon', 10, 2], ['Sweet potato', 56, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Olive herbs.', 'Add the Zucchini, Tomato and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Lemon.']),
      R('Mushroom Pepper Rice', 'China', 'l', 430, 7.8, 52.8, 20.8, 5.3, 20, 301, 'vegan', [['Basmati rice', 38, 5], ['Mushroom', 86, 3], ['Bell pepper', 60, 2], ['Onion', 25, 2], ['Olive oil', 20, 4], ['Soy sauce', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Mushroom, Bell pepper and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Vegetable Fried Rice Bowl', 'China', 'l', 427, 7.1, 47.8, 23, 6.1, 20, 284, 'vegan', [['Basmati rice', 38, 5], ['Carrot', 70, 3], ['Cabbage', 70, 3], ['Peas', 50, 2], ['Olive oil', 22, 5], ['Soy sauce', 10, 2], ['Sweet potato', 24, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the spices.', 'Add the Carrot, Cabbage and Peas and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Spanish Vegetable Rice', 'Spain', 'l', 439, 7.3, 59.5, 19.1, 6.1, 20, 316, 'vegan', [['Basmati rice', 50, 7], ['Bell pepper', 80, 3], ['Tomato', 80, 3], ['Peas', 50, 2], ['Olive oil', 18, 4], ['Herbs', 6, 2], ['Sweet potato', 32, 3]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Bell pepper and Herbs.', 'Add the Bell pepper, Tomato and Peas and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Jeera Aloo Rice Bowl', 'India', 'l', 442, 7.7, 78.4, 10.8, 5.8, 20, 281, 'vegan', [['Basmati rice', 54, 8], ['Potato', 120, 10], ['Onion', 25, 2], ['Olive oil', 10, 2], ['Cumin spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Cumin spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Tamarind Rice Bowl', 'India', 'l', 429, 7.6, 55.8, 19.5, 4.2, 20, 184, 'vegan', [['Basmati rice', 48, 7], ['Tamarind', 15, 2], ['Peanut', 10, 2], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Tamarind.']),
      R('Pumpkin Coconut Rice', 'Thailand', 'l', 442, 6.8, 57.2, 20.7, 6.1, 20, 245, 'vegan', [['Basmati rice', 52, 7], ['Pumpkin', 120, 5], ['Coconut', 18, 3], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Lemongrass spice', 8, 2], ['Sweet potato', 8, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Lemongrass spice.', 'Add the Pumpkin and Onion and sauté until tender.', 'Fold in the cooked basmati rice and coconut, season, and finish with Lemongrass spice.']),
      R('Herbed Peas Pulao', 'India', 'l', 436, 7.8, 74, 12.1, 5.8, 20, 264, 'vegan', [['Basmati rice', 65, 9], ['Peas', 80, 3], ['Onion', 30, 2], ['Olive oil', 11, 2], ['Garam masala', 8, 2], ['Mint herbs', 6, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Garam masala.', 'Add the Peas and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Classic Aglio e Olio', 'Italy', 'l', 418, 7.7, 51.1, 20.3, 5, 20, 193, 'vegan', [['Spaghetti', 44, 6], ['Garlic spice', 12, 2], ['Olive oil', 19, 4], ['Parsley herbs', 6, 2], ['Bell pepper', 40, 2], ['Sweet potato', 72, 6]], ['Heat the olive oil and sauté the Garlic spice and Parsley herbs until soft.', 'Add the Bell pepper and cook until tender.', 'Add the sweet potato and cook through.', 'Season to taste, finish with fresh herbs, and serve.']),
      R('Tomato Arrabbiata Penne', 'Italy', 'l', 422, 7.7, 49.8, 21.3, 6.2, 20, 306, 'vegan', [['Penne pasta', 36, 5], ['Tomato sauce', 120, 5], ['Bell pepper', 50, 2], ['Olive oil', 20, 4], ['Garlic spice', 8, 2], ['Sweet potato', 72, 6]], ['Boil the penne pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Bell pepper and Garlic spice for a minute.', 'Add the Tomato sauce and Bell pepper and cook 3–4 minutes.', 'Toss the penne pasta through the sauce, season, and serve.']),
      R('Basil Pesto Fusilli', 'Italy', 'l', 433, 7.7, 49.5, 22.7, 4.6, 20, 227, 'veg', [['Pasta', 42, 6], ['Pesto', 35, 3], ['Tomato', 60, 2], ['Olive oil', 20, 4], ['Basil herbs', 6, 2], ['Sweet potato', 64, 5]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Basil herbs for a minute.', 'Add the Tomato and cook 3–4 minutes.', 'Toss the pasta through the sauce, season, and serve.']),
      R('Garden Vegetable Pasta', 'Italy', 'l', 413, 7.1, 39.5, 25.2, 6.1, 20, 292, 'vegan', [['Pasta', 28, 4], ['Zucchini', 70, 3], ['Bell pepper', 70, 3], ['Tomato', 70, 3], ['Olive oil', 24, 5], ['Herbs', 6, 2], ['Sweet potato', 24, 2]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Bell pepper and Herbs for a minute.', 'Add the Zucchini, Bell pepper and Tomato and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Mediterranean Olive Pasta', 'Greece', 'l', 434, 7.7, 50.6, 22.3, 6, 20, 289, 'vegan', [['Pasta', 38, 5], ['Tomato', 80, 3], ['Onion', 30, 2], ['Bell pepper', 50, 2], ['Olive oil', 21, 5], ['Oregano herbs', 6, 2], ['Sweet potato', 64, 5]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Onion and Bell pepper for a minute.', 'Add the Tomato, Onion and Bell pepper and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Primavera Pasta', 'Italy', 'l', 415, 7.1, 39.9, 25.2, 6, 20, 253, 'vegan', [['Pasta', 29, 4], ['Carrot', 60, 2], ['Peas', 50, 2], ['Zucchini', 60, 2], ['Olive oil', 24, 5], ['Herbs', 6, 2], ['Sweet potato', 24, 2]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Herbs for a minute.', 'Add the Carrot, Peas and Zucchini and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Roasted Red Pepper Pasta', 'Italy', 'l', 415, 7.1, 42.2, 24.2, 6, 20, 288, 'vegan', [['Pasta', 30, 4], ['Bell pepper', 110, 4], ['Tomato', 60, 2], ['Onion', 25, 2], ['Olive oil', 23, 5], ['Garlic spice', 8, 2], ['Sweet potato', 32, 3]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Bell pepper and Onion for a minute.', 'Add the Bell pepper, Tomato and Onion and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Tomato Basil Linguine', 'Italy', 'l', 422, 7.7, 52, 20.3, 5.4, 20, 276, 'vegan', [['Linguine pasta', 42, 6], ['Tomato', 110, 4], ['Onion', 25, 2], ['Olive oil', 19, 4], ['Basil herbs', 8, 2], ['Sweet potato', 72, 6]], ['Boil the linguine pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Onion and Basil herbs for a minute.', 'Add the Tomato and Onion and cook 3–4 minutes.', 'Toss the linguine pasta through the pan, season, and serve.']),
      R('Wild Mushroom Linguine', 'Italy', 'l', 410, 7.7, 38.5, 25, 4.6, 20, 258, 'vegan', [['Linguine pasta', 24, 3], ['Mushroom', 100, 4], ['Onion', 30, 2], ['Olive oil', 24, 5], ['Garlic spice', 8, 2], ['Sweet potato', 72, 6]], ['Boil the linguine pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Onion and Garlic spice for a minute.', 'Add the Mushroom and Onion and cook 3–4 minutes.', 'Toss the linguine pasta through the pan, season, and serve.']),
      R('Spinach & Garlic Pasta', 'Italy', 'l', 418, 7.8, 44.5, 23.2, 6, 20, 249, 'vegan', [['Pasta', 32, 4], ['Spinach', 90, 4], ['Onion', 25, 2], ['Olive oil', 22, 5], ['Garlic spice', 8, 2], ['Sweet potato', 72, 6]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Onion and Garlic spice for a minute.', 'Add the Spinach and Onion and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Lemon Herb Pasta', 'Italy', 'l', 422, 7.7, 50.2, 21.2, 5.2, 20, 216, 'vegan', [['Pasta', 42, 6], ['Zucchini', 70, 3], ['Olive oil', 20, 4], ['Lemon', 12, 2], ['Parsley herbs', 8, 2], ['Sweet potato', 64, 5]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Parsley herbs for a minute.', 'Add the Zucchini and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Puttanesca-Style Pasta', 'Italy', 'l', 410, 7.7, 49.2, 20.3, 5.7, 20, 280, 'vegan', [['Pasta', 39, 5], ['Tomato sauce', 110, 4], ['Bell pepper', 40, 2], ['Olive oil', 19, 4], ['Garlic spice', 8, 2], ['Sweet potato', 64, 5]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Bell pepper and Garlic spice for a minute.', 'Add the Tomato sauce and Bell pepper and cook 3–4 minutes.', 'Toss the pasta through the sauce, season, and serve.']),
      R('Roasted Tomato Rigatoni', 'Italy', 'l', 418, 7.7, 51, 20.3, 5.3, 20, 281, 'vegan', [['Pasta', 42, 6], ['Tomato', 120, 5], ['Onion', 30, 2], ['Olive oil', 19, 4], ['Herbs', 6, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the pasta until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Tomato and Onion and sauté until tender.', 'Fold in the cooked pasta, season, and finish with fresh herbs.']),
      R('Pepper & Corn Pasta', 'Italy', 'l', 417, 7.5, 49.5, 21, 6, 20, 244, 'vegan', [['Pasta', 22, 3], ['Sweetcorn', 81, 6], ['Bell pepper', 60, 2], ['Olive oil', 19, 4], ['Herbs', 6, 2], ['Sweet potato', 56, 4]], ['Boil the pasta in salted water until al dente, then drain.', 'Heat the olive oil and sauté the Bell pepper and Herbs for a minute.', 'Add the Sweetcorn and Bell pepper and cook 3–4 minutes.', 'Toss the pasta through the pan, season, and serve.']),
      R('Garden Veg Club Sandwich', 'USA', 'l', 401, 6.8, 38.1, 24.6, 6.2, 20, 302, 'vegan', [['Bread', 25, 4], ['Tomato', 60, 2], ['Cucumber', 50, 2], ['Lettuce', 40, 2], ['Potato', 90, 7], ['Olive oil', 23, 5], ['Herbs', 6, 2], ['Sweet potato', 8, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Tomato, Cucumber and Lettuce, and the Herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Mediterranean Veg Wrap', 'Lebanon', 'l', 413, 6.6, 43.4, 23.7, 7.3, 20, 306, 'vegan', [['Tortilla', 28, 4], ['Bell pepper', 60, 2], ['Cucumber', 50, 2], ['Tomato', 50, 2], ['Sweet potato', 90, 7], ['Olive oil', 22, 5], ['Herbs', 6, 2]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Bell pepper, Cucumber and Tomato, and the Bell pepper and Herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Roasted Hummus Wrap', 'Lebanon', 'l', 405, 6.7, 38.8, 24.8, 7.2, 20, 255, 'vegan', [['Tortilla', 18, 3], ['Hummus', 20, 3], ['Cucumber', 60, 2], ['Bell pepper', 50, 2], ['Sweet potato', 80, 6], ['Olive oil', 21, 5], ['Herbs', 6, 2]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Cucumber and Bell pepper, and the Bell pepper and Herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Baked Falafel Wrap', 'Lebanon', 'l', 402, 7.1, 36.3, 25.4, 6.1, 20, 255, 'vegan', [['Tortilla', 20, 3], ['Falafel', 24, 3], ['Lettuce', 40, 2], ['Tomato', 50, 2], ['Potato', 70, 6], ['Olive oil', 21, 5], ['Herbs', 6, 2], ['Sweet potato', 24, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Lettuce and Tomato, and the Herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Avocado Smash Sandwich', 'USA', 'l', 413, 6.8, 39.7, 25.2, 8.6, 20, 259, 'vegan', [['Bread', 38, 5], ['Avocado', 70, 6], ['Tomato', 50, 2], ['Onion', 20, 2], ['Potato', 60, 5], ['Olive oil', 13, 3], ['Lemon', 8, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Tomato and Onion, and the Onion.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Grilled Vegetable Panini', 'Italy', 'l', 398, 7.6, 35.2, 25.2, 6.1, 20, 252, 'vegan', [['Bread', 24, 3], ['Zucchini', 60, 2], ['Bell pepper', 60, 2], ['Eggplant', 16, 2], ['Olive oil', 22, 5], ['Herbs', 6, 2], ['Sweet potato', 64, 5]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Zucchini, Bell pepper and Eggplant, and the Bell pepper and Herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Caprese Basil Sandwich', 'Italy', 'l', 397, 7.8, 42.3, 21.8, 5.7, 20, 279, 'veg', [['Bread', 24, 3], ['Tomato', 80, 3], ['Mozzarella cheese', 9, 2], ['Potato', 70, 6], ['Olive oil', 18, 4], ['Basil herbs', 6, 2], ['Sweet potato', 72, 6]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Tomato, and the Basil herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Roasted Pepper Wrap', 'Mexico', 'l', 408, 6.7, 44.2, 22.7, 7, 20, 285, 'vegan', [['Tortilla', 30, 4], ['Bell pepper', 100, 4], ['Onion', 30, 2], ['Sweet potato', 80, 6], ['Olive oil', 20, 4], ['Salsa', 25, 2]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Bell pepper and Onion, and the Bell pepper and Onion.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Sweet Corn Salsa Wrap', 'Mexico', 'l', 409, 6.9, 43.1, 23.2, 6, 20, 283, 'vegan', [['Tortilla', 22, 3], ['Sweetcorn', 58, 5], ['Tomato', 50, 2], ['Bell pepper', 50, 2], ['Potato', 60, 5], ['Olive oil', 21, 5], ['Herbs', 6, 2], ['Sweet potato', 16, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Sweetcorn, Tomato and Bell pepper, and the Bell pepper and Herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Spinach & Potato Wrap', 'India', 'l', 413, 6.9, 39, 25.5, 6.2, 20, 282, 'vegan', [['Tortilla', 22, 3], ['Spinach', 80, 3], ['Potato', 107, 9], ['Onion', 25, 2], ['Olive oil', 24, 5], ['Cumin spice', 8, 2], ['Sweet potato', 16, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Spinach and Onion, and the Onion and Cumin spice.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Mint Chutney Veg Wrap', 'India', 'l', 407, 6.7, 39.2, 24.8, 6.1, 20, 271, 'vegan', [['Tortilla', 30, 4], ['Mixed vegetable', 110, 4], ['Onion', 30, 2], ['Potato', 70, 6], ['Olive oil', 23, 5], ['Mint herbs', 8, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Mixed vegetable and Onion, and the Onion and Mint herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Mushroom Melt Sandwich', 'USA', 'l', 402, 7.8, 44, 21.6, 5.9, 20, 294, 'veg', [['Bread', 27, 4], ['Mushroom', 77, 3], ['Onion', 30, 2], ['Potato', 70, 6], ['Olive oil', 20, 4], ['Herbs', 6, 2], ['Sweet potato', 64, 5]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Mushroom and Onion, and the Onion and Herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Cucumber Herb Tea Sandwich', 'UK', 'l', 399, 7.3, 44.3, 21.4, 6.1, 20, 279, 'veg', [['Bread', 29, 4], ['Cucumber', 80, 3], ['Yogurt', 25, 2], ['Potato', 80, 6], ['Olive oil', 19, 4], ['Dill herbs', 6, 2], ['Sweet potato', 40, 3]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Cucumber, and the Dill herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Roasted Eggplant Wrap', 'Turkey', 'l', 414, 7.6, 43.2, 23.4, 6, 20, 271, 'vegan', [['Tortilla', 26, 4], ['Eggplant', 18, 2], ['Tomato', 50, 2], ['Onion', 25, 2], ['Sweet potato', 126, 10], ['Olive oil', 20, 4], ['Herbs', 6, 2]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Eggplant, Tomato and Onion, and the Onion and Herbs.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Herb Roasted Potatoes', 'USA', 'l', 384, 6, 48.3, 18.5, 6.1, 20, 322, 'vegan', [['Potato', 260, 21], ['Onion', 30, 2], ['Olive oil', 18, 4], ['Rosemary herbs', 6, 2], ['Garlic spice', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Rosemary herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Garlic Butter Potatoes', 'France', 'l', 377, 5.9, 47.8, 18, 6.1, 20, 316, 'veg', [['Potato', 250, 20], ['Onion', 25, 2], ['Olive oil', 11, 2], ['Butter', 8, 2], ['Garlic spice', 8, 2], ['Parsley herbs', 6, 2], ['Sweet potato', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Garlic spice.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Crispy Potato Wedges', 'USA', 'l', 384, 6.2, 48.2, 18.5, 6.4, 20, 326, 'vegan', [['Potato', 260, 21], ['Olive oil', 18, 4], ['Bell pepper', 40, 2], ['Paprika spice', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Bell pepper and Paprika spice.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Sweet Potato Mash', 'USA', 'l', 359, 5.6, 58.5, 11.4, 8.3, 20, 315, 'vegan', [['Sweet potato', 260, 21], ['Olive oil', 3, 2], ['Coconut milk', 40, 3], ['Herbs', 6, 2], ['Basmati rice', 6, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Herbs.', 'Fold in the cooked basmati rice and coconut milk, season, and finish with fresh herbs.']),
      R('Baked Sweet Potato Fries', 'USA', 'l', 373, 5.4, 64.2, 10.5, 8.5, 20, 300, 'vegan', [['Sweet potato', 270, 22], ['Olive oil', 10, 2], ['Paprika spice', 8, 2], ['Basmati rice', 12, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Paprika spice.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Mediterranean Roasted Potatoes', 'Greece', 'l', 378, 5.9, 47, 18.5, 6.2, 20, 364, 'vegan', [['Potato', 240, 19], ['Tomato', 60, 2], ['Onion', 30, 2], ['Olive oil', 18, 4], ['Oregano herbs', 6, 2], ['Lemon', 10, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Oregano herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Hasselback Potatoes', 'Sweden', 'l', 385, 5.9, 48.8, 18.5, 6.1, 20, 308, 'vegan', [['Potato', 260, 21], ['Olive oil', 18, 4], ['Garlic spice', 8, 2], ['Thyme herbs', 6, 2], ['Sweet potato', 16, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Garlic spice and Thyme herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Herbed Potato Cakes', 'UK', 'l', 382, 6.7, 51.3, 16.7, 6.3, 20, 272, 'vegan', [['Potato', 200, 16], ['Onion', 30, 2], ['Wheat flour', 20, 3], ['Olive oil', 16, 4], ['Herbs', 6, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Rustic Potato Bake', 'France', 'l', 380, 6.4, 47.2, 18.4, 6, 20, 342, 'veg', [['Potato', 240, 19], ['Onion', 30, 2], ['Coconut milk', 50, 4], ['Olive oil', 8, 2], ['Thyme herbs', 6, 2], ['Sweet potato', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Thyme herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Potato & Vegetable Skillet', 'USA', 'l', 382, 6.7, 46.7, 18.7, 7.8, 20, 378, 'vegan', [['Potato', 194, 16], ['Bell pepper', 70, 3], ['Onion', 30, 2], ['Zucchini', 60, 2], ['Olive oil', 18, 4], ['Herbs', 6, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Bell pepper and Onion.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Bombay Masala Potatoes', 'India', 'l', 384, 5.8, 46.2, 19.5, 6.1, 20, 347, 'vegan', [['Potato', 240, 19], ['Onion', 30, 2], ['Tomato', 50, 2], ['Olive oil', 19, 4], ['Garam masala', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Garam masala.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Lemon Pepper Potatoes', 'Italy', 'l', 379, 5.9, 49.4, 17.5, 6.2, 20, 317, 'vegan', [['Potato', 250, 20], ['Olive oil', 17, 4], ['Lemon', 12, 2], ['Black pepper spice', 8, 2], ['Parsley herbs', 6, 2], ['Sweet potato', 24, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Black pepper spice and Parsley herbs.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Smoked Paprika Potato Hash', 'Spain', 'l', 377, 6.4, 48.2, 17.6, 7.1, 20, 355, 'vegan', [['Potato', 230, 18], ['Bell pepper', 70, 3], ['Onion', 30, 2], ['Olive oil', 17, 4], ['Paprika spice', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Bell pepper and Onion.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Curried Potato & Peas', 'India', 'l', 389, 6.2, 44.7, 20.6, 7, 20, 368, 'vegan', [['Potato', 200, 16], ['Peas', 70, 3], ['Onion', 30, 2], ['Tomato', 40, 2], ['Olive oil', 20, 4], ['Curry spice', 8, 2]], ['Cut the potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil, Onion and Curry spice.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Herbed Couscous Bowl', 'Morocco', 'l', 392, 6.7, 54.5, 16.4, 8.3, 20, 266, 'vegan', [['Couscous', 32, 4], ['Sweet potato', 120, 10], ['Bell pepper', 60, 2], ['Onion', 25, 2], ['Olive oil', 15, 3], ['Herbs', 6, 2], ['Lemon', 8, 2]], ['Rinse and cook the couscous until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Bell pepper and Onion and sauté until tender.', 'Fold in the cooked couscous, season, and finish with Lemon.']),
      R('Lemon Bulgur Bowl', 'Turkey', 'l', 392, 6.8, 56.3, 15.5, 8, 20, 271, 'vegan', [['Bulgur', 38, 5], ['Sweet potato', 120, 10], ['Tomato', 60, 2], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Parsley herbs', 6, 2], ['Lemon', 8, 2]], ['Rinse and cook the bulgur until fluffy.', 'Heat the olive oil and temper the Onion and Parsley herbs.', 'Add the Tomato and Onion and sauté until tender.', 'Fold in the cooked bulgur, season, and finish with Lemon.']),
      R('Barley Vegetable Bowl', 'UK', 'l', 390, 6.7, 54, 16.4, 8.3, 20, 258, 'vegan', [['Barley', 32, 4], ['Sweet potato', 120, 10], ['Carrot', 60, 2], ['Onion', 25, 2], ['Olive oil', 15, 3], ['Herbs', 6, 2]], ['Rinse and cook the barley until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Carrot and Onion and sauté until tender.', 'Fold in the cooked barley, season, and finish with fresh herbs.']),
      R('Brown Rice Veg Bowl', 'India', 'l', 422, 6.7, 58.8, 17.8, 6, 20, 260, 'vegan', [['Basmati rice', 42, 6], ['Sweet potato', 100, 8], ['Broccoli', 70, 3], ['Onion', 25, 2], ['Olive oil', 17, 4], ['Herbs', 6, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Broccoli and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Millet Harvest Bowl', 'India', 'l', 390, 6.7, 54, 16.4, 8.3, 20, 258, 'vegan', [['Millet', 32, 4], ['Sweet potato', 120, 10], ['Bell pepper', 60, 2], ['Onion', 25, 2], ['Olive oil', 15, 3], ['Herbs', 6, 2]], ['Rinse and cook the millet until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Bell pepper and Onion and sauté until tender.', 'Fold in the cooked millet, season, and finish with fresh herbs.']),
      R('Quinoa Vegetable Bowl', 'Peru', 'l', 390, 6.6, 40, 22.6, 6.9, 20, 258, 'vegan', [['Quinoa', 18, 3], ['Sweet potato', 110, 9], ['Broccoli', 70, 3], ['Onion', 25, 2], ['Olive oil', 21, 5], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Rinse and cook the quinoa until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Broccoli and Onion and sauté until tender.', 'Fold in the cooked quinoa, season, and finish with Lemon.']),
      R('Farro Garden Bowl', 'Italy', 'l', 389, 6.7, 51.5, 17.4, 8.3, 20, 292, 'vegan', [['Farro', 30, 4], ['Sweet potato', 110, 9], ['Zucchini', 70, 3], ['Tomato', 60, 2], ['Olive oil', 16, 4], ['Herbs', 6, 2]], ['Rinse and cook the farro until fluffy.', 'Heat the olive oil and temper the Herbs.', 'Add the Zucchini and Tomato and sauté until tender.', 'Fold in the cooked farro, season, and finish with fresh herbs.']),
      R('Mediterranean Grain Bowl', 'Greece', 'l', 385, 6.6, 50.6, 17.4, 8.2, 20, 298, 'vegan', [['Bulgur', 28, 4], ['Sweet potato', 110, 9], ['Cucumber', 70, 3], ['Tomato', 60, 2], ['Olive oil', 16, 4], ['Olive herbs', 6, 2], ['Lemon', 8, 2]], ['Rinse and cook the bulgur until fluffy.', 'Heat the olive oil and temper the Olive herbs.', 'Add the Cucumber and Tomato and sauté until tender.', 'Fold in the cooked bulgur, season, and finish with Lemon.']),
      R('Corn & Bean Grain Bowl', 'Mexico', 'l', 404, 6.6, 43.5, 22.6, 6.8, 20, 223, 'vegan', [['Bulgur', 14, 2], ['Sweetcorn', 46, 4], ['Black bean', 6, 2], ['Bell pepper', 50, 2], ['Sweet potato', 80, 6], ['Olive oil', 21, 5], ['Herbs', 6, 2]], ['Rinse and cook the bulgur until fluffy.', 'Heat the olive oil and temper the Bell pepper and Herbs.', 'Add the Sweetcorn and Bell pepper and sauté until tender.', 'Fold in the cooked bulgur, season, and finish with fresh herbs.']),
      R('Roasted Veg Couscous Bowl', 'Morocco', 'l', 393, 6.7, 48, 19.4, 8.5, 20, 280, 'vegan', [['Couscous', 26, 4], ['Zucchini', 70, 3], ['Bell pepper', 70, 3], ['Sweet potato', 90, 7], ['Olive oil', 18, 4], ['Herbs', 6, 2]], ['Rinse and cook the couscous until fluffy.', 'Heat the olive oil and temper the Bell pepper and Herbs.', 'Add the Zucchini and Bell pepper and sauté until tender.', 'Fold in the cooked couscous, season, and finish with fresh herbs.']),
      R('Pumpkin Barley Bowl', 'UK', 'l', 393, 6.6, 38.6, 23.6, 7.1, 20, 237, 'vegan', [['Barley', 34, 5], ['Pumpkin', 150, 6], ['Onion', 25, 2], ['Olive oil', 22, 5], ['Thyme herbs', 6, 2]], ['Rinse and cook the barley until fluffy.', 'Heat the olive oil and temper the Onion and Thyme herbs.', 'Add the Pumpkin and Onion and sauté until tender.', 'Fold in the cooked barley, season, and finish with fresh herbs.']),
      R('Beetroot Grain Bowl', 'France', 'l', 392, 6.6, 48.1, 19.3, 8.5, 20, 293, 'vegan', [['Bulgur', 24, 3], ['Beetroot', 130, 5], ['Sweet potato', 90, 7], ['Onion', 25, 2], ['Olive oil', 18, 4], ['Herbs', 6, 2]], ['Rinse and cook the bulgur until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Beetroot and Onion and sauté until tender.', 'Fold in the cooked bulgur, season, and finish with fresh herbs.']),
      R('Spiced Millet Veg Bowl', 'India', 'l', 394, 6.7, 40.6, 22.7, 6.9, 20, 214, 'vegan', [['Millet', 40, 6], ['Mixed vegetable', 120, 5], ['Onion', 25, 2], ['Olive oil', 21, 5], ['Garam masala', 8, 2]], ['Rinse and cook the millet until fluffy.', 'Heat the olive oil and temper the Onion and Garam masala.', 'Add the Mixed vegetable and Onion and sauté until tender.', 'Fold in the cooked millet, season, and finish with fresh herbs.']),
      R('Mushroom Farro Bowl', 'Italy', 'l', 396, 6.7, 40.2, 23.2, 6, 20, 245, 'vegan', [['Farro', 24, 3], ['Mushroom', 78, 3], ['Sweet potato', 90, 7], ['Onion', 25, 2], ['Olive oil', 22, 5], ['Thyme herbs', 6, 2]], ['Rinse and cook the farro until fluffy.', 'Heat the olive oil and temper the Onion and Thyme herbs.', 'Add the Mushroom and Onion and sauté until tender.', 'Fold in the cooked farro, season, and finish with fresh herbs.']),
      R('Chicken-Crumb Caesar Bowl', 'Italy', 'l', 362, 7.3, 34.8, 21.5, 6.2, 20, 257, 'nonveg', [['Sweet potato', 144, 12], ['Lettuce', 66, 3], ['Chicken', 6, 2], ['Parmesan cheese', 6, 2], ['Olive oil', 19, 4], ['Lemon', 8, 2], ['Herbs', 6, 2], ['Sago', 2, 2]], ['Rinse and cook the sago until fluffy.', 'Heat the olive oil and temper the Herbs.', 'Add the Lettuce and sauté until tender.', 'Fold in the cooked sago, season, and finish with Lemon.']),
      R('Bacon-Speck Potato Salad', 'Germany', 'l', 358, 7.6, 41.3, 18, 5.4, 20, 291, 'nonveg', [['Potato', 141, 11], ['Onion', 30, 2], ['Bacon', 10, 2], ['Olive oil', 15, 3], ['Yogurt', 25, 2], ['Dill herbs', 6, 2], ['Sweet potato', 64, 5]], ['Cook the Potato until just tender, then cool.', 'Chop the Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil and Dill herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Smoked Salmon Potato Salad', 'Norway', 'l', 359, 7.9, 43.7, 17, 5.8, 20, 294, 'pesc', [['Potato', 162, 13], ['Onion', 25, 2], ['Salmon', 14, 2], ['Olive oil', 15, 3], ['Dill herbs', 6, 2], ['Lemon', 8, 2], ['Sweet potato', 64, 5]], ['Cook the Potato until just tender, then cool.', 'Chop the Onion into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Dill herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Tuna-Fleck Pasta Salad', 'Italy', 'l', 385, 7, 39.7, 22, 6.1, 20, 297, 'pesc', [['Pasta', 14, 2], ['Tomato', 80, 3], ['Bell pepper', 60, 2], ['Sweet potato', 106, 8], ['Tuna fish', 8, 2], ['Olive oil', 21, 5], ['Lemon', 8, 2]], ['Cook the Sweet potato and Pasta until just tender, then cool.', 'Chop the Tomato and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil and Lemon.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Chicken Couscous Salad', 'Morocco', 'l', 372, 6.7, 42.9, 19.3, 6.8, 20, 238, 'nonveg', [['Sweet potato', 122, 10], ['Couscous', 18, 3], ['Bell pepper', 60, 2], ['Chicken', 6, 2], ['Olive oil', 18, 4], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato and Couscous until just tender, then cool.', 'Chop the Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Mediterranean Chicken Salad', 'Greece', 'l', 365, 6.7, 39.4, 20.1, 7.3, 20, 331, 'nonveg', [['Sweet potato', 150, 12], ['Cucumber', 70, 3], ['Tomato', 70, 3], ['Chicken', 8, 2], ['Olive oil', 19, 4], ['Oregano herbs', 6, 2], ['Lemon', 8, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Cucumber and Tomato into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Oregano herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Shrimp & Corn Salad', 'Thailand', 'l', 363, 6.7, 40.6, 19.3, 6.3, 20, 266, 'pesc', [['Sweet potato', 118, 9], ['Sweetcorn', 56, 4], ['Bell pepper', 50, 2], ['Shrimp', 8, 2], ['Olive oil', 18, 4], ['Lemon', 10, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Sweetcorn and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Lemon Chicken Rice Salad', 'India', 'l', 395, 7.7, 50.2, 18.2, 5.8, 20, 264, 'nonveg', [['Basmati rice', 32, 4], ['Cucumber', 70, 3], ['Bell pepper', 50, 2], ['Chicken', 7, 2], ['Olive oil', 17, 4], ['Lemon', 10, 2], ['Herbs', 6, 2], ['Sweet potato', 72, 6]], ['Cook the Sweet potato and Basmati rice until just tender, then cool.', 'Chop the Cucumber and Bell pepper into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Turkey-Fleck Cranberry Salad', 'USA', 'l', 358, 6.4, 47.2, 16, 7.4, 20, 258, 'nonveg', [['Sweet potato', 142, 11], ['Lettuce', 60, 2], ['Raisin', 20, 3], ['Chicken', 7, 2], ['Olive oil', 15, 3], ['Lemon', 8, 2], ['Herbs', 6, 2]], ['Cook the Sweet potato until just tender, then cool.', 'Chop the Lettuce into bite-sized pieces.', 'Whisk a dressing from the Olive oil, Lemon and Herbs.', 'Toss everything together until evenly coated.', 'Adjust seasoning and serve fresh.']),
      R('Chicken Caesar Wrap (Light)', 'USA', 'l', 405, 7.4, 38, 24.8, 6, 20, 240, 'nonveg', [['Tortilla', 16, 2], ['Lettuce', 50, 2], ['Sweet potato', 136, 11], ['Chicken', 4, 2], ['Parmesan cheese', 6, 2], ['Olive oil', 22, 5], ['Lemon', 6, 2]], ['Cook and lightly mash or slice the sweet potato.', 'Prep the filling: Lettuce.', 'Warm the tortilla briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Fish-Fleck Mediterranean Bowl', 'Greece', 'l', 364, 6.6, 39.4, 20, 7.2, 20, 327, 'pesc', [['Sweet potato', 154, 12], ['Tomato', 70, 3], ['Cucumber', 60, 2], ['Tilapia fish', 10, 2], ['Olive oil', 19, 4], ['Olive herbs', 6, 2], ['Lemon', 8, 2]], ['Heat the olive oil and sauté the Olive herbs until soft.', 'Add the Tomato and Cucumber and cook until tender.', 'Add the sweet potato and cook through.', 'Season to taste, finish with fresh herbs, and serve.']),
      R('Prawn Fried Rice (Light)', 'China', 'l', 410, 7.6, 43.3, 22.9, 5.6, 20, 262, 'pesc', [['Basmati rice', 28, 4], ['Cabbage', 70, 3], ['Carrot', 60, 2], ['Prawn', 8, 2], ['Olive oil', 22, 5], ['Soy sauce', 10, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the spices.', 'Add the Cabbage and Carrot and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Vegetable Pulao Plate', 'India', 'l', 437, 7.1, 46, 25, 6.1, 20, 253, 'vegan', [['Basmati rice', 29, 4], ['Carrot', 70, 3], ['Peas', 60, 2], ['Beans', 8, 2], ['Onion', 30, 2], ['Olive oil', 24, 5], ['Garam masala', 8, 2], ['Sweet potato', 24, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Garam masala.', 'Add the Carrot, Peas and Beans and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Jeera Rice Bowl', 'India', 'l', 428, 7.2, 79.9, 8.8, 4.4, 20, 205, 'vegan', [['Basmati rice', 76, 11], ['Onion', 25, 2], ['Olive oil', 8, 2], ['Cumin spice', 8, 2], ['Sweet potato', 88, 7]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Cumin spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('South Indian Lemon Rice', 'India', 'l', 436, 7.8, 57.2, 19.5, 4.2, 20, 183, 'vegan', [['Basmati rice', 50, 7], ['Onion', 25, 2], ['Peanut', 10, 2], ['Olive oil', 14, 3], ['Lemon', 12, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Lemon.']),
      R('Tamarind Rice Plate', 'India', 'l', 429, 7.6, 55.8, 19.5, 4.2, 20, 184, 'vegan', [['Basmati rice', 48, 7], ['Tamarind', 15, 2], ['Peanut', 10, 2], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Tamarind.']),
      R('Coconut Rice Plate', 'India', 'l', 442, 7.7, 80, 10.1, 5.7, 20, 199, 'vegan', [['Basmati rice', 78, 11], ['Coconut', 22, 3], ['Onion', 25, 2], ['Olive oil', 2, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice and coconut, season, and finish with fresh herbs.']),
      R('Vegetable Rava Upma', 'India', 'b', 398, 6.8, 41.7, 22.7, 6.9, 15, 211, 'vegan', [['Semolina', 42, 6], ['Carrot', 60, 2], ['Peas', 50, 2], ['Onion', 30, 2], ['Olive oil', 21, 5], ['Curry leaves spice', 8, 2]], ['Rinse and cook the semolina until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Carrot, Peas and Onion and sauté until tender.', 'Fold in the cooked semolina, season, and finish with fresh herbs.']),
      R('Aloo Poha Plate', 'India', 'b', 418, 7.7, 57.5, 17.5, 5.7, 15, 249, 'vegan', [['Poha', 31, 4], ['Potato', 90, 7], ['Onion', 35, 2], ['Peanut', 8, 2], ['Olive oil', 13, 3], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the poha until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked poha, season, and finish with fresh herbs.']),
      R('Vegetable Daliya', 'India', 'b', 392, 7, 34.8, 25, 6.3, 15, 212, 'vegan', [['Daliya', 19, 3], ['Carrot', 60, 2], ['Peas', 50, 2], ['Onion', 25, 2], ['Olive oil', 24, 5], ['Cumin spice', 8, 2], ['Sweet potato', 16, 2], ['Sago', 10, 2]], ['Rinse and cook the sago until fluffy.', 'Heat the olive oil and temper the Onion and Cumin spice.', 'Add the Carrot, Peas and Onion and sauté until tender.', 'Fold in the cooked sago, season, and finish with fresh herbs.']),
      R('Vegetable Khichdi (Low Dal)', 'India', 'l', 425, 7.4, 51.5, 21, 6.1, 20, 227, 'vegan', [['Basmati rice', 33, 5], ['Moong dal', 10, 2], ['Carrot', 60, 2], ['Peas', 40, 2], ['Olive oil', 20, 4], ['Cumin spice', 8, 2], ['Sweet potato', 56, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Cumin spice.', 'Add the Carrot and Peas and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Idli Plate with Vegetables', 'India', 'b', 410, 7.7, 74.6, 9, 5.4, 15, 239, 'vegan', [['Idli batter', 69, 10], ['Carrot', 50, 2], ['Peas', 40, 2], ['Olive oil', 8, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Combine the base with the plant milk.', 'Simmer or warm gently until creamy.', 'Top with the fruit.', 'Sweeten lightly if needed and serve.']),
      R('Vegetable Uttapam Platter', 'India', 'b', 409, 7.7, 76.6, 8, 5.4, 15, 269, 'vegan', [['Dosa batter', 70, 10], ['Onion', 40, 2], ['Tomato', 40, 2], ['Bell pepper', 40, 2], ['Olive oil', 7, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 64, 5]], ['Combine the base with the plant milk.', 'Simmer or warm gently until creamy.', 'Top with the fruit.', 'Sweeten lightly if needed and serve.']),
      R('Bombay Vegetable Sandwich', 'India', 'l', 400, 7, 46.1, 20.8, 6, 20, 275, 'vegan', [['Bread', 34, 5], ['Potato', 110, 9], ['Cucumber', 40, 2], ['Tomato', 40, 2], ['Olive oil', 19, 4], ['Mint herbs', 8, 2], ['Sweet potato', 24, 2]], ['Cook and lightly mash or slice the potato.', 'Prep the filling: Cucumber and Tomato, and the Mint herbs.', 'Warm the bread briefly.', 'Layer the filling, drizzle with the dressing, and roll or press.', 'Slice and serve.']),
      R('Aloo Tikki Chaat Plate', 'India', 's', 329, 5.3, 49, 12.4, 6, 12, 293, 'vegan', [['Potato', 150, 12], ['Tamarind', 15, 2], ['Onion', 30, 2], ['Olive oil', 12, 3], ['Chaat masala spice', 8, 2], ['Sweet potato', 72, 6], ['Basmati rice', 6, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Chaat masala spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Tamarind.']),
      R('Sev-Free Bhel Bowl', 'India', 's', 408, 7.5, 74.6, 8.8, 6, 12, 311, 'vegan', [['Poha', 50, 7], ['Potato', 80, 6], ['Onion', 30, 2], ['Tomato', 40, 2], ['Tamarind', 15, 2], ['Olive oil', 8, 2], ['Chaat masala spice', 8, 2], ['Sweet potato', 80, 6]], ['Rinse and cook the poha until fluffy.', 'Heat the olive oil and temper the Onion and Chaat masala spice.', 'Add the Onion and Tomato and sauté until tender.', 'Fold in the cooked poha, season, and finish with Tamarind.']),
      R('Corn Chaat Cup', 'India', 's', 302, 6.8, 45.2, 10.5, 6.1, 12, 286, 'vegan', [['Sweetcorn', 150, 12], ['Onion', 30, 2], ['Tomato', 40, 2], ['Olive oil', 8, 2], ['Lemon', 10, 2], ['Chaat masala spice', 8, 2], ['Sweet potato', 40, 3]], ['Heat the olive oil and sauté the Onion and Chaat masala spice until soft.', 'Add the Sweetcorn, Onion and Tomato and cook until tender.', 'Add the sweet potato and cook through.', 'Season to taste, finish with fresh herbs, and serve.']),
      R('Sweet Potato Chaat', 'India', 's', 349, 5.5, 62.7, 8.5, 7.1, 12, 280, 'vegan', [['Sweet potato', 200, 16], ['Onion', 25, 2], ['Tamarind', 15, 2], ['Olive oil', 8, 2], ['Chaat masala spice', 8, 2], ['Basmati rice', 24, 3]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Chaat masala spice.', 'Add the Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with Tamarind.']),
      R('Vegetable Tehri', 'India', 'l', 441, 7.2, 51.1, 23.1, 6.1, 20, 274, 'vegan', [['Basmati rice', 42, 6], ['Cauliflower', 70, 3], ['Carrot', 60, 2], ['Peas', 40, 2], ['Olive oil', 22, 5], ['Garam masala', 8, 2], ['Sweet potato', 32, 3]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Garam masala.', 'Add the Cauliflower, Carrot and Peas and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Lemon Sevai Plate', 'India', 'b', 411, 7.4, 75.2, 8.9, 6, 15, 265, 'vegan', [['Rice vermicelli noodle', 60, 8], ['Carrot', 50, 2], ['Onion', 25, 2], ['Olive oil', 8, 2], ['Lemon', 10, 2], ['Curry leaves spice', 8, 2], ['Sweet potato', 104, 8]], ['Rinse and cook the rice vermicelli noodle until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Carrot and Onion and sauté until tender.', 'Fold in the cooked rice vermicelli noodle, season, and finish with Lemon.']),
      R('Masala Bhutta Rice', 'India', 'l', 435, 7.7, 69.8, 13.9, 5.4, 20, 244, 'vegan', [['Basmati rice', 45, 6], ['Sweetcorn', 90, 7], ['Onion', 25, 2], ['Olive oil', 12, 3], ['Chaat masala spice', 8, 2], ['Sweet potato', 64, 5]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Chaat masala spice.', 'Add the Sweetcorn and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Curried Vegetable Rice', 'India', 'l', 431, 7.4, 66.7, 15, 6, 20, 272, 'vegan', [['Basmati rice', 57, 8], ['Mixed vegetable', 120, 5], ['Onion', 25, 2], ['Olive oil', 14, 3], ['Curry spice', 8, 2], ['Sweet potato', 48, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry spice.', 'Add the Mixed vegetable and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Beetroot Rice Plate', 'India', 'l', 427, 7.6, 69.8, 13, 6, 20, 271, 'vegan', [['Basmati rice', 60, 8], ['Beetroot', 110, 4], ['Onion', 25, 2], ['Olive oil', 12, 3], ['Curry leaves spice', 8, 2], ['Sweet potato', 56, 4]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Beetroot and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Cabbage Poriyal Rice', 'India', 'l', 434, 7, 47.8, 23.9, 6.1, 20, 242, 'vegan', [['Basmati rice', 42, 6], ['Cabbage', 110, 4], ['Coconut', 15, 2], ['Onion', 25, 2], ['Olive oil', 18, 4], ['Curry leaves spice', 8, 2], ['Sweet potato', 24, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Curry leaves spice.', 'Add the Cabbage and Onion and sauté until tender.', 'Fold in the cooked basmati rice and coconut, season, and finish with fresh herbs.']),
      R('Apple Cinnamon Overnight Oats', 'USA', 'b', 405, 7.6, 74.4, 8.6, 10.1, 15, 302, 'vegan', [['Oats', 30, 4], ['Apple', 90, 4], ['Almond milk', 120, 5], ['Dates', 47, 7], ['Cinnamon spice', 4, 2], ['Coconut', 11, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut, season, and finish with fresh herbs.']),
      R('Berry Muesli Bowl', 'Switzerland', 'b', 368, 6.6, 66.7, 8.3, 7.5, 15, 314, 'vegan', [['Muesli', 40, 9], ['Berries', 80, 3], ['Almond milk', 120, 5], ['Banana', 60, 5], ['Dates', 12, 2], ['Coconut', 2, 2]], ['Combine the base with the almond milk.', 'Simmer or warm gently until creamy.', 'Top with the Berries, Banana and Almond milk.', 'Sweeten lightly if needed and serve.']),
      R('Banana Oat Breakfast Bowl', 'USA', 'b', 412, 7.6, 76.4, 8.5, 9.6, 15, 300, 'vegan', [['Oats', 28, 4], ['Banana', 100, 8], ['Almond milk', 120, 5], ['Dates', 37, 5], ['Cinnamon spice', 4, 2], ['Coconut', 11, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut, season, and finish with fresh herbs.']),
      R('Mango Coconut Oats', 'India', 'b', 371, 6.5, 44.5, 18.6, 5.9, 15, 234, 'vegan', [['Oats', 32, 4], ['Mango', 120, 10], ['Coconut milk', 80, 6], ['Dates', 2, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut milk, season, and finish with fresh herbs.']),
      R('Granola Fruit Bowl', 'USA', 'b', 390, 6.4, 72.1, 8.4, 8.2, 15, 310, 'vegan', [['Granola', 35, 8], ['Banana', 80, 6], ['Apple', 70, 3], ['Almond milk', 100, 4], ['Dates', 20, 3], ['Coconut', 5, 2]], ['Combine the base with the almond milk.', 'Simmer or warm gently until creamy.', 'Top with the Banana, Apple and Almond milk.', 'Sweeten lightly if needed and serve.']),
      R('Chia Fruit Breakfast Bowl', 'USA', 'b', 362, 6.1, 66, 8.2, 9, 15, 335, 'vegan', [['Chia seeds', 12, 3], ['Banana', 90, 7], ['Mango', 80, 6], ['Almond milk', 120, 5], ['Dates', 33, 5]], ['Combine the base with the almond milk.', 'Refrigerate overnight (or 20 minutes for chia) until thickened.', 'Top with the Banana, Mango and Chia seeds.', 'Sweeten lightly if needed and serve.']),
      R('Yogurt Berry Parfait (Light)', 'Greece', 'b', 379, 6.9, 69, 8.4, 7.8, 15, 263, 'veg', [['Yogurt', 60, 5], ['Berries', 80, 3], ['Granola', 30, 7], ['Banana', 60, 5], ['Dates', 26, 4], ['Coconut', 7, 2]], ['Combine the base with the plant milk.', 'Simmer or warm gently until creamy.', 'Top with the Berries and Banana.', 'Sweeten lightly if needed and serve.']),
      R('Smoothie Bowl', 'USA', 'b', 404, 7, 75, 8.4, 9.7, 15, 354, 'vegan', [['Banana', 110, 9], ['Mango', 90, 7], ['Almond milk', 100, 4], ['Oats', 25, 4], ['Dates', 17, 2], ['Coconut', 12, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut, season, and finish with fresh herbs.']),
      R('Cinnamon Apple Porridge', 'UK', 'b', 412, 7.8, 76, 8.5, 10.3, 15, 321, 'vegan', [['Oats', 30, 4], ['Apple', 100, 4], ['Almond milk', 130, 5], ['Dates', 47, 7], ['Cinnamon spice', 4, 2], ['Coconut', 10, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut, season, and finish with fresh herbs.']),
      R('Tropical Sago Bowl', 'India', 'b', 382, 5.6, 39, 22.6, 5.6, 15, 199, 'vegan', [['Sago', 21, 3], ['Mango', 90, 7], ['Coconut milk', 70, 6], ['Chia seeds', 12, 3], ['Almond', 6, 2]], ['Rinse and cook the sago until fluffy.', 'Fold in the cooked sago and coconut milk, season, and finish with fresh herbs.']),
      R('Peach Millet Porridge', 'USA', 'b', 422, 7.7, 79, 8.4, 10.1, 15, 306, 'vegan', [['Millet', 42, 6], ['Apple', 90, 4], ['Almond milk', 120, 5], ['Dates', 41, 6], ['Coconut', 13, 2]], ['Rinse and cook the millet until fluffy.', 'Fold in the cooked millet and coconut, season, and finish with fresh herbs.']),
      R('Date & Banana Ragi Porridge', 'India', 'b', 423, 7.5, 78.9, 8.6, 9.4, 15, 295, 'vegan', [['Ragi flour', 38, 5], ['Banana', 90, 7], ['Almond milk', 120, 5], ['Dates', 33, 5], ['Coconut', 14, 2]], ['Combine the base with the almond milk.', 'Simmer or warm gently until creamy.', 'Top with the Banana, Dates and Almond milk.', 'Sweeten lightly if needed and serve.']),
      R('Fig & Oat Bowl', 'Turkey', 'b', 413, 7.9, 76.4, 8.4, 9.8, 15, 296, 'vegan', [['Oats', 33, 5], ['Dry fruit', 25, 2], ['Almond milk', 120, 5], ['Banana', 70, 6], ['Dates', 38, 5], ['Coconut', 10, 2]], ['Rinse and cook the oats until fluffy.', 'Fold in the cooked oats and coconut, season, and finish with fresh herbs.']),
      R('Coconut Rice Flakes Bowl', 'India', 'b', 381, 7.2, 66, 9.8, 5.8, 15, 226, 'vegan', [['Poha', 55, 8], ['Coconut', 15, 2], ['Banana', 70, 6], ['Almond milk', 80, 3], ['Chia seeds', 6, 2]], ['Rinse and cook the poha until fluffy.', 'Fold in the cooked poha and coconut, season, and finish with fresh herbs.']),
      R('Roasted Sweet Potato Cup', 'USA', 's', 360, 5.5, 65.3, 8.5, 7.4, 12, 268, 'vegan', [['Sweet potato', 230, 18], ['Olive oil', 8, 2], ['Paprika spice', 6, 2], ['Basmati rice', 24, 3]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Paprika spice.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Mixed Fruit Bowl', 'India', 's', 336, 6, 54.9, 10.3, 8.4, 12, 318, 'vegan', [['Apple', 120, 5], ['Banana', 90, 7], ['Mango', 90, 7], ['Almond', 18, 4]], ['Season to taste, finish with fresh herbs, and serve.']),
      R('Roasted Corn Cup', 'Mexico', 's', 302, 7.2, 48.6, 8.8, 6, 12, 250, 'vegan', [['Sweetcorn', 180, 14], ['Olive oil', 6, 2], ['Lemon', 10, 2], ['Chaat masala spice', 6, 2], ['Sweet potato', 48, 4]], ['Cut the sweet potato into even pieces and parboil 5 minutes.', 'Toss with the Olive oil and Chaat masala spice.', 'Roast at 200°C for 25–30 minutes until golden, turning once.', 'Season and serve hot.']),
      R('Herbed Popcorn Bowl', 'USA', 's', 306, 7, 50.1, 8.6, 6, 12, 225, 'vegan', [['Cornflake', 10, 2], ['Sweetcorn', 150, 12], ['Olive oil', 5, 2], ['Herbs', 4, 2], ['Sweet potato', 56, 4]], ['Heat the olive oil and sauté the Herbs until soft.', 'Add the Cornflake and Sweetcorn and cook until tender.', 'Add the sweet potato and cook through.', 'Season to taste, finish with fresh herbs, and serve.']),
      R('Baked Potato Crisps', 'UK', 's', 306, 5.6, 52.1, 8.4, 6.2, 12, 284, 'vegan', [['Potato', 200, 16], ['Olive oil', 8, 2], ['Paprika spice', 6, 2], ['Sweet potato', 64, 5], ['Basmati rice', 6, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Paprika spice.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Vegetable Sushi Rolls', 'Japan', 's', 333, 6.8, 56.6, 8.8, 6.4, 12, 216, 'vegan', [['Sushi rice', 56, 8], ['Cucumber', 60, 2], ['Carrot', 50, 2], ['Avocado', 40, 3], ['Soy sauce', 8, 2], ['Olive oil', 2, 2]], ['Rinse and cook the sushi rice until fluffy.', 'Heat the olive oil and temper the spices.', 'Add the Cucumber and Carrot and sauté until tender.', 'Fold in the cooked sushi rice, season, and finish with fresh herbs.']),
      R('Rice Paper Veg Rolls', 'Vietnam', 's', 334, 6.8, 56.5, 9, 6.1, 12, 259, 'vegan', [['Rice vermicelli noodle', 45, 6], ['Cucumber', 60, 2], ['Carrot', 60, 2], ['Bell pepper', 40, 2], ['Mint herbs', 6, 2], ['Sweet potato', 40, 3], ['Olive oil', 8, 2]], ['Rinse and cook the rice vermicelli noodle until fluffy.', 'Heat the olive oil and temper the Bell pepper and Mint herbs.', 'Add the Cucumber, Carrot and Bell pepper and sauté until tender.', 'Fold in the cooked rice vermicelli noodle, season, and finish with fresh herbs.']),
      R('Tomato Bruschetta', 'Italy', 's', 309, 7.7, 49.9, 8.7, 6, 12, 244, 'vegan', [['Bread', 60, 8], ['Tomato', 80, 3], ['Onion', 20, 2], ['Olive oil', 6, 2], ['Basil herbs', 6, 2], ['Sweet potato', 72, 6]], ['Heat the olive oil and sauté the Onion and Basil herbs until soft.', 'Add the Tomato and Onion and cook until tender.', 'Add the sweet potato and cook through.', 'Season to taste, finish with fresh herbs, and serve.']),
      R('Herb Stuffed Tomatoes', 'Italy', 's', 340, 6.3, 58.7, 8.9, 6, 12, 347, 'vegan', [['Tomato', 180, 7], ['Basmati rice', 40, 6], ['Onion', 25, 2], ['Olive oil', 8, 2], ['Herbs', 6, 2], ['Sweet potato', 88, 7]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Onion and Herbs.', 'Add the Tomato and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),
      R('Stuffed Bell Peppers', 'Mexico', 's', 318, 7.1, 53.3, 8.5, 6.2, 12, 271, 'vegan', [['Bell pepper', 127, 5], ['Basmati rice', 32, 4], ['Sweetcorn', 50, 4], ['Onion', 25, 2], ['Olive oil', 7, 2], ['Herbs', 6, 2], ['Sweet potato', 24, 2]], ['Rinse and cook the basmati rice until fluffy.', 'Heat the olive oil and temper the Bell pepper and Onion.', 'Add the Bell pepper, Sweetcorn and Onion and sauté until tender.', 'Fold in the cooked basmati rice, season, and finish with fresh herbs.']),

      // ───────── Low-protein soup library (150 snack soups) — global veg
      // soups 120–320 kcal, protein 2–8 g, high fibre; hydration + calorie
      // filler that never pushes protein up. Ingredient-derived. ─────────
      R('Classic Tomato Soup', 'India', 's', 182, 3.6, 24.8, 7.6, 4.5, 15, 483, 'vegan', [['Tomato', 220, 9], ['Onion', 40, 2], ['Sweet potato', 60, 5], ['Olive oil', 7, 2], ['Basil herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Roasted Tomato Basil Soup', 'Italy', 's', 187, 3.8, 25.5, 7.8, 4.7, 15, 496, 'vegan', [['Tomato', 230, 9], ['Onion', 35, 2], ['Sweet potato', 60, 5], ['Olive oil', 7, 2], ['Basil herbs', 8, 2], ['Garlic spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Creamy Tomato Soup', 'Italy', 's', 202, 4.1, 22.6, 10.6, 4.8, 15, 476, 'vegan', [['Tomato', 200, 8], ['Coconut milk', 50, 4], ['Onion', 30, 2], ['Sweet potato', 50, 4], ['Basil herbs', 6, 2], ['Water', 140, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Golden Pumpkin Soup', 'USA', 's', 230, 6.1, 31.3, 8.9, 5.8, 15, 501, 'vegan', [['Pumpkin', 230, 9], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Coconut milk', 40, 3], ['Ginger spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Butternut Squash Soup', 'USA', 's', 204, 5.6, 23.4, 9.8, 5.1, 15, 465, 'vegan', [['Squash', 230, 9], ['Onion', 35, 2], ['Coconut milk', 45, 4], ['Nutmeg spice', 5, 2], ['Water', 150, 6]], ['Wash and roughly chop the Squash and Onion.', 'Add the Squash and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot Ginger Soup', 'France', 's', 178, 5.4, 30.3, 3.9, 4.5, 15, 476, 'vegan', [['Carrot', 230, 9], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 3, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot Coriander Soup', 'UK', 's', 178, 5.4, 30.3, 3.9, 4.5, 15, 476, 'vegan', [['Carrot', 230, 9], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 3, 2], ['Coriander herbs', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Coriander herbs for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Coriander herbs, and serve hot.']),
      R('Ruby Beetroot Soup', 'Russia', 's', 178, 5, 28.6, 4.8, 4.5, 15, 455, 'vegan', [['Beetroot', 210, 8], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Dill herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Beetroot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Dill herbs for 1–2 minutes until fragrant.', 'Add the Beetroot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Dill herbs, and serve hot.']),
      R('Broccoli Green Soup', 'USA', 's', 198, 6.7, 24.9, 7.9, 5, 15, 476, 'vegan', [['Broccoli', 180, 7], ['Onion', 35, 2], ['Sweet potato', 60, 5], ['Coconut milk', 35, 3], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Broccoli and Onion.', 'Add the Broccoli and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Cauliflower Cream Soup', 'France', 's', 200, 6.7, 23.2, 8.9, 5, 15, 474, 'vegan', [['Cauliflower', 183, 7], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Coconut milk', 40, 3], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cauliflower and Onion.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spinach Soup', 'India', 's', 172, 5.4, 24.5, 5.8, 4.3, 15, 436, 'vegan', [['Spinach', 150, 6], ['Onion', 35, 2], ['Sweet potato', 70, 6], ['Olive oil', 5, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Spinach and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Cabbage Comfort Soup', 'Russia', 's', 179, 6.8, 26.7, 5, 4.5, 15, 500, 'vegan', [['Cabbage', 170, 7], ['Carrot', 60, 2], ['Onion', 40, 2], ['Sweet potato', 50, 4], ['Olive oil', 4, 2], ['Herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Cabbage, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Cabbage, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Sweet Corn Veg Soup', 'China', 's', 216, 5.9, 39.2, 4, 5.4, 15, 412, 'vegan', [['Sweetcorn', 114, 9], ['Carrot', 50, 2], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 2, 2], ['Ginger spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Sweetcorn, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Sweetcorn, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Zucchini Basil Soup', 'Italy', 's', 190, 5.2, 31.6, 4.8, 4.8, 15, 470, 'vegan', [['Zucchini', 210, 8], ['Onion', 35, 2], ['Sweet potato', 55, 4], ['Olive oil', 4, 2], ['Basil herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Zucchini and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Zucchini and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Roasted Bell Pepper Soup', 'Spain', 's', 183, 5.5, 31.4, 3.9, 4.6, 15, 504, 'vegan', [['Bell pepper', 210, 8], ['Tomato', 60, 2], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 3, 2], ['Garlic spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Bell pepper, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Bell pepper, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Garden Mixed Vegetable Soup', 'India', 's', 182, 5.1, 29.6, 4.8, 4.5, 15, 460, 'vegan', [['Mixed vegetable', 210, 8], ['Onion', 35, 2], ['Sweet potato', 45, 4], ['Olive oil', 4, 2], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Mixed vegetable and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Mixed vegetable and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Green Pea Soup', 'UK', 's', 188, 4.1, 25.8, 7.6, 4.7, 15, 418, 'vegan', [['Peas', 150, 6], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Olive oil', 7, 2], ['Mint herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Mint herbs for 1–2 minutes until fragrant.', 'Add the Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Mint herbs, and serve hot.']),
      R('Celery Herb Soup', 'France', 's', 182, 6.2, 25.9, 5.9, 4.5, 15, 466, 'vegan', [['Celery', 180, 7], ['Onion', 35, 2], ['Sweet potato', 70, 6], ['Olive oil', 5, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Celery and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Celery and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Leek & Potato Soup', 'France', 's', 199, 6.7, 34.6, 3.8, 5, 15, 488, 'vegan', [['Leek', 129, 5], ['Potato', 150, 12], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Leek and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Leek and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Asparagus Soup', 'France', 's', 198, 6.7, 24.9, 7.9, 5, 15, 476, 'vegan', [['Asparagus', 180, 7], ['Onion', 35, 2], ['Sweet potato', 60, 5], ['Coconut milk', 35, 3], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Asparagus and Onion.', 'Add the Asparagus and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tuscan Vegetable Minestrone', 'Italy', 's', 222, 6.6, 28.2, 9.2, 5.5, 15, 515, 'vegan', [['Tomato', 120, 5], ['Carrot', 60, 2], ['Cabbage', 60, 2], ['Zucchini', 60, 2], ['Pasta', 11, 2], ['Onion', 30, 2], ['Olive oil', 8, 2], ['Basil herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Carrot and Cabbage.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato, Carrot and Cabbage and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Rustic Tuscan Bean Soup', 'Italy', 's', 210, 6.4, 21.3, 11, 5.2, 15, 466, 'vegan', [['Tomato', 120, 5], ['Kale', 60, 2], ['White bean', 10, 2], ['Carrot', 60, 2], ['Onion', 30, 2], ['Olive oil', 10, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Tomato, Kale and Carrot.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Tomato, Kale and Carrot and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Chickpea Vegetable Soup', 'Greece', 's', 207, 6.6, 29.5, 7, 5.2, 15, 447, 'vegan', [['Tomato', 120, 5], ['Chickpea', 15, 2], ['Carrot', 60, 2], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Tomato, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Tomato, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('White Bean & Veg Soup', 'Italy', 's', 212, 6.8, 25.7, 9.1, 5.3, 15, 448, 'vegan', [['White bean', 14, 2], ['Zucchini', 80, 3], ['Carrot', 60, 2], ['Tomato', 80, 3], ['Onion', 30, 2], ['Olive oil', 8, 2], ['Herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Zucchini, Carrot and Tomato.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Zucchini, Carrot and Tomato and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Roasted Garlic Soup', 'Spain', 's', 202, 4.7, 36, 4.3, 5.1, 15, 369, 'vegan', [['Garlic spice', 20, 2], ['Onion', 60, 2], ['Sweet potato', 90, 7], ['Bread', 20, 3], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Onion.', 'Heat the olive oil in a pot and sauté the Garlic spice and Onion for 1–2 minutes until fragrant.', 'Add the Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Italian Herb Vegetable Soup', 'Italy', 's', 198, 4.8, 27.2, 7.8, 5, 15, 513, 'vegan', [['Tomato', 140, 6], ['Zucchini', 70, 3], ['Bell pepper', 60, 2], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 7, 2], ['Oregano herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Zucchini and Bell pepper.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Tomato, Zucchini and Bell pepper and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Oregano herbs, and serve hot.']),
      R('Ratatouille Soup', 'France', 's', 196, 6.8, 19.8, 10, 4.9, 15, 473, 'vegan', [['Eggplant', 20, 2], ['Zucchini', 80, 3], ['Bell pepper', 70, 3], ['Tomato', 110, 4], ['Onion', 30, 2], ['Olive oil', 7, 2], ['Basil herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Eggplant, Zucchini and Bell pepper.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Eggplant, Zucchini and Bell pepper and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Miso Vegetable Soup', 'Japan', 's', 200, 6.8, 31.9, 5, 5, 15, 508, 'vegan', [['Miso spice', 20, 2], ['Cabbage', 70, 3], ['Carrot', 50, 2], ['Mushroom', 60, 2], ['Sweet potato', 104, 8], ['Water', 200, 8], ['Olive oil', 4, 2]], ['Wash and roughly chop the Cabbage, Carrot and Mushroom.', 'Heat the olive oil in a pot and sauté the Miso spice for 1–2 minutes until fragrant.', 'Add the Cabbage, Carrot and Mushroom and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Hot & Sour Vegetable Soup', 'China', 's', 176, 6.7, 23.7, 6, 4.4, 15, 491, 'vegan', [['Cabbage', 76, 3], ['Carrot', 60, 2], ['Mushroom', 60, 2], ['Bell pepper', 50, 2], ['Sweet potato', 40, 3], ['Soy sauce', 12, 2], ['Olive oil', 5, 2], ['Ginger spice', 8, 2], ['Water', 180, 7]], ['Wash and roughly chop the Cabbage, Carrot and Mushroom.', 'Heat the olive oil in a pot and sauté the Bell pepper and Ginger spice for 1–2 minutes until fragrant.', 'Add the Cabbage, Carrot and Mushroom and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Thai Coconut Vegetable Soup', 'Thailand', 's', 192, 5.3, 17.8, 11.1, 4.2, 15, 431, 'vegan', [['Coconut milk', 53, 4], ['Mushroom', 60, 2], ['Carrot', 50, 2], ['Bell pepper', 50, 2], ['Lemongrass spice', 10, 2], ['Water', 180, 7], ['Sweet potato', 28, 2]], ['Wash and roughly chop the Mushroom, Carrot and Bell pepper.', 'Add the Mushroom, Carrot and Bell pepper and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Lemongrass spice, and serve hot.']),
      R('Lemongrass Vegetable Soup', 'Thailand', 's', 173, 5.6, 22.6, 6.7, 4.3, 15, 450, 'vegan', [['Lemongrass spice', 12, 2], ['Carrot', 60, 2], ['Mushroom', 60, 2], ['Cabbage', 60, 2], ['Sweet potato', 62, 5], ['Olive oil', 6, 2], ['Water', 190, 8]], ['Wash and roughly chop the Carrot, Mushroom and Cabbage.', 'Heat the olive oil in a pot and sauté the Lemongrass spice for 1–2 minutes until fragrant.', 'Add the Carrot, Mushroom and Cabbage and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Lemongrass spice, and serve hot.']),
      R('Mushroom Clear Soup', 'China', 's', 171, 7.1, 24.8, 4.8, 4.3, 15, 499, 'vegan', [['Mushroom', 135, 5], ['Cabbage', 50, 2], ['Onion', 30, 2], ['Sweet potato', 74, 6], ['Olive oil', 4, 2], ['Ginger spice', 6, 2], ['Water', 200, 8]], ['Wash and roughly chop the Mushroom, Cabbage and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Mushroom, Cabbage and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Vegetable Ramen Broth', 'Japan', 's', 193, 6.7, 23.5, 8, 4.5, 15, 431, 'vegan', [['Mushroom', 61, 2], ['Cabbage', 60, 2], ['Carrot', 50, 2], ['Noodle', 15, 2], ['Onion', 30, 2], ['Soy sauce', 12, 2], ['Olive oil', 7, 2], ['Ginger spice', 6, 2], ['Water', 190, 8]], ['Wash and roughly chop the Mushroom, Cabbage and Carrot.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Mushroom, Cabbage and Carrot and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Chinese Vegetable Soup', 'China', 's', 166, 6.2, 21.9, 5.9, 4.2, 15, 471, 'vegan', [['Cabbage', 80, 3], ['Carrot', 60, 2], ['Mushroom', 50, 2], ['Bell pepper', 40, 2], ['Sweet potato', 40, 3], ['Olive oil', 5, 2], ['Ginger spice', 6, 2], ['Water', 190, 8]], ['Wash and roughly chop the Cabbage, Carrot and Mushroom.', 'Heat the olive oil in a pot and sauté the Bell pepper and Ginger spice for 1–2 minutes until fragrant.', 'Add the Cabbage, Carrot and Mushroom and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Bok Choy Ginger Soup', 'China', 's', 169, 6.9, 24.2, 5, 4.2, 15, 494, 'vegan', [['Bok choy', 140, 6], ['Mushroom', 60, 2], ['Onion', 30, 2], ['Sweet potato', 62, 5], ['Olive oil', 4, 2], ['Ginger spice', 8, 2], ['Water', 190, 8]], ['Wash and roughly chop the Bok choy, Mushroom and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Bok choy, Mushroom and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Ginger Carrot Miso Soup', 'Japan', 's', 178, 4.7, 26.6, 5.9, 4.5, 15, 448, 'vegan', [['Carrot', 170, 7], ['Miso spice', 15, 2], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 5, 2], ['Ginger spice', 8, 2], ['Water', 180, 7]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Miso spice and Onion for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with fresh herbs, and serve hot.']),
      R('South Indian Tomato Rasam', 'India', 's', 170, 3.5, 26.5, 5.6, 4.2, 15, 498, 'vegan', [['Tomato', 180, 7], ['Tamarind', 15, 2], ['Sweet potato', 88, 7], ['Olive oil', 5, 2], ['Curry leaves spice', 10, 2], ['Water', 200, 8]], ['Wash and roughly chop the Tomato.', 'Heat the olive oil in a pot and sauté the Curry leaves spice for 1–2 minutes until fragrant.', 'Add the Tomato and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with Tamarind, and serve hot.']),
      R('Lemon Pepper Rasam', 'India', 's', 174, 3.5, 27.3, 5.6, 4.3, 15, 484, 'vegan', [['Tomato', 150, 6], ['Lemon', 20, 2], ['Sweet potato', 93, 7], ['Olive oil', 5, 2], ['Black pepper spice', 10, 2], ['Curry leaves spice', 6, 2], ['Water', 200, 8]], ['Wash and roughly chop the Tomato and Black pepper spice.', 'Heat the olive oil in a pot and sauté the Black pepper spice and Curry leaves spice for 1–2 minutes until fragrant.', 'Add the Tomato and Black pepper spice and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with Lemon, and serve hot.']),
      R('Vegetable Rasam', 'India', 's', 174, 4.1, 24.2, 6.8, 4.3, 15, 505, 'vegan', [['Tomato', 150, 6], ['Mixed vegetable', 90, 4], ['Tamarind', 12, 2], ['Sweet potato', 47, 4], ['Olive oil', 6, 2], ['Curry leaves spice', 10, 2], ['Water', 190, 8]], ['Wash and roughly chop the Tomato and Mixed vegetable.', 'Heat the olive oil in a pot and sauté the Curry leaves spice for 1–2 minutes until fragrant.', 'Add the Tomato and Mixed vegetable and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with Tamarind, and serve hot.']),
      R('Pumpkin Shorba', 'India', 's', 183, 4.9, 27.9, 5.8, 4.6, 15, 458, 'vegan', [['Pumpkin', 200, 8], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 5, 2], ['Garam masala', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Pumpkin and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garam masala for 1–2 minutes until fragrant.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot Shorba', 'India', 's', 178, 5, 28.8, 4.8, 4.5, 15, 467, 'vegan', [['Carrot', 210, 8], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Garam masala', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garam masala for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Palak Shorba', 'India', 's', 178, 5.4, 23.7, 6.8, 4.5, 15, 444, 'vegan', [['Spinach', 150, 6], ['Onion', 35, 2], ['Sweet potato', 65, 5], ['Olive oil', 6, 2], ['Garam masala', 8, 2], ['Water', 180, 7]], ['Wash and roughly chop the Spinach and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garam masala for 1–2 minutes until fragrant.', 'Add the Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Lauki Soup', 'India', 's', 183, 5.2, 31.9, 3.8, 4.6, 15, 486, 'vegan', [['Lauki', 200, 8], ['Onion', 35, 2], ['Sweet potato', 60, 5], ['Olive oil', 3, 2], ['Cumin spice', 8, 2], ['Water', 180, 7]], ['Wash and roughly chop the Lauki and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Lauki and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Mixed Vegetable Shorba', 'India', 's', 178, 4.9, 28.9, 4.8, 4.5, 15, 462, 'vegan', [['Mixed vegetable', 200, 8], ['Onion', 35, 2], ['Sweet potato', 45, 4], ['Olive oil', 4, 2], ['Garam masala', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Mixed vegetable and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garam masala for 1–2 minutes until fragrant.', 'Add the Mixed vegetable and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Sweet Corn Coriander Soup', 'India', 's', 206, 5.7, 38.6, 3.2, 5, 15, 388, 'vegan', [['Sweetcorn', 134, 11], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 1, 2], ['Coriander herbs', 8, 2], ['Water', 180, 7]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Coriander herbs for 1–2 minutes until fragrant.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Coriander herbs, and serve hot.']),
      R('Coconut Vegetable Stew', 'India', 's', 222, 6.2, 24.3, 11.1, 4.6, 15, 362, 'vegan', [['Coconut milk', 52, 4], ['Carrot', 60, 2], ['Beans', 12, 2], ['Potato', 60, 5], ['Curry leaves spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot and Beans.', 'Add the Carrot and Beans and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('French Onion Soup (Light)', 'France', 's', 221, 4.9, 38.8, 5.1, 5.5, 15, 450, 'vegan', [['Onion', 180, 7], ['Sweet potato', 60, 5], ['Bread', 20, 3], ['Olive oil', 4, 2], ['Thyme herbs', 6, 2], ['Water', 180, 7]], ['Wash and roughly chop the Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Potato Leek Soup', 'France', 's', 205, 6.7, 35.9, 3.8, 5.1, 15, 489, 'vegan', [['Potato', 160, 13], ['Leek', 120, 5], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Leek and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Leek and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Roasted Mushroom Soup', 'France', 's', 197, 6.9, 23.1, 8.6, 4.4, 15, 462, 'vegan', [['Mushroom', 148, 6], ['Onion', 35, 2], ['Sweet potato', 67, 5], ['Coconut milk', 35, 3], ['Olive oil', 1, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Mushroom and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Mushroom and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Garden Vegetable Chowder', 'USA', 's', 266, 6.4, 39, 9.4, 5.7, 15, 450, 'vegan', [['Potato', 98, 8], ['Sweetcorn', 66, 5], ['Carrot', 50, 2], ['Onion', 30, 2], ['Coconut milk', 40, 3], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Sweetcorn, Carrot and Onion.', 'Add the Sweetcorn, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Herbs, and serve hot.']),
      R('Cream of Vegetable Soup', 'UK', 's', 217, 5.3, 27.1, 9.7, 5.4, 15, 461, 'vegan', [['Mixed vegetable', 180, 7], ['Coconut milk', 45, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Mixed vegetable and Onion.', 'Add the Mixed vegetable and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Herbs, and serve hot.']),
      R('Split-Free Green Pea Soup', 'UK', 's', 188, 4.2, 25.6, 7.7, 4.7, 15, 423, 'vegan', [['Peas', 160, 6], ['Onion', 35, 2], ['Sweet potato', 45, 4], ['Olive oil', 7, 2], ['Mint herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Mint herbs for 1–2 minutes until fragrant.', 'Add the Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Mint herbs, and serve hot.']),
      R('Garden Herb Vegetable Soup', 'France', 's', 186, 4.7, 21.8, 8.9, 4.7, 15, 466, 'vegan', [['Mixed vegetable', 200, 8], ['Tomato', 60, 2], ['Onion', 30, 2], ['Olive oil', 8, 2], ['Parsley herbs', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Mixed vegetable, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Parsley herbs for 1–2 minutes until fragrant.', 'Add the Mixed vegetable, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Parsley herbs, and serve hot.']),
      R('Rustic Farmhouse Soup', 'UK', 's', 183, 5.7, 31.6, 3.7, 4.6, 15, 464, 'vegan', [['Carrot', 80, 3], ['Potato', 110, 9], ['Cabbage', 60, 2], ['Onion', 35, 2], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot, Cabbage and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Carrot, Cabbage and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Light Tortilla Soup', 'Mexico', 's', 204, 6.7, 36.7, 3.4, 5.1, 15, 467, 'vegan', [['Tomato', 140, 6], ['Sweetcorn', 70, 6], ['Tortilla', 20, 3], ['Onion', 30, 2], ['Bell pepper', 40, 2], ['Olive oil', 1, 2], ['Chili spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Sweetcorn and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Bell pepper for 1–2 minutes until fragrant.', 'Add the Tomato, Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Mexican Corn Soup', 'Mexico', 's', 256, 6.4, 39.4, 8.1, 5.7, 15, 430, 'vegan', [['Sweetcorn', 119, 10], ['Onion', 30, 2], ['Bell pepper', 40, 2], ['Sweet potato', 35, 3], ['Coconut milk', 30, 2], ['Chili spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Sweetcorn, Onion and Bell pepper.', 'Add the Sweetcorn, Onion and Bell pepper and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tomato Bean Soup', 'Mexico', 's', 196, 6.5, 29.1, 6, 4.9, 15, 446, 'vegan', [['Tomato', 150, 6], ['Black bean', 15, 2], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Bell pepper', 40, 2], ['Olive oil', 5, 2], ['Chili spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Onion and Bell pepper.', 'Heat the olive oil in a pot and sauté the Onion and Bell pepper for 1–2 minutes until fragrant.', 'Add the Tomato, Onion and Bell pepper and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Mexican Vegetable Soup', 'Mexico', 's', 189, 6, 31, 4.6, 4.7, 15, 509, 'vegan', [['Tomato', 120, 5], ['Zucchini', 70, 3], ['Carrot', 60, 2], ['Sweetcorn', 60, 5], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Chili spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Zucchini and Carrot.', 'Heat the olive oil in a pot and sauté the Onion and Chili spice for 1–2 minutes until fragrant.', 'Add the Tomato, Zucchini and Carrot and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Chipotle Tomato Soup', 'Mexico', 's', 181, 3.4, 22.5, 8.6, 4.5, 15, 471, 'vegan', [['Tomato', 220, 9], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Olive oil', 8, 2], ['Chili spice', 8, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Chili spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Creamy Pumpkin Bisque', 'USA', 's', 224, 6.3, 24.8, 11.1, 5.6, 15, 445, 'vegan', [['Pumpkin', 210, 8], ['Cashew cream', 40, 6], ['Onion', 30, 2], ['Nutmeg spice', 5, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Creamy Mushroom Bisque', 'France', 's', 232, 7.1, 26.4, 10.9, 4.4, 15, 421, 'vegan', [['Mushroom', 112, 4], ['Cashew cream', 40, 6], ['Onion', 30, 2], ['Sweet potato', 73, 6], ['Thyme herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Mushroom and Onion.', 'Add the Mushroom and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Creamy Cauliflower Soup', 'France', 's', 212, 6.7, 21.9, 10.9, 5.3, 15, 471, 'vegan', [['Cauliflower', 180, 7], ['Coconut milk', 50, 4], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cauliflower and Onion.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Velvet Creamy Tomato Soup', 'Italy', 's', 199, 4.7, 23.3, 9.7, 4.6, 15, 461, 'vegan', [['Tomato', 200, 8], ['Cashew cream', 35, 5], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Basil herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Creamy Sweet Corn Soup', 'USA', 's', 281, 6.7, 37.6, 11.5, 4.7, 15, 408, 'vegan', [['Sweetcorn', 157, 13], ['Coconut milk', 45, 4], ['Onion', 30, 2], ['Herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Herbs, and serve hot.']),
      R('Classic Gazpacho', 'Spain', 's', 184, 6.5, 31.2, 3.7, 4.6, 15, 521, 'vegan', [['Tomato', 210, 8], ['Cucumber', 80, 3], ['Bell pepper', 60, 2], ['Onion', 25, 2], ['Bread', 18, 3], ['Olive oil', 2, 2], ['Garlic spice', 6, 2], ['Water', 120, 5]], ['Blend the Tomato, Cucumber and Bell pepper with a little water until smooth.', 'Whisk in the Olive oil and season to taste.', 'Chill for at least 1 hour and serve cold.']),
      R('Chilled Watermelon Gazpacho', 'Spain', 's', 204, 4.1, 39.7, 3.2, 5.1, 15, 518, 'vegan', [['Watermelon', 200, 8], ['Tomato', 120, 5], ['Cucumber', 70, 3], ['Onion', 20, 2], ['Olive oil', 2, 2], ['Basil herbs', 6, 2], ['Water', 100, 4]], ['Blend the Tomato, Cucumber and Onion with a little water until smooth.', 'Whisk in the Olive oil and season to taste.', 'Chill for at least 1 hour and serve cold.']),
      R('Cucumber Yogurt Cold Soup', 'Turkey', 's', 175, 6.6, 28.8, 3.7, 4.4, 15, 434, 'vegan', [['Cucumber', 200, 8], ['Yogurt', 60, 5], ['Sweet potato', 47, 4], ['Olive oil', 1, 2], ['Dill herbs', 6, 2], ['Water', 120, 5]], ['Wash and roughly chop the Cucumber.', 'Heat the olive oil in a pot and sauté the Dill herbs for 1–2 minutes until fragrant.', 'Add the Cucumber and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Dill herbs, and serve hot.']),
      R('Beet Gazpacho', 'Spain', 's', 183, 5.8, 26.3, 6.1, 4.6, 15, 501, 'vegan', [['Beetroot', 180, 7], ['Tomato', 100, 4], ['Cucumber', 70, 3], ['Onion', 20, 2], ['Olive oil', 5, 2], ['Dill herbs', 6, 2], ['Water', 120, 5]], ['Blend the Beetroot, Tomato and Cucumber with a little water until smooth.', 'Whisk in the Olive oil and season to taste.', 'Chill for at least 1 hour and serve cold.']),
      R('Avocado Cucumber Cold Soup', 'Mexico', 's', 216, 5.2, 23.8, 11.1, 5.4, 15, 438, 'vegan', [['Avocado', 70, 6], ['Cucumber', 180, 7], ['Onion', 20, 2], ['Lemon', 12, 2], ['Cilantro herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Cucumber and Onion.', 'Add the Cucumber and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Lemon and Cilantro herbs, and serve hot.']),
      R('Sweet Potato & Sage Soup', 'USA', 's', 202, 3.4, 39.8, 3.3, 5.1, 15, 394, 'vegan', [['Sweet potato', 180, 14], ['Onion', 35, 2], ['Olive oil', 3, 2], ['Sage herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Onion.', 'Heat the olive oil in a pot and sauté the Onion and Sage herbs for 1–2 minutes until fragrant.', 'Add the Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Sage herbs, and serve hot.']),
      R('Curried Sweet Potato Soup', 'India', 's', 248, 4.1, 39.1, 8.3, 6.1, 15, 423, 'vegan', [['Sweet potato', 170, 14], ['Onion', 35, 2], ['Coconut milk', 40, 3], ['Curry spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Onion.', 'Add the Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spiced Pumpkin Lentil-Lite Soup', 'India', 's', 181, 6.6, 29.6, 4, 4.5, 15, 417, 'vegan', [['Pumpkin', 164, 7], ['Moong dal', 12, 2], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 3, 2], ['Cumin spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Pumpkin and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Carrot Turmeric Soup', 'India', 's', 181, 5.2, 29.1, 4.9, 4.5, 15, 472, 'vegan', [['Carrot', 220, 9], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Turmeric spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Turmeric spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Zucchini Mint Soup', 'Italy', 's', 188, 5.2, 31.1, 4.8, 4.7, 15, 475, 'vegan', [['Zucchini', 210, 8], ['Onion', 30, 2], ['Sweet potato', 55, 4], ['Olive oil', 4, 2], ['Mint herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Zucchini and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Mint herbs for 1–2 minutes until fragrant.', 'Add the Zucchini and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Mint herbs, and serve hot.']),
      R('Tomato Fennel Soup', 'Italy', 's', 187, 3.3, 21.9, 9.6, 4.7, 15, 460, 'vegan', [['Tomato', 210, 8], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Olive oil', 9, 2], ['Fennel spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Fennel spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spinach & Pea Soup', 'India', 's', 181, 5.8, 23.9, 6.9, 4.5, 15, 462, 'vegan', [['Spinach', 120, 5], ['Peas', 90, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Spinach, Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Spinach, Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Mushroom Barley-Lite Soup', 'UK', 's', 186, 6.7, 23.7, 7.2, 4.5, 15, 404, 'vegan', [['Mushroom', 114, 5], ['Barley', 18, 3], ['Onion', 30, 2], ['Carrot', 50, 2], ['Olive oil', 6, 2], ['Thyme herbs', 6, 2], ['Water', 180, 7]], ['Wash and roughly chop the Mushroom, Onion and Carrot.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Mushroom, Onion and Carrot and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Broccoli Almond Cream Soup', 'USA', 's', 209, 6.7, 23.2, 9.9, 5.2, 15, 426, 'vegan', [['Broccoli', 150, 6], ['Cashew cream', 35, 5], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Broccoli and Onion.', 'Add the Broccoli and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Cauliflower Turmeric Soup', 'India', 's', 185, 6.5, 23.9, 7, 4.6, 15, 474, 'vegan', [['Cauliflower', 200, 8], ['Onion', 35, 2], ['Sweet potato', 55, 4], ['Olive oil', 6, 2], ['Turmeric spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Cauliflower and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Turmeric spice for 1–2 minutes until fragrant.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Bell Pepper Tomato Soup', 'Spain', 's', 184, 4.9, 28, 5.8, 4.6, 15, 501, 'vegan', [['Bell pepper', 150, 6], ['Tomato', 120, 5], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 5, 2], ['Basil herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Bell pepper, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Bell pepper, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Cabbage & Carrot Soup', 'Russia', 's', 174, 6.6, 25.7, 5, 4.3, 15, 495, 'vegan', [['Cabbage', 150, 6], ['Carrot', 90, 4], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Dill herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Cabbage, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Dill herbs for 1–2 minutes until fragrant.', 'Add the Cabbage, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Dill herbs, and serve hot.']),
      R('Beetroot & Ginger Soup', 'Russia', 's', 177, 4.9, 28.5, 4.8, 4.4, 15, 447, 'vegan', [['Beetroot', 200, 8], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 4, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Beetroot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Beetroot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Sweet Corn Pepper Chowder', 'USA', 's', 257, 6.5, 38.7, 8.5, 5.8, 15, 437, 'vegan', [['Sweetcorn', 76, 6], ['Bell pepper', 60, 2], ['Potato', 80, 6], ['Onion', 30, 2], ['Coconut milk', 35, 3], ['Herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Sweetcorn, Bell pepper and Onion.', 'Add the Sweetcorn, Bell pepper and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Herbs, and serve hot.']),
      R('Pumpkin Coconut Soup', 'Thailand', 's', 208, 5.1, 20.8, 11.6, 5.2, 15, 453, 'vegan', [['Pumpkin', 200, 8], ['Coconut milk', 55, 4], ['Onion', 30, 2], ['Lemongrass spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Lemongrass spice, and serve hot.']),
      R('Roasted Aubergine Soup', 'Turkey', 's', 193, 7.7, 25.8, 6.6, 4.5, 15, 401, 'vegan', [['Eggplant', 38, 3], ['Tomato', 80, 3], ['Onion', 30, 2], ['Sweet potato', 95, 8], ['Olive oil', 2, 2], ['Garlic spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Eggplant, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Eggplant, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Green Bean & Potato Soup', 'France', 's', 190, 6.7, 32.4, 3.7, 4.8, 15, 337, 'vegan', [['Beans', 18, 3], ['Potato', 110, 9], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Beans and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Beans and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Spiced Carrot Lentil-Lite Soup', 'India', 's', 182, 6.7, 29.7, 4, 4.5, 15, 418, 'vegan', [['Carrot', 165, 7], ['Moong dal', 12, 2], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 3, 2], ['Cumin spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tomato Basil Bisque', 'Italy', 's', 196, 4.6, 23.3, 9.4, 4.8, 15, 469, 'vegan', [['Tomato', 210, 8], ['Cashew cream', 30, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 1, 2], ['Basil herbs', 8, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Creamy Spinach Soup', 'India', 's', 194, 5.7, 21, 9.7, 4.9, 15, 431, 'vegan', [['Spinach', 140, 6], ['Coconut milk', 45, 4], ['Onion', 30, 2], ['Sweet potato', 50, 4], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Spinach and Onion.', 'Add the Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Winter Root Vegetable Soup', 'UK', 's', 186, 5.4, 32.7, 3.7, 4.7, 15, 474, 'vegan', [['Carrot', 90, 4], ['Beetroot', 80, 3], ['Potato', 90, 7], ['Onion', 35, 2], ['Olive oil', 3, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot, Beetroot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Carrot, Beetroot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Golden Cauliflower Bisque', 'France', 's', 209, 6.7, 23.2, 9.9, 5.2, 15, 426, 'vegan', [['Cauliflower', 151, 6], ['Cashew cream', 35, 5], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Nutmeg spice', 5, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cauliflower and Onion.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Zucchini & Basil Veloute', 'France', 's', 220, 5.6, 29.5, 8.8, 5.5, 15, 481, 'vegan', [['Zucchini', 200, 8], ['Coconut milk', 40, 3], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Basil herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Zucchini and Onion.', 'Add the Zucchini and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Roasted Red Pepper Bisque', 'Spain', 's', 203, 6.1, 25.2, 8.6, 5.1, 15, 476, 'vegan', [['Bell pepper', 200, 8], ['Cashew cream', 30, 4], ['Tomato', 60, 2], ['Onion', 30, 2], ['Garlic spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Bell pepper, Tomato and Onion.', 'Add the Bell pepper, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot Orange Soup', 'France', 's', 202, 5.1, 34.4, 4.9, 5.1, 15, 495, 'vegan', [['Carrot', 200, 8], ['Orange fruit', 60, 2], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 4, 2], ['Ginger spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Pea & Mint Veloute', 'UK', 's', 198, 4.8, 25, 8.7, 5, 15, 437, 'vegan', [['Peas', 170, 7], ['Coconut milk', 35, 3], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 1, 2], ['Mint herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Mint herbs for 1–2 minutes until fragrant.', 'Add the Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Mint herbs, and serve hot.']),
      R('Mushroom & Thyme Soup', 'France', 's', 178, 6.7, 20.5, 7.7, 4.2, 15, 444, 'vegan', [['Mushroom', 169, 7], ['Onion', 35, 2], ['Sweet potato', 55, 4], ['Olive oil', 7, 2], ['Thyme herbs', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Mushroom and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Mushroom and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Roasted Tomato & Garlic Soup', 'Italy', 's', 188, 3.4, 21.7, 9.7, 4.7, 15, 474, 'vegan', [['Tomato', 230, 9], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 9, 2], ['Garlic spice', 10, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spiced Butternut Soup', 'USA', 's', 194, 5.1, 28.2, 6.8, 4.9, 15, 461, 'vegan', [['Squash', 220, 9], ['Onion', 35, 2], ['Sweet potato', 35, 3], ['Olive oil', 6, 2], ['Cinnamon spice', 5, 2], ['Water', 160, 6]], ['Wash and roughly chop the Squash and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cinnamon spice for 1–2 minutes until fragrant.', 'Add the Squash and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Cabbage Roll Soup (Deconstructed)', 'Poland', 's', 196, 6.3, 29.2, 6, 4.9, 15, 456, 'vegan', [['Cabbage', 140, 6], ['Tomato', 90, 4], ['Basmati rice', 20, 3], ['Onion', 35, 2], ['Olive oil', 5, 2], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cabbage, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Cabbage, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Leek & Cauliflower Soup', 'France', 's', 185, 6.7, 21.4, 8.1, 4.6, 15, 477, 'vegan', [['Leek', 112, 4], ['Cauliflower', 112, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 7, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Leek, Cauliflower and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Leek, Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Tomato Red Lentil-Lite Soup', 'India', 's', 191, 6.4, 25.8, 6.9, 4.8, 15, 412, 'vegan', [['Tomato', 150, 6], ['Masoor dal', 18, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 6, 2], ['Cumin spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spiced Pumpkin Apple Soup', 'USA', 's', 199, 4.9, 33.8, 4.9, 5, 15, 489, 'vegan', [['Pumpkin', 190, 8], ['Apple', 70, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 4, 2], ['Cinnamon spice', 5, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cinnamon spice for 1–2 minutes until fragrant.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Charred Corn Soup', 'Mexico', 's', 206, 5.7, 38.6, 3.2, 5, 15, 377, 'vegan', [['Sweetcorn', 135, 11], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 1, 2], ['Chili spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Chili spice for 1–2 minutes until fragrant.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Broccoli & Pea Soup', 'USA', 's', 190, 6.5, 25.2, 7, 4.8, 15, 492, 'vegan', [['Broccoli', 150, 6], ['Peas', 90, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Broccoli, Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Broccoli, Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Beet & Carrot Soup', 'France', 's', 188, 5.6, 30.3, 4.9, 4.7, 15, 485, 'vegan', [['Beetroot', 140, 6], ['Carrot', 110, 4], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 4, 2], ['Thyme herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Beetroot, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Beetroot, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Creamy Asparagus Veloute', 'France', 's', 206, 6.7, 22.4, 9.9, 5.1, 15, 425, 'vegan', [['Asparagus', 154, 6], ['Cashew cream', 35, 5], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Asparagus and Onion.', 'Add the Asparagus and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spiced Lauki Tomato Soup', 'India', 's', 166, 4.9, 27.8, 3.9, 4.2, 15, 501, 'vegan', [['Lauki', 160, 6], ['Tomato', 90, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 3, 2], ['Cumin spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Lauki, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Lauki, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Garlic Cauliflower Soup', 'Italy', 's', 189, 6.4, 22.4, 8.2, 4.7, 15, 453, 'vegan', [['Cauliflower', 190, 8], ['Garlic spice', 15, 2], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 7, 2], ['Thyme herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cauliflower and Onion.', 'Heat the olive oil in a pot and sauté the Garlic spice and Onion for 1–2 minutes until fragrant.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Sweetcorn & Coconut Soup', 'Thailand', 's', 276, 6.4, 37.5, 11.1, 4.7, 15, 411, 'vegan', [['Sweetcorn', 140, 11], ['Coconut milk', 45, 4], ['Onion', 30, 2], ['Lemongrass spice', 8, 2], ['Water', 170, 7], ['Sweet potato', 18, 2]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Lemongrass spice, and serve hot.']),
      R('Minted Pea & Zucchini Soup', 'UK', 's', 184, 4.9, 28.1, 5.8, 4.6, 15, 461, 'vegan', [['Peas', 120, 5], ['Zucchini', 90, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 5, 2], ['Mint herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Peas, Zucchini and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Mint herbs for 1–2 minutes until fragrant.', 'Add the Peas, Zucchini and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Mint herbs, and serve hot.']),
      R('Roasted Squash & Ginger Soup', 'USA', 's', 181, 5, 27.1, 5.8, 4.5, 15, 453, 'vegan', [['Squash', 220, 9], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 5, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Squash and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Squash and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tomato & Roasted Pepper Soup', 'Spain', 's', 187, 4.7, 26.8, 6.8, 4.7, 15, 502, 'vegan', [['Tomato', 150, 6], ['Bell pepper', 120, 5], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Garlic spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato, Bell pepper and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Tomato, Bell pepper and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot & Coconut Soup', 'Thailand', 's', 197, 5, 20.2, 10.7, 4.9, 15, 438, 'vegan', [['Carrot', 190, 8], ['Coconut milk', 50, 4], ['Onion', 30, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Spinach & Coconut Soup', 'India', 's', 190, 5.6, 20, 9.7, 4.8, 15, 426, 'vegan', [['Spinach', 140, 6], ['Coconut milk', 45, 4], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Cumin spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Spinach and Onion.', 'Add the Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Cauliflower & Cumin Soup', 'India', 's', 189, 6.4, 22.9, 8, 4.7, 15, 470, 'vegan', [['Cauliflower', 200, 8], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Olive oil', 7, 2], ['Cumin spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Cauliflower and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Beetroot & Apple Soup', 'France', 's', 186, 4.7, 33.1, 3.9, 4.7, 15, 479, 'vegan', [['Beetroot', 180, 7], ['Apple', 70, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 3, 2], ['Ginger spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Beetroot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Beetroot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Pumpkin & Sage Bisque', 'USA', 's', 206, 5.9, 23.5, 9.8, 5.1, 15, 431, 'vegan', [['Pumpkin', 200, 8], ['Cashew cream', 35, 5], ['Onion', 30, 2], ['Sage herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Sage herbs, and serve hot.']),
      R('Mushroom & Leek Soup', 'France', 's', 184, 6.8, 19.3, 8.9, 4.6, 15, 456, 'vegan', [['Mushroom', 92, 4], ['Leek', 110, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 8, 2], ['Thyme herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Mushroom, Leek and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Mushroom, Leek and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Tomato & Basil Garden Soup', 'Italy', 's', 190, 3.4, 22.5, 9.6, 4.8, 15, 472, 'vegan', [['Tomato', 220, 9], ['Onion', 35, 2], ['Sweet potato', 50, 4], ['Olive oil', 9, 2], ['Basil herbs', 8, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Carrot & Cumin Soup', 'India', 's', 181, 5.2, 29.1, 4.9, 4.5, 15, 462, 'vegan', [['Carrot', 220, 9], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Cumin spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Green Vegetable Detox Soup', 'USA', 's', 174, 6.7, 25.2, 5.1, 4.3, 15, 496, 'vegan', [['Broccoli', 86, 3], ['Spinach', 80, 3], ['Zucchini', 80, 3], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Broccoli, Spinach and Zucchini.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Broccoli, Spinach and Zucchini and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Parsnip-Style Carrot Soup', 'UK', 's', 182, 5.1, 29.6, 4.8, 4.5, 15, 460, 'vegan', [['Carrot', 210, 8], ['Onion', 35, 2], ['Sweet potato', 45, 4], ['Olive oil', 4, 2], ['Thyme herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Spiced Tomato Lentil-Lite Soup', 'India', 's', 185, 6.5, 26.2, 6, 4.6, 15, 421, 'vegan', [['Tomato', 160, 6], ['Moong dal', 18, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 5, 2], ['Garam masala', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garam masala for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Creamy Broccoli & Potato Soup', 'USA', 's', 213, 6.7, 29, 7.8, 5.3, 15, 473, 'vegan', [['Broccoli', 132, 5], ['Potato', 110, 9], ['Onion', 30, 2], ['Coconut milk', 35, 3], ['Garlic spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Broccoli and Onion.', 'Add the Broccoli and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Pumpkin & Carrot Soup', 'India', 's', 183, 5.5, 29.3, 4.9, 4.6, 15, 480, 'vegan', [['Pumpkin', 140, 6], ['Carrot', 110, 4], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 4, 2], ['Ginger spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin, Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Pumpkin, Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Zucchini & Pea Soup', 'Italy', 's', 188, 5.2, 28.7, 5.8, 4.7, 15, 476, 'vegan', [['Zucchini', 140, 6], ['Peas', 90, 4], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 5, 2], ['Basil herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Zucchini, Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Zucchini, Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Roasted Tomato & Fennel Bisque', 'Italy', 's', 193, 4.4, 22.7, 9.4, 4.6, 15, 457, 'vegan', [['Tomato', 200, 8], ['Cashew cream', 30, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 1, 2], ['Fennel spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Fennel spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Cabbage & Tomato Soup', 'Russia', 's', 176, 5.9, 22.4, 7, 4.4, 15, 497, 'vegan', [['Cabbage', 150, 6], ['Tomato', 100, 4], ['Onion', 35, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Dill herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Cabbage, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Dill herbs for 1–2 minutes until fragrant.', 'Add the Cabbage, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Dill herbs, and serve hot.']),
      R('Sweet Potato & Corn Soup', 'USA', 's', 207, 4.8, 39.3, 3.4, 5.2, 15, 374, 'vegan', [['Sweet potato', 94, 8], ['Sweetcorn', 82, 7], ['Onion', 30, 2], ['Olive oil', 2, 2], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Roasted Pepper & Tomato Soup', 'Spain', 's', 187, 4.8, 26.6, 6.8, 4.7, 15, 487, 'vegan', [['Bell pepper', 150, 6], ['Tomato', 110, 4], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 6, 2], ['Paprika spice', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Bell pepper, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Bell pepper, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Carrot & Apple Soup', 'UK', 's', 201, 4.8, 34.5, 4.9, 5, 15, 490, 'vegan', [['Carrot', 180, 7], ['Apple', 80, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 4, 2], ['Ginger spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Mushroom & Spinach Soup', 'France', 's', 176, 6.7, 19.8, 7.8, 4.4, 15, 452, 'vegan', [['Mushroom', 104, 4], ['Spinach', 90, 4], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 7, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Mushroom, Spinach and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Mushroom, Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Golden Squash & Apple Soup', 'USA', 's', 199, 4.9, 33.8, 4.9, 5, 15, 489, 'vegan', [['Squash', 190, 8], ['Apple', 70, 3], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Olive oil', 4, 2], ['Cinnamon spice', 5, 2], ['Water', 160, 6]], ['Wash and roughly chop the Squash and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cinnamon spice for 1–2 minutes until fragrant.', 'Add the Squash and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tomato & Vegetable Broth Soup', 'India', 's', 179, 4.4, 25, 6.8, 4.5, 15, 487, 'vegan', [['Tomato', 130, 5], ['Mixed vegetable', 120, 5], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 6, 2], ['Herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Mixed vegetable and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Tomato, Mixed vegetable and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with Herbs, and serve hot.']),
      R('Creamy Corn & Potato Soup', 'USA', 's', 260, 6.2, 39.8, 8.5, 5, 15, 409, 'vegan', [['Sweetcorn', 88, 7], ['Potato', 100, 8], ['Onion', 30, 2], ['Coconut milk', 35, 3], ['Herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Sweetcorn and Onion.', 'Add the Sweetcorn and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the coconut milk, and warm through.', 'Season, finish with Herbs, and serve hot.']),
      R('Roasted Beet Bisque', 'Russia', 's', 212, 5.9, 28.1, 8.5, 5.3, 15, 436, 'vegan', [['Beetroot', 190, 8], ['Cashew cream', 30, 4], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Dill herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Beetroot and Onion.', 'Add the Beetroot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Dill herbs, and serve hot.']),
      R('Spiced Pumpkin & Ginger Soup', 'India', 's', 181, 4.9, 27.3, 5.8, 4.5, 15, 448, 'vegan', [['Pumpkin', 210, 8], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 5, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Pumpkin and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Vegetable & Herb Broth Bowl', 'France', 's', 181, 4.9, 27.2, 5.8, 4.5, 15, 478, 'vegan', [['Mixed vegetable', 180, 7], ['Tomato', 60, 2], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 5, 2], ['Parsley herbs', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Mixed vegetable, Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Parsley herbs for 1–2 minutes until fragrant.', 'Add the Mixed vegetable, Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Strain if you prefer a clear soup, or leave rustic.', 'Season, finish with Parsley herbs, and serve hot.']),
      R('Carrot & Coriander Bisque', 'UK', 's', 214, 6, 28.3, 8.5, 5.3, 15, 448, 'vegan', [['Carrot', 190, 8], ['Cashew cream', 30, 4], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Coriander herbs', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with Coriander herbs, and serve hot.']),
      R('Cauliflower & Pea Soup', 'India', 's', 186, 6.3, 24.5, 7, 4.7, 15, 482, 'vegan', [['Cauliflower', 150, 6], ['Peas', 80, 3], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 6, 2], ['Cumin spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Cauliflower, Peas and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Cumin spice for 1–2 minutes until fragrant.', 'Add the Cauliflower, Peas and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Zucchini & Pepper Soup', 'Italy', 's', 188, 5.5, 30.5, 4.9, 4.7, 15, 470, 'vegan', [['Zucchini', 130, 5], ['Bell pepper', 110, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 4, 2], ['Basil herbs', 6, 2], ['Water', 150, 6]], ['Wash and roughly chop the Zucchini, Bell pepper and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Zucchini, Bell pepper and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Tomato & Celery Soup', 'France', 's', 182, 5, 23, 7.8, 4.5, 15, 503, 'vegan', [['Tomato', 160, 6], ['Celery', 90, 4], ['Onion', 35, 2], ['Sweet potato', 45, 4], ['Olive oil', 7, 2], ['Thyme herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Celery and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Thyme herbs for 1–2 minutes until fragrant.', 'Add the Tomato, Celery and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Thyme herbs, and serve hot.']),
      R('Sweetcorn & Spinach Soup', 'China', 's', 210, 6.7, 36.6, 4.1, 5.2, 15, 431, 'vegan', [['Sweetcorn', 108, 9], ['Spinach', 80, 3], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 2, 2], ['Ginger spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Sweetcorn, Spinach and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Ginger spice for 1–2 minutes until fragrant.', 'Add the Sweetcorn, Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Creamy Carrot & Ginger Bisque', 'France', 's', 214, 6, 28.3, 8.5, 5.3, 15, 448, 'vegan', [['Carrot', 190, 8], ['Cashew cream', 30, 4], ['Onion', 30, 2], ['Sweet potato', 30, 2], ['Ginger spice', 8, 2], ['Water', 160, 6]], ['Wash and roughly chop the Carrot and Onion.', 'Add the Carrot and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend until smooth, stir in the cashew cream, and warm through.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Roasted Pumpkin & Pepper Soup', 'USA', 's', 188, 5.6, 30.3, 4.9, 4.7, 15, 485, 'vegan', [['Pumpkin', 150, 6], ['Bell pepper', 100, 4], ['Onion', 30, 2], ['Sweet potato', 35, 3], ['Olive oil', 4, 2], ['Paprika spice', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Pumpkin, Bell pepper and Onion.', 'Heat the olive oil in a pot and sauté the Bell pepper and Onion for 1–2 minutes until fragrant.', 'Add the Pumpkin, Bell pepper and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Broccoli & Cauliflower Soup', 'USA', 's', 188, 6.7, 22.2, 8, 4.7, 15, 478, 'vegan', [['Broccoli', 110, 4], ['Cauliflower', 110, 4], ['Onion', 30, 2], ['Sweet potato', 45, 4], ['Olive oil', 7, 2], ['Garlic spice', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Broccoli, Cauliflower and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Garlic spice for 1–2 minutes until fragrant.', 'Add the Broccoli, Cauliflower and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
      R('Tomato & Spinach Soup', 'Italy', 's', 174, 4.8, 21.2, 7.8, 4.3, 15, 483, 'vegan', [['Tomato', 150, 6], ['Spinach', 90, 4], ['Onion', 30, 2], ['Sweet potato', 40, 3], ['Olive oil', 7, 2], ['Basil herbs', 6, 2], ['Water', 160, 6]], ['Wash and roughly chop the Tomato, Spinach and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Tomato, Spinach and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Minestrone Verde', 'Italy', 's', 202, 6.7, 30.2, 6.1, 5.1, 15, 429, 'vegan', [['Zucchini', 80, 3], ['Spinach', 60, 2], ['Peas', 60, 2], ['Pasta', 18, 3], ['Onion', 30, 2], ['Olive oil', 5, 2], ['Basil herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Zucchini, Spinach and Peas.', 'Heat the olive oil in a pot and sauté the Onion and Basil herbs for 1–2 minutes until fragrant.', 'Add the Zucchini, Spinach and Peas and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Basil herbs, and serve hot.']),
      R('Harvest Vegetable Soup', 'USA', 's', 194, 6.7, 31.3, 4.7, 4.9, 15, 435, 'vegan', [['Carrot', 70, 3], ['Sweetcorn', 67, 5], ['Beans', 9, 2], ['Tomato', 80, 3], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Herbs', 6, 2], ['Water', 170, 7]], ['Wash and roughly chop the Carrot, Sweetcorn and Beans.', 'Heat the olive oil in a pot and sauté the Onion and Herbs for 1–2 minutes until fragrant.', 'Add the Carrot, Sweetcorn and Beans and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with Herbs, and serve hot.']),
      R('Roasted Sweet Potato & Chilli Soup', 'Mexico', 's', 203, 3.8, 39.4, 3.4, 5.1, 15, 439, 'vegan', [['Sweet potato', 168, 13], ['Tomato', 60, 2], ['Onion', 30, 2], ['Olive oil', 3, 2], ['Chili spice', 8, 2], ['Water', 170, 7]], ['Wash and roughly chop the Tomato and Onion.', 'Heat the olive oil in a pot and sauté the Onion and Chili spice for 1–2 minutes until fragrant.', 'Add the Tomato and Onion and stir for 2–3 minutes.', 'Pour in water (and stock if using), bring to a boil, then simmer for 12–15 minutes until everything is soft.', 'Blend to your preferred texture — smooth or lightly chunky.', 'Season, finish with fresh herbs, and serve hot.']),
    ]);

    const seedAll = [...seed, ...lowProtein300];
    const missing = seedAll.filter((s) => !existing.has(s.name));
    for (const r of missing) {
      await this.prisma.recipe.create({ data: r as never }).catch(() => undefined);
    }
    if (missing.length) this.logger.log(`Recipe library topped up: +${missing.length} (total ${existing.size + missing.length}).`);

    // Assign / refresh the "LowProtein 300 (new)" recipe numbers 11223–11522.
    // Idempotent, and updates rows seeded BEFORE numbering — so the old→new
    // mapping always applies on boot (matches even if a recipe already exists).
    for (const r of lowProtein300) {
      await this.prisma.recipe.updateMany({ where: { name: r.name }, data: { recipeNo: r.recipeNo } as never }).catch(() => undefined);
    }
    this.logger.log(`LowProtein 300: recipe numbers 11223–${11223 + lowProtein300.length - 1} assigned (${lowProtein300.length} recipes).`);
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
