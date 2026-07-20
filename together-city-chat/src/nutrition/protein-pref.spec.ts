import {
  allowedProteins, detectProteins, passesProtein, hasSelectedAnimalProtein,
  isProteinRestricted, isPlantForward,
} from './nutrition.service';

// Minimal RecipeWithIng-shaped factory for the pure protein helpers.
const rec = (name: string, slot: string, ing: string[] = []) =>
  ({ id: name, slot, diet: 'nonveg', name, country: 'India', minutes: 15,
     ingredients: ing.map((n) => ({ name: n })) }) as never;

describe('protein preference — diet §7 rules', () => {
  const nonVeg = allowedProteins({ proteins: ['chicken', 'egg'] }); // user eats chicken + egg

  it('maps selected chips to animal-protein tokens', () => {
    expect([...nonVeg].sort()).toEqual(['chicken', 'egg']);
  });

  it('detects the protein of a dish from its name/ingredients', () => {
    expect([...detectProteins(rec('Moong Dal Chilla', 'b', ['moong dal']))]).toContain('legumes');
    expect([...detectProteins(rec('Egg Bhurji', 'b', ['egg']))]).toContain('egg');
  });

  // A vegan legume breakfast is NOT hard-rejected (fallback stays valid) …
  it('a vegan breakfast still PASSES the hard filter (soft-preferred, not required)', () => {
    expect(passesProtein(rec('Moong Dal Chilla', 'b', ['moong dal']), nonVeg)).toBe(true);
  });

  // … but it is NOT a "selected animal protein", so it ranks BELOW egg/chicken.
  it('breakfast: egg dish is a selected animal protein, dal chilla is not', () => {
    expect(hasSelectedAnimalProtein(rec('Egg Bhurji', 'b', ['egg']), nonVeg)).toBe(true);
    expect(hasSelectedAnimalProtein(rec('Moong Dal Chilla', 'b', ['moong dal']), nonVeg)).toBe(false);
  });

  it('snack: chicken tikka is preferred, a fruit bowl is the fallback', () => {
    expect(hasSelectedAnimalProtein(rec('Chicken Tikka', 's', ['chicken']), nonVeg)).toBe(true);
    expect(hasSelectedAnimalProtein(rec('Fruit Bowl', 's', ['apple', 'banana']), nonVeg)).toBe(false);
  });

  // Lunch/dinner keep the HARD requirement: no selected animal protein → rejected.
  it('lunch MUST contain a selected animal protein (vegan main rejected)', () => {
    expect(passesProtein(rec('Bean & Eggplant Curry', 'l', ['beans', 'eggplant']), nonVeg)).toBe(false);
    expect(passesProtein(rec('Chicken Curry', 'l', ['chicken']), nonVeg)).toBe(true);
  });

  // A protein the user did NOT select is never shown, in any slot (§9 hard filter).
  it('never surfaces an unselected animal protein (fish) even at breakfast', () => {
    expect(passesProtein(rec('Fish Fry', 'b', ['fish']), nonVeg)).toBe(false);
  });

  it('with no protein selection, the diet filter alone governs (all pass)', () => {
    const none = allowedProteins({});
    expect(passesProtein(rec('Fish Fry', 'l', ['fish']), none)).toBe(true);
    expect(hasSelectedAnimalProtein(rec('Fish Fry', 'l', ['fish']), none)).toBe(false);
  });
});

describe('protein-restricted (kidney/CKD) — stop forcing animal protein', () => {
  const nonVeg = allowedProteins({ proteins: ['chicken', 'egg'] });

  it('detects a protein-restricted profile from health conditions', () => {
    expect(isProteinRestricted({ healthConditions: ['Kidney Disease'] })).toBe(true);
    expect(isProteinRestricted({ healthConditions: ['CKD'] })).toBe(true);
    expect(isProteinRestricted({ healthConditions: ['Diabetes'] })).toBe(false);
    expect(isProteinRestricted({})).toBe(false);
  });

  it('flags plant-forward dishes (no animal protein)', () => {
    expect(isPlantForward(rec('Moong Dal Tadka', 'l', ['moong dal']))).toBe(true);
    expect(isPlantForward(rec('Chicken Curry', 'l', ['chicken']))).toBe(false);
  });

  // With requireAnimalMain=false, a vegetarian lunch is allowed for a meat-eater
  // (kidney patient) instead of being rejected for lacking their meat.
  it('a veg lunch PASSES when the animal-main requirement is relaxed', () => {
    expect(passesProtein(rec('Mixed Veg Sabzi', 'l', ['beans', 'carrot']), nonVeg, false)).toBe(true);
    // …but the default (unrestricted) still requires their meat at lunch.
    expect(passesProtein(rec('Mixed Veg Sabzi', 'l', ['beans', 'carrot']), nonVeg, true)).toBe(false);
  });

  it('still never surfaces an UNSELECTED animal protein, even when relaxed', () => {
    expect(passesProtein(rec('Fish Fry', 'l', ['fish']), nonVeg, false)).toBe(false);
  });
});
