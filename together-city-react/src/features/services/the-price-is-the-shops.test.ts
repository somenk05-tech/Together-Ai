import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── THE CATALOGUE SAYS WHAT A PACK IS; THE SHOP SAYS WHAT IT COSTS ──────────
 *
 * Owner, 8 Sep: "create an online grocery store using the internet, show all
 * the products that's available in an area."
 *
 * The picker is the one screen in the city where a price could be put into a
 * shopkeeper's mouth: it knows the brand, the pack and the barcode, and a
 * helpful default would be one keystroke away. That default is what
 * `grocery-orders-removed.spec.ts` exists to remember, so it is held here from
 * the browser side as well as on the server.
 *
 * READ WITH THE COMMENTS STRIPPED. These files' prose says "price" in nearly
 * every paragraph, on purpose. A guard that reads its own explanation goes
 * green when somebody rewords a sentence and red when nobody changed anything.
 */
const root = join(__dirname, '..', '..', '..');
const src = (p: string) => readFileSync(join(root, 'src', p), 'utf8');
const code = (p: string) =>
  src(p).replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.split('//')[0]).join('\n');

describe('the catalogue picker', () => {
  const picker = code('features/services/CataloguePicker.tsx');

  it('puts a null price on every line it hands to the grid', () => {
    // Every assignment there is, and each one of them is null.
    const assigned = [...picker.matchAll(/priceInr:\s*([^,\n}]+)/g)].map((m) => m[1].trim());
    expect(assigned.length).toBeGreaterThan(0);
    expect([...new Set(assigned)]).toEqual(['null']);
  });

  it('carries the product id back, which is what lets shops be compared', () => {
    expect(picker).toMatch(/productId:\s*p\.id/);
  });

  it('reads no price, mrp or rupee field off a catalogue row', () => {
    expect(picker).not.toMatch(/\.(price|mrp|priceInr|listPrice)\b/i);
  });

  it('prints the source of every row rather than hiding where it came from', () => {
    expect(picker).toMatch(/p\.source/);
    expect(picker).toMatch(/source\.url/);
  });
});

describe('the catalogue type the browser holds', () => {
  it('has no price field at all — the shape makes the mistake unavailable', () => {
    const api = src('features/services/api.ts');
    const iface = api.slice(api.indexOf('export interface CatalogueProduct {'));
    const body = iface.slice(0, iface.indexOf('\n}'))
      .split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n');
    expect(body).not.toMatch(/price|inr|mrp/i);
  });
});

describe('the grouped product tile left the room, and the catalogue did not', () => {
  const shelf = code('features/ecommerce/store/useGroceryShop.ts');

  /**
   * ── THE PRODUCT WALL WENT (owner, 9 Sep) ──────────────────────────────────
   *
   * "Just show the shop name first and when clicked we see the entire menu and
   * catalogue."
   *
   * The room drew every row of every grocer as one wall, with the same pack
   * across shops grouped into a product tile carrying the cheapest in-stock
   * price. Nothing on that wall could be bought together — an order is one
   * shop, one basket, one delivery, which is why every tile's button was that
   * shop's own door. The button became the whole tile.
   *
   * WHAT THIS FILE STILL GUARDS is the half that did not move: the CATALOGUE.
   * The product master, its sources and its price-free type are untouched, and
   * the server still groups and prices honestly for whoever reads it next.
   * What is asserted here is that the client stopped computing anything at
   * all — the failure mode the deleted tile was written against (an average, a
   * sum, a "market price" the city made up) cannot come back through a shelf
   * that no longer holds a price.
   */
  it('computes no price of its own — there is no arithmetic left to get wrong', () => {
    expect(shelf).not.toMatch(/reduce\(|\/\s*(offers|p\.offers)\.length|Math\.round\(.*price/i);
    expect(shelf).not.toMatch(/fromInr/);
    expect(shelf).not.toMatch(/function productTileOf/);
  });

  it('prints no price on a tile that is a shop rather than a thing', () => {
    // The slot carries the shop's item count through `priceLabel`, which is
    // the same door the unpriced vegetable used — never ₹0.
    expect(shelf).toMatch(/priceInr: 0,/);
    expect(shelf).toMatch(/priceLabel: `\$\{shop\.itemCount\} item/);
  });

  it('sends the citizen to one shop, which is the only thing an order can be', () => {
    expect(shelf).toMatch(/path: `\/services\/\$\{shop\.slug \?\? shop\.id\}`/);
    expect(shelf).toMatch(/bag: null/);
  });
});
