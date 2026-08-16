import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── THE HEADER IS TWO LAYERS, AND THE NUMBERS UNDER IT ARE REAL ─────────────
 *
 * The owner, 17 Aug: "move the together city logo on layer on top and at the
 * center of the page and the make the top hub layer."
 *
 * THIS FILE REPLACES `the-header-holds-one-line.test.ts`, WHICH GUARDED THE
 * WRONG NUMBERS. That guard passed, twice, on a header that cropped: the
 * breakpoints it protected (1400 for the line, 1620 for the words) came from a
 * headless browser in a Linux sandbox which could not load 'General Sans' and
 * computed the district row's gap as 6px against the real 26px. It reported the
 * row needing 1420px. Measured on the live page, in the owner's own browser:
 *
 *   logo 102 · districts 1123 · pills 267 icons / 424 with words
 *   one line,   icons 1580     one line,   words 1737
 *   two layers, icons 1458     two layers, words 1615
 *
 * …and the detail that turned a near miss into a visible crop: a media query
 * matches `innerWidth`, but the row is laid out in `clientWidth` — 15px less,
 * because the page has a scrollbar. So every breakpoint here is the measured
 * need plus 15px plus a margin, and none of them is round.
 *
 * The lesson this file is the enforcement of: A GUARD IS ONLY AS HONEST AS THE
 * RIG THAT SET ITS CONSTANTS. These assertions cannot re-measure a browser, so
 * what they defend is the direction — a breakpoint may move UP, never down —
 * and the two structural facts a future edit is most likely to undo.
 */
describe('the header is two layers, and neither of them crops', () => {
  const layout = strip(read('styles/layout.css'));
  const tokens = strip(read('styles/tokens.css'));
  const quick = read('layouts/QuickActions.tsx');
  const header = read('layouts/Header.tsx');

  /** The block that makes the two layers. */
  const layers = () => {
    const blocks = [...layout.matchAll(/@media \(min-width: 1500px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.tc-header')) ?? '';
  };
  /** The block that puts the words back, higher up. */
  const withWords = () => {
    const m = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .find((x) => /\.tc-header \.tc-actionbar \.lab \{ display: inline; \}/.test(x[2]));
    return m ? { width: Number(m[1]), body: m[2] } : null;
  };

  it('puts the signature on a layer of its own, centred on the page', () => {
    // `flex: 0 0 100%` is what makes it a LAYER rather than the first thing on
    // a line: it claims the whole row, and everything after it wraps beneath.
    // Without the wrap on the parent it silently becomes a one-line header
    // again — which is the version that cropped.
    const b = layers();
    expect(b).toMatch(/flex-wrap: wrap/);
    expect(b).toMatch(/\.tc-header \.tc-header-top \{ flex: 0 0 100%; width: 100%; display: flex; justify-content: center; \}/);
  });

  it('keeps the districts and the citizen’s doors on the second layer, doors right', () => {
    // `order`, never a change to Header.tsx: the source order is the reading
    // order the burger drawer, the masthead below 1500 and the tab sequence all
    // walk. One auto margin does the alignment, so the slack collects in ONE
    // gap rather than spreading itself into several.
    const b = layers();
    expect(b).toMatch(/\.tc-header \.tc-navrow \{ order: 2; \}/);
    expect(b).toMatch(/\.tc-header \.tc-actionrow \{ order: 3; margin-left: auto; \}/);
    // Centring the districts on that layer was tried and rejected by
    // measurement: at 1720 the tab row and the pills overlapped by 62px.
    expect(b).not.toMatch(/\.tc-navrow \{ order: 2; margin: 0 auto/);
    // The markup itself still reads name → doors → districts.
    expect(header.indexOf('tc-actionrow')).toBeLessThan(header.indexOf('tc-navrow'));
  });

  it('never lowers a header breakpoint below what was measured on a real page', () => {
    // 1458px is the second layer with icons; +15px for the scrollbar the media
    // query does not know about. 1500 is that plus a margin. A header
    // breakpoint under 1500 is a header that crops — which is not a hypothesis
    // here, it is what 1400 did. Scoped to blocks that mention .tc-header: a
    // guard that fails on an unrelated line is a guard the next person deletes.
    const headerBlocks = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes('.tc-header'))
      .map((m) => Number(m[1]));
    expect(headerBlocks.length).toBeGreaterThan(0);
    for (const w of headerBlocks) expect({ breakpoint: w, atLeast1500: w >= 1500 }).toEqual({ breakpoint: w, atLeast1500: true });
  });

  it('promises the words only at a width that was measured to hold them', () => {
    // 1615px is the second layer with the words, +15px for the scrollbar, and
    // the rest is room for a first name longer than the owner's — that pill is
    // USER DATA, and a breakpoint set to the exact measurement crops for
    // somebody else. That is exactly the mistake 1620 made.
    const w = withWords();
    expect(w).not.toBeNull();
    expect({ breakpoint: w!.width, holdsTheWords: w!.width >= 1700 })
      .toEqual({ breakpoint: w!.width, holdsTheWords: true });
    // …and the words come back by SHOWING the label, not by re-typesetting the
    // districts. Reaching for --chip-fs here is how a big screen ends up with
    // phone-sized tabs.
    expect(w!.body).not.toMatch(/--chip-fs/);
  });

  it('moves the height by re-pointing the token every surface clears', () => {
    // --header-h is what the main column's padding, the sticky sidebar and four
    // full-height surfaces read. Two layers measure 90px; a literal height
    // here, or a second token, would be a 30px band of empty paper under the
    // bar — the same failure the 60px one-line version avoided.
    const t = [...tokens.matchAll(/@media \(min-width: 1500px\) \{[\s\S]*?\n\}/g)].map((m) => m[0])
      .find((b) => b.includes('--header-h')) ?? '';
    expect(t).toMatch(/:root \{ --header-h: 90px; \}/);
    expect(layers()).not.toMatch(/height:\s*\d/);
    expect(layers()).not.toMatch(/--header-h-1|min-height/);
    expect(withWords()!.body).not.toMatch(/height:\s*\d/);
  });

  it('hides the pill words but never their names', () => {
    // Between 1500 and the words breakpoint the pills are icons, and that is
    // 157px of the difference. An icon whose only label was the span it just
    // hid is a button a screen reader cannot announce, and this is the
    // assertion that says so.
    expect(layers()).toMatch(/\.tc-header \.tc-actionbar \.lab \{ display: none; \}/);
    for (const name of ['Mail', 'Chat', 'Personal']) {
      expect({ name, labelled: quick.includes(`aria-label="${name}" title="${name}"`) })
        .toEqual({ name, labelled: true });
    }
    expect(header).toMatch(/aria-label="Notifications" title="Alerts"/);
    expect(header).toMatch(/aria-label="Profile" title="Profile"/);
    // One name for one room: the owner wrote "email" and chose Mail, which is
    // what the drawer, the Hubs page and the hub's own title say.
    expect(quick).not.toMatch(/>Email</);
  });

  it('keeps the citizen’s own name on the bar', () => {
    // The one pill that is a person rather than a place. Reduced to a disc it
    // is an avatar with no owner.
    expect(layers()).toMatch(/\.tc-actionbar a\[href="\/profile"\] \.lab \{ display: inline; \}/);
  });

  it('halves the tab tracking rather than shrinking the type', () => {
    // .13em over twelve labels is about 150px of pure tracking. Taking it out
    // is free; taking the type down again is not — 1180 already reads at 9.5px.
    expect(layers()).toMatch(/\.tc-header \.tc-nav a \{ letter-spacing: \.06em; \}/);
    expect(layers()).not.toMatch(/--chip-fs/);
  });

  it('leaves the three-row masthead exactly as it was below the breakpoint', () => {
    // Nothing about this change may touch the header a 13-inch laptop sees.
    expect(layout).toMatch(/\.tc-header \{ --chip-fs: 11\.5px;[^}]*flex-direction: column/);
    expect(layout).toMatch(/@media \(max-width: 1440px\) \{ \.tc-header \{ --chip-fs: 10\.5px/);
    expect(layout).toMatch(/@media \(max-width: 1180px\) \{ \.tc-header \{ --chip-fs: 9\.5px/);
  });

  it('has no trace of the one-line breakpoints that cropped', () => {
    // The two numbers this whole file exists to correct. If either comes back,
    // it comes back with a measurement or it does not come back.
    expect(layout).not.toMatch(/@media \(min-width: 1400px\) \{[^@]*\.tc-header/);
    expect(layout).not.toMatch(/@media \(min-width: 1620px\)/);
    expect(tokens).not.toMatch(/@media \(min-width: 1400px\) \{\s*:root \{ --header-h/);
  });
});
