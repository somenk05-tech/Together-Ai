import { assessBeauty } from '../beauty/beauty-analysis';
import { matchProducts, stepsFor, NEUTRAL_ATTRIBUTES, type ShelfProduct } from '../beauty/look-decode';
import { findAllergen } from './allergens';
import { findSensitivity, isTopicallySafe, sensitivitiesIn } from './topical-sensitivities';

/**
 * Every case below failed against the substring filters this module replaced,
 * except where marked as guarding the fix from over-correcting.
 */
describe('a declared sensitivity reaches what it means', () => {
  const cases: Array<[string, string, string[]]> = [
    // [declared term, product name, actives]
    ['tree nuts', 'Almond Glow Serum', ['Almond oil']],
    ['nuts', 'Repair Balm', ['Cashew butter']],
    ['nut allergy', 'Hydrating Oil', ['Macadamia oil']],
    ['salicylates', 'Clarifying Treatment', ['Salicylic acid (BHA) 2%']],
    ['aspirin', 'Pore Serum', ['Willow bark extract']],
    ['parabens', 'Daily Lotion', ['Methylparaben']],
    ['sulphates', 'Clarifying Shampoo', ['Sodium laureth sulfate']],
    ['sls', 'Foaming Wash', ['Sodium lauryl sulphate']],
    ['fragrance', 'Rose Cream', ['Parfum']],
    ['fragrance', 'Citrus Toner', ['Limonene']],
    ['retinol', 'Night Serum', ['Retinyl palmitate']],
    ['vitamin a', 'Renewal Cream', ['Tretinoin']],
    ['alcohol', 'Setting Spray', ['Alcohol denat.']],
    ['formaldehyde', 'Smoothing Mask', ['DMDM hydantoin']],
    ['silicones', 'Shine Serum', ['Cyclopentasiloxane']],
    ['dairy', 'Milk Cleanser', ['Milk protein']],
  ];

  it.each(cases)('“%s” excludes %s', (term, name, actives) => {
    const hit = findSensitivity(name, actives, [term]);
    if (!hit) throw new Error(`"${term}" did not exclude ${name} (${actives.join(', ')})`);
    expect(hit.term).toBe(term.toLowerCase());
  });
});

describe('and stops where it should', () => {
  // Over-exclusion is not the safe direction. A filter that removes most of the
  // shelf is one somebody turns off, and then it protects nobody at all.
  const allowed: Array<[string, string, string[]]> = [
    ['alcohol', 'Barrier Cream', ['Cetearyl alcohol', 'Ceramides']],
    ['alcohol', 'Rich Moisturiser', ['Stearyl alcohol']],
    ['fragrance', 'Calm Cream', ['Fragrance-free base']],
    ['parabens', 'Gentle Gel', ['Paraben-free preservative system']],
    ['sulphates', 'Soothing Soak', ['Magnesium sulphate']],
    ['nuts', 'Spice Balm', ['Nutmeg oil']],
    ['nuts', 'Hydrating Gel', ['Nutritional yeast ferment']],
    ['retinol', 'Glow Oil', ['Beta carotene']],
    ['salicylates', 'Barrier Cream', ['Ceramides', 'Cholesterol']],
  ];

  it.each(allowed)('“%s” allows %s', (term, name, actives) => {
    const hit = findSensitivity(name, actives, [term]);
    if (hit) throw new Error(`"${term}" wrongly excluded ${name} — matched "${hit.found}" as ${hit.family}`);
    expect(isTopicallySafe(name, actives, [term])).toBe(true);
  });

  it('an empty or blank declaration excludes nothing', () => {
    expect(isTopicallySafe('Almond Glow Serum', ['Almond oil'], [])).toBe(true);
    expect(isTopicallySafe('Almond Glow Serum', ['Almond oil'], ['', '  '])).toBe(true);
  });

  it('a term none of our lists know is still honoured, on words', () => {
    // The citizen who types something we have never heard of is the one most
    // likely to be right about their own skin.
    expect(isTopicallySafe('Rosemary Scalp Serum', ['Rosemary extract'], ['rosemary'])).toBe(false);
    expect(isTopicallySafe('Ceramide Cream', ['Ceramides'], ['rosemary'])).toBe(true);
  });

  it('names what caused the exclusion, not just a boolean', () => {
    // The product NAME is a candidate too, and it is checked first — "Almond
    // Glow Serum" is itself the evidence, so that is what gets reported.
    const byName = findSensitivity('Almond Glow Serum', ['Almond oil'], ['tree nuts']);
    expect(byName?.found).toBe('Almond Glow Serum');
    expect(byName?.family).toBe('treenut');

    // And when the name gives nothing away, the ingredient is named instead —
    // which is the case that matters, because that is the one a citizen could
    // not have spotted for themselves.
    const byIngredient = findSensitivity('Radiance Serum', ['Sweet almond oil'], ['tree nuts']);
    expect(byIngredient?.found).toBe('Sweet almond oil');
    expect(byIngredient?.family).toBe('treenut');
  });

  it('reads a declaration the way somebody writes it', () => {
    // "nut allergy" resolved to nothing before declaredTerm: not in the lookup
    // table, so it fell through to a literal match for a food called
    // "nut allergy", which no ingredient list has ever contained.
    for (const term of ['nut allergy', 'allergic to nuts', 'nut allergies', 'no nuts']) {
      expect(isTopicallySafe('Hydrating Oil', ['Macadamia oil'], [term])).toBe(false);
    }
    expect(isTopicallySafe('Daily Lotion', ['Methylparaben'], ['paraben sensitivity'])).toBe(false);
    expect(isTopicallySafe('Wash', ['Sodium laureth sulfate'], ['sulphate free'])).toBe(false);
  });

  it('does not classify an ingredient it has no rule for', () => {
    expect([...sensitivitiesIn('Ceramides')]).toEqual([]);
    expect([...sensitivitiesIn('Hyaluronic acid')]).toEqual([]);
  });
});

describe('the call sites that were wrong', () => {
  it('restaurants: a nut-declared citizen is not shown the kaju curry', () => {
    // The menu names go in as separate candidates, the way restaurants.service
    // now passes them, instead of one concatenated blob of name + tagline + menu.
    const menu = ['Kaju Curry', 'Badam Halwa', 'Dal Tadka'];
    const hit = findAllergen('Spice Route', menu, ['nuts']);
    if (!hit) throw new Error('"nuts" did not match a menu of kaju and badam');
    expect(hit.allergen).toBe('treenut');

    // And a menu with nothing in it stays visible — the filter hides the whole
    // restaurant, so over-matching costs somebody dinner.
    expect(findAllergen('Dal House', ['Dal Tadka', 'Jeera Rice'], ['nuts'])).toBeNull();
  });

  it('look-decode: “tree nuts” keeps the almond serum off the shelf', () => {
    // The fixture in look-decode.spec.ts, with the term written the way a person
    // writes it rather than the way the substring test needed.
    const shelf: ShelfProduct[] = [
      { id: 'p_moist', name: 'Ceramide Barrier Cream', category: 'Moisturiser', suitableSkin: ['all'], actives: ['Ceramides'] },
      { id: 'p_nut', name: 'Almond Glow Serum', category: 'Serum', suitableSkin: ['all'], actives: ['Almond oil'] },
    ];
    const matched = matchProducts(stepsFor({ ...NEUTRAL_ATTRIBUTES }), shelf, { allergies: ['tree nuts'] });
    expect(matched.map((m) => m.productId)).not.toContain('p_nut');
  });

  it('beauty-analysis: a salicylate-sensitive citizen is not recommended salicylic acid', () => {
    // Oily skin is what triggers the recommendation, so this is the profile the
    // miss actually reached: the ingredient is named, with a reason, in the plan.
    const withOut = assessBeauty({ skinType: 'oily', skinConcerns: ['acne'], allergies: [] });
    expect(JSON.stringify(withOut.ingredients)).toContain('Salicylic acid');

    const withIt = assessBeauty({ skinType: 'oily', skinConcerns: ['acne'], allergies: ['salicylates'] });
    expect(JSON.stringify(withIt.ingredients)).not.toContain('Salicylic acid');
    expect(JSON.stringify(withIt.routine)).not.toContain('Salicylic acid');
    expect(JSON.stringify(withIt.skin.recommendations)).not.toContain('Salicylic');
  });
});
