import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── THE HEADER HOLDS ONE LINE, OR IT DOES NOT TRY ───────────────────────────
 *
 * The owner, 16 Aug: "make these in one line… and make sure nothing gets
 * cropped." The second half is the whole engineering problem, and the numbers
 * that answer it were measured in a browser at thirteen widths before a line
 * was changed — the discipline the chat header earned in August.
 *
 * THE THREE ROWS ON ONE LINE, AS THEY WERE, NEED 1694px. That fits a 16-inch
 * laptop and crops a 14-inch one — and the two-row header it replaces does NOT
 * crop at 1440, because with a line to themselves the tabs have room. So the
 * naive version of this request trades a header that never crops for one that
 * crops on the machine it was asked from.
 *
 *   the five pill labels ......... 225px  → 1469
 *   tab tracking .13em → .06em .... 85px  → 1609
 *   both ................................. 1384
 *
 * Both, and only both, lands 1440. Nothing tested reaches 1280 without type
 * smaller than the city uses anywhere. So: one line from 1400 up, the three-row
 * masthead below, and the breakpoint is the measurement plus a margin.
 *
 * The three things below are the three that would quietly undo it: the
 * breakpoint drifting down to a round number the row cannot hold, the header
 * height and the token that clears it coming apart, and an icon losing the word
 * that was its only accessible name.
 */
describe('the header holds one line, or it does not try', () => {
  const layout = strip(read('styles/layout.css'));
  const tokens = strip(read('styles/tokens.css'));
  const quick = read('layouts/QuickActions.tsx');
  const header = read('layouts/Header.tsx');

  /** The one-line block in layout.css. */
  const oneLine = () => {
    const blocks = [...layout.matchAll(/@media \(min-width: 1400px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.tc-header')) ?? '';
  };

  it('turns the three rows into one, in their own order, on one axis', () => {
    const b = oneLine();
    expect(b).toMatch(/flex-direction: row/);
    expect(b).toMatch(/justify-content: center/);
    // All three sized to content and centred as one block. `flex: 1 1 auto` on
    // any of them opens a hole in the middle of the bar — two of the three
    // compositions rendered before this one did exactly that.
    expect(b).toMatch(/\.tc-header \.tc-navrow \{ width: auto; flex: 0 0 auto; \}/);
  });

  it('does not lower the breakpoint below what the row was measured to need', () => {
    // 1384px is the measured need. A breakpoint under 1400 is a header that
    // crops, which is the one thing the request ruled out.
    //
    // Scoped to the blocks that touch the HEADER — the first cut of this swept
    // every min-width in the file and failed on a 621px rule that has nothing
    // to do with the masthead. A guard that fails on an unrelated line is a
    // guard the next person deletes.
    const headerBlocks = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes('.tc-header'))
      .map((m) => Number(m[1]));
    expect(headerBlocks.length).toBeGreaterThan(0);
    for (const w of headerBlocks) expect({ breakpoint: w, atLeast1400: w >= 1400 }).toEqual({ breakpoint: w, atLeast1400: true });
  });

  it('moves the height by re-pointing the token every surface clears', () => {
    // --header-h is what the main column's padding, the sticky sidebar and four
    // full-height surfaces read. A second token, or a literal height here,
    // would be a 48px band of empty paper under a 60px bar.
    const t = [...tokens.matchAll(/@media \(min-width: 1400px\) \{[\s\S]*?\n\}/g)].map((m) => m[0])
      .find((b) => b.includes('--header-h')) ?? '';
    expect(t).toMatch(/:root \{ --header-h: 60px; \}/);
    // …and the header itself does not restate a height at that breakpoint.
    expect(oneLine()).not.toMatch(/height:\s*\d/);
    expect(oneLine()).not.toMatch(/--header-h-1|min-height/);
  });

  it('hides the pill words but never their names', () => {
    // Icons only is where 225 of the 254 needed pixels came from. An icon whose
    // only label was the span it just hid is a button a screen reader cannot
    // announce, and this is the assertion that says so.
    expect(oneLine()).toMatch(/\.tc-header \.tc-actionbar \.lab \{ display: none; \}/);
    for (const name of ['Mail', 'Chat', 'Personal']) {
      expect({ name, labelled: quick.includes(`aria-label="${name}" title="${name}"`) })
        .toEqual({ name, labelled: true });
    }
    expect(header).toMatch(/aria-label="Notifications" title="Alerts"/);
    expect(header).toMatch(/aria-label="Profile" title="Profile"/);
  });

  it('keeps the citizen’s own name on the bar', () => {
    // The one pill that is a person rather than a place. Reduced to a disc it
    // is an avatar with no owner.
    expect(oneLine()).toMatch(/\.tc-actionbar a\[href="\/profile"\] \.lab \{ display: inline; \}/);
  });

  it('halves the tab tracking rather than shrinking the type', () => {
    // .13em over twelve labels is about 150px of pure tracking. Taking it out
    // is free; taking the type down again is not — 1180 already reads at 9.5px.
    expect(oneLine()).toMatch(/\.tc-header \.tc-nav a \{ letter-spacing: \.06em; \}/);
    expect(oneLine()).not.toMatch(/--chip-fs/);
  });

  it('leaves the three-row masthead exactly as it was below the breakpoint', () => {
    // Nothing about this change may touch the header a laptop actually sees.
    expect(layout).toMatch(/\.tc-header \{ --chip-fs: 11\.5px;[^}]*flex-direction: column/);
    expect(layout).toMatch(/@media \(max-width: 1440px\) \{ \.tc-header \{ --chip-fs: 10\.5px/);
    expect(layout).toMatch(/@media \(max-width: 1180px\) \{ \.tc-header \{ --chip-fs: 9\.5px/);
  });
});
