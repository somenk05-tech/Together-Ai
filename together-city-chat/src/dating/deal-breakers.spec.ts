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
  unreachableReason, type DXProfile,
} from './matching';

const dx = (p: Partial<DXProfile> = {}): DXProfile => ({ ...p });

describe('Marriage Intentions — a side of the line, not a distance along it', () => {
  const seeker = dx({ dealBreakers: ['Marriage Intentions'], relationshipGoal: 'Marriage' });
  const casual = dx({ relationshipGoal: 'Casual Dating' });

  it('removes a casual dater from a marriage-seeker who ticked it', () => {
    expect(hardFilterReason(seeker, casual, 30)).toBe('intent');
  });

  it('keeps Serious Dating, which is two steps away and the same side', () => {
    expect(hardFilterReason(seeker, dx({ relationshipGoal: 'Serious Dating' }), 30)).toBeNull();
  });

  it('removes Friendship First, which is one step further out and the other side', () => {
    expect(hardFilterReason(seeker, dx({ relationshipGoal: 'Friendship First' }), 30)).toBe('intent');
  });

  it('filters nobody when the chip is not ticked', () => {
    expect(hardFilterReason(dx({ relationshipGoal: 'Marriage' }), casual, 30)).toBeNull();
  });

  it('filters nobody when either side never said what they want', () => {
    expect(hardFilterReason(seeker, dx({}), 30)).toBeNull();
    expect(hardFilterReason(dx({ dealBreakers: ['Marriage Intentions'] }), casual, 30)).toBeNull();
  });

  it('is honoured in both directions, or in neither', () => {
    expect(unreachableReason(casual, seeker, 30, 31)).toEqual({ by: 'them', reason: 'intent' });
  });
});

describe('Distance — the limit they already stated', () => {
  const mumbai = { city: 'Mumbai', state: 'Maharashtra', country: 'India' };
  const delhi = { city: 'Delhi', state: 'Delhi', country: 'India' };
  const pune = { city: 'Pune', state: 'Maharashtra', country: 'India' };

  it('removes somebody beyond the stated kilometres', () => {
    expect(hardFilterReason(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 200 }), dx(delhi), 30)).toBe('distance');
  });

  it('keeps somebody inside them', () => {
    expect(hardFilterReason(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 200 }), dx(pune), 30)).toBeNull();
  });

  it('filters nobody when the distance could not be measured', () => {
    expect(hardFilterReason(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 5 }), dx({ city: 'Nowhere-On-Sea' }), 30)).toBeNull();
  });

  it('filters nobody when the chip is not ticked — it stays a scoring penalty', () => {
    expect(hardFilterReason(dx({ ...mumbai, prefDistanceKm: 200 }), dx(delhi), 30)).toBeNull();
  });

  it('filters nobody on a nonsense limit', () => {
    expect(hardFilterReason(dx({ ...mumbai, dealBreakers: ['Distance'], prefDistanceKm: 0 }), dx(delhi), 30)).toBeNull();
  });
});

describe('Diet and Religion — collected all along, read for the first time', () => {
  it('removes a non-vegetarian from someone who asked for vegetarian and meant it', () => {
    const jain = dx({ dealBreakers: ['Diet'], prefDiet: 'Vegetarian' });
    expect(hardFilterReason(jain, dx({ diet: 'Non-vegetarian' }), 30)).toBe('diet');
    expect(hardFilterReason(jain, dx({ diet: 'Vegetarian' }), 30)).toBeNull();
  });

  it('treats "Any" as no preference, never as a filter', () => {
    expect(hardFilterReason(dx({ dealBreakers: ['Diet'] }), dx({ diet: 'Non-vegetarian' }), 30)).toBeNull();
  });

  it('filters nobody over a diet the candidate never stated', () => {
    expect(hardFilterReason(dx({ dealBreakers: ['Diet'], prefDiet: 'Vegetarian' }), dx({}), 30)).toBeNull();
  });

  it('honours religion only when it is on the list', () => {
    const a = dx({ religion: 'Hindu' }), b = dx({ religion: 'Christian' });
    expect(hardFilterReason(a, b, 30)).toBeNull();
    expect(hardFilterReason(dx({ ...a, dealBreakers: ['Religion'] }), b, 30)).toBe('religion');
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
    expect(coverage(blank, blank, [], [])).toBeCloseTo(0.5, 2);
    expect(confidence(coverage(blank, blank, [], []))).toBeCloseTo(0.775, 3);
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

  it('is the fixed bar unless asked otherwise', () => {
    expect(curatedBar(spread)).toBe(75);
    expect(curatedBar([], 75)).toBe(75);
  });

  it('draws at the top tenth of the viewer’s own list', () => {
    process.env.DATING_BAR = 'p90';
    expect(curatedBar(spread)).toBe(80);
  });

  it('gives a short list a top tenth of itself rather than nothing', () => {
    process.env.DATING_BAR = 'p90';
    expect(curatedBar([61, 44, 38, 12])).toBe(61);
    expect(curatedBar([44])).toBe(44);
  });

  it('falls back to the fixed bar when there is no list at all', () => {
    process.env.DATING_BAR = 'p90';
    expect(curatedBar([], 75)).toBe(75);
  });

  it('honours a floor, because a top tenth of nothing is still nothing', () => {
    process.env.DATING_BAR = 'p90';
    process.env.DATING_BAR_FLOOR = '62';
    expect(curatedBar([50, 44, 30])).toBe(62);
    expect(curatedBar(spread)).toBe(80);
  });
});

describe('core questions as filters', () => {
  afterEach(() => { delete process.env.DATING_CORE_FILTERS; });
  const answered = dx({ relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian' });

  it('changes nothing while the flag is off', () => {
    expect(effectiveDealBreakers(answered)).toEqual([]);
    expect(hardFilterReason(answered, dx({ relationshipGoal: 'Casual Dating' }), 30)).toBeNull();
  });

  it('filters on the three answers once it is on', () => {
    process.env.DATING_CORE_FILTERS = 'on';
    expect(effectiveDealBreakers(answered).sort()).toEqual(['Diet', 'Marriage Intentions', 'Wants Children']);
    expect(hardFilterReason(answered, dx({ relationshipGoal: 'Casual Dating' }), 30)).toBe('intent');
    expect(hardFilterReason(answered, dx({ wantsChildren: 'No' }), 30)).toBe('children');
    expect(hardFilterReason(answered, dx({ diet: 'Non-vegetarian' }), 30)).toBe('diet');
  });

  it('never invents an answer nobody gave', () => {
    process.env.DATING_CORE_FILTERS = 'on';
    expect(effectiveDealBreakers(dx({}))).toEqual([]);
    expect(hardFilterReason(dx({}), dx({ relationshipGoal: 'Casual Dating', wantsChildren: 'No', diet: 'Non-vegetarian' }), 30)).toBeNull();
  });

  it('keeps the chips the citizen ticked themselves', () => {
    process.env.DATING_CORE_FILTERS = 'on';
    expect(effectiveDealBreakers(dx({ dealBreakers: ['Smoking'], relationshipGoal: 'Marriage' })).sort())
      .toEqual(['Marriage Intentions', 'Smoking']);
  });
});
