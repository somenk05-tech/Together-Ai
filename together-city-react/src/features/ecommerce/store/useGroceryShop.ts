import { useMemo } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useGroceryShelf, type GroceryShop } from '@/features/services/api';
import { openSentence, openStateNow, todayIdx } from '@/features/services/hours';
import type { Shop, ShopItem } from './types';

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

/**
 * ── WHAT THE DIRECTORY KNOWS ABOUT THIS SHOP, IN ONE LINE ───────────────────
 *
 * Owner, 8 Sep: "this grocery store needs to be updated by local services
 * data." A price with a name over it is half a fact — the other half is who
 * that shop is, and Local Market has been holding it all along.
 *
 * FOUR THINGS, IN THE ORDER SOMEBODY DECIDES BY: whether the shop is verified,
 * whether it is open right now, how it is rated, how far away it is. Each is
 * omitted rather than softened when it is not known: no hours is silence, not
 * "closed"; a rating under the directory's three-review floor arrives null and
 * prints nothing, because ★5.0 off one review is a number a shopkeeper gets
 * judged by.
 *
 * THE CLOCK IS THE READER'S. `openStateNow` runs here, on the browser, off
 * hours the server sent unjudged — an "open now" decided on the server is
 * wrong the minute a tab is left open, which is the division the rest of this
 * hub already keeps.
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

/* THE ROW-LEVEL TILES WENT WITH THE WALL THEY FILLED (owner, 9 Sep).
   `tileOf` drew one shopkeeper's line and `productTileOf` grouped the same
   pack across the shops that carry it, with the cheapest in-stock offer on the
   button. Both were answers to "show me everything for sale near me", and that
   is not the question this room asks any more — it asks which shop, and the
   shop's own page answers the rest with a real basket behind it.

   They are DELETED rather than left unused: a second, unreachable way to draw
   a grocery row is the copy that disagrees the first time either is corrected,
   and git remembers them if the wall ever comes back. The catalogue read
   itself is untouched — `products` still arrives on the shelf, and the shop's
   page is where it belongs next. */

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
function shopTileOf(
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

export function useGroceryShop(
  back: { path: string; label: string } = { path: '/ecommerce/store', label: 'Digital Store' },
): Shop {
  const profile = useMasterProfile();
  const city = profile.data?.city ?? undefined;
  /* The query waits for the profile read rather than firing twice — once for
     the whole directory and once for the city — which would show a citizen a
     national shelf for a moment and then take half of it away. */
  const shelf = useGroceryShelf({ city });

  /* ONE CLOCK FOR THE WHOLE SHELF, taken once per read rather than per tile —
     forty tiles each calling `new Date()` can straddle a minute boundary and
     put two different answers about the same shop on one screen. */
  const items = useMemo(() => {
    const now = new Date();
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
  }, [shelf.data]);
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
      ? `The grocers, markets and supermarkets of ${city} that have put a shelf on Together City. Open one to see everything on it.`
      : 'The city’s grocers, markets and supermarkets that have put a shelf on Together City. Open one to see everything on it.',
    /* WHAT THIS SHELF READS, SAID WHERE EVERY OTHER SHELF SAYS IT. The beauty
       routine names a skin assessment, the supplement kit a training profile;
       this one names your city, because that is the whole of what it
       personalises on — and the way to change it is one tap, like theirs. */
    from: city ? { label: 'city', path: '/profile' } : undefined,
    hubName: 'Local Market',
    hubPath: '/services',

    items,
    /* NO AISLE CHIPS. Aisles sort products, and this room's tiles are shops —
       a "Vegetables" chip over a street of shops would filter to the ones that
       sell vegetables, which is a different question and a worse one to answer
       badly. The aisles a shop stocks are printed on its own tile instead. */
    groups: undefined,
    itemNoun: { one: 'shop', many: 'shops' },
    countLabel: 'near you',
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
      ? 'Open a shop to see its whole shelf and fill a basket there, paid from your wallet — one order, one shop, one delivery.'
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
