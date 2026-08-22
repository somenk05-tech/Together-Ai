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
  it('has a tab on the street and two rooms in the rail', () => {
    expect(NAV.find((n) => n.key === 'ecommerce')?.label).toBe('E-Commerce');
    expect(HUBS.ecommerce.items.map((i) => i.path))
      .toEqual(['/ecommerce/store', '/ecommerce/market']);
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
      ...[...FITTED, ...OPEN].map((s) => s.path),
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

  it('takes each card’s name and line from that hub’s own sidebar', () => {
    for (const card of [...fittedShelves(), ...openShelves()]) {
      const item = HUBS[card.hub].items.find((i) => i.path === card.path);
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
      expect({ path: card.path, copied: pages.includes(card.name) || pages.includes(card.line) })
        .toEqual({ path: card.path, copied: false });
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
