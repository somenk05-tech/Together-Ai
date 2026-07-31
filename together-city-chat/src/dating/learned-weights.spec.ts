import {
  LEARNING_WINDOW, MIN_DECISIONS, MIN_EACH, WEIGHT_FLOOR,
  learnWeights, overallScoreWith, type Decision,
} from './learned-weights';
import { WEIGHTS, type FactorBreakdown } from './matching';

const F = (o: Partial<FactorBreakdown> = {}): FactorBreakdown => ({
  astrology: 70, personality: 60, relationshipGoals: 60,
  values: 60, lifestyle: 60, interests: 60, location: 60, ...o,
});
const mk = (n: number, liked: boolean, o: Partial<FactorBreakdown> = {}): Decision[] =>
  Array.from({ length: n }, () => ({ liked, factors: F(o) }));
const total = (w: Record<string, number>) => Object.values(w).reduce((a, b) => a + b, 0);

/** 20 decisions with a 50-point lean on values — the canonical learned case. */
const leaning = () => learnWeights([...mk(10, true, { values: 90 }), ...mk(10, false, { values: 40 })]);

describe('learned weights — what the city learns from who you choose (H2)', () => {
  describe('the evidence bar', () => {
    it('does nothing below MIN_DECISIONS, and returns the standard weights EXACTLY', () => {
      const r = learnWeights([...mk(4, true), ...mk(4, false)]);
      expect(r.learned).toBe(false);
      expect(r.weights).toEqual(WEIGHTS);
    });

    it('says how many more decisions are needed, and counts down', () => {
      expect(learnWeights([...mk(7, true), ...mk(7, false)]).headline).toContain('1 more decision');
      expect(learnWeights([...mk(6, true), ...mk(6, false)]).headline).toContain('3 more decisions');
    });

    it('refuses to learn from likes alone', () => {
      // A mean over zero passes is not a mean, and "everyone I saw, I liked"
      // says nothing about what separates people.
      const r = learnWeights(mk(30, true, { values: 95 }));
      expect(r.learned).toBe(false);
      expect(r.weights).toEqual(WEIGHTS);
      expect(r.headline).toContain('both');
    });

    it('refuses to learn from passes alone', () => {
      const r = learnWeights(mk(30, false, { values: 20 }));
      expect(r.learned).toBe(false);
      expect(r.headline).toContain('both');
    });

    it('needs MIN_EACH of both even when the total is plenty', () => {
      expect(learnWeights([...mk(20, true, { values: 90 }), ...mk(MIN_EACH - 1, false)]).learned).toBe(false);
      expect(learnWeights([...mk(MIN_EACH, true, { values: 90 }), ...mk(MIN_DECISIONS, false)]).learned).toBe(true);
    });

    it('refuses when nothing separates the two groups', () => {
      // Enough decisions, no signal in them. The dangerous case: this is where
      // an eager version invents a preference out of noise.
      const r = learnWeights([...mk(10, true), ...mk(10, false)]);
      expect(r.learned).toBe(false);
      expect(r.headline).toContain('leans clearly');
    });
  });

  describe('what it does once it has enough', () => {
    it('gives more weight to the factor that separated your choices', () => {
      const r = leaning();
      expect(r.learned).toBe(true);
      expect(r.weights.values).toBeGreaterThan(WEIGHTS.values);
    });

    it('gives less to a factor that ran higher on the ones you passed', () => {
      const r = learnWeights([...mk(10, true, { lifestyle: 30 }), ...mk(10, false, { lifestyle: 90 })]);
      expect(r.weights.lifestyle).toBeLessThan(WEIGHTS.lifestyle);
    });

    it('keeps astrology pinned at exactly 0.50, whatever the evidence says', () => {
      // A product decision from an earlier round. This module does not reopen it,
      // and no amount of swiping can.
      for (const r of [leaning(), learnWeights([...mk(20, true, { values: 100 }), ...mk(20, false, { values: 0 })])]) {
        expect(r.weights.astrology).toBeCloseTo(0.5, 10);
      }
    });

    it('always sums to 1', () => {
      expect(total(leaning().weights)).toBeCloseTo(1, 10);
    });

    it('leaves the other six sharing exactly the half astrology does not take', () => {
      const w = leaning().weights;
      const six = Object.entries(w).filter(([k]) => k !== 'astrology').reduce((a, [, v]) => a + v, 0);
      expect(six).toBeCloseTo(0.5, 10);
    });

    it('NEVER switches a factor off, even when every one of them leans away', () => {
      const r = learnWeights([
        ...mk(10, true, { personality: 0, relationshipGoals: 0, values: 0, lifestyle: 0, interests: 0, location: 0 }),
        ...mk(10, false, { personality: 100, relationshipGoals: 100, values: 100, lifestyle: 100, interests: 100, location: 100 }),
      ]);
      for (const w of Object.values(r.weights)) expect(w).toBeGreaterThanOrEqual(WEIGHT_FLOOR);
      expect(total(r.weights)).toBeCloseTo(1, 10);
    });

    it('cannot collapse the ranking onto one factor', () => {
      const r = learnWeights([...mk(20, true, { values: 100 }), ...mk(20, false, { values: 0 })]);
      // MAX_SHIFT caps the move, so one strong run cannot take the whole half.
      expect(r.weights.values).toBeLessThan(0.5);
    });

    it('is deterministic and order-independent', () => {
      const a = [...mk(10, true, { values: 90 }), ...mk(10, false, { values: 40 })];
      const b = [...a].reverse();
      expect(learnWeights(b).weights).toEqual(learnWeights(a).weights);
    });
  });

  describe('what it says for itself', () => {
    it('names the factor in words a person would use, not a key', () => {
      const r = leaning();
      expect(r.headline).toContain('shared values');
      expect(r.headline).not.toContain('relationshipGoals');
      expect(r.notes[0].key).toBe('values');
    });

    it('says how much evidence it is standing on', () => {
      expect(leaning().headline).toContain('20 decisions');
    });

    it('reports the biggest mover first', () => {
      const r = learnWeights([
        ...mk(10, true, { values: 90, interests: 75 }),
        ...mk(10, false, { values: 40, interests: 60 }),
      ]);
      expect(r.notes[0].key).toBe('values');
      expect(Math.abs(r.notes[0].lean)).toBeGreaterThanOrEqual(Math.abs(r.notes[1].lean));
    });

    it('mentions only the factors that actually moved', () => {
      const r = leaning();
      expect(r.notes.map((x) => x.key)).toEqual(['values']);
    });

    it('has a headline even when it learned nothing — silence is not an option', () => {
      for (const r of [learnWeights([]), learnWeights(mk(30, true)), learnWeights([...mk(10, true), ...mk(10, false)])]) {
        expect(r.headline.length).toBeGreaterThan(20);
      }
    });
  });

  describe('scoring with them', () => {
    it('matches the plain weighting when the weights are the standard ones', () => {
      expect(overallScoreWith(F(), WEIGHTS)).toBe(Math.round(70 * 0.5 + 60 * 0.5));
    });

    it('ranks a values-heavy pair higher for somebody who leans that way', () => {
      const w = leaning().weights;
      expect(overallScoreWith(F({ values: 100 }), w)).toBeGreaterThan(overallScoreWith(F({ values: 100 }), WEIGHTS));
    });

    it('is bounded — no weighting can push a score outside 0–100', () => {
      const w = leaning().weights;
      const allZero = { astrology: 0, personality: 0, relationshipGoals: 0, values: 0, lifestyle: 0, interests: 0, location: 0 };
      const allFull = { astrology: 100, personality: 100, relationshipGoals: 100, values: 100, lifestyle: 100, interests: 100, location: 100 };
      expect(overallScoreWith(allZero, w)).toBe(0);
      expect(overallScoreWith(allFull, w)).toBe(100);
    });
  });

  it('bounds how far back it looks', () => {
    expect(LEARNING_WINDOW).toBeGreaterThan(MIN_DECISIONS);
    expect(LEARNING_WINDOW).toBeLessThanOrEqual(500);
  });
});
