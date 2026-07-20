import { saneMacros } from './nutrition.service';

describe('saneMacros — keep macros consistent with the calorie figure', () => {
  it('clamps an impossible fibre value (biryani "34 g fibre" on 548 kcal)', () => {
    const m = saneMacros(548, 20, 100, 15, 34);
    expect(m.fiber).toBeLessThanOrEqual(Math.round((548 / 1000) * 16) + 3); // ≈12
    expect(m.fiber).toBeLessThan(34);
  });

  it('never lets fibre exceed the carbohydrate it is part of', () => {
    const m = saneMacros(300, 10, 8, 5, 40);
    expect(m.fiber).toBeLessThanOrEqual(Math.max(m.carbs, 1));
  });

  it('leaves a legitimately high-protein dish alone (grilled chicken)', () => {
    const m = saneMacros(300, 45, 6, 12, 2); // 45g protein ≈ 60% energy — allowed
    expect(m.protein).toBe(45);
    expect(m.fiber).toBe(2);
  });

  it('leaves a legitimately high-fat dish alone (fried eggs)', () => {
    const m = saneMacros(300, 18, 3, 24, 0); // fat ≈ 72% — trimmed only to the 60% ceiling
    expect(m.fat).toBeGreaterThanOrEqual(20);
  });

  it('trims physically impossible protein (100 g on 200 kcal)', () => {
    const m = saneMacros(200, 100, 5, 3, 2);
    expect(m.protein).toBeLessThanOrEqual(Math.round((200 * 0.6) / 4)); // 30
  });

  it('a realistic thali plate keeps its fibre in a believable range', () => {
    // main + dal + roti + veg + salad — summed elsewhere; here just the main.
    const daily = [saneMacros(500, 25, 60, 12, 30), saneMacros(450, 20, 55, 10, 28)];
    for (const m of daily) expect(m.fiber).toBeLessThanOrEqual(11);
  });

  it('is a no-op for already-sane values', () => {
    const m = saneMacros(500, 30, 55, 15, 8);
    expect(m).toEqual({ protein: 30, carbs: 55, fat: 15, fiber: 8 });
  });
});
