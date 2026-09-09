import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old line as the thing they exist to correct. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE PIN SAYS WHERE YOU ARE, THE RADIUS SAYS HOW FAR YOU GO ──────────────
 *
 * Owner, 9 Sep: "Areas you cover — this needs to be automatic."
 *
 * It was a dropdown of thirty-four localities, a row of removable chips and a
 * comma-separated box — and it asked the wrong question. A shop typed the
 * places it would SERVE, which the radius answers now; the list went stale the
 * moment the shop moved, spelled Bandra four ways across the city, and left a
 * shop invisible for forgetting one neighbouring name.
 *
 * WHAT IS NOT CLAIMED, and this is the line the feature stops at: places.ts
 * carries locality NAMES and no coordinates, so "every area within 3 km of
 * here" is not something this application can work out. A list of guessed
 * neighbours would be the district inventing facts about a city. What is
 * automatic is the locality the pin actually resolved to.
 */
describe('nobody types where they cover any more', () => {
  const form = code('features/services/ListingForm.tsx');

  it('has no area picker, no chips and no comma-separated box', () => {
    expect(form).not.toMatch(/Areas you cover/);
    expect(form).not.toMatch(/toggleArea/);
    expect(form).not.toMatch(/Add an area…/);
    expect(form).not.toMatch(/Or type your own, comma-separated/);
  });

  it('took the machinery off with the question', () => {
    /* `areaList` and `areaParts` existed only to drive the chips. Left behind
       they would be the next reader's evidence that the form still asks. */
    expect(form).not.toMatch(/const areaList/);
    expect(form).not.toMatch(/const areaParts/);
  });
});

describe('the locality is read off the pin', () => {
  const form = code('features/services/ListingForm.tsx');

  it('follows the pin instead of filling an empty box', () => {
    /* Every other field in this form fills an EMPTY box and never overwrites
       a name the owner typed, because those are their answers. This one is no
       longer an answer they give — so a pin that moves and a locality that
       does not is simply wrong, and nobody would ever be told. */
    expect(form).toMatch(/if \(area && area !== canonical\) setAreas\(area\);/);
    expect(form).not.toMatch(/setAreas\(\(v\) => \(v\.trim\(\)/);
  });

  it('shows the owner what the pin decided', () => {
    /* The machine's answer is never left invisible in this form. */
    expect(form).toMatch(/Locality from your pin:/);
  });

  it('keeps one escape hatch, and only where there is no pin', () => {
    /* A listing with neither coordinates nor an area name is findable by city
       alone, which in Mumbai is not findable at all. This is the fallback the
       schema's own note describes — not a second way to answer a question the
       pin already answers. */
    expect(form).toMatch(/\{!pinned && \(/);
    expect(form).toMatch(/Which locality are you in\?/);
    expect(form).toMatch(/Drop one and this is read off it\./);
  });
});

describe('the radius is the coverage, and it is a control now', () => {
  const form = code('features/services/ListingForm.tsx');

  it('offers the steps rather than a free number box', () => {
    expect(form).toMatch(/REACH_STEPS\.filter\(\(k\) => reachMax == null \|\| k <= reachMax\)/);
    expect(form).not.toMatch(/How far you travel \(km\)/);
  });

  it('starts at the city’s own three kilometres rather than blank', () => {
    /* The same number the store shelves open on, so the two sides of the city
       agree about "near you". */
    expect(form).toMatch(/setRadius\(String\(cats\.data\?\.defaultReachKm \?\? 3\)\)/);
  });

  it('does not still shove a 5 in from the geocoder', () => {
    /* The pin used to drop a 5 into an empty radius box. Two defaults that
       disagree is one of them being wrong wherever they meet. */
    expect(form).not.toMatch(/setRadius\(\(v\) => \(v\.trim\(\) \? v : '5'\)\)/);
  });

  it('shows the ceiling instead of clamping behind the owner', () => {
    expect(form).toMatch(/km is the most a shop can cover/);
    expect(form).toMatch(/there is no ceiling/);
  });
});
