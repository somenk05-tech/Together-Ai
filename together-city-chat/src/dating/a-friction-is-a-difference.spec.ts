import { factorScores, frictions, type DXProfile } from './matching';

/**
 * ── A FRICTION IS A DIFFERENCE, NOT A SILENCE ──
 *
 * "One thing to explore" prints under a match card. All four of its sentences
 * read a factor SCORE, and all four of those scores have a default that sits
 * inside the band being tested — an unplaceable pair scores 20 for location, a
 * pair with nothing comparable scores 45 for lifestyle, empty values are 20 and
 * empty traits are 35. Every default is below its own threshold. So the
 * sentences fired hardest on the pairs the engine knew least about, and on
 * launch day that is every pair.
 *
 * Two profiles carrying the launch-day minimum — a birth date, a bio, three
 * interests — were told "You are a long way apart" and "Your day-to-day habits
 * look quite different". Neither had entered a city or a single lifestyle
 * answer. Those are assertions of fact about two strangers, generated from the
 * absence of an answer, and printed with total confidence.
 *
 * The rule now: each sentence says what was answered before it says what it
 * means. `distanceNote` one function below already worked this way — "Omitted
 * rather than hedged" — and this is that rule applied to the four that lacked
 * it.
 */
const blank: DXProfile = {};
const score = (a: DXProfile, b: DXProfile) => factorScores(70, [], [], a, b);

describe('what a card says about two people who have answered nothing', () => {
  it('says nothing at all', () => {
    expect(frictions(score(blank, blank), blank, blank)).toEqual([]);
  });

  it('in particular, does not tell them how far apart they are', () => {
    // The whole finding in one line. locationScore returns 20 for a pair it
    // cannot place, and 20 is inside the "a long way apart" band.
    const f = score(blank, blank);
    expect(f.location).toBe(20);
    expect(frictions(f, blank, blank).join(' ')).not.toMatch(/long way apart/);
  });

  it('and does not tell them their habits differ', () => {
    const f = score(blank, blank);
    expect(f.lifestyle).toBe(45);
    expect(frictions(f, blank, blank).join(' ')).not.toMatch(/habits/);
  });

  it('and does not tell them their values or temperaments differ', () => {
    const said = frictions(score(blank, blank), blank, blank).join(' ');
    expect(said).not.toMatch(/value/);
    expect(said).not.toMatch(/temperament/);
  });
});

describe('what it still says when the answers are there', () => {
  const mumbai: DXProfile = { city: 'Mumbai', state: 'Maharashtra', country: 'India' };
  const london: DXProfile = { city: 'London', country: 'United Kingdom' };

  it('names a distance it actually measured', () => {
    expect(frictions(score(mumbai, london), mumbai, london)).toContain('You are a long way apart.');
  });

  it('says nothing about distance when only ONE of them can be placed', () => {
    const nowhere: DXProfile = { city: 'Nowhereville' };
    expect(frictions(score(mumbai, nowhere), mumbai, nowhere).join(' ')).not.toMatch(/long way apart/);
  });

  it('names a lifestyle difference both of them described', () => {
    const a: DXProfile = { diet: 'Vegetarian', smoking: 'Never', drinking: 'Never' };
    const b: DXProfile = { diet: 'Non-vegetarian', smoking: 'Regularly', drinking: 'Regularly' };
    expect(frictions(score(a, b), a, b)).toContain('Your day-to-day habits look quite different.');
  });

  it('says nothing about habits when only one of them answered', () => {
    const a: DXProfile = { diet: 'Vegetarian', smoking: 'Never' };
    expect(frictions(score(a, blank), a, blank).join(' ')).not.toMatch(/habits/);
  });

  it('names a values gap both of them filled in', () => {
    const a: DXProfile = { values: ['Career', 'Adventure'] };
    const b: DXProfile = { values: ['Family', 'Loyalty'] };
    expect(frictions(score(a, b), a, b)).toContain('Not much overlap in what you each said you value.');
  });

  it('names a temperament gap both of them filled in', () => {
    const a: DXProfile = { personalityTraits: ['Calm', 'Introvert'] };
    const b: DXProfile = { personalityTraits: ['Ambitious', 'Adventurous'] };
    expect(frictions(score(a, b), a, b)).toContain('Very different temperaments.');
  });

  it('still says the one sentence that is ABOUT an absence, because it says so', () => {
    // "They have not said what they are looking for yet" is honest: it reports
    // the silence rather than reading a meaning into it.
    const a: DXProfile = { relationshipGoal: 'Marriage' };
    expect(frictions(score(a, blank), a, blank)).toContain('They have not said what they are looking for yet.');
  });
});
