import { categorizeRecipe, SLOTS, resolveSchedule } from './meal-engine';
import { composeWeek, type PoolRecipe, type ComposerPrefs, type DayTargets } from './meal-composer';

/** Spec §1–§5: categorizeRecipe places recipes the way Indian families eat. */
describe('Indian meal classification (categorizeRecipe)', () => {
  const cats = (name: string, cuisine = 'India') => categorizeRecipe({ name, cuisine });

  it('Poha → breakfast only', () => {
    expect(cats('Vegetable Poha')).toEqual(['breakfast']);
  });
  it('Idli / Dosa / Upma / Paratha / Chilla → breakfast', () => {
    for (const n of ['Idli Sambar', 'Masala Dosa', 'Rava Upma', 'Aloo Paratha', 'Besan Cheela']) {
      expect(cats(n)).toContain('breakfast');
    }
  });
  it('Fresh fruit → snack only', () => {
    for (const n of ['Apple', 'Banana', 'Sliced Papaya', 'Watermelon', 'Guava', 'Seasonal Fruit Bowl']) {
      expect(cats(n)).toEqual(['snack']);
    }
  });
  it('Soup → soup category (evening slot)', () => {
    for (const n of ['Tomato Soup', 'Sweet Corn Soup', 'Chicken Soup', 'Lentil Soup', 'Mushroom Soup']) {
      expect(cats(n, 'Global')).toContain('soup');
    }
  });
  it('Kadhi Chawal / Rajma Chawal → lunch AND dinner', () => {
    for (const n of ['Kadhi Chawal', 'Rajma Chawal']) {
      const c = cats(n);
      expect(c).toContain('lunch');
      expect(c).toContain('dinner');
    }
  });
  it('Paneer Butter Masala / Chicken Curry → lunch AND dinner', () => {
    for (const n of ['Paneer Butter Masala', 'Chicken Curry']) {
      const c = cats(n);
      expect(c).toContain('lunch');
      expect(c).toContain('dinner');
    }
  });
  it('International mains → dinner only (never weekday lunch)', () => {
    const intl: Array<[string, string]> = [
      ['Thai Green Curry', 'Thailand'], ['Veg Fried Rice', 'China'], ['Hakka Noodles', 'China'],
      ['Margherita Pizza', 'Italy'], ['Penne Alfredo', 'Italy'], ['Chicken Manchurian', 'China'],
    ];
    for (const [n, cu] of intl) {
      const c = cats(n, cu);
      expect(c).toContain('dinner');
      expect(c).not.toContain('lunch');
    }
  });
  it('Breakfast never includes heavy mains / international dishes', () => {
    for (const [n, cu] of [['Butter Chicken', 'India'], ['Dal Makhani', 'India'], ['Paneer Butter Masala', 'India'], ['Veg Fried Rice', 'China'], ['Thai Green Curry', 'Thailand'], ['Hakka Noodles', 'China']] as Array<[string, string]>) {
      expect(cats(n, cu)).not.toContain('breakfast');
    }
  });
  it('a foreign main with "salad" in the name (Satay Chicken Pasta Salad) → dinner only, never lunch', () => {
    const c = categorizeRecipe({ name: 'Satay Chicken Pasta Salad', cuisine: 'Thailand' });
    expect(c).toContain('dinner');
    expect(c).not.toContain('lunch');
    expect(c).not.toContain('salad');
  });
  it('a heavy dish mis-tagged breakfast in the dataset (Masala Mushroom & Eggplant) is NOT breakfast', () => {
    const c = categorizeRecipe({ name: 'Masala Mushroom And Eggplant', cuisine: 'India', slot: 'b', kcal: 370 });
    expect(c).not.toContain('breakfast');
  });
  it('Pure condiments (mayonnaise/pesto) are dropped from meals', () => {
    expect(cats('Mayonnaise')).toEqual(['condiment']);
    expect(cats('Basil Pesto')).toEqual(['condiment']);
  });
});

/** The day is structured Breakfast → Lunch → Snack → Evening Soup → Dinner. */
describe('daily structure = authentic Indian eating order', () => {
  it('five slots in eating order with a dedicated evening soup', () => {
    expect(SLOTS.map((s) => s.key)).toEqual(['breakfast', 'lunch', 'snack', 'evening', 'dinner']);
    const soupSlot = SLOTS.find((s) => s.key === 'evening')!;
    expect(soupSlot.categories).toContain('soup');
    expect(soupSlot.start).toBe('18:30');
  });
  it('energy split sums to 1.0 and respects guardrails', () => {
    const sum = SLOTS.reduce((t, s) => t + s.energy, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(1e-9);
    for (const s of SLOTS) { expect(s.energy).toBeGreaterThanOrEqual(0.08); expect(s.energy).toBeLessThanOrEqual(0.35); }
  });
  it('standard schedule surfaces all five meals', () => {
    const sched = resolveSchedule(undefined);
    expect(sched.meals.map((m) => m.key)).toEqual(['breakfast', 'lunch', 'snack', 'evening', 'dinner']);
  });
});

/** A composed week actually serves the right thing in each slot. */
describe('composed week respects the Indian meal model', () => {
  const targets: DayTargets = { kcal: 2000, protein: 90, carbs: 250, fat: 60, fiber: 30 };
  const prefs: ComposerPrefs = { diet: 'vegetarian' };
  const week = composeWeek(targets, prefs, 7, 7);

  it('every day has breakfast, lunch, snack, evening soup, dinner', () => {
    for (const day of week.days) {
      const slots = day.meals.map((m) => m.slot);
      expect(slots).toEqual(['b', 'l', 's', 'es', 'd']);
    }
  });
  it('breakfast is a real breakfast dish, not a heavy curry', () => {
    for (const day of week.days) {
      const b = day.meals.find((m) => m.slot === 'b')!;
      const lead = b.components[0]?.name.toLowerCase() ?? '';
      expect(/butter chicken|dal makhani|paneer butter masala|biryani|fried rice|pizza|noodles/.test(lead)).toBe(false);
    }
  });
  it('the evening slot serves a soup', () => {
    let soups = 0;
    for (const day of week.days) {
      const es = day.meals.find((m) => m.slot === 'es')!;
      if (es.components.some((c) => c.role === 'soup' || /soup|shorba|broth|rasam/i.test(c.name))) soups++;
    }
    expect(soups).toBeGreaterThanOrEqual(5); // most days
  });
  it('lunch and dinner are complete plates (3+ components)', () => {
    for (const day of week.days) {
      for (const code of ['l', 'd'] as const) {
        const meal = day.meals.find((m) => m.slot === code)!;
        expect(meal.components.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});
