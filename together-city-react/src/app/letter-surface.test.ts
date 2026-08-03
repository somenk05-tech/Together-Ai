import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
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
 * The second half checks the footer rule stays SCOPED. Darkening `.tc-footer`
 * globally would work perfectly on these two screens and quietly wreck the
 * three light ones in the same hub — the kind of change that looks right in the
 * only place anybody looks.
 */
const css = readFileSync(CSS, 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * The letter surface's own rules — selected, not sliced.
 *
 * THE FIRST VERSION TOOK EVERYTHING FROM ITS BLOCK TO THE END OF THE FILE, and
 * the next surface appended after it inherited the whole guard. Its
 * screen-reader utility carries `margin: -1px` — the standard clip pattern,
 * correct, and nothing at all to do with bleeding out of a shell — and the
 * guard failed on it. A rule that fires on correct code is a rule somebody
 * switches off, and this one was one stylesheet away from that.
 *
 * So the rules are matched by SELECTOR. Comments are stripped first: they
 * describe the bug by name, and a check that reads its own documentation can
 * never go red.
 */
const surfaceCss = (): string => {
  // Bounded AND selected. Bounded, because `.tc-footer` has perfectly good base
  // rules further up that these surfaces are not allowed to touch and are not
  // being asked about. Selected, because the region keeps growing as surfaces
  // are appended to it.
  // Anchored on a SELECTOR, not on a comment banner. The first attempt anchored
  // on the block's heading, which is drawn with box characters that are not the
  // same width in the two blocks that now use them.
  const start = css.indexOf('.tc-shell .tc-main > .letter-sky');
  expect(start, 'the letter surface block is missing from layout.css').toBeGreaterThan(-1);
  return css.slice(start);
};

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
    const own = rulesFor(/./);
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
      'Override `.tc-shell .tc-main > *` instead.',
      '',
    ].join('\n')).toEqual([]);
  });

  it('darkens the footer only while a dark surface is on screen', () => {
    const rules = rulesFor(/\.tc-footer/);
    expect(rules.length, 'nothing styles the footer for these surfaces').toBeGreaterThan(0);
    const unscoped = rules
      .map((r) => r.selector)
      .filter((sel) => !sel.includes('[data-surface="letter"]'));
    expect(unscoped, 'a global .tc-footer rule would break the light screens in the same hub').toEqual([]);
  });

  it('sets and clears the attribute those rules depend on, in exactly one place', () => {
    const src = join(dirname(fileURLToPath(import.meta.url)), '..');
    const hook = readFileSync(join(src, 'features', 'astrology', 'components', 'useDarkChrome.ts'), 'utf8');
    expect(hook).toContain("setAttribute('data-surface', 'letter')");
    // Set without removed is a light page wearing a dark footer for the rest of
    // the session — the failure nobody notices until they navigate away.
    expect(hook).toContain("removeAttribute('data-surface')");

    // And it stays one place. Two surfaces use this now; a third that writes
    // the attribute itself is a second chance to forget the clearing half.
    const writers = walk(src).filter((p) => /setAttribute\(\s*'data-surface'/.test(readFileSync(p, 'utf8')));
    expect(writers.map((p) => relative(src, p).split('\\').join('/')))
      .toEqual(['features/astrology/components/useDarkChrome.ts']);
  });
});
