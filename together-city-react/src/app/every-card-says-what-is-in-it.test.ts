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
describe('the ingredients tab', () => {
  const list = code('features/beauty/components/Ingredients.tsx');
  const routine = code('features/beauty/pages/Routine.tsx');
  const market = code('features/beauty/pages/Market.tsx');

  it('is one component, and both the routine card and the market tile print it', () => {
    expect(routine).toMatch(/<IngredientList\b/);
    expect(market).toMatch(/<IngredientList\b/);
    // Neither surface prints `ingredients` on its own, which is how a second
    // rendering with no caveat would begin.
    expect(routine).not.toMatch(/\.ingredients\.map\(/);
    expect(market).not.toMatch(/\.ingredients\.map\(/);
  });

  it('says whether the list is the sheet\'s key ingredients or the pack\'s full label', () => {
    expect(list).toMatch(/source === 'label'/);
    expect(list).toMatch(/not the full label/i);
    expect(list).toMatch(/as printed on the pack/i);
  });

  it('shows the tab even when there is nothing in it, and says so', () => {
    expect(list).toMatch(/No ingredient list on file/);
  });

  it('is a fold on the routine card, using the city\'s one disclosure', () => {
    expect(routine).toMatch(/<Fold[^>]*\n?\s*title="Ingredients"/);
  });

  it('is carried on the wire for both the routine step and the recommended product', () => {
    const api = code('features/beauty/api.ts');
    expect((api.match(/ingredients: string\[\]; ingredientsSource: 'sheet' \| 'label';/g) ?? []).length).toBe(2);
  });
});
