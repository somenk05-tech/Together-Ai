import { allergensIn, findAllergen, isAllergenSafe, normaliseAllergen } from './allergens';

/**
 * The adversarial set the release gate asks for, written INDEPENDENTLY of the
 * matcher it tests.
 *
 * This is the point of the file. The simulations reported "Allergen leaks: 0"
 * for a year by computing the leak with the same substring test the filter
 * enforced — measurement and mechanism were one function, so the zero was
 * arithmetic rather than evidence. These pairs are a list of things that must
 * and must not be caught, written from what the foods are, and a matcher has to
 * satisfy them rather than define them.
 */

/** MUST be caught: declaring the left thing must exclude a dish with the right one. */
const TRAPS: Array<[declared: string, ingredient: string]> = [
  // The failure that prompted all this: none of these contain the word "milk".
  ['milk', 'Paneer'], ['milk', 'Ghee'], ['milk', 'Curd'], ['milk', 'Dahi'],
  ['milk', 'Khoya'], ['milk', 'Malai'], ['milk', 'Fresh cream'], ['milk', 'Lassi'],
  ['dairy', 'Cottage cheese'], ['lactose', 'Buttermilk'], ['milk', 'Shrikhand'],

  // Nor these the word "nut".
  ['nuts', 'Almonds'], ['nuts', 'Badam'], ['nuts', 'Kaju'], ['nuts', 'Cashews'],
  ['nuts', 'Pista'], ['nuts', 'Akhrot'], ['tree nuts', 'Marzipan'],

  // Peanut is not a tree nut and has its own Indian names.
  ['peanut', 'Groundnut oil'], ['peanut', 'Moongphali'], ['peanuts', 'Peanut butter'],
  // "nuts" has to reach peanuts. Nobody types it meaning "all of them except
  // the one in satay" — and the dataset comparison found 132 recipes that a
  // botanically-correct version would have served to somebody who wrote it.
  ['nuts', 'Peanuts'], ['nuts', 'Groundnut oil'], ['nut', 'Roasted peanuts'],
  // Plurals, which the first draft of the word matcher missed entirely.
  ['nuts', 'Hazelnuts'], ['shellfish', 'Oysters'], ['seafood', 'Prawns'],

  // Coeliac. "wheat" appears in none of these.
  ['gluten', 'Atta'], ['gluten', 'Maida'], ['gluten', 'Suji'], ['gluten', 'Rava'],
  ['gluten', 'Semolina'], ['gluten', 'Dalia'], ['gluten', 'Naan'], ['gluten', 'Paratha'],
  ['wheat', 'Chapati'], ['gluten', 'Seviyan'], ['gluten', 'Barley'],

  ['soy', 'Tofu'], ['soy', 'Edamame'], ['soya', 'Miso paste'], ['soy', 'Tamari'],
  // One word, no space — the word matcher cannot see "soy" inside it, so the
  // compound is spelled out in the list. Seven recipes in the dataset.
  ['soy', 'Soymilk'], ['nuts', 'Candlenuts'],
  ['egg', 'Mayonnaise'], ['egg', 'Anda'], ['egg', 'Meringue'],
  ['fish', 'Anchovy paste'], ['fish', 'Bombil'], ['seafood', 'Rohu'], ['fish', 'Worcestershire sauce'],
  ['shellfish', 'Jhinga'], ['shellfish', 'Squid rings'], ['prawns', 'Crab meat'], ['shellfish', 'Mussels'],
  ['sesame', 'Til'], ['sesame', 'Tahini'], ['sesame', 'Gingelly oil'],
  ['mustard', 'Sarson ka saag'], ['mustard', 'Kasundi'],
];

/** MUST NOT be caught: these cost somebody food for no reason. */
const SAFE: Array<[declared: string, ingredient: string]> = [
  // The word is inside another word.
  ['egg', 'Eggplant'], ['nuts', 'Nutmeg'], ['nuts', 'Jaiphal'],
  ['nuts', 'Butternut squash'], ['nuts', 'Water chestnut'], ['sesame', 'Tilapia'],
  ['sesame', 'Lentils'], ['mustard', 'Raisins'], ['mustard', 'Rajma'],

  // A gluten-free Indian kitchen is mostly flour.
  ['gluten', 'Besan'], ['gluten', 'Rice flour'], ['gluten', 'Gram flour'],
  ['gluten', 'Jowar'], ['gluten', 'Bajra'], ['gluten', 'Ragi'], ['gluten', 'Kuttu ka atta is not this'],
  ['gluten', 'Corn flour'], ['gluten', 'Rice noodles'],

  // A plant milk is not dairy, and a nut butter is not butter.
  ['milk', 'Coconut milk'], ['milk', 'Almond milk'], ['milk', 'Soy milk'],
  ['milk', 'Peanut butter'], ['milk', 'Cocoa butter'],

  // Plain foods.
  ['milk', 'Tomato'], ['nuts', 'Potato'], ['gluten', 'Basmati rice'], ['fish', 'Paneer'],
];

describe('the adversarial allergen set', () => {
  it.each(TRAPS)('declaring %s excludes a dish with %s', (declared, ingredient) => {
    const hit = findAllergen('Some dish', [ingredient], [declared]);
    expect(hit).not.toBeNull();
    expect(hit!.found).toBe(ingredient);
  });

  it.each(SAFE)('declaring %s does NOT exclude a dish with %s', (declared, ingredient) => {
    expect(isAllergenSafe('Some dish', [ingredient], [declared])).toBe(true);
  });

  it('catches an allergen in the DISH NAME as well as its ingredients', () => {
    // Datasets mislabel. "Paneer Butter Masala" listing only spices still says
    // paneer on the tin, and the name is evidence too.
    expect(isAllergenSafe('Paneer Butter Masala', ['Tomato', 'Onion'], ['milk'])).toBe(false);
    expect(isAllergenSafe('Prawn Balchao', ['Vinegar'], ['shellfish'])).toBe(false);
  });
});

describe('an avoided food that is not an allergen', () => {
  it('is honoured literally, and on words', () => {
    expect(isAllergenSafe('Curry', ['Mushroom'], ['mushroom'])).toBe(false);
    expect(isAllergenSafe('Curry', ['Spring onion'], ['onion'])).toBe(false);
    expect(isAllergenSafe('Curry', ['Onion powder'], ['onion'])).toBe(false);
  });

  it('does not drag a whole family in behind it', () => {
    // Somebody who avoids brinjal has not declared a nightshade allergy.
    expect(isAllergenSafe('Curry', ['Tomato', 'Potato'], ['brinjal'])).toBe(true);
  });
});

describe('normaliseAllergen', () => {
  it('maps what a citizen types to the family it means', () => {
    expect(normaliseAllergen('nuts')).toBe('treenut');
    expect(normaliseAllergen('Tree Nuts')).toBe('treenut');
    expect(normaliseAllergen('DAIRY')).toBe('milk');
    expect(normaliseAllergen('coeliac')).toBe('gluten');
    expect(normaliseAllergen('wheat')).toBe('gluten');
    expect(normaliseAllergen('prawns')).toBe('shellfish');
  });

  it('returns null for a food that is simply disliked', () => {
    expect(normaliseAllergen('mushroom')).toBeNull();
    expect(normaliseAllergen('okra')).toBeNull();
    expect(normaliseAllergen('')).toBeNull();
  });
});

describe('allergensIn', () => {
  it('reads every family a single ingredient carries', () => {
    expect([...allergensIn('Paneer')]).toEqual(['milk']);
    expect([...allergensIn('Cashew cream')].sort()).toEqual(['milk', 'treenut']);
    expect([...allergensIn('Tomato')]).toEqual([]);
  });

  it('leans towards excluding where the food world disagrees with itself', () => {
    // Coconut is a tree nut to the FDA and tolerated by most tree-nut allergics.
    // An unnecessary exclusion costs a curry; the other mistake costs an
    // ambulance. Recorded here so the choice is visible rather than accidental.
    expect(allergensIn('Coconut').has('treenut')).toBe(true);
  });
});

describe('nothing declared', () => {
  it('excludes nothing', () => {
    expect(isAllergenSafe('Prawn Curry', ['Prawns', 'Paneer'], [])).toBe(true);
  });
});
