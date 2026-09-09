import { useMemo } from 'react';
import { useMasterProfile } from '@/features/profile/hooks';
import { useGroceryShelf, type GroceryItem, type GroceryProductTile, type GroceryShop } from '@/features/services/api';
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

function tileOf(row: GroceryItem, shop: GroceryShop | undefined, now: Date): ShopItem {
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
function productTileOf(p: GroceryProductTile): ShopItem {
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
    const byId = new Map((shelf.data?.shops ?? []).map((sh) => [sh.id, sh]));
    /* PRODUCT TILES FIRST, then every row that has no product behind it. A row
       that IS in a product tile is skipped here — showing it twice would put
       one shop's atta beside the tile that already contains that shop's atta,
       and a citizen would reasonably read them as two different things. */
    const products = (shelf.data?.products ?? []).map(productTileOf);
    const loose = (shelf.data?.items ?? [])
      .filter((row) => !row.productId)
      .map((row) => tileOf(row, byId.get(row.shopId), now));
    return [...products, ...loose];
  }, [shelf.data]);
  /* THE COUNTS COME OFF THE TILES THAT ARE ACTUALLY DRAWN, not off the server's
     row counts. Since eight shops' rows for one pack became one tile, the
     server's per-aisle row count is no longer what this screen shows — and a
     chip reading "42" over twenty tiles is the kind of small wrongness nobody
     reports and everybody notices. Same rule the server keeps for its own
     aisles: count the things you are about to draw, never a second list. */
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) counts.set(it.group as string, (counts.get(it.group as string) ?? 0) + 1);
    return (shelf.data?.aisles ?? [])
      .filter((a) => counts.has(a.key))
      .map((a) => ({ key: a.key, label: a.label, count: counts.get(a.key) as number }));
  }, [shelf.data, items]);

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
    countLabel: shopCount > 0
      ? `from ${shopCount} shop${shopCount === 1 ? '' : 's'} near you`
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
