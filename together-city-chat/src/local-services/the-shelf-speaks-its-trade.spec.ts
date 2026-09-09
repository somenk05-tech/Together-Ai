import { catalogueFor, CATALOGUES } from './business-types';
import { AISLES as ELECTRONICS_AISLES } from './electronics';
import { AISLES as GROCERY_AISLES } from './grocery';

/**
 * ── AN ELECTRONICS SHOP IS NOT SHOWN A GROCERY CATALOGUE ────────────────────
 *
 * Owner, 9 Sep: "An electronics store should show only electronic options."
 * And, a minute later: "Electronic store needs electronic vocabulary."
 *
 * WHAT HAPPENED. `stock` was ONE catalogue shared by every trade that sells
 * over a counter, and it leads with the `catalogue` way — the tick-list over
 * the city's grocery products — under a blurb naming the Grocery Store. A shop
 * registered as `electronics_stores` opened its Stock list and was offered
 * Fruit & Vegetables, Dairy & Eggs, Bakery, Personal Care; it was told "nothing
 * in the catalogue matches that"; and it then successfully PUBLISHED
 * seventy-two grocery products against its own name.
 *
 * That is not a mislabelled control. The wrong shelf was reachable, and the
 * shop reached it.
 *
 * WHY THERE IS NO ELECTRONICS TICK-LIST, and it is worth saying rather than
 * fixing quietly: the city's catalogue is GROCERIES. A national electronics
 * price list was researched and refused on 8 Sep, and that decision stands.
 * Offering a tick-list of things a shop cannot possibly stock is worse than
 * offering none, so the way is removed rather than filled with a guess.
 */
describe('the stock list speaks the trade it belongs to', () => {
  it('gives a grocer the catalogue to tick, and names the shelf it lands on', () => {
    const c = catalogueFor(null, 'grocery_stores', 'Food & Daily Needs');
    expect(c.kind).toBe('stock');
    expect(c.ways).toContain('catalogue');
    expect(c.blurb).toMatch(/Grocery Store shelf/);
  });

  it('gives an electronics shop no catalogue to tick', () => {
    for (const key of ['electronics_stores', 'mobile_shops']) {
      const c = catalogueFor(null, key, 'Electronics');
      expect({ key, kind: c.kind }).toEqual({ key, kind: 'stock' });
      /* THE ONE LINE THIS FILE EXISTS FOR. */
      expect({ key, ways: c.ways.includes('catalogue') }).toEqual({ key, ways: false });
      expect({ key, shelf: /Electronics Store shelf/.test(c.blurb) }).toEqual({ key, shelf: true });
      expect({ key, grocer: /Grocery Store/.test(c.blurb) }).toEqual({ key, grocer: false });
    }
  });

  it('still lets an electronics shop publish, by typing or by sheet', () => {
    /* Removing the tick-list must not remove the shelf. Their stock is their
       own, and both remaining doors carry it. */
    const c = catalogueFor(null, 'electronics_stores', 'Electronics');
    expect(c.ways).toContain('typed');
    expect(c.ways).toContain('sheet');
    expect(c.orderable).toBe(true);
  });

  it('follows the TRADE even when the shop chose the Shop business type', () => {
    /* The type is a shape — "Shop" — and the trade is what they sell. A shop
       that picked `retail` and registered as a mobile shop must still get the
       electronics vocabulary, or the bug returns through the other door. */
    const c = catalogueFor('retail', 'mobile_shops', 'Electronics');
    expect(c.ways).not.toContain('catalogue');
    expect(c.blurb).toMatch(/Electronics Store shelf/);
  });

  it('leaves every other trade exactly as it was', () => {
    expect(catalogueFor(null, 'restaurants', 'Food & Daily Needs').kind).toBe('menu');
    expect(catalogueFor(null, 'plumbers', 'Home Services').kind).toBe('rateCard');
    expect(catalogueFor(null, 'clothing_stores', 'Shopping').ways).toContain('catalogue');
  });
});

describe('and each shelf offers its own words for a section', () => {
  it('offers the aisles the shelf actually files under', () => {
    /* Read from the one place that owns them rather than typed again — a
       second list is the copy that drifts the first time an aisle is renamed. */
    expect(CATALOGUES.stock.sections).toEqual(GROCERY_AISLES.map((a) => a.label));
    expect(CATALOGUES.stockDevices.sections).toEqual(ELECTRONICS_AISLES.map((a) => a.label));
  });

  it('offers electronics words to an electronics shop and no grocery ones', () => {
    const secs = catalogueFor(null, 'mobile_shops', 'Electronics').sections ?? [];
    expect(secs).toContain('Mobiles & Tablets');
    expect(secs).toContain('Cables, Chargers & Accessories');
    expect(secs).not.toContain('Fruit & Vegetables');
    expect(secs).not.toContain('Dairy & Eggs');
  });

  it('offers them rather than enforcing them', () => {
    /* The aisle rules read the shopkeeper's OWN heading first and only fall
       back to their trade, so a word we have never heard of has to stay
       typeable. The web renders these as a datalist, never a select. */
    expect(CATALOGUES.stockDevices.sections?.length).toBeGreaterThan(5);
  });
});
