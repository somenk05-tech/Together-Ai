import { BEAUTY_PRODUCTS, priceBeautyOrder } from './beauty-engine';

/**
 * The order endpoint took `priceInr` from the request body and charged the city
 * wallet the sum of what was posted. These are the tests that would have caught
 * that, written from the attack rather than from the code.
 */

/**
 * TAKEN FROM THE SHELF RATHER THAN NAMED. These were `bp_retinal` and `bp_spf`,
 * two of the thirteen invented products, and they left with them when the shelf
 * became seventy real ones — five tests failed for a reason none of them is
 * about. Pricing does not care which product it is; it cares that the price
 * comes from HERE and not from the request body.
 */
const [A, B] = BEAUTY_PRODUCTS;

describe('priceBeautyOrder', () => {
  it('charges the shelf price, whatever the caller claimed it was', () => {
    // The caller may send name and priceInr; the type here says only what is
    // read. Anything else on the object is, by construction, unreachable.
    const r = priceBeautyOrder([{ id: A.id, qty: 1 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalInr).toBe(A.priceInr);
    expect(r.totalInr).toBeGreaterThan(1);
  });

  it('adds up several products at their own prices', () => {
    const r = priceBeautyOrder([{ id: A.id, qty: 2 }, { id: B.id, qty: 3 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalInr).toBe(A.priceInr * 2 + B.priceInr * 3);
  });

  it('refuses an id that is not on the shelf instead of quietly dropping it', () => {
    // Dropping it would charge for four things when the citizen asked for five,
    // and the order they got back would look right.
    const r = priceBeautyOrder([{ id: B.id, qty: 1 }, { id: 'bp_free_stuff', qty: 9 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknownIds).toEqual(['bp_free_stuff']);
  });

  it('names every unknown id once, not once per line', () => {
    const r = priceBeautyOrder([{ id: 'nope', qty: 1 }, { id: 'nope', qty: 1 }, { id: 'also-nope', qty: 1 }]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unknownIds).toEqual(['nope', 'also-nope']);
  });

  it('folds a repeated id into one line, so the quantity cap cannot be walked around', () => {
    const r = priceBeautyOrder([{ id: B.id, qty: 20 }, { id: B.id, qty: 20 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].qty).toBe(40);
    expect(r.totalInr).toBe(B.priceInr * 40);
  });

  it('returns the catalogue name, so the saved order cannot be relabelled', () => {
    const r = priceBeautyOrder([{ id: B.id, qty: 1 }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lines[0].name).toBe(B.name);
  });

  it('an empty basket costs nothing rather than throwing', () => {
    // The DTO already refuses an empty items array; this only fixes the pure
    // function's behaviour so the two cannot disagree later.
    const r = priceBeautyOrder([]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.totalInr).toBe(0);
    expect(r.lines).toEqual([]);
  });
});

describe('the catalogue itself', () => {
  it('has no free products, so a zero total always means an empty basket', () => {
    for (const p of BEAUTY_PRODUCTS) expect(p.priceInr).toBeGreaterThan(0);
  });

  it('has unique ids, without which pricing by id would be ambiguous', () => {
    expect(new Set(BEAUTY_PRODUCTS.map((p) => p.id)).size).toBe(BEAUTY_PRODUCTS.length);
  });
});
