import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  buildPool, citizen, directedPairCount, forEachDirectedPair, FIXTURE_CITIES, type FixtureCitizen,
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

describe('H.39 — whether SCORING_POOL = 500 binds', () => {
  const SCORING_POOL = 500;

  /**
   * The query takes the first SCORING_POOL rows and filters afterwards, so what
   * a viewer SEES is "eligible candidates among the first 500 rows", not "the
   * best 500 eligible candidates". The gap between the two is the whole of
   * H.39 — and the fix it proposes (apply the hard filters in the query, before
   * the cap) closes it exactly: the same viewer would then see min(500, eligible).
   */
  const measure = (size: number) => {
    const pool = buildPool({ size, seed: SEED });
    let eligibleTotal = 0, seenTotal = 0, starved = 0;
    for (const viewer of pool) {
      let eligible = 0, seen = 0, row = 0;
      for (const candidate of pool) {
        if (candidate === viewer) continue;
        row++;
        if (unreachableReason(viewer.profile, candidate.profile, viewer.age, candidate.age)) continue;
        eligible++;
        if (row <= SCORING_POOL) seen++;
      }
      eligibleTotal += eligible;
      seenTotal += seen;
      if (seen < Math.min(SCORING_POOL, eligible)) starved++;
    }
    return {
      size,
      eligible: Math.round(eligibleTotal / pool.length),
      seen: Math.round(seenTotal / pool.length),
      starved: pct(starved, pool.length),
    };
  };

  it('measures what the cap hides as the city grows', () => {
    const rows = [400, 800, 2000].map(measure);
    // eslint-disable-next-line no-console
    console.log(`
================ DATING POOL — THE 500 CAP ================
Per viewer, on average:
${rows.map((r) => `  ${String(r.size).padStart(4)} citizens: ${String(r.eligible).padStart(4)} eligible · `
  + `${String(r.seen).padStart(4)} actually scored · `
  + `${String(Math.min(SCORING_POOL, r.eligible)).padStart(4)} would be scored if the hard filters ran BEFORE the cap`).join('\n')}
Viewers shown fewer candidates than the cap could have held: ${rows.map((r) => `${r.size}: ${r.starved}%`).join(' · ')}
The hidden ones are INVISIBLE, not ranked lower, and nothing says so.
===========================================================`);

    const small = rows[0], large = rows[2];
    // Below the cap nothing can be hidden: the guard that says this measurement
    // is measuring the cap and not the fixture.
    expect(small.seen).toBe(small.eligible);
    // Above it, the gap is real.
    expect(large.seen).toBeLessThan(large.eligible);
    expect(large.eligible).toBeGreaterThan(0);
  });
});
