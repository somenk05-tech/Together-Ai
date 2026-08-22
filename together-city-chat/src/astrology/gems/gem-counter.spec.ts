import { COUNTER_AISLES, gemCounter } from './gem-counter';
import { GEMS } from './gem-catalog';
import { chosenWeight, customaryWeight, priceAtWeight, recommendedWeight } from './gem-weight';
import { parseGemCart, priceGemCart } from './gem-cart';

/**
 * THE COUNTER IS A CATALOGUE, NOT A PRESCRIPTION.
 *
 * The risk this file guards is one specific thing: that letting the citizen
 * pick the carats quietly becomes letting them pick anything. The weight model
 * is explicit that a stone's customary range "is the constraint, and it is
 * never overridden" — a hundred-kilo citizen is NOT prescribed a nine-carat
 * blue sapphire, and the reason that rule exists is that the naive version of
 * it shipped once and was wrong. A slider is the naive version again unless it
 * is bounded, so these assert the bound from both ends.
 */
describe('the gem counter', () => {
  it('puts every stone in the database on the shelf', () => {
    const { stones } = gemCounter();
    expect(stones).toHaveLength(GEMS.length);
    expect(stones).toHaveLength(30);
    // The catalogue's own order, not one this file invented.
    expect(stones.map((s) => s.gem.id)).toEqual(GEMS.map((g) => g.id));
  });

  it('splits the shelf by what a stone is for, and counts it from the rows', () => {
    const { aisles } = gemCounter();
    expect(aisles.map((a) => a.key)).toEqual(COUNTER_AISLES.map((a) => a.key));
    expect(aisles.reduce((n, a) => n + a.count, 0)).toBe(30);
    expect(aisles.find((a) => a.key === 'primary')?.count).toBe(9);
  });

  it('opens every tile at a weight inside the range it may be worn at', () => {
    for (const s of gemCounter().stones) {
      expect(s.fromCt).toBeLessThanOrEqual(s.defaultCt);
      expect(s.defaultCt).toBeLessThanOrEqual(s.toCt);
      // A price before anything is touched, and it is the price of that weight.
      expect(s.fromInr).toBe(Math.round(s.defaultCt * s.gem.perCaratMinInr));
      expect(s.toInr).toBe(Math.round(s.defaultCt * s.gem.perCaratMaxInr));
      expect(s.fromInr).toBeLessThan(s.toInr);
    }
  });

  it('quotes quarter carats, because that is what a jeweller cuts', () => {
    for (const s of gemCounter().stones) {
      expect(Math.round(s.defaultCt * 4)).toBe(s.defaultCt * 4);
    }
  });

  /**
   * THE STONE STILL HAS A SAY. Blue sapphire is worn three to five ratti and
   * heavy Neelam is the classic warning; asking for nine carats of it returns
   * the top of its range and says it was held there.
   */
  it('holds a chosen weight inside the stone’s own range, from both ends', () => {
    const span = customaryWeight('saturn')!;
    const heavy = chosenWeight(9, 'saturn')!;
    expect(heavy.carats).toBe(span.toCt);
    expect(heavy.bound).toBe('ceiling');

    const light = chosenWeight(0.25, 'saturn')!;
    expect(light.carats).toBe(span.fromCt);
    expect(light.bound).toBe('floor');

    const inside = chosenWeight(span.fromCt + 0.25, 'saturn')!;
    expect(inside.bound).toBe('placed');
    expect(inside.carats).toBe(span.fromCt + 0.25);
  });

  it('refuses a weight that is not a weight rather than inventing one', () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(chosenWeight(bad as number, 'sun')).toBeNull();
    }
  });

  /**
   * A SUBSTITUTE IS WORN HEAVIER, and the counter has to carry that or it would
   * be offering upratna at primary weights — which is the one thing the
   * tradition compensates for with mass.
   */
  it('carries the substitute factor onto the counter', () => {
    const primary = customaryWeight('saturn', 'primary')!;
    const upratna = customaryWeight('saturn', 'substitute')!;
    expect(upratna.fromCt).toBeGreaterThan(primary.fromCt);
    expect(upratna.toCt).toBeGreaterThan(primary.toCt);
  });

  it('agrees with the studio about what a weight costs', () => {
    const s = gemCounter().stones[0];
    expect(priceAtWeight(s.defaultCt, s.gem.perCaratMinInr, s.gem.perCaratMaxInr))
      .toEqual({ fromInr: s.fromInr, toInr: s.toInr });
  });
});

/**
 * ── AND THE CART PRICES BOTH KINDS OF LINE ─────────────────────────────────
 *
 * The dangerous outcome of this change is not a wrong number on the counter —
 * it is a line locked at a chosen weight and then CHARGED at the prescribed
 * one, or the reverse. Every commission already in somebody's cart carries no
 * carats, and has to go on pricing exactly as it did.
 */
describe('a cart line that carries its own weight', () => {
  const ruby = GEMS.find((g) => g.id === 'ruby')!;
  const line = (extra: Record<string, unknown>) => parseGemCart([{
    gemId: 'ruby', worn: 'loose', shape: 'oval', grade: 0, addedAt: '2026-08-22T00:00:00.000Z', ...extra,
  } as unknown]);

  it('prices from the chosen weight, with no body weight on file at all', () => {
    const priced = priceGemCart(line({ carats: 4 }), null);
    expect(priced.dropped).toBe(0);
    expect(priced.lines[0].carats).toBe(4);
    expect(priced.lines[0].stoneInr).toBe(Math.round(4 * ruby.perCaratMinInr));
  });

  it('still prices a studio line from the body weight, and still refuses without one', () => {
    const prescribed = recommendedWeight(70, 'sun')!;
    const priced = priceGemCart(line({}), 70);
    expect(priced.lines[0].carats).toBe(prescribed.carats);
    expect(priceGemCart(line({}), null).dropped).toBe(1);
  });

  it('holds a chosen weight inside the stone’s range on the way to the till', () => {
    const span = customaryWeight('sun')!;
    expect(priceGemCart(line({ carats: 40 }), null).lines[0].carats).toBe(span.toCt);
  });

  it('drops a weight that is not a number rather than falling back to a guess', () => {
    // Not a weight → the line keeps no carats → with no body weight it cannot
    // be priced, which is the honest outcome rather than a silent default.
    expect(priceGemCart(line({ carats: 'four' }), null).dropped).toBe(1);
  });

  it('writes the chosen weight into the spec the jeweller reads', () => {
    expect(priceGemCart(line({ carats: 4 }), null).lines[0].spec).toContain('4 ct');
  });
});
