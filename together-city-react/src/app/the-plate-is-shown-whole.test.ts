import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── THE PLATE IS SHOWN WHOLE ────────────────────────────────────────────────
 *
 * The owner, 17 Aug: "the food image… make sure we see the full image instead
 * of a crop image of the food."
 *
 * MEASURED ON THE LIVE PAGE BEFORE ANYTHING CHANGED, which is the habit this
 * session had to learn the hard way three commits ago:
 *
 *   the box ............ 1180 x 420   (ratio 2.81)
 *   the photograph ....... 640 x 360   (ratio 1.778)
 *   on screen .......... 63% of it
 *
 * Ten photographs were sampled across the whole range — recipe 3 to recipe
 * 11500 — and every one of them is 640 x 360. Not "mostly"; all ten, exactly.
 * So the box takes the picture's own ratio and there is nothing left to crop.
 *
 * IT COSTS NO SHARPNESS. `cover` scales by the WIDTH in both versions —
 * 1180/640 = 1.844x either way — so this shows more of the same pixels, not
 * fewer larger ones. That is worth stating because "show the whole image"
 * usually does trade something, and here it does not.
 */
describe('the plate is shown whole', () => {
  const relief = strip(read('styles/relief.css'));

  it('gives the hero the photograph’s own ratio instead of a fixed height', () => {
    expect(relief).toMatch(/\.press-r-photo \{ width: 100%; aspect-ratio: 16 \/ 9;/);
    // The height that did the cropping. A pixel height is a second place to
    // keep 16/9 true, and the day these photographs are regenerated at another
    // shape a ratio is one number to change and a clamp is a crop nobody
    // notices for a month.
    expect(relief).not.toMatch(/\.press-r-photo \{[^}]*height: clamp/);
  });

  it('lets the hero letterbox rather than crop, whatever arrives in it', () => {
    // With the box at 16/9 and every photograph 640x360 this is pixel-identical
    // to `cover` today. It is what keeps the promise if a picture ever turns up
    // at another shape: letterboxed on the paper, not silently cut.
    expect(relief).toMatch(/\.press-r-photo img \{ object-fit: contain; \}/);
  });

  it('leaves the small plates cropping, because a square cannot do otherwise', () => {
    // A 1:1 card cannot show a 16/9 photograph whole, and a square grid of
    // letterboxed thumbnails is a worse answer than a crop at that size.
    expect(relief).toMatch(/\.press-r-plate \{ aspect-ratio: 1 \/ 1; \}/);
    expect(relief).toMatch(/\.press-r-photo img, \.press-r-plate img \{[^}]*object-fit: cover/);
  });
});
