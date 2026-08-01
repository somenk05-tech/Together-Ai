import { readFileSync } from 'fs';
import { join } from 'path';
import { normCuisine, cuisineAliases } from './meal-composer';

/**
 * One cuisine, one card, and the card returns everything it counted.
 *
 * The corpus stores a `country` in two vocabularies at once: the dataset's
 * "India", "Italy", "Thailand" and the Food Preference Profile's "Indian",
 * "Italian", "Thai". `normCuisine` has reconciled them since the planner was
 * built — the pool, plan-score and the composer all speak the canonical name.
 * The Recipe Library did not. It grouped the raw column, so the landing page
 * offered Indian AND India, Chinese AND China, Italian AND Italy, Mexican AND
 * Mexico, Thai AND Thailand, American AND USA: six cuisines shown as twelve,
 * each card holding part of the answer and neither admitting the other existed.
 *
 * THE OBVIOUS FIX IS THE DANGEROUS ONE. Fold the names in the display and stop
 * there and you get one card labelled "Indian" whose count is the sum, wired to
 * a filter that still matches `country = 'Indian'` exactly — so it promises
 * 800 recipes and returns 500, with the other 300 unreachable from anywhere.
 * A visibly wrong count on two cards is a smaller lie than an invisible one on
 * a single card. So the display fold and the query fold are guarded together
 * here, and neither is allowed to exist without the other.
 */

const SRC = readFileSync(join(__dirname, 'nutrition.service.ts'), 'utf8');

/** The body of one private method, comments stripped. */
function body(name: string): string {
  const at = SRC.indexOf(`private async ${name}(`);
  expect(at).toBeGreaterThan(-1);
  return SRC.slice(at, SRC.indexOf('\n  }', at))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
}

describe('the two vocabularies', () => {
  it('are the six pairs the library was showing twice', () => {
    for (const [dataset, profile] of [
      ['India', 'Indian'], ['China', 'Chinese'], ['Italy', 'Italian'],
      ['Mexico', 'Mexican'], ['Thailand', 'Thai'], ['USA', 'American'],
    ] as const) {
      expect(normCuisine(dataset)).toBe(profile);
      expect(normCuisine(profile)).toBe(profile);
    }
  });

  it('leaves a cuisine it has never heard of alone', () => {
    // Passing an unknown value through unchanged is what lets the corpus grow
    // without this map being a gate on it.
    expect(normCuisine('France')).toBe('France');
    expect(normCuisine('')).toBe('');
  });
});

describe('cuisineAliases — what a card has to query for', () => {
  it('returns every spelling that folds into the name', () => {
    expect([...cuisineAliases('Indian')].sort()).toEqual(['India', 'Indian']);
    expect([...cuisineAliases('American')].sort()).toEqual(['America', 'American', 'USA']);
    expect([...cuisineAliases('Mediterranean')].sort()).toEqual(['Greece', 'Greek', 'Mediterranean']);
  });

  it('always includes the name itself, even when the map has never heard of it', () => {
    expect(cuisineAliases('France')).toEqual(['France']);
  });

  it('never returns a spelling that means something else', () => {
    for (const name of ['Indian', 'Chinese', 'Italian', 'Mexican', 'Thai', 'American']) {
      for (const alias of cuisineAliases(name)) expect(normCuisine(alias)).toBe(name);
    }
  });

  it('is empty for nothing, so a blank filter cannot become `country IN ()`', () => {
    expect(cuisineAliases('')).toEqual([]);
    expect(cuisineAliases('   ')).toEqual([]);
  });

  it('round-trips every entry in the map', () => {
    // Whatever anybody adds later: if normCuisine folds X to Y, then asking for
    // Y must query for X, or those recipes become unreachable.
    for (const raw of ['India', 'China', 'Italy', 'Mexico', 'Thailand', 'Japan', 'Greece', 'Korea', 'USA', 'America', 'Middle East']) {
      expect(cuisineAliases(normCuisine(raw))).toContain(raw);
    }
  });
});

describe('the library actually applies both halves', () => {
  it('folds the facet on the canonical name', () => {
    const facet = body('cuisineFacet');
    expect(facet).toMatch(/normCuisine\(/);
    expect(facet).toMatch(/folded\.set\(/);
  });

  it('folds BEFORE it truncates', () => {
    // The trap: `take: 24` on the groupBy merges an already-truncated list, so a
    // cuisine split across two spellings can miss the cut on both while its
    // combined count would have ranked it near the top.
    const facet = body('cuisineFacet');
    expect(facet).not.toMatch(/take:\s*24/);
    const foldAt = facet.indexOf('folded.set(');
    const sliceAt = facet.indexOf('.slice(0, 24)');
    expect(foldAt).toBeGreaterThan(-1);
    expect(sliceAt).toBeGreaterThan(foldAt);
  });

  it('does not leave the query matching one spelling', () => {
    expect(SRC).not.toMatch(/where\.country = q\.cuisine;/);
    expect(SRC).toMatch(/cuisineAliases\(q\.cuisine\)/);
  });

  it('shows the same name on the card as on the tile it was reached from', () => {
    expect(SRC).toMatch(/cuisine: normCuisine\(r\.country\)/);
  });
});
