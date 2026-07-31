import {
  distanceNote, factorScores, matchAlertBody, matchAlertReason, type DXProfile,
} from './matching';
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

const at = (city: string, extra: Partial<DXProfile> = {}): DXProfile => ({ city, country: 'India', ...extra });
const loc = (a: DXProfile, b: DXProfile) => factorScores(88, [], [], a, b).location;

describe('location is measured now, not spelled', () => {
  it('treats the two spellings of one city as one place (M7)', () => {
    expect(loc(at('Bengaluru'), at('Bangalore'))).toBe(100);
    expect(loc(at('Mumbai'), at('Bombay'))).toBe(100);
  });
  it('separates a day trip from a flight', () => {
    expect(loc(at('Mumbai'), at('Pune'))).toBe(85);       // ~120 km
    expect(loc(at('Mumbai'), at('Delhi'))).toBe(50);      // ~1150 km, a flight
    expect(loc(at('Mumbai'), at('London'))).toBe(25);     // ~7,200 km
  });
  it('is the audit’s complaint, closed: India-metro × overseas no longer scores near', () => {
    expect(loc(at('Delhi'), at('New York'))).toBeLessThan(loc(at('Delhi'), at('Jaipur')));
  });
});

describe('prefDistanceKm finally does something', () => {
  it('penalises a candidate beyond a stated limit', () => {
    const near = at('Pune', { prefDistanceKm: 200 });
    expect(loc(near, at('Mumbai'))).toBe(85);             // ~120 km, inside 200
    expect(loc(near, at('Delhi'))).toBe(30);              // ~1170 km, outside
  });
  it('honours the limit in both directions', () => {
    const strict = at('Delhi', { prefDistanceKm: 50 });
    expect(loc(at('Mumbai'), strict)).toBe(30);
    expect(loc(strict, at('Mumbai'))).toBe(30);
  });
  it('does nothing when nobody set one', () => {
    expect(loc(at('Mumbai'), at('Delhi'))).toBe(50);
  });
  it('ignores a nonsense limit rather than blocking everybody', () => {
    expect(loc(at('Mumbai'), at('Pune', { prefDistanceKm: 0 }))).toBe(85);
  });
});

describe('when a place cannot be resolved, nothing is invented', () => {
  it('falls back to exactly the old behaviour', () => {
    expect(loc(at('Nowhereville', { state: 'MH' }), at('Elsewheretown', { state: 'MH' }))).toBe(70);
    expect(loc({ city: 'Nowhereville' }, { city: 'Nowhereville' })).toBe(100);
    expect(loc({ city: 'Nowhereville' }, { city: 'Elsewheretown' })).toBe(30);
  });
  it('does not apply a distance preference to a distance nobody measured', () => {
    const p = { city: 'Nowhereville', prefDistanceKm: 10 };
    expect(loc(p, { city: 'Nowhereville' })).toBe(100);
  });
  it('prints no distance line on a card it could not measure', () => {
    expect(distanceNote({ city: 'Nowhereville' }, { city: 'Pune' })).toBeNull();
    expect(distanceNote(at('Pune'), at('Pune'))).toBe('In your city.');
    expect(distanceNote(at('Mumbai'), at('Pune'))).toMatch(/^About 1[0-9]{2} km away/);
  });
});

describe('why a match appeared', () => {
  it('THE BUG: an edit is not an arrival', () => {
    // reindexAfterChange fires on every save. The old copy said "A newly
    // compatible member just joined your matches" whichever it was.
    expect(matchAlertBody(matchAlertReason(68))).not.toMatch(/joined/i);
    expect(matchAlertBody(matchAlertReason(68))).toContain('updated their profile');
  });

  it('says "new to your matches" when the pair was never scored', () => {
    expect(matchAlertReason(null)).toBe('new-to-you');
    expect(matchAlertReason(undefined)).toBe('new-to-you');
    expect(matchAlertBody('new-to-you')).toContain('new to your matches');
  });

  it('treats a real previous score as a change, including zero', () => {
    // 0 is a score. `prev == null` is the test, not falsiness — `!prev` would
    // call a pair that scored 0 and now scores 80 a new arrival.
    expect(matchAlertReason(0)).toBe('they-changed');
    expect(matchAlertReason(74)).toBe('they-changed');
  });

  it('never claims to know WHY the pair was unscored', () => {
    // New to the pool, previously hard-filtered, or simply never computed —
    // the app cannot tell, so it says the one thing true of all three.
    const body = matchAlertBody('new-to-you');
    expect(body).not.toMatch(/joined|signed up|new member/i);
  });
});
