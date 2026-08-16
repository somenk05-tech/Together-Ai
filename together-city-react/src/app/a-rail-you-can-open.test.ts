import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── A RAIL YOU CAN OPEN ─────────────────────────────────────────────────────
 *
 * The owner, 17 Aug: "reduce the side profile by 60 percent to be more
 * aesthetic with an expandable view."
 *
 * 280px → 112px is that 60% exactly, and 280 is the number the sidebar was
 * MEASURED at on the live page rather than the number a stylesheet claimed —
 * the same correction the header needed an hour earlier, applied before the
 * mistake rather than after it.
 *
 * Three things here are load-bearing and none of them is the width:
 *
 *  1. A PEEK OVERLAYS, A PIN RESERVES. Hover floats the full panel over the
 *     page (`margin-right: -168px`, which is 280 − 112) so a mouse crossing the
 *     rail never reflows the page under the reader. The pin gives back a real
 *     280px column with nothing overlapping — the sidebar exactly as it was.
 *  2. THE WORDS ARE CLIPPED, NEVER REMOVED. `display: none` on those labels is
 *     a menu a screen reader reads as "01, 02, 03, 04".
 *  3. THE PIN IS REMEMBERED AND THE DRAWER IS NOT. They are opposite kinds of
 *     state and the store has to say so.
 */
describe('a rail you can open', () => {
  const layout = strip(read('styles/layout.css'));
  const side = read('layouts/Sidebar.tsx');
  const store = read('store/ui.store.ts');

  /** The desktop rail block. */
  const rail = () => {
    const blocks = [...layout.matchAll(/@media \(min-width: 900px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.tc-side') && b.includes('width: 112px')) ?? '';
  };

  it('collapses the 280px sidebar to 112px — the 60% that was asked for', () => {
    // Both numbers, in one file, so the arithmetic is checkable by a reader and
    // not just by whoever wrote it. 280 × 0.4 = 112.
    expect(layout).toMatch(/\.tc-side \{ width: 280px;/);
    expect(rail()).toMatch(/\.tc-side \{ width: 112px;/);
    expect({ reduction: 1 - 112 / 280 }).toEqual({ reduction: 0.6 });
  });

  it('lets a peek float over the page instead of reflowing it', () => {
    // 280 − 112 = 168. Without this the column grows on hover and every line of
    // the page shifts under a mouse that was only passing through.
    const b = rail();
    expect(b).toMatch(/\.tc-side:is\(:hover, :focus-within\):not\(\.pinned\) \{[^}]*margin-right: -168px/);
    // …and the shadow is one of the three heights this application has, not a
    // number somebody liked. This assertion is here because the first draft was
    // a hand-written `12px 0 28px -18px` and relief.spec rejected it: `.modal`
    // is what a panel floating over the page stands at, so a peek stands there.
    expect(b).toMatch(/\.tc-side:is\(:hover, :focus-within\):not\(\.pinned\) \{[^}]*box-shadow: var\(--e3\)/);
    // …and the keyboard opens it too. A rail that only answers a mouse is a
    // rail a tab key walks through blind.
    expect(b).toMatch(/:focus-within/);
  });

  it('gives the pin a reserved column, not an overlay', () => {
    // The whole reason the pin is worth having: pinned is the sidebar exactly
    // as it was, 280px of real column with nothing floating over the page.
    const b = rail();
    expect(b).toMatch(/\.tc-side:is\(:hover, :focus-within, \.pinned\) \{ width: 280px; \}/);
    const pinnedOnly = b.split('\n').filter((l) => l.includes('.pinned') && !l.includes(':hover'));
    for (const line of pinnedOnly) {
      expect({ line, overlays: /margin-right: -/.test(line) }).toEqual({ line, overlays: false });
    }
  });

  it('clips the words out of the picture, never out of the document', () => {
    // An icon rail whose labels are `display: none` announces itself as four
    // numbers. These are taken out of the picture and left in the tree.
    const b = rail();
    expect(b).toMatch(/\.tc-side \.hubname, \.tc-side \.side-menu \.l, \.tc-side \.back \.w \{[^}]*clip-path: inset\(50%\)/);
    expect(b).not.toMatch(/\.side-menu \.l \{ display: none/);
    expect(b).not.toMatch(/\.back \.w \{ display: none/);
    // The sub-line is the one thing genuinely dropped — it repeats on the peek.
    expect(b).toMatch(/\.tc-side \.hubtag, \.tc-side \.side-menu \.s \{ display: none; \}/);
    // …and the markup has to give the CSS something to clip.
    expect(side).toMatch(/← <span className="w">Back<\/span>/);
    expect(side).toMatch(/<span className="w">Search the city<\/span>/);
  });

  it('has one control, and it says what pressing it does', () => {
    // aria-expanded is the state; the label is the action. A control whose only
    // job is a width needs both or it announces nothing a reader can act on.
    expect(side).toMatch(/className="rail-toggle" aria-expanded=\{railPinned\}/);
    expect(side).toMatch(/aria-label=\{railPinned \? 'Collapse the hub rail' : 'Keep the hub rail open'\}/);
    expect(side).toMatch(/onClick=\{\(\) => toggleRail\(\)\}/);
    expect(side).toMatch(/\$\{railPinned \? ' pinned' : ''\}/);
    // Below 900px this aside is the phone drawer, which already has a scrim, a
    // swipe and the burger that opened it. A fourth way out is a fourth thing
    // to explain.
    expect(layout).toMatch(/\.tc-side \.rail-toggle \{ display: none; \}/);
    expect(rail()).toMatch(/\.tc-side \.rail-toggle \{\s*display: flex;/);
  });

  it('remembers the pin and refuses to remember the drawer', () => {
    // Opposite kinds of state. A phone drawer that reopens itself on the next
    // page is a bug; a sidebar width that forgets itself on every navigation is
    // a chore.
    expect(store).toMatch(/railPinned: readPinned\(\)/);
    expect(store).toMatch(/sidebarOpen: false/);
    expect(store).toMatch(/localStorage\.setItem\(RAIL_KEY/);
    // Storage throws in a private window with it disabled, and a rail that
    // cannot remember its width is not a reason to fail to render.
    expect(store).toMatch(/try \{ return localStorage\.getItem\(RAIL_KEY\) === '1'; \} catch \{ return false; \}/);
  });

  it('leaves the phone drawer exactly as it was', () => {
    // Nothing in this change may touch the aside a phone sees.
    expect(layout).toMatch(/\.tc-side \{ position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; transform: translateX\(-100%\)/);
    expect(layout).toMatch(/\.tc-side\.open \{ transform: translateX\(0\); \}/);
    // …and the rail's own rules never escape the desktop breakpoint.
    const desktopOnly = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes('width: 112px')).map((m) => Number(m[1]));
    expect(desktopOnly).toEqual([900]);
  });
});
