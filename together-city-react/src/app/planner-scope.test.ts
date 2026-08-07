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
 * there was dead. `usePlannerMode`'s doc used to promise the mode was "shared
 * across the Weekly and Daily planners"; there is no `/nutrition/daily`, and the
 * family pages deliberately do not read it. That sentence is corrected rather
 * than the code — and the block at the foot of this file pins why.
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
    expect(code).toMatch(/useComposedPlan\(mode,\s*scope,/);
    // The regression this replaces, spelled out so it cannot come back unnoticed.
    expect(code).not.toMatch(/useComposedPlan\(mode\)/);
  });

  it('derives that scope from the planner mode, and from whether family is even offered', () => {
    expect(plan).toMatch(/const planner = usePlannerMode\(\)/);
    // `planner.ready` guards the derivation. canUseFamily comes from a query, so
    // before it settles the scope resolves to 'self' — and a tick later flips to
    // 'household', which is a different query key. The planner used to build the
    // personal week and throw it away on every load. The guard is that the scope
    // is not chosen until we know whether a shared plan is even on offer.
    expect(plan).toMatch(/planner\.ready && planner\.canUseFamily && planner\.mode === 'family'/);
    expect(plan).toMatch(/\? 'household' : 'self'/);
    expect(plan).toMatch(/useComposedPlan\(mode, scope, \{ enabled: planner\.ready \}\)/);
  });

  it('draws the switch only for a household that has a shared plan', () => {
    // A solo citizen is not asked a question with one answer.
    expect(plan).toMatch(/\{planner\.canUseFamily && \(/);
    expect(plan).toMatch(/<PlannerModeToggle/);
  });

  /**
   * A FAILED FAMILY PLAN MUST NOT TAKE THE SWITCH DOWN WITH IT.
   *
   * The planner opens on the SHARED plan whenever the household has Family Meal
   * Planning on — that is usePlannerMode's default, not a choice the citizen
   * made. So when the household build was the one that failed, the error state
   * replaced the entire page, toggle included, and somebody whose own plan was
   * building perfectly well had no way to reach it. The only exit was knowing
   * the switch existed on a page that had stopped rendering it.
   */
  it('leaves a way back to the individual plan when the family plan fails', () => {
    const err = plan.slice(plan.indexOf('if (plan.isError'), plan.indexOf('if (plan.data.needsProfile'));
    expect(err).toMatch(/<PlannerModeToggle/);
    expect(err).toMatch(/Show my own plan/);
    expect(err).toMatch(/plan\.refetch\(\)/);
    // and it must say WHICH plan failed, rather than guessing at a cause
    expect(err).toMatch(/Couldn't build your family's plan/);
  });

  it('is asking for something the API can actually serve', () => {
    // The wire is only real if the other end exists. 'household' is the server's
    // word, not one invented here.
    expect(api).toMatch(/export type PlanScope = 'self' \| 'household'/);
    expect(api).toMatch(/mode: PlanMode = 'preferred',\s*\n\s*scope: PlanScope = 'self',/);
  });

  it('caches the two scopes apart', () => {
    // Same mode, different scope, different plan. A shared key would show one
    // household member the other's plan out of cache.
    expect(api).toMatch(/queryKey: \['nutrition', 'composed', mode, scope\]/);
  });
});

/**
 * The Family planners are household-scoped ON PURPOSE, and say so honestly.
 *
 * §12 of the site review reads: "/family/weekly and /family/daily pass
 * 'household' unconditionally, and config/hubs.ts lists both with no gate — so
 * with family mode OFF the menu offers planners that request a shared plan the
 * household has not enabled. Fix: gate the menu entries, and have those pages
 * refuse rather than request."
 *
 * CHECKED AGAINST THE CODE, AND THAT FIX WOULD BE A REGRESSION.
 *
 * `scope=household` does not mean "the household is following this". It means
 * "composed with every member's allergies, exclusions and conditions applied",
 * and the server serves it whether or not shared planning is on — the flag
 * governs how members inherit the owner's profile, not whether a household
 * composition is allowed. So the plan is real, and it is the SAFER plan to cook
 * from for a table, which is exactly what a household with shared planning off
 * still needs.
 *
 * And the pages already say which of the three states they are in: shared
 * planning on, no household at all, or household with planning off — that last
 * one in as many words: "nobody else is following this plan. It is yours."
 * Making the pages refuse would delete a working, honest, allergy-safe plan and
 * replace it with an error.
 *
 * So this block guards the honesty rather than the phantom defect: the scope
 * stays, and the notice that explains it stays with it.
 */
describe('the family planners', () => {
  // Daily.tsx is gone (7 Aug): one household plan had two doors and the daily
  // one could not answer "what about tomorrow". The checks below applied to
  // both and now apply to the one that is left — the RULE did not change, only
  // the number of pages that have to keep it.
  const weekly = read('features/family/pages/Weekly.tsx');
  const notice = read('features/family/components/HouseholdPlanNotice.tsx');

  it('ask for the household composition, both of them', () => {
    for (const page of [weekly]) expect(page).toMatch(/useComposedPlan\(mode, 'household'\)/);
  });

  it('never leave the scope unexplained', () => {
    // The scope without the sentence is the actual §12 risk: a citizen with
    // shared planning off, looking at a plan nobody else is following, told
    // nothing about it.
    for (const page of [weekly]) expect(page).toMatch(/<HouseholdPlanNotice/);
  });

  it('tell the truth in all three states', () => {
    expect(notice).toMatch(/This is your <b>family meal plan<\/b>/);
    expect(notice).toMatch(/You don't have a household yet/);
    expect(notice).toMatch(/<b>Household meal planning is off<\/b>/);
    // The specific claims that must survive: nobody else is following it, and
    // it is still safe to cook for the table.
    // Whitespace-flexible: the sentence wraps in the source, and a guard that
    // only matches one line wrapping is a guard that fails on a reformat.
    expect(notice).toMatch(/nobody else is\s+following this plan/);
    expect(notice).toMatch(/still applied/);
  });
});
