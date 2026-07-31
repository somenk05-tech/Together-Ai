import { canonicaliseDeclared, findAllergen } from '../shared/allergens';
import { findSensitivity } from '../shared/topical-sensitivities';

/**
 * The journey a nut allergy takes across the city.
 *
 * Nutrition asks. Beauty and Restaurants do not, and until this landed neither
 * could find out — a citizen who told the meal planner about nuts was recommended
 * products by a hub with no idea, and the two hubs' answers to "what can't you
 * have" were separate facts about the same person.
 *
 * These are the pure ends of that path: what gets stored, and what a consumer
 * makes of it. The wiring between them (syncShared, get()'s back-fill, the two
 * readers) is covered by typecheck and the existing profile suites; what is worth
 * pinning here is that the STORED FORM survives the round trip, because that is
 * the part a future refactor to "just store the keys" would quietly break.
 */
describe('what the master stores', () => {
  it('canonicalises what people actually type', () => {
    expect(canonicaliseDeclared(['Nut allergy', ' dairy ', 'allergic to sesame']))
      .toEqual(['dairy', 'nut', 'sesame']);
  });

  it('drops blanks and duplicates, and sorts — the same answers give one string', () => {
    expect(canonicaliseDeclared(['nuts', '', '  ', 'nuts', 'nut allergy'])).toEqual(['nut', 'nuts']);
    expect(canonicaliseDeclared(['sesame', 'dairy']).join(','))
      .toBe(canonicaliseDeclared(['dairy', 'sesame']).join(','));
  });

  it('KEEPS an allergen no family knows — the whole reason this is words', () => {
    // Storing resolved AllergenKeys would drop these entirely, and they are
    // exactly the set where being wrong is least recoverable: nobody else in the
    // city is going to warn this citizen about kiwi.
    const stored = canonicaliseDeclared(['kiwi allergy', 'sulphites', 'mango']);
    expect(stored).toEqual(['kiwi', 'mango', 'sulphites']);

    // And a consumer honours them literally, on whole words.
    expect(findAllergen('Fruit Bowl', ['Kiwi', 'Banana'], stored)?.found).toBe('Kiwi');
    expect(findAllergen('Dal Tadka', ['Toor dal'], stored)).toBeNull();
  });

  it('survives the round trip a hub actually performs', () => {
    // Nutrition joins on save; Beauty and Restaurants split on read.
    const saved = canonicaliseDeclared('Nut allergy, dairy'.split(/[,;]/)).join(',');
    expect(saved).toBe('dairy,nut');

    const readBack = saved.split(',').map((s) => s.trim()).filter(Boolean);
    expect(findAllergen('Radiance Serum', ['Sweet almond oil'], readBack)?.allergen).toBe('treenut');
    expect(findAllergen('Spice Route', ['Kaju Curry'], readBack)?.allergen).toBe('treenut');
    expect(findAllergen('Ceramide Serum', ['Ceramides'], readBack)).toBeNull();
  });

  it('a dairy allergy does not delete every moisturiser on the shelf', () => {
    // The first thing that went wrong when food allergens started reaching
    // Beauty: "cream" and "butter" are dairy in a recipe and a FORMAT on a
    // label. The product name is stripped of them; the ingredient list is not.
    expect(findSensitivity('Ceramide Barrier Cream', ['Ceramides'], ['dairy'])).toBeNull();
    expect(findSensitivity('Whipped Body Butter', ['Shea butter'], ['dairy'])).toBeNull();

    // And the exclusion still lands when an INGREDIENT actually says so.
    expect(findSensitivity('Cleansing Milk', ['Milk protein'], ['dairy'])?.found).toBe('Milk protein');
    expect(findSensitivity('Repair Mask', ['Hydrolysed whey'], ['dairy'])?.found).toBe('Hydrolysed whey');

    // Coconut is not a format word — it is an ingredient people put on skin.
    expect(findSensitivity('Coconut Balm', [], ['tree nuts'])?.family).toBe('treenut');
  });

  it('an empty declaration stores an empty string, not a phantom term', () => {
    expect(canonicaliseDeclared(''.split(/[,;]/))).toEqual([]);
    expect(canonicaliseDeclared(',, ;'.split(/[,;]/)).join(',')).toBe('');
  });
});
