import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
