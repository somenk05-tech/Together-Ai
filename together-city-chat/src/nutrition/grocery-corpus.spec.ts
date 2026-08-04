import { gunzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { skipGroceryIngredient, canonicalIngredient } from './nutrition.service';

/**
 * THE GROCERY LIST IS MADE OF A SCRAPE, AND A SCRAPE FLATTENS STRUCTURE.
 *
 * The recipe corpus is 11,217 recipes and 118,232 ingredient rows collected from
 * the web. Section headings arrive as rows with a gram weight, equipment arrives
 * as rows with a gram weight, and the upstream source caps ingredient text at 60
 * characters mid-sentence. All three then merge like any other item, so the
 * shopping list this whole hub builds towards opened with lines nobody could
 * act on:
 *
 *   Sauce ............... 7.2 kg   (150 of those rows were `hot sauce`)
 *   Bakers Paper ........ 30 g
 *   Bottle Red Thai Curry Sauce (Such As Trader Joe'S
 *
 * These tests are the rules that removed them, written as the two questions the
 * boundary actually asks — is this a thing you buy, and what is it called —
 * with the real examples from the corpus on both sides. The corpus itself is
 * measured at the bottom, because a rule that is right about fourteen strings
 * and wrong about a hundred thousand rows has not been tested.
 */

describe('a section heading is not something you buy', () => {
  it('drops a bare heading, whatever it is a heading for', () => {
    for (const n of ['Sauce', 'Dressing', 'Filling', 'Marinade', 'Dough', 'Batter',
      'Topping', 'Garnish', 'Crust', 'Salad', 'Gravy', 'Assembly', 'Sauce Ingredients']) {
      expect(skipGroceryIngredient(n)).toBe(true);
    }
  });

  it('drops anything led by "For the" or "To serve" — the lead is the tell', () => {
    // Listing the nouns would have meant chasing every component a recipe writer
    // ever sectioned: kebabs, koftas, bhaji mix, cham-cham, green chile paste.
    for (const n of ['For the sauce', 'For the meatballs', 'For the Kebabs', 'For the Bhaji Mix',
      'For the Green Chile Paste', 'For Dough', 'To serve', 'To garnish', 'Ingredients for the filling']) {
      expect(skipGroceryIngredient(n)).toBe(true);
    }
  });

  it('drops a heading carrying a cross-reference', () => {
    for (const n of ['Filling (recipe follows)', 'marinade (recipe above)',
      'Dressing (use reserved artichoke liquid plus)']) {
      expect(skipGroceryIngredient(n)).toBe(true);
    }
  });

  it('keeps every ingredient whose NAME contains a heading word', () => {
    // This is the rule that could do real damage: `sauce` appears in hundreds of
    // things people buy. The test is that the whole name is the heading.
    for (const n of ['tomato sauce', 'soy sauce', 'hot sauce', 'fish sauce', 'chimichurri sauce (recipe follows)',
      'ranch dressing', 'salad leaves', 'pizza dough', 'frozen meatballs', 'pancake batter mix',
      'Kikkoman Teriyaki Marinade & Sauce', 'gravy granules', 'salad cream']) {
      expect(skipGroceryIngredient(n)).toBe(false);
    }
  });
});

describe('equipment is not shopping either', () => {
  it('drops what the recipe cooks WITH', () => {
    for (const n of ['bakers paper', 'parchment paper', 'greaseproof paper', 'paper towels',
      'aluminium foil', 'Aluminum Foil', 'Reynolds Wrap(R) Non Stick Aluminum Foil',
      'wooden skewer', 'bamboo skewer, soaked for at least 30 minutes', 'toothpick',
      'kitchen twine', 'cheesecloth', 'meat thermometer', 'regular-size foil oven cooking bag']) {
      expect(skipGroceryIngredient(n)).toBe(true);
    }
  });

  it('does not take the food out with the packaging', () => {
    // `bag`, `wrap` and `string` are the trap: a rule reaching for the packaging
    // word takes crisps, tortillas and green beans with it.
    for (const n of ['bag Fritos', 'medium size bag Doritos, crumbled', 'tea bag',
      'tortilla wraps', 'string beans', 'uncooked string bean, chopped', 'string cheese',
      'wrap', 'rice paper', 'rice paper wrappers']) {
      expect(skipGroceryIngredient(n)).toBe(false);
    }
  });
});

describe('a name cut off mid-sentence is not a shopping line', () => {
  it('drops an unclosed bracket and everything after it', () => {
    // The upstream cap is 60 characters, so `(.*?)` finds no partner and the
    // whole unfinished aside stood in the list.
    expect(canonicalIngredient("bottle red Thai curry sauce (such as Trader Joe's"))
      .toBe('Red Thai Curry Sauce');
    expect(canonicalIngredient('channa masala (mixture of different spices, found at Indian'))
      .toBe('Channa Masala');
    expect(canonicalIngredient('vegetable bouillon (such as Edward & Sons Not Chick\'n B'))
      .toBe('Vegetable Bouillon');
  });

  it('still reads a bracket that closes', () => {
    expect(canonicalIngredient('gochujang (Korean hot pepper paste)')).toBe('Gochujang');
    expect(canonicalIngredient('curd (yogurt)')).toBe('Yogurt');
  });
});

describe('the packet is not the item', () => {
  it('strips a leading container word', () => {
    expect(canonicalIngredient('envelope taco seasoning mix')).toBe('Taco Seasoning Mix');
    expect(canonicalIngredient('packet dry fajita seasoning')).toBe('Dry Fajita Seasoning');
    expect(canonicalIngredient('bottle clam juice')).toBe('Clam Juice');
    expect(canonicalIngredient('tubes prepared refrigerator crescent rolls')).toBe('Prepared Refrigerator Crescent Rolls');
  });

  it('leaves an item whose NAME opens with one', () => {
    // `bottle gourd` and `tin fish` are the things themselves.
    expect(canonicalIngredient('bottle gourd')).toBe('Bottle Gourd');
    expect(canonicalIngredient('canned tomatoes')).toBe('Canned Tomatoes');
  });
});

describe('`hot` is part of the name, not the temperature', () => {
  it('keeps it', () => {
    // Stripping it made `hot sauce` into `sauce`: 150 rows, the largest single
    // line the list produced, and it meant nothing.
    expect(canonicalIngredient('hot sauce')).toBe('Hot Sauce');
    expect(canonicalIngredient('hot dogs')).toBe('Hot Dogs');
    expect(canonicalIngredient('hot curry paste')).toBe('Hot Curry Paste');
  });

  it('still strips the words that really are temperature', () => {
    expect(canonicalIngredient('cold lard')).toBe('Lard');
    expect(canonicalIngredient('melted butter')).toBe('Butter');
  });
});

/**
 * THE WHOLE CORPUS, NOT FOURTEEN STRINGS.
 *
 * Every number below was measured before the rules were written and again after.
 * A rule that is right about fourteen hand-picked strings and wrong about a
 * hundred thousand rows has not been tested.
 *
 * IT ASKS THE QUESTION OF THE RAW NAME, not of the canonical one. `Gravy` can
 * arrive at the list honestly — `gravy, granules` and `brown gravy mix` are
 * things you buy, and the comma cut leaves `Gravy` — so a canonical equal to a
 * heading word proves nothing either way. What must be true is that the row
 * which was ONLY a heading never got through, and that is a question about what
 * the recipe actually said.
 *
 * Skipped if the dataset is absent — it ships in the image, and a checkout
 * without it should not report a failure it cannot fix.
 */
describe('measured across the shipped corpus', () => {
  const path = join(__dirname, 'data', 'recipes.dataset.json.gz');
  const has = existsSync(path);
  type DS = { ingredients?: { name: string; grams: number }[] };

  (has ? it : it.skip)('lets no heading and no equipment reach a list', () => {
    const data = JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) as DS[];
    const survived: string[] = [];
    const kept = new Map<string, number>();
    let rows = 0;
    for (const r of data) {
      for (const i of r.ingredients ?? []) {
        rows++;
        if (skipGroceryIngredient(i.name)) continue;
        survived.push(i.name);
        const c = canonicalIngredient(i.name);
        if (c) kept.set(c, (kept.get(c) ?? 0) + 1);
      }
    }
    expect(rows).toBeGreaterThan(100_000);

    // Headings — 561 rows before these rules. A row is one when the recipe wrote
    // nothing but the heading, or led with "For the" / "To serve".
    const BARE = /^\s*(?:for\s+(?:the\s+)?\S|to\s+(?:serve|garnish|finish|assemble)\b|(?:sauce|dressing|filling|marinade|dough|batter|garnish|topping|glaze|crust|gravy|assembly|meatballs)\s*(?:\(|$))/i;
    expect(survived.filter((n) => BARE.test(n) && !/\w\s+\w.*\b(mix|granule|powder|paste|cube|packet|leftover|frozen|brown|instant)\b/i.test(n)))
      .toEqual([]);

    // Equipment — 18 canonical names before.
    const EQUIP = /\b(foil|parchment|toothpick|skewers?|twine|cheesecloth|thermometer)\b|\b(bakers?|baking|greaseproof|waxed?) paper\b|\bpaper towels?\b/i;
    expect(survived.filter((n) => EQUIP.test(n) && !/rice paper/i.test(n))).toEqual([]);

    // Truncation — 166 rows ended inside a bracket nobody closed.
    expect([...kept.keys()].filter((k) => k.includes('('))).toEqual([]);

    // And the head of the list is still food. If a rule ever starts eating the
    // corpus, this is the line that notices.
    expect(kept.get('Onion')).toBeGreaterThan(5_000);
    expect(kept.get('Garlic')).toBeGreaterThan(4_000);
    expect(kept.get('Hot Sauce')).toBeGreaterThan(100);
    expect(kept.size).toBeGreaterThan(2_000);
  });
});
