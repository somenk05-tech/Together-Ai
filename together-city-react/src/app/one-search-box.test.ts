import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * ONE SEARCH BOX, AND THE COUNTRIES AT THE FOOT OF THE PAGE.
 *
 * The recipes page had two text fields stacked on top of each other — "Search
 * all recipes…" and, immediately beneath it, "Type an ingredient and press
 * Enter (e.g. paneer)". Nothing on the screen told you which one "paneer"
 * belonged in, and the honest answer was "either": the library's search has
 * always matched a recipe's NAME **or** its INGREDIENTS in the same OR, so the
 * second box led to a room you were already standing in.
 *
 * Below them sat twenty-two cuisine cards — the tallest thing on the page, and
 * the first question it asked. Nobody opens a recipe page wanting Norway's one
 * recipe. Cuisine is a real way in, so it kept a real link; it just moved to
 * the foot of the page, in one line, where an index belongs.
 *
 * Both are easy to undo by accident — a second search field creeps back the
 * next time somebody wants a "quick filter", and a grid is the default thing to
 * reach for when a list of names feels bare. So both get a line here.
 */
describe('the recipes page asks once', () => {
  const library = read('features/nutrition/pages/RecipeLibrary.tsx');

  it('has exactly one text input on the whole page', () => {
    const inputs = library.match(/<input\b/g) ?? [];
    expect(inputs).toHaveLength(1);
  });

  it('does not ask for an ingredient in a box of its own', () => {
    // Scoped to the attribute, not the file: the comment above the surviving
    // box quotes the old placeholder to record what was merged and why.
    expect(library).not.toMatch(/placeholder="[^"]*ingredient and press Enter/i);
    expect(library).not.toMatch(/onIngredientKey/);
  });

  it('says out loud that the one box covers both', () => {
    // A merged field that still reads "Search all recipes…" is a field whose
    // ingredient behaviour nobody discovers.
    const ph = library.match(/placeholder="([^"]*Search[^"]*)"/)?.[1] ?? '';
    expect(ph).toMatch(/dish/i);
    expect(ph).toMatch(/ingredient/i);
  });

  it('keeps the ingredient chips — an AND is not a search', () => {
    // Two ingredients means "both are in my kitchen", which search's OR cannot
    // express. The chips are the only thing that asks it.
    expect(library).toMatch(/INGREDIENT_CHIPS\.map/);
    expect(library).toMatch(/Cook from what you have/);
  });

  it('lists cuisines as one line, not a grid of cards', () => {
    expect(library).toMatch(/cuisineIndex/);
    expect(library).toMatch(/Browse by cuisine/);
    // The card grid printed a per-cuisine count under a name. Its absence is
    // the thing that keeps the index a line rather than a wall.
    expect(library).not.toMatch(/\{c\.count\.toLocaleString\(\)\} recipes/);
  });

  it('puts the index at the foot, under the add-your-own section', () => {
    const own = library.indexOf('<OwnRecipes />');
    const index = library.indexOf('{cuisineIndex}');
    expect(own).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(own);
  });

  it('survives page two, where the facet comes back empty', () => {
    // recipeLibrary() returns `cuisines` only on page 1. Reading the response
    // directly would blank the footer the moment somebody paged forward.
    expect(library).toMatch(/setCuisineList/);
    expect(library).toMatch(/cuisineList\.map/);
    expect(library).not.toMatch(/\(lib\.data\?\.cuisines \?\? \[\]\)\.map/);
  });
});
