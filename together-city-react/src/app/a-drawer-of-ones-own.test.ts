import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAV, HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * A DRAWER OF ONE'S OWN — AND A DISTRICT OFF THE STREET.
 *
 * Two owner calls, 15 Aug: hide Travel from the home page and the header,
 * and add a tab called Personal holding the journal, the calendar, the drive
 * and the album.
 *
 * The interesting half of both is what must NOT happen. Travel is hidden, not
 * deleted — its hub, its rooms, its routes and its art all still answer, and
 * the difference between "not advertised" and "removed" is the difference
 * between a citizen's bookmark working and a 404. And Personal is a TAB, not
 * a hub: the moment it becomes a `HubKey` every map keyed by hub owes it a
 * photograph, a billboard line, a theme and a consent decision it does not
 * have, which is how a drawer turns into a half-built district.
 */
describe('Travel leaves the street, not the city', () => {
  const home = read('pages/Home.tsx');

  it('is gone from the header tabs', () => {
    expect(NAV.some((n) => n.key === 'travel')).toBe(false);
  });

  it('is gone from all three home surfaces — map zone, tile, billboard', () => {
    // The zones, pavilion tiles and district panels each carry it once, and
    // "no /travel string in the file" is the assertion that survives somebody
    // adding a fourth surface later.
    expect(home).not.toMatch(/to: '\/travel'/);
    expect(home).not.toMatch(/key: 'travel'/);
  });

  it('but the hub itself is untouched — config, rooms, routes', () => {
    expect(HUBS.travel).toBeTruthy();
    expect(HUBS.travel.items.length).toBeGreaterThan(0);
    const router = read('app/router.tsx');
    expect(router).toMatch(/path: '\/travel'/);
    // …and it stays findable, or hiding it from the street would be hiding it
    // from the citizen who wants their booking.
    const registry = read('nav/registry.ts');
    expect(registry).toMatch(/id: 'hub-travel'/);
  });
});

describe('Financial leaves the street, not the city', () => {
  const registry = read('nav/registry.ts');

  /**
   * Owner, 22 Aug. The same move Travel made on the 15th, and the same trap:
   * hidden is not deleted, and the difference is a citizen's bookmark working
   * rather than answering 404.
   *
   * IT KEEPS ITS PLACE ON THE HOME MAP, and that is the one asymmetry with
   * Travel worth writing down rather than quietly matching. Travel was hidden
   * from the header AND from all three home surfaces, because the call was to
   * stop advertising it. This call was about the header alone: the district
   * still stands on the map, on a tile and on a billboard, and only the tab
   * moved. Copying Travel's second half here would have been tidiness doing a
   * product decision's job.
   */
  it('is gone from the header tabs', () => {
    expect(NAV.some((n) => n.key === 'financial')).toBe(false);
  });

  it('but the hub itself is untouched — config, rooms, routes, art', () => {
    expect(HUBS.financial).toBeTruthy();
    expect(HUBS.financial.items.length).toBe(5);
    expect(read('app/router.tsx')).toMatch(/path: '\/financial'/);
    expect(read('pages/Home.tsx')).toMatch(/to: '\/financial'/);
  });

  it('and the wallet stays findable by name, not only from the drawer', () => {
    // Leaving the header must not cost it the command palette; that is where
    // somebody who types "money" at midnight ends up.
    expect(registry).toMatch(/id: 'a-wallet'/);
    expect(registry).toMatch(/path: '\/financial\/wallet'/);
  });
});

describe('Personal is a drawer, not a district', () => {
  const registry = read('nav/registry.ts');
  const router = read('app/router.tsx');

  it('sits in the header, in its alphabetical place', () => {
    const personal = NAV.find((n) => n.key === 'personal');
    expect(personal).toEqual({ key: 'personal', label: 'Personal', path: '/personal' });
    const labels = NAV.map((n) => n.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it('is NOT a hub — no HubKey, no hub config, no rail', () => {
    expect(Object.keys(HUBS)).not.toContain('personal');
    // The widening lives in the tab type, where it costs the hub maps nothing.
    expect(read('config/hubs.ts')).toMatch(/export type TabKey = HubKey \| 'personal'/);
    expect(router).not.toMatch(/HubLayout hub=\{HUBS\.personal\}/);
  });

  it('holds the five rooms the owner named', () => {
    const homePage = read('features/personal/pages/PersonalHome.tsx');
    for (const to of ['/thoughts', '/calendar', '/drive', '/personal/album', '/financial/wallet']) {
      expect({ room: to, listed: homePage.includes(`to: '${to}'`) }).toEqual({ room: to, listed: true });
    }
    expect(router).toMatch(/path: '\/personal'/);
    expect(router).toMatch(/path: '\/personal\/album'/);
  });

  /**
   * AND THE FIFTH LEAF POINTS AT A ROOM, NOT AT A DISTRICT.
   *
   * The drawer's whole argument is that the pages in it belong to the person
   * rather than to a part of the city. A card reading "Financial District"
   * would break that on its face and would also be a lie about where it goes.
   * It says Financial Wallet and it opens /financial/wallet, which is one
   * room inside a hub that still exists — so this asserts the label and the
   * destination together, because either one alone can drift into the other's
   * meaning.
   */
  it('the wallet leaf is named for the room it opens', () => {
    const homePage = read('features/personal/pages/PersonalHome.tsx');
    expect(homePage).toMatch(/to: '\/financial\/wallet',[^\n]*label: 'Financial Wallet'/);
    expect(homePage).not.toMatch(/to: '\/financial',/);
  });

  it('and each room is findable by name, not only by URL', () => {
    for (const id of ['p-personal-thoughts', 'p-personal-calendar', 'p-personal-drive', 'p-personal-album']) {
      expect({ id, listed: registry.includes(id) }).toEqual({ id, listed: true });
    }
  });

  it('stands with the people layer on /hubs, not among the doors', () => {
    // Owner, 16 Aug: Personal was rendering in the district grid as a black
    // tile with no picture — because it has no HUB_HERO and never will, being
    // a drawer rather than a district. A door with no art is a door that looks
    // broken. It belongs under "Your city, your people", with the calendar and
    // the drive it actually contains.
    const hubs = read('pages/Hubs.tsx');
    expect(hubs).toMatch(/NOT_A_DOOR = new Set<string>\(\['mail', 'personal'\]\)/);
    expect(hubs).toMatch(/NAV\.filter\(\(n\) => !NOT_A_DOOR\.has\(n\.key\)\)/);
    // and it is still reachable from this screen — moved, not hidden.
    const people = hubs.slice(hubs.indexOf('Your city, your people'));
    expect(people).toMatch(/to: '\/personal'/);
  });

  it('the journal left the social shelf, and took its page grid with it', () => {
    // A private journal listed inside the SOCIAL rail was the wrong shelf; it
    // was there only because it was listed nowhere else.
    expect(HUBS.social.items.some((i) => i.path === '/thoughts')).toBe(false);
    // It used to borrow the hub layout's column. Out of the layout, it brings
    // its own — or it renders full-bleed against the window.
    expect(read('features/thoughts/pages/Thoughts.tsx')).toMatch(/<div className="page">/);
  });

  it('the album draws the profile’s own grid rather than a second one', () => {
    const album = read('features/personal/pages/Album.tsx');
    expect(album).toMatch(/import \{ PostsTab \} from '@\/features\/social\/pages\/Profile'/);
    expect(read('features/social/pages/Profile.tsx')).toMatch(/export function PostsTab/);
  });
});
