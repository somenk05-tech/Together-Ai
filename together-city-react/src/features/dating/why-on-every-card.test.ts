import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { whyOnCard } from './components/MatchCards';

const read = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');

/**
 * WHY, ON EVERY CARD (owner rule; landed 4 Sep). The server sends reasons and
 * frictions with every card and only the detail screen drew them. One line
 * under the number now: the strongest reason, or the first friction when the
 * number is low.
 */
describe('why, on every card', () => {
  it('picks the strongest reason, and the first friction when the number is low', () => {
    expect(whyOnCard(84, ['Excellent astrological compatibility.', 'Shared interests in Films.'], ['You want different things.'])).toBe('Excellent astrological compatibility.');
    expect(whyOnCard(31, ['Strong astrological alignment.'], ['You want different things.'])).toBe('You want different things.');
    expect(whyOnCard(31, ['Strong astrological alignment.'], [])).toBe('Strong astrological alignment.');
    expect(whyOnCard(90, [], ['Different diets.'])).toBe('Different diets.');
    expect(whyOnCard(90, [], [])).toBeNull();
    expect(whyOnCard(90, undefined, undefined)).toBeNull();
  });

  it('the card draws it under the number', () => {
    const card = read('./components/MatchCards.tsx');
    expect(card).toMatch(/const why = whyOnCard\(match\.score, match\.reasons, match\.frictions\)/);
    expect(card).toMatch(/\{why && <p className="pm-why">\{why\}<\/p>\}/);
    expect(read('../../styles/relief.css')).toMatch(/\.pm-why \{/);
  });
});
