import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', '..', p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * BUILD YOUR DAY — owner, 18 Sep.
 *
 * "The profile determines what is eligible, the day's food determines what is
 * still needed, and the remaining nutrition determines what Together City
 * recommends next." These pin the shape of the page that does that, so a
 * later edit cannot quietly turn it back into a recipe catalogue.
 */
describe('Build Your Day — step 03 is a closed loop', () => {
  const page = strip(read('src/features/nutrition/pages/RecipeLibrary.tsx'));
  const loop = strip(read('src/features/nutrition/components/DayLoop.tsx'));
  const sheet = strip(read('src/features/nutrition/components/AddFoodSheet.tsx'));
  const api = strip(read('src/features/nutrition/day.api.ts'));
  const composed = strip(read('src/features/nutrition/composed.api.ts'));

  it('reads the target, the reading, the recommendations and the advice from ONE call', () => {
    // One object, so the header cannot say one thing and the advice another.
    expect(api).toMatch(/api\.get<DayRead>\('\/nutrition\/day'/);
    expect(page).toMatch(/useBuildYourDay\(now\)/);
    expect(page).toMatch(/<DayTargetHead t=\{read\.data\.target\}/);
    expect(page).toMatch(/<DayLines lines=\{read\.data\.lines\}/);
    expect(page).toMatch(/<AdviceList advice=\{read\.data\.advice\}/);
    expect(page).toMatch(/<EatNow read=\{read\.data\}/);
  });

  it('shows the database already filtered — the page never calls the unfiltered library', () => {
    expect(page).toMatch(/useDayRecipes\(q, true\)/);
    expect(page).not.toMatch(/useRecipeLibrary/);
    expect(api).toMatch(/'\/nutrition\/day\/recipes'/);
  });

  it('prints the kind of number each figure is — budget, target, range — never "hit this exact number"', () => {
    expect(loop).toMatch(/Energy budget/);
    expect(loop).toMatch(/Protein · target/);
    expect(loop).toMatch(/Fat · range/);
    expect(loop).toMatch(/Carbohydrate · range/);
    expect(loop).toMatch(/l\.kindLabel/);
  });

  it('says the target is an estimate when the body is not on file, and names what is missing', () => {
    expect(loop).toMatch(/t\.estimate && ' This is an estimate: '/);
    expect(loop).toMatch(/t\.readiness\.missing/);
  });

  it('says when blood work informed it — from the server\'s own flag, not a guess', () => {
    expect(loop).toMatch(/\{t\.basis\}/);
    expect(api).toMatch(/bloodInformed: boolean/);
  });

  it('asks "what should I eat now?" and adds the plate at the portion that fits', () => {
    expect(loop).toMatch(/What should I eat now\?/);
    expect(loop).toMatch(/Your portion/);
    expect(loop).toMatch(/onAdd\(c\.recipeId, c\.portionPct\)/);
    expect(loop).toMatch(/<span>Why\?<\/span> \{c\.why\}/);
    expect(page).toMatch(/portionPct < 100 \? \{ portionPct \} : \{\}/);
  });

  it('a tile adds the dish at its fitted portion, and says the standard serving was scaled', () => {
    expect(page).toMatch(/r\.fit\.portionPct < 100 \? \{ portionPct: r\.fit\.portionPct \} : \{\}/);
    expect(page).toMatch(/% of a serving/);
    expect(page).toMatch(/Over what's left today/);
  });

  it('+ Add food takes anything eaten: cooked, restaurant, packaged, quick — and a city recipe is the search', () => {
    for (const mode of ['cooked', 'restaurant', 'packaged', 'quick']) expect(page).toMatch(new RegExp(`mode: '${mode}'`));
    expect(page).toMatch(/getElementById\('byd-search'\)\?\.focus\(\)/);
    expect(composed).toMatch(/useAddFoodToOwnPlan = \(\) => useOwnMutation<OwnFoodInput>\('\/nutrition\/plan\/own\/food'\)/);
  });

  it('a sentence becomes an estimate the citizen reviews before it counts — every number editable', () => {
    expect(api).toMatch(/'\/nutrition\/journal\/analyze'/);
    expect(sheet).toMatch(/estimateFood\(/);
    expect(sheet).toMatch(/Review the estimate/);
    expect(sheet).toMatch(/Estimates, not measurements/);
    // The reader being off is not a refusal: the numbers can always be typed.
    expect(sheet).toMatch(/add the numbers yourself below/);
  });

  it('the protein quick fixes are real amounts, and each one can go straight onto the day', () => {
    expect(loop).toMatch(/Quick fixes/);
    expect(loop).toMatch(/onQuickAdd\(f\)/);
    expect(loop).toMatch(/another option/);
    expect(page).toMatch(/prefill: \{ name: fix\.name, qty: fix\.amount/);
  });

  it('every write to the day refetches the loop — the recommendations follow the food', () => {
    expect(composed).toMatch(/invalidateQueries\(\{ queryKey: \['nutrition', 'day'\] \}\)/);
  });

  it('keeps the add-food inputs in the sheet, so the page still has one search box', () => {
    expect((page.match(/<input\b/g) ?? []).length).toBe(1);
    expect(sheet).toMatch(/<input\b/);
  });

  it('is styled in the press vocabulary and the sheet is loaded once', () => {
    const css = read('src/styles/build-your-day.css');
    for (const cls of ['byd-target', 'byd-line', 'byd-adv', 'byd-rec', 'byd-door', 'byd-sheet']) expect(css).toContain(`.${cls}`);
    expect(css).not.toMatch(/@font-face|box-shadow/);
    expect(read('src/main.tsx')).toMatch(/import '\.\/styles\/build-your-day\.css'/);
  });
});
