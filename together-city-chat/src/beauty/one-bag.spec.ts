import { parseBag, normaliseBag } from './beauty-bag';
import { priceBeautyOrder } from './beauty-engine';
import { BEAUTY_PRODUCTS } from './beauty-catalog';

/**
 * ONE BAG, AND IT DOES NOT FORGET.
 *
 * The hub had two: the routine kept one in a React state and the market kept
 * another, so a citizen could be looking at "3 items · ₹2,098" on one page and
 * "10 items · ₹6,009" on the other, each with its own checkout button. Both
 * were erased by clicking a link. A bag that forgets is worse than no bag,
 * because it invites the work of filling it twice.
 *
 * These are about the shape of what gets stored, which is the part a hand-
 * edited JSON column can break.
 */
describe('the bag', () => {
  const [A, B] = BEAUTY_PRODUCTS;

  it('keeps ids and quantities and nothing else', () => {
    // NO PRICES ARE STORED. A bag holding its own prices can disagree with the
    // shelf — add at ₹369, the price moves, and checkout charges whichever
    // number the browser kept.
    const bag = parseBag([{ id: A.id, qty: 2, priceInr: 999, name: 'stale' }]);
    expect(bag).toEqual([{ id: A.id, qty: 2 }]);
  });

  it('folds a duplicated product into one line', () => {
    expect(parseBag([{ id: A.id, qty: 1 }, { id: A.id, qty: 2 }])).toEqual([{ id: A.id, qty: 3 }]);
  });

  it('drops a line at zero rather than keeping an empty row', () => {
    expect(parseBag([{ id: A.id, qty: 0 }, { id: B.id, qty: 1 }])).toEqual([{ id: B.id, qty: 1 }]);
  });

  it('survives anything at all in the column', () => {
    // `extras` is a shared JSON blob. This is the file that reads it, so this is
    // where "a stored blob is not a type" has to be true.
    for (const junk of [null, undefined, 'a string', 42, {}, [1, 2], [{ id: 5, qty: 'x' }], [{}]]) {
      expect(parseBag(junk)).toEqual([]);
    }
  });

  it('caps a quantity and a length, because a typo should not be able to charge for twelve', () => {
    expect(parseBag([{ id: A.id, qty: 9999 }])).toEqual([{ id: A.id, qty: 12 }]);
    expect(parseBag(BEAUTY_PRODUCTS.map((p) => ({ id: p.id, qty: 1 }))).length).toBeLessThanOrEqual(60);
  });

  it('normalises what a client sends by exactly the same rule', () => {
    // Two code paths for "what is a bag" is one too many.
    const messy = [{ id: A.id, qty: 3 }, { id: A.id, qty: 2 }, { id: 'nope', qty: 0 }];
    expect(normaliseBag(messy)).toEqual(parseBag(messy));
  });

  it('is priced from the shelf every time it is read', () => {
    const bag = parseBag([{ id: A.id, qty: 2 }]);
    const priced = priceBeautyOrder(bag);
    expect(priced.ok).toBe(true);
    if (priced.ok) expect(priced.totalInr).toBe(A.priceInr * 2);
  });

  it('reports a product that left the shelf rather than hiding the gap', () => {
    // Silently shortening the list leaves somebody hunting for a bottle they
    // are certain they added.
    const priced = priceBeautyOrder([{ id: A.id, qty: 1 }, { id: 'withdrawn-product', qty: 1 }]);
    expect(priced.ok).toBe(false);
    if (!priced.ok) expect(priced.unknownIds).toEqual(['withdrawn-product']);
  });
});
