/**
 * The chips are a promise, and this is where it is kept.
 *
 * The profile form has offered five deal-breakers since it was written. Three
 * were implemented. A citizen who ticked "Marriage Intentions" or "Distance"
 * watched a control light up and save, and the engine never read the field —
 * which at astrology 0.50 is not a ranking nuisance but the whole of the
 * protection missing, because a mismatched intent that is merely SCORED is
 * out-scored by a good chart almost every time.
 *
 * Two more chips are added here (Diet, Religion) over fields that were already
 * collected and read by nothing.
 *
 * The drift pin at the bottom is the point of the file: it fails when somebody
 * adds a chip to the form without adding a branch to `hardFilterReason`.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  confidenceFor, coverage, confidence, curatedBar, effectiveDealBreakers, frictions, factorScores, hardFilterReason, overallScore,
  unreachableReason, mismatchReasons, mismatchFactor, type DXProfile,
} from './matching';

const dx = (p: Partial<DXProfile> = {}): DXProfile => ({ ...p });

/**
 * SINCE 1 SEP THESE COUNT POINTS, NOT PEOPLE (owner).
 *
 * Every rule below about WHEN intent registers is unchanged and still pinned
 * here — a side rather than a distance, unstated on either side is nothing, the
 * chip's own opt-out respected. What changed is the consequence: the pair stays
 * visible and `mismatchFactor` takes the number down. So each case asserts both
 * halves — nobody is removed, AND the mismatch is named.
 */
describe('Marriage Intentions — a side of the line, not a distance along it', () => {
  const seeker = dx({ dealBreakers: ['Marriage Intentions'], relationshipGoal: 'Marriage' });
  const casual = dx({ relationshipGoal: 'Casual Dating' });

  it('keeps a casual dater in front of a marriage-seeker, and says they differ', () => {
    expect(hardFilterReason(seeker, casual, 30)).toBeNull();
    expect(mismatchReasons(seeker, casual)).toContain('intent');
  });

  it('keeps Serious Dating, which is two steps away and the same side', () => {
    expect(mismatchReasons(seeker, dx({ relationshipGoal: 'Serious Dating' }))).toEqual([]);
  });

  it('names Friendship First, which is one step further out and the other side', () => {
    expect(mismatchReasons(seeker, dx({ relationshipGoal: 'Friendship First' }))).toContain('intent');
  });

  it('counts a stated intent even with no chip ticked, since 26 Aug', () => {
    // Intent, children and diet are core since 26 Aug — see effectiveDealBreakers.
    // They stopped removing anybody on 1 Sep; they did not stop counting.
    expect(mismatchReasons(dx({ relationshipGoal: 'Marriage' }), casual)).toContain('intent');
  });

  it('goes back to chips-only with DATING_CORE_FILTERS=off', () => {
    process.env.DATING_CORE_FILTERS = 'off';
    try {
      expect(mismatchReasons(dx({ relationshipGoal: 'Marriage' }), casual)).toEqual([]);
    } finally { delete process.env.DATING_CORE_FILTERS; }
  });

  it('counts nobody when either side never said what they want', () => {
    expect(mismatchReasons(seeker, dx({}))).toEqual([]);
    expect(mismatchReasons(dx({ dealBreakers: ['Marriage Intentions'] }), casual)).toEqual([]);
  });

  it('is a property of the pair, so it reads the same from either side', () => {
    // `unreachableReason` no longer has an opinion here — neither side removes
    // the other. The penalty is what carries the disagreement, and it must be
    // identical whichever of them is looking, or one screen contradicts the other.
    expect(unreachableReason(casual, seeker, 30, 31)).toBeNull();
    expect(unreachableReason(seeker, casual, 31, 30)).toBeNull();
    expect(mismatchFactor(casual, seeker)).toBe(mismatchFactor(seeker, casual));
    expect(mismatchFactor(casual, seeker)).toBeLessThan(0.5);
  });
});

describe('Distance — the limit they already stated', () => {
  const mumbai = { city: 'Mumbai', state: 'Maharashtra', country: 'India' };
  const delhi = { city: 'Delhi', state: 'Delhi', country: 'India' };
  const pune = { city: 'Pune', state: 'Maharashtra', country: 'India' };

  it('counts somebody beyond the stated kilometres, and still shows them', () => {
    const far = dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 200 });
    expect(mismatchReasons(far, dx(delhi))).toContain('distance');
    expect(hardFilterReason(far, dx(delhi), 30)).toBeNull();
  });

  it('counts nothing against somebody inside them', () => {
    expect(mismatchReasons(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 200 }), dx(pune))).toEqual([]);
  });

  it('counts nothing when the distance could not be measured', () => {
    expect(mismatchReasons(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 5 }), dx({ city: 'Nowhere-On-Sea' }))).toEqual([]);
  });

  it('counts nothing when the chip is not ticked', () => {
    expect(mismatchReasons(dx({ ...mumbai, prefDistanceKm: 200 }), dx(delhi))).toEqual([]);
  });

  it('counts nothing on a nonsense limit', () => {
    expect(mismatchReasons(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 0 }), dx(delhi))).toEqual([]);
  });
});

describe('Diet and Religion — collected all along, read for the first time', () => {
  it('counts a non-vegetarian against someone who asked for vegetarian and meant it', () => {
    const jain = dx({ dealBreakers: ['Diet'], prefDiet: 'Vegetarian' });
    expect(mismatchReasons(jain, dx({ diet: 'Non-vegetarian' }))).toContain('diet');
    expect(hardFilterReason(jain, dx({ diet: 'Non-vegetarian' }), 30)).toBeNull();
    expect(mismatchReasons(jain, dx({ diet: 'Vegetarian' }))).toEqual([]);
  });

  it('treats "Any" as no preference, never as a penalty', () => {
    expect(mismatchReasons(dx({ dealBreakers: ['Diet'] }), dx({ diet: 'Non-vegetarian' }))).toEqual([]);
  });

  it('counts nothing over a diet the candidate never stated', () => {
    expect(mismatchReasons(dx({ dealBreakers: ['Diet'], prefDiet: 'Vegetarian' }), dx({}))).toEqual([]);
  });

  it('honours religion only when it is on the list', () => {
    const a = dx({ religion: 'Hindu' }), b = dx({ religion: 'Christian' });
    expect(mismatchReasons(a, b)).toEqual([]);
    expect(mismatchReasons(dx({ ...a, dealBreakers: ['Religion'] }), b)).toContain('religion');
  });
});

describe('M4 — confidence, so a score says how much of it is an answer', () => {
  const blank = dx({});
  const full = dx({
    personalityTraits: ['Introvert', 'Creative'], values: ['Family', 'Growth'],
    relationshipGoal: 'Marriage', diet: 'Vegetarian', smoking: 'Never', drinking: 'Never',
    fitnessLevel: 'Active', city: 'Pune', state: 'Maharashtra', country: 'India',
  });

  it('is at its floor when only the birth date is known', () => {
    // `coverage` is the share of the SIX answerable factors, not a share of the
    // weight. It had to stop being weight-based: at astrology 0.90 a pair who
    // had answered nothing scored coverage 0.90, so the penalty that exists to
    // stop a stranger being oversold switched itself off exactly when it was
    // most needed. Two blank profiles here share a city, which is one of the six.
    expect(coverage(blank, blank, [], [])).toBeCloseTo(0, 5);
    expect(confidence(coverage(blank, blank, [], []))).toBeCloseTo(0.7, 5);
  });

  it('is 1.0, and changes nothing, when both people filled the form in', () => {
    const cov = coverage(full, full, ['Trekking'], ['Trekking']);
    expect(cov).toBeCloseTo(1, 5);
    expect(confidence(cov)).toBeCloseTo(1, 5);
  });

  it('keeps two blank profiles off the curated shelf on a 99 astrology score', () => {
    const f = factorScores(99, [], [], blank, blank);
    const shown = overallScore(f, confidence(coverage(blank, blank, [], [])));
    expect(shown).toBeLessThan(overallScore(f));
    expect(shown).toBeLessThan(75);
  });

  it("leaves a filled-in pair's score exactly where it was", () => {
    const f = factorScores(88, ['Trekking'], ['Trekking'], full, full);
    expect(overallScore(f, confidence(coverage(full, full, ['Trekking'], ['Trekking'])))).toBe(overallScore(f));
  });
});

describe('the sentence the card was missing', () => {
  it('names a difference in what each of them is looking for', () => {
    const a = dx({ relationshipGoal: 'Marriage' }), b = dx({ relationshipGoal: 'Casual Dating' });
    const out = frictions(factorScores(90, [], [], a, b), a, b);
    expect(out[0]).toContain('Marriage');
    expect(out[0]).toContain('Casual Dating');
  });

  it('says nothing when there is nothing to say', () => {
    const a = dx({ relationshipGoal: 'Marriage', wantsChildren: 'Yes', city: 'Pune' });
    const f = factorScores(90, [], [], a, a);
    f.location = 100; f.lifestyle = 90; f.values = 90; f.personality = 90;
    expect(frictions(f, a, a)).toEqual([]);
  });

  it('never runs to more than two', () => {
    const a = dx({ relationshipGoal: 'Marriage', wantsChildren: 'Yes' });
    const b = dx({ relationshipGoal: 'Casual Dating', wantsChildren: 'No' });
    const f = factorScores(90, [], [], a, b);
    f.location = 25; f.lifestyle = 20; f.values = 10; f.personality = 10;
    expect(frictions(f, a, b).length).toBeLessThanOrEqual(2);
  });
});

/**
 * The pin. Every label the form offers has a branch above; adding a chip
 * without adding a branch fails here rather than in production, silently, on
 * somebody's non-negotiable.
 */
describe('drift pin — the form and the engine agree on the list', () => {
  const FORM = path.join(__dirname, '../../../together-city-react/src/features/dating/pages/DatingProfile.tsx');

  it('offers exactly the deal-breakers hardFilterReason implements', () => {
    const src = fs.readFileSync(FORM, 'utf8');
    const m = src.match(/const DEAL_BREAKERS = \[([^\]]*)\]/);
    expect(m).toBeTruthy();
    const chips = (m as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
    expect(chips.sort()).toEqual(
      ['Diet', 'Distance', 'Drinking', 'Marriage Intentions', 'Religion', 'Smoking', 'Wants Children'].sort(),
    );
  });
});

describe('the switch under the multiplier', () => {
  const blank: DXProfile = {};
  afterEach(() => { delete process.env.DATING_CONFIDENCE; });

  it('is on by default', () => {
    expect(confidenceFor(blank, blank, [], [])).toBeLessThan(1);
  });

  it('DATING_CONFIDENCE=off restores the previous arithmetic exactly', () => {
    process.env.DATING_CONFIDENCE = 'off';
    expect(confidenceFor(blank, blank, [], [])).toBe(1);
    const f = factorScores(99, [], [], blank, blank);
    expect(overallScore(f, confidenceFor(blank, blank, [], []))).toBe(overallScore(f));
  });
});

describe('the curated bar', () => {
  afterEach(() => { delete process.env.DATING_BAR; delete process.env.DATING_BAR_FLOOR; });
  const spread = [90, 80, 70, 60, 50, 40, 30, 20, 10, 5];

  it('is the fixed bar only when asked for it', () => {
    process.env.DATING_BAR = 'fixed';
    expect(curatedBar(spread)).toBe(75);
    expect(curatedBar([], 75)).toBe(75);
  });

  it('draws at the top tenth of the viewer’s own list by default', () => {
    expect(curatedBar(spread)).toBe(80);
  });

  it('gives a short list a top tenth of itself rather than nothing', () => {
    expect(curatedBar([61, 44, 38, 12])).toBe(61);
    expect(curatedBar([44])).toBe(44);
  });

  it('falls back to the fixed bar when there is no list at all', () => {
    expect(curatedBar([], 75)).toBe(75);
  });

  it('honours a floor, because a top tenth of nothing is still nothing', () => {
    process.env.DATING_BAR_FLOOR = '62';
    expect(curatedBar([50, 44, 30])).toBe(62);
    expect(curatedBar(spread)).toBe(80);
  });
});

describe('core questions as the three that count most', () => {
  afterEach(() => { delete process.env.DATING_CORE_FILTERS; });
  const answered = dx({ relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian' });

  it('changes nothing once it is switched off', () => {
    process.env.DATING_CORE_FILTERS = 'off';
    expect(effectiveDealBreakers(answered)).toEqual([]);
    expect(mismatchReasons(answered, dx({ relationshipGoal: 'Casual Dating' }))).toEqual([]);
  });

  it('counts on the three answers by default', () => {
    expect(effectiveDealBreakers(answered).sort()).toEqual(['Diet', 'Marriage Intentions', 'Wants Children']);
    expect(mismatchReasons(answered, dx({ relationshipGoal: 'Casual Dating' }))).toContain('intent');
    expect(mismatchReasons(answered, dx({ wantsChildren: 'No' }))).toContain('children');
    expect(mismatchReasons(answered, dx({ diet: 'Non-vegetarian' }))).toContain('diet');
  });

  it('never invents an answer nobody gave', () => {
    expect(effectiveDealBreakers(dx({}))).toEqual([]);
    expect(mismatchReasons(dx({}), dx({ relationshipGoal: 'Casual Dating', wantsChildren: 'No', diet: 'Non-vegetarian' }))).toEqual([]);
  });

  it('keeps the chips the citizen ticked themselves', () => {
    process.env.DATING_CORE_FILTERS = 'on';
    expect(effectiveDealBreakers(dx({ dealBreakers: ['Smoking'], relationshipGoal: 'Marriage' })).sort())
      .toEqual(['Marriage Intentions', 'Smoking']);
  });

  // AN OPT-OUT IS AN ANSWER TOO. The three default on for an answered field,
  // and a citizen who unticks the chip has said "score it, do not hide anybody
  // over it" — without having to delete the answer to say so.
  it('lets the citizen untick one, and keeps the answer', () => {
    const opted = dx({
      relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian',
      dealBreakers: ['-Wants Children'],
    });
    expect(effectiveDealBreakers(opted).sort()).toEqual(['Diet', 'Marriage Intentions']);
    // Unticked means it does not count on THEIR side of the pair.
    expect(mismatchReasons(opted, dx({ wantsChildren: 'No' }))).toEqual([]);
    // The other two are untouched, and the answer itself still stands.
    expect(opted.wantsChildren).toBe('Yes');
    expect(mismatchReasons(opted, dx({ relationshipGoal: 'Casual Dating' }))).toContain('intent');
  });

  /**
   * AND AN OPT-OUT IS ONE PERSON'S, WHICH IS THE POINT OF IT.
   *
   * Unticking Wants Children says "I do not want this to cost anybody points
   * with me". It cannot say the same on behalf of somebody who answered No and
   * never opened the chip section — their answer is still on, by the same
   * default, and `mismatchFactor` reads the pair from both sides exactly as
   * `unreachableReason` always has. A citizen who could opt out of the other
   * person's position too would be shown 90% for somebody who will never be
   * interested, which is the opposite of what a percentage is for.
   */
  it('cannot untick the other person\'s answer, only their own', () => {
    const opted = dx({ wantsChildren: 'Yes', dealBreakers: ['-Wants Children'] });
    const themDefault = dx({ wantsChildren: 'No' });
    expect(mismatchReasons(opted, themDefault)).toEqual([]);
    expect(mismatchReasons(themDefault, opted)).toContain('children');
    expect(mismatchFactor(opted, themDefault)).toBe(0.55);

    // Both sides opted out — now it costs nothing, and reads the same either way.
    const themOpted = dx({ wantsChildren: 'No', dealBreakers: ['-Wants Children'] });
    expect(mismatchFactor(opted, themOpted)).toBe(1);
    expect(mismatchFactor(themOpted, opted)).toBe(1);
  });

  it('can be turned off one at a time or all three', () => {
    const none = dx({
      relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian',
      dealBreakers: ['-Marriage Intentions', '-Wants Children', '-Diet'],
    });
    expect(effectiveDealBreakers(none)).toEqual([]);
    const opposite = dx({ relationshipGoal: 'Casual Dating', wantsChildren: 'No', diet: 'Non-vegetarian' });
    expect(mismatchReasons(none, opposite)).toEqual([]);
    // The candidate stated all three and opted out of none, so the pair is still
    // scored down from their side — see the test above.
    const quiet = dx({ diet: 'Non-vegetarian', dealBreakers: ['-Marriage Intentions', '-Wants Children', '-Diet'] });
    expect(mismatchFactor(none, quiet)).toBe(1);
  });

  it('never returns an opt-out marker as a filter', () => {
    const marked = dx({ dealBreakers: ['-Diet', 'Smoking'], prefDiet: 'Vegetarian' });
    expect(effectiveDealBreakers(marked)).toEqual(['Smoking']);
  });

  it('an explicit tick still wins over an opt-out for a chip nobody answered', () => {
    // Ticking and unticking the same label is contradictory; the tick is the
    // one that asks for something, so it is the one that must be honoured.
    expect(effectiveDealBreakers(dx({ dealBreakers: ['Diet', '-Diet'], prefDiet: 'Vegetarian' })))
      .toEqual(['Diet']);
  });
});
