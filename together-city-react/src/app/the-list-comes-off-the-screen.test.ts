import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * ── THE LIST COMES OFF THE SCREEN ───────────────────────────────────────────
 *
 * The owner, 16 Aug: a download for the grocery list.
 *
 * WHAT IS DOWNLOADED IS THE SHEET, AND THE MECHANISM IS PRINT. The list has
 * been a printed checklist since the 13 Aug reference — masthead, aisles, tick
 * boxes, dotted leaders to right-aligned quantities — so the file worth having
 * is that sheet, and every print dialog on every platform already offers "Save
 * as PDF". A hand-built PDF would have been a second layout to keep in step
 * with this one and a file nobody could send to a printer; a .txt would have
 * thrown away the boxes, which are the reason a grocery list leaves the house.
 *
 * This is the FIRST @media print block in the city, so the rules it establishes
 * are worth pinning rather than leaving to the next person to rediscover:
 *
 *   1. ONLY THE SHEET PRINTS, and it is hidden by `visibility`, not `display`.
 *      Collapsing the boxes above with `display: none` leaves the sheet
 *      wherever the flow put it, and page one comes out with a header-shaped
 *      hole in it.
 *   2. THE COLOUR RE-POINT IS IN tokens.css. The whole --grocery-* scale flips
 *      to black on white in one block; every rule in relief.css inherits it
 *      untouched. A print rule that re-states an ink is a colour decision in
 *      the wrong file — relief.spec already forbids that on screen.
 *   3. THE TICK BOXES SURVIVE. Hiding "every button in the sheet" would take
 *      them with the two controls, and a checklist with no boxes is a receipt.
 */
describe('the grocery list comes off the screen', () => {
  const relief = strip(read('styles/relief.css'));
  const tokens = strip(read('styles/tokens.css'));
  const page = read('features/nutrition/components/GroceryPlanner.tsx');

  /** The print block in relief.css — the one that carries the sheet's rules. */
  const printBlock = () => {
    const blocks = [...relief.matchAll(/@media print \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.grocery-sheet')) ?? '';
  };

  it('has a Download control beside Send, and it prints', () => {
    expect(page).toMatch(/className="gsheet-print"/);
    expect(page).toMatch(/onClick=\{\(\) => window\.print\(\)\}/);
    // The label says what it does for somebody who cannot see the mark.
    expect(page).toMatch(/aria-label="Download or print this grocery list"/);
    // Both controls in one named row, which is what print hides by name.
    expect(page).toMatch(/<div className="gsheet-acts">/);
  });

  it('prints the sheet and nothing else, without collapsing the page', () => {
    const p = printBlock();
    expect(p).toMatch(/body \* \{ visibility: hidden; \}/);
    expect(p).toMatch(/\.grocery-sheet, \.grocery-sheet \* \{ visibility: visible; \}/);
    // display:none on the chrome would leave the sheet mid-page on sheet one.
    expect(p).not.toMatch(/body \* \{ display: none/);
    expect(p).toMatch(/position: absolute/);
  });

  it('keeps the tick boxes and drops only the two controls', () => {
    const p = printBlock();
    expect(p).toMatch(/\.gsheet-acts \{ display: none; \}/);
    expect(p).toMatch(/\.gsheet-people button \{ display: none; \}/);
    // A blanket rule would take `.gsheet-box` with them — it is a button too.
    expect(p).not.toMatch(/\.grocery-sheet button \{ display: none/);
    expect(p).not.toMatch(/\.gsheet-box \{ display: none/);
    // …and the ticked fill is a background, which browsers drop by default.
    expect(p).toMatch(/print-color-adjust: exact/);
  });

  it('lays the sheet out for paper rather than for a screen', () => {
    const p = printBlock();
    // Two columns on A4 puts a quantity nearer the next aisle's name than its own.
    expect(p).toMatch(/\.gsheet-cols \{ columns: 1;/);
    expect(p).toMatch(/\.gsheet-aisle \{[^}]*page-break-inside: avoid/);
    expect(p).toMatch(/@page \{ margin/);
  });

  it('re-points the ink in the token file, not in the print rules', () => {
    // One block flips the whole scale; nothing in relief.css re-states an ink.
    const t = [...tokens.matchAll(/@media print \{[\s\S]*?\n\}/g)].map((m) => m[0])
      .find((b) => b.includes('.grocery-sheet')) ?? '';
    expect(t).toMatch(/--grocery-ink:\s*#000/);
    expect(t).toMatch(/--grocery-sheet-img: none/);
    // A photograph of blue card, printed, is a page of ink for a ground that
    // is already there.
    expect(printBlock()).toMatch(/background-image: none/);
    // The print block must not be where colour gets decided.
    expect(printBlock()).not.toMatch(/--grocery-ink\s*:/);
    /**
     * AND THE PAPER IS A TOKEN, NOT A WHITE LITERAL.
     *
     * The first cut of this wrote `background-color: #fff` straight into the
     * print block and relief.spec failed it twice — once for a surface literal
     * in the material file, once for a lit ground in it. Both are right, and
     * for the same reason the ink re-point is in tokens.css: a white surface
     * written into relief.css is a colour decision taken in the file nobody
     * repaints. On screen the ground is the photograph, so the token is
     * `transparent` and the sheet paints nothing behind it.
     */
    expect(printBlock()).toMatch(/background-color: var\(--grocery-paper\)/);
    expect(t).toMatch(/--grocery-paper:\s*#fff/);
    expect(tokens).toMatch(/--grocery-paper:\s*transparent/);
  });

  it('gives the new control the city’s 44px target without growing its paint', () => {
    // Same pattern as .btn-sm and .gsheet-box: a transparent centred pseudo.
    const rule = relief.slice(relief.indexOf('.gsheet-print::after'));
    expect(rule.slice(0, 400)).toMatch(/min-width: 44px/);
    expect(rule.slice(0, 400)).toMatch(/min-height: 44px/);
    expect(relief).toMatch(/\.gsheet-print \{[^}]*font-size: 12px/);
  });
});
