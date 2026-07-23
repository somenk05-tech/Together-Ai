import { profileCompletion } from './completion';

describe('dating profileCompletion', () => {
  it('is 0 for an empty profile and returns the highest-impact suggestions first', () => {
    const c = profileCompletion({});
    expect(c.percent).toBe(0);
    expect(c.complete).toBe(false);
    expect(c.suggestions.length).toBeGreaterThan(0);
    // photos (weight 16) is the single most impactful missing signal.
    expect(c.suggestions[0].key).toBe('photos');
    // suggestions are ranked by weight, descending.
    const weights = c.suggestions.map((s) => s.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it('reaches 100% when every signal is present', () => {
    const c = profileCompletion({
      bio: 'A genuine line or two about me and what I love doing.',
      interests: ['Travel', 'Music', 'Cooking'],
      birthTime: '08:30',
      photos: ['a', 'b', 'c', 'd', 'e'],
      personalityTraits: ['Funny', 'Calm', 'Creative'],
      values: ['Family'],
      languages: ['English'],
      city: 'Mumbai',
      relationshipGoal: 'Serious Dating',
      diet: 'Veg', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Active',
      prefAgeMin: 25, prefAgeMax: 35,
    });
    expect(c.percent).toBe(100);
    expect(c.complete).toBe(true);
    expect(c.suggestions).toHaveLength(0);
  });

  it('flags birth time as a suggestion when missing (astrology accuracy)', () => {
    const c = profileCompletion({ bio: 'x'.repeat(30), interests: ['a', 'b', 'c'], photos: ['a', 'b', 'c'] });
    expect(c.percent).toBeGreaterThan(0);
    expect(c.percent).toBeLessThan(100);
    expect(c.suggestions.some((s) => s.key === 'birthTime')).toBe(true);
  });
});
