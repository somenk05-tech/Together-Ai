import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';
import { FITTED, SHOPS } from '@/features/ecommerce/shelves';

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

describe('The Personalized Store card is one target', () => {
  const store = code('features/ecommerce/pages/PersonalizedStore.tsx');

  it('is a single link, with nothing clickable inside it', () => {
    // Owner, 22 Aug: make the whole card clickable. A second link inside the
    // card is a target inside a target — on a phone they are millimetres apart
    // and the small one wins by accident.
    expect(store.match(/<Link/g)?.length).toBe(1);
  });

  it('sends the beauty shelf to its shop rather than to the hub', () => {
    expect(FITTED.find((s) => s.path === '/beauty/routine')?.shop).toBe('beauty');
    expect(SHOPS.beauty.shelf.path).toBe('/ecommerce/shop/beauty');
    expect(store).toMatch(/SHOPS\[s\.shop\]\?\.shelf\.path/);
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

  it('still names the profile each shelf reads', () => {
    // It moved off the card and into the shop's masthead — dropped from the
    // card, not dropped from the product.
    expect(store).toMatch(/Reads your \{s\.reads\.name\}/);
    expect(code('features/ecommerce/store/StoreFront.tsx')).toMatch(/Built from your \{shop\.from\.label\}/);
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

  it('is the third tab of the district', () => {
    expect(HUBS.ecommerce.items.map((i) => i.path))
      .toEqual(['/ecommerce/store', '/ecommerce/market', '/ecommerce/cart']);
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
    expect(cart).toMatch(/gemCheckout\.mutateAsync/);
    expect(cart).toMatch(/ok: false/);
    expect(page).toMatch(/cart\.outcomes\.map/);
  });

  it('offers the wallet only, because that is what every till takes', () => {
    // POST /fitness/store/orders charges the city wallet whatever method it is
    // handed, so a card option here would be kept for two thirds of a total.
    expect(page).toMatch(/walletOnly/);
  });
});

describe('Three shelves have shops, and one deliberately does not', () => {
  it('gives supplements and gemstones a storefront each', () => {
    for (const key of ['beauty', 'supplements', 'gemstones']) {
      expect({ key, shelf: SHOPS[key]?.shelf.path }).toEqual({ key, shelf: `/ecommerce/shop/${key}` });
      expect({ key, bag: SHOPS[key]?.bag.path }).toEqual({ key, bag: `/ecommerce/shop/${key}/bag` });
    }
    expect(FITTED.filter((s) => s.shop).map((s) => s.shop).sort())
      .toEqual(['beauty', 'gemstones', 'supplements']);
  });

  /**
   * AND THE GROCERY LIST IS HANDED OVER RATHER THAN LINKED TO (owner, 22 Aug):
   * "add just the list separately as a download card instead of sending to the
   * grocery hub". It is the one shelf that cannot become a shop — no prices, no
   * order endpoint — so the card does the thing somebody on their way out
   * actually wants: it gives them the list.
   */
  it('hands the grocery list over instead of opening a room', () => {
    const shelf = FITTED.find((s) => s.path === '/nutrition/grocery');
    expect({ shop: shelf?.shop, download: shelf?.download }).toEqual({ shop: undefined, download: true });
    const store = code('features/ecommerce/pages/PersonalizedStore.tsx');
    expect(store).toMatch(/s\.download \? \(/);
    expect(store).toMatch(/<GroceryDownloadCard/);
  });

  it('writes the file from the plan the hub prints, and recomputes nothing', () => {
    const card = code('features/ecommerce/store/GroceryDownloadCard.tsx');
    expect(card).toMatch(/useGroceryPlan/);
    // The quantities are the server's own labels, printed, never arithmetic
    // done again here.
    const list = code('features/ecommerce/store/groceryList.ts');
    expect(list).toMatch(/item\.qtyLabel/);
    expect(list).not.toMatch(/[*/]\s*\d|Math\./);
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
