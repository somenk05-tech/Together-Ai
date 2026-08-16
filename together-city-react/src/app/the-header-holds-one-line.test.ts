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
 * ── LATER THE SAME NIGHT ────────────────────────────────────────────────────
 * "make the icons on the right and instead of the icons write the words."
 *
 * The side is free. The words are not: measured again on the same rig, the row
 * needs 1420px with icons and 1590px with Mail, Chat, Personal and Alerts
 * spelled out. So the words are promised at 1620 — the measurement plus room
 * for a first name longer than the owner's, because that label is user data —
 * and the band from 1400 to 1619 keeps the icons and their titles.
 *
 * The four things below are the four that would quietly undo it: the
 * breakpoint drifting down to a round number the row cannot hold, the words
 * being promised at a width that cannot hold them, the header height and the
 * token that clears it coming apart, and an icon losing the word that was its
 * only accessible name.
 */
describe('the header holds one line, or it does not try', () => {
  const layout = strip(read('styles/layout.css'));
  const tokens = strip(read('styles/tokens.css'));
  const quick = read('layouts/QuickActions.tsx');
  const header = read('layouts/Header.tsx');

  /** The block that makes the line, at 1400. */
  const oneLine = () => {
    const blocks = [...layout.matchAll(/@media \(min-width: 1400px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.tc-header')) ?? '';
  };
  /** The block that puts the words back, higher up. */
  const withWords = () => {
    const m = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .find((x) => /\.tc-header \.tc-actionbar \.lab \{ display: inline; \}/.test(x[2]));
    return m ? { width: Number(m[1]), body: m[2] } : null;
  };

  it('turns the three rows into one, in one direction, on one axis', () => {
    const b = oneLine();
    expect(b).toMatch(/flex-direction: row/);
    // flex-start, not center: the pills take the right edge with an auto
    // margin, and a centred main axis fights it.
    expect(b).toMatch(/justify-content: flex-start/);
    expect(b).not.toMatch(/justify-content: center/);
    // All three sized to content. `flex: 1 1 auto` on any of them opens a hole
    // in the middle of the bar — two of the three compositions rendered before
    // this one did exactly that.
    expect(b).toMatch(/\.tc-header \.tc-navrow \{ width: auto; flex: 0 0 auto; \}/);
  });

  it('pins the citizen’s own doors to the right edge, and only visually', () => {
    // `order`, never a change to Header.tsx: the source order is the reading
    // order the burger drawer, the three-row masthead below 1400 and the tab
    // sequence all walk. One auto margin does the alignment, so the slack
    // collects in ONE gap — between the city's districts and the citizen's own
    // doors — rather than spreading itself as two holes.
    const b = oneLine();
    expect(b).toMatch(/\.tc-header \.tc-navrow \{ order: 2; \}/);
    expect(b).toMatch(/\.tc-header \.tc-actionrow \{ order: 3; margin-left: auto; \}/);
    // The markup itself still reads name → doors → districts.
    expect(header.indexOf('tc-actionrow')).toBeLessThan(header.indexOf('tc-navrow'));
  });

  it('does not lower the breakpoint below what the row was measured to need', () => {
    // 1384px is the measured need for the icon row. A header breakpoint under
    // 1400 is a header that crops, which is the one thing the request ruled
    // out. Scoped to blocks that mention .tc-header — a guard that fails on an
    // unrelated line is a guard the next person deletes.
    const headerBlocks = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes('.tc-header'))
      .map((m) => Number(m[1]));
    expect(headerBlocks.length).toBeGreaterThan(0);
    for (const w of headerBlocks) expect({ breakpoint: w, atLeast1400: w >= 1400 }).toEqual({ breakpoint: w, atLeast1400: true });
  });

  it('promises the words only at a width that was measured to hold them', () => {
    // 1590px is the row with the words. Promising them at 1400 is the same
    // mistake as promising the line at 1280, and the margin above 1590 is for
    // a first name longer than the owner's — that pill is user data.
    const w = withWords();
    expect(w).not.toBeNull();
    expect({ breakpoint: w!.width, holds1590: w!.width >= 1600 })
      .toEqual({ breakpoint: w!.width, holds1590: true });
    // …and the words come back by SHOWING the label, not by re-typesetting the
    // districts. Reaching for --chip-fs here is how a big screen ends up with
    // phone-sized tabs.
    expect(w!.body).not.toMatch(/--chip-fs/);
  });

  it('moves the height by re-pointing the token every surface clears', () => {
    // --header-h is what the main column's padding, the sticky sidebar and four
    // full-height surfaces read. A second token, or a literal height here,
    // would be a 48px band of empty paper under a 60px bar.
    const t = [...tokens.matchAll(/@media \(min-width: 1400px\) \{[\s\S]*?\n\}/g)].map((m) => m[0])
      .find((b) => b.includes('--header-h')) ?? '';
    expect(t).toMatch(/:root \{ --header-h: 60px; \}/);
    // …and neither header block restates a height.
    expect(oneLine()).not.toMatch(/height:\s*\d/);
    expect(oneLine()).not.toMatch(/--header-h-1|min-height/);
    expect(withWords()!.body).not.toMatch(/height:\s*\d/);
  });

  it('hides the pill words but never their names', () => {
    // Between 1400 and the words breakpoint the pills are icons, and that is
    // where 170 of the needed pixels come from. An icon whose only label was
    // the span it just hid is a button a screen reader cannot announce, and
    // this is the assertion that says so.
    expect(oneLine()).toMatch(/\.tc-header \.tc-actionbar \.lab \{ display: none; \}/);
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
