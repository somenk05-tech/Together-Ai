import { useMemo } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useElectronicsShelf, type GroceryItem, type GroceryShop } from '@/features/services/api';
import { openSentence, openStateNow, todayIdx } from '@/features/services/hours';
import { useNearby } from './useNearby';
import type { Shop, ShopItem } from './types';

/**
 * ── THE ELECTRONICS STORE ───────────────────────────────────────────────────
 *
 * Owner, 8 Sep: "add the electronics store here."
 *
 * WHOSE ELECTRONICS, ASKED AND ANSWERED. A national catalogue was on the table
 * — real models, street prices dated to a comparison site, retailers' own
 * photographs — and the owner chose LOCAL MARKET VENDORS instead, which is the
 * grocery shelf's answer to the same question. So this shelf invents nothing
 * and quotes nobody: every name, price and photograph is a row an electronics
 * shop or a mobile shop published in their own Stock list, at their own price,
 * behind their own sold-out switch.
 *
 * IT TAKES NO MONEY, for the grocery shelf's reason exactly. `bag` is null and
 * every tile is a link to the shop that stocks it, because a bag across six
 * shops would be six orders, six delivery fees and six vans — a checkout the
 * city does not have and must not mime. What it HAS is `/services/:id/order`,
 * live on every one of these pages.
 *
 * AND NOTHING IS RANKED. The owner's third answer: no Mira on this floor yet,
 * because there is no electronics profile for her to read, and a fit score with
 * nothing behind it is a number somebody would believe. The shelf reads WHERE
 * YOU LIVE and stops there — the one thing it can personalise honestly.
 */

/**
 * WHAT THE DIRECTORY KNOWS ABOUT THIS SHOP, IN ONE LINE — the grocery shelf's
 * four facts in the order somebody decides by: verified, open now, rated, how
 * far. Each omitted rather than softened when it is not known; no hours is
 * silence, not "closed", and a rating under the directory's review floor prints
 * nothing at all. The clock is the reader's, off hours the server sent unjudged.
 */
function shopLine(shop: GroceryShop | undefined, now: Date): string | undefined {
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

function tileOf(row: GroceryItem, shop: GroceryShop | undefined, now: Date): ShopItem {
  const priced = row.priceInr != null;
  const where = row.shopSlug ?? row.shopId;
  return {
    id: row.id,
    name: row.name,
    /* The shop, not a manufacturer. Two shops listing the same television are
       two rows here — there is no electronics catalogue to fold them into one
       tile — so whose counter it is on is the thing that tells them apart. */
    brand: row.shopName,
    category: row.aisle,
    /* AN UNPRICED ROW SAYS "ASK", NEVER ₹0. A shop that quotes a fridge on
       the phone rather than printing a price is a normal electronics shop,
       and turning that into a number would be the store pricing something
       nobody priced. */
    priceInr: priced ? (row.priceInr as number) : 0,
    priceLabel: priced ? undefined : 'Ask the shop',
    priceNote: priced ? undefined : 'This shop has not listed a price for it.',
    /* SOLD OUT IS SHOWN, NOT HIDDEN — a row that vanishes when a shop runs out
       reads as a shelf that shrank. */
    tier: row.available ? undefined : 'Sold out',
    /* The shopkeeper's own heading, where they wrote one. */
    role: row.section ?? undefined,
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

export function useElectronicsShop(
  back: { path: string; label: string } = { path: '/ecommerce/market', label: 'Open Market' },
): Shop {
  const profile = useMasterProfile();
  const city = profile.data?.city ?? undefined;
  /* The query waits for the profile read rather than firing twice — once for
     the whole directory and once for the city — which would show a citizen a
     national shelf for a moment and then take half of it away. */
  /* The same strip the grocery shelf grew (owner, 9 Sep). Both shelves are
     made of local stock, so both have a distance to be within — and one hook
     rather than two copies of a radius. */
  const near = useNearby(city);
  const shelf = useElectronicsShelf({ city, ...near.query });

  /* ONE CLOCK FOR THE WHOLE SHELF, taken once per read rather than per tile:
     forty tiles each calling `new Date()` can straddle a minute boundary and
     put two different answers about one shop on one screen. */
  const items = useMemo(() => {
    const now = new Date();
    const byId = new Map((shelf.data?.shops ?? []).map((sh) => [sh.id, sh]));
    return (shelf.data?.items ?? []).map((row) => tileOf(row, byId.get(row.shopId), now));
  }, [shelf.data]);

  /* THE COUNTS COME OFF THE TILES THAT ARE ACTUALLY DRAWN, never the server's
     row counts — the rule both other shelves keep. */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.group as string, (counts.get(it.group as string) ?? 0) + 1);
    return (shelf.data?.aisles ?? [])
      .filter((a) => counts.has(a.key))
      .map((a) => ({ key: a.key, label: a.label, count: counts.get(a.key) as number }));
  }, [shelf.data, items]);

  const shopCount = shelf.data?.shopCount ?? 0;

  return {
    key: 'electronics',
    /* No `/ecommerce/shop/electronics` of its own: this shelf has no bag, so it
       has no second screen to have a route for. Both point at the room it lives
       in — the Local Market's Electronics Store — which is the same shelf under
       that hub's rail. */
    screens: { shelf: '/services/electronics', bag: '/services/electronics' },
    back,
    title: 'Electronics Store',
    line: city
      ? `Phones, laptops, televisions, appliances and accessories — everything the electronics and mobile shops of ${city} have put on their own shelves.`
      : 'Phones, laptops, televisions, appliances and accessories — everything the city’s electronics and mobile shops have put on their own shelves.',
    /* WHAT THIS SHELF READS, SAID WHERE EVERY OTHER SHELF SAYS IT — and here it
       is only your city, because that is the whole of what it personalises on.
       No profile is named, because no profile is consulted. */
    from: city ? { label: 'city', path: '/profile' } : undefined,
    hubName: 'Local Market',
    hubPath: '/services',

    items,
    groups,
    nearby: near.nearby,
    countLabel: shopCount > 0
      ? `from ${shopCount} shop${shopCount === 1 ? '' : 's'} near you`
      : 'on this shelf',
    isLoading: profile.isLoading || shelf.isLoading,
    isError: shelf.isError,

    /* THE TWO EMPTY SHELVES ARE NOT THE SAME EMPTY SHELF, and only one of them
       is anybody's to fix. No city on file is the citizen's, and the profile is
       one tap away. No electronics shop listed in their city is the city's, and
       the honest answer there is the directory, not a nudge to edit a profile
       that is already right. */
    emptyTitle: city ? 'No electronics shop has opened a shelf here yet' : 'We do not know which city you shop in',
    emptyHint: city
      ? `Nobody in ${city} has published an electronics stock list on Together City yet. The moment a shop does, their shelf is here.`
      : 'Tell us your city and this shelf fills with the electronics and mobile shops around you.',
    emptyTo: city
      ? { label: 'Browse the Local Market', path: '/services/browse' }
      : { label: 'Add your city', path: '/profile' },

    /* NO BAG, AND THE SENTENCE SAYS WHY RATHER THAN LEAVING A HOLE. */
    bag: null,
    blocked: shopCount > 0
      ? 'Each shop takes its own order. Tap a shop to fill a basket there and pay from your wallet — one order, one shop, one delivery.'
      : undefined,
    isSaving: false,
    qtyOf: () => 0,
    add: () => undefined,
    remove: () => undefined,
    clear: () => undefined,

    /* NO TILL, AND NOTHING THAT LOOKS LIKE ONE. */
    pay: () => undefined,
    payPending: false,
    payError: null,
  };
}
