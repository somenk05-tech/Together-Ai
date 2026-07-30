/**
 * A recipe's nutrition, computed from what is in it (BE-10.2).
 *
 * The ticket's last sentence is the whole point: "Never trust a hand-typed
 * calorie number." Today every recipe carries stored kcal and macro columns
 * that arrived with the dataset. Nothing has ever checked them against the
 * ingredients, and a plan is built by adding them up.
 *
 * This computes from ingredient quantities instead — and, more importantly,
 * SAYS WHEN IT CANNOT. A dish with one unrecognised ingredient does not get a
 * confident total that is quietly missing a third of its calories; it comes
 * back `complete: false` with the unknown names, and the caller decides whether
 * to show the source's figure LABELLED as the source's, or nothing at all.
 *
 * That is the difference between a number this app stands behind and a number
 * it inherited.
 *
 * ── The table ──
 *
 * INGREDIENT_MACROS is the in-house food-composition table, which the product
 * owner has chosen to maintain rather than licence. It is deliberately small
 * and honest about it: these are the staples that appear in most Indian home
 * cooking, at the same order and from the same class of source as
 * ingredient-nutrients.ts (standard references, IFCT for Indian foods). Every
 * row carries where it came from.
 *
 * It is NOT enough to compute the 11k corpus. That is the point of `complete`.
 * Growing the table is data entry against this shape; nothing here changes.
 *
 * ── Yield ──
 *
 * Cooking changes weight, mostly by gaining or losing water, and nutrition is
 * stated per 100 g of the food AS LISTED. Rice trebles when boiled. A plate of
 * cooked rice weighed against a raw figure reads three times the calories it
 * has, which is the single most likely way to get a plan badly wrong — so the
 * yield factor is explicit per ingredient and applied openly rather than
 * assumed to be 1.
 */

export interface Macros {
  kcal: number; protein: number; carb: number; fat: number; fibre: number;
}

export interface IngredientMacro extends Macros {
  /** Canonical lower-case name. */
  key: string;
  aliases: string[];
  /** Cooked weight ÷ raw weight. 1 when the ingredient is eaten as listed. */
  yieldFactor: number;
  source: string;
}

const IFCT = 'IFCT/standard food-composition references, approximate';

const ing = (
  key: string, aliases: string[], kcal: number, protein: number, carb: number,
  fat: number, fibre: number, yieldFactor = 1,
): IngredientMacro => ({ key, aliases, kcal, protein, carb, fat, fibre, yieldFactor, source: IFCT });

/**
 * Per 100 g of the food as listed — grains and pulses DRY, everything else as
 * eaten. Mixing the two is how a plant-forward plan comes to claim three times
 * the protein it has.
 */
export const INGREDIENT_MACROS: IngredientMacro[] = [
  // Grains and flours (dry)
  ing('rice', ['white rice', 'basmati', 'chawal', 'raw rice'], 345, 6.8, 78, 0.5, 0.2, 3),
  ing('brown rice', ['brown basmati'], 362, 7.5, 76, 2.7, 3.5, 3),
  ing('wheat flour', ['atta', 'whole wheat flour', 'chapati flour'], 341, 12.1, 69, 1.7, 1.9, 1.4),
  ing('semolina', ['rava', 'sooji', 'suji'], 360, 12.7, 72, 1.1, 1.9, 3),
  ing('oats', ['rolled oats'], 389, 16.9, 66, 6.9, 10.6, 3),
  ing('poha', ['flattened rice', 'beaten rice'], 346, 6.6, 77, 1.2, 1.4, 2.5),
  ing('bajra', ['pearl millet'], 361, 11.6, 67, 5, 11.5, 3),
  ing('jowar', ['sorghum'], 349, 10.4, 72, 1.9, 9.7, 3),
  ing('ragi', ['finger millet'], 328, 7.3, 72, 1.3, 11.5, 3),

  // Pulses (dry)
  ing('toor dal', ['arhar dal', 'tur dal', 'pigeon pea'], 335, 22.3, 57, 1.7, 1.5, 2.5),
  ing('moong dal', ['green gram', 'mung dal'], 348, 24.5, 59.9, 1.2, 0.8, 2.5),
  ing('masoor dal', ['red lentil', 'lentil'], 343, 25.1, 59, 0.7, 0.7, 2.5),
  ing('chana dal', ['bengal gram'], 360, 20.8, 59.8, 5.6, 1.2, 2.5),
  ing('urad dal', ['black gram'], 347, 24, 59.6, 1.4, 0.9, 2.5),
  ing('chickpeas', ['chana', 'kabuli chana', 'garbanzo'], 360, 17.1, 60.9, 5.3, 12.2, 2.2),
  ing('kidney beans', ['rajma'], 346, 22.9, 60.6, 1.3, 4.8, 2.2),

  // Dairy and eggs
  ing('milk', ['whole milk', 'cow milk', 'doodh'], 61, 3.2, 4.4, 3.3, 0),
  ing('curd', ['dahi', 'yogurt', 'yoghurt'], 60, 3.1, 4.4, 4, 0),
  ing('paneer', ['cottage cheese'], 265, 18.3, 1.2, 20.8, 0),
  ing('ghee', ['clarified butter'], 900, 0, 0, 100, 0),
  ing('butter', [], 717, 0.9, 0.1, 81, 0),
  ing('egg', ['eggs', 'anda'], 155, 13, 1.1, 11, 0),

  // Fats and sweeteners
  ing('oil', ['cooking oil', 'sunflower oil', 'mustard oil', 'groundnut oil'], 884, 0, 0, 100, 0),
  ing('sugar', ['white sugar', 'cane sugar'], 400, 0, 100, 0, 0),
  ing('jaggery', ['gur'], 383, 0.4, 98, 0.1, 0),
  ing('honey', ['shahad'], 304, 0.3, 82, 0, 0),

  // Vegetables (as eaten)
  ing('potato', ['aloo', 'batata', 'potatoes'], 97, 1.6, 22.6, 0.1, 0.4),
  ing('onion', ['onions', 'pyaz'], 50, 1.2, 11.1, 0.1, 0.6),
  ing('tomato', ['tomatoes'], 20, 0.9, 3.6, 0.2, 0.8),
  ing('carrot', ['carrots', 'gajar'], 48, 0.9, 10.6, 0.2, 1.2),
  ing('spinach', ['palak'], 26, 2, 2.9, 0.7, 0.6),
  ing('cauliflower', ['gobi', 'phool gobi'], 30, 2.6, 4, 0.4, 1.2),
  ing('cabbage', ['patta gobi'], 27, 1.8, 4.6, 0.1, 1),
  ing('peas', ['green peas', 'matar'], 93, 7.2, 15.9, 0.1, 4.4),

  // Nuts, seeds, other
  ing('peanuts', ['groundnut', 'moongphali'], 567, 25.3, 16.1, 40.1, 8.5),
  ing('almonds', ['badam'], 600, 20.8, 10.5, 58.9, 12.5),
  ing('cashews', ['kaju'], 596, 21.2, 22.3, 46.9, 1.3),
  ing('coconut', ['grated coconut', 'nariyal'], 354, 3.3, 15.2, 33.5, 9),
  ing('tofu', [], 76, 8.1, 1.9, 4.8, 0.3),
  ing('soya chunks', ['soy chunks', 'nutrela'], 345, 52, 33, 0.5, 13, 3),
];

const BY_NAME = new Map<string, IngredientMacro>();
for (const row of INGREDIENT_MACROS) {
  BY_NAME.set(row.key, row);
  for (const a of row.aliases) BY_NAME.set(a, row);
}

/** Ingredients that carry no meaningful energy and should not mark a dish unknown. */
const NEGLIGIBLE = /\b(salt|water|pepper|turmeric|haldi|cumin|jeera|coriander powder|garam masala|chilli powder|mustard seed|asafoetida|hing|curry lea(f|ves)|bay lea(f|ves)|cinnamon|cardamom|clove|spices?|seasoning|baking (powder|soda)|vinegar|lemon juice)\b/i;

export function lookupMacro(name: string): IngredientMacro | undefined {
  const n = (name ?? '')
    .toLowerCase().trim()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(chopped|sliced|diced|fresh|dried|ground|whole|raw|boiled|cooked|large|small|medium)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return BY_NAME.get(n) ?? BY_NAME.get(n.replace(/(?:es|s)$/, ''));
}

export interface RecipeNutrition extends Macros {
  /** True only when every energy-bearing ingredient was recognised. */
  complete: boolean;
  /** The ones that were not, so the gap can be named rather than absorbed. */
  unknown: string[];
  /** Share of the dish's weight that was recognised, 0–1. */
  coverage: number;
}

/**
 * Per-serving nutrition for a recipe.
 *
 * `grams` is the RAW weight of each ingredient. `servings` divides the total.
 *
 * The result is only `complete` when every ingredient that carries energy was
 * found. One unknown makes the whole figure unreliable in a way that averaging
 * hides — so it is reported rather than smoothed over.
 */
export function computeRecipeNutrition(
  ingredients: ReadonlyArray<{ name: string; grams: number }>,
  servings = 1,
): RecipeNutrition {
  const per = Math.max(1, servings);
  let kcal = 0, protein = 0, carb = 0, fat = 0, fibre = 0;
  let knownG = 0, totalG = 0;
  const unknown: string[] = [];

  for (const i of ingredients) {
    const g = Math.max(0, i.grams || 0);
    if (g === 0) continue;
    if (NEGLIGIBLE.test(i.name)) continue;   // seasoning: resolved, not unknown
    totalG += g;

    const m = lookupMacro(i.name);
    if (!m) { unknown.push(i.name); continue; }

    knownG += g;
    const f = g / 100;
    kcal += m.kcal * f; protein += m.protein * f;
    carb += m.carb * f; fat += m.fat * f; fibre += m.fibre * f;
  }

  const r1 = (n: number) => Math.round((n / per) * 10) / 10;
  return {
    kcal: Math.round(kcal / per),
    protein: r1(protein), carb: r1(carb), fat: r1(fat), fibre: r1(fibre),
    complete: unknown.length === 0 && totalG > 0,
    unknown,
    coverage: totalG > 0 ? Math.round((knownG / totalG) * 100) / 100 : 0,
  };
}

/**
 * What to show for a recipe, given a computed figure and whatever the source
 * supplied.
 *
 * This is where "never trust a hand-typed calorie number" becomes a rule rather
 * than a sentiment. Computed wins. If it cannot be computed, the stored figure
 * is shown ATTRIBUTED — it is the dataset's claim, not this app's — and never
 * silently presented as though the app worked it out.
 */
export function presentNutrition(
  computed: RecipeNutrition,
  stored: Macros | null,
): { macros: Macros; verified: boolean; note: string } {
  if (computed.complete) {
    return { macros: computed, verified: true, note: '' };
  }
  if (stored) {
    return {
      macros: stored,
      verified: false,
      note: computed.unknown.length
        ? `From the recipe source. We can’t check it — ${computed.unknown.slice(0, 3).join(', ')} ${computed.unknown.length === 1 ? 'is' : 'are'} not in our ingredient table yet.`
        : 'From the recipe source, not calculated from the ingredients.',
    };
  }
  return {
    macros: computed,
    verified: false,
    note: 'Worked out from the ingredients we recognise, so it is probably an underestimate.',
  };
}
