import { readFileSync } from 'fs';
import { gunzipSync } from 'zlib';
import { join } from 'path';
import { COMPONENT_SEEDS } from './component-recipes';
import { labelMatchesContents, tagsForIngredient } from './diet-tags';

/**
 * Does every recipe this app ships actually match the diet it claims?
 *
 * A structural guard, in the same spirit as security/query-scoping.spec.ts: it
 * reads the corpus rather than the runtime, so it needs no database and cannot
 * be satisfied by luck.
 *
 * The reason it exists is that `dietAllows()` — and therefore the recipe
 * library — filters on a recipe's `diet` COLUMN and never looks at what is in
 * the dish. That is a reasonable design only while the column is true of every
 * row. The moment one row lies, a citizen is served the thing they told us they
 * do not eat, with a label saying it is fine. This is the check that stops the
 * column drifting away from the contents.
 *
 * Three corpora, because the app ships three:
 *   1. the 11k dataset in data/recipes.dataset.json.gz
 *   2. COMPONENT_SEEDS — the curated sides, snacks and breakfasts
 *   3. the inline R(...) rows in nutrition.service.ts, read from source
 *
 * The third is parsed from text rather than imported because those rows live
 * inside a method body. Parsing is fragile in general; here it is checked — the
 * test asserts a plausible row count first, so a change to the seed's shape
 * fails loudly instead of silently scanning nothing and passing.
 */

interface Row { name: string; diet: string; ingredients: string[] }

function fromDataset(): Row[] {
  const gz = join(__dirname, 'data', 'recipes.dataset.json.gz');
  const rows = JSON.parse(gunzipSync(readFileSync(gz)).toString('utf8')) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    name: String(r.name ?? ''),
    diet: String(r.diet ?? ''),
    ingredients: ((r.ingredients as Array<{ name?: string } | string> | undefined) ?? [])
      .map((i) => (typeof i === 'string' ? i : (i?.name ?? '')))
      .filter(Boolean),
  }));
}

function fromComponents(): Row[] {
  return COMPONENT_SEEDS.map((s) => ({
    name: s.name, diet: s.diet, ingredients: s.ing.map(([n]) => n),
  }));
}

function fromInlineSeed(): Row[] {
  const src = readFileSync(join(__dirname, 'nutrition.service.ts'), 'utf8');
  // R('Name', 'Country', 'slot', …numbers…, 'diet', [['Ingredient', g, p], …])
  // The diet is the last quoted argument before the ingredient array, which is
  // what anchors this; [^[]*? refuses to cross into the array while looking.
  const re = /R\(\s*'([^']+)'[^[]*?'(veg|vegan|nonveg|egg|pesc|jain|jainvegan|everything)',\s*(\[\[[\s\S]*?\]\])\s*\)/g;
  const out: Row[] = [];
  for (const m of src.matchAll(re)) {
    out.push({
      name: m[1], diet: m[2],
      ingredients: [...m[3].matchAll(/\[\s*'([^']+)'/g)].map((x) => x[1]),
    });
  }
  return out;
}

const report = (rows: Row[]) => rows
  .map((r) => ({ r, s: labelMatchesContents(r.diet, r.ingredients) }))
  .filter((x) => !x.s.ok)
  .map((x) => `${x.r.diet.padEnd(10)} ${x.r.name} → ${x.s.offending.map((o) => `${o.ingredient} (${o.tag})`).join(', ')}`);

describe('the shipped dataset', () => {
  const rows = fromDataset();

  it('is the corpus we think it is', () => {
    expect(rows.length).toBeGreaterThan(10_000);
    expect(rows.filter((r) => r.ingredients.length).length).toBeGreaterThan(10_000);
  });

  it('has no recipe whose diet label contradicts its ingredients', () => {
    expect(report(rows)).toEqual([]);
  });
});

describe('the curated component recipes', () => {
  it('are read, and there are some', () => {
    expect(COMPONENT_SEEDS.length).toBeGreaterThan(20);
  });

  it('have no recipe whose diet label contradicts its ingredients', () => {
    expect(report(fromComponents())).toEqual([]);
  });
});

describe('the inline seed recipes in nutrition.service.ts', () => {
  const rows = fromInlineSeed();

  it('are actually being parsed', () => {
    // Guards the guard. If the seed's shape changes and the regex stops
    // matching, this fails rather than the suite quietly checking nothing.
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.every((r) => r.ingredients.length > 0)).toBe(true);
  });

  it('have no recipe whose diet label contradicts its ingredients', () => {
    expect(report(rows)).toEqual([]);
  });
});

describe('the tagger earns its keep on the real corpus', () => {
  it('recognises a large share of real ingredient names', () => {
    // Not a correctness claim — a smoke test that the dictionary is connected
    // to the data. A tagger matching almost nothing would pass every check
    // above while protecting no one.
    const rows = fromDataset();
    const names = rows.flatMap((r) => r.ingredients);
    const tagged = names.filter((n) => tagsForIngredient(n).length).length;
    expect(tagged).toBeGreaterThan(names.length * 0.1);
  });
});
