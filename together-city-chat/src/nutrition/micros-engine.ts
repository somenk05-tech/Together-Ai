/**
 * Micronutrient estimation engine.
 *
 * Recipes carry macros but not micros, so we estimate each day's micronutrient
 * intake from the ACTUAL ingredients of the day's dishes: every recognised
 * ingredient contributes a typical per-dish-share of each nutrient, divided by
 * the recipe's servings and scaled by the optimizer's portion factor. This is
 * an estimate — but a live, food-driven one that responds to what's on the
 * plate (replacing the old hardcoded placeholder percentages).
 *
 * Targets follow ICMR-2020-flavoured adult RDAs, split by sex and adjusted
 * lightly for age. Units: iron/calcium/magnesium/zinc/vitC/vitE in mg,
 * vitA/vitD/B12 in µg.
 */

export interface MicroDef {
  key: string; label: string; unit: string;
  target: (age: number, sex: string) => number;
  /** Related blood-panel marker key (if the panel measures it). */
  marker?: string;
  /** Food-first suggestions, veg-friendly options first. */
  foods: string[];
}

export const MICRO_DEFS: MicroDef[] = [
  { key: 'fe', label: 'Iron', unit: 'mg', marker: 'ferritin', target: (_a, s) => (s === 'female' ? 21 : 17), foods: ['Dals & legumes', 'Spinach / methi', 'Sesame & pumpkin seeds', 'Lean red meat', 'Pair with lemon/amla (vit C) for absorption'] },
  { key: 'ca', label: 'Calcium', unit: 'mg', target: (a) => (a >= 50 ? 1200 : 1000), foods: ['Milk, curd & paneer', 'Ragi (finger millet)', 'Sesame (til)', 'Tofu (calcium-set)', 'Leafy greens'] },
  { key: 'mg', label: 'Magnesium', unit: 'mg', target: (_a, s) => (s === 'female' ? 370 : 440), foods: ['Nuts & seeds', 'Whole grains / millets', 'Legumes', 'Dark leafy greens', 'Banana'] },
  { key: 'zn', label: 'Zinc', unit: 'mg', marker: 'zinc', target: (_a, s) => (s === 'female' ? 13 : 17), foods: ['Legumes & chickpeas', 'Pumpkin & sesame seeds', 'Whole grains', 'Eggs', 'Meat & shellfish'] },
  { key: 'va', label: 'Vit A', unit: 'µg', target: (_a, s) => (s === 'female' ? 840 : 1000), foods: ['Carrot & pumpkin', 'Dark leafy greens', 'Mango & papaya', 'Eggs', 'Milk & ghee'] },
  { key: 'vc', label: 'Vit C', unit: 'mg', target: (_a, s) => (s === 'female' ? 65 : 80), foods: ['Amla & guava', 'Citrus (lemon, orange)', 'Capsicum', 'Tomato', 'Fresh coriander'] },
  { key: 'vd', label: 'Vit D', unit: 'µg', marker: 'vitD', target: () => 15, foods: ['Safe sunlight exposure (15–20 min)', 'Fortified milk', 'Eggs (yolk)', 'Fatty fish (salmon, sardines)', 'Mushrooms (sun-exposed)'] },
  { key: 've', label: 'Vit E', unit: 'mg', target: () => 10, foods: ['Sunflower seeds & almonds', 'Peanuts', 'Vegetable oils', 'Spinach', 'Avocado'] },
  { key: 'b12', label: 'B12', unit: 'µg', marker: 'b12', target: () => 2.2, foods: ['Milk, curd & paneer', 'Eggs', 'Fish & meat', 'Fortified foods', 'Supplement if plant-based (ask your doctor)'] },
];

/** Typical contribution of a recognised ingredient to ONE dish (whole recipe). */
interface Contrib { fe?: number; ca?: number; mg?: number; zn?: number; va?: number; vc?: number; vd?: number; ve?: number; b12?: number }

const INGREDIENT_MICROS: Array<[RegExp, Contrib]> = [
  // legumes / pulses
  [/dal|lentil|masoor|moong|toor|arhar|urad|chana|chickpea|rajma|kidney bean|lobia|beans?\b/i, { fe: 6.6, ca: 80, mg: 140, zn: 3.0, ve: 0.6 }],
  [/soy|tofu|soya/i, { fe: 5.4, ca: 350, mg: 120, zn: 2.4, ve: 0.4 }],
  [/paneer|cottage cheese/i, { ca: 480, zn: 2.4, b12: 0.8, va: 200, vd: 0.4 }],
  [/milk|curd|yogurt|dahi|buttermilk|chaas|cream|cheese/i, { ca: 300, mg: 24, zn: 1.0, b12: 1.1, va: 120, vd: 1.2 }],
  [/egg/i, { fe: 1.8, zn: 1.2, va: 160, vd: 2.0, b12: 0.9, ve: 1.0 }],
  [/chicken|poultry/i, { fe: 1.6, zn: 2.2, b12: 0.6, mg: 40 }],
  [/mutton|lamb|goat|beef|pork/i, { fe: 3.6, zn: 5.4, b12: 2.6, mg: 36 }],
  [/salmon|sardine|mackerel|rohu|hilsa|tuna|fish|prawn|shrimp|seafood/i, { fe: 1.8, zn: 1.6, vd: 8.0, b12: 3.6, mg: 48, ve: 1.2 }],
  // greens & vegetables
  [/spinach|palak|methi|fenugreek leaves|amaranth|saag|greens/i, { fe: 5.4, ca: 180, mg: 130, va: 750, vc: 45, ve: 2.6 }],
  [/broccoli/i, { ca: 80, vc: 90, va: 60, fe: 1.2 }],
  [/carrot|pumpkin|sweet potato/i, { va: 900, vc: 8, mg: 18 }],
  [/tomato/i, { vc: 24, va: 80, fe: 0.6 }],
  [/capsicum|bell pepper|peppers?/i, { vc: 120, va: 60 }],
  [/cauliflower|cabbage/i, { vc: 55, ca: 40, mg: 24 }],
  [/onion|garlic|ginger/i, { vc: 8, mg: 10 }],
  [/potato/i, { vc: 20, mg: 46, fe: 1.6 }],
  [/beetroot/i, { fe: 1.6, mg: 40 }],
  [/peas|matar/i, { fe: 2.4, zn: 1.6, vc: 40 }],
  [/mushroom/i, { vd: 3.6, zn: 1.0, mg: 18 }],
  [/okra|bhindi|brinjal|eggplant|gourd|lauki|tinda|zucchini|cucumber/i, { mg: 28, vc: 16, ca: 40 }],
  // fruit
  [/lemon|lime|amla|citrus|orange|mosambi/i, { vc: 45 }],
  [/guava/i, { vc: 180 }],
  [/mango|papaya/i, { va: 350, vc: 45 }],
  [/banana/i, { mg: 32, vc: 10 }],
  [/apple|pear|grapes|pomegranate/i, { vc: 8, fe: 0.5 }],
  // grains & millets
  [/ragi|finger millet/i, { ca: 340, fe: 3.6, mg: 120 }],
  [/millet|bajra|jowar|quinoa|oats|barley|daliya/i, { fe: 3.0, mg: 110, zn: 1.8 }],
  [/wheat|atta|roti|chapati|paratha|bread/i, { fe: 2.4, mg: 80, zn: 1.6, ve: 0.4 }],
  [/rice|poha|idli|dosa/i, { mg: 40, zn: 1.0, fe: 0.8 }],
  // nuts, seeds, fats
  [/almond|badam/i, { ve: 6.0, ca: 70, mg: 70, fe: 1.0 }],
  [/peanut|groundnut/i, { ve: 2.2, mg: 50, zn: 1.0 }],
  [/cashew|kaju|walnut|pista/i, { mg: 70, zn: 1.4, fe: 1.6 }],
  [/sesame|til|tahini/i, { ca: 260, fe: 3.8, zn: 2.0, mg: 90 }],
  [/flax|chia|sunflower seed|pumpkin seed|seeds/i, { ve: 3.4, mg: 90, zn: 1.8, fe: 1.8 }],
  [/ghee|butter/i, { va: 220, ve: 0.8, vd: 0.3 }],
  [/mustard oil|sunflower oil|vegetable oil|olive oil|oil\b/i, { ve: 3.2 }],
  [/coconut/i, { fe: 1.6, mg: 30 }],
  [/coriander|cilantro|mint|pudina|curry leaves/i, { va: 120, vc: 12, fe: 0.8 }],
];

export interface DayMealForMicros {
  recipeName: string;
  ingredients: Array<{ name: string }>;
  servings: number;
  portionFactor: number; // optimizer portionPct / 100
}

export interface MicroIntake {
  key: string; label: string; unit: string;
  intake: number; target: number; pct: number;
  marker?: string; foods: string[];
  /** Dishes contributing most of this nutrient today. */
  topSources: string[];
}

export function estimateDayMicros(
  meals: DayMealForMicros[], age: number, sex: string,
): MicroIntake[] {
  const totals: Record<string, number> = {};
  const bySource: Record<string, Record<string, number>> = {};
  for (const meal of meals) {
    const per = 1 / Math.max(1, meal.servings);
    for (const ing of meal.ingredients) {
      for (const [re, contrib] of INGREDIENT_MICROS) {
        if (!re.test(ing.name)) continue;
        for (const [k, v] of Object.entries(contrib)) {
          const amt = (v as number) * per * meal.portionFactor;
          totals[k] = (totals[k] ?? 0) + amt;
          (bySource[k] ??= {})[meal.recipeName] = ((bySource[k] ?? {})[meal.recipeName] ?? 0) + amt;
        }
        break; // first matching category per ingredient — avoid double counting
      }
    }
  }
  return MICRO_DEFS.map((def) => {
    const target = def.target(age, sex);
    const raw = totals[def.key] ?? 0;
    const round = def.unit === 'µg' && target < 20 ? (n: number) => Math.round(n * 10) / 10 : Math.round;
    const intake = round(raw);
    const pct = target > 0 ? Math.round((raw / target) * 100) : 0;
    const topSources = Object.entries(bySource[def.key] ?? {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    return { key: def.key, label: def.label, unit: def.unit, intake, target, pct, marker: def.marker, foods: def.foods, topSources };
  });
}
