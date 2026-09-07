import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FITTED, OPEN, fittedShelves, openShelves, tabOf } from '@/features/ecommerce/shelves';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(SRC, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE STORE HAS ITS SHELVES AS TABS ON TOP ────────────────────────────────
 *
 * Owner, 6 Sep: "remove the image and just create a Shopify store for both
 * pages with category tabs on top in a sleek manner."
 *
 * The Personalized Store and the Open Market were a grid of photographs each,
 * one per shelf, every card a door to a white storefront somewhere else. They
 * are the storefront now: one white page, the store's bar, the shelves as a
 * row of tabs under it, and the shelf you chose drawn underneath by the same
 * `StoreFront` those doors used to open.
 *
 * Four things can quietly undo that. A page could grow a card again, or a
 * picture. The tab row could be state rather than a URL, and forget the
 * shelf on the way back from the bag. A tab could open a shop through
 * something other than the adapter that always opened it. And the floor
 * could end up back under the district's rail. Each has an assertion here.
 */
describe('both floors are one storefront with tabs on top', () => {
  const store = code('features/ecommerce/pages/PersonalizedStore.tsx');
  const market = code('features/ecommerce/pages/OpenMarket.tsx');

  it('draws no card and no picture — the page is the floor', () => {
    for (const [page, src] of [['store', store], ['market', market]] as const) {
      expect({ page, floor: /<TabbedFloor/.test(src) }).toEqual({ page, floor: true });
      expect({ page, card: /ShelfTile|ec-card|<img|PageHeader|ec-run/.test(src) }).toEqual({ page, card: false });
      // White from every direction, like every storefront in the city.
      expect({ page, white: /useHubTheme\(null\)/.test(src) }).toEqual({ page, white: true });
    }
    expect(existsSync(join(SRC, 'features/ecommerce/ShelfTile.tsx'))).toBe(false);
    /* THE PICTURES ARE GONE FROM THE SHELF AND FROM THE DISK. A shelf with no
       `art` cannot name a file, and a file nobody names is 60 KB the walk
       still pays for. */
    for (const s of [...FITTED, ...OPEN]) expect(s).not.toHaveProperty('art');
    const left = readdirSync(join(APP, 'public/assets/img')).filter((f) => f.startsWith('ec-'));
    expect(left).toEqual([]);
  });

  it('names each tab from the shelf, and keys a shop’s tab by its shop', () => {
    /* The label is the shelf's aisle where it has one and the room's own name
       otherwise — read out of the sidebar, never typed here — and the key is
       the shop's key when there is a shop, so `?tab=supplements` and
       `/ecommerce/shop/supplements` are one word for one thing. */
    for (const shelf of [...fittedShelves(), ...openShelves()]) {
      const tab = tabOf(shelf);
      expect(tab.label).toBe(shelf.category ?? shelf.name);
      if (shelf.shop) expect(tab.key).toBe(shelf.shop);
      expect(tab.key).toMatch(/^[a-z0-9-]+$/);
    }
    // No two tabs on a floor answer to one key.
    for (const floor of [fittedShelves(), openShelves()]) {
      const keys = floor.map((s) => tabOf(s).key);
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(fittedShelves().map((s) => tabOf(s).key)).toContain('beauty');
    expect(openShelves().map((s) => tabOf(s).key)).toEqual(expect.arrayContaining(['skin-hair', 'supplements', 'pets', 'gemstones']));
  });

  it('keeps the open tab in the URL, and falls back to the first shelf', () => {
    const floor = code('features/ecommerce/store/TabbedFloor.tsx');
    expect(floor).toMatch(/useSearchParams/);
    expect(floor).toMatch(/const active = tabs\.find\(\(t\) => t\.key === wanted\) \?\? tabs\[0\]/);
    const tabs = code('features/ecommerce/store/Floor.tsx');
    expect(tabs).toMatch(/<nav className="sf-tabs" aria-label="Categories">/);
    expect(tabs).toMatch(/to=\{`\?tab=\$\{t\.key\}`\}/);
    expect(tabs).toMatch(/aria-current=\{t\.key === active \? 'page' : undefined\}/);
  });

  it('opens a shelf’s shop through the adapter that always opened it, one at a time', () => {
    const floor = code('features/ecommerce/store/TabbedFloor.tsx');
    // The pane is the component, so a change of tab is a fresh mount and no
    // instance ever swaps one hook for another.
    expect(floor).toMatch(/<ShopPane key=\{active\.key\} useShop=\{useShop\} floor=\{floor\} \/>/);
    expect(floor).toMatch(/<StoreFront shop=\{shop\} floor=\{floor\} \/>/);
    expect(store).toMatch(/shopOf=\{\{ beauty: useBeautyShop, supplements: useFitnessShop, gemstones: useGemShop \}\}/);
    expect(market).toMatch(/'skin-hair': useBeautyMarketShop, supplements: useSupplementsMarketShop, pets: usePetMarketShop, gemstones: useGemCounterShop/);
    // And the storefront wears the floor: the floor's bar and tabs on top,
    // this shop's bag on the bar, in every one of its three states.
    const front = code('features/ecommerce/store/StoreFront.tsx');
    expect(front).toMatch(/<FloorPage floor=\{floor\}>\{children\}<\/FloorPage>/);
    expect(front.match(/frame\(/g)?.length).toBe(3);
  });

  it('gives a tab with no shelf behind it a window, with a door only where there is a room', () => {
    const pane = code('features/ecommerce/store/Floor.tsx');
    expect(pane).toMatch(/<Link className="btn btn-accent" to=\{shelf\.path\}>Open in \{shelf\.hubName\}<\/Link>/);
    expect(pane).toMatch(/shelf\.soon \? \(\s*<p className="sf-room-state">Coming soon<\/p>/);
    // A soon shelf has no path, so the door branch cannot be reached for it.
    for (const s of [...FITTED, ...OPEN]) if (s.soon) expect(s.path).toBeUndefined();
  });

  it('is sticky at the top and scrolls sideways on a phone, in the store’s own type', () => {
    const css = read('styles/layout.css');
    const top = css.slice(css.indexOf('.sf-top {'), css.indexOf('.sf-sections {'));
    expect(top).toMatch(/position: sticky/);
    /* THE TWO SECTIONS ON THE BAR (owner, 7 Sep): "personalized store and then
       open market, all digital store in the same look." One switch, both
       rooms, the one that is on lit like an aisle chip. */
    const floorFile = code('features/ecommerce/store/Floor.tsx');
    expect(floorFile).toMatch(/const \[STORE, MARKET, CART, ORDERS\] = HUBS\.ecommerce\.items;/);
    expect(floorFile).toMatch(/\{\[STORE, MARKET\]\.map\(\(room\) => \(/);
    expect(floorFile).toMatch(/className=\{`sf-section\$\{room\.path === floor\.path \? ' on' : ''\}`\}/);
    expect(css).toMatch(/\.sf-section\.on \{[^}]*background: var\(--ink\)/);
    const tabs = css.slice(css.indexOf('.sf-tabs {'), css.indexOf('.sf-tabs-in {'));
    expect(tabs).toMatch(/overflow-x: auto/);
    expect(css).toMatch(/\.sf-tab\.on \{[^}]*border-bottom-color: var\(--ink\)/);
    /* No new number in the size system: every font size, tracking and
       line-height in the block is one the stylesheet already used. */
    const block = css.slice(css.indexOf('.sf-top {'), css.indexOf('.sf-room-act {'));
    const rest = css.replace(block, '');
    for (const m of block.matchAll(/(font-size|letter-spacing|line-height): ([^;]+);/g)) {
      expect({ rule: m[0], known: rest.includes(`${m[1]}: ${m[2]};`) }).toEqual({ rule: m[0], known: true });
    }
  });
});
