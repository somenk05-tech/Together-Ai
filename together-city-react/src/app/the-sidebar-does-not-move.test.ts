import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');
const stripTs = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── THE SIDEBAR DOES NOT MOVE ───────────────────────────────────────────────
 *
 * Owner, 17 Aug, half an hour after asking for the opposite: "keep the side bar
 * fixed for the website… no change in the mobile design."
 *
 * THIS FILE REPLACES `a-rail-you-can-open.test.ts`, and it is worth being plain
 * about why rather than quietly swapping one for the other. That rail was built
 * to a measurement — 280px to 112px, exactly the 60% that was asked for, both
 * states rendered on the live page first. It measured well and it read badly. A
 * panel that appears because a mouse crossed it is a panel that appears when
 * nobody asked, and the pin only turned a width into something you had to hold
 * an opinion about. Asked which "fixed" he meant, the owner chose the plainest
 * one: always full width, nothing that collapses.
 *
 * So the guard is now the reverse assertion. Its whole job is to stop the rail
 * coming back by halves — a hover rule here, a stored width there — which is
 * exactly how it would return.
 */
describe('the sidebar does not move', () => {
  const layout = strip(read('styles/layout.css'));
  const side = stripTs(read('layouts/Sidebar.tsx'));
  const store = stripTs(read('store/ui.store.ts'));

  it('is one width on every desktop screen', () => {
    expect(layout).toMatch(/\.tc-side \{ width: 280px; flex-shrink: 0;/);
    // And no desktop media query touches it at all. This is the assertion that
    // would have to be deleted, not merely edited, to bring the rail back.
    const desktopBlocks = [...layout.matchAll(/@media \(min-width: (\d+)px\) \{([\s\S]*?)\n\}/g)]
      .filter((m) => m[2].includes('.tc-side'))
      .map((m) => Number(m[1]));
    expect(desktopBlocks).toEqual([]);
  });

  it('has nothing left that could narrow it', () => {
    // Comments stripped: the paragraph above these rules explains the rail that
    // was removed, and a guard that matches its own explanation is a guard that
    // fails for the wrong reason. That lesson cost an hour on 16 August.
    for (const trace of ['112px', '.pinned', 'rail-toggle', 'clip-path: inset(50%)', 'margin-right: -168px']) {
      expect({ trace, present: layout.includes(trace) }).toEqual({ trace, present: false });
    }
  });

  it('has no control on it and no state behind it', () => {
    for (const trace of ['railPinned', 'toggleRail', 'ChevronIcon', 'rail-toggle', 'aria-expanded']) {
      expect({ trace, inSidebar: side.includes(trace) }).toEqual({ trace, inSidebar: false });
    }
    // A remembered preference for a width nobody can change any more is a value
    // that can only ever be wrong, so the store lost it too.
    expect(store).not.toMatch(/railPinned|localStorage/);
    expect(store).toMatch(/sidebarOpen: false/);
  });

  it('leaves the phone drawer exactly as it was — the second half of the ask', () => {
    expect(layout).toMatch(/\.tc-side \{ position: fixed; top: 0; left: 0; bottom: 0; z-index: 200; transform: translateX\(-100%\)/);
    expect(layout).toMatch(/\.tc-side\.open \{ transform: translateX\(0\); \}/);
    expect(side).toMatch(/DrawerScrim open=\{open\} onClose=\{close\}/);
  });

  it('keeps the one thing that outlived the rail', () => {
    // The mode tabs' geometry came out of Sidebar.tsx's inline style object on
    // the way in. That was right for its own reason — an inline rule a
    // stylesheet can only reach with `!important` — and it is not part of what
    // was asked to be undone.
    expect(layout).toMatch(/\.tc-side \.mode-tab \{ gap: 12px; padding: 13px 16px; \}/);
    expect(side).not.toMatch(/padding: '13px 16px'/);
    expect(side).not.toMatch(/gap: 12,/);
  });
});
