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
   * THE NAME ON THE CARD, WHEN IT IS NOT THE NAME OF THE ROOM.
   *
   * Written for the Open Market, where it is the AISLE — that floor is an
   * aisle board and its masthead says so, and the fitness card had to read
   * "Supplements" rather than "The Store". Every open shelf declares one.
   * Since 6 Sep it is the word on the TAB: both floors are one storefront
   * with the shelves as a row of categories on top, and this is the category.
   *
   * IT IS NOT ONLY THE MARKET'S ANY MORE (owner, 23 Aug: the pets card should
   * say "Pets", not "Diet plan"). The rule used to be "the market names the
   * aisle, the store names the room", and four of the five store cards made
   * that look like a principle by coincidence: Your Beauty Routine,
   * Supplements, Grocery Lists and Gemstones are all rooms whose names happen
   * to be what is on the shelf. Diet plan is the one where the room is named
   * after what it DOES, and on a run of five cards it read as the odd one
   * rather than as the pet shelf.
   *
   * So both floors name the SHELF: this when it is set, the room's own label
   * otherwise. The room keeps its name — inside the Pets rail "Diet plan" is
   * one of six rooms and the name is what says which.
   */
  category?: string;
  /** the profile this shelf reads before it recommends anything, and the room
   *  where it is filled in. A shelf you simply browse has none. */
  reads?: { name: string; path: string };
  /* THE SHELF HAS A SHOP OF ITS OWN (owner, 22 Aug). Where this is set the
     shelf is a white storefront — the shortlist as a shop window, with the
     bag and the till inside it — under /ecommerce/shop on its own, and since
     6 Sep drawn in place under its tab on the floor. Where it is not set the
     tab is a window with the room's door in it, which is the honest answer
     for a shelf whose shop does not exist: a shop needs an adapter of its
     own, and a tab that drew a room as if it were one would be inventing it. */
  shop?: string;
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
   * AND IT OPENS NOTHING. Its tab says "Soon" and the pane under it says
   * "Coming soon" with no door in it (`RoomPane`, store/Floor.tsx) — a
   * coming-soon shelf that opens something is the 10 Aug mistake in
   * miniature, which is the reason this whole district was deleted once.
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
  { hub: 'beauty', path: '/beauty/routine', reads: { name: 'Skin & Hair Profile', path: '/beauty/profile' }, shop: 'beauty' },
  { hub: 'fitness', path: '/fitness/supplements', reads: { name: 'Training Profile', path: '/fitness/profile' }, shop: 'supplements' },
  /* ── THE GROCERY LIST BECAME A GROCERY STORE (owner, 8 Sep) ──────────────
     "Instead of grocery list create a grocery store with vegetables, food
     items, household items etc."

     For two weeks this shelf was a DOWNLOAD, and the note here said why: a
     list of ingredients with no prices on it and no order endpoint behind it,
     so a storefront would have been a till the city did not have. That was
     true of the NUTRITION hub's list and it is still true of it — nothing has
     changed on /nutrition/grocery, which still prints and still downloads.

     What changed is that the shelf is somebody else's now. Every row on it was
     typed by a local grocer, supermarket, sabzi market, bakery, butcher or
     fish shop into their own menu, at their own price, behind their own
     sold-out switch — and every one of those trades already has a cart, a
     wallet payment and an order counter on its own page. So the shelf is real
     stock at real prices, and it opens the shop rather than a till of its own.

     IT READS WHERE YOU LIVE RATHER THAN WHAT YOU EAT, and that is a `reads`
     entry like any other: this floor's promise is "only what's right for you",
     and for groceries what is right for you is your own city's shops instead
     of a national catalogue. */
  { hub: 'services', path: '/services/grocery', reads: { name: 'city', path: '/profile' }, shop: 'grocery' },
  { hub: 'astrology', path: '/astrology/gemstones', reads: { name: 'Astrology Profile', path: '/profile/astrology' }, shop: 'gemstones' },
  /* AND THIS ONE IS CALLED "PETS" RATHER THAN "DIET PLAN" (owner, 23 Aug).
     The room is called Diet plan and stays called that — inside the Pets rail
     it is one of six rooms and the name says which. On a shelf of five cards
     it was the only one naming a FUNCTION where the other four name what is
     being sold, so it read as the odd card rather than as the pet shelf. */
  { hub: 'pets', path: '/pets/plan', category: 'Pets', reads: { name: 'Pet profiles', path: '/pets/profiles' } },
  /* COSTUME JEWELLERY, AND IT READS NOTHING YET. It is on this floor rather
     than the market's because the owner put it here, and the floor's promise
     survives it: the shelves here answer a profile, and the profile this one
     will answer is the same style record the beauty rooms already keep. No
     `reads` until that is wired, because naming a profile a shelf does not
     consult would be inventing the shortlist rather than the shop. */
  { soon: { name: 'Costume Jewellery' } },
];

/** Shelves you walk yourself, filed under the aisle they belong to. */
export const OPEN: Shelf[] = [
  { hub: 'beauty', path: '/beauty/market', category: 'Skin & hair', shop: 'skin-hair' },
  { hub: 'fitness', path: '/fitness/store', category: 'Supplements', shop: 'supplements' },
  { hub: 'pets', path: '/pets/shop', category: 'Pets', shop: 'pets' },
  /* The gemstone bench is on both floors, and it is the only shelf that is.
     It is a marketplace you can browse by stone, and it is also the one place
     in the city where a stone is PRESCRIBED from a chart — so leaving it off
     either floor would be leaving out half of what it does. Since 22 Aug the
     two floors open two different rooms, which is what "both floors" was always
     supposed to mean: the counter here, the chart's own five over there. */
  { hub: 'astrology', path: '/astrology/gemstones', category: 'Gemstones', shop: 'gemstones' },
  /* ── ELECTRONICS (owner, 8 Sep: "add the electronics store here") ───────
     On THIS floor and not the other one, which was the owner's own answer when
     asked: nothing here is ranked, and nothing about this shelf could be. The
     Personalized Store's promise is a shortlist read off a profile, and there
     is no electronics profile in the city to read — a fit score with nothing
     behind it is a number a citizen would believe. So it stands in the market,
     where the promise is the whole shelf and no order to it.

     Its stock is the Local Market's, like the grocery shelf's: the rows
     electronics stores and mobile shops published themselves. */
  { hub: 'services', path: '/services/electronics', category: 'Electronics', shop: 'electronics' },
  { hub: 'services', path: '/services/offers', category: 'Deals & offers' },
  /* THE JEWELLERY AISLE — the plain shelf, not the bench. It stands beside
     Gemstones and it is not the same shop: a stone at the bench is prescribed
     off a chart and priced by the carat, and this is a shelf somebody walks.
     Filed under its own aisle for that reason rather than folded into
     Gemstones, where it would be sorted by a chart nobody consulted. */
  { category: 'Jewellery', soon: { name: 'Jewellery' } },
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
/**
 * THREE OF THE FOUR SHOPS ARE HERE, AND THE FOURTH IS ABSENT ON PURPOSE. A
 * storefront earns a pair of routes because it has a BAG — a shelf screen and
 * a bag screen. The grocery store has no bag: each grocer takes their own
 * order on their own page, so there is no second screen to give a route to.
 * Its `screens` point at the room it lives in (Local Market → Grocery Store),
 * which is the same shelf under that hub's rail.
 */
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

/**
 * ── A SHELF AS A TAB (owner, 6 Sep) ─────────────────────────────────────────
 *
 * Both floors are one storefront each with the shelves as a row of tabs on
 * top. The word on the tab is the shelf's aisle where it has one and the
 * room's own name otherwise — the same rule the cards followed. The key is
 * the shop's key when the shelf has a shop, so `?tab=beauty` and
 * `/ecommerce/shop/beauty` are one word for one thing, and the slug of the
 * label otherwise. It lives here rather than in the floor's own file because
 * it is a fact about a shelf, and because a file that draws components is
 * not a file to export a function from.
 */
export interface FloorTab {
  key: string;
  label: string;
  shelf: ShelfCard;
}

export function tabOf(shelf: ShelfCard): FloorTab {
  const label = shelf.category ?? shelf.name;
  const key = shelf.shop ?? label.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { key, label, shelf };
}

export const fittedShelves = (): ShelfCard[] => FITTED.map(resolve).filter((c): c is ShelfCard => c !== null);
export const openShelves = (): ShelfCard[] => OPEN.map(resolve).filter((c): c is ShelfCard => c !== null);
