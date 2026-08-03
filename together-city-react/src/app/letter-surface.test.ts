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
 * The second half checks the footer rule stays SCOPED. Darkening `.tc-footer`
 * globally would work perfectly on these two screens and quietly wreck the
 * three light ones in the same hub — the kind of change that looks right in the
 * only place anybody looks.
 */
const css = readFileSync(CSS, 'utf8');

/** The letter block, with its explanatory comments stripped — those describe
 *  the bug BY NAME, so a check that reads them can never go red. */
const letterBlock = (): string => {
  const start = css.indexOf('.tc-shell .tc-main > .letter-sky');
  expect(start, 'the letter surface block is missing from layout.css').toBeGreaterThan(-1);
  return css.slice(start).replace(/\/\*[\s\S]*?\*\//g, ' ');
};

describe('the letter surface', () => {
  it('bleeds by overriding the shell padding, not by cancelling it', () => {
    expect(css).toMatch(/\.tc-shell\s+\.tc-main\s*>\s*\.letter-sky\s*\{[^}]*padding:\s*0/);
    expect(css).toMatch(/\.tc-shell\s+\.tc-main\s*>\s*\.letter-past\s*\{[^}]*padding:/);
  });

  it('uses no negative margin anywhere in it', () => {
    const offenders = letterBlock()
      .split('\n')
      .filter((l) => /margin[^:]*:\s*[^;]*-\d/.test(l))
      .map((l) => l.trim());
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

  it('darkens the footer only while a letter is on screen', () => {
    // Every .tc-footer rule inside the letter block must be scoped by the
    // attribute the surface sets on mount and removes on unmount.
    const rules = letterBlock().split('}').filter((r) => r.includes('.tc-footer'));
    expect(rules.length).toBeGreaterThan(0);
    const unscoped = rules
      .map((r) => r.split('{')[0].trim())
      .filter((sel) => !sel.includes('[data-surface="letter"]'));
    expect(unscoped, 'a global .tc-footer rule would break the three light screens in the same hub').toEqual([]);
  });

  it('sets and clears the attribute those rules depend on', () => {
    const surface = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'features', 'astrology', 'components', 'Letter.tsx'), 'utf8');
    expect(surface).toContain("setAttribute('data-surface', 'letter')");
    // Set without removed is a light page wearing a dark footer for the rest of
    // the session — the failure mode nobody notices until they navigate away.
    expect(surface).toContain("removeAttribute('data-surface')");
  });
});
