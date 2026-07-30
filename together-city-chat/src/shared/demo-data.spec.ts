import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { demoDataEnabled } from './demo-data';

/**
 * Invented inventory stays behind one switch (§3, BE-3.3).
 *
 * Six hubs shipped with seeded catalogues — flights, tours, restaurants, films,
 * job postings, practitioners. A citizen can pay for some of it and receive a
 * booking code and an emailed receipt for something that does not exist. That is
 * fine on a demo deployment and not fine anywhere else, so it is gated.
 *
 * A gate is only worth having if it cannot be quietly gone around, and it had
 * already been gone around twice: medical and nutrition read
 * process.env.SEED_DEMO directly rather than calling the gate. Identical
 * behaviour, so nothing was broken — and two more places to drift, neither of
 * which reached the production warning. These tests are what stops the third.
 */

const SRC = join(__dirname, '..');

function sourceFiles(): string[] {
  const out: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
    }
  })(SRC);
  return out;
}

/** Hubs known to serve invented inventory. Removing one means proving it no
 *  longer has any — not that the import was tidied away. */
const GATED_HUBS = [
  'entertainment/entertainment.service.ts',
  'jobs/jobs.service.ts',
  'medical/medical.service.ts',
  'nutrition/nutrition.service.ts',
  'restaurants/restaurants.service.ts',
  'travel/travel.service.ts',
].sort();

describe('seeded inventory is gated', () => {
  it('nothing reads SEED_DEMO except the gate itself', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const rel = relative(SRC, file);
      if (rel === 'shared/demo-data.ts') continue;
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // The env var in a comment is fine — it is how you tell somebody to
        // turn it on. Reading it is what must go through one door.
        const code = line.split('//')[0];
        if (/process\.env\.SEED_DEMO/.test(code)) offenders.push(`${rel}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('every hub that serves invented inventory consults the gate', () => {
    const missing = GATED_HUBS.filter((rel) => {
      const text = readFileSync(join(SRC, rel), 'utf8');
      return !text.includes('demoDataEnabled');
    });
    expect(missing).toEqual([]);
  });

  it('scans a plausible surface (guards the scanner itself)', () => {
    // Without this, a broken walker reports zero offenders and the test above
    // passes while checking nothing.
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  describe('the switch itself', () => {
    const original = process.env.SEED_DEMO;
    afterEach(() => {
      if (original === undefined) delete process.env.SEED_DEMO;
      else process.env.SEED_DEMO = original;
    });

    it('is off unless the value is exactly "true"', () => {
      // A deployment that sets SEED_DEMO=1 or =yes, believing it has switched
      // demo data on, gets an honest empty state rather than invented stock.
      // The failure direction that matters is the other one.
      for (const v of ['1', 'yes', 'TRUE', 'True', 'on', '', 'false']) {
        process.env.SEED_DEMO = v;
        expect(demoDataEnabled()).toBe(false);
      }
    });

    it('is off when unset', () => {
      delete process.env.SEED_DEMO;
      expect(demoDataEnabled()).toBe(false);
    });

    it('is on for exactly "true"', () => {
      process.env.SEED_DEMO = 'true';
      expect(demoDataEnabled()).toBe(true);
    });
  });
});
