import { compatibilityScore, tropicalSign, vedicSign, zodiacSign } from './astrology';
import { signOf, siderealLon, sunLongitude } from '../astrology/astro-engine';

/**
 * The dating hub's scoring engine had no spec at all — the file that carries
 * most of every match weight was the one file in the module nobody tested.
 *
 * The truth table below is built from the sign boundaries directly rather than
 * from the implementation, so it can disagree with the code. That is the point:
 * a test written by reading the implementation would have agreed with the bug.
 *
 * WHAT MOVED, 26 Aug. The truth table is TROPICAL, and dating no longer is.
 * The Astrology Zone computes sidereal (Vedic) placements — `astro-engine.ts`,
 * Lahiri ayanamsa — and dating computed a Western sun sign from these calendar
 * boundaries, so the two rooms of the same city agreed on 21.5% of birth dates.
 * Adjacent signs are always different elements, and the element is the whole of
 * what AFFINITY reads, so 78.5% of citizens were matched on an element the
 * product itself said was not theirs.
 *
 * `zodiacSign` is the Vedic reading now. `tropicalSign` is kept whole and is
 * still what this truth table tests, because DATING_ZODIAC=tropical restores it
 * in one env var and a reversal nobody tests is not a reversal. The C2
 * regression — 22-31 December read as Sagittarius — is guarded on the tropical
 * function, where it happened.
 */
const WINDOWS: [string, string, number, number, number, number][] = [
  ['Aquarius', 'air', 1, 20, 2, 18],
  ['Pisces', 'water', 2, 19, 3, 20],
  ['Aries', 'fire', 3, 21, 4, 19],
  ['Taurus', 'earth', 4, 20, 5, 20],
  ['Gemini', 'air', 5, 21, 6, 20],
  ['Cancer', 'water', 6, 21, 7, 22],
  ['Leo', 'fire', 7, 23, 8, 22],
  ['Virgo', 'earth', 8, 23, 9, 22],
  ['Libra', 'air', 9, 23, 10, 22],
  ['Scorpio', 'water', 10, 23, 11, 21],
  ['Sagittarius', 'fire', 11, 22, 12, 21],
];

function expected(m: number, d: number): { name: string; element: string } {
  for (const [name, element, m1, d1, m2, d2] of WINDOWS) {
    const onOrAfter = m > m1 || (m === m1 && d >= d1);
    const onOrBefore = m < m2 || (m === m2 && d <= d2);
    if (onOrAfter && onOrBefore) return { name, element };
  }
  return { name: 'Capricorn', element: 'earth' };  // 22 Dec – 19 Jan, the wrap
}

const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];  // 29 Feb included
const everyDay = (): [number, number][] => {
  const out: [number, number][] = [];
  for (let m = 1; m <= 12; m++) for (let d = 1; d <= DAYS_IN[m - 1]; d++) out.push([m, d]);
  return out;
};
/** A birthday as the service stores it: date-only, midnight UTC. */
const born = (m: number, d: number) => new Date(Date.UTC(1996, m - 1, d));

describe('tropicalSign — the Western reading, kept whole behind DATING_ZODIAC=tropical', () => {
  it('is right on every day of the year, leap day included', () => {
    const wrong = everyDay()
      .filter(([m, d]) => tropicalSign(born(m, d)).name !== expected(m, d).name)
      .map(([m, d]) => `${m}/${d}: got ${tropicalSign(born(m, d)).name}, want ${expected(m, d).name}`);
    expect(wrong).toEqual([]);
  });

  it('gets both cusp days of all twelve signs', () => {
    for (const [name, , m1, d1, m2, d2] of WINDOWS) {
      expect(tropicalSign(born(m1, d1)).name).toBe(name);
      expect(tropicalSign(born(m2, d2)).name).toBe(name);
    }
  });

  it('carries Capricorn across the year end', () => {
    // The C2 regression. 22-31 December returned Sagittarius before the fix,
    // and this guards the tropical reading where the bug lived.
    for (let d = 22; d <= 31; d++) {
      expect(tropicalSign(born(12, d)).name).toBe('Capricorn');
      expect(tropicalSign(born(12, d)).element).toBe('earth');
    }
    for (let d = 1; d <= 19; d++) expect(tropicalSign(born(1, d)).name).toBe('Capricorn');
    // And does not swallow the days either side of the boundary.
    expect(tropicalSign(born(12, 21)).name).toBe('Sagittarius');
    expect(tropicalSign(born(1, 20)).name).toBe('Aquarius');
  });

  it('gives the element the affinity table actually scores', () => {
    for (const [m, d] of everyDay()) {
      expect(tropicalSign(born(m, d)).element).toBe(expected(m, d).element);
    }
  });

  it('agrees with the Astrology Zone on every date, which is the point', () => {
    const jdOf = (d: Date) => d.getTime() / 86400000 + 2440587.5;
    const disagree = everyDay()
      .map(([m, d]) => born(m, d))
      .filter((dt) => zodiacSign(dt).name !== signOf(siderealLon(sunLongitude(jdOf(dt)), jdOf(dt))));
    expect(disagree).toEqual([]);
  });

  it('reads a different sign from the tropical one for most of the year', () => {
    // Not a nicety — it is the whole reason the switch was made. If these ever
    // agree everywhere, one of the two engines has silently changed.
    const same = everyDay().filter(([m, d]) => vedicSign(born(m, d)).name === tropicalSign(born(m, d)).name);
    expect(same.length / everyDay().length).toBeLessThan(0.35);
  });

  it('reaches all twelve signs and no thirteenth', () => {
    const seen = new Set(everyDay().map(([m, d]) => zodiacSign(born(m, d)).name));
    expect(seen.size).toBe(12);
    expect(seen.has('Capricorn')).toBe(true);
  });
});

describe('compatibilityScore', () => {
  const person = (id: string, m: number, d: number, interests: string[] = []) =>
    ({ userId: id, birthDate: born(m, d), interests });

  it('reports the same sign the rest of the city reports', () => {
    // A Christmas birthday is Capricorn tropically and Sagittarius siderally.
    // The card must say what the Astrology Zone says, because it is the same
    // person looking at both screens.
    const r = compatibilityScore(person('a', 12, 25), person('b', 5, 1));
    expect(r.signA).toBe(vedicSign(born(12, 25)).name);
    expect(r.signB).toBe(vedicSign(born(5, 1)).name);
    expect(tropicalSign(born(12, 25)).name).toBe('Capricorn');
  });

  it('is symmetric in the pair, so two people see the same number', () => {
    const a = person('user-a', 12, 25, ['hiking']);
    const b = person('user-b', 3, 30, ['hiking', 'jazz']);
    expect(compatibilityScore(a, b).score).toBe(compatibilityScore(b, a).score);
  });

  it('is stable across calls, so a curated list does not flicker', () => {
    const a = person('user-a', 7, 4);
    const b = person('user-b', 11, 30);
    expect(compatibilityScore(a, b).score).toBe(compatibilityScore(a, b).score);
  });

  it('never exceeds the ceiling the list sorts against', () => {
    for (const [m, d] of everyDay()) {
      const s = compatibilityScore(
        person('x', m, d, ['a', 'b', 'c', 'd', 'e']),
        person('y', m, d, ['a', 'b', 'c', 'd', 'e']),
      ).score;
      expect(s).toBeLessThanOrEqual(99);
      expect(s).toBeGreaterThan(0);
    }
  });
});
