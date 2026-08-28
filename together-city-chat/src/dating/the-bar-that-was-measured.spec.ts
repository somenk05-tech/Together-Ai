import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { curatedBar } from './matching';

/**
 * ── THE BAR THAT WAS MEASURED, ON THE SCREEN THAT DRAWS IT ──
 *
 * `curatedBar` has existed since 26 Aug with its measurements written above it:
 * a fixed 75 is unreachable for anyone who has not finished their profile —
 * not one of 45,115 partial profiles clears it with anybody, ever — and the p90
 * takes empty decks from 25%/100%/100% by completeness cohort to
 * 1.3%/0.8%/0.1%. It was wired to `matches()`, which no screen calls. So the
 * mechanism built for the launch condition was not in the launch, and Browse
 * used the exact number the 1M run says nobody reaches on day one.
 *
 * The bands must stay disjoint and ordered at ANY bar, which is what `mid`
 * is for: at 75 it is 55 and nothing changes; at 48 there is no room between
 * them and Recommended is empty rather than inverted.
 */
const svc = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');

/** The band split, exactly as discoverUncached computes it. */
function bands(scores: number[]) {
  const bar = curatedBar(scores, 75);
  const mid = Math.min(bar, 55);
  return {
    bar,
    mid,
    ideal: scores.filter((s) => s >= bar),
    recommended: scores.filter((s) => s >= mid && s < bar),
    rest: scores.filter((s) => s < mid),
  };
}

describe('the bar that was measured', () => {
  it('is the one the browse page draws with', () => {
    expect(svc).toMatch(/const bar = curatedBar\(page\.map\(\(s\) => s\.card\.score\), MATCH_THRESHOLD\)/);
    expect(svc).toMatch(/const ideal = page\.filter\(\(s\) => s\.card\.score >= bar\)/);
  });

  it('counts and apologises against the same bar it drew', () => {
    expect(svc).toMatch(/idealCount: ranked\.filter\(\(s\) => s\.card\.score >= bar\)\.length/);
    expect(svc).toMatch(/lowDensity: ranked\.filter\(\(s\) => s\.card\.score >= bar\)\.length < 6/);
  });

  it('no longer promises a number it may not be using', () => {
    expect(svc).not.toMatch(/Your strongest matches \\u2014 75%\+ compatibility/);
    expect(svc).not.toMatch(/Below 55% on our scoring/);
  });

  /**
   * A thin city: nothing near 75, and a curated section that finally exists.
   * The bar is taken off the sorted list at index floor(n/10), so ten
   * candidates give a top TWO, not a top one — `sorted[1]`.
   */
  it('finds a top tenth in a city where nothing clears 75', () => {
    const b = bands([58, 55, 54, 52, 49, 47, 44, 41, 38, 30]);
    expect(b.bar).toBe(55);
    expect(b.ideal).toEqual([58, 55]);
    expect(b.rest).toEqual([54, 52, 49, 47, 44, 41, 38, 30]);
    // Under the fixed 75 this citizen saw no curated section at all, and a
    // banner apologising for it.
    expect(b.ideal.length).toBeGreaterThan(0);
  });

  it('keeps the three bands disjoint and complete at any bar', () => {
    for (const scores of [
      [90, 85, 80, 76, 70, 60, 50, 40],
      [58, 55, 54, 52, 49, 47, 44, 41, 38, 30],
      [44, 41, 38, 30],
      [12],
    ]) {
      const b = bands(scores);
      expect(b.ideal.length + b.recommended.length + b.rest.length).toBe(scores.length);
      for (const x of b.ideal) expect(x).toBeGreaterThanOrEqual(b.bar);
      for (const x of b.recommended) { expect(x).toBeLessThan(b.bar); expect(x).toBeGreaterThanOrEqual(b.mid); }
      for (const x of b.rest) expect(x).toBeLessThan(b.mid);
    }
  });

  /**
   * AND IT TIGHTENS A DENSE CITY, which is the half of this change worth
   * saying out loud. Where scores inflate — astrology is 0.90 of the weight
   * table — a fixed 75 can put most of the city in "your strongest matches".
   * A top tenth is a top tenth at any weight, which is the whole argument
   * above curatedBar: the bar stops depending on what the table inflates to.
   */
  it('tightens a city where the fixed bar would have passed nearly everyone', () => {
    const b = bands([96, 94, 92, 90, 88, 86, 84, 82, 80, 78]);
    expect(b.bar).toBe(94);
    expect(b.ideal).toEqual([96, 94]);
    // All eight of these cleared 75 and were called "strongest" before.
    expect(b.recommended).toHaveLength(8);
    expect(b.mid).toBe(55);
  });

  it('still has its escape hatch', () => {
    const prior = process.env.DATING_BAR;
    process.env.DATING_BAR = 'fixed';
    expect(curatedBar([58, 55, 54, 52], 75)).toBe(75);
    process.env.DATING_BAR = prior;
  });
});
