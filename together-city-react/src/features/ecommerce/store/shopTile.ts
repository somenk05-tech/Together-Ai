import { openSentence, openStateNow, todayIdx } from '@/features/services/hours';
import type { GroceryShop } from '@/features/services/api';
import type { ShopItem } from './types';

/**
 * ── THE SHOP IS THE TILE ────────────────────────────────────────────────────
 *
 * Owner, 8 Sep: "in this section just show the shop name first and when
 * clicked we see the entire menu and catalogue." Reversed to a wall of goods
 * on the morning of 9 Sep, and asked for again the same evening — "the grocery
 * store here when clicked should show individual store names" — this time for
 * BOTH trades.
 *
 * SO IT LIVES IN ITS OWN FILE NOW. It was inline in useGroceryShop the first
 * time round, which is why the electronics shelf could not have it without a
 * second copy — and a second copy of a tile is the one that disagrees the
 * first time either is corrected. Both shelves' `shops` arrive in the same
 * shape from the same service, so one builder serves both.
 *
 * WHY A STREET AND NOT A WALL. The wall was every row of every shop in the
 * city at once — atta from one beside a phone charger from another — and
 * nothing on it could be bought together, because an order is one shop, one
 * basket, one delivery. The tile's own button said so, twenty-five times over.
 * The door is the shop's OWN page, `/services/:slug`, which already holds the
 * whole list, their prices, their sold-out switches, a real basket, a wallet
 * payment and an address.
 */

export function shopLine(shop: GroceryShop | undefined, now: Date): string | undefined {
  if (!shop) return undefined;
  const bits: string[] = [];
  if (shop.trust?.label) bits.push(shop.trust.label);
  const state = openStateNow(shop.hours, now);
  if (state.open === true) bits.push('Open now');
  else if (state.open === false) {
    const next = openSentence(state, todayIdx(now));
    bits.push(next && next.startsWith('opens') ? `Closed · ${next}` : 'Closed now');
  }
  if (shop.rating != null) bits.push(`★ ${shop.rating}`);
  if (shop.distanceKm != null) bits.push(`${shop.distanceKm} km`);
  return bits.length ? bits.join(' · ') : undefined;
}

/**
 * ── THE SHOP IS THE TILE (owner, 9 Sep) ─────────────────────────────────────
 *
 * "in this section just show the shop name first and when clicked we see the
 * entire menu and catalogue."
 *
 * What was here was every row of every grocer in the city on one wall — atta
 * from one shop beside dal from another beside soap from a third, and the
 * shop's name in small type under each. It reads as a supermarket the city
 * does not have: nothing on that wall could be bought together, because an
 * order is one shop, one basket, one delivery, and the tile's own button said
 * so twenty-five times over.
 *
 * SO THE ROOM IS A STREET OF SHOPS NOW, and the shelf is behind each door. The
 * door is the shop's OWN page — `/services/:slug` — which already holds the
 * whole menu, the shopkeeper's own prices, their sold-out switches, a real
 * basket, a wallet payment and an address. Sending the citizen there rather
 * than to a second copy of that menu inside this room is the same rule this
 * file already kept for the tile's button; it is simply the whole tile now.
 *
 * WHAT A SHOP TILE SAYS, in the order somebody chooses a shop by: its name,
 * what kind of shop it is, how many things are on its shelf, and then the four
 * facts the directory holds — verified, open now, rated, how far. Each is
 * omitted rather than softened when it is not known.
 */
export function shopTileOf(
  shop: GroceryShop,
  now: Date,
  photo: string | undefined,
  aisles: string[],
): ShopItem {
  return {
    id: `shop:${shop.id}`,
    name: shop.name,
    /* The trade they registered under — "Supermarkets", "Fruit & Vegetable
       Markets" — which is the city's word for them, not ours. */
    brand: shop.categoryLabel,
    category: shop.categoryLabel,
    /* A SHOP HAS NO PRICE, so the price slot carries the one number that
       decides whether a door is worth opening: how much is behind it. */
    priceInr: 0,
    priceLabel: `${shop.itemCount} item${shop.itemCount === 1 ? '' : 's'}`,
    packLabel: shopLine(shop, now),
    /* What they stock, in the city's own aisle names, and where they are. Two
       lines at most — the tile is a door, not a listing. */
    why: [
      aisles.length ? aisles.slice(0, 4).join(' · ') : undefined,
      shop.areas || undefined,
    ].filter((x): x is string => !!x),
    /* Their own logo where they uploaded one; otherwise the first photograph
       off their own shelf, which is a truer picture of the shop than a generic
       mark. Neither exists for plenty of shops, and the shell draws its
       fallback then. */
    image: shop.logoUrl ?? photo,
    imageAlt: shop.logoUrl ? shop.name : (photo ? `${shop.name} — from their shelf` : undefined),
    group: 'shops',
    design: { label: 'Open the shop', path: `/services/${shop.slug ?? shop.id}` },
  };
}
