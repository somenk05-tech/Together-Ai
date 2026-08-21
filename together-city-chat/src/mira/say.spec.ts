import { say, sayWithTrace, nothing, type Colour } from './say';
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

/**
 * THE DROP IS COUNTED NOW.
 *
 * It used to happen on the longest answers, with no log and no ledger field —
 * so "the ratio being lost to arithmetic on the turn that mattered" was a thing
 * levity.ts could name and nothing could measure.
 */
describe('and says so when the arithmetic took the aside', () => {
  const long = 'A steady day, mostly. Keep the afternoon light and do not agree to anything before eleven, because the morning is where the noise is and you will say yes to it.';

  it('reports the drop', () => {
    const out = sayWithTrace(long, c(3), ['And I would know.']);
    expect(out.text).toBe(long);
    expect(out.asideDropped).toBe(true);
  });

  it('does not report one when the governor refused — that is the system working', () => {
    expect(sayWithTrace('Okay.', c(0), ASIDES).asideDropped).toBe(false);
    expect(sayWithTrace('Book it?', c(4), ASIDES, 'confirm').asideDropped).toBe(false);
    expect(sayWithTrace('₹0.', c(1), ASIDES).asideDropped).toBe(false);
  });

  it('does not report one when there was no aside to lose', () => {
    expect(sayWithTrace(long, c(3), []).asideDropped).toBe(false);
  });

  it('says the same sentence say() does', () => {
    expect(sayWithTrace('₹0.', c(3), ASIDES).text).toBe(say('₹0.', c(3), ASIDES));
  });
});

describe('the question is the last thing she says', () => {
  /**
   * "Astrology. Want me to take you? It has been there the whole time." ended
   * on the wrong sentence — she talked over the offer the citizen has to answer.
   */
  it('puts the aside before a trailing question', () => {
    const out = say('Astrology. Want me to take you?', c(3), ['It has been there the whole time.']);
    expect(out).toBe('Astrology. It has been there the whole time. Want me to take you?');
  });

  it('still appends when the answer does not end in one', () => {
    expect(say('₹0.', c(3), ['Not judging. Reporting.'])).toBe('₹0. Not judging. Reporting.');
  });

  it('an empty answer is not a leading space', () => {
    expect(say('', c(3), ['Bold of you to have free time.'])).toBe('Bold of you to have free time.');
  });
});

describe('two answers in one session are not coloured identically', () => {
  /** The index was the SESSION seed, so every turn drew the same aside and the
   *  same line arrived twice in four turns — a catchphrase, not a character. */
  it('a different answer in the same session can draw a different aside', () => {
    const answers = [
      'Astrology. Want me to take you?',
      'Budgets. Want me to take you?',
      '₹0.',
      'Nothing in your watchlist yet.',
    ];
    const picked = new Set(answers.map((a) => ASIDES.find((x) => say(a, c(3, { seed: 1 }), ASIDES).includes(x))));
    expect(picked.size).toBeGreaterThan(1);
  });

  it('and the same answer in the same session still draws the same one', () => {
    expect(say('₹0.', c(3, { seed: 1 }), ASIDES)).toBe(say('₹0.', c(3, { seed: 1 }), ASIDES));
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
