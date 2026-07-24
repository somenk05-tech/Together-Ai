import type { MealCategory } from './meal-engine';

/**
 * Curated, real component recipes — the sides, snacks, breakfasts, salads,
 * soups, drinks and condiments that compose a complete meal (spec Rule 8/13/15).
 * Every one owns real ingredients, so the composite meal's grocery list and
 * nutrition are exact and traceable (Rule 10). Mains come from the 11k dataset;
 * these fill the plate roles the dataset covers thinly. Seeded into the Recipe
 * table at boot and tagged with meal categories.
 *
 * Compact tuple form → expanded to full recipe rows by `componentRecipes()`.
 * ing: [name, grams] (per serving). Macros are per serving.
 */
export interface ComponentSeed {
  name: string;
  cuisine: string;              // country/cuisine label (matches CUISINE_BY_COUNTRY inputs)
  categories: MealCategory[];
  role: string;                 // plate role: main|dal|carb|vegetable|dairy|salad|soup|snack|drink|dessert|condiment|breakfast
  kcal: number; protein: number; carbs: number; fat: number; fiber: number;
  minutes: number; grams: number;
  diet: 'vegan' | 'vegetarian' | 'eggetarian' | 'nonveg';
  ing: Array<[string, number]>;
}

const S = (
  name: string, cuisine: string, categories: MealCategory[], role: string,
  m: [number, number, number, number, number], minutes: number, grams: number,
  diet: ComponentSeed['diet'], ing: Array<[string, number]>,
): ComponentSeed => ({
  name, cuisine, categories, role,
  kcal: m[0], protein: m[1], carbs: m[2], fat: m[3], fiber: m[4], minutes, grams, diet, ing,
});

/** Lunch/dinner MAIN curries (the plate's headline protein/main). */
const MAINS: ComponentSeed[] = [
  S('Paneer Butter Masala', 'India', ['lunch', 'dinner'], 'main', [320, 15, 14, 23, 3], 35, 180, 'vegetarian', [['Paneer', 100], ['Tomato', 60], ['Onion', 40], ['Cashews', 12], ['Butter', 10], ['Cooking oil', 6]]),
  S('Palak Paneer', 'India', ['lunch', 'dinner'], 'main', [270, 15, 12, 18, 5], 35, 180, 'vegetarian', [['Paneer', 90], ['Spinach', 120], ['Onion', 30], ['Cooking oil', 8]]),
  S('Mixed Vegetable Curry', 'India', ['lunch', 'dinner'], 'main', [180, 5, 20, 9, 5], 30, 200, 'vegan', [['Mixed vegetables', 160], ['Onion', 40], ['Tomato', 40], ['Cooking oil', 9]]),
  S('Kadhi Pakora', 'India', ['lunch', 'dinner'], 'main', [220, 9, 22, 11, 3], 35, 200, 'vegetarian', [['Curd (yogurt)', 120], ['Gram flour (besan)', 40], ['Onion', 25], ['Cooking oil', 9]]),
  S('Egg Curry', 'India', ['lunch', 'dinner'], 'main', [250, 16, 10, 16, 2], 30, 200, 'eggetarian', [['Eggs', 100], ['Onion', 45], ['Tomato', 45], ['Cooking oil', 9]]),
  S('Chicken Curry', 'India', ['lunch', 'dinner'], 'main', [300, 28, 8, 17, 2], 40, 220, 'nonveg', [['Chicken', 150], ['Onion', 50], ['Tomato', 50], ['Cooking oil', 10]]),
  S('Fish Curry', 'India', ['lunch', 'dinner'], 'main', [260, 26, 8, 13, 2], 35, 220, 'nonveg', [['Fish', 150], ['Onion', 45], ['Tomato', 45], ['Coconut (grated)', 20], ['Cooking oil', 8]]),
  S('Soya Chunk Masala', 'India', ['lunch', 'dinner'], 'main', [240, 20, 18, 9, 6], 30, 200, 'vegan', [['Soya chunks', 60], ['Onion', 45], ['Tomato', 45], ['Cooking oil', 8]]),
  // Low-potassium/phosphorus mains for renal plates (minimal onion/tomato, no dal).
  S('Tofu Capsicum Stir-fry', 'India', ['lunch', 'dinner'], 'main', [200, 14, 8, 12, 3], 20, 150, 'vegan', [['Tofu', 110], ['Capsicum', 40], ['Onion', 15], ['Cooking oil', 6]]),
  S('Grilled Paneer & Peppers', 'India', ['lunch', 'dinner'], 'main', [240, 15, 6, 18, 1], 20, 140, 'vegetarian', [['Paneer', 100], ['Capsicum', 30], ['Cooking oil', 6]]),
  S('Light Egg Curry', 'India', ['lunch', 'dinner'], 'main', [210, 14, 6, 14, 1], 25, 170, 'eggetarian', [['Eggs', 100], ['Onion', 20], ['Capsicum', 20], ['Cooking oil', 7]]),
  // Jain-safe mains (no onion / garlic / root vegetables).
  S('Jain Paneer Tomato Curry', 'India', ['lunch', 'dinner'], 'main', [300, 15, 10, 22, 2], 30, 170, 'vegetarian', [['Paneer', 100], ['Tomato', 50], ['Cashews', 10], ['Cooking oil', 6]]),
  S('Jain Malai Kofta', 'India', ['lunch', 'dinner'], 'main', [320, 12, 18, 22, 3], 40, 180, 'vegetarian', [['Paneer', 70], ['Cabbage', 40], ['Tomato', 40], ['Cashews', 12], ['Cooking oil', 8]]),
];

/** Dals & legume gravies (lunch/dinner protein). */
const DALS: ComponentSeed[] = [
  S('Moong Dal Tadka', 'India', ['side', 'lunch', 'dinner'], 'dal', [150, 9, 20, 4, 5], 25, 180, 'vegan', [['Split moong dal', 40], ['Onion', 30], ['Tomato', 30], ['Ginger-garlic', 6], ['Cooking oil', 6]]),
  S('Toor Dal', 'India', ['side', 'lunch', 'dinner'], 'dal', [160, 9, 22, 4, 5], 30, 180, 'vegan', [['Toor dal', 45], ['Onion', 25], ['Tomato', 30], ['Cooking oil', 6]]),
  S('Masoor Dal', 'India', ['side', 'lunch', 'dinner'], 'dal', [150, 9, 20, 3, 5], 25, 180, 'vegan', [['Masoor dal', 45], ['Onion', 25], ['Tomato', 30], ['Cooking oil', 5]]),
  S('Chana Dal', 'India', ['side', 'lunch', 'dinner'], 'dal', [175, 9, 24, 4, 6], 35, 180, 'vegan', [['Chana dal', 45], ['Onion', 25], ['Tomato', 25], ['Cooking oil', 6]]),
  S('Rajma Masala', 'India', ['lunch', 'dinner', 'side'], 'dal', [190, 10, 27, 4, 7], 40, 200, 'vegan', [['Rajma (kidney beans)', 55], ['Onion', 40], ['Tomato', 40], ['Cooking oil', 7]]),
  S('Chole (Chickpea Masala)', 'India', ['lunch', 'dinner', 'side'], 'dal', [185, 9, 26, 5, 6], 40, 200, 'vegan', [['Chickpeas', 55], ['Onion', 40], ['Tomato', 40], ['Cooking oil', 7]]),
  S('Jain Moong Dal', 'India', ['side', 'lunch', 'dinner'], 'dal', [150, 9, 20, 4, 5], 25, 180, 'vegan', [['Split moong dal', 40], ['Tomato', 30], ['Cumin seeds', 2], ['Cooking oil', 6]]),
];

/** Breads / staples. */
const BREADS: ComponentSeed[] = [
  S('Whole Wheat Roti', 'India', ['side'], 'carb', [110, 3, 18, 3, 3], 15, 40, 'vegan', [['Whole wheat flour', 30], ['Cooking oil', 2]]),
  S('Phulka', 'India', ['side'], 'carb', [90, 3, 16, 1, 3], 15, 35, 'vegan', [['Whole wheat flour', 28]]),
  S('Jowar Roti', 'India', ['side'], 'carb', [95, 3, 18, 1, 4], 18, 40, 'vegan', [['Jowar flour', 30]]),
  S('Bajra Roti', 'India', ['side'], 'carb', [105, 3, 19, 2, 4], 18, 40, 'vegan', [['Bajra flour', 30]]),
];

/** Rice / grains. */
const RICES: ComponentSeed[] = [
  S('Steamed Rice', 'India', ['side'], 'carb', [200, 4, 44, 1, 1], 20, 150, 'vegan', [['Rice', 55]]),
  S('Jeera Rice', 'India', ['side'], 'carb', [210, 4, 42, 4, 1], 20, 150, 'vegan', [['Rice', 55], ['Cooking oil', 4], ['Cumin seeds', 2]]),
  S('Brown Rice', 'India', ['side'], 'carb', [170, 4, 34, 1, 3], 30, 150, 'vegan', [['Brown rice', 50]]),
  S('Foxtail Millet', 'India', ['side'], 'carb', [160, 5, 30, 1, 4], 25, 150, 'vegan', [['Foxtail millet', 50]]),
];

/** Vegetable sabzis (lunch/dinner vegetable). */
const VEGS: ComponentSeed[] = [
  S('Aloo Gobi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [120, 4, 16, 5, 4], 30, 150, 'vegan', [['Potato', 60], ['Cauliflower', 70], ['Onion', 25], ['Cooking oil', 7]]),
  S('Bhindi Sabzi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [110, 3, 12, 6, 4], 25, 130, 'vegan', [['Okra (bhindi)', 110], ['Onion', 20], ['Cooking oil', 7]]),
  S('Mixed Vegetable Sabzi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [100, 3, 13, 4, 4], 25, 150, 'vegan', [['Mixed vegetables', 130], ['Onion', 20], ['Cooking oil', 6]]),
  S('Palak (Sautéed Spinach)', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [80, 4, 6, 4, 4], 20, 120, 'vegan', [['Spinach', 120], ['Garlic', 6], ['Cooking oil', 6]]),
  S('Cauliflower Sabzi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [90, 3, 10, 4, 4], 25, 130, 'vegan', [['Cauliflower', 120], ['Onion', 20], ['Cooking oil', 6]]),
  S('Cabbage Poriyal', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [80, 3, 10, 3, 4], 20, 120, 'vegan', [['Cabbage', 110], ['Coconut (grated)', 10], ['Cooking oil', 5]]),
  S('Green Beans Thoran', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [85, 3, 10, 3, 4], 20, 120, 'vegan', [['Green beans', 110], ['Coconut (grated)', 10], ['Cooking oil', 5]]),
  S('Baingan Bharta', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [110, 3, 12, 6, 5], 35, 150, 'vegan', [['Brinjal (eggplant)', 130], ['Onion', 30], ['Tomato', 30], ['Cooking oil', 7]]),
  // Low-potassium/phosphorus vegetables for renal plates.
  S('Lauki (Bottle Gourd) Sabzi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [70, 2, 9, 3, 3], 25, 150, 'vegan', [['Bottle gourd', 130], ['Cooking oil', 5]]),
  S('Ash Gourd Curry', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [70, 2, 8, 3, 3], 25, 150, 'vegan', [['Ash gourd', 130], ['Cooking oil', 5]]),
  S('Ridge Gourd Sabzi', 'India', ['side', 'lunch', 'dinner'], 'vegetable', [70, 2, 8, 3, 3], 25, 150, 'vegan', [['Ridge gourd', 130], ['Cooking oil', 5]]),
];

/** Dairy / raita. */
const DAIRY: ComponentSeed[] = [
  S('Plain Curd', 'India', ['side', 'condiment'], 'dairy', [60, 4, 5, 3, 0], 2, 100, 'vegetarian', [['Curd (yogurt)', 100]]),
  S('Boondi Raita', 'India', ['side', 'condiment'], 'dairy', [90, 4, 8, 5, 0], 10, 120, 'vegetarian', [['Curd (yogurt)', 100], ['Boondi', 15]]),
  S('Cucumber Raita', 'India', ['side', 'condiment', 'salad'], 'dairy', [70, 4, 6, 3, 1], 8, 120, 'vegetarian', [['Curd (yogurt)', 100], ['Cucumber', 40]]),
];

/** Salads. */
const SALADS: ComponentSeed[] = [
  S('Green Salad', 'India', ['salad', 'side'], 'salad', [35, 2, 6, 0, 2], 8, 120, 'vegan', [['Cucumber', 50], ['Tomato', 40], ['Onion', 20], ['Carrot', 20]]),
  S('Kachumber Salad', 'India', ['salad', 'side'], 'salad', [45, 2, 7, 1, 2], 10, 120, 'vegan', [['Cucumber', 50], ['Tomato', 40], ['Onion', 30], ['Lemon', 5]]),
  S('Sprout Salad', 'India', ['salad', 'snack', 'side'], 'salad', [110, 8, 16, 1, 5], 12, 120, 'vegan', [['Mixed sprouts', 80], ['Onion', 20], ['Tomato', 20], ['Lemon', 5]]),
  S('Carrot-Cucumber Salad', 'India', ['salad', 'side'], 'salad', [40, 1, 8, 0, 2], 8, 120, 'vegan', [['Carrot', 60], ['Cucumber', 50], ['Lemon', 5]]),
];

/** Soups. */
const SOUPS: ComponentSeed[] = [
  S('Tomato Soup', 'India', ['soup', 'snack'], 'soup', [90, 2, 14, 3, 2], 20, 200, 'vegetarian', [['Tomato', 150], ['Onion', 20], ['Butter', 5]]),
  S('Vegetable Clear Soup', 'India', ['soup', 'snack'], 'soup', [70, 3, 10, 2, 3], 20, 200, 'vegan', [['Mixed vegetables', 120], ['Cooking oil', 3]]),
  S('Dal Shorba', 'India', ['soup', 'snack'], 'soup', [110, 6, 15, 2, 4], 25, 200, 'vegan', [['Split moong dal', 30], ['Onion', 20], ['Tomato', 20]]),
];

/** Snacks & drinks (morning + evening snack slots). */
const SNACKS: ComponentSeed[] = [
  S('Fresh Fruit Bowl', 'Global', ['snack', 'dessert'], 'snack', [110, 2, 27, 1, 4], 5, 180, 'vegan', [['Apple', 80], ['Banana', 60], ['Papaya', 60]]),
  S('Mixed Nuts (handful)', 'Global', ['snack'], 'snack', [170, 6, 6, 15, 3], 1, 30, 'vegan', [['Almonds', 12], ['Walnuts', 10], ['Cashews', 8]]),
  S('Roasted Chana', 'India', ['snack'], 'snack', [130, 8, 20, 2, 6], 1, 35, 'vegan', [['Roasted chana', 35]]),
  S('Sprouts Chaat', 'India', ['snack', 'salad'], 'snack', [140, 9, 20, 2, 6], 12, 130, 'vegan', [['Mixed sprouts', 90], ['Onion', 20], ['Tomato', 20], ['Lemon', 5]]),
  S('Buttermilk (Chaas)', 'India', ['drink', 'snack'], 'drink', [60, 3, 5, 2, 0], 3, 200, 'vegetarian', [['Curd (yogurt)', 80], ['Water', 120]]),
  S('Boiled Eggs (2)', 'Global', ['snack'], 'snack', [140, 12, 1, 10, 0], 12, 100, 'eggetarian', [['Eggs', 100]]),
  S('Sweet Corn Cup', 'Global', ['snack'], 'snack', [130, 4, 27, 2, 4], 12, 150, 'vegetarian', [['Sweet corn', 120], ['Butter', 5]]),
  S('Whey Protein Shake', 'Global', ['drink', 'snack'], 'drink', [160, 25, 6, 3, 1], 3, 300, 'vegetarian', [['Whey protein', 32], ['Milk', 250]]),
  S('Sweet Lassi', 'India', ['drink', 'snack'], 'drink', [180, 6, 28, 5, 0], 5, 250, 'vegetarian', [['Curd (yogurt)', 150], ['Sugar', 15], ['Water', 80]]),
  S('Roasted Makhana', 'India', ['snack'], 'snack', [120, 4, 20, 3, 2], 8, 30, 'vegan', [['Makhana (fox nuts)', 30], ['Cooking oil', 3]]),
  S('Fruit & Yogurt Bowl', 'Global', ['snack', 'breakfast'], 'snack', [150, 7, 24, 3, 3], 5, 200, 'vegetarian', [['Curd (yogurt)', 120], ['Apple', 60], ['Banana', 40]]),
  S('Protein Bar', 'Global', ['snack'], 'snack', [200, 15, 22, 6, 3], 1, 55, 'vegetarian', [['Protein bar', 55]]),
];

/** Breakfasts (breakfast slot only — Rule 4). */
const BREAKFASTS: ComponentSeed[] = [
  S('Vegetable Poha', 'India', ['breakfast'], 'breakfast', [230, 5, 40, 6, 3], 20, 200, 'vegan', [['Flattened rice (poha)', 60], ['Onion', 30], ['Potato', 30], ['Peanuts', 12], ['Cooking oil', 7]]),
  S('Vegetable Upma', 'India', ['breakfast'], 'breakfast', [240, 6, 38, 7, 3], 20, 200, 'vegan', [['Semolina (rava)', 60], ['Onion', 25], ['Mixed vegetables', 40], ['Cooking oil', 8]]),
  S('Masala Dosa', 'India', ['breakfast'], 'breakfast', [280, 6, 44, 9, 4], 25, 180, 'vegan', [['Dosa batter', 120], ['Potato', 70], ['Onion', 25], ['Cooking oil', 8]]),
  S('Idli with Sambar', 'India', ['breakfast'], 'breakfast', [250, 9, 45, 4, 5], 25, 250, 'vegan', [['Idli batter', 130], ['Toor dal', 25], ['Mixed vegetables', 40]]),
  S('Aloo Paratha', 'India', ['breakfast'], 'breakfast', [300, 7, 42, 11, 4], 25, 150, 'vegetarian', [['Whole wheat flour', 45], ['Potato', 60], ['Cooking oil', 8]]),
  S('Besan Chilla', 'India', ['breakfast'], 'breakfast', [220, 11, 24, 8, 5], 20, 150, 'vegan', [['Gram flour (besan)', 50], ['Onion', 25], ['Tomato', 25], ['Cooking oil', 7]]),
  S('Moong Dal Chilla', 'India', ['breakfast'], 'breakfast', [210, 12, 26, 5, 5], 22, 150, 'vegan', [['Split moong dal', 50], ['Onion', 25], ['Cooking oil', 6]]),
  S('Vegetable Oats', 'Global', ['breakfast'], 'breakfast', [230, 8, 34, 6, 5], 15, 220, 'vegan', [['Rolled oats', 50], ['Mixed vegetables', 50], ['Cooking oil', 5]]),
  S('Paneer Bhurji', 'India', ['breakfast'], 'breakfast', [280, 16, 8, 20, 2], 20, 160, 'vegetarian', [['Paneer', 90], ['Onion', 30], ['Tomato', 30], ['Cooking oil', 8]]),
  S('Egg Bhurji', 'India', ['breakfast'], 'breakfast', [230, 15, 6, 16, 1], 15, 150, 'eggetarian', [['Eggs', 100], ['Onion', 30], ['Tomato', 30], ['Cooking oil', 7]]),
  S('Methi Thepla', 'India', ['breakfast'], 'breakfast', [250, 7, 36, 9, 4], 25, 130, 'vegan', [['Whole wheat flour', 45], ['Fenugreek leaves', 25], ['Cooking oil', 8]]),
  S('Vegetable Sandwich', 'Global', ['breakfast', 'snack'], 'breakfast', [240, 8, 36, 7, 5], 12, 160, 'vegetarian', [['Whole wheat bread', 60], ['Cucumber', 30], ['Tomato', 30], ['Cheese', 15]]),
  S('Banana Peanut Smoothie', 'Global', ['breakfast', 'drink'], 'breakfast', [260, 10, 36, 9, 4], 6, 300, 'vegetarian', [['Banana', 100], ['Milk', 200], ['Peanut butter', 15]]),
];

/** Desserts (clinically-gated) & condiments. */
const EXTRAS: ComponentSeed[] = [
  S('Fruit Custard', 'Global', ['dessert'], 'dessert', [180, 5, 30, 5, 2], 20, 150, 'vegetarian', [['Milk', 120], ['Custard powder', 15], ['Mixed fruit', 60], ['Sugar', 12]]),
  S('Fruit Salad', 'Global', ['dessert', 'snack'], 'dessert', [120, 2, 28, 1, 4], 8, 180, 'vegan', [['Apple', 60], ['Banana', 50], ['Orange', 60]]),
  S('Coconut Chutney', 'India', ['condiment'], 'condiment', [90, 2, 5, 7, 2], 10, 40, 'vegan', [['Coconut (grated)', 30], ['Roasted gram', 8], ['Cooking oil', 3]]),
  S('Mint Coriander Chutney', 'India', ['condiment'], 'condiment', [30, 1, 4, 1, 1], 8, 30, 'vegan', [['Mint leaves', 15], ['Coriander leaves', 15], ['Lemon', 5]]),
];

export const COMPONENT_SEEDS: ComponentSeed[] = [
  ...MAINS, ...DALS, ...BREADS, ...RICES, ...VEGS, ...DAIRY, ...SALADS, ...SOUPS, ...SNACKS, ...BREAKFASTS, ...EXTRAS,
];

/** Pantry staples — excluded from grocery by default (spec Rule 10 pantry). */
export const PANTRY_STAPLES = [
  'salt', 'black pepper', 'pepper', 'turmeric', 'red chilli powder', 'chilli powder', 'cumin', 'cumin seeds',
  'coriander powder', 'garam masala', 'cooking oil', 'oil', 'ghee', 'mustard seeds', 'asafoetida', 'hing',
  'sugar', 'water', 'curry leaves', 'bay leaf', 'cinnamon', 'cardamom', 'cloves', 'ginger-garlic', 'ginger', 'garlic',
];

export function isPantryStaple(ingredient: string): boolean {
  const n = ingredient.trim().toLowerCase();
  return PANTRY_STAPLES.some((p) => n === p || n.includes(p));
}

/** Stable id for a seeded component recipe (deterministic, no DB needed). */
export function componentId(name: string): string {
  return 'cmp-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Generate concise, real cooking steps for a curated component from its role +
 *  ingredients (HIGH-4) — so every recipe carries instructions, not just macros. */
export function componentSteps(s: ComponentSeed): string[] {
  const names = s.ing.map(([n]) => n.toLowerCase());
  const has = (k: string) => names.some((n) => n.includes(k));
  const prep = 'Prep and chop the ingredients.';
  switch (s.role) {
    case 'dal':
      return [`Rinse the ${s.name.split(' ')[0].toLowerCase()} and pressure-cook with water and a pinch of turmeric until soft.`,
        `Heat oil and temper cumin${has('onion') ? ', then sauté onion' : ''}${has('tomato') ? ' and tomato until soft' : ''}.`,
        'Stir in the cooked dal, simmer 5–7 minutes, season to taste and finish with coriander.'];
    case 'main':
      return [prep,
        `Heat oil${has('onion') ? ', sauté onion' : ''}${has('tomato') ? ' and tomato into a masala' : ''}; add your spices.`,
        `Add the ${has('paneer') ? 'paneer' : has('tofu') ? 'tofu' : has('egg') ? 'eggs' : has('chicken') ? 'chicken' : has('fish') ? 'fish' : 'main ingredient'} and cook through.`,
        'Simmer to the gravy consistency you like, adjust seasoning and serve hot.'];
    case 'vegetable':
      return [`Wash and cut the ${s.name.replace(/sabzi|poriyal|thoran|curry/i, '').trim().toLowerCase()}.`,
        'Heat oil, temper mustard/cumin (and curry leaves), then add the vegetables.',
        'Cook covered until tender, season, and finish with a little coconut or coriander.'];
    case 'carb':
      return has('flour')
        ? ['Knead the flour into a soft dough and rest 10 minutes.', 'Divide, roll into rounds and cook on a hot tawa, flipping until it puffs.']
        : ['Rinse the grain in a couple of changes of water.', 'Cook with measured water until fluffy; rest 5 minutes and fluff with a fork.'];
    case 'salad':
      return ['Wash and finely chop all the vegetables.', 'Toss with lemon juice and a pinch of salt (and roasted cumin), and serve fresh.'];
    case 'dairy':
      return ['Whisk the curd smooth.', has('cucumber') || has('boondi') ? 'Fold in the add-ins, season lightly and chill.' : 'Season lightly and serve chilled.'];
    case 'soup':
      return [prep, 'Simmer the ingredients with water/stock until soft.', 'Blend or strain as needed, season and serve warm.'];
    case 'breakfast':
      return [prep, `Cook the ${s.name.toLowerCase()} on medium heat until done.`, 'Plate hot and serve with chutney or curd as you like.'];
    case 'snack':
    case 'drink':
      return has('shake') || has('smoothie') || has('lassi') || has('buttermilk')
        ? ['Add everything to a blender.', 'Blend until smooth and serve chilled.']
        : ['Assemble/portion the ingredients.', 'Season or garnish lightly and serve.'];
    case 'dessert':
      return [prep, 'Cook/assemble the ingredients and sweeten to taste.', 'Chill and serve.'];
    default:
      return [prep, `Prepare the ${s.name.toLowerCase()} and serve.`];
  }
}
