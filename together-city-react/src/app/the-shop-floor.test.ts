import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * The beauty hub is laid out as a shop (owner, 3 Sep: "audit the design of
 * the page and fix the design, make it like a Shopify site" — routine, market
 * and orders together, a clean product grid, a cart drawer with checkout, a
 * collection layout on the market, the budget as a small summary bar).
 *
 * Four things this pins, each of which a tidy-up could undo without noticing:
 * one card anatomy for a product on both floors; the budget as one strip
 * rather than three sheets of prose; a drawer that is a real dialog; and a
 * market whose filters are a labelled rail, not a row of unlabelled chips.
 */

const routine = code('features/beauty/pages/Routine.tsx');
const market = code('features/beauty/pages/Market.tsx');
const bar = code('features/beauty/components/BeautyBagBar.tsx');
const layout = code('styles/layout.css');

describe('one product, one card, on both floors', () => {
  it('dresses the routine step in the market tile\'s classes', () => {
    for (const cls of ['st-role', 'st-name', 'st-brand', 'st-price', 'st-add', 'st-qty']) {
      expect({ cls, routine: routine.includes(`"${cls}`) || routine.includes(` ${cls}`) }).toEqual({ cls, routine: true });
      expect({ cls, market: market.includes(`"${cls}`) }).toEqual({ cls, market: true });
    }
  });

  it('gives the routine well the tile\'s square, not a fixed height', () => {
    const well = layout.slice(layout.indexOf('.routine-well {')).split('}')[0];
    expect(well).toMatch(/aspect-ratio: 1 \/ 1/);
    expect(well).not.toMatch(/height: \d+px/);
  });

  it('puts the key ingredients on the face of the card, from the one component', () => {
    const list = code('features/beauty/components/Ingredients.tsx');
    expect(list).toMatch(/export function IngredientChips/);
    expect(routine).toMatch(/<IngredientChips ingredients=\{s\.ingredients\}/);
    expect(market).toMatch(/<IngredientChips ingredients=\{p\.ingredients\}/);
    expect(routine).not.toMatch(/\.ingredients\.map\(/);
    expect(market).not.toMatch(/\.ingredients\.map\(/);
  });

  it('survives a server that has not sent the ingredient list yet', () => {
    // The two rails deploy separately (4 Sep, live: "undefined is not an
    // object (evaluating 'n.length')" over the whole routine page).
    const list = code('features/beauty/components/Ingredients.tsx');
    expect(list).toMatch(/const listOf = \(v: string\[\] \| undefined \| null\): string\[\] => \(Array\.isArray\(v\) \? v : \[\]\)/);
    expect(list).toMatch(/ingredients\?: string\[\] \| null/);
    expect(list).toMatch(/source = 'sheet'/);
  });

  it('names every stepper button for a screen reader', () => {
    for (const src of [routine, market, bar]) {
      expect(src).toMatch(/aria-label=\{`One fewer \$\{/);
      expect(src).toMatch(/aria-label=\{`One more \$\{/);
    }
  });
});

describe('the budget is a strip', () => {
  it('is one section of three meters, not three sheets', () => {
    expect(routine).toMatch(/className="rt-budget beauty-sheet"/);
    expect(routine).toMatch(/className="rt-meters"/);
    expect(routine).not.toMatch(/<dl\b/);
  });

  it('carries none of the three paragraphs the owner struck', () => {
    expect(routine).not.toMatch(/Not treated here/);
    expect(routine).not.toMatch(/You told us you already have/);
    expect(routine).not.toMatch(/c\.kept\.length > 0 &&/);
  });

  it('prints the upkeep once per meter and once in the head', () => {
    expect((routine.match(/\/month to keep/g) ?? []).length).toBeLessThanOrEqual(4);
  });
});

describe('the bag drawer', () => {
  it('is a dialog: named, modal, closable from the keyboard and the scrim', () => {
    expect(bar).toMatch(/role="dialog"/);
    expect(bar).toMatch(/aria-modal="true"/);
    expect(bar).toMatch(/aria-labelledby="beauty-bag-title"/);
    expect(bar).toMatch(/e\.key === 'Escape'/);
    expect(bar).toMatch(/className=\{`bag-scrim/);
    expect(bar).toMatch(/aria-label="Close the bag"/);
  });

  it('slides in from the right and is hidden, not just transparent, when closed', () => {
    const drawer = layout.slice(layout.indexOf('.bag-drawer {')).split('}')[0];
    expect(drawer).toMatch(/transform: translateX\(100%\)/);
    expect(drawer).toMatch(/visibility: hidden/);
  });

  it('checks out to My Orders and never charges from the drawer', () => {
    expect(bar).toMatch(/to="\/beauty\/orders"/);
    expect(bar).not.toMatch(/PaymentSheet/);
    expect(bar).toMatch(/Subtotal/);
  });

  it('still has its foot summary, so the bag is reachable without a corner button', () => {
    expect(bar).toMatch(/className="beauty-sheet"/);
    expect(bar).toMatch(/className="bag-fab"/);
  });
});

describe('the market is a collection page', () => {
  it('has a breadcrumb, a labelled rail and a titled grid', () => {
    expect(market).toMatch(/aria-label="Breadcrumb"/);
    expect(market).toMatch(/aria-label="Filter the shelf"/);
    expect(market).toMatch(/htmlFor="market-sort"/);
    expect(market).toMatch(/htmlFor="market-q"/);
    expect(market).toMatch(/className="mk-title"/);
  });

  it('retired the centred tab row and the three-column bar', () => {
    expect(market).not.toMatch(/market-tabs|market-bar/);
    expect(layout).not.toMatch(/\.market-tabs \{|\.market-bar \{/);
  });

  it('folds the rail above the grid on a phone', () => {
    expect(layout).toMatch(/@media \(max-width: 900px\) \{\s*\.mk-layout \{ grid-template-columns: 1fr;/);
  });
});
