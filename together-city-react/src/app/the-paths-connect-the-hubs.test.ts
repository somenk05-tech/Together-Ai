import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PATHS } from '@/config/paths';
import { DESIGNABLE_HUBS } from '@/config/services';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE PATHS CONNECT THE HUBS — and connect is ALL they do.
 *
 * Design Your Paths (owner's brief, phase 2) names sets of hubs that work
 * together and gives each set one switch. The two rules this file holds:
 *
 * 1. A PATH IS MADE OF REAL SWITCHES. Every hub in every path is designable —
 *    a path standing on Travel (no street surface), Mail or Personal (the
 *    citizen's own doors) would be a switch wired to nothing. This is why
 *    Weekend Getaway is not shipped: it waits on Travel returning to the
 *    street, and this test is the door it must come back through.
 *
 * 2. A PATH IS DERIVED, NEVER STORED. On means "every hub in it is on",
 *    computed from the same hidden-hubs answer the whole chrome reads. The
 *    moment a second column or endpoint stores path state, it can disagree
 *    with the hub switches beside it — so no such storage may exist.
 */
describe('a path is made of real switches', () => {
  const designable = new Set<string>(DESIGNABLE_HUBS);

  for (const p of PATHS) {
    it(`${p.name} stands only on designable hubs`, () => {
      for (const h of p.hubs) {
        expect({ path: p.key, hub: h, designable: designable.has(h) })
          .toEqual({ path: p.key, hub: h, designable: true });
      }
    });
  }

  it('every path connects at least two hubs — one hub is not a path', () => {
    for (const p of PATHS) {
      expect({ path: p.key, hubs: p.hubs.length >= 2 }).toEqual({ path: p.key, hubs: true });
    }
  });

  it('keys are unique, and Weekend Getaway waits for Travel', () => {
    const keys = PATHS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    // The brief names it; the city cannot keep its promise without Travel on
    // the street. When Travel returns, add the path and delete this line.
    expect(keys).not.toContain('weekend-getaway');
    expect(PATHS.some((p) => (p.hubs as readonly string[]).includes('travel'))).toBe(false);
  });
});

describe('a path is derived, never stored', () => {
  it('no column, no endpoint, no second source of truth', () => {
    // The hook that owns the wire never heard of paths…
    expect(read('hooks/useCityDesign.ts')).not.toMatch(/path/i);
    // …and the config never reaches for the network or storage.
    const cfg = read('config/paths.ts');
    expect(cfg).not.toMatch(/api|fetch|localStorage/);
  });

  it('the section computes ON from the hub switches beside it', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/p\.hubs\.every\(\(h\) => !hidden\.has\(h\)\)/);
  });

  it('switching a path off spares hubs another on-path is standing on', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/q\.key !== path\.key && pathOn\(q\)/);
  });

  it('the paths render inside Design Your Services, under their own eyebrow', () => {
    const section = read('features/profile/components/DesignYourServices.tsx');
    expect(section).toMatch(/Design your paths/);
    // …drawn from PATHS, less any path standing on a hub the operator has
    // switched off site-wide (see the-city-is-yours-to-design.test.ts).
    expect(section).toMatch(/const drawnPaths = PATHS\.filter\(\(p\) => p\.hubs\.every\(\(h\) => switches\.shown\(h\)\)\)/);
    expect(section).toMatch(/drawnPaths\.map/);
  });
});
