import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE FLOOR SAYS WHAT IT IS, ONCE — owner, 7 Sep, with the store open:
 * "Your personalized store / only what's right for you. Everything here is
 * personalized for you. Your store adapts to your needs, your preferences,
 * and your lifestyle — so you never see what doesn't fit. Add this text on
 * this page at a heading using sentence case."
 *
 * It rides on the FLOOR rather than on the pane, because it is the section's
 * statement and not the shelf's: the same words over the routine, the
 * supplements and the stones, written once. And the Open Market does not get
 * it — a floor whose whole promise is "every category, nothing ranked for
 * you" cannot also say "only what's right for you".
 */
describe('the personalized store says what it is', () => {
  const store = code('features/ecommerce/pages/PersonalizedStore.tsx');
  /* The copy is set over several source lines; the reader sees one sentence,
     so the assertions read it as one. */
  const said = store.replace(/\s+/g, ' ');
  const floor = code('features/ecommerce/store/Floor.tsx');
  const tabbed = code('features/ecommerce/store/TabbedFloor.tsx');
  const css = read('styles/layout.css');

  it('carries the owner’s three lines, in his order', () => {
    expect(store).toMatch(/Your personalized store/);
    expect(store).toMatch(/Only what&rsquo;s right for you\./);
    expect(said).toMatch(/Everything here is personalized for you\./);
    expect(said).toMatch(/Your store adapts to your needs, your preferences, and your lifestyle/);
    expect(said).toMatch(/&mdash; so you never see what doesn&rsquo;t fit\./);
  });

  it('sets them in sentence case, not the capitals they were typed in', () => {
    // This city sets ONE thing in capitals — the tracked label — and a
    // sentence in that treatment reads as a sign rather than as speech.
    expect(store).not.toMatch(/ONLY WHAT|YOUR PERSONALIZED STORE/);
    // The eyebrow is uppercased by the stylesheet, not by the copy.
    expect(css).toMatch(/\.st-eyebrow \{[\s\S]*?text-transform: uppercase/);
  });

  it('is not a second h1 — the shelf you are looking at keeps that', () => {
    /* The same storefront is drawn without a floor on six other routes, where
       its title is the only heading there is, so it cannot be demoted. Two
       <h1>s would be two answers to "what page is this". */
    expect(store).toMatch(/<p className="st-hero-title">/);
    expect(store).not.toMatch(/<h1/);
    expect(store).toMatch(/aria-label="Your personalized store"/);
  });

  it('rides on the floor, and is drawn outside the sticky bar', () => {
    // A paragraph pinned to the top of the window is a paragraph in the way.
    expect(floor).toMatch(/head\?: ReactNode/);
    // Between the sticky bar and the pane, with only the note explaining why.
    expect(floor.replace(/\s+/g, ' ')).toMatch(/<\/div> \{ ?\} \{floor\.head\} \{children\}/);
    expect(tabbed).toMatch(/cart, head \}/);
  });

  it('is not said on the Open Market, which promises the opposite', () => {
    // "Every category, nothing ranked for you" — the district's own words for
    // that floor. It passes no head, so nothing is drawn.
    expect(code('features/ecommerce/pages/OpenMarket.tsx')).not.toMatch(/head=/);
  });

  it('takes the head’s own measure rather than a second masthead system', () => {
    expect(css).toMatch(/\.st-hero \{ max-width: 1180px; margin: 0 auto;/);
    expect(css).toMatch(/\.st-hero-title \{[\s\S]*?font-size: 34px/);
    // A step under `.st-title`, which is the page's own subject.
    expect(css).toMatch(/\.st-title \{[\s\S]*?font-size: 40px/);
  });
});
