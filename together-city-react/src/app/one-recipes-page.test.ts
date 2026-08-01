import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.(test|spec)\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/**
 * There is one page for deciding what you are going to eat.
 *
 * Adding your own dish used to live at /nutrition/recipes/own, a second
 * destination for something /nutrition/recipes was already inviting you to do
 * ("Cook something that isn't in here? Add your own recipe →"). Building a plan
 * meant bouncing between two screens that were doing the same job, and the menu
 * listed both, so the split looked deliberate rather than accidental.
 *
 * Merging it is easy to half-do. The failure is not a crash — it is a page that
 * quietly drifts back apart: a link left pointing at the old URL, a menu entry
 * nobody removed, the old page file still sitting in pages/ waiting to be
 * re-imported by someone who assumes it is live. Each of those is invisible
 * until a user follows it, so each gets a line here.
 *
 * The old URL must keep resolving. Someone has it bookmarked, and 404 is a
 * worse answer than a redirect for a page that still exists — it just lives
 * somewhere else now.
 */
describe('your own recipes live on the recipes page', () => {
  const router = read('app/router.tsx');
  const library = read('features/nutrition/pages/RecipeLibrary.tsx');
  const hubs = read('config/hubs.ts');

  it('renders the add-your-own section on the library page', () => {
    expect(library).toMatch(/<OwnRecipes\s*\/>/);
    expect(library).toMatch(/from '\.\.\/components\/OwnRecipes'/);
  });

  it('has no second page for it', () => {
    expect(existsSync(join(SRC, 'features/nutrition/pages/MyRecipes.tsx'))).toBe(false);
    expect(router).not.toMatch(/MyRecipes/);
  });

  it('still answers the old URL instead of 404ing a bookmark', () => {
    const own = router
      .split('\n')
      .find((l) => l.includes("path: '/nutrition/recipes/own'"));
    expect(own, '/nutrition/recipes/own is no longer declared at all').toBeTruthy();
    expect(own).toMatch(/<Navigate to="\/nutrition\/recipes" replace \/>/);

    // React Router matches in order, so the redirect has to be declared before
    // the :id route or "own" is read as a recipe id and the page 404s from the
    // API instead.
    const ownAt = router.indexOf("path: '/nutrition/recipes/own'");
    const idAt = router.indexOf("path: '/nutrition/recipes/:id'");
    expect(idAt).toBeGreaterThan(-1);
    expect(ownAt).toBeLessThan(idAt);
  });

  it('does not invite anyone to the redirect', () => {
    // A link to a page that immediately bounces you somewhere else is a link
    // that lies about where it goes. The API paths of the same name are a
    // different thing entirely, so only navigation is checked.
    const NAV = /(?:to|href)=(?:"|'|\{')\/nutrition\/recipes\/own/;
    const offenders = walk(SRC)
      .filter((p) => NAV.test(readFileSync(p, 'utf8')))
      .map((p) => relative(SRC, p).split('\\').join('/'));

    expect(offenders.join('\n') || 'none').toBe('none');
    expect(NAV.test('<Link to="/nutrition/recipes/own">')).toBe(true);
    expect(NAV.test("api.get('/nutrition/recipes/own')")).toBe(false);
  });

  it('lists it once in the menu, and the numbering has no hole where it was', () => {
    // The nutrition entry of HUBS, up to wherever the next hub starts. "key:
    // 'nutrition'" also appears in the top-level hub list, so anchor on the
    // object key at its own indent instead.
    const from = hubs.indexOf('\n  nutrition: {');
    expect(from, 'HUBS.nutrition not found').toBeGreaterThan(-1);
    const rest = hubs.slice(from + 3);
    const next = rest.search(/\n {2}[A-Za-z]\w*: \{/);
    const block = next === -1 ? rest : rest.slice(0, next);
    expect(block).not.toMatch(/'\/nutrition\/recipes\/own'/);

    const indexes = [...block.matchAll(/index: '(\d+)'/g)].map((m) => m[1]);
    expect(indexes.length).toBeGreaterThan(3);
    expect(indexes).toEqual(indexes.map((_, i) => String(i + 1).padStart(2, '0')));
  });

  it('calls itself what the menu calls it', () => {
    // labels.ts rule 1: a renamed label is written once and page titles read
    // the constant. An <h1> with its own copy of the words is how they drift.
    expect(library).toMatch(/<h1[^>]*>\{LABELS\.createYourOwnMealPlan\}<\/h1>/);
    expect(library).not.toMatch(/>Recipe Library</);
  });
});
