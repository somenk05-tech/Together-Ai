import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * EVERY PRODUCT CARD SAYS WHAT IS IN IT, AND SAYS WHAT KIND OF LIST THAT IS.
 *
 * The owner asked (3 Sep) for an ingredients tab on every product. The shelf
 * carries the data sheet's KEY ingredients on every row and the pack's full
 * label on none, and the one way this tab goes wrong is quietly: a short list
 * printed under the word "Ingredients" with no caveat reads, to somebody
 * avoiding an allergen, as "not in it". So there is one component that prints
 * the list AND the sentence, both product surfaces use it, and the sentence
 * comes from the server's `ingredientsSource` rather than from the length of
 * the list.
 */
describe('the ingredients on every card', () => {
  const list = code('features/beauty/components/Ingredients.tsx');
  const routine = code('features/beauty/pages/Routine.tsx');
  const market = code('features/beauty/pages/Market.tsx');

  it('is one component, and both the routine card and the market tile print it', () => {
    expect(routine).toMatch(/<IngredientChips\b/);
    expect(market).toMatch(/<IngredientChips\b/);
    // Neither surface prints `ingredients` on its own.
    expect(routine).not.toMatch(/\.ingredients\.map\(/);
    expect(market).not.toMatch(/\.ingredients\.map\(/);
  });

  it('has no tab any more — chips on the face, and nothing that opens on "none on file" (owner, 4 Sep)', () => {
    expect(routine).not.toMatch(/title="Ingredients"/);
    expect(market).not.toMatch(/IngredientList/);
    expect(list).not.toMatch(/No ingredient list on file/);
    expect(list).not.toMatch(/export function IngredientList/);
  });

  it('shows nothing rather than a chip when the list is missing or empty', () => {
    expect(list).toMatch(/if \(!ingredients\.length\) return null;/);
    expect(list).toMatch(/const listOf = /);
  });

  it('is carried on the wire for both the routine step and the recommended product', () => {
    const api = code('features/beauty/api.ts');
    expect((api.match(/ingredients: string\[\]; ingredientsSource: 'sheet' \| 'label';/g) ?? []).length).toBe(2);
  });
});
