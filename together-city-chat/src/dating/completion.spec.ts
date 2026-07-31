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
    // Still suggested — it survives the five-gap cap because the extras are
    // appended after it rather than competing for a place in it.
    expect(c.suggestions.some((s) => s.key === 'birthTime')).toBe(true);
  });

  it('M5: skipping a field the form calls optional does not cost the meter', () => {
    // Birth time is labelled "(optional)" on the profile form and used to be
    // worth 12 points — third-heaviest of all. Somebody who read the label and
    // believed it was told they were 88% complete.
    const full = {
      bio: 'A genuine line or two about me and what I love doing.',
      interests: ['Travel', 'Music', 'Cooking'],
      photos: ['a', 'b', 'c', 'd', 'e'],
      personalityTraits: ['Funny', 'Calm', 'Creative'],
      values: ['Family'],
      languages: ['English'],
      city: 'Mumbai',
      relationshipGoal: 'Serious Dating',
      diet: 'Veg', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Active',
      prefAgeMin: 25, prefAgeMax: 35,
    };
    const without = profileCompletion(full);
    const with_ = profileCompletion({ ...full, birthTime: '08:30' });
    expect(without.percent).toBe(100);
    expect(without.complete).toBe(true);
    expect(with_.percent).toBe(100);
  });

  it('three photos is a complete profile; five is advice', () => {
    const base = {
      bio: 'A genuine line or two about me and what I love doing.',
      interests: ['Travel', 'Music', 'Cooking'],
      personalityTraits: ['Funny', 'Calm', 'Creative'],
      values: ['Family'], languages: ['English'], city: 'Mumbai',
      relationshipGoal: 'Serious Dating',
      diet: 'Veg', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Active',
      prefAgeMin: 25, prefAgeMax: 35,
    };
    expect(profileCompletion({ ...base, photos: ['a', 'b', 'c'] }).percent).toBe(100);
  });

  it('still SUGGESTS the optional extras, marked as optional', () => {
    // They are good advice — the astrology matching really is sharper with a
    // birth time. Suggesting and charging are different things.
    const c = profileCompletion({ photos: ['a', 'b', 'c'] });
    const birth = c.suggestions.find((s) => s.key === 'birthTime');
    expect(birth?.optional).toBe(true);
    expect(birth?.weight).toBe(0);
  });

  it('does not let the five-gap cap swallow the extras', () => {
    // Eleven things missing. A combined top-five would have dropped every
    // weight-0 suggestion, so the nudge would only reach people who no longer
    // needed it.
    const c = profileCompletion({ photos: ['a', 'b', 'c'] });
    expect(c.suggestions.filter((s) => !s.optional)).toHaveLength(5);
    expect(c.suggestions.some((s) => s.key === 'birthTime')).toBe(true);
  });

  it('never leads the suggestions with something optional', () => {
    // A list that opens with "add your birth time" while the bio is empty is
    // advice in the wrong order.
    const c = profileCompletion({ photos: ['a', 'b', 'c'] });
    expect(c.suggestions[0].optional).toBeFalsy();
    const firstOptional = c.suggestions.findIndex((s) => s.optional);
    const lastRequired = c.suggestions.map((s) => Boolean(s.optional)).lastIndexOf(false);
    if (firstOptional !== -1) expect(firstOptional).toBeGreaterThan(lastRequired);
  });
});
