import { describe, expect, it } from 'vitest';
import { shoppingForHousehold } from './shopping';
import { buildPlan } from './plan';
import { EMPTY_MEDICAL } from './medical';
import type { NutritionPlan, Pet } from '../types';

/**
 * ONE HOUSE, ONE SHOP.
 *
 * A home with two animals does not make two trips, and the thing that makes
 * that true is merging — one line per product, quantities added. The thing that
 * makes the merged line trustworthy is the split: a total nobody can trace back
 * to the animals that produced it is a total nobody checks.
 *
 * These are the four claims the Monthly page makes on the strength of this
 * function, and they are cheap to break by accident: a Map keyed on the wrong
 * thing splits one bag into two, and a Map keyed on too little merges a cat's
 * food into a dog's line.
 */

function pet(over: Partial<Pet>): Pet {
  return {
    id: 'p', name: 'Pet', species: 'dog', breed: '', dob: null, ageMonths: 36,
    sex: null, weightKg: 20, targetWeightKg: null, bodyCondition: 'ideal',
    activity: 'moderate', housing: 'indoor', sterilised: true, allergies: [],
    sensitivities: [], restrictions: [], currentFood: '', dietStyle: 'commercial',
    goal: 'maintain', healthNotes: '', medical: { ...EMPTY_MEDICAL }, photos: [],
    portrait: 'dog', createdAt: '2026-01-01',
    ...over,
  };
}

/** A plan of one repeated meal, so a test can say exactly what was eaten. */
function planOf(days: number, meals: { productId?: string; recipeId?: string; grams: number }[]): NutritionPlan {
  const base = buildPlan(pet({}));
  return {
    ...base,
    days: Array.from({ length: days }, (_, i) => ({
      ...base.days[0],
      date: `2026-01-${String(i + 1).padStart(2, '0')}`,
      meals: meals.map((m, j) => ({
        ...base.days[0].meals[0],
        id: `m-${i}-${j}`,
        productId: m.productId ?? null,
        recipeId: m.recipeId ?? null,
        grams: m.grams,
        gramsRange: null,
      })),
    })),
  };
}

/* Real rows from the catalogue, because a merge keyed on a product id has to
   be tested against ids the catalogue actually has — a made-up one is dropped
   by the lookup and every assertion below would pass on an empty list. */
const REAL_DOG_FOOD = 'royal-canin--royal-canin-maxi-adult-dog-dry-food';
const OTHER_FOOD = 'whiskas--whiskas-ocean-fish-flavour-adult-cat-dry-food';
const REAL_RECIPE = 'egg-rice-bowl';

describe('one house, one shop', () => {
  it('merges two pets on the same food into one line, quantities added', () => {
    const max = pet({ id: 'max', name: 'Max' });
    const bruno = pet({ id: 'bruno', name: 'Bruno' });
    const list = shoppingForHousehold([
      { pet: max, plan: planOf(10, [{ productId: REAL_DOG_FOOD, grams: 100 }]) },
      { pet: bruno, plan: planOf(10, [{ productId: REAL_DOG_FOOD, grams: 50 }]) },
    ]);

    const lines = list.filter((i) => i.productId === REAL_DOG_FOOD);
    expect(lines).toHaveLength(1);
    // 10 × 100g + 10 × 50g = 1.5 kg, in one bag rather than two lines.
    expect(lines[0].qty).toContain('1.50 kg');
    expect(lines[0].forPets.map((f) => f.name)).toEqual(['Max', 'Bruno']);
    expect(lines[0].forPets.map((f) => f.qty)).toEqual(['1.00 kg', '500 g']);
  });

  it('keeps two pets on different foods as two lines', () => {
    const max = pet({ id: 'max', name: 'Max' });
    const mishti = pet({ id: 'mishti', name: 'Mishti', species: 'cat', weightKg: 4 });
    const other = OTHER_FOOD;
    const list = shoppingForHousehold([
      { pet: max, plan: planOf(5, [{ productId: REAL_DOG_FOOD, grams: 200 }]) },
      { pet: mishti, plan: planOf(5, [{ productId: other, grams: 60 }]) },
    ]);

    expect(list.filter((i) => i.productId === REAL_DOG_FOOD)[0].forPets.map((f) => f.name)).toEqual(['Max']);
    expect(list.filter((i) => i.productId === other)[0].forPets.map((f) => f.name)).toEqual(['Mishti']);
  });

  it('adds up a shared kitchen ingredient across both pets', () => {
    const max = pet({ id: 'max', name: 'Max' });
    const bruno = pet({ id: 'bruno', name: 'Bruno' });
    const recipe = REAL_RECIPE;
    const list = shoppingForHousehold([
      { pet: max, plan: planOf(4, [{ recipeId: recipe, grams: 250 }]) },
      { pet: bruno, plan: planOf(4, [{ recipeId: recipe, grams: 250 }]) },
    ]);

    const kitchen = list.filter((i) => i.source === 'home-kitchen');
    expect(kitchen.length).toBeGreaterThan(0);
    for (const line of kitchen) {
      // Every ingredient is bought once, for both of them.
      expect(line.forPets.map((f) => f.name)).toEqual(['Max', 'Bruno']);
      expect(list.filter((i) => i.label === line.label)).toHaveLength(1);
    }
  });

  it('does not silently drop a pet whose food publishes no energy density', () => {
    const max = pet({ id: 'max', name: 'Max' });
    const bruno = pet({ id: 'bruno', name: 'Bruno' });
    const list = shoppingForHousehold([
      { pet: max, plan: planOf(6, [{ productId: REAL_DOG_FOOD, grams: 150 }]) },
      // grams 0 is what the planner produces when nothing published a kcal/kg.
      { pet: bruno, plan: planOf(6, [{ productId: REAL_DOG_FOOD, grams: 0 }]) },
    ]);

    const line = list.filter((i) => i.productId === REAL_DOG_FOOD)[0];
    expect(line.forPets).toHaveLength(2);
    // The weight it can prove, AND the pack it cannot — never one or the other.
    expect(line.qty).toContain('900 g');
    expect(line.qty).toContain('pack');
    expect(line.forPets[1].qty).toBe('1 pack');
  });

  it('gives a house of one animal a list with that animal on every line', () => {
    const max = pet({ id: 'max', name: 'Max' });
    const list = shoppingForHousehold([
      { pet: max, plan: planOf(3, [{ productId: REAL_DOG_FOOD, grams: 300 }]) },
    ]);
    expect(list.length).toBeGreaterThan(0);
    for (const line of list) expect(line.forPets.map((f) => f.name)).toEqual(['Max']);
  });
});
