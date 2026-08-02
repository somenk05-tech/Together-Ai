import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  AGE_YEAR_MS, buildPool, citizen, directedPairCount, FIXED_NOW, forEachDirectedPair,
  FIXTURE_CITIES, type FixtureCitizen,
} from '../../test/fixtures/dating-pool';
import { cityCoords } from '../shared/geo';
import { hardFilterReason, heightFilterReason, unreachableReason, type DXProfile } from './matching';

/**
 * F.33 — the dating pool fixture, and the two figures it exists to produce.
 *
 * L2's height range shipped knowing it would cost pool size, with nobody able
 * to say how much. H.39's SCORING_POOL = 500 cannot be judged without knowing
 * how many candidates a viewer actually has. Both were arguments about numbers
 * nobody could produce. These are the numbers.
 *
 * They are printed, not silently asserted, because a figure whose only home is
 * an `expect` is a figure nobody reads.
 */

const SEED = 'together-city';
const pct = (n: number, of: number) => (of === 0 ? 0 : Math.round((n / of) * 1000) / 10);

describe('the fixture itself', () => {
  it('is deterministic — same seed, same pool', () => {
    // Every figure below is a comparison with the same figure next week. A pool
    // that drifts makes all of them meaningless.
    expect(buildPool({ size: 120, seed: SEED })).toEqual(buildPool({ size: 120, seed: SEED }));
    expect(buildPool({ size: 120, seed: 'other' })).not.toEqual(buildPool({ size: 120, seed: SEED }));
  });

  it('uses cities the coordinate table can actually place', () => {
    // A city geo.ts cannot place measures distanceBetween's NULL path. Every
    // distance figure would then be a measurement of the fallback.
    expect(FIXTURE_CITIES.length).toBeGreaterThan(100);
    for (const city of FIXTURE_CITIES) expect(cityCoords(city)).not.toBeNull();
    for (const c of buildPool({ size: 200, seed: SEED })) expect(cityCoords(c.city)).not.toBeNull();
  });

  it('leaves a real share of the pool with no height on file', () => {
    const pool = buildPool({ size: 800, seed: SEED });
    const missing = pool.filter((c) => c.heightCm === null).length;
    expect(missing).toBeGreaterThan(pool.length * 0.05);
    expect(missing).toBeLessThan(pool.length * 0.20);
  });

  it('builds a citizen by name, not by position', () => {
    // F.32: the dating specs pass unlabelled arguments and the call sites
    // cannot be read. This is the shape that ends it.
    const c = citizen({ id: 'tall', age: 41, heightCm: 191, profile: { prefAgeMin: 30 } });
    expect(c.profile.heightCm).toBe(191);
    expect(c.profile.prefAgeMin).toBe(30);
    expect(citizen().heightCm).toBeNull();
  });
});

describe('the fixture never becomes a seed', () => {
  it('is imported by tests only', () => {
    // 11cc2d2 was cleanup after seeded invented data became bookable and
    // charged real money. Synthetic people with preferences, in a matching
    // pool, are the same hazard with worse content.
    const offenders: string[] = [];
    const imports = (file: string) => /from ['"].*fixtures\/dating-pool['"]/.test(readFileSync(file, 'utf8'));
    (function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!entry.endsWith('.ts') || entry.endsWith('.spec.ts')) continue;
        if (imports(full)) offenders.push(full);
      }
    })(join(__dirname, '..'));
    // prisma/seed.ts by name, because it is the one file where importing this
    // would put synthetic people in a real database.
    const seed = join(__dirname, '..', '..', 'prisma', 'seed.ts');
    if (imports(seed)) offenders.push(seed);
    expect(offenders).toEqual([]);
  });
});

/** One directed observation, run through the code the app runs. */
interface Reach { unreachable: boolean; reason: string | null; heightOnly: boolean }

function reachOf(viewer: FixtureCitizen, candidate: FixtureCitizen): Reach {
  const r = unreachableReason(viewer.profile, candidate.profile, viewer.age, candidate.age);
  if (!r) return { unreachable: false, reason: null, heightOnly: false };
  // Would this pair have reached each other if height were still a scoring
  // nudge rather than a hard filter? That difference IS L2's cost.
  const withoutHeight = (a: DXProfile, b: DXProfile, bAge: number) => {
    const stripped: DXProfile = { ...a, prefHeightMinCm: null, prefHeightMaxCm: null };
    return hardFilterReason(stripped, b, bAge);
  };
  const stillBlocked = withoutHeight(viewer.profile, candidate.profile, candidate.age)
    ?? withoutHeight(candidate.profile, viewer.profile, viewer.age);
  return { unreachable: true, reason: r.reason, heightOnly: stillBlocked === null };
}

describe('L2 — what a height range costs the pool', () => {
  const SIZE = 800;
  const pool = buildPool({ size: SIZE, seed: SEED });

  it('reports the cost per reason, over directed pairs', () => {
    const byReason: Record<string, number> = {};
    let unreachable = 0, heightOnly = 0, pairs = 0;
    forEachDirectedPair(pool, (viewer, candidate) => {
      pairs++;
      const r = reachOf(viewer, candidate);
      if (!r.unreachable) return;
      unreachable++;
      byReason[r.reason as string] = (byReason[r.reason as string] ?? 0) + 1;
      if (r.heightOnly) heightOnly++;
    });

    expect(pairs).toBe(directedPairCount(SIZE));
    // eslint-disable-next-line no-console
    console.log(`
================ DATING POOL — REACH (seed ${SEED}, ${SIZE} citizens) ================
Directed pairs: ${pairs}
Unreachable:    ${unreachable} (${pct(unreachable, pairs)}%)
  by reason:    ${Object.entries(byReason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, pairs)}%`).join(' · ')}

L2's OWN COST — pairs that would reach each other but for a height range:
  ${heightOnly} pairs (${pct(heightOnly, pairs)}% of all pairs, ${pct(heightOnly, unreachable)}% of the ones that fail)
=====================================================================================`);

    expect(unreachable).toBeGreaterThan(0);
    expect(heightOnly).toBeGreaterThan(0);
  });

  it('prices one typical range, the way a citizen would experience it', () => {
    // A viewer whose ONLY filter is 165-185 cm. This was the question the owner
    // was asking — "if I type a range, how much of the city goes away?" — and
    // since 2 Aug the form no longer offers the box, so it is now the price
    // paid by everybody still holding a range they cannot reach.
    const viewer = citizen({ id: 'viewer', age: 30, profile: { prefHeightMinCm: 165, prefHeightMaxCm: 185 } });
    const removed = pool.filter((c) => heightFilterReason(viewer.profile, c.profile) !== null).length;
    const noHeight = pool.filter((c) => c.heightCm === null).length;
    // eslint-disable-next-line no-console
    console.log(`  one range, 165-185cm: removes ${removed}/${pool.length} (${pct(removed, pool.length)}%); `
      + `${noHeight} with no height on file are NOT removed`);
    expect(removed).toBeGreaterThan(0);
  });

  it('never removes a citizen whose height is not on file', () => {
    // The property L2 leans on hardest, checked across every directed pair
    // rather than on one hand-built example.
    let checked = 0;
    forEachDirectedPair(pool, (viewer, candidate) => {
      if (candidate.heightCm !== null) return;
      checked++;
      expect(heightFilterReason(viewer.profile, candidate.profile)).toBeNull();
    });
    expect(checked).toBeGreaterThan(1000);
  });

  it('ignores a range somebody typed backwards', () => {
    const backwards = pool.filter((c) => {
      const lo = c.profile.prefHeightMinCm, hi = c.profile.prefHeightMaxCm;
      return typeof lo === 'number' && typeof hi === 'number' && lo > hi;
    });
    expect(backwards.length).toBeGreaterThan(0);   // the pool contains the case
    for (const c of backwards) {
      for (const other of pool.slice(0, 50)) {
        expect(heightFilterReason(c.profile, other.profile)).toBeNull();
      }
    }
  });
});

/**
 * The 500 cap, and what it actually caps.
 *
 * THE ENTRY WAS WRONG ABOUT WHO IT HURTS, and the code says so plainly:
 * matches(), discover() and stack() have NO `take` at all — they are the
 * deliberate unbounded reads marked "the pool is the product". The only capped
 * site is reindexAfterChange(), the live-match notifier that runs on every
 * profile save. So the cap never hid anybody from a list a citizen browses; it
 * hid them from being TOLD about a match.
 *
 * And until now the 500 were arbitrary: no ordering, and every filter applied
 * in JS afterwards, so slots were spent on people the viewer can never match.
 *
 * These tests pin the property that makes the new prefilter safe — the query
 * and the JS rule select exactly the same people — and then report what it buys.
 */
const AGE_OF = (c: FixtureCitizen, now: number) => Math.floor((now - c.birthDate.getTime()) / AGE_YEAR_MS);

/** The WHERE clause in reindexAfterChange(), replicated. If this and the
 *  service ever disagree, the set-equality test below stops meaning anything —
 *  which is why it is written out rather than imported through a mock. */
function passesWhere(me: FixtureCitizen, them: FixtureCitizen, now: number): boolean {
  if (me.seeking !== 'any' && them.gender !== me.seeking) return false;
  if (!(them.seeking === 'any' || them.seeking === me.gender)) return false;
  const min = me.profile.prefAgeMin, max = me.profile.prefAgeMax;
  if (min && !(them.birthDate.getTime() <= now - min * AGE_YEAR_MS)) return false;
  if (max && !(them.birthDate.getTime() > now - (max + 1) * AGE_YEAR_MS)) return false;
  return true;
}

/** The rule as the service applies it in JS, which stays authoritative. */
function isEligible(me: FixtureCitizen, them: FixtureCitizen, now: number): boolean {
  const iWant = me.seeking === 'any' || me.seeking === them.gender;
  const theyWant = them.seeking === 'any' || them.seeking === me.gender;
  if (!iWant || !theyWant) return false;
  return !unreachableReason(me.profile, them.profile, AGE_OF(me, now), AGE_OF(them, now));
}

describe('H.39 — the 500 cap on the match notifier', () => {
  const SCORING_POOL = 500;
  const now = FIXED_NOW;

  it('produces birth dates the service reads back as the ages it generated', () => {
    // Guards the fixture itself: every age figure below is derived from a
    // birthDate through the same floor() the service uses, so a fixture that
    // was a day out would quietly shift every measurement.
    for (const c of buildPool({ size: 300, seed: SEED })) expect(AGE_OF(c, now)).toBe(c.age);
  });

  it('narrows without ever removing somebody the rule would have kept', () => {
    // THE PROPERTY. A prefilter that is stricter than the check is the H4 shape:
    // the query and the rule disagreeing about who exists. Checked over every
    // directed pair, including the citizens standing exactly on an age boundary.
    const pool = buildPool({ size: 600, seed: SEED });
    let eligible = 0, dropped = 0;
    forEachDirectedPair(pool, (me, them) => {
      if (!isEligible(me, them, now)) return;
      eligible++;
      if (!passesWhere(me, them, now)) dropped++;
    });
    expect(eligible).toBeGreaterThan(1000);   // the test is exercising something
    expect(dropped).toBe(0);
  });

  it('measures what the prefilter buys the notifier', () => {
    const rows: string[] = [];
    for (const size of [800, 2000]) {
      const pool = buildPool({ size, seed: SEED });
      let eligibleTotal = 0, before = 0, after = 0;
      for (const me of pool) {
        // BEFORE: 500 rows in table order, filtered afterwards.
        let seenBefore = 0, row = 0;
        // AFTER: 500 rows that already passed the WHERE. Table order stands in
        // for `orderBy updatedAt desc` — the fixture has no updatedAt, and what
        // is being measured is how many slots survive, not which.
        let seenAfter = 0, narrowedRow = 0;
        for (const them of pool) {
          if (them === me) continue;
          const ok = isEligible(me, them, now);
          if (ok) eligibleTotal++;
          row++;
          if (row <= SCORING_POOL && ok) seenBefore++;
          if (passesWhere(me, them, now)) {
            narrowedRow++;
            if (narrowedRow <= SCORING_POOL && ok) seenAfter++;
          }
        }
        before += seenBefore; after += seenAfter;
      }
      const n = pool.length;
      const avg = (x: number) => Math.round(x / n);
      rows.push(`  ${String(size).padStart(4)} citizens: ${String(avg(eligibleTotal)).padStart(3)} eligible · `
        + `${String(avg(before)).padStart(3)} told about before · ${String(avg(after)).padStart(3)} after`);
      // The whole point: never worse.
      expect(avg(after)).toBeGreaterThanOrEqual(avg(before));
    }
    // eslint-disable-next-line no-console
    console.log(`
================ DATING POOL — THE 500 CAP (match notifier) ================
Per viewer, on average — how many eligible people a profile edit can notify:
${rows.join('\n')}
The lists (matches/discover/stack) are uncapped and always were; this is the
notifier, which is where somebody silently never hears about a match.
============================================================================`);
  });
});
