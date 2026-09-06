import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV, HUBS } from '@/config/hubs';
import { FITTED, OPEN, fittedShelves, openShelves } from '@/features/ecommerce/shelves';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * E-COMMERCE COMES BACK AS A ROOM, NOT AS A FACADE.
 *
 * It was deleted on 10 Aug for one reason, written into that commit: it was
 * "the only district without a hub", a photograph with COMING SOON across it
 * on the third plate of the walk. The owner asked for it back on 22 Aug with
 * the facade the sign-painter drew — two doors, a personalised store and an
 * open market — so the whole risk of this change is that it returns as the
 * same placeholder wearing a better picture.
 *
 * These assertions are what stops that. Two rooms, both routed. Nothing sold
 * that the city was not already selling. And no line of shop copy written in
 * this district, because every name and every line is read out of the sidebar
 * of the room it points at — one source, so the two cannot drift apart.
 */
describe('E-Commerce is a district with rooms behind it', () => {
  it('has a tab on the street and its rooms in the rail', () => {
    /* DIGITAL STORE ON THE STREET, `ecommerce` IN THE CODE (owner, 6 Sep).
       The key, the route and every path under it are unchanged — a citizen
       never reads a key, and renaming one costs every link already sent. */
    expect(NAV.find((n) => n.key === 'ecommerce')?.label).toBe('Digital Store');
    expect(NAV.find((n) => n.key === 'ecommerce')?.path).toBe('/ecommerce');
    /* TWO ROOMS ON 22 AUG, THREE BY THE EVENING: the cart joined them at the
       owner's word — "keep individual carts and also a cross-hub cart in
       e-commerce". The facade's two doors are still the first two, and the
       order is asserted because the rail is read top to bottom. */
    expect(HUBS.ecommerce.items.map((i) => i.path))
      .toEqual(['/ecommerce/store', '/ecommerce/market', '/ecommerce/cart']);
  });

  it('is a plate you can walk into, not one that is only labelled', () => {
    // Home.tsx renders `soon` — labelled, unlinked — for a hub with no items.
    // That branch is what the district stood in until 10 Aug, and this is the
    // assertion that it is not standing in it again.
    expect(read('pages/Home.tsx')).toMatch(/key: 'ecommerce'/);
    expect(HUBS.ecommerce.items.length).toBeGreaterThan(0);
  });

  it('routes both rooms, and every shelf it points at', () => {
    /* Two places declare a route: router.tsx, and a feature that exports its
       own rooms as route objects — the Pet district's shape, and now this
       one's. Reading only the router would have called /pets/plan undeclared
       and this district's own two rooms with it. */
    const files = ['app/router.tsx', ...readdirSync(join(SRC, 'features'))
      .map((f) => `features/${f}/routes.tsx`)
      .filter((f) => existsSync(join(SRC, f)))];
    const declared = new Set(files.flatMap((f) =>
      [...read(f).matchAll(/path: '([^']+)'/g)].map((m) => m[1])));
    const targets = [
      '/ecommerce',
      ...HUBS.ecommerce.items.map((i) => i.path),
      /* A coming-soon shelf points at nothing, on purpose — filtered here
         rather than given a placeholder route, because a route that exists so
         that a test passes is the shop that does not exist all over again. */
      ...[...FITTED, ...OPEN].map((s) => s.path).filter((p): p is string => Boolean(p)),
      ...FITTED.map((s) => s.reads?.path).filter((p): p is string => Boolean(p)),
    ];
    expect(targets.filter((p) => !declared.has(p))).toEqual([]);
  });
});

describe('The shop is the city’s own shelves', () => {
  /**
   * A shelf that no longer answers drops silently out of the rendered list —
   * `resolve()` returns null and the card is filtered away, which is the right
   * behaviour on a screen and the wrong way to find out. This is where it is
   * found out.
   */
  it('resolves every shelf against the hub that owns it', () => {
    expect(fittedShelves().map((s) => s.path)).toEqual(FITTED.map((s) => s.path));
    expect(openShelves().map((s) => s.path)).toEqual(OPEN.map((s) => s.path));
  });

  /**
   * ── AND A COMING-SOON SHELF IS THE ONE THAT HAS NOTHING TO RESOLVE ────────
   *
   * Owner, 23 Aug: "add costume jewelry tab on this page, also just jewelry
   * store on open market and make everything coming soon."
   *
   * A shelf with `soon` writes its own name, which every other card in that
   * file is forbidden from doing — so this is the assertion that stops `soon`
   * becoming the way around the rule. BOTH halves, because either alone is
   * half of it:
   *
   *   · a shelf with `soon` must have NO hub, NO path and NO shop. The moment
   *     a room exists it has a sidebar entry, and a card whose name is typed
   *     here while a room holds another one is exactly the second copy this
   *     whole file was written against.
   *   · a shelf without `soon` must still resolve against a real entry. That
   *     is the rule below, and it now skips nothing except the cards that
   *     have no room by definition.
   */
  it('lets a shelf write its own name only when there is no room to read one from', () => {
    for (const s of [...FITTED, ...OPEN]) {
      if (!s.soon) continue;
      expect({ name: s.soon.name, hub: s.hub, path: s.path, shop: s.shop })
        .toEqual({ name: s.soon.name, hub: undefined, path: undefined, shop: undefined });
    }
    // …and it is not a door on either floor: nothing to open, so nothing to
    // press. The district was deleted once for being a photograph of a shop
    // that did not exist.
    const tile = read('features/ecommerce/ShelfTile.tsx').replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ');
    expect(tile).toMatch(/if \(soon\) return <article/);
  });

  it('takes each card’s name and line from that hub’s own sidebar', () => {
    for (const card of [...fittedShelves(), ...openShelves()]) {
      if (card.soon) continue;
      const item = HUBS[card.hub!].items.find((i) => i.path === card.path);
      expect({ path: card.path, name: card.name, line: card.line })
        .toEqual({ path: card.path, name: item?.label, line: item?.sub });
    }
  });

  /**
   * AND THE PAGES DO NOT RETYPE ANY OF IT. A second copy of "Verified in India
   * · we take no cut" in this district would read as correct on the day it was
   * written and would be a lie the first time the fitness hub edited its own
   * sidebar. The astrology menu already paid for this once, with a price.
   */
  it('writes no shop copy of its own', () => {
    /* Comments stripped first, and this guard earned that line by firing on
       one: a note explaining why the Beauty Market's hub name is not printed
       twice contained the words "Beauty Market". A comment is not copy on a
       screen, and a rule that cannot be explained in place is a rule people
       route around. */
    const pages = ['features/ecommerce/pages/PersonalizedStore.tsx', 'features/ecommerce/pages/OpenMarket.tsx']
      .map(read).join('\n')
      .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    for (const card of [...fittedShelves(), ...openShelves()]) {
      /* A coming-soon card has no line — there is no room to have written one
         — and `''` is in every string, so an empty line would report every
         card as copied and this guard would have started passing for the
         wrong reason on the day it stopped being able to fail. Its NAME is
         still checked: that one is real, and typing it into a page as well as
         into the shelf is exactly the second copy this rule is about. */
      const line = card.line || null;
      expect({ name: card.name, copied: pages.includes(card.name) || (line !== null && pages.includes(line)) })
        .toEqual({ name: card.name, copied: false });
    }
  });

  /**
   * NOTHING IS INVENTED, AND THIS IS THE ASSERTION THAT SAYS SO. The district
   * holds no catalogue: there is no product table in the API and no product
   * literal in these files. If a price or a product name ever appears here, it
   * came from somebody's imagination rather than from a shelf.
   */
  it('holds no catalogue of its own', () => {
    const feature = ['features/ecommerce/shelves.ts', 'features/ecommerce/routes.tsx',
      'features/ecommerce/pages/PersonalizedStore.tsx', 'features/ecommerce/pages/OpenMarket.tsx']
      .map(read).join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(feature).not.toMatch(/₹/);
    expect(feature).not.toMatch(/\bpriceInr\b|\bproducts\s*[:=]\s*\[/);
  });
});
