import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const master = read('features', 'profile', 'pages', 'MasterProfile.tsx');
const prefs = read('features', 'nutrition', 'pages', 'Preferences.tsx');
const module_ = read('features', 'nutrition', 'cuisineMix.ts');
const codeOnly = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

/**
 * The cuisine mix is editable in TWO places and stored in ONE.
 *
 * Owner decision: put a real editor on the Master Profile, not a read-only
 * summary. Two writers for one field is how Beauty destroyed a non-binary
 * citizen's genderIdentity on a skin-type save (d7b0d43) — so the way this was
 * built matters more than usual, and these are the three properties that keep
 * it safe.
 *
 * 1. NOTHING IS COPIED. The mix stays in FoodPref.extras. It is not a
 *    SharedField, not a MasterProfile column, and never passes through
 *    syncShared() — so there is no second copy to overwrite. Two editors on one
 *    store is ordinary; two stores would not be.
 * 2. THE SAVE MERGES. `extras` is replaced wholesale by the server, so a
 *    payload built from scratch deletes the citizen's allergies, proteins and
 *    health conditions. withMix() spreads what is already there, and both
 *    editors go through it.
 * 3. ONE LIST, ONE CAP. Two editors that disagree about which cuisines exist or
 *    how the 100% cap works are worse than one editor. The list and the
 *    arithmetic live in cuisineMix.ts and nowhere else.
 */
describe('the cuisine mix', () => {
  it('is defined in exactly one place, for the two editors that share it', () => {
    expect(codeOnly(module_)).toMatch(/export const CUISINES = \[/);
    // Neither MIX editor may keep its own copy of the list.
    expect(codeOnly(prefs)).not.toMatch(/const CUISINES = \[/);
    expect(codeOnly(master)).not.toMatch(/const CUISINES = \[/);
    for (const page of [prefs, master]) expect(page).toMatch(/from '[^']*cuisineMix'/);
  });

  it('gives the per-slot lock every kitchen the mix has, and one the mix must not', () => {
    // WAS: MealPlan.tsx kept its own seven-entry list, and this case recorded
    // the split instead of fixing it, because both halves were product
    // decisions. The corpus answered them. Ten kitchens exist; the planner
    // offered six, and a LOCKED bucket excludes everything outside the chosen
    // list — so American (19.7% of the recipes), Japanese, Mexican and Middle
    // Eastern could not be asked for by the one control that asks.
    const planner = read('features', 'nutrition', 'pages', 'MealPlan.tsx');
    expect(codeOnly(planner)).not.toMatch(/const CUISINES = \[/);
    expect(codeOnly(planner)).toMatch(/SLOT_CUISINES\.map/);
    expect(codeOnly(planner)).toMatch(/cuisineLocks|cuisineBySlot/);
    // Two settings, two lists, one idea of which kitchens exist. The lock's
    // list is the mix's list plus the neutral components, spelled as a spread
    // so the two cannot be edited apart.
    expect(codeOnly(module_)).toMatch(
      /export const SLOT_CUISINES: string\[\] = \[\.\.\.CUISINES, NEUTRAL_CUISINE\]/,
    );
    // 'Global' is not a kitchen and must never enter the mix: mixTotal spends a
    // 100% budget across kitchens, and the composer already weights the neutral
    // components at 5. A share here would be a second answer to that question.
    const mixList = codeOnly(module_).slice(
      codeOnly(module_).indexOf('export const CUISINES'),
      codeOnly(module_).indexOf('];', codeOnly(module_).indexOf('export const CUISINES')),
    );
    expect(mixList).not.toContain('Global');
    // And the planner still must not start driving the MIX. Importing the
    // module is now expected; calling its mix arithmetic is not.
    expect(codeOnly(planner)).not.toMatch(/withMix\(|readMix\(|capPct\(/);
  });

  it('is never copied onto the Master Profile row', () => {
    // The moment cuisineMix becomes a shared field, syncShared() can overwrite
    // it from a hub that never asked — and this stops being two editors on one
    // store.
    expect(codeOnly(master)).not.toMatch(/set\('cuisineMix'/);
    expect(codeOnly(master)).not.toMatch(/commit\('cuisineMix'/);
    expect(codeOnly(master)).not.toMatch(/cuisineMix:[^,\n]*draft/);
  });

  it('saves by merging the existing extras, never by replacing them', () => {
    // withMix() spreads. A payload that did not would silently delete
    // allergies — the one thing on that blob that can hurt somebody.
    expect(codeOnly(master)).toMatch(/withMix\(foodExtras, mixDraft\)/);
    expect(codeOnly(module_)).toMatch(/return \{ \.\.\.ex, cuisineMix: cleaned/);
  });

  it('sends only extras, so no other preference column is touched', () => {
    expect(codeOnly(master)).toMatch(/updateFoodPref\.mutate\(\s*\{ extras: JSON\.stringify/);
  });

  it('says out loud that the two screens are one setting', () => {
    // A citizen who edits here and sees it changed there has not been surprised
    // if the form told them first.
    expect(master).toMatch(/same setting the/);
    expect(master).toMatch(/Nutrition hub edits/);
  });
});
