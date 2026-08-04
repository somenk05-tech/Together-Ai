import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * THE PLAN MAY NEVER CONTRADICT THE PROFILE IT CLAIMS TO COME FROM.
 *
 * The Food Preference Profile is the single source of truth for the Nutrition
 * Hub: diet, allergies, exclusions, conditions, targets, cuisines, the lot. The
 * engine honours it on the server. The failure this file exists to prevent is
 * on the CLIENT, and it is quieter: the profile is saved, the server is right,
 * and the browser goes on showing the plan it cached under the old one.
 *
 * That happened. `useUpdateFoodPref` invalidated three keys — targets, weekly,
 * profile — and never `['nutrition','composed']`, which is what the Weekly Meal
 * Planner renders, or `['nutrition','grocery-plan']`, which shops it. `weekly`
 * is the older stored plan; the planner moved on and this was not updated. A
 * citizen could switch from non-vegetarian to vegetarian, read "Preferences
 * saved successfully", walk back to the planner and be offered the same
 * chicken.
 *
 * The rule is therefore the PREFIX, not a list. Naming keys individually is how
 * the list went stale the first time: someone adds a query and does not think
 * to come back here. Every query under `nutrition` is downstream of this
 * profile, and there is no key it would be correct to leave out.
 */
describe('the Food Preference Profile is the source of truth', () => {
  const hooks = strip(read('src/features/nutrition/hooks.ts'));
  const save = hooks.slice(
    hooks.indexOf('export function useUpdateFoodPref'),
    hooks.indexOf('export function useWallet'),
  );

  it('has a save handler to check at all', () => {
    expect(save).toContain('useMutation');
    expect(save).toMatch(/updatePreferences/);
  });

  it('invalidates the whole nutrition hub, not a list of remembered keys', () => {
    expect(save).toMatch(/invalidateQueries\(\{\s*queryKey:\s*\['nutrition'\]\s*\}\)/);
  });

  it('does not go back to naming keys one at a time', () => {
    // A narrower key here is not a smaller fix, it is the bug returning: it
    // means somebody decided which parts of the hub the profile governs.
    const narrow = [...save.matchAll(/queryKey:\s*\[\s*'nutrition'\s*,\s*'([^']+)'/g)]
      .map((m) => m[1])
      // setQueryData on the profile itself is the saved value, not an invalidation
      .filter((k) => k !== 'preferences');
    expect(narrow).toEqual([]);
  });

  it('still refreshes the account profile, which is a different cache', () => {
    expect(save).toMatch(/queryKey:\s*\['profile'\]/);
  });

  /**
   * And the planner must not cache two different citizens' plans together, nor
   * a household plan under a personal key — the scope is part of the identity
   * of the food, not a filter on it.
   */
  it('keeps the composed plan keyed by everything that changes the food', () => {
    const api = strip(read('src/features/nutrition/composed.api.ts'));
    expect(api).toMatch(/queryKey:\s*\['nutrition',\s*'composed',\s*mode,\s*scope\]/);
    const g = strip(read('src/features/nutrition/hooks.ts'));
    expect(g).toMatch(/queryKey:\s*\['nutrition',\s*'grocery-plan',\s*mode,/);
  });
});
