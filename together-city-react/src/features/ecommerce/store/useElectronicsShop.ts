import { useMemo } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useElectronicsShelf } from '@/features/services/api';
import { useNearby } from './useNearby';
import type { Shop } from './types';
import { shopTileOf } from './shopTile';
import { tileOf } from './goodsTile';
import type { ShelfShape } from './useGroceryShop';

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


/* THE ROW-LEVEL TILES WENT WITH THE WALL THEY FILLED (owner, 9 Sep evening).
   `tileOf` drew one shopkeeper's line and, on the grocery shelf,
   `productTileOf` grouped the same pack across the shops that carry it with
   the cheapest in-stock offer on the button. Both were answers to "show me
   everything for sale near me" — the question this room asked between 8 Sep
   and the morning of 9 Sep. It asks which SHOP now, and the shop's own page
   answers the rest with a real basket behind it.

   DELETED rather than left unused: a second, unreachable way to draw a row is
   the copy that disagrees the first time either is corrected, and git
   remembers them if the wall ever comes back. The reads are untouched — the
   rows still arrive on the shelf, and the shop's page is where they belong
   next. */

export function useElectronicsShop(
  back: { path: string; label: string } = { path: '/ecommerce/market', label: 'Open Market' },
  shape: ShelfShape = 'goods',
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
    if (shape === 'goods') {
      const byId = new Map((shelf.data?.shops ?? []).map((sh) => [sh.id, sh]));
      /* NO PRODUCT TILES HERE. Grouping two shops' rows into one product
         needs a catalogue behind them, and the city's catalogue is groceries —
         "55-inch smart TV" from two shops cannot be PROVED to be one
         television, and guessing is the district inventing a fact. */
      const loose = (shelf.data?.items ?? [])
        .map((row) => tileOf(row, byId.get(row.shopId), now));
      return loose;
    }
    /* WHAT EACH SHOP STOCKS AND WHAT IT LOOKS LIKE, read off the rows the
       server already sent rather than asked for again: the aisles the shop has
       lines in, and the first photograph on its shelf. One pass, so a hundred
       rows do not become a hundred scans. */
    const aisleLabel = new Map((shelf.data?.aisles ?? []).map((a) => [a.key, a.label]));
    const stocks = new Map<string, Set<string>>();
    const photo = new Map<string, string>();
    for (const row of shelf.data?.items ?? []) {
      const set = stocks.get(row.shopId) ?? new Set<string>();
      set.add(aisleLabel.get(row.aisle) ?? row.aisle);
      stocks.set(row.shopId, set);
      if (row.photoUrl && !photo.has(row.shopId)) photo.set(row.shopId, row.photoUrl);
    }
    return (shelf.data?.shops ?? [])
      .map((sh) => shopTileOf(sh, now, photo.get(sh.id), [...(stocks.get(sh.id) ?? [])]));
  }, [shelf.data, shape]);

  /* AISLE CHIPS SORT PRODUCTS, so they belong to the goods shape and not to
     the street. A chip filtering "Staples" on a wall of shops would be
     filtering shops by something one line on their shelf happens to be, which
     is not a claim about the shop at all. Counted off the tiles ACTUALLY
     DRAWN, never the server's row counts — the rule every other shelf keeps. */
  const groups = useMemo<Shop['groups']>(() => {
    if (shape !== 'goods') return [];
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.group as string, (counts.get(it.group as string) ?? 0) + 1);
    return (shelf.data?.aisles ?? [])
      .filter((a) => counts.has(a.key))
      .map((a) => ({ key: a.key, label: a.label, count: counts.get(a.key) as number }));
  }, [shelf.data, items, shape]);

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
