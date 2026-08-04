import { slotForRecipe, targetDay, buildOwnDay, type OwnEntry } from './own-plan';
import type { PoolRecipe } from './meal-composer';

/**
 * "Create Your Own Meal Plan" used to add dishes to a grocery CART: you chose
 * food and got a shopping list, never a plan. These are the rules of the plan
 * that replaced it.
 */
const recipe = (id: string, categories: string[], name = id): PoolRecipe => ({
  id, name, cuisine: 'India', categories, role: 'main',
  kcal: 300, protein: 12, carbs: 30, fat: 10, fiber: 4, minutes: 20, grams: 200, diet: 'vegetarian',
  ingredients: [{ name: 'Paneer', grams: 100 }],
  nutrients: { sodiumMg: 200, potassiumMg: 300, phosphorusMg: 150, sugarG: 2, addedSugarG: 0, satFatG: 3 },
  nutrientComplete: true, steps: [], imageUrl: null,
} as unknown as PoolRecipe);

describe('slotForRecipe — the corpus already knows the course', () => {
  it('files a breakfast dish at breakfast', () => {
    expect(slotForRecipe(recipe('a', ['breakfast']))).toBe('b');
  });
  it('files a soup at the evening course', () => {
    expect(slotForRecipe(recipe('a', ['soup']))).toBe('es');
  });
  it('sends a dish that is both lunch and dinner to the earlier one', () => {
    // It can be moved. Guessing the later course means a dish chosen at
    // breakfast-time lands at night, which reads as the app ignoring you.
    expect(slotForRecipe(recipe('a', ['lunch', 'dinner']))).toBe('l');
  });
  it('falls back to dinner, the widest plate, rather than stranding the dish', () => {
    // No category is a corpus gap. Dropping the dish would hide that from the
    // person who just chose it.
    expect(slotForRecipe(recipe('a', []))).toBe('d');
    expect(slotForRecipe(recipe('a', ['condiment']))).toBe('d');
  });
});

describe('targetDay — locking is the only thing that moves the day', () => {
  it('is today while today is unlocked', () => {
    expect(targetDay(3, [], 21)).toBe(3);
    expect(targetDay(3, [0, 1, 2], 21)).toBe(3);   // yesterday's locks are irrelevant
  });
  it('moves to tomorrow once today is locked', () => {
    expect(targetDay(3, [3], 21)).toBe(4);
  });
  it('skips every settled day in a row', () => {
    expect(targetDay(3, [3, 4, 5], 21)).toBe(6);
  });
  it('holds on the last day rather than running off the end of the plan', () => {
    // A citizen who locks all twenty-one days has nowhere to put a dish. Adding
    // to a day that does not exist would be worse than adding to the last one.
    expect(targetDay(0, Array.from({ length: 21 }, (_, i) => i), 21)).toBe(20);
  });
});

describe('buildOwnDay — their dishes, and nothing else', () => {
  const pool = [
    recipe('bf', ['breakfast'], 'Poha'),
    recipe('ln', ['lunch'], 'Paneer Butter Masala'),
    recipe('ln2', ['lunch'], 'Dal Tadka'),
  ];

  it('groups dishes into the courses they were added to', () => {
    const entries: OwnEntry[] = [
      { slot: 'b', recipeId: 'bf' }, { slot: 'l', recipeId: 'ln' }, { slot: 'l', recipeId: 'ln2' },
    ];
    const day = buildOwnDay(entries, pool);
    expect(day.map((m) => m.slot)).toEqual(['b', 'l']);
    expect(day[1].components.map((c) => c.name)).toEqual(['Paneer Butter Masala', 'Dal Tadka']);
  });

  it('shows no course the citizen has not put anything in', () => {
    // The day is what they built. An empty Dinner heading is the engine's day
    // showing through a page that is supposed to be theirs.
    const day = buildOwnDay([{ slot: 'b', recipeId: 'bf' }], pool);
    expect(day).toHaveLength(1);
  });

  it('serves a whole portion, because they chose the dish and not a fraction of it', () => {
    const day = buildOwnDay([{ slot: 'l', recipeId: 'ln' }], pool);
    expect(day[0].components[0].portionPct).toBe(100);
    expect(day[0].components[0].kcal).toBe(300);
    expect(day[0].totals.kcal).toBe(300);
  });

  it('totals a course from its dishes', () => {
    const day = buildOwnDay([{ slot: 'l', recipeId: 'ln' }, { slot: 'l', recipeId: 'ln2' }], pool);
    expect(day[0].totals.kcal).toBe(600);
    expect(day[0].totals.protein).toBe(24);
  });

  it('drops a dish that has left the corpus rather than drawing a blank row', () => {
    const day = buildOwnDay([{ slot: 'l', recipeId: 'ln' }, { slot: 'l', recipeId: 'gone' }], pool);
    expect(day[0].components).toHaveLength(1);
  });

  it('returns nothing at all for a day with nothing in it', () => {
    expect(buildOwnDay([], pool)).toEqual([]);
  });
});
