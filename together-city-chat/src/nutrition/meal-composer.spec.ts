import { composeWeek, type ComposerPrefs, type DayTargets } from './meal-composer';

const TARGETS: DayTargets = { kcal: 2000, protein: 90, carbs: 240, fat: 60, fiber: 30 };
const base: ComposerPrefs = { diet: 'vegetarian' };

describe('meal composer — structure rules', () => {
  it('every day has all five mandatory slots (Rule 1)', () => {
    const wk = composeWeek(TARGETS, base);
    for (const d of wk.days) {
      expect(d.meals.map((m) => m.slot)).toEqual(['b', 'l', 's', 'es', 'd']);
      expect(d.meals.every((m) => m.components.length >= 1)).toBe(true);
    }
  });

  it('energy split roughly 25/10/30/10/25 with each meal 8–35% (Rule 3)', () => {
    const wk = composeWeek(TARGETS, base);
    const day = wk.days[0];
    const pct = Object.fromEntries(day.meals.map((m) => [m.slot, m.energyPct]));
    expect(pct.b).toBeCloseTo(0.25, 2);
    expect(pct.l).toBeCloseTo(0.30, 2);
    expect(day.meals.every((m) => m.energyPct >= 0.08 && m.energyPct <= 0.35)).toBe(true);
  });

  it('breakfast never contains lunch/dinner recipes (Rule 4)', () => {
    const wk = composeWeek(TARGETS, base);
    for (const d of wk.days) {
      const b = d.meals.find((m) => m.slot === 'b')!;
      expect(b.components.some((c) => c.category === 'lunch' || c.category === 'dinner')).toBe(false);
    }
  });

  it('lunch is a composite meal with a title that is not a bare recipe name (Rules 8/16)', () => {
    const wk = composeWeek(TARGETS, base);
    const lunch = wk.days[0].meals.find((m) => m.slot === 'l')!;
    expect(lunch.components.length).toBeGreaterThanOrEqual(3);
    expect(lunch.components.some((c) => c.name === lunch.title)).toBe(false);
  });

  it('scheduled times are present on every meal (IF Rule 7)', () => {
    const wk = composeWeek(TARGETS, base);
    expect(wk.days[0].meals.every((m) => /^\d{2}:\d{2}$/.test(m.scheduledTime))).toBe(true);
  });
});

describe('meal composer — grocery integrity (Rule 10)', () => {
  it('every grocery item traces to a recipe in the plan, pantry excluded by default', () => {
    const wk = composeWeek(TARGETS, base);
    const ids = new Set(wk.days.flatMap((d) => d.meals.flatMap((m) => m.components.map((c) => c.recipeId))));
    for (const g of wk.grocery) {
      expect(g.fromRecipes.some((id) => ids.has(id))).toBe(true);
      expect(g.pantry).toBe(false);
    }
    expect(wk.validation.ok).toBe(true);
  });

  it('pantry staples appear only when included', () => {
    const withPantry = composeWeek(TARGETS, { ...base, includePantry: true });
    const hasPantry = withPantry.grocery.some((g) => g.pantry);
    expect(hasPantry).toBe(true);
  });
});

describe('meal composer — variety (Rule 14)', () => {
  it('no breakfast recipe repeats more than twice a week', () => {
    const wk = composeWeek(TARGETS, base);
    const counts = new Map<string, number>();
    for (const d of wk.days) {
      const id = d.meals.find((m) => m.slot === 'b')!.components[0].recipeId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect([...counts.values()].every((c) => c <= 2)).toBe(true);
  });

  it('lunch and dinner mains do not repeat on consecutive days', () => {
    const wk = composeWeek(TARGETS, base);
    for (let i = 1; i < wk.days.length; i++) {
      for (const code of ['l', 'd'] as const) {
        const prev = wk.days[i - 1].meals.find((m) => m.slot === code)!.components.find((c) => c.role === 'main')?.recipeId;
        const cur = wk.days[i].meals.find((m) => m.slot === code)!.components.find((c) => c.role === 'main')?.recipeId;
        if (prev && cur) expect(cur).not.toBe(prev);
      }
    }
  });
});

describe('meal composer — intermittent fasting (IF Rules 1–5)', () => {
  it('16:8 keeps only the in-window meals and preserves the daily prescription', () => {
    const wk = composeWeek(TARGETS, { ...base, fasting: { enabled: true, protocol: '16:8' } });
    const day = wk.days[0];
    expect(day.fasting).toBe(true);
    expect(day.meals.map((m) => m.slot)).toEqual(['l', 'es', 'd']);
    // energy redistributed to sum ~1.0 across the window
    const sum = day.meals.reduce((t, m) => t + m.energyPct, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('OMAD produces a single meal', () => {
    const wk = composeWeek(TARGETS, { ...base, fasting: { enabled: true, protocol: 'omad' } });
    expect(wk.days[0].meals.length).toBe(1);
  });
});
