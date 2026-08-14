import { say, nothing, type Colour } from './say';
import { ALL_MOODS } from './mood';
import type { LevityLevel } from './levity';

const c = (level: LevityLevel, over: Partial<Colour> = {}): Colour =>
  ({ mood: 'wry', level, seed: 1, ...over });

const ASIDES = ['Which is a number, technically.', 'Not judging. Reporting.'];

describe('the aside is appended, never substituted', () => {
  it('keeps the fact first, always', () => {
    const out = say('₹48,200.', c(3), ASIDES);
    expect(out.startsWith('₹48,200.')).toBe(true);
  });

  it('says the bare fact when there is nothing to add', () => {
    expect(say('₹48,200.', c(4), [])).toBe('₹48,200.');
  });
});

/**
 * THE PROPERTY THIS FILE EXISTS FOR.
 *
 * Before it, `levity()` computed a level and the executor returned a bare
 * sentence — so every safety cap in the governor was guarding a personality that
 * was never applied. These are the tests that make the caps mean something.
 */
describe('the governor still wins', () => {
  it('says nothing extra at L0, under every mood', () => {
    for (const mood of ALL_MOODS) {
      expect(say('Okay.', c(0, { mood }), ASIDES)).toBe('Okay.');
    }
  });

  it('says nothing extra at L1 — dry is not the same as playful', () => {
    expect(say('₹48,200.', c(1), ASIDES)).toBe('₹48,200.');
  });

  it('never jokes inside a confirmation clause, at any level', () => {
    for (const level of [0, 1, 2, 3, 4] as LevityLevel[]) {
      expect(say('Book it?', c(level), ASIDES, 'confirm')).toBe('Book it?');
    }
  });

  it('does reach for one once she is allowed to', () => {
    const out = say('₹0.', c(3), ASIDES);
    expect(out.length).toBeGreaterThan('₹0.'.length);
  });
});

describe('and it is reproducible', () => {
  /** A random aside cannot be reproduced from a support ticket, and gives her
   *  whiplash inside one conversation. Same argument mood.ts makes. */
  it('the same seed picks the same aside', () => {
    const a = say('₹0.', c(3, { seed: 7 }), ASIDES);
    const b = say('₹0.', c(3, { seed: 7 }), ASIDES);
    expect(a).toBe(b);
  });

  it('a different seed can pick a different one', () => {
    const picks = new Set([0, 1, 2, 3].map((seed) => say('₹0.', c(3, { seed }), ASIDES)));
    expect(picks.size).toBeGreaterThan(1);
  });

  it('survives a negative seed rather than indexing off the end', () => {
    expect(() => say('₹0.', c(3, { seed: -9 }), ASIDES)).not.toThrow();
    expect(say('₹0.', c(3, { seed: -9 }), ASIDES).startsWith('₹0.')).toBe(true);
  });
});

describe('she does not write paragraphs', () => {
  it('drops the aside rather than doubling the length of a long answer', () => {
    const long = 'A steady day, mostly. Keep the afternoon light and do not agree to anything before eleven, because the morning is where the noise is and you will say yes to it.';
    expect(say(long, c(3), ['And I would know.'])).toBe(long);
  });
});

describe('an empty answer is said, not filled', () => {
  it('names the thing that is empty', () => {
    expect(nothing('your watchlist', c(0))).toBe('Nothing in your watchlist yet.');
  });

  it('is still governed', () => {
    expect(nothing('your drive', c(0), ['Bold of you to have free time.']))
      .toBe('Nothing in your drive yet.');
  });
});
