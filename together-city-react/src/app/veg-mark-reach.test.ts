import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(web, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * EVERY DISH SAYS WHAT IT IS.
 *
 * The veg/non-veg/egg mark reached the recipe library, the recipe page and the
 * old meal card, and never reached the printed day — which is the surface a
 * citizen actually reads their week on. So the one screen where somebody
 * decides what to cook tonight was the one screen that did not say whether it
 * had meat in it.
 *
 * `diet` has been on every component the API returns since the mark was built
 * (MealComponentOut.diet, "for the veg mark"). Nothing was missing but the
 * rendering, which is exactly the kind of gap that survives a redesign: the day
 * view was rewritten as a printed page and the mark was not in the new markup.
 */
describe('the veg mark reaches every surface that names a dish', () => {
  /** file → what it draws a dish on. */
  const SURFACES: [string, string][] = [
    ['src/features/nutrition/components/PressCourse.tsx', 'the printed day — one row per dish'],
    ['src/features/nutrition/components/ComposedMealCard.tsx', 'the meal card'],
    ['src/features/nutrition/pages/RecipeLibrary.tsx', 'the recipe library'],
    ['src/features/nutrition/pages/RecipeDetail.tsx', 'the recipe page'],
  ];

  it.each(SURFACES)('%s draws the mark', (file) => {
    const src = strip(read(file));
    expect(src).toMatch(/<VegMark\b/);
    expect(src).toMatch(/from '[^']*VegMark'/);
  });

  it('the printed day marks each DISH, not just the course', () => {
    // A mark on the course heading answers "does this meal contain meat"; the
    // question in front of somebody reading a menu is which dish does.
    const src = strip(read('src/features/nutrition/components/PressCourse.tsx'));
    const row = src.slice(src.indexOf('press-name-cell'), src.indexOf('press-acts'));
    expect(row).toMatch(/<VegMark\s+diet=\{c\.diet\}/);
  });

  it('the mark reads the dish’s own diet, never the citizen’s', () => {
    // The citizen's diet says what they are willing to eat. The dish's says what
    // is in it, and those differ on exactly the plate this matters for.
    const src = strip(read('src/features/nutrition/components/PressCourse.tsx'));
    expect(src).not.toMatch(/<VegMark[^>]*diet=\{(prefs|profile|user)/);
  });

  it('an unknown diet marks veg, which is the only safe default', () => {
    const src = strip(read('src/features/nutrition/components/VegMark.tsx'));
    // dietKind falls through to 'veg'. Marking an unknown dish non-veg would
    // frighten a vegetarian off food they can eat; the corpus's own diet field
    // is what decides, and a missing one means the dish carries no meat tag.
    expect(src).toMatch(/return 'veg';/);
  });
});
