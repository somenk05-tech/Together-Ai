import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles', 'layout.css');

/**
 * The letter surface bleeds out of the shell WITHOUT negative margins.
 *
 * This exists because of what shipped first. The daily and monthly guidance
 * pages have to reach the edges of the content column, and `.tc-shell .tc-main
 * > *` pads every child of that column — so the first version cancelled the
 * padding with `margin: -36px -44px -80px`.
 *
 * That was wrong twice on the first look at a real browser.
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
 * another rule, forever, with nothing checking. Overriding the padding is one
 * rule that is correct at every width by construction and cannot reach a
 * sibling. This test is what stops the negative margins coming back the next
 * time something needs to bleed.
 *
 */
const css = readFileSync(CSS, 'utf8');

/**
 * The dark surfaces' own rules — the letter, and the consultation room.
 *
 * BOUNDED, not global. The stylesheet's ordinary rules live above these blocks
 * and are none of this guard's business; everything appended from the letter
 * surface onward is.
 *
 * Anchored on a SELECTOR rather than on the block's comment banner — the first
 * attempt anchored on the heading, which is drawn with box characters that are
 * not the same width in the two blocks that now use them.
 */
const surfaceCss = (): string => {
  const start = css.indexOf('.tc-shell .tc-main > .letter-sky');
  expect(start, 'the letter surface block is missing from layout.css').toBeGreaterThan(-1);
  return css.slice(start);
};

/**
 * The surfaces this guard is about, named rather than inferred.
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
 * one that has to be widened on purpose. A new bleeding surface adds its prefix
 * here, and that is a decision somebody makes rather than a net they fall into.
 */
const BLEEDING_SURFACES = /^\.(letter|ask)-|^\.tc-shell \.tc-main > \.(letter|ask)/;

const rulesFor = (pattern: RegExp): Array<{ selector: string; body: string }> =>
  surfaceCss().replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('}')
    .map((chunk) => {
      const at = chunk.lastIndexOf('{');
      return at < 0 ? null : { selector: chunk.slice(0, at).trim(), body: chunk.slice(at + 1) };
    })
    .filter((r): r is { selector: string; body: string } => !!r && pattern.test(r.selector));

describe('the letter surface', () => {
  it('bleeds by overriding the shell padding, not by cancelling it', () => {
    expect(css).toMatch(/\.tc-shell\s+\.tc-main\s*>\s*\.letter-sky\s*\{[^}]*padding:\s*0/);
    expect(css).toMatch(/\.tc-shell\s+\.tc-main\s*>\s*\.letter-past\s*\{[^}]*padding:/);
  });

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
      'A negative margin here has to know the shell\'s padding at every',
      'breakpoint and be kept in step with it forever. It was wrong within a day',
      'the first time: offset between 780px and 1100px, and eating the',
      'breadcrumb row above it.',
      '',
      'Override `.tc-shell .tc-main > *` instead. If this rule is not about',
      'bleeding out of the shell at all, it does not belong to a surface in',
      'BLEEDING_SURFACES — check the prefix before changing the CSS.',
      '',
    ].join('\n')).toEqual([]);
  });

  it('leaves the footer alone', () => {
    // Both dark surfaces briefly darkened `.tc-footer` so the foot of the page
    // would not turn cream under a night sky, and it was reverted: the footer is
    // site chrome and stays site chrome on every page. The reasoning is worth
    // keeping, because the change is tempting every time somebody builds a dark
    // screen — a global bar that changes colour on two screens out of a hundred
    // and forty is not atmosphere, it is a bar that looks broken on the two.
    const touching = rulesFor(/\.tc-footer/).map((r) => r.selector);
    expect(touching, 'a dark surface is restyling the site footer again').toEqual([]);
  });

});
