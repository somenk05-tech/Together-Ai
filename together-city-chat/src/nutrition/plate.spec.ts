import { assemblePlate, perMealTargets, type PlateOpts, type DayMealInput } from './plate';

const main = (over: Partial<{ name: string; kcal: number; protein: number; gramsPerServing: number }> = {}) => ({
  name: over.name ?? 'Grilled Chicken',
  kcal: over.kcal ?? 300, protein: over.protein ?? 40, carbs: 6, fat: 12, fiber: 2,
  gramsPerServing: over.gramsPerServing ?? 180, diet: 'nonveg',
});
const opts = (over: Partial<PlateOpts> = {}): PlateOpts => ({
  diet: 'nonveg', goal: 'maintain', diabetes: false, dairy: true, jain: false, ...over,
});
const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

describe('assemblePlate — thali builder', () => {
  it('totals equal the sum of the component values (single source of truth)', () => {
    const p = assemblePlate(main(), 'l', opts(), 1, 780);
    expect(p.totals.kcal).toBe(sum(p.components.map((c) => c.kcal)));
    expect(p.totals.protein).toBe(sum(p.components.map((c) => c.protein)));
    expect(p.totals.carbs).toBe(sum(p.components.map((c) => c.carbs)));
    expect(p.totals.fat).toBe(sum(p.components.map((c) => c.fat)));
    expect(p.totals.fiber).toBe(sum(p.components.map((c) => c.fiber)));
  });

  it('builds to the meal target without a large overshoot', () => {
    const p = assemblePlate(main(), 'l', opts(), 1, 780);
    expect(p.totals.kcal).toBeLessThanOrEqual(780 + 220); // within one carb unit
  });

  it('dinner is roti-only — never adds rice', () => {
    const p = assemblePlate(main(), 'd', opts(), 2, 720);
    const carbs = p.components.filter((c) => c.role === 'carb').map((c) => c.name.toLowerCase());
    expect(carbs.some((n) => /rice|millet/.test(n))).toBe(false);
    expect(carbs.some((n) => /roti|phulka/.test(n))).toBe(true);
  });

  it('lunch is rice-centric', () => {
    const p = assemblePlate(main(), 'l', opts(), 3, 820);
    const carbs = p.components.filter((c) => c.role === 'carb').map((c) => c.name.toLowerCase());
    expect(carbs.some((n) => /rice/.test(n))).toBe(true);
  });

  it('a rice-based main (biryani) gets raita + salad only — no dal or extra carb', () => {
    const p = assemblePlate(main({ name: 'Chicken Biryani', kcal: 520 }), 'l', opts(), 4, 780);
    expect(p.components.find((c) => c.role === 'secondary')).toBeUndefined();
    expect(p.components.find((c) => c.role === 'carb')).toBeUndefined();
    expect(p.components.map((c) => c.role)).toEqual(expect.arrayContaining(['main', 'dairy', 'salad']));
  });

  it('vegan diet includes no curd', () => {
    const p = assemblePlate(main({ name: 'Tofu Curry' }), 'l', opts({ diet: 'vegan', dairy: false }), 5, 780);
    expect(p.components.some((c) => c.role === 'dairy')).toBe(false);
  });

  it('diabetes favours roti over rice at lunch', () => {
    const p = assemblePlate(main(), 'l', opts({ diabetes: true }), 6, 780);
    const carbs = p.components.filter((c) => c.role === 'carb').map((c) => c.name.toLowerCase());
    expect(carbs.some((n) => /^(?!.*brown).*white rice|jeera|steamed rice/.test(n))).toBe(false);
  });
});

describe('perMealTargets — dynamic rebalancing on skip', () => {
  const day = (over: Partial<Record<'b' | 'l' | 's' | 'd', boolean>> = {}): DayMealInput[] => [
    { slot: 'b', skipped: !!over.b, isPlate: false, fixedKcal: 500 },
    { slot: 'l', skipped: !!over.l, isPlate: true, fixedKcal: 0 },
    { slot: 's', skipped: !!over.s, isPlate: false, fixedKcal: 200 },
    { slot: 'd', skipped: !!over.d, isPlate: true, fixedKcal: 0 },
  ];

  it('splits the remaining budget across lunch + dinner (lunch larger)', () => {
    const t = perMealTargets(day(), 2200);
    expect(t.l).toBeGreaterThan(0);
    expect(t.d).toBeGreaterThan(0);
    expect(t.l! + t.d!).toBe(2200 - 700); // day minus fixed breakfast+snack
    expect(t.l!).toBeGreaterThan(t.d!);   // lunch is the larger meal
  });

  it('skipping lunch grows dinner to absorb the freed budget', () => {
    const base = perMealTargets(day(), 2200);
    const skipLunch = perMealTargets(day({ l: true }), 2200);
    expect(skipLunch.l).toBeUndefined();
    expect(skipLunch.d!).toBeGreaterThan(base.d!);
    expect(skipLunch.d!).toBe(2200 - 700); // dinner now carries the whole plate budget
  });

  it('skipping breakfast increases the plate budgets', () => {
    const base = perMealTargets(day(), 2200);
    const skipBfast = perMealTargets(day({ b: true }), 2200);
    expect(skipBfast.l! + skipBfast.d!).toBe(2200 - 200); // only snack fixed now
    expect(skipBfast.l!).toBeGreaterThan(base.l!);
  });
});
