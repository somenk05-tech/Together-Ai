import { useMemo } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useGroceryShelf } from '@/features/services/api';
import type { Shop } from './types';
import { shopTileOf } from './shopTile';
import { productTileOf, tileOf } from './goodsTile';
import { useNearby } from './useNearby';

/**
 * ── THE GROCERY STORE ───────────────────────────────────────────────────────
 *
 * Owner, 8 Sep: "instead of grocery list create a grocery store with
 * vegetables, food items, household items etc."
 *
 * WHAT WAS HERE BEFORE, AND WHY IT WENT. The tab was a download: the week's
 * ingredients as a text file, because the shelf behind it had no prices and no
 * till (`GroceryDownloadPane`, retired with this). That was the honest thing to
 * do while the city had no groceries to sell. It has some now — not a
 * catalogue of its own, which it will never have, but every row a local grocer,
 * supermarket, sabzi market, bakery, butcher and fish shop has published in
 * their own menu, at their own price, behind their own sold-out switch.
 *
 * SO THIS SHELF INVENTS NOTHING. Every name, price and photograph is a
 * shopkeeper's. The aisles are decided on the server from the heading THEY
 * typed and the trade THEY registered under — never from the product's name
 * (see `grocery.ts`, and the spec that holds it).
 *
 * ── AND IT TAKES NO MONEY, ON PURPOSE ───────────────────────────────────────
 *
 * `bag` is null and every tile is a link. A bag here would be a bag across
 * eight different shops, and paying it would be eight orders, eight delivery
 * fees and eight vans — a checkout the city does not have and must not mime.
 * What it DOES have is `/services/:id/order`: a real cart, a real wallet
 * payment, a real address and a real kitchen-side counter, already live on
 * every one of these shops' own pages because they are all filed under Food &
 * Daily Needs. So the tile's button is that shop's door, which is exactly the
 * mechanism the gem counter uses for a stone that has no price until somebody
 * designs it — `design` on the item, and the shell draws a link instead of Add.
 *
 * THE PERSONALISATION IS WHERE YOU LIVE. This floor promises "only what's right
 * for you", and for groceries that is not a shortlist off a profile — it is
 * your own city's shops rather than a national catalogue. The city comes off
 * the Master Profile; with no city on file the shelf shows what the directory
 * holds and says so, rather than showing nothing.
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

/**
 * ── WHICH QUESTION THIS DOOR ASKS (owner, 10 Sep) ───────────────────────────
 *
 * "The Digital Store Open Market should show all the products from all digital
 * stores with the store mentioned below each product, just like the Pet shop."
 *
 * The fourth turn on this shelf, and the first with a RULE rather than a
 * preference — because the two doors were never asking the same thing:
 *
 *   · 'shops' — the LOCAL MARKET room, on a rail beside Find a service, All
 *     listed services and My business. A directory, and a directory's answer
 *     is a shop.
 *   · 'goods' — the OPEN MARKET tab, beside Pets, Skin & hair and Supplements,
 *     every one of which is a wall of products with its source named under
 *     each. A street of shops in that row was the one tab answering a
 *     different question from its neighbours, which is exactly why it felt
 *     wrong in both directions.
 *
 * ONE HOOK, TWO SHAPES. Two hooks would be the copy that disagrees the first
 * time either is corrected; two shapes off one read cannot.
 */
export type ShelfShape = 'shops' | 'goods';

export function useGroceryShop(
  back: { path: string; label: string } = { path: '/ecommerce/store', label: 'Digital Store' },
  shape: ShelfShape = 'goods',
): Shop {
  const profile = useMasterProfile();
  const city = profile.data?.city ?? undefined;
  const near = useNearby(city);
  /* The query waits for the profile read rather than firing twice — once for
     the whole directory and once for the city — which would show a citizen a
     national shelf for a moment and then take half of it away. */
  const shelf = useGroceryShelf({ city, ...near.query });

  /* ONE CLOCK FOR THE WHOLE SHELF, taken once per read rather than per tile —
     forty tiles each calling `new Date()` can straddle a minute boundary and
     put two different answers about the same shop on one screen. */
  const items = useMemo(() => {
    const now = new Date();
    if (shape === 'goods') {
      const byId = new Map((shelf.data?.shops ?? []).map((sh) => [sh.id, sh]));
      /* PRODUCT TILES FIRST, then every row with no product behind it. A row
         that IS in a product tile is skipped — showing it twice would put one
         shop's atta beside the tile that already contains that shop's atta,
         and a citizen would reasonably read them as two different things. */
      const products = (shelf.data?.products ?? []).map(productTileOf);
      const loose = (shelf.data?.items ?? [])
        .filter((row) => !row.productId)
        .map((row) => tileOf(row, byId.get(row.shopId), now));
      return [...products, ...loose];
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
    key: 'grocery',
    /* No `/ecommerce/shop/grocery` of its own: this shelf has no bag, so it has
       no second screen to have a route for. Both point at the room it lives in
       — the Local Market's Grocery Store — which is the same shelf under that
       hub's rail. */
    screens: { shelf: '/services/grocery', bag: '/services/grocery' },
    back,
    title: 'Grocery Store',
    line: city
      ? `Vegetables, staples, dairy, snacks and household — everything the grocers, markets and supermarkets of ${city} have put on their own shelves.`
      : 'Vegetables, staples, dairy, snacks and household — everything the city’s grocers, markets and supermarkets have put on their own shelves.',
    /* WHAT THIS SHELF READS, SAID WHERE EVERY OTHER SHELF SAYS IT. The beauty
       routine names a skin assessment, the supplement kit a training profile;
       this one names your city, because that is the whole of what it
       personalises on — and the way to change it is one tap, like theirs. */
    from: city ? { label: 'city', path: '/profile' } : undefined,
    hubName: 'Local Market',
    hubPath: '/services',

    items,
    groups,
    nearby: near.nearby,
    countLabel: shopCount > 0
      ? (near.centre
        ? `from ${shopCount} shop${shopCount === 1 ? '' : 's'} within ${near.km} km`
        : `from ${shopCount} shop${shopCount === 1 ? '' : 's'}${city ? ` in ${city}` : ''}`)
      : 'on this shelf',
    isLoading: profile.isLoading || shelf.isLoading,
    isError: shelf.isError,

    /* THE TWO EMPTY SHELVES ARE NOT THE SAME EMPTY SHELF, and only one of them
       is anybody's to fix. No city on file is the citizen's — the profile is
       one tap away and the shelf says so. No grocer listed in their city is
       the city's, and the honest answer there is the directory, not a nudge to
       edit a profile that is already right. */
    emptyTitle: city ? 'No grocer has opened a shelf here yet' : 'We do not know which city you shop in',
    emptyHint: city
      ? `Nobody in ${city} has published a grocery list on Together City yet. The moment a shop does, their shelf is here.`
      : 'Tell us your city and this shelf fills with the grocers, markets and supermarkets around you.',
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

    /* NO TILL, AND NOTHING THAT LOOKS LIKE ONE. `bag` is null so no screen
       ever reaches this; it is here because `Shop` requires it, and it does
       nothing rather than pretending to charge. */
    pay: () => undefined,
    payPending: false,
    payError: null,
  };
}
