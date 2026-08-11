import { parseGemCart, priceGemCart, type GemCartLine } from './gem-cart';
import { GEMS } from './gem-catalog';

/**
 * THE CART HOLDS CONFIGURATIONS AND NEVER PRICES.
 *
 * "1 × Blue Sapphire" is not something a jeweller can make. And a cart that
 * carried its own totals would check out at a number the shop no longer offers
 * — which, with gold moving daily, is not a hypothetical.
 */
const line = (over: Partial<GemCartLine> = {}): GemCartLine => ({
  gemId: 'ruby', worn: 'ring', shape: 'oval', setting: 'solitaire',
  size: 16, metal: 'gold22', grade: 35, addedAt: '2026-08-11T00:00:00.000Z', ...over,
});

describe('the gem cart', () => {
  it('survives anything at all in the column', () => {
    for (const junk of [null, undefined, '', 'not json', '{}', 42, [1, 2], [{}], [{ gemId: 9 }]]) {
      expect(parseGemCart(junk)).toEqual([]);
    }
  });

  it('reads a JSON string as readily as an array', () => {
    // The column is TEXT, so what comes back is a string — and a test double
    // will hand it an array. Both are the same cart.
    expect(parseGemCart(JSON.stringify([line()]))).toEqual(parseGemCart([line()]));
  });

  it('refuses a stone that is not in the catalogue', () => {
    expect(parseGemCart([line({ gemId: 'moon-rock' })])).toEqual([]);
  });

  it('repairs a design that does not exist rather than pricing it as something else', () => {
    const [l] = parseGemCart([line({ setting: 'welded', shape: 'blob' })]);
    expect({ setting: l.setting, shape: l.shape }).toEqual({ setting: 'solitaire', shape: 'oval' });
  });

  it('drops the fields that do not belong to the way it is worn', () => {
    const [loose] = parseGemCart([line({ worn: 'loose' })]);
    expect({ setting: loose.setting, size: loose.size, metal: loose.metal })
      .toEqual({ setting: undefined, size: undefined, metal: undefined });
    const [pendant] = parseGemCart([line({ worn: 'pendant', style: 'minimal' })]);
    expect({ setting: pendant.setting, size: pendant.size, style: pendant.style })
      .toEqual({ setting: undefined, size: undefined, style: 'minimal' });
  });

  it('stores no price anywhere in a line', () => {
    const [l] = parseGemCart([{ ...line(), totalInr: 99, stoneInr: 1 } as unknown]);
    expect(Object.keys(l).sort()).toEqual(
      ['addedAt', 'gemId', 'grade', 'metal', 'setting', 'shape', 'size', 'style', 'worn'].sort(),
    );
  });

  it('prices every line from the shelf at read time', () => {
    const c = priceGemCart([line()], 70);
    expect(c.count).toBe(1);
    expect(c.lines[0].stoneInr).toBeGreaterThan(0);
    expect(c.lines[0].metalInr).toBeGreaterThan(0);
    expect(c.totalInr).toBe(c.lines[0].stoneInr + c.lines[0].metalInr);
    expect(c.totalInr).toBe(c.stoneInr + c.metalInr);
  });

  it('charges no metal on a loose stone', () => {
    const c = priceGemCart([line({ worn: 'loose' })], 70);
    expect(c.lines[0].metalInr).toBe(0);
    expect(c.lines[0].totalInr).toBe(c.lines[0].stoneInr);
  });

  it('prices nothing at all without a body weight, and says how many it dropped', () => {
    // The carats come from body weight. No weight, no figure — the same refusal
    // the ascendant gets without a birth time, and the surface has to be able
    // to tell the difference between an empty cart and an unpriceable one.
    const c = priceGemCart([line(), line({ gemId: 'emerald' })], null);
    expect({ count: c.count, dropped: c.dropped, total: c.totalInr }).toEqual({ count: 0, dropped: 2, total: 0 });
  });

  it('writes a specification a jeweller could work from', () => {
    const c = priceGemCart([line()], 70);
    const spec = c.lines[0].spec;
    for (const part of ['RUBY', 'ct', 'Oval', 'Solitaire', '22 carat gold', 'size 16']) {
      expect({ part, inSpec: spec.includes(part) }).toEqual({ part, inSpec: true });
    }
  });

  it('never holds more than a dozen lines', () => {
    const many = GEMS.slice(0, 30).map((g) => line({ gemId: g.id }));
    expect(parseGemCart(many).length).toBeLessThanOrEqual(12);
  });
});
