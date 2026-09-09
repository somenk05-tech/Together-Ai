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

describe('the shelf that is a street of shops', () => {
  const shelf = code('features/ecommerce/store/useGroceryShop.ts');
  const tile = code('features/ecommerce/store/shopTile.ts');

  /**
   * THE GROUPED PRODUCT TILE IS GONE, FOR THE SECOND TIME AND FOR GOOD.
   *
   * It left the room on 8 Sep when the shelf first became a street, came back
   * on the morning of 9 Sep with the combined menu the owner asked for, and
   * left again the same evening: "the grocery store here when clicked should
   * show individual store names", extended to both trades and both doors.
   *
   * The rule that outlived all three turns is the one this file is named for:
   * A PRICE ON THIS SCREEN IS A SHOPKEEPER'S, never one this app worked out.
   * The tile that could have broken it no longer exists, so the assertion
   * moves to the thing that replaced it — a shop tile, which carries NO price
   * at all. That is the strongest form of the same rule, not a weaker one.
   */
  it('puts no price on a shop tile, because a shop does not have one', () => {
    expect(tile).toMatch(/priceInr: 0,/);
    /* The price slot carries the one number that decides whether a door is
       worth opening: how much is behind it. */
    expect(tile).toMatch(/priceLabel: `\$\{shop\.itemCount\} item/);
  });

  it('computes nothing of its own — no average, no sum, no markup', () => {
    /* Held over both files, because the arithmetic ban is about any shape that
       puts a number on a screen, not about one tile that happens to exist. */
    for (const src of [shelf, tile]) {
      expect(src).not.toMatch(/reduce\(|\/\s*(offers|p\.offers)\.length|Math\.round\(.*price/i);
    }
  });

  it('draws every shop once, off the shops the server sent', () => {
    /* Not off the rows. Building shop tiles by scanning items and collecting
       distinct shopIds would silently drop a shop that has published nothing
       yet — which is exactly the shop most in need of being found. */
    expect(shelf).toMatch(/\(shelf\.data\?\.shops \?\? \[\]\)\s*\n?\s*\.map\(\(sh\) => shopTileOf\(/);
  });

  it('no longer carries either row-level builder', () => {
    /* A second, unreachable way to draw a grocery row is the copy that
       disagrees the first time either is corrected. Git remembers them. */
    expect(shelf).not.toMatch(/function productTileOf\(/);
    expect(shelf).not.toMatch(/function tileOf\(/);
  });
});

describe('the search that spans every trade', () => {
  const search = code('features/ecommerce/store/useMarketSearchShop.ts');

  /**
   * Owner, 9 Sep: "add a search tab for all categories and all stores."
   *
   * The same rule as the tile above, on a screen that has no aisle to inherit
   * it from: every number here is a shopkeeper's, and a result with no price
   * says so rather than becoming ₹0.
   */
  it('quotes the shop’s own price, or says ask', () => {
    expect(search).toMatch(/priceLabel: priced \? undefined : 'Ask the shop'/);
    expect(search).not.toMatch(/reduce\(|Math\.round\(.*price/i);
  });

  it('names the shop and its trade on every result', () => {
    // Owner: "each item should mention which store the product comes from."
    expect(search).toMatch(/brand: row\.shopName/);
    expect(search).toMatch(/category: row\.shopCategory/);
  });

  it('sends the citizen to one shop, which is the only thing an order can be', () => {
    expect(search).toMatch(/path: `\/services\/\$\{where\}`/);
    expect(search).toMatch(/bag: null/);
  });
});
