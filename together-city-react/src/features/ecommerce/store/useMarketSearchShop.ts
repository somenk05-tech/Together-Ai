import { useMemo, useState } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useMarketSearch, type GroceryItem } from '@/features/services/api';
import type { Shop, ShopItem } from './types';
import { useNearby } from './useNearby';

/**
 * ── SEARCH THE WHOLE MARKET (/ecommerce/market?tab=search) ──────────────────
 *
 * Owner, 9 Sep: "add a search tab for all categories and all stores."
 *
 * Every other tab on this floor is a place — a set of trades, read as one
 * shelf. This one is a question. A citizen typing "atta" or "phone charger" is
 * not browsing an aisle; they want whichever shop near them has published that
 * line, and the trade it was published under is an ANSWER rather than a filter.
 *
 * IT IS A SHELF, NOT A PAGE. The storefront already draws tiles, aisle chips, a
 * cart bar and the distance strip; a search page of its own would have to grow
 * all four again and they would drift. So this is an adapter like every other
 * one, and the box and the hint are two more fields on `Shop`.
 *
 * EVERY TILE NAMES ITS SHOP (owner, 9 Sep: "each item should mention which
 * store the product comes from"), and the button is that shop's own door —
 * because an order is one shop, one basket, one delivery, which is the rule
 * this whole floor's grocery shelf already keeps.
 */
function tileOf(row: GroceryItem): ShopItem {
  const priced = row.priceInr != null;
  const where = row.shopSlug ?? row.shopId;
  return {
    id: row.id,
    name: row.name,
    /* The SHOP, not a maker. On a result the first thing worth knowing is
       whose counter it is on — a price with no shop over it is half a fact. */
    brand: row.shopName,
    /* The trade the shopkeeper registered under. It is what tells "coriander"
       at a sabzi market apart from "coriander powder" at a supermarket, and it
       is the reason this search is not filtered by category. */
    category: row.shopCategory,
    priceInr: priced ? (row.priceInr as number) : 0,
    priceLabel: priced ? undefined : 'Ask the shop',
    priceNote: priced ? undefined : 'This shop has not listed a price for it.',
    tier: row.available ? undefined : 'Sold out',
    role: row.section ?? undefined,
    /* How far, where the shop said where it is. A result with no distance is
       not drawn as "far" — it is drawn without one. */
    packLabel: row.distanceKm != null
      ? `${row.shopCategory} · ${row.distanceKm} km`
      : row.shopCategory,
    why: [row.description].filter((d): d is string => !!d).slice(0, 1),
    image: row.photoUrl ?? undefined,
    imageAlt: row.photoUrl ? row.name : undefined,
    group: row.aisle,
    design: {
      label: row.available ? `Order at ${row.shopName}` : `See ${row.shopName}`,
      path: `/services/${where}`,
    },
  };
}

export function useMarketSearchShop(
  back: { path: string; label: string } = { path: '/ecommerce/market', label: 'Open Market' },
): Shop {
  const profile = useMasterProfile();
  const city = profile.data?.city ?? undefined;
  const near = useNearby(city);
  const [q, setQ] = useState('');
  const term = q.trim();
  const found = useMarketSearch({ q: term, city, ...near.query });

  const items = useMemo(() => (found.data?.items ?? []).map(tileOf), [found.data]);

  /* THE AISLE CHIPS ARE THE ANSWER'S OWN SHAPE, not a list decided in advance:
     a search for "oil" comes back under Staples and Beauty, and those are the
     two chips it should offer. Counted off the tiles that are actually drawn,
     the rule every shelf in this store keeps. */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.group as string, (counts.get(it.group as string) ?? 0) + 1);
    return [...counts.entries()].map(([key, count]) => ({ key, label: key, count }));
  }, [items]);

  const shopCount = found.data?.shopCount ?? 0;
  const short = term.length > 0 && term.length < 2;

  return {
    key: 'search',
    screens: { shelf: '/ecommerce/market', bag: '/ecommerce/market' },
    back,
    title: 'Search the market',
    line: 'Every list every shop near you has published — groceries, electronics, menus, rate cards. Type what you are looking for.',
    hubName: 'Open Market',
    hubPath: '/ecommerce/market',

    search: {
      value: q,
      onChange: setQ,
      placeholder: 'Atta, phone charger, haircut, paneer…',
      hint: short
        ? 'Two letters or more — one matches most of the city.'
        : (term.length >= 2 && found.data
          ? `${found.data.total} result${found.data.total === 1 ? '' : 's'} from ${shopCount} shop${shopCount === 1 ? '' : 's'}`
          : undefined),
    },
    nearby: near.nearby,

    items,
    groups,
    itemNoun: { one: 'result', many: 'results' },
    countLabel: near.centre ? `within ${near.km} km` : (city ? `in ${city}` : 'across the city'),
    isLoading: found.isLoading && term.length >= 2,
    isError: found.isError,

    /* THREE EMPTY SHELVES, THREE DIFFERENT SENTENCES. Nothing typed is not
       nothing found, and nothing found near you is not nothing in the city —
       the third is the one the distance control exists to fix, so it is the
       one that says so. */
    emptyTitle: term.length < 2
      ? 'What are you looking for?'
      : (near.centre ? 'Nothing within this distance' : 'No shop has listed that'),
    emptyHint: term.length < 2
      ? 'Type two letters or more and this searches every list every shop near you has published.'
      : (near.centre
        ? `No shop within ${near.km} km has published a line matching “${term}”. Widen the distance above, or search the whole city.`
        : `No shop${city ? ` in ${city}` : ''} has published a line matching “${term}”.`),
    emptyTo: { label: 'Browse the Local Market', path: '/services/browse' },

    /* NO BAG, for the reason the grocery shelf has none: a bag here would be a
       bag across a dozen shops in a dozen trades, and paying it would be a
       dozen orders. Every tile is its shop's own door instead. */
    bag: null,
    blocked: items.length > 0
      ? 'Each shop takes its own order. Open one to fill a basket there and pay from your wallet — one order, one shop, one delivery.'
      : undefined,
    isSaving: false,
    qtyOf: () => 0,
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,
    pay: () => undefined,
    payPending: false,
    payError: null,
  };
}
