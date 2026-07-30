import { screenRecipe, type DietKey } from './diet-tags';

/**
 * Where a citizen's protein can come from, given what they eat (BE-8.3).
 *
 * p9's complaint was that a vegetarian was being shown non-veg and egg protein
 * sources. The fix that matters is not a second veg-only list — a second list is
 * how the first one drifts. Every entry here is filtered through the SAME
 * screenRecipe() that decides whether a recipe may be served, so "no meat for a
 * Jain user" is true for the same reason in both places, and a change to the
 * rule reaches both at once.
 *
 * COMPLEMENTARY PAIRING is the part with real nutritional content and the part
 * a plant-forward plan actually needs. Cereals are limiting in lysine; pulses
 * are limiting in methionine. Eaten together across a day they cover each
 * other, which is why dal-chawal, khichdi, idli (rice and urad) and rajma-chawal
 * are the shape they are. `pairsWith` names the partner group, so a plan can say
 * WHY it put those two things on one plate.
 *
 * PROVENANCE, stated plainly: the per-100g figures are approximate, of the same
 * order and from the same class of source as ingredient-nutrients.ts —
 * standard food-composition references (IFCT for Indian foods, USDA otherwise).
 * They are good enough to rank sources and to compose a plate, and they are not
 * a substitute for a licensed table. Whether this app gets one is BE-10.3's open
 * question; when it does, these rows should be replaced with sourced values
 * rather than corrected in place.
 *
 * Values are per 100 g of the food AS LISTED — dals, grains and soya chunks dry,
 * everything else as eaten. Mixing dry and cooked weights is the classic way to
 * overstate a plant-based plan by a factor of three.
 */

export type ProteinGroup =
  | 'dal' | 'legume' | 'soy' | 'dairy' | 'nut' | 'seed' | 'grain' | 'millet'
  | 'egg' | 'fish' | 'meat';

export interface ProteinSource {
  key: string;
  label: string;
  group: ProteinGroup;
  /** Grams of protein per 100 g of the food as listed. */
  proteinPer100g: number;
  /** True when the figure is for the dry weight — the number that misleads. */
  dry?: boolean;
  /** The ingredient name the diet screen is run against. */
  ingredient: string;
  /** Groups this completes the amino-acid profile of. */
  pairsWith?: ProteinGroup[];
  note?: string;
}

export const PROTEIN_SOURCES: ProteinSource[] = [
  // ── Dals ────────────────────────────────────────────────────────────
  { key: 'toor', label: 'Toor / arhar dal', group: 'dal', proteinPer100g: 22, dry: true, ingredient: 'Toor dal', pairsWith: ['grain', 'millet'], note: 'The everyday dal. Low in methionine — rice or roti covers it.' },
  { key: 'moong', label: 'Moong dal', group: 'dal', proteinPer100g: 24, dry: true, ingredient: 'Moong dal', pairsWith: ['grain', 'millet'], note: 'The easiest dal to digest; the one to reach for when appetite is poor.' },
  { key: 'masoor', label: 'Masoor dal', group: 'dal', proteinPer100g: 25, dry: true, ingredient: 'Masoor dal', pairsWith: ['grain', 'millet'] },
  { key: 'chana-dal', label: 'Chana dal', group: 'dal', proteinPer100g: 20, dry: true, ingredient: 'Chana dal', pairsWith: ['grain', 'millet'] },
  { key: 'urad', label: 'Urad dal', group: 'dal', proteinPer100g: 25, dry: true, ingredient: 'Urad dal', pairsWith: ['grain'], note: 'With rice this is idli and dosa — a complete protein by fermentation, not by accident.' },

  // ── Legumes ─────────────────────────────────────────────────────────
  { key: 'rajma', label: 'Rajma (kidney beans)', group: 'legume', proteinPer100g: 22, dry: true, ingredient: 'Kidney beans', pairsWith: ['grain'] },
  { key: 'chana', label: 'Chickpeas (chana)', group: 'legume', proteinPer100g: 19, dry: true, ingredient: 'Chickpeas', pairsWith: ['grain', 'millet'] },
  { key: 'kala-chana', label: 'Black chana', group: 'legume', proteinPer100g: 21, dry: true, ingredient: 'Black chickpeas', pairsWith: ['grain'] },
  { key: 'lobia', label: 'Black-eyed peas (lobia)', group: 'legume', proteinPer100g: 24, dry: true, ingredient: 'Black-eyed peas', pairsWith: ['grain'] },

  // ── Soy ─────────────────────────────────────────────────────────────
  { key: 'soya-chunks', label: 'Soya chunks', group: 'soy', proteinPer100g: 52, dry: true, ingredient: 'Soya chunks', note: 'The densest plant protein available cheaply. Dry weight — they roughly triple when soaked.' },
  { key: 'tofu', label: 'Tofu', group: 'soy', proteinPer100g: 12, ingredient: 'Tofu', note: 'A complete protein on its own; no pairing needed.' },
  { key: 'tempeh', label: 'Tempeh', group: 'soy', proteinPer100g: 19, ingredient: 'Tempeh' },

  // ── Dairy ───────────────────────────────────────────────────────────
  { key: 'paneer', label: 'Paneer', group: 'dairy', proteinPer100g: 18, ingredient: 'Paneer', note: 'Complete protein, and the one most Indian vegetarian plans lean on.' },
  { key: 'curd', label: 'Curd (dahi)', group: 'dairy', proteinPer100g: 3.5, ingredient: 'Curd' },
  { key: 'greek-yogurt', label: 'Greek yogurt', group: 'dairy', proteinPer100g: 9, ingredient: 'Greek yogurt' },
  { key: 'milk', label: 'Milk', group: 'dairy', proteinPer100g: 3.2, ingredient: 'Milk' },

  // ── Nuts & seeds ────────────────────────────────────────────────────
  { key: 'peanut', label: 'Peanuts', group: 'nut', proteinPer100g: 25, ingredient: 'Peanuts' },
  { key: 'almond', label: 'Almonds', group: 'nut', proteinPer100g: 21, ingredient: 'Almonds' },
  { key: 'cashew', label: 'Cashews', group: 'nut', proteinPer100g: 18, ingredient: 'Cashews' },
  { key: 'pumpkin-seed', label: 'Pumpkin seeds', group: 'seed', proteinPer100g: 30, ingredient: 'Pumpkin seeds' },
  { key: 'sunflower-seed', label: 'Sunflower seeds', group: 'seed', proteinPer100g: 21, ingredient: 'Sunflower seeds' },
  { key: 'sesame', label: 'Sesame seeds (til)', group: 'seed', proteinPer100g: 18, ingredient: 'Sesame seeds', pairsWith: ['dal', 'legume'], note: 'High in methionine — the amino acid dals are short of.' },
  { key: 'flax', label: 'Flaxseed', group: 'seed', proteinPer100g: 18, ingredient: 'Flaxseed' },
  { key: 'chia', label: 'Chia seeds', group: 'seed', proteinPer100g: 17, ingredient: 'Chia seeds' },

  // ── Grains & millets ────────────────────────────────────────────────
  { key: 'quinoa', label: 'Quinoa', group: 'grain', proteinPer100g: 14, dry: true, ingredient: 'Quinoa', note: 'Complete on its own, unusually for a grain.' },
  { key: 'oats', label: 'Oats', group: 'grain', proteinPer100g: 13, dry: true, ingredient: 'Oats', pairsWith: ['dal', 'legume'] },
  { key: 'wheat', label: 'Whole wheat (atta)', group: 'grain', proteinPer100g: 12, dry: true, ingredient: 'Wheat flour', pairsWith: ['dal', 'legume'] },
  { key: 'brown-rice', label: 'Brown rice', group: 'grain', proteinPer100g: 7.5, dry: true, ingredient: 'Brown rice', pairsWith: ['dal', 'legume'] },
  { key: 'rajgira', label: 'Amaranth (rajgira)', group: 'millet', proteinPer100g: 14, dry: true, ingredient: 'Amaranth', pairsWith: ['dal'] },
  { key: 'bajra', label: 'Bajra (pearl millet)', group: 'millet', proteinPer100g: 11, dry: true, ingredient: 'Bajra', pairsWith: ['dal', 'legume'] },
  { key: 'jowar', label: 'Jowar (sorghum)', group: 'millet', proteinPer100g: 10, dry: true, ingredient: 'Jowar', pairsWith: ['dal', 'legume'] },
  { key: 'ragi', label: 'Ragi (finger millet)', group: 'millet', proteinPer100g: 7, dry: true, ingredient: 'Ragi', pairsWith: ['dal', 'legume'], note: 'Modest protein; it is here for calcium as much as anything.' },

  // ── Animal sources ──────────────────────────────────────────────────
  { key: 'egg', label: 'Egg', group: 'egg', proteinPer100g: 13, ingredient: 'Egg' },
  { key: 'chicken', label: 'Chicken', group: 'meat', proteinPer100g: 23, ingredient: 'Chicken' },
  { key: 'mutton', label: 'Mutton', group: 'meat', proteinPer100g: 21, ingredient: 'Mutton' },
  { key: 'fish', label: 'Fish', group: 'fish', proteinPer100g: 17, ingredient: 'Fish' },
  { key: 'prawn', label: 'Prawns', group: 'fish', proteinPer100g: 20, ingredient: 'Prawns' },
];

/**
 * The sources this citizen may actually eat, richest first.
 *
 * Screened by the shared rule, not by a hand-kept veg list. A source is offered
 * only if a dish made of it would be allowed.
 */
export function proteinSourcesFor(diet: string): ProteinSource[] {
  return PROTEIN_SOURCES
    .filter((s) => screenRecipe(diet, [s.ingredient]).ok)
    .sort((a, b) => b.proteinPer100g - a.proteinPer100g);
}

/**
 * Pairings worth naming to this citizen — a cereal and a pulse they can both
 * eat, which between them make a complete protein.
 */
export function complementaryPairsFor(diet: string): { a: ProteinSource; b: ProteinSource; why: string }[] {
  const allowed = proteinSourcesFor(diet);
  const out: { a: ProteinSource; b: ProteinSource; why: string }[] = [];
  for (const a of allowed) {
    for (const g of a.pairsWith ?? []) {
      const b = allowed.find((x) => x.group === g && x.key !== a.key);
      if (!b) continue;
      if (out.some((p) => p.a.key === b.key && p.b.key === a.key)) continue;
      out.push({
        a, b,
        why: `${a.label} is short of one amino acid that ${b.label} supplies, and the other way round — together they make a complete protein.`,
      });
    }
  }
  return out;
}

/** Grams of this food needed to supply a given amount of protein. */
export function gramsForProtein(source: ProteinSource, proteinG: number): number {
  return Math.round((proteinG / source.proteinPer100g) * 100);
}

/** Every diet this module is expected to answer for. */
export const SCREENED_DIETS: DietKey[] = ['vegan', 'jain', 'vegetarian', 'veg', 'egg', 'pesc', 'nonveg'];
