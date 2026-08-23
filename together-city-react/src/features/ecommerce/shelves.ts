import { HUBS } from '@/config/hubs';
import type { HubKey } from '@/types';

/**
 * ── THE CITY ALREADY SELLS THINGS ───────────────────────────────────────────
 *
 * E-Commerce came back on the owner's word (22 Aug), and the reason it left on
 * 10 Aug is the constraint it comes back under: it was "the one district with
 * no hub behind it", a photograph of a shop that did not exist with COMING
 * SOON written across the third plate of the walk.
 *
 * So this hub sells nothing of its own, and it holds no catalogue. There is no
 * product table in the API — `commerce` is the payments module, and a shelf
 * invented here to fill a page would be exactly the thing the golden rule
 * forbids. What the city HAS is five shops, built over months, each verified by
 * the hub that owns it: the Beauty Market, the fitness Store, the Pet shop, the
 * gemstone bench and the grocery list. Nobody could see them as one shop
 * because nothing said they were one.
 *
 * That is what this district is: the way in to all of them, in two rooms —
 * the shelves that read a profile and come back with a shortlist, and the
 * shelves you browse yourself.
 *
 * ── AND THE COPY IS NOT WRITTEN HERE ────────────────────────────────────────
 *
 * Every card's name and line is READ OUT OF `HUBS`, from the sidebar entry of
 * the room it points at. Retyping "Verified in India · we take no cut" into
 * this file would make a second copy of a sentence the fitness hub owns, and
 * the two would disagree the first time one of them was edited — the same
 * failure the astrology menu paid for when a price lived in a config file.
 * A shelf whose path no longer resolves to a sidebar entry drops out of the
 * list rather than rendering an empty card, and
 * `the-shop-is-the-citys-own-shelves.test.ts` fails when one does, so the
 * silence is never how anybody finds out.
 */

interface Shelf {
  /**
   * THE HUB THAT VERIFIED WHAT IS ON IT — and it is optional for exactly one
   * reason, which is the `soon` field at the bottom of this interface. Every
   * shelf that a citizen can open has a hub behind it; a shelf that is not
   * built yet has nobody behind it, and that is not a gap in the model, it is
   * the whole of what "coming soon" means here.
   */
  hub?: HubKey;
  /** the room that actually holds the products. A coming-soon shelf has none
   *  — there is no room — which is what stops the tile being a door. */
  path?: string;
  /**
   * THE PICTURE THE CARD IS MADE OF (owner, 22 Aug). A file in
   * /assets/img, not a URL and not a background in a stylesheet: the tile
   * renders it as an `<img>` so it lazy-loads and so the shelf that owns the
   * card owns the picture on it. Six pictures cover ten cards because the two
   * floors show the same six shelves — the Beauty Market is the same shop
   * whether you were sent to it or walked in, and giving it two faces would be
   * telling somebody they are two places.
   */
  art: string;
  /** the aisle it stands in, on the Open Market floor */
  category?: string;
  /** the profile this shelf reads before it recommends anything, and the room
   *  where it is filled in. A shelf you simply browse has none. */
  reads?: { name: string; path: string };
  /* THE SHELF HAS A SHOP OF ITS OWN (owner, 22 Aug). Where this is set the card
     opens a white storefront under /ecommerce/shop rather than the hub's own
     room — the shortlist as a shop window, with the bag and the till inside it.
     Where it is not set the card still opens the room, which is the honest
     answer for a shelf whose shop does not exist yet: four of the five are in
     that state today and each needs an adapter of its own. */
  shop?: string;
  /* THE LIST IS HANDED OVER, NOT LINKED TO (owner, 22 Aug). The grocery shelf
     has no prices and no order endpoint, so it never became a shop — and
     sending somebody to the Nutrition hub to fetch their own list is a trip
     for a thing that fits in a file. This card downloads it. */
  download?: boolean;
  /**
   * ── A SHELF THE CITY HAS NOT BUILT YET (owner, 23 Aug) ────────────────────
   *
   * "Add costume jewelry tab on this page, also just jewelry store on open
   * market and make everything coming soon."
   *
   * This is the one kind of shelf with no hub, no path and no shop — and it
   * carries its own name, which every other card in this file is forbidden
   * from doing. The rule it appears to break is the rule that makes it safe:
   * a card's copy comes from the sidebar entry of the room it opens, so that
   * two files cannot disagree about a name. There is no room, so there is no
   * second copy to disagree with. The day one exists, the shelf gets a `hub`
   * and a `path`, `soon` comes off, and the name comes from the room like
   * every other card's.
   *
   * `the-shop-is-the-citys-own-shelves.test.ts` holds both halves of that: a
   * shelf with `soon` must have no path, and a shelf without it must resolve
   * against a real sidebar entry. Neither can be quietly relaxed.
   *
   * AND IT IS NOT A DOOR. `ShelfTile` renders an `<article>` rather than a
   * `<Link>` when nothing is passed to open — a coming-soon card that is
   * clickable is the 10 Aug mistake in miniature, which is the reason this
   * whole district was deleted once.
   */
  soon?: { name: string };
}

export interface ShelfCard extends Shelf {
  /** the room's own label, from its hub's sidebar */
  name: string;
  /** the room's own line, from its hub's sidebar */
  line: string;
  /** the hub that verified what is on it */
  hubName: string;
}

function resolve(shelf: Shelf): ShelfCard | null {
  /* A shelf with nobody behind it has nothing to resolve against, and that is
     the point of it. It never drops out of the list the way an unresolvable
     one does — there is nothing here that can go stale. */
  if (shelf.soon) return { ...shelf, name: shelf.soon.name, line: '', hubName: '' };
  const cfg = HUBS[shelf.hub!];
  const item = cfg?.items.find((i) => i.path === shelf.path);
  if (!item) return null;
  return { ...shelf, name: item.label, line: item.sub, hubName: cfg.name };
}

/** Shelves that read something you filled in and answer with a shortlist. */
export const FITTED: Shelf[] = [
  { hub: 'beauty', path: '/beauty/routine', art: 'ec-skin-hair.webp', reads: { name: 'Skin & Hair Profile', path: '/beauty/profile' }, shop: 'beauty' },
  { hub: 'fitness', path: '/fitness/supplements', art: 'ec-supplements.webp', reads: { name: 'Training Profile', path: '/fitness/profile' }, shop: 'supplements' },
  /* NO SHOP FOR THE GROCERY LIST, at the owner's call (22 Aug). It is a list
     of ingredients with no prices on it and no order endpoint behind it —
     ordering has been coming-soon in that hub for a while. A white storefront
     with no till would be a second view of a page that already works, and a
     till on it would be inventing one. So it is not a door at all: the card
     hands the list over as a file. */
  { hub: 'nutrition', path: '/nutrition/grocery', art: 'ec-grocery.webp', reads: { name: 'Food Preference Profile', path: '/nutrition/preferences' }, download: true },
  { hub: 'astrology', path: '/astrology/gemstones', art: 'ec-gemstones.webp', reads: { name: 'Astrology Profile', path: '/profile/astrology' }, shop: 'gemstones' },
  { hub: 'pets', path: '/pets/plan', art: 'ec-pets.webp', reads: { name: 'Pet profiles', path: '/pets/profiles' } },
  /* COSTUME JEWELLERY, AND IT READS NOTHING YET. It is on this floor rather
     than the market's because the owner put it here, and the floor's promise
     survives it: the shelves here answer a profile, and the profile this one
     will answer is the same style record the beauty rooms already keep. No
     `reads` until that is wired, because naming a profile a shelf does not
     consult would be inventing the shortlist rather than the shop. */
  { art: 'ec-jewellery.webp', soon: { name: 'Costume Jewellery' } },
];

/** Shelves you walk yourself, filed under the aisle they belong to. */
export const OPEN: Shelf[] = [
  { hub: 'beauty', path: '/beauty/market', art: 'ec-skin-hair.webp', category: 'Skin & hair', shop: 'skin-hair' },
  { hub: 'fitness', path: '/fitness/store', art: 'ec-supplements.webp', category: 'Supplements', shop: 'supplements' },
  { hub: 'pets', path: '/pets/shop', art: 'ec-pets.webp', category: 'Pets', shop: 'pets' },
  /* The gemstone bench is on both floors, and it is the only shelf that is.
     It is a marketplace you can browse by stone, and it is also the one place
     in the city where a stone is PRESCRIBED from a chart — so leaving it off
     either floor would be leaving out half of what it does. Since 22 Aug the
     two floors open two different rooms, which is what "both floors" was always
     supposed to mean: the counter here, the chart's own five over there. */
  { hub: 'astrology', path: '/astrology/gemstones', art: 'ec-gemstones.webp', category: 'Gemstones', shop: 'gemstones' },
  { hub: 'services', path: '/services/offers', art: 'ec-offers.webp', category: 'Deals & offers' },
  /* THE JEWELLERY AISLE — the plain shelf, not the bench. It stands beside
     Gemstones and it is not the same shop: a stone at the bench is prescribed
     off a chart and priced by the carat, and this is a shelf somebody walks.
     Filed under its own aisle for that reason rather than folded into
     Gemstones, where it would be sorted by a chart nobody consulted. */
  { art: 'ec-jewellery.webp', category: 'Jewellery', soon: { name: 'Jewellery' } },
];

/**
 * ── THE STOREFRONT'S SCREENS, WRITTEN OUT ───────────────────────────────────
 *
 * Every path in this map is a LITERAL, and that is the whole reason the map
 * exists. The card and the storefront both reach these screens through data —
 * `to={shop.screens.shelf}` — and a regex cannot see through that, so
 * `nav-audit`'s sixth check reported both routes as declared and unreachable:
 * "a citizen can only reach it by typing the URL". It was wrong, and it was
 * wrong for a good reason — a route nothing can be seen to link to is usually a
 * finished feature nobody can find.
 *
 * The fix is to make the reference visible rather than to add the routes to the
 * audit's list of deliberate exceptions. That list is for doors that really are
 * hidden (the console, the developer page); putting a shop on it would spend a
 * guard to silence itself. Nested one level so both paths sit behind a `path:`,
 * which is what the audit reads as a way in.
 */
export interface ShopScreens { shelf: { path: string }; bag: { path: string } }
export const SHOPS: Record<string, ShopScreens> = {
  beauty: {
    shelf: { path: '/ecommerce/shop/beauty' },
    bag: { path: '/ecommerce/shop/beauty/bag' },
  },
  supplements: {
    shelf: { path: '/ecommerce/shop/supplements' },
    bag: { path: '/ecommerce/shop/supplements/bag' },
  },
  gemstones: {
    shelf: { path: '/ecommerce/shop/gemstones' },
    bag: { path: '/ecommerce/shop/gemstones/bag' },
  },
};

/**
 * ── THE OPEN MARKET'S AISLES ────────────────────────────────────────────────
 *
 * Owner, 22 Aug: "create a separate store for open market where each category
 * has all the products for the user to see." So the market's cards stop being
 * links into other hubs and become storefronts of their own — the same shell as
 * the Personalized Store's shops, showing the WHOLE shelf instead of a
 * shortlist.
 *
 * Literal paths for the same reason `SHOPS` has them: both screens are reached
 * through data, and `nav-audit` reads `path:` literals to decide whether a
 * declared route has any way in.
 *
 * GEMSTONES WAS NOT HERE UNTIL 22 AUG, and the reason it was not is worth
 * keeping because it turned out to be wrong. The note said "a stone is read off
 * a chart, so 'all the gemstones' is the same list as 'your gemstones'". It is
 * not: the chart names at most five, and the catalogue holds THIRTY — nine
 * Navaratna, sixteen upratna and five sold with no prescription at all. The
 * prescription was being mistaken for the shelf. The counter shows all thirty,
 * ranks none of them, and lets the citizen choose the weight inside the range
 * the stone is worn at, which is the one thing a chart was deciding for them.
 *
 * ONE OF THE FIVE CARDS IS STILL NOT HERE: Daily offers is not products at all
 * — it is what local businesses have on today, and it lives in Local Services.
 */
export const AISLES: Record<string, ShopScreens> = {
  'skin-hair': {
    shelf: { path: '/ecommerce/market/skin-hair' },
    bag: { path: '/ecommerce/market/skin-hair/bag' },
  },
  supplements: {
    shelf: { path: '/ecommerce/market/supplements' },
    bag: { path: '/ecommerce/market/supplements/bag' },
  },
  /* The pet aisle has no bag screen: its cart lives in the browser with no till
     behind it, so both entries point at the shelf and the storefront draws no
     Bag link at all. */
  pets: {
    shelf: { path: '/ecommerce/market/pets' },
    bag: { path: '/ecommerce/market/pets' },
  },
  gemstones: {
    shelf: { path: '/ecommerce/market/gemstones' },
    bag: { path: '/ecommerce/market/gemstones/bag' },
  },
};

/**
 * THE ROOM'S OWN NAME, FOR CODE THAT IS NOT DRAWING A CARD. The shop adapters
 * build a masthead rather than a shelf, so they never touch `resolve()` — and
 * `useBeautyShop` kept its own `title: 'Your Routine'` because of it. That is
 * the second copy this whole file exists to prevent, and it proved the point
 * the day the owner renamed the room: the rail said one thing and the shop it
 * opened said another. One lookup, one name.
 */
export function shelfName(hub: HubKey, path: string): string {
  return HUBS[hub]?.items.find((i) => i.path === path)?.label ?? '';
}

export const fittedShelves = (): ShelfCard[] => FITTED.map(resolve).filter((c): c is ShelfCard => c !== null);
export const openShelves = (): ShelfCard[] => OPEN.map(resolve).filter((c): c is ShelfCard => c !== null);
