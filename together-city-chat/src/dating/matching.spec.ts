import { factorScores, type DXProfile } from './matching';
/** The whole module, so an assertion can read as a claim about the engine.
 *  Kept as the namespace import itself: aliasing it through `const NEW = ENGINE`
 *  makes NEW a VALUE, and `NEW.DXProfile` in type position then fails with
 *  TS2503. vitest did not catch that — esbuild strips types without checking
 *  them — so it only surfaced under tsc and ts-jest. */
import * as NEW from './matching';

type DX = DXProfile;

/** Deterministic PRNG — no Math.random, so the numbers are reproducible. */
let seed = 20260731;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
const some = <T,>(xs: T[], n: number): T[] => xs.filter(() => rnd() < n / xs.length);

const DIETS = ['Vegetarian', 'Vegan', 'Non-vegetarian', 'Jain', 'Eggetarian'];
const SMOKE = ['Never', 'Socially', 'Regularly'];
const DRINK = ['Never', 'Socially', 'Regularly'];
const GOALS = ['Friendship First', 'Casual Dating', 'Serious Dating', 'Long-term Relationship', 'Marriage'];
const TRAITS = ['Funny', 'Calm', 'Ambitious', 'Romantic', 'Adventurous', 'Introvert', 'Extrovert', 'Creative', 'Family-Oriented', 'Spiritual'];
const VALUES = ['Family', 'Honesty', 'Loyalty', 'Kindness', 'Career', 'Adventure', 'Personal Growth', 'Financial Stability'];
const CITIES = ['Mumbai', 'Pune', 'Bengaluru', 'Delhi', 'London', 'Dubai'];

/** A citizen who filled the form in. */
function full(): DX & { interests: string[] } {
  return {
    personalityTraits: some(TRAITS, 4), values: some(VALUES, 3), relationshipGoal: pick(GOALS),
    diet: pick(DIETS), smoking: pick(SMOKE), drinking: pick(DRINK), fitnessLevel: pick(['Low', 'Moderate', 'High']),
    prefDiet: rnd() < 0.5 ? pick(DIETS) : undefined,
    prefSmoking: rnd() < 0.5 ? pick(SMOKE) : undefined,
    prefDrinking: rnd() < 0.4 ? pick(DRINK) : undefined,
    city: pick(CITIES), state: 'X',
    interests: some(['Travel', 'Music', 'Reading', 'Cooking', 'Fitness', 'Art', 'Pets', 'Gaming'], 3),
  };
}
/** A citizen who answered almost nothing — M4's "thin profile". */
function thin(): DX & { interests: string[] } {
  return { city: pick(CITIES), interests: [] };
}

const ASTRO = [58, 62, 64, 86, 88, 92, 99];   // the real AFFINITY values

function scores(mod: typeof NEW, a: DX & { interests: string[] }, b: DX & { interests: string[] }, astro: number) {
  const f = mod.factorScores(astro, a.interests, b.interests, a, b);
  return { overall: mod.overallScore(f), f };
}

const PAIRS = 4000;
function run(mod: typeof NEW, make: () => DX & { interests: string[] }) {
  seed = 20260731;
  const out: number[] = [];
  for (let i = 0; i < PAIRS; i++) out.push(scores(mod, make(), make(), pick(ASTRO)).overall);
  return out;
}
const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
const over = (xs: number[], n: number) => xs.filter((x) => x >= n).length / xs.length;

describe('a stated preference now counts', () => {
  const base: DX & { interests: string[] } = {
    diet: 'Vegetarian', smoking: 'Never', drinking: 'Never',
    relationshipGoal: 'Marriage', city: 'Pune', interests: [],
  };
  const veg = { ...base, prefDiet: 'Vegetarian' };
  const them = { ...base, diet: 'Non-vegetarian' };

  it('scores a met preference above a missed one', () => {
    const met = scores(NEW, veg, { ...base, diet: 'Vegetarian' }, 88).overall;
    const missed = scores(NEW, veg, them, 88).overall;
    expect(met).toBeGreaterThan(missed);
  });

  it('treats "Any" as no preference rather than as a demand', () => {
    const anyPref = { ...base, prefDiet: undefined };
    expect(scores(NEW, anyPref, them, 88).overall).toBe(scores(NEW, anyPref, { ...them }, 88).overall);
    // and stating nothing never scores worse than stating something that matched
    expect(scores(NEW, anyPref, them, 88).overall)
      .toBeGreaterThan(scores(NEW, veg, them, 88).overall);
  });

  it('names the met preference so the citizen can see it counted', () => {
    const notes = NEW.preferenceNotes(veg, { ...base, diet: 'Vegetarian' });
    expect(notes).toEqual(['Vegetarian — the diet you asked for.']);
    expect(NEW.preferenceNotes(veg, them)).toEqual([]);
  });

  it('counts preferences in both directions', () => {
    const iWant = { ...base, prefSmoking: 'Never' };
    const theyWant = { ...base, prefSmoking: 'Never', smoking: 'Regularly' };
    // They smoke regularly and I asked for never; they asked for never and I don't smoke.
    const notes = NEW.preferenceNotes(theyWant, iWant);
    expect(notes).toEqual(['Never — the smoking you asked for.']);
    expect(NEW.preferenceNotes(iWant, theyWant)).toEqual([]);
  });
});

describe('the 75% bar still means something in both directions', () => {
  const compatible = (astro: number) => {
    const a: DX & { interests: string[] } = {
      personalityTraits: ['Calm', 'Creative', 'Family-Oriented', 'Spiritual'],
      values: ['Family', 'Honesty', 'Loyalty'], relationshipGoal: 'Marriage',
      diet: 'Vegetarian', smoking: 'Never', drinking: 'Never', fitnessLevel: 'Moderate',
      prefDiet: 'Vegetarian', prefSmoking: 'Never',
      city: 'Pune', state: 'MH', interests: ['Travel', 'Music', 'Cooking'],
    };
    return scores(NEW, a, { ...a }, astro).overall;
  };

  it('a well-matched, fully-answered pair still scores high', () => {
    expect(compatible(92)).toBeGreaterThanOrEqual(85);
    expect(compatible(62)).toBeGreaterThanOrEqual(70);   // even on clashing elements
  });

  it('a plausible good-not-perfect pair can still clear 75', () => {
    const a: DX & { interests: string[] } = {
      personalityTraits: ['Calm', 'Creative'], values: ['Family', 'Honesty'],
      relationshipGoal: 'Long-term Relationship', diet: 'Vegetarian', smoking: 'Never',
      drinking: 'Socially', fitnessLevel: 'Moderate', prefDiet: 'Vegetarian',
      city: 'Pune', state: 'MH', interests: ['Travel', 'Music'],
    };
    const b: DX & { interests: string[] } = {
      ...a, personalityTraits: ['Calm', 'Ambitious'], values: ['Family', 'Career'],
      relationshipGoal: 'Marriage', drinking: 'Never', city: 'Mumbai',
      interests: ['Travel', 'Reading'],
    };
    expect(scores(NEW, a, b, 92).overall).toBeGreaterThanOrEqual(70);
  });
});

describe('a blank profile cannot buy a curated match with star signs (M4)', () => {
  it('never reaches 75 on any elemental pairing', () => {
    // Every value AFFINITY can produce, against two profiles that answered
    // nothing. Before the floors came down these pairs reached 78.
    for (const astro of [58, 60, 62, 64, 86, 88, 92, 99]) {
      const blank: DX & { interests: string[] } = { city: 'Pune', interests: [] };
      expect(scores(NEW, blank, { ...blank }, astro).overall).toBeLessThan(75);
    }
  });

  it('still leads with astrology — the weight is deliberately untouched', () => {
    expect(NEW.WEIGHTS.astrology).toBe(0.5);
    const sum = Object.values(NEW.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100) / 100).toBe(1);
  });

  it('lets a filled-in profile out-score a blank one on identical stars', () => {
    const blank: DX & { interests: string[] } = { city: 'Pune', interests: [] };
    const filled: DX & { interests: string[] } = {
      personalityTraits: ['Calm', 'Creative'], values: ['Family', 'Honesty'],
      relationshipGoal: 'Marriage', diet: 'Vegetarian', smoking: 'Never',
      drinking: 'Never', fitnessLevel: 'Moderate', city: 'Pune', state: 'MH',
      interests: ['Travel', 'Music'],
    };
    expect(scores(NEW, filled, { ...filled }, 88).overall)
      .toBeGreaterThan(scores(NEW, blank, { ...blank }, 88).overall);
  });
});
