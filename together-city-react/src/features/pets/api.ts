/**
 * ── THE SEAM ────────────────────────────────────────────────────────────────
 *
 * Every page in this hub reads through these hooks and none of them imports the
 * store or a data file directly. Today the hooks answer from local data; when
 * the NestJS side ships, this file changes and the seventeen pages do not.
 *
 * The shape is deliberately the shape of the future call:
 *
 *   useCatalogue(query)  → GET  /pets/catalogue?species=&category=&q=
 *   useProduct(id)       → GET  /pets/catalogue/:id
 *   useIngredientSearch  → GET  /pets/ingredients?q=
 *   useRecipes(species)  → GET  /pets/recipes?species=
 *   useServices(k, city) → GET  /pets/services?kind=&city=
 *
 * The pet itself is NOT behind a hook here. It is the citizen's own record and
 * it lives in the store, which is what every page already reads it from; a
 * wrapper that only re-exported that would be a second name for one thing.
 *
 * `loading` and `error` are on the return of every one of them even though
 * nothing can fail locally, because a page that has no error branch until the
 * server arrives is a page that will not have one after it arrives either.
 */

import { useMemo } from 'react';
import { CATALOGUE } from './data/catalogue';
import { INGREDIENTS, NEVER_FEED } from './data/ingredients';
import { RECIPES } from './data/recipes';
import { BUNDLES } from './data/bundles';
import type { Ingredient, Product, ProductCategory, SpeciesScope, ToxicFood, Verdict } from './types';

export interface Query<T> { data: T; loading: boolean; error: string | null }

const ok = <T,>(data: T): Query<T> => ({ data, loading: false, error: null });



export interface CatalogueQuery {
  species?: SpeciesScope;
  category?: ProductCategory | 'all';
  q?: string;
  lifeStage?: string;
  maxPrice?: number | null;
  brand?: string;
  verifiedPriceOnly?: boolean;
  sort?: 'relevance' | 'low' | 'high' | 'name';
}

export function useCatalogue(query: CatalogueQuery): Query<Product[]> {
  const data = useMemo(() => {
    let rows = CATALOGUE.slice();
    if (query.species && query.species !== 'both') {
      rows = rows.filter((p) => p.species === query.species || p.species === 'both');
    }
    if (query.category && query.category !== 'all') rows = rows.filter((p) => p.category === query.category);
    if (query.lifeStage && query.lifeStage !== 'all') {
      rows = rows.filter((p) => p.lifeStage === query.lifeStage || p.lifeStage === 'all');
    }
    if (query.brand) rows = rows.filter((p) => p.brand === query.brand);
    if (query.maxPrice) rows = rows.filter((p) => p.priceFrom !== null && p.priceFrom <= query.maxPrice!);
    if (query.verifiedPriceOnly) rows = rows.filter((p) => p.verified.price);
    if (query.q) {
      const q = query.q.toLowerCase();
      rows = rows.filter((p) => `${p.brand} ${p.name} ${p.subcategory} ${p.mainProtein ?? ''}`.toLowerCase().includes(q));
    }
    const sort = query.sort ?? 'relevance';
    rows.sort((a, b) => {
      if (sort === 'low') return (a.priceFrom ?? 1e9) - (b.priceFrom ?? 1e9);
      if (sort === 'high') return (b.priceFrom ?? -1) - (a.priceFrom ?? -1);
      if (sort === 'name') return a.name.localeCompare(b.name);
      // relevance: verified prices first, then a published analysis, then price
      const score = (p: Product) => (p.verified.price ? 2 : 0) + (p.verified.nutrition ? 1 : 0);
      return score(b) - score(a) || (a.priceFrom ?? 1e9) - (b.priceFrom ?? 1e9);
    });
    return rows;
  }, [query.species, query.category, query.q, query.lifeStage, query.maxPrice, query.brand, query.verifiedPriceOnly, query.sort]);
  return ok(data);
}

export const useProduct = (id: string | undefined): Query<Product | null> =>
  ok(useMemo(() => CATALOGUE.find((p) => p.id === id) ?? null, [id]));

/** Not memoised: the dependency would be `ids.join(',')`, which the exhaustive-
 *  deps rule cannot check statically — and the work is a lookup over at most a
 *  handful of ids. A memo the linter has to be silenced for is worse than none. */
export const useProductsByIds = (ids: string[]): Query<Product[]> =>
  ok(ids.map((id) => CATALOGUE.find((p) => p.id === id)).filter((p): p is Product => !!p));

export const useBrands = (): Query<string[]> =>
  ok(useMemo(() => [...new Set(CATALOGUE.map((p) => p.brand))].sort(), []));

export interface IngredientHit {
  ingredient: Ingredient | null;
  toxic: ToxicFood | null;
  verdict: Verdict | null;
  suggestions: string[];
  /** Other close matches, offered as chips. "Fish" is four entries in this
   *  database — rohu, pomfret, sardine, fish bones — and answering with one of
   *  them silently is how a reader concludes we only know about that one. */
  related: string[];
}

/**
 * "CAN MY PET EAT THIS?" — the toxic list is searched FIRST and separately.
 *
 * If a term matches something on the never-feed list, that answer wins outright
 * and no SAFE result from a fuzzy ingredient match is allowed to appear beside
 * it. "Onion rice" must not return rice.
 *
 * MATCHING IS RANKED, NOT FIRST-PAST-THE-POST, and that is a bug fix with a
 * scar. A toxic record's name carries its aliases in brackets — "Alcohol (beer,
 * wine, spirits, liquor-filled chocolates, fermenting dough)" — so a plain
 * substring search for "chocolate" hit ALCOHOL before it reached CHOCOLATE, and
 * returned a correct-looking emergency card about the wrong poison. The head of
 * the name (everything before the bracket) now outranks anything inside it, and
 * an exact head match outranks a partial one.
 */
const head = (name: string) => name.split('(')[0].trim().toLowerCase();
const words = (s: string) => s.split(/[^a-z]+/).filter(Boolean);

/**
 * Score a query against one name. 100 exact · 90 whole word · 80 prefix · 50 substring,
 * MINUS a penalty for how much else the name is about.
 *
 * The penalty is what separates "Chicken breast" from "Chicken bones - cooked"
 * and "Rohu fish" from "Raw and undercooked meat, poultry, fish, eggs". All
 * four contain the query as a whole word and would otherwise tie, and the tie
 * was being broken by array order — which is how "can my dog eat chicken"
 * answered with a warning about cooked bones.
 */
function nameScore(name: string, q: string): number {
  const h = head(name);
  const base =
    h === q ? 100
    : words(h).includes(q) ? 90
    : q.length > 2 && h.startsWith(q) ? 80
    : q.length > 3 && h.includes(q) ? 50
    : 0;
  if (!base) return 0;
  return base - Math.min(15, Math.max(0, words(h).length - words(q).length) * 3);
}

function rankToxic(q: string, species: 'dog' | 'cat') {
  let best: { row: ToxicFood; score: number } | null = null;
  for (const row of NEVER_FEED) {
    if (!(row.affects === 'Both' || row.affects.toLowerCase() === species)) continue;
    const aliases = (row.name.match(/\(([^)]*)\)/)?.[1] ?? '')
      .split(/,| and /).map((a) => a.trim().toLowerCase()).filter((a) => a.length > 2);
    let score = nameScore(row.name, q);
    if (!score) {
      if (aliases.some((a) => a === q)) score = 60;
      else if (q.length > 3 && aliases.some((a) => words(a).includes(q))) score = 45;
      else if (q.length > 4 && aliases.some((a) => a.includes(q))) score = 35;
    }
    if (score > 0 && (!best || score > best.score)) best = { row, score };
  }
  return best;
}

function rankIngredient(q: string) {
  let best: { row: Ingredient; score: number } | null = null;
  for (const row of INGREDIENTS) {
    let score = nameScore(row.name, q);
    const indian = (row.indianName ?? '').toLowerCase();
    if (indian) {
      const alt = Math.max(...indian.split(/[/,]/).map((n) => nameScore(n.trim(), q)));
      score = Math.max(score, alt - 5);
    }
    if (score > 0 && (!best || score > best.score)) best = { row, score };
  }
  return best;
}

/**
 * "CAN MY PET EAT THIS?"
 *
 * TWO RANKED SEARCHES, AND THE HIGHER SCORE WINS — with a floor under the toxic
 * side so a weak alias hit can never outrank a real ingredient.
 *
 * Both halves of that rule are scars. A plain substring search returned the
 * ALCOHOL emergency card for "chocolate", because alcohol's record lists
 * "liquor-filled chocolates"; ranking by the head of the name fixed that. Then
 * ranking alone returned COOKED BONES for "chicken" and CHOCOLATE for "milk",
 * because an alias inside a bracket had matched exactly while the ingredient
 * only matched as a word — so an ingredient's whole-word match now outscores
 * any alias, and the toxic card needs 60 to be shown at all.
 *
 * What has NOT changed: when the toxic side genuinely wins, it wins outright.
 * No SAFE verdict is ever rendered beside a poisoning.
 */
export function useIngredientSearch(term: string, species: 'dog' | 'cat'): Query<IngredientHit> {
  const data = useMemo<IngredientHit>(() => {
    const q = term.trim().toLowerCase();
    if (!q) return { ingredient: null, toxic: null, verdict: null, suggestions: [], related: [] };

    const toxic = rankToxic(q, species);
    const ing = rankIngredient(q);
    const related = INGREDIENTS
      .map((i) => ({ name: i.name, score: nameScore(i.name, q) }))
      .filter((r) => r.score >= 50 && r.name !== ing?.row.name)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((r) => r.name);

    if (toxic && toxic.score >= 60 && toxic.score >= (ing?.score ?? 0)) {
      return { ingredient: null, toxic: toxic.row, verdict: 'AVOID', suggestions: [], related };
    }
    if (ing) {
      return {
        ingredient: ing.row,
        toxic: null,
        verdict: species === 'dog' ? ing.row.dog : ing.row.cat,
        suggestions: [],
        related,
      };
    }
    if (toxic) return { ingredient: null, toxic: toxic.row, verdict: 'AVOID', suggestions: [], related };

    return {
      ingredient: null,
      toxic: null,
      verdict: null,
      related,
      suggestions: INGREDIENTS
        .filter((i) => head(i.name).includes(q.slice(0, 3)))
        .slice(0, 6)
        .map((i) => i.name),
    };
  }, [term, species]);
  return ok(data);
}

export const useNeverFeed = (): Query<ToxicFood[]> => ok(NEVER_FEED);
export const useRecipes = (species: 'dog' | 'cat'): Query<typeof RECIPES> =>
  ok(useMemo(() => RECIPES.filter((r) => r.species === species || r.species === 'both'), [species]));
export const useRecipe = (id: string | undefined) => ok(RECIPES.find((r) => r.id === id) ?? null);
export const useBundles = () => ok(BUNDLES);
