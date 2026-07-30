import {
  FORBIDDEN_BY_DIET, explainScreen, labelMatchesContents, normaliseDiet,
  screenRecipe, tagsForIngredient, tagsForRecipe,
} from './diet-tags';

describe('reading a dish from its ingredients', () => {
  it('tags the obvious things', () => {
    expect(tagsForIngredient('Chicken breast')).toEqual(['contains-meat']);
    expect(tagsForIngredient('Prawns')).toEqual(['contains-fish']);
    expect(tagsForIngredient('Paneer')).toEqual(['contains-dairy']);
    expect(tagsForIngredient('Onion')).toEqual(['contains-onion-garlic']);
    expect(tagsForIngredient('Potato')).toEqual(['contains-root-vegetable']);
    expect(tagsForIngredient('Honey')).toEqual(['contains-honey']);
  });

  it('reads the names these recipes are actually written in', () => {
    expect(tagsForIngredient('Aloo')).toEqual(['contains-root-vegetable']);
    expect(tagsForIngredient('Pyaz')).toEqual(['contains-onion-garlic']);
    expect(tagsForIngredient('Lehsun')).toEqual(['contains-onion-garlic']);
    expect(tagsForIngredient('Dahi')).toEqual(['contains-dairy']);
    expect(tagsForIngredient('Ghee')).toEqual(['contains-dairy']);
    expect(tagsForIngredient('Keema')).toEqual(['contains-meat']);
    expect(tagsForIngredient('Gajar')).toEqual(['contains-root-vegetable']);
  });

  it('carries more than one tag when the ingredient earns it', () => {
    expect(tagsForIngredient('Ginger garlic paste').sort())
      .toEqual(['contains-onion-garlic', 'contains-root-vegetable']);
  });
});

/**
 * The exceptions are the part that decides whether anyone keeps the filter
 * switched on. Each of these is a real ingredient string that a naive substring
 * match gets wrong.
 */
describe('the things a careless match gets wrong', () => {
  it('an eggplant is not an egg', () => {
    expect(tagsForIngredient('Eggplant')).toEqual([]);
    expect(tagsForIngredient('Egg plant')).toEqual([]);
    expect(tagsForIngredient('Eggless mayonnaise')).toEqual([]);
  });

  it('a chickpea is not a chicken', () => {
    expect(tagsForIngredient('Chickpeas')).toEqual([]);
    expect(tagsForIngredient('Chickpea flour')).toEqual([]);
  });

  it('kidney beans are a bean', () => {
    expect(tagsForIngredient('Kidney beans')).toEqual([]);
    expect(tagsForIngredient('Rajma')).toEqual([]);
  });

  it('coconut milk is not dairy, and neither is peanut butter', () => {
    for (const s of ['Coconut milk', 'Almond milk', 'Soy milk', 'Oat milk', 'Cashew cream', 'Peanut butter', 'Cocoa butter', 'Non-dairy cream']) {
      expect([s, tagsForIngredient(s)]).toEqual([s, []]);
    }
  });

  it('but the real ones still fire', () => {
    expect(tagsForIngredient('Milk')).toEqual(['contains-dairy']);
    expect(tagsForIngredient('Whole milk')).toEqual(['contains-dairy']);
    expect(tagsForIngredient('Butter')).toEqual(['contains-dairy']);
  });

  it('hing is not garlic — it is what Jain cooking uses instead', () => {
    // Excluding asafoetida would empty the cuisine it is meant to protect.
    expect(tagsForIngredient('Asafoetida')).toEqual([]);
    expect(tagsForIngredient('Hing')).toEqual([]);
  });

  it('dried turmeric and dry ginger are spices, not root vegetables', () => {
    expect(tagsForIngredient('Turmeric powder')).toEqual([]);
    expect(tagsForIngredient('Dry ginger')).toEqual([]);
    expect(tagsForIngredient('Sonth')).toEqual([]);
    // Fresh ginger is excluded, which is the app's existing choice.
    expect(tagsForIngredient('Ginger')).toEqual(['contains-root-vegetable']);
  });

  it('worcestershire sauce is fish, which is the point of listing it', () => {
    expect(tagsForIngredient('Worcestershire sauce')).toEqual(['contains-fish']);
  });
});

describe('who may eat what', () => {
  const dish = (...ing: string[]) => ing;

  it('vegan and Jain are not the same strictness, they are different rules', () => {
    // The mistake the old level table made by ranking both at 0. A vegan dish
    // can be all onion and potato; a Jain dish can be all ghee and paneer.
    const aloo = dish('Potato', 'Onion', 'Oil', 'Cumin');
    const paneerCurry = dish('Paneer', 'Tomato', 'Ghee', 'Cashew');

    expect(screenRecipe('vegan', aloo).ok).toBe(true);
    expect(screenRecipe('jain', aloo).ok).toBe(false);

    expect(screenRecipe('jain', paneerCurry).ok).toBe(true);
    expect(screenRecipe('vegan', paneerCurry).ok).toBe(false);
  });

  it('names the ingredient that broke the rule', () => {
    const s = screenRecipe('jain', dish('Rice', 'Carrot', 'Oil'));
    expect(s.ok).toBe(false);
    expect(s.offending).toEqual([{ ingredient: 'Carrot', tag: 'contains-root-vegetable' }]);
    expect(explainScreen(s)).toBe('contains a root vegetable (Carrot)');
  });

  it('lets an unrestricted diet through without inspecting anything', () => {
    expect(screenRecipe('nonveg', dish('Chicken', 'Onion')).ok).toBe(true);
    expect(screenRecipe('everything', dish('Prawns')).ok).toBe(true);
  });

  it('holds the ladder the spec states', () => {
    expect(screenRecipe('veg', dish('Egg')).ok).toBe(false);
    expect(screenRecipe('egg', dish('Egg')).ok).toBe(true);
    expect(screenRecipe('egg', dish('Fish')).ok).toBe(false);
    expect(screenRecipe('pesc', dish('Fish')).ok).toBe(true);
    expect(screenRecipe('pesc', dish('Mutton')).ok).toBe(false);
    expect(screenRecipe('vegan', dish('Honey')).ok).toBe(false);
    expect(screenRecipe('veg', dish('Honey')).ok).toBe(true);
  });

  it('jainvegan is both rules at once, which is what the internal tag means', () => {
    expect(screenRecipe('jainvegan', dish('Ghee')).ok).toBe(false);
    expect(screenRecipe('jainvegan', dish('Onion')).ok).toBe(false);
    expect(screenRecipe('jainvegan', dish('Rice', 'Cabbage', 'Oil')).ok).toBe(true);
  });
});

describe('the diet string as it actually arrives', () => {
  it('accepts the spellings in the database', () => {
    expect(normaliseDiet('eggetarian')).toBe('egg');
    expect(normaliseDiet('pescatarian')).toBe('pesc');
    expect(normaliseDiet('non-veg')).toBe('nonveg');
    expect(normaliseDiet('VEGAN')).toBe('vegan');
    expect(normaliseDiet(' jain ')).toBe('jain');
  });

  it('falls back to vegetarian, never to unrestricted', () => {
    // A diet we cannot read must not become "serve them anything".
    for (const junk of [null, undefined, '', 'paleo', 'keto']) {
      expect(FORBIDDEN_BY_DIET[normaliseDiet(junk)]).toEqual(FORBIDDEN_BY_DIET.vegetarian);
    }
  });
});

describe('a recipe label that disagrees with the recipe', () => {
  it('catches a dish tagged jain that contains potato', () => {
    // This is not hypothetical: it is in the seeded corpus.
    const s = labelMatchesContents('jain', ['Sago', 'Peanuts', 'Potato']);
    expect(s.ok).toBe(false);
    expect(s.offending[0].ingredient).toBe('Potato');
  });

  it('passes a dish whose label is honest', () => {
    expect(labelMatchesContents('jain', ['Rice', 'Capsicum', 'Cabbage', 'Oil']).ok).toBe(true);
    expect(labelMatchesContents('vegan', ['Tofu', 'Spinach', 'Oil']).ok).toBe(true);
  });
});

describe('tagsForRecipe', () => {
  it('unions across the list and does not repeat a tag', () => {
    expect(tagsForRecipe(['Paneer', 'Milk', 'Onion']).sort())
      .toEqual(['contains-dairy', 'contains-onion-garlic']);
  });

  it('is empty for a dish nothing forbids', () => {
    expect(tagsForRecipe(['Rice', 'Cabbage', 'Oil', 'Salt'])).toEqual([]);
  });
});
