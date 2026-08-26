import { describe, it, expect } from 'vitest';
import { startersFor, strengthsSentence } from './starters';

/**
 * The starters are read off the profile, never invented — so their shape is a
 * thing a unit test can hold: always four, personalised lines first, the
 * owner's evergreen four filling the rest, and a question for every label.
 */
describe('what to say first, made from what they said', () => {
  it('a full profile leads with their own interests and city', () => {
    const s = startersFor({ name: 'Mira', interests: ['Street photography', 'Cooking'], city: 'Mumbai' });
    expect(s).toHaveLength(4);
    expect(s[0].label).toBe('How Mira got into street photography');
    expect(s[0].question).toBe('How did you get into street photography?');
    expect(s[1].label).toBe('Mira’s Mumbai');
    expect(s[1].question).toContain('Mumbai');
    // The evergreens top it up — and every entry can be sent as typed.
    for (const x of s) expect(x.question.endsWith('?')).toBe(true);
  });

  it('a sparse profile still gets the evergreen four', () => {
    const s = startersFor({ name: 'Mira' });
    expect(s.map((x) => x.label)).toEqual([
      'Mira’s ideal Sunday',
      'A place Mira would go back to tomorrow',
      'Mira’s hidden talent',
      'The best film Mira has seen recently',
    ]);
  });

  it('never guesses a pronoun — the name carries every label', () => {
    for (const x of startersFor({ name: 'Sam', interests: ['Hiking'], city: 'Pune' })) {
      expect(x.label).not.toMatch(/\b(her|his|their)\b/i);
    }
  });

  it('a name ending in s takes the bare apostrophe', () => {
    expect(startersFor({ name: 'Hans' })[0].label).toBe('Hans’ ideal Sunday');
  });

  it('claims only factors that are actually strong, and never astrology', () => {
    // Strongest first — the order is the numbers' own, not the brief's prose.
    expect(strengthsSentence('Mira', {
      personality: 40, relationshipGoals: 96, values: 94, lifestyle: 91, interests: 30, location: 20,
    })).toBe('You and Mira are strong across relationship goals, values and lifestyle.');
    expect(strengthsSentence('Mira', {
      personality: 10, relationshipGoals: 20, values: 61, lifestyle: 12, interests: 30, location: 20,
    })).toBe('You and Mira are strong on values.');
    // Nothing over the bar: the honest smaller sentence, no invented strength.
    expect(strengthsSentence('Mira', {
      personality: 10, relationshipGoals: 20, values: 30, lifestyle: 12, interests: 30, location: 20,
    })).toMatch(/yours to find out/);
    expect(strengthsSentence('Mira', null)).toMatch(/yours to find out/);
  });
});
