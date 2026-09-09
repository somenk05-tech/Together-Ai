import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ── THE WALK IS GONE (owner, 9 Sep: "remove walk the hub") ──────────────────
 *
 * This file used to assert the walk's shape — three cards to a row, an inset
 * picture, the name once, the sentence in two weights, twelve plates. The
 * section is deleted, so what is left to hold is the OTHER half of every
 * removal this repo has done: hidden is not deleted, and the things the walk
 * shared with the rest of the city do not go with it.
 *
 * WHY IT WENT. It was the home page's longest section and, by the end, its
 * most redundant. The header carries the four doors; the hero carries the same
 * four as glass pills; Personalize carries these very districts as banners the
 * owner drew himself; the foot grid carries twelve tiles; the command palette
 * carries all of them. A citizen who scrolled past the film met the city a
 * fourth time and was asked, again, to choose.
 *
 * THE TRAP THIS FILE NOW GUARDS. Two things the walk *appeared* to own are not
 * its: the district copy (DISTRICT_COPY and its three readers, which
 * Personalize imports for its banners) and `.district-card*` in relief.css,
 * which Personalize's banners wear. A tidy-up that deletes "the walk's copy"
 * or "the walk's CSS" takes the Personalize page down with it, and would
 * typecheck on the way (the CSS half would not even fail to build — it would
 * just render unstyled).
 */
describe('the walk came off the home page', () => {
  const home = read('pages/Home.tsx');

  it('draws no district run, and no card in it', () => {
    expect(home).not.toMatch(/Walk the districts/);
    expect(home).not.toMatch(/className="district-run"/);
    expect(home).not.toMatch(/className="district-card"/);
    expect(home).not.toMatch(/const PANELS/);
    expect(home).not.toMatch(/const DISTRICTS/);
  });

  it('keeps the film, the welcome and the foot grid it sat between', () => {
    /* The section was removed, not the page around it. These three are what
       a citizen scrolls through now, in this order. */
    expect(home).toMatch(/className="cinema"/);
    expect(home).toMatch(/const PAVILIONS: Pavilion\[\] = \[/);
    expect(home).toMatch(/className="cityfallback"/);
  });

  it('keeps the district copy, which was never the walk’s to take', () => {
    /* One noun and one sentence per district — "MATCHMAKING / Compatibility
       first. Attraction next. Intention follows." It lived here because the
       walk printed it first, and Personalize's banners read the same three
       functions today. */
    expect(home).toMatch(/const DISTRICT_COPY/);
    for (const fn of ['districtName', 'districtLine', 'splitDistrictLine']) {
      expect({ fn, exported: home.includes(`export function ${fn}`) }).toEqual({ fn, exported: true });
    }
    expect(read('pages/Personalize.tsx'))
      .toMatch(/import \{ districtLine, districtName, splitDistrictLine \} from '@\/pages\/Home'/);
  });

  it('keeps the card material in the stylesheet, which Personalize wears', () => {
    const relief = read('styles/relief.css');
    for (const cls of ['.district-card {', '.district-card-art {', '.district-card-foot', '.district-card-name', '.district-card-lead']) {
      expect({ cls, kept: relief.includes(cls) }).toEqual({ cls, kept: true });
    }
    expect(read('pages/Personalize.tsx')).toMatch(/district-card-foot/);
  });
});
