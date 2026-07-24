/**
 * Ingredient → clinically-capped nutrients, per 100 g raw (Workstream A / CRIT-1).
 * Approximate values from standard food-composition references (IFCT/USDA order
 * of magnitude) for the nutrients the MNT rules actually cap: sodium,
 * potassium, phosphorus, sugar and saturated fat. Recipe nutrients are computed
 * from ingredient quantities so a renal/HTN/diabetic plan can be verified
 * against caps on the plate, not just the prescription.
 *
 * na/k/p in mg; sug/sfat in g — all per 100 g of the ingredient.
 */
export interface NutrientSet { na: number; k: number; p: number; sug: number; sfat: number; addedSug: number }

/** Ingredients that contribute ADDED sugar (what the diabetes cap actually limits). */
const ADDED_SUGAR = ['sugar', 'jaggery', 'honey', 'custard powder', 'condensed milk', 'syrup'];
function isAddedSugar(name: string): boolean {
  const n = name.trim().toLowerCase();
  return ADDED_SUGAR.some((a) => n.includes(a));
}

const T: Record<string, [number, number, number, number, number]> = {
  // [na, k, p, sugar, satfat] per 100 g
  'split moong dal': [27, 1150, 370, 1.5, 0.1],
  'toor dal': [30, 1390, 370, 2, 0.2],
  'masoor dal': [10, 950, 350, 2, 0.1],
  'chana dal': [40, 720, 300, 3, 0.3],
  'rajma (kidney beans)': [12, 1400, 400, 2, 0.1],
  'chickpeas': [24, 875, 366, 3, 0.6],
  'soya chunks': [3, 1700, 600, 10, 0.5],
  'onion': [4, 146, 29, 4.2, 0.02],
  'tomato': [5, 237, 24, 2.6, 0.03],
  'ginger-garlic': [15, 400, 150, 1, 0.1],
  'garlic': [17, 401, 153, 1, 0.1],
  'cooking oil': [0, 0, 0, 0, 14],
  'butter': [640, 24, 24, 0.1, 51],
  'ghee': [0, 0, 0, 0, 62],
  'whole wheat flour': [2, 360, 320, 0.4, 0.3],
  'jowar flour': [6, 350, 290, 2, 0.5],
  'bajra flour': [10, 300, 290, 2, 0.7],
  'rice': [5, 115, 115, 0.1, 0.2],
  'brown rice': [7, 268, 264, 0.7, 0.3],
  'foxtail millet': [4, 250, 290, 0.6, 0.6],
  'semolina (rava)': [1, 186, 136, 0.3, 0.2],
  'potato': [6, 421, 57, 0.8, 0.03],
  'cauliflower': [30, 299, 44, 1.9, 0.1],
  'okra (bhindi)': [7, 299, 61, 1.5, 0.03],
  'mixed vegetables': [40, 300, 60, 3, 0.1],
  'spinach': [79, 558, 49, 0.4, 0.06],
  'coconut (grated)': [20, 356, 113, 6, 30],
  'green beans': [6, 211, 38, 3.3, 0.05],
  'capsicum': [3, 175, 20, 2.5, 0.03],
  'bell pepper': [3, 175, 20, 2.5, 0.03],
  'bottle gourd': [2, 150, 13, 1, 0.02],
  'ash gourd': [10, 100, 20, 1.5, 0.01],
  'ridge gourd': [3, 140, 26, 1.5, 0.02],
  'brinjal (eggplant)': [2, 229, 24, 3.5, 0.03],
  'curd (yogurt)': [46, 155, 95, 4.7, 1.8],
  'boondi': [200, 100, 120, 1, 3],
  'cucumber': [2, 147, 24, 1.7, 0.01],
  'carrot': [69, 320, 35, 4.7, 0.03],
  'lemon': [2, 138, 16, 2.5, 0.04],
  'mixed sprouts': [15, 450, 200, 3, 0.2],
  'cumin seeds': [168, 1788, 499, 2, 1.5],
  'whey protein': [200, 400, 300, 5, 1],
  'milk': [44, 150, 92, 5, 1.9],
  'sugar': [0, 2, 0, 100, 0],
  'water': [0, 0, 0, 0, 0],
  'roasted chana': [40, 720, 300, 3, 0.5],
  'roasted gram': [40, 720, 300, 3, 0.5],
  'almonds': [1, 733, 481, 4.4, 3.7],
  'walnuts': [2, 441, 346, 2.6, 6],
  'cashews': [12, 660, 490, 6, 8],
  'peanuts': [18, 705, 376, 4, 7],
  'peanut butter': [400, 550, 350, 9, 10],
  'eggs': [124, 126, 198, 1.1, 3.1],
  'sweet corn': [15, 270, 89, 3.2, 0.2],
  'makhana (fox nuts)': [20, 500, 200, 0.1, 0.1],
  'apple': [1, 107, 11, 10, 0.03],
  'banana': [1, 358, 22, 12, 0.1],
  'papaya': [8, 182, 10, 8, 0.03],
  'orange': [0, 181, 14, 9, 0.02],
  'mixed fruit': [3, 200, 15, 10, 0.05],
  'paneer': [18, 138, 130, 1.2, 12],
  'tofu': [7, 121, 97, 0.6, 0.7],
  'dosa batter': [250, 90, 80, 0.5, 0.2],
  'idli batter': [250, 90, 80, 0.5, 0.2],
  'gram flour (besan)': [64, 846, 318, 3, 0.6],
  'rolled oats': [2, 350, 410, 1, 1.2],
  'fenugreek leaves': [76, 770, 51, 1, 0.1],
  'whole wheat bread': [400, 254, 200, 5, 0.6],
  'cheese': [620, 98, 500, 0.5, 19],
  'mint leaves': [30, 458, 73, 0, 0.07],
  'coriander leaves': [46, 521, 48, 0.9, 0.01],
  'custard powder': [100, 20, 10, 85, 0.1],
  'fish': [60, 380, 240, 0, 1],
  'chicken': [70, 256, 200, 0, 2.7],
  'protein bar': [200, 250, 200, 15, 3],
};

/** Look up an ingredient's nutrients (exact, then paren-stripped, then keyword). */
function lookup(name: string): [number, number, number, number, number] | null {
  const n = name.trim().toLowerCase();
  if (T[n]) return T[n];
  const bare = n.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (T[bare]) return T[bare];
  for (const key of Object.keys(T)) {
    const kb = key.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (n.includes(kb) || bare.includes(kb)) return T[key];
  }
  return null;
}

/**
 * Compute a recipe's capped-nutrient totals from its ingredient quantities.
 * `complete` is false if any ingredient couldn't be resolved — so clinical
 * enforcement can exclude nutrition-incomplete recipes from capped roles.
 */
export function computeNutrients(ingredients: Array<{ name: string; grams: number }>): NutrientSet & { complete: boolean } {
  let na = 0, k = 0, p = 0, sug = 0, sfat = 0, addedSug = 0, complete = ingredients.length > 0;
  for (const ing of ingredients) {
    const v = lookup(ing.name);
    if (!v) { complete = false; continue; }
    const f = ing.grams / 100;
    na += v[0] * f; k += v[1] * f; p += v[2] * f; sfat += v[4] * f;
    const s = v[3] * f;
    sug += s;
    if (isAddedSugar(ing.name)) addedSug += s;
  }
  return {
    na: Math.round(na), k: Math.round(k), p: Math.round(p),
    sug: Math.round(sug * 10) / 10, sfat: Math.round(sfat * 10) / 10, addedSug: Math.round(addedSug * 10) / 10, complete,
  };
}
