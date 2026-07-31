/**
 * Ingredient → clinically-capped nutrients, per 100 g raw (Workstream A / CRIT-1).
 * Approximate values from standard food-composition references (IFCT/USDA order
 * of magnitude) for the nutrients the MNT rules actually cap: sodium,
 * potassium, phosphorus, sugar and saturated fat. Recipe nutrients are computed
 * from ingredient quantities so a renal/HTN/diabetic plan can be verified
 * against caps on the plate, not just the prescription.
 *
 * na/k/p in mg; sug/sfat in g — all per 100 g of the ingredient.
 *
 * Round-2 remediation (QA C1/H1): salt is now modeled (with a per-serving clamp
 * so the dataset's absurd "salt: 30 g" rows can't blow up sodium), the table is
 * broadened to the highest-frequency dataset ingredients, several loose
 * mismatches (tomato paste→tomato, chicken liver→chicken, coconut milk→grated
 * coconut) get their own correct rows, and common spices/herbs/leavening resolve
 * to a negligible value so a recipe is no longer marked nutrition-INCOMPLETE
 * (and silently under-counted) just because it seasons with cumin or pepper.
 */
export interface NutrientSet { na: number; k: number; p: number; sug: number; sfat: number; addedSug: number }

/** Ingredients that contribute ADDED sugar (what the diabetes cap actually limits). */
const ADDED_SUGAR = [
  'sugar', 'jaggery', 'honey', 'custard powder', 'condensed milk', 'syrup',
  'jam', 'ketchup', 'chocolate', 'maple', 'caramel', 'nutella', 'gulab jamun',
  'cane sugar', 'brown sugar', 'icing', 'marmalade', 'molasses', 'graham',
  'hoisin', 'barbecue', 'bbq', 'teriyaki', 'sriracha', 'whipped topping',
];
function isAddedSugar(name: string): boolean {
  const n = name.trim().toLowerCase();
  return ADDED_SUGAR.some((a) => n.includes(a));
}

/** Salt (any variety) — modeled explicitly with a hard per-serving gram clamp. */
const SALT_SODIUM_PER_100G = 38758; // mg
const SALT_MAX_GRAMS_PER_SERVING = 1; // realistic per-dish added-salt ceiling (~388 mg Na)
export function isSalt(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s*\(.*?\)\s*/g, '').trim();
  return n === 'salt' || /\b(table|sea|rock|black|pink|kosher|iodized|iodised) salt$/.test(n) || n.endsWith(' salt');
}

const T: Record<string, [number, number, number, number, number]> = {
  // [na, k, p, sugar, satfat] per 100 g
  // ── pulses / dals ──
  'split moong dal': [27, 1150, 370, 1.5, 0.1],
  'toor dal': [30, 1390, 370, 2, 0.2],
  'masoor dal': [10, 950, 350, 2, 0.1],
  'chana dal': [40, 720, 300, 3, 0.3],
  'urad dal': [38, 983, 385, 1.5, 0.2],
  'rajma (kidney beans)': [12, 1400, 400, 2, 0.1],
  'black beans': [1, 1483, 352, 0.6, 0.1],
  'black-eyed peas': [16, 1112, 424, 6.9, 0.1],
  'chickpeas': [24, 875, 366, 3, 0.6],
  'green peas': [5, 244, 108, 5.7, 0.07],
  'lentils': [6, 955, 351, 2, 0.1],
  'soya chunks': [3, 1700, 600, 10, 0.5],
  'mixed sprouts': [15, 450, 200, 3, 0.2],
  // ── aromatics / veg ──
  'onion': [4, 146, 29, 4.2, 0.02],
  'spring onion': [16, 276, 37, 2.3, 0.03],
  'tomato': [5, 237, 24, 2.6, 0.03],
  'tomato paste': [59, 1014, 83, 12.2, 0.06],
  'tomato puree': [28, 439, 37, 6, 0.03],
  'tomato ketchup': [900, 380, 30, 22, 0.1],
  'ginger-garlic': [15, 400, 150, 1, 0.1],
  'ginger': [13, 415, 34, 1.7, 0.1],
  'garlic': [17, 401, 153, 1, 0.1],
  'green chili': [7, 340, 46, 5, 0.03],
  'red chili': [9, 322, 43, 5, 0.4],
  'potato': [6, 421, 57, 0.8, 0.03],
  'sweet potato': [55, 337, 47, 4.2, 0.02],
  'cauliflower': [30, 299, 44, 1.9, 0.1],
  'broccoli': [33, 316, 66, 1.7, 0.04],
  'cabbage': [18, 170, 26, 3.2, 0.03],
  'okra (bhindi)': [7, 299, 61, 1.5, 0.03],
  'mixed vegetables': [40, 300, 60, 3, 0.1],
  'spinach': [79, 558, 49, 0.4, 0.06],
  'coconut (grated)': [20, 356, 113, 6, 30],
  'coconut milk': [15, 263, 100, 3.3, 21],
  'green beans': [6, 211, 38, 3.3, 0.05],
  'capsicum': [3, 175, 20, 2.5, 0.03],
  'bell pepper': [3, 175, 20, 2.5, 0.03],
  'mushroom': [5, 318, 86, 2, 0.06],
  'zucchini': [8, 261, 38, 2.5, 0.03],
  'bottle gourd': [2, 150, 13, 1, 0.02],
  'ash gourd': [10, 100, 20, 1.5, 0.01],
  'ridge gourd': [3, 140, 26, 1.5, 0.02],
  'pumpkin': [1, 340, 44, 2.8, 0.05],
  'brinjal (eggplant)': [2, 229, 24, 3.5, 0.03],
  'cucumber': [2, 147, 24, 1.7, 0.01],
  'carrot': [69, 320, 35, 4.7, 0.03],
  'beetroot': [78, 325, 40, 6.8, 0.02],
  'radish': [39, 233, 20, 1.9, 0.01],
  'lemon': [2, 138, 16, 2.5, 0.04],
  'lettuce': [28, 194, 29, 0.8, 0.01],
  'celery': [80, 260, 24, 1.3, 0.04],
  'sweet corn': [15, 270, 89, 3.2, 0.2],
  'peas': [5, 244, 108, 5.7, 0.07],
  // ── grains / carbs ──
  'whole wheat flour': [2, 360, 320, 0.4, 0.3],
  'all-purpose flour': [2, 107, 108, 0.3, 0.2],
  'maida': [2, 107, 108, 0.3, 0.2],
  'jowar flour': [6, 350, 290, 2, 0.5],
  'bajra flour': [10, 300, 290, 2, 0.7],
  'rice': [5, 115, 115, 0.1, 0.2],
  'brown rice': [7, 268, 264, 0.7, 0.3],
  'basmati rice': [5, 115, 115, 0.1, 0.2],
  'poha': [3, 130, 110, 0.3, 0.1],
  'quinoa': [7, 563, 457, 0, 0.7],
  'couscous': [5, 58, 22, 0.1, 0.03],
  'pasta': [6, 223, 189, 2.7, 0.3],
  'noodles': [5, 44, 77, 0.6, 0.4],
  'vermicelli': [5, 90, 80, 0.5, 0.2],
  'sabudana': [1, 11, 7, 3, 0.01],
  'foxtail millet': [4, 250, 290, 0.6, 0.6],
  'semolina (rava)': [1, 186, 136, 0.3, 0.2],
  'rolled oats': [2, 350, 410, 1, 1.2],
  'gram flour (besan)': [64, 846, 318, 3, 0.6],
  'whole wheat bread': [400, 254, 200, 5, 0.6],
  'bread': [490, 115, 99, 5, 0.5],
  // ── oils / fats ──
  'cooking oil': [0, 0, 0, 0, 14],
  'vegetable oil': [0, 0, 0, 0, 14],
  'olive oil': [2, 1, 0, 0, 14],
  'mustard oil': [0, 0, 0, 0, 12],
  'sunflower oil': [0, 0, 0, 0, 11],
  'sesame oil': [0, 0, 0, 0, 14],
  'coconut oil': [0, 0, 0, 0, 87],
  'butter': [640, 24, 24, 0.1, 51],
  'ghee': [0, 0, 0, 0, 62],
  // ── dairy ──
  'curd (yogurt)': [46, 155, 95, 4.7, 1.8],
  'milk': [44, 150, 92, 5, 1.9],
  'buttermilk': [105, 130, 80, 4.8, 0.6],
  'cream': [38, 97, 60, 2.9, 19],
  'paneer': [18, 138, 130, 1.2, 12],
  'cheese': [620, 98, 500, 0.5, 19],
  'tofu': [7, 121, 97, 0.6, 0.7],
  'condensed milk': [127, 371, 253, 54, 5.5],
  // ── protein / non-veg ──
  'eggs': [124, 126, 198, 1.1, 3.1],
  'egg': [124, 126, 198, 1.1, 3.1],
  'egg white': [166, 163, 15, 0.7, 0],
  'chicken': [70, 256, 200, 0, 2.7],
  'chicken breast': [65, 256, 210, 0, 1],
  'chicken liver': [71, 230, 297, 0, 1.6],
  'fish': [60, 380, 240, 0, 1],
  'prawns': [148, 259, 244, 0, 0.3],
  'shrimp': [148, 259, 244, 0, 0.3],
  'mutton': [72, 310, 188, 0, 3.5],
  'lamb': [72, 310, 188, 0, 8.8],
  'beef': [72, 318, 198, 0, 6],
  'pork': [62, 423, 226, 0, 3.8],
  'keema': [70, 290, 190, 0, 5],
  // ── nuts / seeds ──
  'almonds': [1, 733, 481, 4.4, 3.7],
  'walnuts': [2, 441, 346, 2.6, 6],
  'cashews': [12, 660, 490, 6, 8],
  'peanuts': [18, 705, 376, 4, 7],
  'pistachios': [1, 1025, 490, 7.7, 5.4],
  'peanut butter': [400, 550, 350, 9, 10],
  'sesame seeds': [11, 468, 629, 0.3, 6.6],
  'flax seeds': [30, 813, 642, 1.6, 3.7],
  'chia seeds': [16, 407, 642, 0, 3.3],
  'sunflower seeds': [9, 645, 660, 2.6, 4.5],
  'pumpkin seeds': [7, 809, 1233, 1.4, 8.7],
  'makhana (fox nuts)': [20, 500, 200, 0.1, 0.1],
  // ── fruits ──
  'apple': [1, 107, 11, 10, 0.03],
  'banana': [1, 358, 22, 12, 0.1],
  'papaya': [8, 182, 10, 8, 0.03],
  'orange': [0, 181, 14, 9, 0.02],
  'mango': [1, 168, 14, 14, 0.06],
  'grapes': [2, 191, 20, 15, 0.05],
  'pomegranate': [3, 236, 36, 14, 0.1],
  'strawberry': [1, 153, 24, 4.9, 0.01],
  'pineapple': [1, 109, 8, 10, 0.01],
  'watermelon': [1, 112, 11, 6, 0.02],
  'dates': [2, 656, 62, 63, 0.03],
  'raisins': [11, 749, 101, 59, 0.06],
  'mixed fruit': [3, 200, 15, 10, 0.05],
  // ── condiments / misc ──
  'soy sauce': [5493, 435, 125, 0.4, 0.01],
  'vinegar': [5, 39, 8, 0.4, 0],
  'mayonnaise': [635, 20, 27, 1.5, 1.5],
  'tamarind': [28, 628, 113, 39, 0.03],
  'gram flour': [64, 846, 318, 3, 0.6],
  'boondi': [200, 100, 120, 1, 3],
  'cumin seeds': [168, 1788, 499, 2, 1.5],
  'cumin': [168, 1788, 499, 2, 1.5],
  'roasted chana': [40, 720, 300, 3, 0.5],
  'roasted gram': [40, 720, 300, 3, 0.5],
  'fenugreek leaves': [76, 770, 51, 1, 0.1],
  'mint leaves': [30, 458, 73, 0, 0.07],
  'coriander leaves': [46, 521, 48, 0.9, 0.01],
  'curry leaves': [20, 480, 57, 0, 0.1],
  'whey protein': [200, 400, 300, 5, 1],
  'protein bar': [200, 250, 200, 15, 3],
  'custard powder': [100, 20, 10, 85, 0.1],
  'dosa batter': [250, 90, 80, 0.5, 0.2],
  'idli batter': [250, 90, 80, 0.5, 0.2],
  'sugar': [0, 2, 0, 100, 0],
  'brown sugar': [28, 133, 4, 97, 0],
  'jaggery': [30, 1050, 30, 85, 0.1],
  'honey': [4, 52, 4, 82, 0],
  'chocolate': [24, 559, 208, 48, 19],
  'cocoa powder': [21, 1524, 734, 1.8, 8],
  'water': [0, 0, 0, 0, 0],
  // ── Phase-2 coverage: top unresolved non-Indian ingredients ──
  'cilantro': [46, 521, 48, 0.9, 0.01],
  'coriander': [46, 521, 48, 0.9, 0.01],
  'lime': [2, 102, 14, 1.7, 0.02],
  'lime juice': [2, 102, 14, 1.7, 0.02],
  'lemon juice': [2, 102, 14, 1.7, 0.02],
  'chili': [9, 322, 43, 5, 0.4],
  'chilli': [9, 322, 43, 5, 0.4],
  'yogurt': [46, 155, 95, 4.7, 1.8],
  'yoghurt': [46, 155, 95, 4.7, 1.8],
  'greek yogurt': [36, 141, 135, 4, 2],
  'sour cream': [30, 125, 80, 3, 11],
  'corn': [15, 270, 89, 3.2, 0.2],
  'sweetcorn': [15, 270, 89, 3.2, 0.2],
  'mint': [30, 458, 73, 0, 0.07],
  'parmesan': [1600, 125, 700, 0.9, 17],
  'mozzarella': [600, 76, 350, 1, 15],
  'cheddar': [620, 98, 500, 0.5, 19],
  'feta': [917, 62, 337, 4.1, 15],
  'bacon': [1717, 565, 533, 0, 12],
  'sausage': [800, 300, 180, 1, 10],
  'ham': [1200, 290, 230, 1, 4],
  'turkey': [103, 239, 200, 0, 1],
  'salmon': [59, 363, 240, 0, 3],
  'tuna': [39, 252, 254, 0, 0.3],
  'crab': [340, 262, 200, 0, 0.2],
  'cornstarch': [9, 3, 13, 0, 0],
  'corn starch': [9, 3, 13, 0, 0],
  'cornmeal': [5, 142, 120, 0.6, 0.1],
  'oats': [2, 350, 410, 1, 1.2],
  'oatmeal': [2, 350, 410, 1, 1.2],
  'tortilla': [400, 150, 200, 1, 1.5],
  'spaghetti': [6, 223, 189, 2.7, 0.3],
  'macaroni': [6, 223, 189, 2.7, 0.3],
  'penne': [6, 223, 189, 2.7, 0.3],
  'barley': [9, 280, 264, 0.8, 0.2],
  'tahini': [115, 414, 732, 0.5, 2.1],
  'pecans': [0, 410, 277, 4, 6],
  'mixed nuts': [10, 600, 450, 4, 6],
  'avocado': [7, 485, 52, 0.7, 2.1],
  'leek': [20, 180, 35, 3.9, 0.03],
  'besan': [64, 846, 318, 3, 0.6],
  'wheat flour': [2, 360, 320, 0.4, 0.3],
  'all purpose flour': [2, 107, 108, 0.3, 0.2],
  'kidney beans': [12, 1400, 400, 2, 0.1],
  'bean sprouts': [6, 149, 101, 4, 0.05],
  'sprouts': [15, 450, 200, 3, 0.2],
  'molasses': [37, 1464, 84, 75, 0.1],
  'maple syrup': [12, 212, 2, 60, 0],
  'margarine': [2000, 42, 25, 0, 15],
  'shortening': [0, 0, 0, 0, 25],
  'gelatin': [196, 16, 4, 0, 0],
  'capers': [2954, 40, 10, 0.4, 0.1],
  'olives': [1556, 42, 4, 0, 0.5],
  'sun-dried tomatoes': [266, 3427, 356, 38, 0.1],
  // condiments / sauces (sodium-heavy — matters for HTN/renal)
  'worcestershire sauce': [980, 800, 60, 19, 0],
  'ketchup': [900, 380, 30, 22, 0.1],
  'hot sauce': [2600, 140, 20, 1, 0],
  'sriracha': [2100, 130, 20, 15, 0.1],
  'salsa': [430, 290, 30, 4, 0.1],
  'oyster sauce': [2700, 54, 30, 15, 0],
  'teriyaki sauce': [3900, 220, 60, 15, 0],
  'hoisin sauce': [1400, 120, 40, 30, 0.5],
  'barbecue sauce': [815, 230, 25, 33, 0.1],
  'bbq sauce': [815, 230, 25, 33, 0.1],
  'fish sauce': [7900, 290, 7, 4, 0],
  'harissa': [1200, 300, 50, 5, 1],
  'pesto': [640, 200, 120, 1, 5],
  'red curry paste': [1300, 300, 60, 5, 2],
  'green curry paste': [1300, 300, 60, 5, 2],
  'curry paste': [1300, 300, 60, 5, 2],
  'salad dressing': [700, 60, 30, 4, 3],
  'graham cracker': [420, 130, 120, 25, 3],
  'whipped topping': [30, 50, 30, 25, 10],
  'pancake mix': [700, 160, 300, 10, 1],
  'fenugreek': [76, 770, 51, 1, 0.1],
  // ── Phase-3 coverage: audit push to 100 (top remaining unresolved dataset tokens) ──
  'moong dal': [27, 1150, 370, 1.5, 0.1],
  'red lentil': [7, 955, 351, 2, 0.1],
  'red lentils': [7, 955, 351, 2, 0.1],
  'yellow lentil': [7, 955, 351, 2, 0.1],
  'millet': [4, 250, 290, 0.6, 0.6],
  'sesame seed': [11, 468, 629, 0.3, 6.6],
  'bulgur': [17, 410, 300, 0.4, 0.1],
  'bulgur wheat': [17, 410, 300, 0.4, 0.1],
  'matzo meal': [2, 110, 100, 1, 0.2],
  'matzo': [2, 110, 100, 1, 0.2],
  'marshmallow': [80, 5, 3, 58, 0],
  'marshmallows': [80, 5, 3, 58, 0],
  'kielbasa': [1200, 280, 160, 1, 9],
  'chorizo': [1230, 340, 180, 1, 13],
  'pepperoni': [1580, 340, 180, 0, 15],
  'salami': [1740, 340, 200, 1, 8],
  'creme fraiche': [30, 90, 60, 3, 24],
  'miracle whip': [560, 15, 20, 8, 1],
  'tamari': [5586, 212, 130, 3, 0],
  'miso': [3728, 210, 159, 6, 0.5],
  'miso paste': [3728, 210, 159, 6, 0.5],
  'sauerkraut': [661, 170, 20, 1.8, 0.03],
  'kimchi': [498, 151, 24, 2.4, 0.05],
  'agave': [4, 4, 1, 68, 0],
  'agave nectar': [4, 4, 1, 68, 0],
  'tempeh': [9, 412, 266, 0, 2],
  'edamame': [6, 436, 169, 2.2, 0.6],
  'hummus': [379, 228, 130, 0.4, 1.4],
  'clams': [56, 314, 169, 0, 0.2],
  'mussels': [286, 268, 285, 0, 0.7],
  'oysters': [112, 168, 162, 0, 0.5],
  'scallops': [392, 205, 220, 0, 0.1],
  'pear': [1, 116, 12, 10, 0.02],
  'pears': [1, 116, 12, 10, 0.02],
  'cherries': [0, 222, 21, 13, 0.04],
  'cherry': [0, 222, 21, 13, 0.04],
  'maraschino cherries': [4, 22, 4, 40, 0],
  'apricot': [1, 259, 23, 9, 0.03],
  'apricots': [1, 259, 23, 9, 0.03],
  'dried apricots': [10, 1162, 71, 53, 0.06],
  'apricot jam': [12, 90, 8, 60, 0],
  'apricot preserves': [12, 90, 8, 60, 0],
  'dried cranberries': [2, 40, 5, 65, 0.05],
  'cranberries': [2, 85, 13, 26, 0.03],
  'cranberry': [2, 85, 13, 26, 0.03],
  'currants': [8, 892, 125, 68, 0.05],
  'dried currants': [8, 892, 125, 68, 0.05],
  'sultana': [11, 749, 101, 59, 0.06],
  'sultanas': [11, 749, 101, 59, 0.06],
  'golden raisin': [11, 749, 101, 59, 0.06],
  'golden raisins': [11, 749, 101, 59, 0.06],
  'wonton wrappers': [400, 60, 90, 1, 0.5],
  'lumpia wrappers': [400, 60, 90, 1, 0.5],
  'spring roll wrappers': [400, 60, 90, 1, 0.5],
  'puff pastry': [330, 60, 60, 1, 15],
  'phyllo': [420, 70, 80, 1, 2],
  'filo': [420, 70, 80, 1, 2],
  'pie crust': [400, 60, 70, 4, 12],
  'tandoori paste': [1200, 300, 60, 5, 2],
  'ground beef': [66, 270, 175, 0, 8],
  'ground chuck': [66, 270, 175, 0, 8],
  'ground round': [66, 270, 175, 0, 7],
  'ground sirloin': [60, 290, 180, 0, 6],
  'ground pork': [62, 290, 200, 0, 7],
  'ground turkey': [103, 239, 200, 0, 3],
  'ground lamb': [72, 310, 188, 0, 8.8],
  'ground chicken': [70, 256, 200, 0, 2.7],
  'ground meat': [70, 290, 190, 0, 6],
  'minced meat': [70, 290, 190, 0, 6],
  'meatballs': [500, 260, 170, 2, 7],
  'meatball': [500, 260, 170, 2, 7],
  'herbes de provence': [8, 80, 20, 0.3, 0.1],
  'vinaigrette': [700, 60, 30, 4, 3],
  'tequila': [1, 1, 0, 0, 0],
  'sweet pickle relish': [560, 40, 10, 26, 0.1],
  'coconut cream': [15, 325, 100, 3, 22],
  'quince': [4, 197, 17, 12, 0.01],
  'plantain': [4, 499, 34, 15, 0.1],
  'okra': [7, 299, 61, 1.5, 0.03],
  // ── Phase-3b: the ≥3-occurrence remaining tail ──
  'mayo': [635, 20, 27, 1.5, 1.5],
  'green pea': [5, 244, 108, 5.7, 0.07],
  'anchovy': [3670, 544, 252, 0, 1],
  'anchovy paste': [3670, 544, 252, 0, 1],
  'sambal oelek': [1300, 300, 60, 3, 0.5],
  'chile paste': [1300, 300, 60, 5, 2],
  'chili paste': [1300, 300, 60, 5, 2],
  'gochujang': [1200, 200, 60, 20, 0.5],
  'korma paste': [800, 250, 80, 6, 6],
  'chile': [9, 322, 43, 5, 0.4],
  'chiles': [9, 322, 43, 5, 0.4],
  'green chile': [7, 340, 46, 5, 0.03],
  'green chiles': [7, 340, 46, 5, 0.03],
  'red chile': [9, 322, 43, 5, 0.4],
  'linguine': [6, 223, 189, 2.7, 0.3],
  'fettuccine': [6, 223, 189, 2.7, 0.3],
  'tagliatelle': [6, 223, 189, 2.7, 0.3],
  'rigatoni': [6, 223, 189, 2.7, 0.3],
  'fusilli': [6, 223, 189, 2.7, 0.3],
  'lasagna': [6, 223, 189, 2.7, 0.3],
  'lasagne': [6, 223, 189, 2.7, 0.3],
  'ravioli': [400, 150, 120, 2, 4],
  'orzo': [6, 223, 189, 2.7, 0.3],
  'udon': [5, 44, 77, 0.6, 0.4],
  'ramen': [5, 44, 77, 0.6, 0.4],
  'soba': [60, 44, 90, 0.6, 0.2],
  'taco shell': [400, 150, 200, 1, 3],
  'taco shells': [400, 150, 200, 1, 3],
  'tostada shells': [400, 150, 200, 1, 3],
  'corn tortilla': [45, 150, 200, 1, 1],
  'bok choy': [65, 252, 37, 1.2, 0.02],
  'kale': [38, 491, 56, 1.3, 0.1],
  'artichoke': [296, 370, 90, 1, 0.1],
  'artichoke hearts': [296, 370, 90, 1, 0.1],
  'artichokes': [296, 370, 90, 1, 0.1],
  'bamboo shoots': [4, 533, 59, 3, 0.1],
  'bamboo shoot': [4, 533, 59, 3, 0.1],
  'turnip': [67, 233, 27, 3.8, 0.01],
  'turnips': [67, 233, 27, 3.8, 0.01],
  'coleslaw mix': [30, 200, 30, 3, 0.1],
  'grape leaves': [0, 200, 50, 1, 0.1],
  'pimento': [20, 210, 17, 4, 0.1],
  'pimentos': [20, 210, 17, 4, 0.1],
  'galangal': [13, 415, 34, 1.7, 0.1],
  'hot dog': [810, 150, 100, 3, 10],
  'hot dogs': [810, 150, 100, 3, 10],
  'pancetta': [1717, 565, 533, 0, 12],
  'croutons': [600, 120, 90, 2, 3],
  'juniper': [8, 80, 20, 0.3, 0.1],
  'tapioca': [1, 11, 7, 1, 0.01],
  'tapioca starch': [1, 11, 7, 0, 0],
  'wasabi': [2, 568, 150, 0, 0.3],
  'liquid smoke': [0, 0, 0, 0, 0],
  'msg': [12278, 0, 0, 0, 0],
  'monosodium glutamate': [12278, 0, 0, 0, 0],
  'accent': [12278, 0, 0, 0, 0],
  'alum': [0, 0, 0, 0, 0],
  'tea': [0, 20, 2, 0, 0],
  'condiments': [500, 120, 30, 5, 1],
};

/**
 * Spices, herbs, leavening and seasonings that appear constantly but in tiny
 * amounts. They resolve to a negligible per-100g value so a recipe is NOT marked
 * nutrition-incomplete (and silently under-counted) merely for being seasoned.
 * Sodium-bearing seasonings (baking soda, stock cubes) are given real sodium.
 */
const NEGLIGIBLE: Array<[string, [number, number, number, number, number]]> = [
  ['baking soda', [27360, 9, 0, 0, 0]],
  ['baking powder', [10600, 20, 8400, 0, 0]],
  ['bouillon', [24000, 100, 40, 1, 1]],
  ['stock cube', [24000, 100, 40, 1, 1]],
  ['soup stock', [900, 60, 20, 0.5, 0.3]],
  ['yeast', [51, 955, 637, 0, 0.1]],
  ['cooking spray', [0, 0, 0, 0, 1]],
  ['ice', [0, 0, 0, 0, 0]],
];
const SPICE_TOKENS = [
  'pepper', 'turmeric', 'chili powder', 'chilli powder', 'red chili powder', 'coriander powder',
  'garam masala', 'masala', 'cardamom', 'clove', 'cinnamon', 'bay leaf', 'mustard seed', 'mustard',
  'asafoetida', 'hing', 'fenugreek seed', 'fennel', 'nutmeg', 'mace', 'star anise', 'saffron',
  'oregano', 'basil', 'thyme', 'rosemary', 'parsley', 'paprika', 'cayenne', 'chaat masala',
  'kasuri methi', 'dry mango', 'amchur', 'carom', 'ajwain', 'nigella', 'poppy seed', 'dried red chili',
  'vanilla', 'food color', 'food colour', 'kewra', 'rose water', 'garnish', 'seasoning', 'spice',
  'black salt', // handled by salt() first, but keep as spice fallback token
  'green cardamom', 'black cardamom', 'cardamon', 'peppercorn', 'italian herbs', 'mixed herbs', 'chives', 'dill',
  'sage', 'caraway', 'marjoram', 'tarragon', 'allspice', 'curry powder', 'curry leaf', 'lemongrass',
  'coriander seed', 'sumac', 'zaatar', "za'atar", 'herbs', 'spice mix', 'seasoning mix', 'garnish',
];
const SPICE_DEFAULT: [number, number, number, number, number] = [8, 80, 20, 0.3, 0.1];

/**
 * Broad generic-token fallback for high-frequency ingredient families the exact
 * table can't enumerate (any oil, broth/stock, generic flour, beans, sauce) and
 * alcohol (near-zero macro but flagged for liver/avoid handling). Runs after the
 * exact/keyword/spice passes so specific rows always win.
 */
const GENERIC_TOKENS: Array<[string, [number, number, number, number, number]]> = [
  ['broth', [350, 90, 20, 0.5, 0.3]], ['stock', [350, 90, 20, 0.5, 0.3]], ['bouillon', [24000, 100, 40, 1, 1]],
  ['groundnut oil', [0, 0, 0, 0, 4]], ['sesame oil', [0, 0, 0, 0, 14]], ['oil', [0, 0, 0, 0, 13]],
  ['whole wheat flour', [2, 360, 320, 0.4, 0.3]], ['gram flour', [64, 846, 318, 3, 0.6]], ['rice flour', [1, 76, 98, 0.1, 0.1]], ['flour', [2, 130, 110, 0.3, 0.2]],
  ['kidney bean', [12, 1400, 400, 2, 0.1]], ['black bean', [1, 1483, 352, 0.6, 0.1]], ['bean', [12, 1300, 380, 2, 0.2]],
  ['curry paste', [1300, 300, 60, 5, 2]], ['dressing', [700, 60, 30, 4, 3]],
  // alcohol — modest values; liver/avoid handling done elsewhere
  ['wine', [8, 90, 18, 1, 0]], ['beer', [4, 27, 14, 0, 0]], ['sherry', [5, 50, 10, 2, 0]],
  ['rum', [1, 1, 0, 0, 0]], ['sake', [2, 20, 6, 1, 0]], ['mirin', [3, 5, 2, 20, 0]],
  ['brandy', [1, 1, 0, 0, 0]], ['whiskey', [0, 1, 0, 0, 0]], ['vodka', [1, 1, 0, 0, 0]], ['liquor', [1, 1, 0, 0, 0]],
  ['sauce', [500, 120, 30, 5, 1]],
  // ── Phase-3 broad families (matched LAST — specific rows/spices always win) ──
  ['lentil', [6, 955, 351, 2, 0.1]], ['chickpea', [24, 875, 366, 3, 0.6]], ['dal', [30, 1200, 370, 2, 0.2]],
  ['raisin', [11, 749, 101, 59, 0.06]], ['sultana', [11, 749, 101, 59, 0.06]], ['currant', [8, 892, 125, 68, 0.05]],
  ['sausage', [800, 300, 180, 1, 10]], ['meatball', [500, 260, 170, 2, 7]], ['ground beef', [66, 270, 175, 0, 8]], ['minced', [70, 290, 190, 0, 6]],
  ['relish', [560, 40, 10, 20, 0.1]], ['chutney', [400, 200, 30, 20, 0.2]], ['pickle', [1200, 130, 20, 3, 0.2]],
  ['jam', [30, 80, 10, 55, 0]], ['preserve', [30, 80, 10, 55, 0]], ['marmalade', [12, 30, 3, 60, 0]], ['syrup', [40, 60, 2, 65, 0]], ['nectar', [4, 60, 5, 60, 0]],
  ['wrapper', [400, 60, 90, 1, 0.5]], ['pastry', [400, 90, 90, 3, 12]], ['dough', [340, 120, 110, 2, 4]], ['crust', [400, 90, 90, 3, 10]], ['batter', [250, 90, 80, 0.5, 0.2]], ['phyllo', [420, 70, 80, 1, 2]],
  ['noodle', [5, 44, 77, 0.6, 0.4]], ['pasta', [6, 223, 189, 2.7, 0.3]], ['macaroni', [6, 223, 189, 2.7, 0.3]],
  ['berry', [1, 120, 20, 8, 0.05]], ['melon', [1, 120, 11, 6, 0.02]], ['squash', [8, 340, 40, 2.5, 0.1]], ['gourd', [3, 140, 20, 1.3, 0.02]], ['greens', [60, 400, 45, 1, 0.1]],
  ['curry', [500, 200, 40, 4, 2]], ['gravy', [500, 120, 40, 2, 3]], ['soup', [300, 120, 40, 1, 1]], ['stew', [300, 250, 60, 2, 2]], ['broth', [350, 90, 20, 0.5, 0.3]],
  ['salad', [40, 250, 45, 3, 0.2]], ['filling', [200, 200, 100, 6, 4]], ['stuffing', [300, 200, 120, 3, 4]], ['topping', [200, 120, 80, 8, 5]], ['marinade', [500, 150, 30, 4, 2]],
  ['seafood', [200, 300, 240, 0, 0.5]], ['shellfish', [200, 300, 240, 0, 0.5]], ['clam', [56, 314, 169, 0, 0.2]],
  ['vegetable', [40, 300, 60, 3, 0.1]], ['fruit', [3, 200, 15, 10, 0.05]], ['nut', [10, 600, 450, 4, 6]], ['seed', [15, 500, 500, 1, 4]], ['meat', [70, 290, 190, 0, 6]],
  // structural / non-food recipe-section labels parsed as ingredients → contribute nothing
  ['to serve', [0, 0, 0, 0, 0]], ['to garnish', [0, 0, 0, 0, 0]], ['for serving', [0, 0, 0, 0, 0]], ['for garnish', [0, 0, 0, 0, 0]],
  ['optional', [0, 0, 0, 0, 0]], ['as needed', [0, 0, 0, 0, 0]], ['as required', [0, 0, 0, 0, 0]], ['skewer', [0, 0, 0, 0, 0]], ['toothpick', [0, 0, 0, 0, 0]],
  ['parchment', [0, 0, 0, 0, 0]], ['aluminum foil', [0, 0, 0, 0, 0]], ['for the', [0, 0, 0, 0, 0]],
  ['paste', [800, 250, 60, 5, 2]], ['shell', [400, 150, 200, 1, 3]], ['tea leaves', [0, 20, 2, 0, 0]], ['starch', [9, 3, 13, 0, 0]],
];

/** Look up an ingredient's nutrients (exact, then paren-stripped, then keyword, then spice fallback). */
function lookup(name: string): [number, number, number, number, number] | null {
  const n = name.trim().toLowerCase();
  if (T[n]) return T[n];
  const bare = n.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (T[bare]) return T[bare];
  for (const key of Object.keys(T)) {
    const kb = key.replace(/\s*\(.*?\)\s*/g, '').trim();
    if (n.includes(kb) || bare.includes(kb)) return T[key];
  }
  for (const [tok, v] of NEGLIGIBLE) if (n.includes(tok)) return v;
  for (const tok of SPICE_TOKENS) if (n.includes(tok)) return SPICE_DEFAULT;
  for (const [tok, v] of GENERIC_TOKENS) if (n.includes(tok)) return v;
  return null;
}

/**
 * Compute a recipe's capped-nutrient totals from its ingredient quantities.
 * `complete` is false if any ingredient couldn't be resolved — so clinical
 * enforcement can exclude nutrition-incomplete recipes from capped roles.
 */
/**
 * Micronutrients (QA M6): iron, calcium, vitamin D, vitamin C per 100 g for the
 * foods that materially contribute them, so recipe cards and blood-driven
 * selection have real data (the dataset ships none). Foods not listed contribute
 * 0 to that micro — honest under-estimate rather than a fabricated value.
 * [ironMg, calciumMg, vitDUg, vitCMg]
 */
const MICRO: Record<string, [number, number, number, number]> = {
  // iron-rich
  'spinach': [2.7, 99, 0, 28], 'fenugreek leaves': [1.9, 395, 0, 52], 'liver': [9, 11, 1.2, 1.3],
  'chicken liver': [9, 11, 1.2, 28], 'red meat': [2.6, 12, 0.1, 0], 'beef': [2.6, 12, 0.1, 0],
  'mutton': [1.6, 12, 0, 0], 'lamb': [1.6, 12, 0, 0], 'toor dal': [5, 130, 0, 0], 'masoor dal': [7.5, 56, 0, 1.5],
  'chana dal': [5.3, 78, 0, 1], 'chickpeas': [4.3, 105, 0, 4], 'rajma (kidney beans)': [5.2, 143, 0, 4.5],
  'kidney beans': [5.2, 143, 0, 4.5], 'black beans': [5, 123, 0, 0], 'soya chunks': [15, 350, 0, 0],
  'tofu': [2.7, 350, 0, 0.1], 'sesame seeds': [14.6, 975, 0, 0], 'pumpkin seeds': [8.8, 46, 0, 1.9],
  'jaggery': [11, 85, 0, 0], 'poha': [20, 20, 0, 0], 'oats': [4.7, 54, 0, 0], 'rolled oats': [4.7, 54, 0, 0],
  // calcium-rich
  'milk': [0, 125, 1.3, 0], 'curd (yogurt)': [0, 121, 0.1, 1], 'yogurt': [0, 121, 0.1, 1], 'greek yogurt': [0, 110, 0, 0],
  'paneer': [0, 480, 0.4, 0], 'cheese': [0.7, 720, 0.6, 0], 'parmesan': [0.8, 1180, 0.5, 0], 'mozzarella': [0.4, 505, 0.4, 0],
  // Plant milks, so they stop resolving to cow's milk through the word "milk".
  // Unfortified values: fortification varies by brand and claiming it is worse
  // than admitting we do not know.
  'coconut milk': [0.7, 16, 0, 0], 'almond milk': [0.3, 17, 0, 0], 'soy milk': [0.6, 25, 0, 0],
  'soymilk': [0.6, 25, 0, 0], 'oat milk': [0.2, 12, 0, 0], 'rice milk': [0.2, 12, 0, 0],
  'ragi': [3.9, 344, 0, 0], 'almonds': [3.7, 269, 0, 0], 'sesame seeds ': [14.6, 975, 0, 0], 'buttermilk': [0, 116, 0, 0],
  // vitamin C-rich
  'lemon': [0.6, 26, 0, 53], 'lime': [0.6, 33, 0, 29], 'orange': [0.1, 40, 0, 53], 'amla': [0.3, 25, 0, 600],
  'capsicum': [0.4, 10, 0, 128], 'bell pepper': [0.4, 10, 0, 128], 'green chili': [1.2, 18, 0, 143],
  'broccoli': [0.7, 47, 0, 89], 'cauliflower': [0.4, 22, 0, 48], 'cabbage': [0.5, 40, 0, 37], 'tomato': [0.3, 10, 0, 14],
  'papaya': [0.3, 20, 0, 61], 'strawberry': [0.4, 16, 0, 59], 'pineapple': [0.3, 13, 0, 48], 'guava': [0.3, 18, 0, 228],
  'coriander leaves': [1.8, 67, 0, 27], 'mint': [5, 200, 0, 32], 'lemon juice': [0.1, 6, 0, 39],
  // vitamin D-rich
  'egg': [1.8, 56, 2, 0], 'eggs': [1.8, 56, 2, 0], 'fish': [1, 30, 11, 0], 'salmon': [0.5, 12, 13, 0],
  'tuna': [1, 10, 5, 0], 'mushroom': [0.5, 3, 7, 2],
};
/**
 * Names that must never resolve through a shorter key inside them.
 *
 * A condiment made from a food is not that food in any quantity that matters:
 * 100 g of fish sauce was resolving to 100 g of fish and supplying 11 µg of
 * vitamin D, most of a day's intake, from a splash. Same for soy and oyster
 * sauce reaching mushroom and fish.
 */
const MICRO_NEVER = [/\bsauce\b/, /\bstock\b/, /\bbroth\b/, /\bextract\b/, /\bessence\b/, /\bpowder\b/, /\bnoodle/];

/**
 * Keys longest first, so a specific row beats a generic one — "coconut milk"
 * before "milk". Computed once; the table is a module constant.
 *
 * It used to iterate Object.keys in insertion order and take the first
 * substring hit, which made the answer depend on where a row happened to sit in
 * the literal. Moving a line could change somebody's calcium.
 */
const MICRO_KEYS_BY_LENGTH = Object.keys(MICRO).sort((a, b) => b.length - a.length);

const microWord = (hay: string, key: string) =>
  new RegExp(`(^| )${key.replace(/\s*\(.*?\)\s*/g, '').trim()}s?( |$)`).test(hay);

function lookupMicro(name: string): [number, number, number, number] | null {
  const n = name.trim().toLowerCase();
  if (MICRO[n]) return MICRO[n];
  const bare = n.replace(/\s*\(.*?\)\s*/g, '').trim();
  if (MICRO[bare]) return MICRO[bare];
  if (MICRO_NEVER.some((re) => re.test(bare))) return null;
  // Whole words only. `includes` had eggplant reading as egg, cheesecloth as
  // cheese at 720 mg of calcium, and beefsteak tomato as beef.
  for (const key of MICRO_KEYS_BY_LENGTH) {
    if (microWord(bare, key) || microWord(n, key)) return MICRO[key];
  }
  return null;
}
export interface MicroSet { ironMg: number; calciumMg: number; vitDUg: number; vitCMg: number }
export function computeMicros(ingredients: Array<{ name: string; grams: number }>): MicroSet {
  let fe = 0, ca = 0, d = 0, c = 0;
  for (const ing of ingredients) {
    const v = lookupMicro(ing.name);
    if (!v) continue;
    const f = ing.grams / 100;
    fe += v[0] * f; ca += v[1] * f; d += v[2] * f; c += v[3] * f;
  }
  return { ironMg: Math.round(fe * 10) / 10, calciumMg: Math.round(ca), vitDUg: Math.round(d * 10) / 10, vitCMg: Math.round(c) };
}

export function computeNutrients(ingredients: Array<{ name: string; grams: number }>): NutrientSet & { complete: boolean } {
  let na = 0, k = 0, p = 0, sug = 0, sfat = 0, addedSug = 0, complete = ingredients.length > 0;
  for (const ing of ingredients) {
    if (isSalt(ing.name)) {
      const g = Math.min(ing.grams, SALT_MAX_GRAMS_PER_SERVING);
      na += (SALT_SODIUM_PER_100G / 100) * g;
      continue; // salt contributes only sodium; resolved (does not mark incomplete)
    }
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

/**
 * Scale a whole-recipe ingredient list down to one plate (BE-8.5).
 *
 * The dataset mixes two conventions and says nothing about it. kcal, protein,
 * carbs, fat and gramsPerServing are per serving. `ingredients[].grams` are for
 * the whole recipe — the median row lists 1,520 g of ingredients against a
 * 210 g stated serving, seven plates' worth. And every one of the 11,217 rows
 * carries `servings: 1`, so the obvious correction, dividing by servings, does
 * nothing at all: the sentinel reads as "authoritative: one serving" when it
 * means "unstated".
 *
 * Left uncorrected, every nutrient computed from the ingredient list — sodium,
 * potassium, phosphorus, saturated fat, sugar — comes out about seven times too
 * high. Those are exactly the nutrients the clinical caps are written against,
 * so a renal or hypertensive citizen's plan breaches its cap on arithmetic
 * rather than on food.
 *
 * The 1.6 threshold leaves genuinely single-serving rows alone: a plate can
 * legitimately weigh more raw than cooked, and 60% is more slack than
 * evaporation accounts for while still catching a sevenfold batch.
 *
 * This lived inline in the production pool builder and nowhere else, which is
 * how all three simulation harnesses came to measure a version of the engine
 * that production does not run.
 */
export function perServingIngredients<T extends { name: string; grams: number }>(
  ingredients: readonly T[],
  gramsPerServing: number,
): T[] {
  const gps = gramsPerServing > 0 ? gramsPerServing : 200;
  const total = ingredients.reduce((t, i) => t + (i.grams || 0), 0);
  if (!total || total <= gps * 1.6) return [...ingredients];
  const f = gps / total;
  return ingredients.map((i) => ({ ...i, grams: Math.max(1, Math.round(i.grams * f)) }));
}

/**
 * How many plates the ingredient list actually makes. 1 when it is already a
 * single serving. Use this — not the dataset's `servings` — to turn a
 * whole-recipe quantity or price into a per-plate one.
 */
export function ingredientBatchServings(
  ingredients: readonly { grams: number }[],
  gramsPerServing: number,
): number {
  const gps = gramsPerServing > 0 ? gramsPerServing : 200;
  const total = ingredients.reduce((t, i) => t + (i.grams || 0), 0);
  if (!total || total <= gps * 1.6) return 1;
  return Math.max(1, Math.min(30, Math.round(total / gps)));
}
