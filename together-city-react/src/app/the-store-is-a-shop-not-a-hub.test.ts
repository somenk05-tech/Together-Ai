import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';
import { AISLES, FITTED, OPEN, SHOPS, shelfName } from '@/features/ecommerce/shelves';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE STORE IS A SHOP, NOT A ROOM IN A HUB.
 *
 * Owner, 22 Aug, looking at the live Personalized Store: open a shelf and land
 * in a shop — white, no rail, one way back — showing the shortlist and nothing
 * else. Explicitly NOT the Beauty Market's own room with different copy on it.
 *
 * Three things can quietly undo that and each has an assertion here. The pages
 * could be registered under a HubLayout, which puts the rail back and cannot be
 * opted out of. They could forget `useHubTheme(null)`, in which case the store
 * wears whichever district you walked in from — plum from Beauty, a night sky
 * from Astrology — because `data-hub` is only ever replaced, never cleared. And
 * the shelf could grow a bag of its own, which is the two-bags bug
 * `one-bag.test.ts` was written against, rebuilt one floor up.
 */
describe('The storefront is white, railless, and has one way back', () => {
  const router = code('app/router.tsx');
  const front = code('features/ecommerce/store/StoreFront.tsx');
  const bagPage = code('features/ecommerce/store/StoreBagPage.tsx');
  const page = code('features/ecommerce/pages/BeautyShop.tsx');

  it('routes both screens', () => {
    expect(router).toMatch(/path: '\/ecommerce\/shop\/beauty'/);
    expect(router).toMatch(/path: '\/ecommerce\/shop\/beauty\/bag'/);
  });

  it('registers them outside every HubLayout block', () => {
    /* The AppShell block is the first in ROUTE_BLOCKS and every HubLayout block
       follows it, so a store route declared after the first `HubLayout hub=` is
       a store route inside a hub — with the rail this whole screen exists to
       be rid of. */
    const firstHubLayout = router.indexOf('<HubLayout hub=');
    expect(firstHubLayout).toBeGreaterThan(0);
    expect(router.indexOf("path: '/ecommerce/shop/beauty'")).toBeLessThan(firstHubLayout);
    /* AND THE TWO FLOORS WITH THEM (owner, 6 Sep): the Personalized Store and
       the Open Market are storefronts now, with the shelves as tabs on top,
       and a storefront wears no rail. AND THE CART (7 Sep): one checkout for
       every sector, in the same look — so the district has no HubLayout
       block at all, and its door opens straight onto the store. */
    expect(router.indexOf("path: '/ecommerce/store'")).toBeLessThan(firstHubLayout);
    expect(router.indexOf("path: '/ecommerce/market'")).toBeLessThan(firstHubLayout);
    expect(router.indexOf("path: '/ecommerce/cart'")).toBeLessThan(firstHubLayout);
    expect(router).not.toMatch(/HubLayout hub=\{HUBS\.ecommerce\}/);
    expect(router).toMatch(/path: '\/ecommerce', element: <Navigate to="\/ecommerce\/store" replace \/>/);
    expect(existsSync(join(SRC, 'features/ecommerce/routes.tsx'))).toBe(false);
  });

  it('clears the district lamp on the way in', () => {
    expect(page).toMatch(/useHubTheme\(null\)/);
    // Both screens, not one: arriving at the bag straight from a bookmark is
    // the same problem as arriving at the shelf.
    expect(page.match(/useHubTheme\(null\)/g)?.length).toBe(2);
  });

  it('draws no rail and no breadcrumb', () => {
    for (const src of [front, bagPage, page]) {
      expect(src).not.toMatch(/HubLayout|Sidebar|Breadcrumbs/);
    }
  });

  /**
   * THE SAME BAG AND THE SAME TILL AS THE HUB. A shop with a bag of its own
   * would let a citizen fill two and pay for one. The adapter reaches for the
   * beauty hub's server-held bag and its order mutation; the checkout screen
   * opens the city's one payment sheet rather than a second one.
   */
  it('shares the city’s bag and the city’s till', () => {
    const shop = code('features/ecommerce/store/useBeautyShop.ts');
    expect(shop).toMatch(/useBagActions/);
    expect(shop).toMatch(/usePlaceBeautyOrder/);
    expect(bagPage).toMatch(/from '@\/features\/financial\/PaymentSheet'/);
    // No second price arithmetic: the line total is the only sum this screen
    // does, and every other number is quoted from the shelf.
    expect(bagPage.match(/priceInr \*/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  /**
   * AND IT ADDS NOTHING TO THE SIZE DEBT. `size-system-ceiling.mjs` is at its
   * ceiling on all four counts, so the ceiling script would fail on a single
   * `style={{ }}` added here. This says the same thing at the file that would
   * do it, so the reason lands next to the code rather than in a script.
   */
  it('carries no inline style object', () => {
    for (const src of [front, bagPage, page]) expect(src).not.toMatch(/style=\{\{/);
  });
});

describe('The Personalized Store is a floor of the store', () => {
  const store = code('features/ecommerce/pages/PersonalizedStore.tsx');

  it('draws no target of its own — the tabs are the floor’s and the tiles are the shop’s', () => {
    /* Owner, 22 Aug: make the whole card clickable, and nothing clickable
       inside it. Then, 6 Sep: no card at all — the page is a storefront with
       the shelves as tabs on top. The page still draws no target of its own:
       the tab row is `FloorTabs`, one link per shelf, and the shop under it
       is `StoreFront`, exactly as it was. */
    expect(store).not.toMatch(/<Link|<a\b|<button/);
    expect(store).toMatch(/<TabbedFloor/);
    const tabs = code('features/ecommerce/store/Floor.tsx');
    expect(tabs).toMatch(/to=\{`\?tab=\$\{t\.key\}`\}/);
  });

  /**
   * ── THE ROOM HAS ONE NAME ─────────────────────────────────────────────────
   *
   * Owner, 22 Aug: "Your Routine" → "Your Beauty Routine". The name was
   * unambiguous in the Beauty rail and ambiguous on the E-Commerce floor, where
   * it stood beside Supplements, Gemstones and Diet plan.
   *
   * It was renamed at the config rather than overridden on the card, and this
   * is the assertion that keeps it that way: the shop's masthead LOOKS THE NAME
   * UP instead of carrying its own copy. It carried one until this change, and
   * the rename is exactly the event that would have made the rail and the shop
   * it opens disagree.
   */
  it('takes the shop’s own title from the room it opens', () => {
    const shop = code('features/ecommerce/store/useBeautyShop.ts');
    expect(shop).toMatch(/title: shelfName\('beauty', '\/beauty\/routine'\)/);
    expect(shop).not.toMatch(/title: '/);
    const named = shelfName('beauty', '/beauty/routine');
    expect(named).toBe(HUBS.beauty.items.find((i) => i.path === '/beauty/routine')?.label);
    expect(named.length).toBeGreaterThan(0);
  });

  it('opens the beauty shelf as its shop rather than as the hub’s room', () => {
    expect(FITTED.find((s) => s.path === '/beauty/routine')?.shop).toBe('beauty');
    expect(SHOPS.beauty.shelf.path).toBe('/ecommerce/shop/beauty');
    /* The tab draws the shop in place (6 Sep) — the same adapter the
       standalone storefront uses, keyed by the shelf's `shop`. */
    expect(store).toMatch(/shopOf=\{\{ beauty: useBeautyShop/);
    const floor = code('features/ecommerce/store/TabbedFloor.tsx');
    expect(floor).toMatch(/const useShop = shelf\.shop \? shopOf\[shelf\.shop\] : undefined/);
    expect(floor).toMatch(/<StoreFront shop=\{shop\} floor=\{floor\} \/>/);
  });

  /**
   * AND THE PATHS ARE LITERALS WHERE THE AUDIT CAN SEE THEM. Both screens are
   * reached through data — `to={shop.screens.bag}` — which a regex cannot
   * follow, and nav-audit's sixth check reported them as routes nobody can
   * reach. The answer was to make the reference visible rather than to add two
   * live shops to the list of doors that are hidden on purpose.
   */
  it('keeps both screens visible to the reachability audit', () => {
    const shelves = read('features/ecommerce/shelves.ts');
    for (const p of ['/ecommerce/shop/beauty', '/ecommerce/shop/beauty/bag']) {
      expect({ path: p, literal: shelves.includes(`path: '${p}'`) })
        .toEqual({ path: p, literal: true });
    }
  });

  it('still names the profile each shelf reads, in the shop', () => {
    /* "Reads your Skin & Hair Profile" was the card's foot until the tile
       became a photograph with the heading and nothing else on it (owner,
       22 Aug), and the tile became a tab (6 Sep). It is not gone: the
       storefront prints "Built from your Skin & Hair Profile" under its
       masthead AND links to it, which is both more than the card said and
       said where somebody looking at a shortlist is actually standing. This
       asserts the move rather than the deletion — off the card, on the shop. */
    expect(store).not.toMatch(/Reads your/);
    const front = code('features/ecommerce/store/StoreFront.tsx');
    expect(front).toMatch(/Built from your \{shop\.from\.label\}/);
    expect(front).toMatch(/to=\{shop\.from\.path\}/);
  });
});

/**
 * ── ONE CART, THREE TILLS ───────────────────────────────────────────────────
 *
 * Owner, 22 Aug: stores for the other shelves, "a global cart system where
 * people can add products from multiple places and order once", and — asked
 * directly — "keep individual carts and also a cross-hub cart in e-commerce".
 *
 * The dangerous reading of that is a fourth bag that mirrors the other three.
 * It is not one: the cart is a VIEW over the bags the hubs already hold, which
 * is why something added in the Beauty Market shows up in it. These assertions
 * are what stop a copy appearing later, and what stop the two carts that have
 * no till behind them being listed above a Pay button.
 */
describe('The city cart is a view, not a fourth bag', () => {
  const cart = code('features/ecommerce/store/useCityCart.ts');
  const page = code('features/ecommerce/pages/CityCart.tsx');

  it('is the third room of the district, and the orders are the fourth', () => {
    expect(HUBS.ecommerce.items.map((i) => i.path))
      .toEqual(['/ecommerce/store', '/ecommerce/market', '/ecommerce/cart', '/ecommerce/orders']);
  });

  it('reads the hubs’ own bags rather than keeping one', () => {
    for (const hook of ['useBagActions', 'useBag', 'useGemCart']) expect(cart).toMatch(hook);
    // No store of its own, and no persistence of its own: a cart written down
    // here would be a second answer to "what is in my cart".
    expect(cart).not.toMatch(/localStorage|sessionStorage|create\(/);
  });

  it('lists no shop it cannot charge', () => {
    // The grocery list has no prices and no order endpoint; the pet cart lives
    // in the browser with no till at all. A line in a cart under a Pay button
    // is a promise to charge for it.
    expect(cart).not.toMatch(/nutrition\/grocery|features\/pets/);
  });

  it('places one order per shop, in a row, and reports each by name', () => {
    // Sequential because three charges fired at once against one wallet
    // balance is three reads of the same number.
    expect(cart).toMatch(/for \(const section of sections\)/);
    expect(cart).toMatch(/beautyPlace\.mutateAsync/);
    expect(cart).toMatch(/fitPlace\.mutateAsync/);
    // Gemstones are quoted, not charged (owner, 5 Sep).
    expect(cart).toMatch(/gemQuote\.mutateAsync/);
    expect(cart).toMatch(/ok: false/);
    expect(page).toMatch(/cart\.outcomes\.map/);
  });

  it('offers the wallet only, because that is what every till takes', () => {
    // POST /fitness/store/orders charges the city wallet whatever method it is
    // handed, so a card option here would be kept for two thirds of a total.
    expect(page).toMatch(/walletOnly/);
  });

  /**
   * ── AND IT IS THE STORE'S ONE CHECKOUT (owner, 7 Sep) ─────────────────────
   *
   * "The checkout needs to be common for all sectors." Every tab of both
   * sections carries the city cart on its bar and, when there is anything in
   * it, one checkout bar at the foot — both going here. No shop's own bag is
   * drawn on a floor, so nothing can be counted twice or paid for twice.
   */
  it('is the one checkout every floor points at', () => {
    const floorFile = code('features/ecommerce/store/Floor.tsx');
    const tabbed = code('features/ecommerce/store/TabbedFloor.tsx');
    const front = code('features/ecommerce/store/StoreFront.tsx');
    expect(tabbed).toMatch(/const cart = useCityCart\(\);/);
    expect(floorFile).toMatch(/<Link to=\{CART\.path\} className="st-bar-bag"/);
    expect(floorFile).toMatch(/\{baglet && floor\.cart\.count > 0 && \(/);
    expect(floorFile).toMatch(/<Link to=\{CART\.path\} className="st-cta">Checkout<\/Link>/);
    // The shop's own baglet is drawn only off a floor.
    expect(front).toMatch(/\{!floor && bag && bag\.count > 0 && \(/);
    // And the cart page wears the same floor, with no second checkout bar.
    expect(page).toMatch(/<FloorPage floor=\{floor\} baglet=\{false\}>/);
    expect(page).toMatch(/useHubTheme\(null\)/);
    expect(page).not.toMatch(/PageHeader/);
  });
});

describe('Three shelves have shops, and one deliberately does not', () => {
  it('gives supplements and gemstones a storefront each', () => {
    for (const key of ['beauty', 'supplements', 'gemstones']) {
      expect({ key, shelf: SHOPS[key]?.shelf.path }).toEqual({ key, shelf: `/ecommerce/shop/${key}` });
      expect({ key, bag: SHOPS[key]?.bag.path }).toEqual({ key, bag: `/ecommerce/shop/${key}/bag` });
    }
    /* Grocery left this floor on 9 Sep — see the Open Market block below for
       why. Three shelves here read a profile; the fourth read a city, which is
       where a shop is rather than a shortlist of one. */
    expect(FITTED.filter((s) => s.shop).map((s) => s.shop).sort())
      .toEqual(['beauty', 'gemstones', 'supplements']);
  });

  /**
   * ── THE GROCERY LIST BECAME A GROCERY STORE (owner, 8 Sep), AND THEN IT
   *    CHANGED FLOORS (owner, 9 Sep) ────────────────────────────────────────
   *
   * "Instead of grocery list create a grocery store with vegetables, food
   * items, household items etc." — then "move the grocery store from
   * personalized to open market."
   *
   * The tab was a DOWNLOAD for two weeks, and the note that stood here said
   * why: the nutrition hub's list has no prices on it and no order endpoint
   * behind it, so a storefront would have been a till the city did not have.
   * All of that is still true of /nutrition/grocery, which still prints and
   * still downloads — which is the half of this assertion that has not moved.
   *
   * The shelf itself is on the market floor now; this checks it left cleanly
   * rather than being copied, because a shelf on both floors is two rooms that
   * disagree the first time either is edited (the gemstone bench is the one
   * deliberate exception, and it opens two DIFFERENT rooms).
   */
  it('opens the local grocers’ shelf rather than the nutrition list, on the market floor', () => {
    expect(FITTED.find((s) => s.path === '/nutrition/grocery')).toBeUndefined();
    expect(FITTED.find((s) => s.shop === 'grocery')).toBeUndefined();
    const shelf = OPEN.find((s) => s.shop === 'grocery');
    expect({ hub: shelf?.hub, path: shelf?.path }).toEqual({ hub: 'services', path: '/services/grocery' });
    expect(shelf?.category).toBe('Grocery');
    // Nothing on that floor is ranked, so nothing on this shelf claims to be.
    expect(shelf?.reads).toBeUndefined();
  });

  /**
   * AND IT IS THE ONE SHOP WITH NO BAG, WHICH IS THE HONEST SHAPE OF IT. A bag
   * here would be a bag across eight different shops, and paying it would be
   * eight orders and eight delivery vans. Each grocer already takes a real
   * cart and a real wallet payment on their own page, so every tile is that
   * shop's door — the gem counter's `design` mechanism, for the same reason.
   */
  it('takes no money of its own, and every tile is a shop’s own door', () => {
    /* THE TILE IS THE SHOP NOW (owner, 9 Sep: "just show the shop name first
       and when clicked we see the entire menu and catalogue"). It used to be
       every row of every grocer on one wall, each tile carrying that shop's
       name in small type and a button to that shop's page. The button was
       always the honest part — an order is one shop, one basket, one delivery
       — so it became the whole tile. */
    const grocery = code('features/ecommerce/store/useGroceryShop.ts');
    expect(grocery).toMatch(/bag: null/);
    expect(grocery).toMatch(/design: \{ label: 'Open the shop', path: `\/services\/\$\{shop\.slug \?\? shop\.id\}` \}/);
    // No storefront routes: a pair of routes is what a shop with a BAG earns.
    expect(SHOPS.grocery).toBeUndefined();
  });

  /**
   * ── AND THE SHELF IS UPDATED BY LOCAL SERVICES DATA (owner, 8 Sep) ────────
   *
   * "This grocery store needs to be updated by local services data."
   *
   * Two halves, and the second is the one that rots quietly. The shelf must
   * CARRY what the directory knows about a shop — verified, open, rated, how
   * far — from the directory's own reads rather than a second opinion. And it
   * must be TOLD when that changes: the grocery shelf is a second reader of
   * every menu, so a reprice or a sold-out flip has to reach it, or the same
   * edit leaves two screens disagreeing until a cache goes stale on its own.
   */
  it('carries the directory’s own facts about the shop behind each price', () => {
    const grocery = code('features/ecommerce/store/useGroceryShop.ts');
    for (const fact of [/shop\.trust\?\.label/, /shop\.rating/, /shop\.distanceKm/, /openStateNow/]) {
      expect(grocery).toMatch(fact);
    }
    // The clock is the reader's, not the server's — one `new Date()` for the
    // whole shelf, so two tiles about one shop cannot straddle a minute.
    expect(grocery).toMatch(/const now = new Date\(\);/);
    expect(grocery.match(/new Date\(\)/g)?.length).toBe(1);
    // Hours arrive unjudged: no hours is silence, never "Closed".
    expect(grocery).toMatch(/state\.open === false/);
  });

  it('is refreshed by the two mutations that change what is on it', () => {
    const api = code('features/services/api.ts');
    // saveMenu and patchMenuItem — a reprice and the sold-out switch, which
    // the schema promises is "honoured everywhere the same minute".
    const hits = api.match(/queryKey: \['services', 'grocery'\]/g) ?? [];
    expect(hits.length).toBe(2);
  });

  /**
   * AND IT PRICES NOTHING THE SHOPKEEPER DID NOT PRICE. `ServiceMenuItem`
   * makes `priceInr` nullable so a vegetable whose price moves with the market
   * can say "seasonal"; turning that into ₹0 on a tile is the one answer that
   * would be a lie.
   */
  it('never prints ₹0 in a price slot that has no price behind it', () => {
    /* The shelf's tiles are shops, and a shop has no price — so the slot
       carries the one number that decides whether a door is worth opening,
       through the same `priceLabel` the unpriced vegetable used. The shell
       still prefers the shelf's word to a number it would have made up. */
    const grocery = code('features/ecommerce/store/useGroceryShop.ts');
    expect(grocery).toMatch(/priceInr: 0,/);
    expect(grocery).toMatch(/priceLabel: `\$\{shop\.itemCount\} item/);
    const front = code('features/ecommerce/store/StoreFront.tsx');
    expect(front).toMatch(/item\.priceLabel \?\? rupees\(item\.priceInr\)/);
  });

  it('sells no gemstone from the shelf, because a stone has no price until it is designed', () => {
    const gems = code('features/ecommerce/store/useGemShop.ts');
    expect(gems).toMatch(/design: \{ label: 'Design & lock'/);
    // The bench takes commissions, not quantities: one of a kind, so Remove
    // rather than a ± that cannot be honoured.
    expect(gems).toMatch(/fixedQty: true/);
  });

  it('keeps prescription items off the supplement shop', () => {
    const fit = code('features/ecommerce/store/useFitnessShop.ts');
    expect(fit).toMatch(/!p\.rx/);
    // And shows nothing at all when the shelf is not personalised — a general
    // list presented as yours is worse than no list.
    expect(fit).toMatch(/if \(!data\?\.personalised\) return \[\]/);
  });
});

/**
 * ── THE OPEN MARKET IS A SHOP, AND IT SHOWS EVERYTHING ──────────────────────
 *
 * Owner, 22 Aug: "create a separate store for open market where each category
 * has all the products for the user to see." Same shell as the shortlist shops,
 * opposite selection — and one thing that has to be got right, which is the
 * only reason these assertions exist.
 *
 * A VERDICT MUST NOT BECOME AN ABSENCE. `store.api.ts` is emphatic that a
 * missing `yours` badge means either "no opinion" or "we could not reach your
 * health data" and the two must never look alike. On a shortlist that cannot
 * bite — everything shown was chosen. On an open shelf it can: a product the
 * engine refused for this citizen, on a plain tile with an Add button, reads as
 * approval.
 */
describe('The Open Market aisles show the whole shelf', () => {
  const market = code('features/ecommerce/store/useMarketShops.ts');
  const front = code('features/ecommerce/store/StoreFront.tsx');

  /* THREE ON 22 AUG, FOUR BY THE EVENING: the gem counter joined them when the
     note that kept gemstones off this floor turned out to be wrong. It said "a
     stone is read off a chart, so 'all the gemstones' is the same list as
     'your gemstones'" — the chart names at most five and the catalogue holds
     thirty, so the prescription was being mistaken for the shelf. Daily offers
     is still not here and still should not be: it is not products. */
  it('gives four categories a storefront, and routes each', () => {
    const router = code('app/router.tsx');
    for (const key of ['skin-hair', 'supplements', 'pets', 'gemstones']) {
      expect({ key, shelf: AISLES[key]?.shelf.path }).toEqual({ key, shelf: `/ecommerce/market/${key}` });
      expect(router).toContain(`path: '/ecommerce/market/${key}'`);
    }
  });

  /* ── AND ONE AISLE'S SHELF IS A ROOM OF ANOTHER HUB (owner, 8 Sep) ────────
     "Add the electronics store here." Electronics has a tab and an adapter
     like the four above, and NO `/ecommerce/market/electronics` — because its
     shelf is the Local Market's Electronics Store, the same one room drawn
     under two doors, which is the arrangement the grocery store already uses
     on the other floor. A second copy of the shelf could disagree with the
     first the day either was edited.

     The list is asserted whole rather than by membership, so a shelf added to
     this floor without an adapter (a tab that opens nothing) fails here. */
  it('names every aisle that has an adapter, and roots the one with no market route', () => {
    const router = code('app/router.tsx');
    expect(OPEN.filter((s) => s.shop).map((s) => s.shop).sort())
      .toEqual(['electronics', 'gemstones', 'grocery', 'pets', 'skin-hair', 'supplements']);
    expect(AISLES.electronics).toBeUndefined();
    expect(router).not.toContain("path: '/ecommerce/market/electronics'");
    const shelf = OPEN.find((s) => s.shop === 'electronics');
    expect({ hub: shelf?.hub, path: shelf?.path }).toEqual({ hub: 'services', path: '/services/electronics' });
    expect(router).toContain("path: '/services/electronics'");
  });

  /* THE ELECTRONICS SHELF TAKES NO MONEY EITHER, and for the grocery shelf's
     reason: a bag across six shops would be six orders and six vans. */
  it('leaves the electronics shelf without a bag or a till', () => {
    const electronics = code('features/ecommerce/store/useElectronicsShop.ts');
    expect(electronics).toMatch(/bag: null/);
    expect(electronics).not.toMatch(/useMutation|checkout/i);
  });

  it('carries the engine verdict onto every supplement tile that has one', () => {
    expect(market).toMatch(/'not-recommended': 'Not for you'/);
    expect(market).toMatch(/tier: p\.yours \? VERDICT\[p\.yours\.bucket\] : undefined/);
    // And prescription rows are not on a self-service shelf at all.
    expect(market).toMatch(/!p\.rx/);
  });

  it('gives the pet aisle no till, because there is none behind it', () => {
    // The pet cart lives in the browser with no order endpoint. A shop that
    // takes an order it cannot place is worse than a shelf that says so.
    expect(market).toMatch(/design: \{ label: 'Open in Pets'/);
    expect(market).toMatch(/blocked: 'This aisle is for looking/);
  });

  it('groups a long shelf, and never invents the grouping', () => {
    // The chips filter on a field of the row — the beauty sheet's own group,
    // the fitness store's own aisles, the pet catalogue's own category.
    expect(front).toMatch(/shop\.groups && shop\.groups\.length > 1/);
    expect(market).toMatch(/group: p\.group/);
    expect(market).toMatch(/aisleOf\.get\(p\.supplement\)/);
  });

  it('sends the back button where the shop was opened from', () => {
    // It was hard-coded to the Personalized Store while that was the only
    // door. These are opened from the other one.
    expect(market).toMatch(/back: \{ path: '\/ecommerce\/market', label: 'Open Market' \}/);
    expect(code('features/ecommerce/store/useBeautyShop.ts'))
      .toMatch(/back: \{ path: '\/ecommerce\/store', label: 'Personalized Store' \}/);
  });
});

/**
 * ── AN EMPTY SHELF IS NOT A DEAD END ────────────────────────────────────────
 *
 * Owner, 23 Aug: "for the first time user add a link to take them to the
 * profile to complete and take them to the respective profiles for
 * personalization."
 *
 * Every personalised shelf already said the right thing when it was empty —
 * "Set a budget first", "Your birth details first", "Not matched to you yet" —
 * and every one of them was a wall. The citizen was told the single thing they
 * had to do and given nothing to press, on a screen whose whole reason for
 * existing is that it read something they filled in somewhere else.
 *
 * The two halves this holds:
 *
 *  1. THE DESTINATION IS PER-REASON. A beauty shelf with no budget goes to the
 *     routine, where a budget is set; the same shelf with no profile goes to
 *     the profile. One destination for both would be a button that is right
 *     half the time, which teaches somebody the button does not work.
 *  2. IT IS NOT OFFERED WHERE IT WOULD BE A LIE. An open-market aisle with
 *     nothing listed, and a gem counter that came back empty, are the city's
 *     problem rather than the citizen's — they say so and offer nothing.
 */
describe('an empty personalised shelf points at the thing that fills it', () => {
  const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

  it('renders the shelf’s own destination, and only when it has one', () => {
    const front = read('features/ecommerce/store/StoreFront.tsx');
    expect(front).toMatch(/action=\{shop\.emptyTo &&/);
    expect(front).toMatch(/to=\{shop\.emptyTo\.path\}/);
  });

  it('sends each reason where that reason is actually fixed', () => {
    const beauty = read('features/ecommerce/store/useBeautyShop.ts');
    // The budget is a routine screen; the profile is a profile screen.
    expect(beauty).toMatch(/needsBudget[\s\S]{0,160}path: '\/beauty\/routine'/);
    expect(beauty).toMatch(/path: '\/beauty\/profile'/);
    const gems = read('features/ecommerce/store/useGemShop.ts');
    expect(gems).toMatch(/needsProfile[\s\S]{0,140}path: '\/profile\/astrology'/);
    const fitness = read('features/ecommerce/store/useFitnessShop.ts');
    expect(fitness).toMatch(/personalised[\s\S]{0,180}path: '\/fitness\/profile'/);
  });

  it('offers nothing where the emptiness is the city’s fault, not the citizen’s', () => {
    // A market aisle with nothing on it, and a counter that came back empty:
    // there is no screen a citizen can open that changes either.
    expect(read('features/ecommerce/store/useMarketShops.ts')).not.toMatch(/emptyTo/);
    expect(read('features/ecommerce/store/useGemCounterShop.ts')).not.toMatch(/emptyTo/);
  });

  it('every destination it offers is a route that exists', () => {
    const files = ['app/router.tsx', ...readdirSync(join(SRC, 'features'))
      .map((f) => `features/${f}/routes.tsx`)
      .filter((f) => existsSync(join(SRC, f)))];
    const declared = new Set(files.flatMap((f) =>
      [...read(f).matchAll(/path: '([^']+)'/g)].map((m) => m[1])));
    const offered = ['useBeautyShop', 'useGemShop', 'useFitnessShop']
      .flatMap((h) => [...read(`features/ecommerce/store/${h}.ts`)
        .matchAll(/emptyTo:[\s\S]{0,400}?/g)].length
        ? [...read(`features/ecommerce/store/${h}.ts`).matchAll(/label: '[^']+', path: '([^']+)'/g)].map((m) => m[1])
        : []);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.filter((p) => !declared.has(p))).toEqual([]);
  });
});
