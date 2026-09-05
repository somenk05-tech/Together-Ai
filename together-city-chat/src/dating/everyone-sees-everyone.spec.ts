import * as fs from 'fs';
import * as path from 'path';
import {
  factorScores, hardFilterReason, mismatchFactor, mismatchReasons, overallScore,
  pairMultiplier, unreachableReason, MISMATCH_PENALTY, MISMATCH_FLOOR, type DXProfile,
} from './matching';

/**
 * ── EVERYONE SEES EVERYONE, AND A MISMATCH READS AS A LOW NUMBER ────────────
 *
 * Owner, 1 Sep. The seven deal-breaker chips stop removing people; age, height
 * and language still do. A mismatch comes off the percentage instead.
 *
 * AND THEN THREE OF THEM CAME BACK (owner, 4 Sep, the launch gate's third
 * reading). Intent, children and diet remove the person again — a side of the
 * commitment line is not negotiable by degrees — for everybody who answered
 * and did not untick the chip. Religion, distance, smoking and drinking stay
 * multipliers. The arithmetic below is unchanged and still matters: it is what
 * a pair reads if it reaches a score through any other door, and the four
 * remaining multipliers are measured the same way.
 *
 * THIS FILE MEASURES RATHER THAN ASSERTS, because the failure mode here is not
 * "the filter is still on" — that is easy to see. It is shipping half the
 * change: filters off, scoring untouched, and a marriage-seeker shown somebody
 * looking for a fortnight at 87% with a green tick beside it. The 1M run put
 * that number on the record, and the first test below is the same pair.
 */
const dx = (p: Partial<DXProfile> = {}): DXProfile => ({ ...p });
const INTERESTS = ['Films', 'Travel', 'Food', 'Music', 'Books'];
const same = {
  city: 'Mumbai', state: 'Maharashtra', country: 'India',
  values: ['Family', 'Honesty', 'Growth'], personalityTraits: ['Calm', 'Curious'],
  smoking: 'Never', drinking: 'Never',
};
/** The score a citizen is actually shown for this pair. */
const shownScore = (a: DXProfile, b: DXProfile, astrology = 92) =>
  overallScore(factorScores(astrology, INTERESTS, INTERESTS, a, b), pairMultiplier(a, b, INTERESTS, INTERESTS));

describe('the pair the 1M run said was the problem', () => {
  // A wants marriage and children and asked for a vegetarian; B wants casual,
  // no children, and eats meat. Everything else about them agrees.
  const A = dx({ ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian', diet: 'Vegetarian' });
  const B = dx({ ...same, relationshipGoal: 'Casual Dating', wantsChildren: 'No', diet: 'Non-vegetarian' });

  it('is removed again — intent is the first of the three core filters to say so (4 Sep)', () => {
    expect(hardFilterReason(A, B, 30)).toBe('intent');
    expect(hardFilterReason(B, A, 31)).toBe('intent');
    expect(unreachableReason(A, B, 31, 30)).toEqual({ by: 'you', reason: 'intent' });
  });

  it('a pair wrong on religion alone is still visible, at a lower number', () => {
    const C = dx({ ...same, relationshipGoal: 'Marriage', dealBreakers: ['Religion'], religion: 'Hindu' });
    const D = dx({ ...same, relationshipGoal: 'Marriage', religion: 'Christian' });
    expect(hardFilterReason(C, D, 30)).toBeNull();
    expect(mismatchReasons(C, D)).toEqual(['religion']);
    expect(mismatchFactor(C, D)).toBe(MISMATCH_PENALTY.religion);
  });

  it('names all three mismatches', () => {
    const both = new Set([...mismatchReasons(A, B), ...mismatchReasons(B, A)]);
    expect([...both].sort()).toEqual(['children', 'diet', 'intent']);
  });

  /**
   * THE NUMBER, WHICH IS THE WHOLE POINT. Unscaled this pair is 89%: astrology
   * carries 0.90 of the weight table, `relationshipGoals` carries 0.04, and
   * children and diet are scored NOWHERE — so a total intent opposition moves
   * the shown percentage by 3.4 points and the other two by nothing at all.
   * A filter was the only thing standing between a citizen and that number.
   */
  it('reads low instead — well under half', () => {
    const unscaled = overallScore(factorScores(92, INTERESTS, INTERESTS, A, B));
    expect(unscaled).toBeGreaterThan(85);          // the old, unusable number
    expect(shownScore(A, B)).toBeLessThan(30);     // what a citizen sees now
  });
});

describe('a pair with nothing wrong pays nothing', () => {
  const A = dx({ ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian', diet: 'Vegetarian' });
  const B = dx({ ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', diet: 'Vegetarian' });

  /* A multiplier that is not exactly 1.0 for a clean pair is a silent rescale
     of every score in the product — which is the argument for a multiplier over
     a re-weighting in the first place. */
  it('is scaled by exactly 1.0', () => {
    expect(mismatchFactor(A, B)).toBe(1);
    expect(mismatchReasons(A, B)).toEqual([]);
  });

  it('scores the same as it did before any of this', () => {
    const f = factorScores(92, INTERESTS, INTERESTS, A, B);
    expect(shownScore(A, B)).toBe(overallScore(f, pairMultiplier(A, B, INTERESTS, INTERESTS)));
    expect(shownScore(A, B)).toBeGreaterThan(85);
  });
});

describe('how far each one pulls', () => {
  const base = { ...same, diet: 'Vegetarian' };
  const marry = dx({ ...base, relationshipGoal: 'Marriage' });
  const casual = dx({ ...base, relationshipGoal: 'Casual Dating' });

  it('puts an intent mismatch alone in the low forties', () => {
    const n = shownScore(marry, casual);
    expect(n).toBeGreaterThan(30);
    expect(n).toBeLessThan(50);
  });

  it('compounds, because two mismatches are further away than one', () => {
    const one = shownScore(marry, casual);
    const two = shownScore(dx({ ...marry, wantsChildren: 'Yes' }), dx({ ...casual, wantsChildren: 'No' }));
    expect(two).toBeLessThan(one);
  });

  it('never reaches zero — a 0% tells a citizen nothing they can act on', () => {
    const worst = Object.keys(MISMATCH_PENALTY).reduce((f, k) => f * MISMATCH_PENALTY[k], 1);
    expect(worst).toBeLessThan(MISMATCH_FLOOR);
    const A = dx({
      ...same, relationshipGoal: 'Marriage', wantsChildren: 'Yes', prefDiet: 'Vegetarian',
      religion: 'Hindu', dealBreakers: ['Smoking', 'Drinking', 'Religion'],
    });
    const B = dx({
      ...same, relationshipGoal: 'Friendship First', wantsChildren: 'No', diet: 'Non-vegetarian',
      religion: 'Christian', smoking: 'Regularly', drinking: 'Regularly',
    });
    expect(mismatchFactor(A, B)).toBe(MISMATCH_FLOOR);
    expect(shownScore(A, B)).toBeGreaterThan(0);
  });

  it('can be switched off whole, like every other decision in this file', () => {
    process.env.DATING_MISMATCH_PENALTY = 'off';
    try {
      expect(mismatchFactor(marry, casual)).toBe(1);
    } finally { delete process.env.DATING_MISMATCH_PENALTY; }
  });
});

/**
 * THE PIN. Five places in `dating.service.ts` compute a score, and a call site
 * that passes bare `confidenceFor` gets the old 87% back for that one screen
 * with nothing failing anywhere — the card disagreeing with the list, silently.
 * That is the shape this repo has paid for twice already.
 */
describe('every score is scaled the same way', () => {
  const service = fs.readFileSync(path.join(__dirname, 'dating.service.ts'), 'utf8');

  it('passes pairMultiplier at every overallScore call site', () => {
    const calls = [...service.matchAll(/overallScore\(([^;]*?)\)[,;]/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(5);
    const unscaled = calls.filter((c) => !/pairMultiplier|\bconf\b/.test(c));
    expect(unscaled).toEqual([]);
  });

  it('leaves no bare confidenceFor scaling a score', () => {
    expect(service).not.toMatch(/overallScore\([^;]*confidenceFor/);
  });
});
