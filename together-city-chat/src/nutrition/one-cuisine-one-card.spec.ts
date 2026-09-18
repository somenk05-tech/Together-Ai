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

/** The body of one method, comments stripped. */
function body(name: string): string {
  const at = SRC.indexOf(`async ${name}(`);
  expect(at).toBeGreaterThan(-1);
  return SRC.slice(at, SRC.indexOf('\n  }\n', at))
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
    // 'Indian' grew the legacy preference slugs (north-indian, Punjabi…) when
    // the composer learned to read profiles the vanilla site saved. They are
    // inert in this card's corpus query — no recipe row carries 'Punjabi' in
    // its country column — and belong in the list anyway, because this test's
    // own sentence is the contract: every spelling that folds into the name.
    expect([...cuisineAliases('Indian')].sort()).toEqual([
      'Awadhi', 'Bengali', 'Chettinad', 'Goan', 'Gujarati', 'Hyderabadi',
      'India', 'Indian', 'Kashmiri', 'Kerala', 'Maharashtrian', 'Mughlai',
      'North Indian', 'Punjabi', 'Rajasthani', 'South Indian', 'Tamil', 'Udupi',
      'desi', 'east-indian', 'north-indian', 'south-indian', 'west-indian',
    ]);
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

describe('the database for you actually applies both halves', () => {
  // 18 Sep: the unfiltered library and its groupBy facet were retired. The
  // browsable database is now dayRecipes() — the in-memory pool after the
  // profile's hard gate — and the same two promises hold there: the facet is
  // folded on the canonical name, and asking for a canonical name reaches
  // every spelling of it.
  const day = body('dayRecipes');

  it('folds the facet on the canonical name, over the ELIGIBLE list', () => {
    expect(day).toMatch(/const k = normCuisine\(r\.cuisine\); facet\.set\(/);
    expect(day).toMatch(/for \(const r of eligible\)/);
  });

  it('does not leave the filter matching one spelling', () => {
    // Both sides are folded before they are compared, so "Indian" reaches the
    // rows filed under "India" without an alias list.
    expect(day).toMatch(/normCuisine\(r\.cuisine\)\.toLowerCase\(\) === wantCuisine/);
    expect(day).toMatch(/normCuisine\(q\.cuisine\)\.toLowerCase\(\)/);
    expect(day).not.toMatch(/=== q\.cuisine\b/);
  });

  it('shows the same name on the card as on the index it was reached from', () => {
    expect(day).toMatch(/cuisine: normCuisine\(r\.cuisine\)/);
  });
});
