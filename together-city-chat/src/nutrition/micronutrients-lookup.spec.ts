import { computeMicros } from './ingredient-nutrients';

const of = (name: string, grams = 100) => computeMicros([{ name, grams }]);

/**
 * The micronutrient table is small — a few dozen rows against 11,000 recipes —
 * so it leans on matching an ingredient name to the nearest row it knows. That
 * matching was `includes` over the keys in object order, which is the same
 * mistake the allergen matcher had, in a place where being wrong is quieter:
 * nobody notices an overstated vitamin D until somebody's deficiency is missed
 * because the plan already claimed to cover it.
 *
 * These are the cases it got wrong, kept as tests so the shortcut cannot come
 * back the next time somebody adds a row.
 */
describe('micronutrient lookup', () => {
  it('does not read a condiment as the food it was made from', () => {
    // 100 g of fish sauce was returning 11 µg of vitamin D — most of a day,
    // from a splash.
    expect(of('fish sauce').vitDUg).toBe(0);
    expect(of('mushroom soy sauce').vitDUg).toBe(0);
    expect(of('chicken stock').ironMg).toBe(0);
    expect(of('vanilla extract').calciumMg).toBe(0);
  });

  it('does not read a word inside another word', () => {
    expect(of('eggplant').vitDUg).toBe(0);        // was reading as egg
    expect(of('cheesecloth').calciumMg).toBe(0);  // was 720 mg of calcium, from cloth
    // "beefsteak tomato" was resolving to beef; it is a tomato.
    expect(of('beefsteak tomato').vitCMg).toBe(of('tomato').vitCMg);
  });

  it('gives a plant milk its own values rather than a cow’s', () => {
    const cow = of('milk');
    for (const plant of ['coconut milk', 'almond milk', 'soy milk', 'oat milk']) {
      const m = of(plant);
      expect(m.calciumMg).toBeLessThan(cow.calciumMg);
      expect(m.vitDUg).toBe(0);   // unfortified: fortification varies by brand
    }
  });

  it('prefers the more specific row when two could match', () => {
    // "coconut milk" must not resolve through "milk" just because that key is
    // shorter or happens to sit earlier in the table.
    expect(of('coconut milk').calciumMg).toBe(16);
    expect(of('milk').calciumMg).toBe(125);
  });

  it('still finds what it should', () => {
    expect(of('spinach').ironMg).toBeGreaterThan(2);
    expect(of('paneer').calciumMg).toBeGreaterThan(400);
    expect(of('amla').vitCMg).toBeGreaterThan(500);
    expect(of('salmon').vitDUg).toBeGreaterThan(10);
    expect(of('curd (yogurt)').calciumMg).toBeGreaterThan(100);
  });

  it('scales with the amount, and returns nothing for nothing', () => {
    expect(of('spinach', 200).ironMg).toBeCloseTo(of('spinach', 100).ironMg * 2, 1);
    expect(computeMicros([])).toEqual({ ironMg: 0, calciumMg: 0, vitDUg: 0, vitCMg: 0 });
    expect(of('something nobody has heard of').ironMg).toBe(0);
  });
});
