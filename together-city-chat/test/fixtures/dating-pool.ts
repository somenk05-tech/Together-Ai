/**
 * A dating pool that exists only while a test is running.
 *
 * F.33. Every matching change since H2 has been argued about without figures —
 * L2's height range was accepted knowing it would cost pool size, with nobody
 * able to say how much, and H.39's SCORING_POOL = 500 cannot be judged without
 * knowing how many candidates a viewer actually has.
 *
 * WHY THIS IS NOT A SEED, AND MUST NEVER BECOME ONE. `11cc2d2` was cleanup
 * after seeded invented events became bookable and charged real money. Synthetic
 * people carrying preferences, dropped into a matching pool, are the same hazard
 * with worse content: a citizen could be shown one, like one, or be measured
 * against one. So this file writes nothing, reads nothing, and is generated in
 * memory per run. `dating-pool-guard` in pool-fixture.spec.ts fails if any
 * non-test file imports it.
 *
 * THE UNIT IS THE ORDERED PAIR, not the profile. `unreachableReason` composes
 * `hardFilterReason` in both directions (H4), so "how many people does this
 * filter remove" has no answer per person — only per viewer, per candidate.
 * `forEachDirectedPair` visits (a, b) and (b, a) as separate observations.
 *
 * DETERMINISM IS THE POINT. Same seed, same pool, same figures, or a number in
 * a report cannot be compared with the same number next week.
 *
 * Scope: the fields the HARD FILTERS read, plus a real city so `distanceBetween`
 * resolves. It does not populate the scoring fields (astrology, values,
 * interests) — nothing measured here reads them, and inventing personalities to
 * pad a fixture is how a fixture starts being believed.
 */

import { CITY_COORDS, cityCoords } from '../../src/shared/geo';
import type { DXProfile } from '../../src/dating/matching';

/** What the DATABASE can see: the columns a WHERE clause could use. Everything
 *  else a hard filter reads lives inside the `extras` JSON string. */
export type FixtureGender = 'male' | 'female' | 'nonbinary';

export interface FixtureCitizen {
  id: string;
  age: number;
  /** Columns on DatingProfile, so a query can filter on them. Reciprocity is
   *  `seeking`/`gender` both ways — the only hard filter that is entirely
   *  columns, and therefore the only one a prefilter cannot get wrong. */
  gender: FixtureGender;
  seeking: FixtureGender | 'any';
  /** The stored column. `ageOf()` reads it back as `age` — see AGE_YEAR_MS. */
  birthDate: Date;
  /** null means NOT ON FILE. A real share of the pool has no height, because
   *  "an unrecorded height is never hidden" is the property L2 leans on
   *  hardest, and a fixture where everybody answered cannot exercise it. */
  heightCm: number | null;
  city: string;
  profile: DXProfile;
}

/* ── deterministic randomness ──────────────────────────────────────────── */

/** mulberry32 over an FNV-1a hash of the seed string. Small, stable, and it
 *  does not depend on anything outside this file. */
function rand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const int = (r: () => number, lo: number, hi: number): number => lo + Math.floor(r() * (hi - lo + 1));

/** Pick by weight. Weights are plain counts out of 100 so the distribution can
 *  be read off the call site without arithmetic. */
function weighted<T>(r: () => number, options: Array<[T, number]>): T {
  const total = options.reduce((s, [, w]) => s + w, 0);
  let n = r() * total;
  for (const [value, w] of options) { n -= w; if (n <= 0) return value; }
  return options[options.length - 1][0];
}

/** Roughly bell-shaped: three uniforms, which is close enough for a height
 *  distribution and needs no library. */
const bell = (r: () => number, mean: number, spread: number): number =>
  Math.round(mean + ((r() + r() + r()) / 3 - 0.5) * 2 * spread);

/* ── the cities ────────────────────────────────────────────────────────── */

/**
 * City names derived FROM the coordinate table rather than typed out again.
 *
 * A hand-written list drifts from `CITY_COORDS` the moment somebody adds a
 * city, and a fixture city the table cannot place measures `distanceBetween`'s
 * null path instead of its real one — which would quietly turn every distance
 * measurement into a measurement of the fallback.
 *
 * `/mangal(uru|ore)/i` is why the group is expanded before the split.
 */
export const FIXTURE_CITIES: string[] = CITY_COORDS.map(([re]) =>
  re.source
    .replace(/\(([^)]*)\)/g, (_m, g: string) => g.split('|')[0])
    .split('|')[0]
    .trim(),
).filter((name) => cityCoords(name) !== null);

/* ── the citizens ──────────────────────────────────────────────────────── */

/**
 * One citizen, by NAME rather than by position (F.32 — the dating specs pass
 * five unlabelled arguments and nobody can read the call sites). Everything is
 * optional; what is not given is left unstated, which is itself the case most
 * worth testing.
 */
export function citizen(over: Partial<FixtureCitizen> & { profile?: Partial<DXProfile> } = {}): FixtureCitizen {
  const { profile: profileOver, ...rest } = over;
  const base: FixtureCitizen = {
    id: 'c0', age: 30, heightCm: null, city: 'Mumbai', profile: {},
    gender: 'female', seeking: 'any',
    birthDate: birthDateForAge(rest.age ?? 30, 0.5, FIXED_NOW),
    ...rest,
  };
  base.profile = {
    city: base.city, country: 'India',
    heightCm: base.heightCm,
    ...profileOver,
  };
  return base;
}

/** A fixed clock. Birth dates are derived from it, so a pool built today and a
 *  pool built tomorrow are the same pool — determinism reaches the dates too. */
export const FIXED_NOW = Date.UTC(2026, 7, 2, 12, 0, 0);

export interface PoolOptions {
  size?: number;
  seed?: string;
  /** Only for tests that want to move the clock. */
  now?: number;
}

/**
 * The pool. Distributions are stated as weights out of 100 so that changing one
 * is a visible edit rather than a tuned constant, and every figure any test
 * reports can be traced back to a line here.
 */
export function buildPool({ size = 800, seed = 'together-city', now = FIXED_NOW }: PoolOptions = {}): FixtureCitizen[] {
  const r = rand(seed);
  const out: FixtureCitizen[] = [];

  for (let i = 0; i < size; i++) {
    const age = weighted<number>(r, [
      [int(r, 21, 27), 30], [int(r, 28, 34), 34], [int(r, 35, 44), 24], [int(r, 45, 60), 12],
    ]);

    // 12% have never recorded a height.
    const heightCm = r() < 0.12 ? null : Math.min(198, Math.max(142, bell(r, 166, 14)));

    // The height range somebody asked for. Four shapes, and the fourth is
    // nonsense on purpose: min > max cannot be what anybody meant, the code
    // ignores it, and a pool with none in it never proves that.
    const shape = weighted(r, [['none', 55], ['min', 25], ['max', 8], ['both', 11], ['nonsense', 1]] as Array<[string, number]>);
    let prefHeightMinCm: number | null = null;
    let prefHeightMaxCm: number | null = null;
    if (shape === 'min') prefHeightMinCm = int(r, 155, 178);
    if (shape === 'max') prefHeightMaxCm = int(r, 162, 190);
    if (shape === 'both') { prefHeightMinCm = int(r, 152, 172); prefHeightMaxCm = prefHeightMinCm + int(r, 8, 26); }
    if (shape === 'nonsense') { prefHeightMinCm = int(r, 175, 190); prefHeightMaxCm = int(r, 150, 165); }

    // Age ranges cluster around the citizen's own age, which is what the form
    // sees in practice — a symmetric random range would understate the cost.
    const ageShape = weighted(r, [['both', 62], ['min', 12], ['max', 11], ['none', 15]] as Array<[string, number]>);
    const wantMin = Math.max(18, age - int(r, 0, 9));
    const wantMax = Math.min(75, age + int(r, 1, 13));
    const prefAgeMin = ageShape === 'both' || ageShape === 'min' ? wantMin : null;
    const prefAgeMax = ageShape === 'both' || ageShape === 'max' ? wantMax : null;

    const dealBreakers = weighted<string[]>(r, [
      [[], 45], [['Smoking'], 20], [['Drinking'], 10], [['Wants Children'], 12],
      [['Smoking', 'Drinking'], 8], [['Smoking', 'Wants Children'], 5],
    ]);

    const city = FIXTURE_CITIES[int(r, 0, FIXTURE_CITIES.length - 1)];

    // The two columns reciprocity reads. A tenth are non-binary, and roughly a
    // third state no preference — both matter, because 'any' is the case a
    // reciprocity prefilter gets wrong if it treats seeking as an equality.
    const gender = weighted<FixtureGender>(r, [['female', 45], ['male', 45], ['nonbinary', 10]]);
    const seeking = weighted<FixtureGender | 'any'>(r, [
      ['any', 32], ['female', 26], ['male', 34], ['nonbinary', 8],
    ]);
    // Where in their year they sit. 0 is the boundary itself: an inverted age
    // range that is off by a day gets exactly these people wrong, so a real
    // share of the pool stands on it.
    const frac = weighted<number>(r, [[0, 12], [0.25, 25], [0.5, 38], [0.9999, 25]]);

    out.push(citizen({
      id: `c${i}`, age, heightCm, city, gender, seeking,
      birthDate: birthDateForAge(age, frac, now),
      profile: {
        city, country: 'India', heightCm,
        prefHeightMinCm, prefHeightMaxCm, prefAgeMin, prefAgeMax,
        prefDistanceKm: weighted<number | null>(r, [[null, 58], [50, 12], [100, 12], [250, 10], [500, 8]]),
        dealBreakers,
        smoking: weighted(r, [['Never', 55], ['Socially', 30], ['Regularly', 15]] as Array<[string, number]>),
        drinking: weighted(r, [['Never', 38], ['Socially', 47], ['Regularly', 15]] as Array<[string, number]>),
        wantsChildren: weighted<string | undefined>(r, [['Yes', 45], ['No', 20], ['Maybe', 20], [undefined, 15]]),
      },
    }));
  }
  return out;
}

/**
 * Visit every ORDERED pair once — (a, b) and (b, a) are two observations, not
 * one, because each asks a different person's filters first.
 *
 * A callback rather than an array: 2,000 citizens is four million pairs, and
 * materialising them is how a fixture stops being runnable in a test suite.
 */
export function forEachDirectedPair(
  pool: FixtureCitizen[],
  visit: (viewer: FixtureCitizen, candidate: FixtureCitizen) => void,
): void {
  for (const viewer of pool) {
    for (const candidate of pool) {
      if (viewer !== candidate) visit(viewer, candidate);
    }
  }
}

/**
 * The year `DatingService.ageOf()` divides by: (now - birthDate) / 365.25 days,
 * floored. Written here too because the fixture has to produce birth dates that
 * function reads back exactly, and a second constant that drifts would make
 * every age in the pool a near-miss.
 */
export const AGE_YEAR_MS = 365.25 * 86_400_000;

/** A birthDate that ageOf() reads back as exactly `age` at `now`. `frac` places
 *  them within the year — 0 is the boundary itself, which is where an inverted
 *  range gets it wrong if it is going to. */
export const birthDateForAge = (age: number, frac: number, now: number): Date =>
  new Date(now - Math.floor((age + frac) * AGE_YEAR_MS));

/** Directed pairs in a pool of this size — stated once so no report has to
 *  recompute it and get it subtly wrong. */
export const directedPairCount = (size: number): number => size * (size - 1);
