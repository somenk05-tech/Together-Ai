/**
 * ── THE GROCERY SHELF, AND WHOSE IT IS ──────────────────────────────────────
 *
 * Owner, 8 Sep: "instead of grocery list create a grocery store with
 * vegetables, food items, household items etc."
 *
 * THE CITY STILL OWNS NO GROCERIES. There is no product table behind this file
 * and there is not going to be one: the last time this hub priced a bag of
 * rice, the numbers came from a simulation in `quick-commerce.ts` presented
 * under real retailers' names, and `grocery-orders-removed.spec.ts` is the
 * apology. Every name, every price and every photograph below is a row a LOCAL
 * SHOPKEEPER typed into their own menu — the same `ServiceMenuItem` a kitchen
 * publishes, from the same command centre, with the same sold-out switch — and
 * the store is a way of reading them across shops rather than one at a time.
 *
 * WHICH IS WHY THE AISLE IS A FILING DECISION AND NEVER A GUESS ABOUT THE
 * PRODUCT. Three rules, tried in order, and none of them reads the item's name:
 *
 *   1. THE SHOPKEEPER'S OWN WORD. `section` is the heading they typed over
 *      that part of their list — "Vegetables", "Sabzi", "Home care". It is
 *      normalised through the table below, which is a synonym list and not an
 *      inference: "sabji" and "vegetables" are two spellings of one aisle.
 *   2. WHAT KIND OF SHOP IT IS. A fruit & vegetable market that typed no
 *      headings is still a fruit & vegetable market, and its rows are produce
 *      because of the trade it registered under, not because of what they are
 *      called.
 *   3. EVERYTHING ELSE. A row from a general kirana with no heading is filed
 *      under "Everything else" and stays there. Reading "Surf Excel" and
 *      deciding it is detergent would be this file inventing a fact about a
 *      product, which is the one thing the district does not do.
 *
 * `grocery.spec.ts` holds all three, and holds the fourth rule that matters:
 * an unknown heading lands in `other` rather than being dropped, because a
 * shopkeeper's row must never vanish from the shelf for want of a word we know.
 */

/**
 * THE TRADES THAT SELL GROCERIES, by the key their listing stores. Every one
 * is in the "Food & Daily Needs" group, which is what already gives them a
 * cart and a paid till on their own page — the store sends people there.
 *
 * Restaurants, cafés and fast food are deliberately NOT here. They sell
 * cooked meals, and a plate of biryani on a shelf between atta and washing
 * powder is the store misreading what the shop does.
 */
export const GROCERY_CATEGORIES = [
  'grocery_stores',
  'supermarkets',
  'fruit_and_vegetable_markets',
  'butcher_shops',
  'fish_markets',
  'convenience_stores',
  'bakeries',
  'water_delivery',
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

export const isGroceryCategory = (key: string): boolean =>
  (GROCERY_CATEGORIES as readonly string[]).includes(key);

/** The aisles, in the order a shelf is walked. `other` is always last. */
export const AISLES: { key: string; label: string }[] = [
  { key: 'produce', label: 'Fruit & Vegetables' },
  { key: 'staples', label: 'Rice, Dal & Staples' },
  { key: 'dairy', label: 'Dairy & Eggs' },
  { key: 'meat', label: 'Meat & Fish' },
  { key: 'bakery', label: 'Bakery' },
  { key: 'packaged', label: 'Packaged & Snacks' },
  { key: 'beverages', label: 'Beverages' },
  { key: 'household', label: 'Household & Cleaning' },
  { key: 'personal', label: 'Personal Care' },
  { key: 'other', label: 'Everything else' },
];

const AISLE_ORDER = new Map(AISLES.map((a, i) => [a.key, i]));
export const aisleLabel = (key: string): string =>
  AISLES.find((a) => a.key === key)?.label ?? key;
export const aisleRank = (key: string): number => AISLE_ORDER.get(key) ?? AISLES.length;

/**
 * THE SHOPKEEPER'S HEADINGS, GROUPED. Each word is a heading somebody would
 * actually type over that part of their own list, in English or in the
 * transliterated Hindi a kirana writes its board in. Whole-word matching, so
 * "Fresh vegetables (daily)" files under produce and "Vegetable oil" does
 * not become produce for containing "vegetable" — `oil` is checked too and
 * the FIRST aisle in this list whose word appears wins, which is why the
 * order of the entries below is deliberate rather than alphabetical.
 */
const SECTION_WORDS: { aisle: string; words: string[] }[] = [
  /* Oils and ghee before produce, or "vegetable oil" is filed as a vegetable. */
  { aisle: 'staples', words: ['oil', 'oils', 'ghee', 'masala', 'masalas', 'spice', 'spices', 'rice', 'dal', 'daal', 'dals', 'pulses', 'atta', 'flour', 'flours', 'grain', 'grains', 'cereals', 'staple', 'staples', 'sugar', 'salt', 'dry fruits', 'dryfruits', 'kirana', 'ration', 'provisions'] },
  { aisle: 'produce', words: ['vegetable', 'vegetables', 'veg', 'veggies', 'sabzi', 'sabji', 'subzi', 'fruit', 'fruits', 'produce', 'greens', 'leafy', 'herbs', 'salad', 'exotics'] },
  { aisle: 'dairy', words: ['dairy', 'milk', 'curd', 'dahi', 'paneer', 'cheese', 'butter', 'egg', 'eggs', 'yoghurt', 'yogurt'] },
  { aisle: 'meat', words: ['meat', 'chicken', 'mutton', 'fish', 'seafood', 'poultry', 'nonveg', 'non veg', 'butcher', 'prawns', 'eggs and meat'] },
  { aisle: 'bakery', words: ['bakery', 'bread', 'breads', 'cake', 'cakes', 'pastry', 'pastries', 'buns', 'bakes'] },
  { aisle: 'beverages', words: ['beverage', 'beverages', 'drink', 'drinks', 'juice', 'juices', 'tea', 'coffee', 'water', 'soft drinks', 'cold drinks', 'soda'] },
  { aisle: 'packaged', words: ['packaged', 'packet', 'snack', 'snacks', 'biscuit', 'biscuits', 'chips', 'namkeen', 'instant', 'noodles', 'ready to eat', 'frozen', 'chocolate', 'chocolates', 'sweets', 'mithai', 'confectionery', 'breakfast', 'jam', 'sauce', 'sauces', 'ketchup', 'pickle', 'pickles', 'papad'] },
  { aisle: 'household', words: ['household', 'home care', 'homecare', 'cleaning', 'cleaners', 'detergent', 'detergents', 'dishwash', 'utensil', 'utensils', 'kitchen', 'hardware', 'pooja', 'puja', 'stationery', 'disposables', 'garbage', 'mosquito', 'repellent', 'tissue', 'tissues'] },
  { aisle: 'personal', words: ['personal care', 'personal', 'toiletries', 'hygiene', 'soap', 'soaps', 'shampoo', 'oral care', 'toothpaste', 'skin care', 'skincare', 'hair care', 'haircare', 'baby care', 'baby', 'sanitary', 'grooming', 'deodorant'] },
];

/** The trade a shop registered under, where that alone decides the aisle.
 *  A general shop is deliberately absent: it sells everything, so its trade
 *  says nothing about any one row. */
const CATEGORY_AISLE: Record<string, string> = {
  fruit_and_vegetable_markets: 'produce',
  butcher_shops: 'meat',
  fish_markets: 'meat',
  bakeries: 'bakery',
  water_delivery: 'beverages',
};

/** Lower-cased, punctuation flattened to single spaces, so "Home-Care /
 *  Cleaning" and "home care cleaning" are one heading. */
const normalise = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const hasWord = (haystack: string, word: string): boolean =>
  new RegExp(`(^| )${word.replace(/ /g, ' ')}( |$)`).test(haystack);

/** The shopkeeper's heading, as an aisle. Null when we do not know the word —
 *  never a guess, and never a drop. */
export function sectionAisle(section: string | null | undefined): string | null {
  if (!section) return null;
  const s = normalise(section);
  if (!s) return null;
  for (const group of SECTION_WORDS) {
    for (const w of group.words) if (hasWord(s, w)) return group.aisle;
  }
  return null;
}

/**
 * WHERE THIS ROW STANDS ON THE SHELF. The shopkeeper's heading first, the
 * trade they registered under second, "Everything else" last. Nothing here
 * reads the product's name.
 */
export function aisleOf(section: string | null | undefined, categoryKey: string): string {
  return sectionAisle(section) ?? CATEGORY_AISLE[categoryKey] ?? 'other';
}
