import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bagKey } from '@/features/beauty/api';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * THE WHOLE ROUTINE GOES IN AT ONCE — AND COMES BACK OUT AT ONCE.
 *
 * The owner asked for a button that adds the complete routine, on a phone and
 * at a desk. This button existed once and was removed at the owner's word, on
 * an objection that was correct: adding ten products in one tap was the one
 * bag action nobody could undo in one tap.
 *
 * So the thing this guards is not the button. It is the three properties that
 * let the button back:
 *
 *   1. IT IS REVERSIBLE. `addAll` returns the bag it replaced and `restore`
 *      puts it back, and the page offers Undo only while the bag still looks
 *      like what the press wrote — otherwise Undo would throw away whatever
 *      the citizen did in between.
 *   2. IT TOPS UP; IT DOES NOT RESET. Quantities already in the bag are kept,
 *      missing ids arrive at one, nothing is ever removed. Pressing twice buys
 *      nothing the first press did not.
 *   3. IT IS ONE CONTROL IN TWO PLACES. The summary card at the top prices the
 *      routine; the foot is where somebody is standing once they have read it.
 *      On a phone the first is a long scroll away from the second. Written
 *      once, rendered twice, so the two cannot drift.
 *
 * And one thing this must NOT break: the reorder guard pins the exact
 * adjacency of the product count and NextOrder inside that summary card, so
 * the control hangs BELOW NextOrder rather than between them.
 */
describe('the whole routine goes in at once', () => {
  const page = read('features/beauty/pages/Routine.tsx');
  const api = read('features/beauty/api.ts');
  const css = read('styles/layout.css');

  it('tops the bag up rather than resetting it', () => {
    // The merge, read off the source: nothing is dropped, and an id already
    // present is not touched.
    expect(api).toMatch(/addAll: \(ids: string\[\]\) => \{/);
    expect(api).toMatch(/const have = new Set\(prev\.map\(\(l\) => l\.id\)\)/);
    expect(api).toMatch(/ids\.filter\(\(id\) => !have\.has\(id\)\)\.map\(\(id\) => \(\{ id, qty: 1 \}\)\)/);
    // …and it hands back what it replaced, or there is nothing to undo to.
    expect(api).toMatch(/return \{ prev, key: bagKey\(next\) \}/);
    expect(api).toMatch(/restore: \(prev: \{ id: string; qty: number \}\[\]\) => put\(prev\)/);
  });

  it('the signature is order-independent, so undo survives a reordered bag', () => {
    // The server does not promise line order. If bagKey depended on it, Undo
    // would vanish at random.
    const a = bagKey([{ id: 'b', qty: 2 }, { id: 'a', qty: 1 }]);
    const b = bagKey([{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }]);
    expect(a).toBe(b);
    // …and it is sensitive to quantity, or a +1 elsewhere would not retire it.
    expect(bagKey([{ id: 'a', qty: 1 }])).not.toBe(bagKey([{ id: 'a', qty: 2 }]));
  });

  it('only offers Undo while the bag is still what the press made it', () => {
    expect(page).toMatch(/const canUndo = Boolean\(addedAll\) && addedAll!\.key === bagKey\(/);
    expect(page).toMatch(/bagged\.restore\(addedAll!\.prev\); setAddedAll\(null\)/);
  });

  it('adds only what the per-step buttons have not already', () => {
    expect(page).toMatch(/const missing = everyStep\.filter\(\(s\) => bagged\.qtyOf\(s\.productId\) === 0\)/);
    expect(page).toMatch(/bagged\.addAll\(missing\.map\(\(s\) => s\.productId\)\)/);
    // Nothing left to add is said, not drawn as a button that would do nothing.
    expect(page).toMatch(/Every step is in your bag/);
  });

  it('is one element rendered twice — the card and the foot', () => {
    expect(page.match(/\{addWhole\}/g)?.length).toBe(2);
    /* THE BAG CAME BETWEEN THEM ON 6 SEP, at the owner's word: the running
       total and the way to pay it were the LAST things on the page, under the
       four assurances and the market links — two blocks that are read once and
       never acted on. The order this pins is the one that matters: add the
       whole routine, then what you have picked up, then the assurances. */
    expect(page).toMatch(/\{addWhole\}\s*\n[\s\S]{0,600}?<BeautyBagBar \/>\s*\n\s*\n\s*<div className="routine-assure beauty-sheet">/);
    // Both boxes are styled, or the foot copy inherits the card's full-width
    // button in the middle of the page.
    expect(css).toMatch(/\.routine-addall \{/);
    expect(css).toMatch(/\.beauty-sheet \+ \.routine-addall/);
  });

  it('does not come between the product count and the next order', () => {
    // a-routine-counts-down-to-its-next-order pins this adjacency; the control
    // hangs below NextOrder for that reason and this says so out loud.
    expect(page).toMatch(/\{everyStep\.length\} products<\/div>\s*\n\s*\{data\?\.reorder && <NextOrder due=\{data\.reorder\} \/>\}\s*\n\s*\{addWhole\}/);
  });

  it('still keeps the bag on the server, not in this page', () => {
    expect(page).not.toMatch(/useState<Record<string, number>>/);
    expect(page).not.toMatch(/setBag/);
    expect(api).not.toMatch(/localStorage|sessionStorage/);
  });
});
