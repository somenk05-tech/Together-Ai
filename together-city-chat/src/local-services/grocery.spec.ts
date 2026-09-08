import { readFileSync } from 'fs';
import { join } from 'path';
import { AISLES, GROCERY_CATEGORIES, aisleOf, aisleRank, isGroceryCategory, sectionAisle } from './grocery';
import { SERVICE_CATEGORIES } from './categories';

/**
 * THE GROCERY STORE'S ONE RULE, HELD FROM BOTH ENDS: the aisle is decided by
 * what the shopkeeper WROTE and what trade they registered under — never by
 * what the product appears to be. A file that guessed "Surf Excel" into
 * detergent would be the district inventing facts about a product, which is
 * the mistake `grocery-orders-removed.spec.ts` exists to remember.
 */
describe('the trades that sell groceries', () => {
  it('are all real categories, and all in Food & Daily Needs', () => {
    for (const key of GROCERY_CATEGORIES) {
      const cat = SERVICE_CATEGORIES.find((c) => c.key === key);
      expect({ key, found: !!cat }).toEqual({ key, found: true });
      // The group is what already gives these shops a cart and a paid till on
      // their own page. A trade outside it would be a tile that sends somebody
      // to a page with no way to buy.
      expect({ key, group: cat?.group }).toEqual({ key, group: 'Food & Daily Needs' });
    }
  });

  it('leaves cooked meals out — a restaurant is not a grocer', () => {
    for (const key of ['restaurants', 'cafes', 'fast_food']) {
      expect({ key, in: isGroceryCategory(key) }).toEqual({ key, in: false });
    }
  });
});

describe('the aisles', () => {
  it('end with Everything else, always', () => {
    expect(AISLES[AISLES.length - 1].key).toBe('other');
    for (const a of AISLES) expect(aisleRank(a.key)).toBeLessThan(AISLES.length);
    // An aisle nobody declared sorts after every one that was.
    expect(aisleRank('nonsense')).toBe(AISLES.length);
  });

  it('have no repeated key', () => {
    expect(new Set(AISLES.map((a) => a.key)).size).toBe(AISLES.length);
  });
});

describe("the shopkeeper's own heading decides the aisle", () => {
  const cases: [string, string][] = [
    ['Vegetables', 'produce'],
    ['Fresh Sabzi (daily)', 'produce'],
    ['Fruits', 'produce'],
    ['Rice & Dal', 'staples'],
    ['Atta / Flour', 'staples'],
    ['Masala', 'staples'],
    ['Milk & Dairy', 'dairy'],
    ['Paneer', 'dairy'],
    ['Chicken', 'meat'],
    ['Bread', 'bakery'],
    ['Tea & Coffee', 'beverages'],
    ['Cold drinks', 'beverages'],
    ['Snacks & Namkeen', 'packaged'],
    ['Home Care / Cleaning', 'household'],
    ['Detergents', 'household'],
    ['Personal care', 'personal'],
    ['Shampoo', 'personal'],
  ];
  for (const [section, aisle] of cases) {
    it(`files "${section}" under ${aisle}`, () => {
      expect(sectionAisle(section)).toBe(aisle);
    });
  }

  /* THE ONE ORDERING THAT IS NOT ALPHABETICAL AND MUST NOT BECOME SO. Oils are
     checked before produce, or a shop's "Vegetable oil" heading becomes a
     vegetable. */
  it('does not read cooking oil as a vegetable', () => {
    expect(sectionAisle('Vegetable Oil')).toBe('staples');
    expect(sectionAisle('Cooking oils')).toBe('staples');
  });

  it('says nothing when it does not know the word', () => {
    expect(sectionAisle('Weekly specials')).toBeNull();
    expect(sectionAisle('')).toBeNull();
    expect(sectionAisle(null)).toBeNull();
  });
});

describe('the trade decides when the shopkeeper wrote no heading', () => {
  it('files a vegetable market under produce and a butcher under meat', () => {
    expect(aisleOf(null, 'fruit_and_vegetable_markets')).toBe('produce');
    expect(aisleOf(null, 'butcher_shops')).toBe('meat');
    expect(aisleOf(null, 'fish_markets')).toBe('meat');
    expect(aisleOf(null, 'bakeries')).toBe('bakery');
  });

  it('says nothing about a general shop, because its trade says nothing', () => {
    expect(aisleOf(null, 'grocery_stores')).toBe('other');
    expect(aisleOf(null, 'supermarkets')).toBe('other');
  });

  it('lets the heading beat the trade', () => {
    // A vegetable market that also sells eggs, and said so.
    expect(aisleOf('Eggs', 'fruit_and_vegetable_markets')).toBe('dairy');
  });
});

describe('nothing is ever dropped', () => {
  it('gives an unknown heading from an unknown trade a place to stand', () => {
    expect(aisleOf('Weekly specials', 'convenience_stores')).toBe('other');
    // And "other" is a real aisle with a label, not a hole.
    expect(AISLES.find((a) => a.key === 'other')?.label).toBe('Everything else');
  });

  /* THE ROW'S NAME IS NEVER READ, and this is the guard that keeps it that
     way. Comments are stripped first: this file's prose says the word "name"
     repeatedly, on purpose, and a check that reads its own explanation is the
     trap `grocery-orders-removed.spec.ts` names — it goes green when somebody
     rewords a sentence and red when nobody has changed anything. */
  it('decides nothing from the product name', () => {
    const raw = readFileSync(join(__dirname, 'grocery.ts'), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');
    expect(code).not.toMatch(/\bname\b/);
  });
});
