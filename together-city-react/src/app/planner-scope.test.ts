import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(web, p), 'utf8');
const plan = read('features/nutrition/pages/MealPlan.tsx');
const api = read('features/nutrition/composed.api.ts');

/**
 * The nutrition planner honours the family/individual choice it was built to
 * offer.
 *
 * Every part of this existed and nothing joined it up:
 *
 *   · `composedApi.plan(mode, scope)` takes a scope, and always has.
 *   · The server answers `scope=household`.
 *   · `usePlannerMode()` knows whether the household offers a shared plan
 *     (`canUseFamily`) and persists the choice.
 *   · `PlannerModeToggle` was built, finished, and imported by nobody.
 *
 * And `MealPlan` called `useComposedPlan` with a mode and no scope, so it always
 * received 'self'.
 *
 * BEING PRECISE ABOUT THE HARM, because the first draft of this comment
 * over-claimed and the guard caught it: the shared plan was NOT unreachable.
 * `/family/weekly` and `/family/daily` pass `'household'` directly and are both
 * listed in the Family hub menu. What was missing is narrower — the nutrition
 * planner ignored a choice the citizen had made, and the switch built to make it
 * there was dead. `usePlannerMode`'s own doc still promises the mode is "shared
 * across the Weekly and Daily planners so switching in one carries to the
 * other"; the two family pages do not read it either, so that sentence is still
 * ahead of the code.
 *
 * This guard checks the WIRE, not the component. A component rendered on a page
 * it cannot affect is still unreachable — it just stops being counted.
 */
describe('the planner asks for the plan the citizen chose', () => {
  /** Comments stripped: this file's own explanation names the old call, and a
   *  guard that reads its own documentation never goes green. That is exactly
   *  how this case failed on its first run. */
  const code = plan
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

  it('passes a scope, not just a mode', () => {
    expect(code).toMatch(/useComposedPlan\(mode,\s*scope\)/);
    // The regression this replaces, spelled out so it cannot come back unnoticed.
    expect(code).not.toMatch(/useComposedPlan\(mode\)/);
  });

  it('derives that scope from the planner mode, and from whether family is even offered', () => {
    expect(plan).toMatch(/const planner = usePlannerMode\(\)/);
    expect(plan).toMatch(/planner\.canUseFamily && planner\.mode === 'family' \? 'household' : 'self'/);
  });

  it('draws the switch only for a household that has a shared plan', () => {
    // A solo citizen is not asked a question with one answer.
    expect(plan).toMatch(/\{planner\.canUseFamily && \(/);
    expect(plan).toMatch(/<PlannerModeToggle/);
  });

  it('is asking for something the API can actually serve', () => {
    // The wire is only real if the other end exists. 'household' is the server's
    // word, not one invented here.
    expect(api).toMatch(/export type PlanScope = 'self' \| 'household'/);
    expect(api).toMatch(/useComposedPlan\(mode: PlanMode = 'preferred', scope: PlanScope = 'self'\)/);
  });

  it('caches the two scopes apart', () => {
    // Same mode, different scope, different plan. A shared key would show one
    // household member the other's plan out of cache.
    expect(api).toMatch(/queryKey: \['nutrition', 'composed', mode, scope\]/);
  });
});
