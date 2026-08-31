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

/*
 * THE RANDOM-PAIR HARNESS CAME OUT, 28 AUG.
 *
 * A deterministic PRNG, seven vocabularies, two profile generators and a
 * 4,000-pair runner with `spread` and `over` to read the distribution it
 * produced. Every one of them was dead: the assertions in this file moved to
 * NAMED pairs — two people with stated diets and a stated goal, where a failure
 * says which rule broke — and the harness that made anonymous ones was left
 * behind. `vocabulary.spec.ts`, written the same week, is the version of the
 * distribution claim that survived, and it reads the SEED the form actually
 * serves rather than a list retyped here, which is the whole reason it caught
 * the largest bug in the hub.
 *
 * Removed rather than commented out: an unrunnable harness is not a spare tyre,
 * and this file's own history is in git.
 */

function scores(mod: typeof NEW, a: DX & { interests: string[] }, b: DX & { interests: string[] }, astro: number) {
  const f = mod.factorScores(astro, a.interests, b.interests, a, b);
  return { overall: mod.overallScore(f), f };
}

/**
 * The number a citizen is actually shown — raw x confidence, which is what
 * `dating.service.ts` computes at every one of its call sites.
 *
 * M4 is a claim about the CARD, not about an intermediate value: "the number on
 * the card said 87% compatible when the honest sentence was we know almost
 * nothing about either of you". Asserting it on the raw score happened to work
 * while astrology carried 0.50 and stopped working at 0.90, where a blank pair's
 * raw score is 93 and the multiplier is the thing holding the line.
 */
function shown(mod: typeof NEW, a: DX & { interests: string[] }, b: DX & { interests: string[] }, astro: number) {
  const f = mod.factorScores(astro, a.interests, b.interests, a, b);
  return mod.overallScore(f, mod.confidenceFor(a, b, a.interests, b.interests));
}


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
    // Clashing elements no longer leave much room: at astrology 0.90 the other
    // six factors can move a pair about ten points in total, so a clashing chart
    // caps a perfect pair in the sixties. That is what 0.90 means, and asserting
    // the old 70 here would only be asserting that the weight had not changed.
    expect(compatible(62)).toBeGreaterThanOrEqual(60);
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
      expect(shown(NEW, blank, { ...blank }, astro)).toBeLessThan(75);

    }
  });

  it('leads with astrology, at the weight the owner set', () => {
    // 0.50 (23 Aug) → 0.90 (26 Aug). The number is asserted rather than derived
    // so that changing it is a deliberate edit in two places, not a drift.
    expect(NEW.WEIGHTS.astrology).toBe(0.9);
    const sum = Object.values(NEW.WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 1000) / 1000).toBe(1);
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
    // 30 → 20. An unplaceable pair used to score MORE than a measured 4,000 km
    // (25), so at global scale being unlocatable was worth more than being far
    // away. 20 sits below every distance the table can actually measure.
    expect(loc({ city: 'Nowhereville' }, { city: 'Elsewheretown' })).toBe(20);
  });
  it('does not apply a distance preference to a distance nobody measured', () => {
    const p = { city: 'Nowhereville', prefDistanceKm: 10 };
    expect(loc(p, { city: 'Nowhereville' })).toBe(100);
  });
  it('prints no distance line on a card it could not measure', () => {
    expect(distanceNote({ city: 'Nowhereville' }, { city: 'Pune' })).toBeNull();
    expect(distanceNote(at('Pune'), at('Pune'))).toBe('In your city.');
    // A band, never a number, since 31 Aug (H2): Mumbai–Pune is 120 km.
    expect(distanceNote(at('Mumbai'), at('Pune'))).toBe('50–150 km away — an easy day out.');
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
