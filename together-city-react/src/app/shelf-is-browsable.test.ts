import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/**
 * Comments out, before anything is looked for.
 *
 * The first version of this file failed on its own subject matter: the header
 * of Market.tsx explains that segmenting by the word "Haircare" was the bug,
 * and the assertion looking for that word found it in the explanation. A guard
 * that cannot tell code from the note above it is a guard that gets an
 * exemption comment and then gets deleted.
 */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * THE SHOP AND THE ROUTINE HAVE TO KNOW ABOUT EACH OTHER.
 *
 * Two things here, and both are the kind that break silently.
 *
 * ONE: THE SEGMENTS. The market split its shelf into Skin and Hair by looking
 * for the words "Haircare", "Hair" or "Scalp" in the display CATEGORY. That was
 * true of the thirteen invented products it was written against. It is false of
 * the seventy real ones — "Shampoo" and "Conditioner" contain none of those
 * words, so the two most obvious hair products in the shop were filed under
 * Skin, and fifteen body products went there too. Nothing failed; the Skin tab
 * simply had a shampoo in it. The catalogue carries `group` for exactly this,
 * and category-sniffing must not come back.
 *
 * TWO: THE ROUTINE FLAG. A citizen who has been told to use a cleanser every
 * morning should not be sold the same bottle again without a word. The market
 * reads the routine it has already been given rather than re-deriving one,
 * because two answers to "is this in my routine" is one answer too many.
 */
describe('the market shelf', () => {
  const market = code('features/beauty/pages/Market.tsx');

  it('segments by the product group, not by sniffing its category', () => {
    // The field, used.
    expect(market).toMatch(/p\.group === seg/);
    // And the old rule, gone — including the constant it lived in.
    expect(market).not.toMatch(/HAIR_CATS/);
    expect(market).not.toMatch(/Haircare/);
  });

  it('offers all three groups the catalogue actually has', () => {
    for (const g of ['Skincare', 'Hair Care', 'Body Care']) {
      expect({ group: g, offered: market.includes(`'${g}'`) }).toEqual({ group: g, offered: true });
    }
  });

  it('says when a product is already in the routine, reading the routine to find out', () => {
    expect(market).toMatch(/useBeautyRoutine/);
    expect(market).toMatch(/inRoutine/);
    // Named bands rather than a bare tick: "in your routine" leaves somebody
    // hunting through four bands for the one it means.
    expect(market).toMatch(/BAND_WORD/);
  });

  it('shows the whole shelf rather than a page of it', () => {
    // The endpoint has never capped and neither should the page. Named by the
    // variables that hold the shelf, because `actives.slice(0, 3)` on a tile is
    // a perfectly good three-ingredient summary and not a truncated catalogue.
    expect(market).not.toMatch(/\b(all|inSegment|shown|rows|products)\.slice\(0,\s*\d+\)/);
  });

  it('shares one picture-fallback with the routine, rather than keeping its own', () => {
    const routine = code('features/beauty/pages/Routine.tsx');
    const shot = code('features/beauty/components/ProductShot.tsx');
    expect(market).toMatch(/from '\.\.\/components\/ProductShot'/);
    expect(routine).toMatch(/from '\.\.\/components\/ProductShot'/);
    // Primary, then alternate, then a mark. `key` on the img is what makes the
    // walk work — without it React reuses the node and the second onError may
    // never fire, so the fallback silently stops after one step.
    expect(shot).toMatch(/key=\{src\}/);
    expect(shot).toMatch(/onError/);
  });
});
