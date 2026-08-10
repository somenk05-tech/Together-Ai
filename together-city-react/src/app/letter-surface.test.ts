import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'layout.css');
const css = readFileSync(CSS, 'utf8');

/**
 * NOTHING BLEEDS OUT OF THE CONTENT COLUMN ANY MORE — and the reason this file
 * still exists is that the way it used to is a trap somebody will fall into
 * again.
 *
 * WHAT THIS GUARDED BEFORE. The daily and monthly guidance pages were a night
 * surface that had to reach the edges of the content column, and
 * `.tc-shell .tc-main > *` pads every child of that column. The first version
 * cancelled that padding with `margin: -36px -44px -80px`, and it was wrong
 * twice within a day of reaching a real browser:
 *
 *   - THE PADDING CHANGES AT 1100px AND THE MARGIN CHANGED AT 780px. Between
 *     those two widths the whole black surface sat offset from the column it
 *     belonged to, notched over the footer.
 *   - THE BREADCRUMB WRAPPER CARRIES AN INLINE `padding: 0 16px`, which beats
 *     the stylesheet. There was no 36px of padding above the surface to cancel,
 *     so the -36px went through the breadcrumb row instead and put the night
 *     sky behind it.
 *
 * Both are the same defect: a value that has to be kept in step with a value in
 * another rule, forever, with nothing checking.
 *
 * WHAT CHANGED. Relief made every background white, so the letter no longer
 * needs to reach the edges — it is a raised card sitting in the ordinary
 * gutter, and depth does the work the bleed used to. The full-bleed assertion
 * is therefore gone: asserting that a surface bleeds, when the design says it
 * does not, is a test that fails for being right.
 *
 * THE TWO RULES THAT OUTLIVED IT are the ones that were never about the night
 * palette, and both stay:
 *   1. no negative margin cancels the shell's padding, on any surface;
 *   2. a page does not restyle the site footer.
 */

/**
 * Anchored on the letter's own selector rather than on a comment banner — the
 * first attempt anchored on the heading, which is drawn with box characters
 * that are not the same width in the two blocks that use them.
 *
 * `.letter-sky` became `.letter-page` when the letter stopped being a raised
 * card on the room's ground and became a printed page with its own paper. The
 * anchor moved with it, and that move is why the expect() below is not
 * defensive noise: an anchor matching nothing would make every assertion in
 * this file vacuous, and a file of tests that pass by not running is worse
 * than no file at all.
 */
const surfaceCss = (): string => {
  const start = css.indexOf('.letter-page {');
  expect(start, 'the letter surface block is missing from layout.css').toBeGreaterThan(-1);
  return css.slice(start);
};

/**
 * The surfaces this guard is about, NAMED rather than inferred.
 *
 * THIS LIST IS THE THIRD ATTEMPT AND THE FIRST HONEST ONE. The guard began by
 * reading from its own block to the END of the stylesheet, which meant every
 * surface appended afterwards inherited it — and twice that caught correct
 * code: the consultation room's screen-reader clip (`margin: -1px`, which is
 * what that pattern IS), and the tarot fan's overlapping cards
 * (`margin-inline: -22%`, which is what a fan IS). Neither has anything to do
 * with bleeding out of a shell.
 *
 * An accidental boundary that keeps swallowing new work is worse than a narrow
 * one that has to be widened on purpose.
 */
const BLEEDING_SURFACES = /^\.(letter|ask|astro-frame|tarot)-?|^\.tc-shell \.tc-main > \./;

const rulesFor = (pattern: RegExp): Array<{ selector: string; body: string }> =>
  surfaceCss().replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('}')
    .map((chunk) => {
      const at = chunk.lastIndexOf('{');
      return at < 0 ? null : { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) };
    })
    .filter((r): r is { selector: string; body: string } => !!r && pattern.test(r.selector));

describe('the letter surface', () => {
  it('uses no negative margin anywhere in it', () => {
    const own = rulesFor(BLEEDING_SURFACES);
    expect(own.length, 'these surfaces have no rules in layout.css').toBeGreaterThan(20);
    const offenders = own
      .filter((r) => /margin[^:]*:\s*[^;]*-\d/.test(r.body))
      // The one legitimate negative margin in CSS: the visually-hidden clip
      // pattern, which is `-1px` and has nothing to do with bleeding out of a
      // shell. `clip:` is its signature and no bleed rule has one.
      .filter((r) => !/\bclip\s*:/.test(r.body))
      .map((r) => r.selector);
    expect(offenders, [
      '',
      "A negative margin here has to know the shell's padding at every",
      'breakpoint and be kept in step with it forever. It was wrong within a day',
      'the first time: offset between 780px and 1100px, and eating the',
      'breadcrumb row above it.',
      '',
      'Override `.tc-shell .tc-main > *` instead — one rule that is correct at',
      'every width by construction and cannot reach a sibling.',
      '',
    ].join('\n')).toEqual([]);
  });

  it('overrides the shell padding rather than cancelling it, where it overrides at all', () => {
    // The tarot page is the one surface that still sets its own column padding,
    // because it sets a DIFFERENT padding, not because it wants none. If that
    // override ever appears as a margin instead, the test above catches it;
    // this one only checks the override is still expressed as padding.
    const overrides = rulesFor(/^\.tc-shell \.tc-main > \./);
    for (const rule of overrides) {
      expect(rule.body, `${rule.selector} should set padding, not margin`).toMatch(/padding\s*:/);
    }
  });

  it('leaves the footer alone', () => {
    // Both dark surfaces briefly darkened `.tc-footer` so the foot of the page
    // would not turn cream under a night sky, and it was reverted: the footer is
    // site chrome and stays site chrome on every page. The reasoning is worth
    // keeping, because the change is tempting every time somebody builds a
    // distinctive screen — a global bar that changes colour on two screens out
    // of a hundred and forty is not atmosphere, it is a bar that looks broken
    // on the two.
    const touching = rulesFor(/\.tc-footer/).map((r) => r.selector);
    expect(touching, 'a page surface is restyling the site footer again').toEqual([]);
  });
});
