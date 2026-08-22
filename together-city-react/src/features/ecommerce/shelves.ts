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
  hub: HubKey;
  /** the room that actually holds the products */
  path: string;
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
}

interface ShelfCard extends Shelf {
  /** the room's own label, from its hub's sidebar */
  name: string;
  /** the room's own line, from its hub's sidebar */
  line: string;
  /** the hub that verified what is on it */
  hubName: string;
}

function resolve(shelf: Shelf): ShelfCard | null {
  const cfg = HUBS[shelf.hub];
  const item = cfg?.items.find((i) => i.path === shelf.path);
  if (!item) return null;
  return { ...shelf, name: item.label, line: item.sub, hubName: cfg.name };
}

/** Shelves that read something you filled in and answer with a shortlist. */
export const FITTED: Shelf[] = [
  { hub: 'beauty', path: '/beauty/routine', reads: { name: 'Skin & Hair Profile', path: '/beauty/profile' }, shop: 'beauty' },
  { hub: 'fitness', path: '/fitness/supplements', reads: { name: 'Training Profile', path: '/fitness/profile' } },
  { hub: 'nutrition', path: '/nutrition/grocery', reads: { name: 'Food Preference Profile', path: '/nutrition/preferences' } },
  { hub: 'astrology', path: '/astrology/gemstones', reads: { name: 'Astrology Profile', path: '/profile/astrology' } },
  { hub: 'pets', path: '/pets/plan', reads: { name: 'Pet profiles', path: '/pets/profiles' } },
];

/** Shelves you walk yourself, filed under the aisle they belong to. */
export const OPEN: Shelf[] = [
  { hub: 'beauty', path: '/beauty/market', category: 'Skin & hair' },
  { hub: 'fitness', path: '/fitness/store', category: 'Supplements' },
  { hub: 'pets', path: '/pets/shop', category: 'Pets' },
  /* The gemstone bench is on both floors, and it is the only shelf that is.
     It is a marketplace you can browse by stone, and it is also the one place
     in the city where a stone is PRESCRIBED from a chart — so leaving it off
     either floor would be leaving out half of what it does. */
  { hub: 'astrology', path: '/astrology/gemstones', category: 'Gemstones' },
  { hub: 'services', path: '/services/offers', category: 'Deals & offers' },
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
};

export const fittedShelves = (): ShelfCard[] => FITTED.map(resolve).filter((c): c is ShelfCard => c !== null);
export const openShelves = (): ShelfCard[] => OPEN.map(resolve).filter((c): c is ShelfCard => c !== null);
