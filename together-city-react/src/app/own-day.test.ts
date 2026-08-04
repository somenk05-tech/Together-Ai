import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * THE PAGE CALLED "CREATE YOUR OWN MEAL PLAN" DID NOT CREATE A MEAL PLAN.
 *
 * Adding recipes by hand filled a sticky bar that counted picks and offered one
 * button: turn them into a grocery list. So the page named for building a plan
 * produced a shopping trip, and the plan itself — which day these dishes are
 * for, what the day adds up to, whether it is settled — existed nowhere.
 *
 * It builds a day now: dishes land in their courses, the day is read on the
 * same press as the engine's, and locking it fixes it, writes its ingredients
 * to the grocery list, and moves the next dish added to tomorrow.
 */
describe('a citizen builds a day, not a basket', () => {
  const view = strip(read('src/features/nutrition/components/OwnDayView.tsx'));
  const page = strip(read('src/features/nutrition/pages/RecipeLibrary.tsx'));
  const api = strip(read('src/features/nutrition/composed.api.ts'));

  it('reads the day on the Weekly Meal Planner\'s own markup', () => {
    // Not a lookalike assembled from inline styles — the same classes, so the
    // two days cannot drift apart the next time the press is retouched.
    for (const cls of ['press-sheet', 'press-hero', 'press-stats', 'press-course',
      'press-grid', 'press-dish', 'press-aside', 'press-foot']) {
      expect(view).toContain(`"${cls}"`);
    }
    expect(view).toMatch(/data-press/);
  });

  it('shows the plan the server holds, never a second list beside it', () => {
    // A tile reading "Added" while the day does not contain the dish is the
    // failure this rules out: there is one copy of the truth and it is remote.
    expect(page).toMatch(/const picked[^=]*=\s*Object\.fromEntries\(/);
    expect(page).not.toMatch(/useState<[^>]*>\(\[\]\)[^\n]*pick/i);
    expect(page).toMatch(/own\.data\?\.days\.find\(/);
  });

  it('lets the server decide which day a dish lands on', () => {
    // The rule is "today until you lock it, then tomorrow". If the page sent a
    // day index, two tabs open at once would each send their own idea of it.
    expect(api).toMatch(/useAddToOwnPlan = \(\) => useOwnMutation<\{ recipeId: string \}>/);
  });

  it('never tops the day up to a target', () => {
    // The totals are the honest sum of what they put on it. A hand-built day
    // that quietly gets corrected is not hand-built.
    // It is handed no way to put anything on the day: the only callbacks it
    // has take things off it or settle it. Every figure it prints is the day's
    // own sum, and the target is only ever a denominator.
    expect(view).toMatch(/onRemove:.*=> void/);
    expect(view).toMatch(/onLock:.*=> void/);
    expect(view).toMatch(/onUnlock:.*=> void/);
    expect(view).not.toMatch(/onAdd\b|composeDay|topUp|autoAdd/);
    expect(view).toMatch(/const t = day\.totals/);
  });

  it('offers no way to change a locked day from inside it', () => {
    // Its ingredients are already on the grocery list. A dish that can leave
    // the day but not the basket is a lie whichever one you believe.
    expect(view).toMatch(/!day\.locked && \(/);
    expect(view).toMatch(/onUnlock\(day\.dayIndex\)/);
  });

  it('distinguishes an empty day from a day it could not read', () => {
    expect(view).toMatch(/failed \|\| !plan/);
    expect(view).toMatch(/We couldn’t open your plan/);
    expect(view).toMatch(/Nothing on it yet/);
  });

  it('states no percentage it has no target for', () => {
    // 0% and 100% are both claims about a prescription that is not on file.
    expect(view).toMatch(/typeof of === 'number' && of > 0/);
  });
});

/**
 * THE CART LEFT THE SIDEBAR, AND CHECKOUT DID NOT LEAVE WITH IT.
 *
 * The Cart was a hub key in Nutrition and in Family. Removing it is what was
 * asked for — but a key is also the only way most people reach a screen, and
 * an orphaned checkout is worse than a cluttered sidebar. Grocery carries the
 * link now, which is where somebody with a list in front of them looks.
 */
describe('the cart is off the sidebar and still reachable', () => {
  const hubs = strip(read('src/config/hubs.ts'));

  it('is not a key in Nutrition or in Family', () => {
    expect(hubs.match(/label: 'Cart'/g) ?? []).toEqual([]);
    expect(hubs).not.toMatch(/'\/nutrition\/cart'/);
    expect(hubs).not.toMatch(/'\/family\/cart'/);
  });

  it('is linked from both grocery lists instead', () => {
    for (const p of ['src/features/nutrition/pages/Grocery.tsx', 'src/features/family/pages/Grocery.tsx']) {
      expect(strip(read(p))).toMatch(/\/cart/);
    }
  });
});
