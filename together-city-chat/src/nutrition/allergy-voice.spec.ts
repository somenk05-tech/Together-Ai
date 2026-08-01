import { corpusExcludedBy } from './nutrition.service';

/**
 * The composed plan says what the allergy rule kept out of it. (K5.66.)
 *
 * The plan has honoured allergies since BE-8.4 and never mentioned it. The
 * count is over the corpus rather than the finished week on purpose: a week has
 * twenty-eight slots and would report "0 removed" for somebody whose entire
 * cuisine had been filtered away before the composer ever ran.
 */
const r = (name: string, ...ings: string[]) => ({ name, ingredients: ings.map((n) => ({ name: n })) });

const POOL = [
  r('Paneer Butter Masala', 'paneer', 'butter', 'tomato'),
  r('Kaju Curry', 'kaju', 'onion'),
  r('Masala Dosa', 'rice', 'potato', 'urad dal'),
  r('Rajma Chawal', 'rajma', 'rice', 'onion'),
];

describe('what a declaration removes from the corpus', () => {
  it('finds the family, not the typed word — "milk" reaches paneer', () => {
    const cut = corpusExcludedBy(POOL, ['milk']);
    expect(cut.removed).toBe(1);
    expect(cut.matched).toEqual(['milk']);
  });

  it('"nuts" reaches kaju, and nothing else here', () => {
    expect(corpusExcludedBy(POOL, ['nuts']).removed).toBe(1);
  });

  it('nothing declared is not the same as nothing removed', () => {
    expect(corpusExcludedBy(POOL, [])).toEqual({ matched: [], removed: 0 });
  });

  it('a declaration the corpus does not contain reports zero, not a guess', () => {
    expect(corpusExcludedBy(POOL, ['shellfish']).removed).toBe(0);
  });

  it('two declarations are both named', () => {
    const cut = corpusExcludedBy(POOL, ['milk', 'nuts']);
    expect(cut.removed).toBe(2);
    expect(cut.matched).toEqual(['milk', 'nuts']);
  });

  it('memoises by declaration set — the corpus is process-wide and static', () => {
    const a = corpusExcludedBy(POOL, ['milk']);
    const b = corpusExcludedBy(POOL, ['MILK ']);   // same set, normalised
    expect(b).toBe(a);                              // the same object, not a rescan
    // A different pool length is a different key, so a rebuilt corpus recomputes
    // rather than serving a stale number.
    expect(corpusExcludedBy(POOL.slice(0, 3), ['milk'])).not.toBe(a);
  });
});
