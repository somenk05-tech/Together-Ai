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

  it('holds the four rooms the owner named', () => {
    const homePage = read('features/personal/pages/PersonalHome.tsx');
    for (const to of ['/thoughts', '/calendar', '/drive', '/personal/album']) {
      expect({ room: to, listed: homePage.includes(`to: '${to}'`) }).toEqual({ room: to, listed: true });
    }
    expect(router).toMatch(/path: '\/personal'/);
    expect(router).toMatch(/path: '\/personal\/album'/);
  });

  it('and each room is findable by name, not only by URL', () => {
    for (const id of ['p-personal-thoughts', 'p-personal-calendar', 'p-personal-drive', 'p-personal-album']) {
      expect({ id, listed: registry.includes(id) }).toEqual({ id, listed: true });
    }
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
