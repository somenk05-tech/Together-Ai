import type { GroceryItem, GroceryProductTile, GroceryShop } from '@/features/services/api';
import type { ShopItem } from './types';
import { shopLine } from './shopTile';

/**
 * ── THE GOODS TILES ─────────────────────────────────────────────────────────
 *
 * Owner, 10 Sep: "The Digital Store Open Market should show all the products
 * from all digital stores with the store mentioned below each product, just
 * like the Pet shop."
 *
 * THE FOURTH TURN ON THIS SHELF, and the one that finally has a rule rather
 * than a preference. Street (8 Sep) → wall (9 Sep morning) → street again
 * (9 Sep evening) → and now BOTH, because the two doors are different
 * questions:
 *
 *   · THE LOCAL MARKET ROOM asks "who is near me" — it sits on a rail beside
 *     Find a service, All listed services and My business. It is a directory,
 *     and a directory's answer is a shop. That is what shopTile.ts draws.
 *   · THE OPEN MARKET TAB asks "what can I buy" — it sits beside Pets, Skin &
 *     hair and Supplements, every one of which is a wall of products. A street
 *     of shops in that row is the one tab that answers a different question
 *     from its neighbours, which is what made it feel wrong in both
 *     directions.
 *
 * So the shelf keeps ONE hook and grows a shape. Two hooks would be the copy
 * that disagrees; two shapes off one read cannot.
 *
 * `shopLine` is shared with the shop tile rather than written twice — the four
 * facts the directory holds about a shop are the same four facts whether they
 * are printed on a door or under a price.
 */

export function tileOf(row: GroceryItem, shop: GroceryShop | undefined, now: Date): ShopItem {
  const priced = row.priceInr != null;
  const where = row.shopSlug ?? row.shopId;
  return {
    id: row.id,
    name: row.name,
    /* The shop, not a manufacturer. On this shelf the thing a citizen needs to
       know before pressing anything is whose counter it is on. */
    brand: row.shopName,
    category: row.aisle,
    /* AN UNPRICED ROW SAYS "ASK", NEVER ₹0. `ServiceMenuItem.priceInr` is
       nullable so a shopkeeper can write "seasonal" against a vegetable whose
       price moves with the market, and turning that into a number would be the
       store pricing something nobody priced. */
    priceInr: priced ? (row.priceInr as number) : 0,
    priceLabel: priced ? undefined : 'Ask the shop',
    priceNote: priced ? undefined : 'This shop has not listed a price for it.',
    /* SOLD OUT IS SHOWN, NOT HIDDEN — the same rule the shop's own menu keeps.
       A row that vanishes when a shop runs out reads as a shelf that shrank. */
    tier: row.available ? undefined : 'Sold out',
    /* The shopkeeper's own heading, where they wrote one and it is not simply
       the aisle's name said again. */
    role: row.section ?? undefined,
    /* The shop's own line, under the price, where every other shelf puts the
       pack size: it is the same kind of fact — what you are actually getting
       if you press the button. */
    packLabel: shopLine(shop, now),
    why: [row.description].filter((s): s is string => !!s).slice(0, 2),
    image: row.photoUrl ?? undefined,
    imageAlt: row.photoUrl ? row.name : undefined,
    group: row.aisle,
    design: {
      label: row.available ? `Order at ${row.shopName}` : `See ${row.shopName}`,
      path: `/services/${where}`,
    },
  };
}

/**
 * ── ONE PACK, ONE TILE, AND THE SHOPS UNDER IT (owner, 8 Sep) ───────────────
 *
 * "Create an online grocery store using the internet, show all the products
 * that's available in an area."
 *
 * The internet half of that is the city's CATALOGUE — what a pack is, read out
 * of Open Food Facts, Open Beauty Facts and the Government's commodity master,
 * with the source printed on the tile. The "available in an area" half is still
 * and only the shops: a product reaches this shelf because a real grocer near
 * you published it, and the price is the one they typed.
 *
 * SO THIS TILE INVENTS NOTHING EITHER. `fromInr` is the cheapest price a shop
 * actually set among those that have it IN STOCK — a cheapest price you cannot
 * buy is worse than no price — and when nobody has priced it the tile says
 * "Ask the shop" exactly as a single row does. There is no average here, no
 * "market price", and no number this file worked out.
 *
 * THE BUTTON GOES TO ONE SHOP, because an order is one shop, one delivery. The
 * cheapest in-stock shop is the one it opens; the others are named on the tile
 * so the choice is visible rather than made for you.
 */
export function productTileOf(p: GroceryProductTile): ShopItem {
  const priced = p.fromInr != null;
  /* The offer the button opens: cheapest, in stock. When nothing is in stock
     the tile still stands (sold out is shown, not hidden) and points at the
     first shop that carries it. */
  const lead = p.offers.find((o) => o.available && o.priceInr != null)
    ?? p.offers.find((o) => o.available)
    ?? p.offers[0];
  const anyOpen = p.offers.some((o) => o.available);

  return {
    id: `product:${p.id}`,
    name: [p.name, p.loose ? null : p.pack].filter(Boolean).join(' · '),
    /* The BRAND is the brand here, not the shop — this tile is the product, and
       the shops are underneath it. A single unlinked row is the other way
       round, because there the shop is the only thing that identifies it. */
    brand: p.brand ?? undefined,
    category: p.aisle,
    priceInr: priced ? (p.fromInr as number) : 0,
    priceLabel: priced ? undefined : 'Ask the shops',
    priceNote: priced
      ? (p.shopCount > 1 ? `Cheapest of ${p.shopCount} shops near you` : undefined)
      : 'No shop near you has listed a price for it.',
    tier: anyOpen ? undefined : 'Sold out',
    packLabel: p.shopCount === 1
      ? `At ${lead?.shopName ?? 'one shop'}`
      : `At ${p.shopCount} shops near you`,
    /* WHO HAS IT, AND WHAT THEY CHARGE — the reason to group in the first
       place. Each line is one shop's own price; none of them is combined with
       any other. */
    why: p.offers.slice(0, 3).map((o) => {
      const price = o.priceInr != null ? `₹${o.priceInr}` : 'ask';
      const far = o.distanceKm != null ? ` · ${o.distanceKm} km` : '';
      return `${o.shopName} — ${price}${o.available ? '' : ' (sold out)'}${far}`;
    }),
    image: p.imageUrl ?? undefined,
    imageAlt: p.imageUrl ? [p.brand, p.name].filter(Boolean).join(' ') : undefined,
    group: p.aisle,
    design: {
      label: lead ? (lead.available ? `Order at ${lead.shopName}` : `See ${lead.shopName}`) : 'See the shops',
      path: lead ? `/services/${lead.shopSlug ?? lead.shopId}` : '/services/browse',
    },
  };
}
