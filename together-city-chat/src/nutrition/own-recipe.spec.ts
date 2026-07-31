import { buildOwnRecipe, deriveDiet } from './own-recipe';

const base = {
  name: 'My dish', country: 'Home', slot: 'l', minutes: 30, servings: 2,
};

describe('deriveDiet — the label is read off the dish, never asked for', () => {
  it('calls a chicken dish non-veg however it is described', () => {
    expect(deriveDiet(['chicken breast', 'rice', 'onion'])).toBe('nonveg');
  });

  it('calls a fish dish pescatarian, not non-veg', () => {
    expect(deriveDiet(['rohu fish', 'mustard oil', 'onion'])).toBe('pesc');
  });

  it('does not fire on chickpea for chicken, or eggplant for egg', () => {
    expect(deriveDiet(['chickpea', 'tomato', 'eggplant'])).not.toBe('nonveg');
    expect(deriveDiet(['chickpea', 'tomato', 'eggplant'])).not.toBe('egg');
  });

  it('gives a paneer dish with no onion the jain label, because that is true and narrower', () => {
    // The library's diet filter widens downward — a vegetarian search already
    // includes jain — so the narrower true label reaches MORE people, not fewer.
    expect(deriveDiet(['paneer', 'tomato', 'cumin'])).toBe('jain');
  });

  it('drops a dal to vegan once onion is in it, and to veg once ghee is', () => {
    expect(deriveDiet(['toor dal', 'onion', 'turmeric'])).toBe('vegan');
    expect(deriveDiet(['toor dal', 'onion', 'ghee'])).toBe('veg');
  });

  it('calls an onion-free, dairy-free dish jainvegan — the strictest true label', () => {
    expect(deriveDiet(['toor dal', 'tomato', 'turmeric'])).toBe('jainvegan');
  });
});

describe('buildOwnRecipe — which answer we believe', () => {
  it('works the nutrition out from the ingredients when it can', () => {
    const r = buildOwnRecipe({ ...base, ingredients: [{ name: 'chicken', grams: 300 }, { name: 'rice', grams: 200 }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.nutritionSource).toBe('computed');
    expect(r.row.kcal).toBeGreaterThan(0);
    expect(r.row.coveragePct).toBeGreaterThanOrEqual(60);
    expect(r.computed).not.toBeNull();
  });

  it('never returns zero nutrition dressed up as an answer', () => {
    // The audit's low-coverage branch keeps the STORED figures, which for a new
    // recipe are zero. Handing that back as "0 kcal" would be the worst kind of
    // invented number: confident, precise and completely wrong.
    const r = buildOwnRecipe({ ...base, ingredients: [{ name: 'zorblax', grams: 200 }, { name: 'flurb', grams: 100 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/couldn't work out the nutrition/i);
  });

  it('accepts their own figures when we cannot read the ingredients', () => {
    const r = buildOwnRecipe({
      ...base,
      ingredients: [{ name: 'zorblax', grams: 200 }],
      nutrition: { kcal: 400, protein: 20, carbs: 40, fat: 15, fiber: 4 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.nutritionSource).toBe('author');
    expect(r.row.kcal).toBe(400);
    expect(r.computed).toBeNull();
  });

  it('lets their figures win over ours, and says so when the two disagree badly', () => {
    const r = buildOwnRecipe({
      ...base,
      ingredients: [{ name: 'chicken', grams: 300 }, { name: 'rice', grams: 200 }],
      nutrition: { kcal: 120, protein: 5, carbs: 10, fat: 4, fiber: 1 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.nutritionSource).toBe('author');
    expect(r.row.kcal).toBe(120);
    expect(r.computed).not.toBeNull();
    expect(r.notes.join(' ')).toMatch(/long way from/i);
  });

  it('records how much of the dish we actually recognised', () => {
    const r = buildOwnRecipe({
      ...base,
      ingredients: [{ name: 'chicken', grams: 300 }, { name: 'zorblax', grams: 300 }],
      nutrition: { kcal: 500, protein: 40, carbs: 20, fat: 25, fiber: 2 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.coveragePct).toBeGreaterThan(30);
    expect(r.row.coveragePct).toBeLessThan(70);
  });

  it('refuses a recipe with no ingredients, and one with no quantities', () => {
    expect(buildOwnRecipe({ ...base, ingredients: [] })).toEqual({ ok: false, reason: expect.stringContaining('at least one ingredient') });
    const r = buildOwnRecipe({ ...base, ingredients: [{ name: 'rice', grams: 0 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toMatch(/needs a quantity/i);
  });

  it('derives the diet even when the citizen supplied their own nutrition', () => {
    // The override covers the numbers. It must not become a way to relabel a
    // chicken dish as vegetarian on the way into the planner's pool.
    const r = buildOwnRecipe({
      ...base,
      ingredients: [{ name: 'chicken', grams: 250 }, { name: 'zorblax', grams: 250 }],
      nutrition: { kcal: 450, protein: 35, carbs: 25, fat: 20, fiber: 3 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.row.diet).toBe('nonveg');
  });
});
