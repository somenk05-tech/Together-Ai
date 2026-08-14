import { readFileSync } from 'fs';
import { join } from 'path';
import { CITY, EVERYWHERE, PERSONALISATION, findInCity, whyWeAsk } from './city';
import { violations } from './voice';

/**
 * Mira's map, held against the real one.
 *
 * `config/hubs.ts` in the web package is the map of what a citizen can reach.
 * Mira's copy is declared separately because the two packages share nothing but
 * a network contract and deploy independently — but a copy that can drift is a
 * copy that WILL drift, and the failure mode is Mira confidently offering to
 * take somebody to a page that no longer exists.
 *
 * So it is asserted rather than imported, reading across the packages the same
 * way `route-reach.spec.ts` already does.
 */
const WEB_SRC = join(__dirname, '..', '..', '..', 'together-city-react', 'src');

function webPaths(): Set<string> {
  const out = new Set<string>();
  for (const file of ['config/hubs.ts', 'nav/registry.ts']) {
    let text = '';
    try { text = readFileSync(join(WEB_SRC, file), 'utf8'); } catch { continue; }
    for (const m of text.matchAll(/path:\s*'([^']+)'/g)) out.add(m[1]);
    for (const m of text.matchAll(/to=["']([^"']+)["']/g)) out.add(m[1]);
  }
  return out;
}

const WEB = webPaths();
const haveWeb = WEB.size > 0;

describe('the map does not drift', () => {
  it('can read the web package at all', () => {
    // If this fails, every assertion below is vacuously true — which is the
    // failure mode of a cross-package guard and worth its own test.
    expect(haveWeb).toBe(true);
    expect(WEB.size).toBeGreaterThan(30);
  });

  const rooms = CITY.flatMap((h) => h.rooms.map((r) => [h.key, r.path] as const));

  it.each(rooms)('%s → %s exists in the web app', (_hub, path) => {
    if (!haveWeb) return;
    // A hub landing (/astrology) or a declared room (/astrology/today). Either
    // is reachable; what must not happen is a path nobody declared.
    const known = WEB.has(path) || [...WEB].some((w) => w === path || path.startsWith(`${w}/`));
    expect(known).toBe(true);
  });

  it.each(EVERYWHERE.map((r) => [r.label, r.path] as const))('%s → %s exists', (_l, path) => {
    if (!haveWeb) return;
    const known = WEB.has(path) || [...WEB].some((w) => path.startsWith(w));
    expect(known).toBe(true);
  });

  it('every personalisation names a page you can actually reach', () => {
    if (!haveWeb) return;
    for (const p of PERSONALISATION) {
      const known = WEB.has(p.toldAt) || [...WEB].some((w) => p.toldAt.startsWith(w));
      expect(known).toBe(true);
    }
  });
});

describe('she answers "where is…" without a search results page', () => {
  it('finds a hub by what people call it', () => {
    expect(findInCity('groceries')[0]?.hub).toBe('nutrition');
    expect(findInCity('my balance')[0]?.hub).toBe('financial');
    expect(findInCity('plumber')[0]?.hub).toBe('services');
  });

  it('finds the places that are not hubs', () => {
    expect(findInCity('my files')[0]?.path).toBe('/drive');
    expect(findInCity('privacy')[0]?.path).toBe('/settings/privacy');
  });

  it('returns a handful, never a page of results', () => {
    // Somebody who asked where something is wants taking there, not handing
    // back into the thing they were already stuck in.
    expect(findInCity('a').length).toBeLessThanOrEqual(3);
    expect(findInCity('my').length).toBeLessThanOrEqual(3);
  });

  it('returns nothing rather than a bad guess', () => {
    expect(findInCity('')).toEqual([]);
    expect(findInCity('quarterly deferred revenue recognition')).toEqual([]);
  });
});

describe('personalisation is written as consequences, not as fields', () => {
  it('every change is something that happens, not something collected', () => {
    // "we collect your allergens" is a privacy policy. "no restaurant that
    // serves you peanuts will be shown to you again" is a reason. The second
    // is the only one that ever persuaded anybody.
    for (const p of PERSONALISATION) {
      expect(p.changes.length).toBeGreaterThan(0);
      for (const c of p.changes) {
        expect(c).not.toMatch(/\bwe (collect|store|gather|use your)\b/i);
        expect(c.length).toBeGreaterThan(20);
      }
    }
  });

  it('every offer is in voice', () => {
    for (const p of PERSONALISATION) expect(violations(p.offer)).toEqual([]);
    for (const p of PERSONALISATION) for (const c of p.changes) expect(violations(c)).toEqual([]);
  });

  it('the sensitive ones are marked, so she never volunteers them first', () => {
    const consented = PERSONALISATION.filter((p) => p.consented).map((p) => p.fact);
    expect(consented).toEqual(expect.arrayContaining(['A blood report', 'Health conditions']));
  });

  it('"why do you need that?" is always answerable', () => {
    for (const p of PERSONALISATION) expect(whyWeAsk(p.fact)).toBeDefined();
  });
});
