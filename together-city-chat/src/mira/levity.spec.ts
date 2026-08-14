import { levity, spanAllowsLevity, type LevityInput } from './levity';

const base = (over: Partial<LevityInput> = {}): LevityInput => ({
  lane: 'ACT',
  text: 'order my usual groceries',
  weeksKnown: 52,
  hour: 14,
  dial: 1,
  ...over,
});

/**
 * The governor exists for one turn in ten thousand.
 *
 * Everything else it does — the dry default, the earned humour, the 3am cap —
 * is taste. The reason it is code rather than a prompt is the case in
 * "distress" below: a joke arriving moments after somebody says where their
 * father is. That failure is unrecoverable with that citizen, and a model
 * asked to judge it will one day judge wrong.
 */
describe('the hard zeroes', () => {
  it('the listen lane is always L0', () => {
    expect(levity(base({ lane: 'LISTEN', text: 'lol i feel terrible' })).level).toBe(0);
  });

  it('a distress signal zeroes the turn it appears in', () => {
    const v = levity(base({ text: "it's for my dad, he's in hospital" }));
    expect(v.level).toBe(0);
    expect(v.distress).toBe(true);
  });

  it('and the lock holds for the rest of the session', () => {
    // The scenario that matters. Two turns earlier she was calling a 6am
    // flight a punishment; the citizen then mentions the hospital; the next
    // ordinary request must not be funny. The lock is the caller's to persist,
    // which is why `distress` is returned rather than kept here.
    const v = levity(base({ text: 'order me pizza', distressLocked: true }));
    expect(v.level).toBe(0);
  });

  it('low mood zeroes even without a distress word', () => {
    expect(levity(base({ text: 'everything feels stuck' })).level).toBe(0);
  });

  it('never funny about her own failure', () => {
    expect(levity(base({ lastStepFailed: true })).level).toBe(0);
  });

  it('medical is silent', () => {
    expect(levity(base({ domain: 'medical' })).level).toBe(0);
  });

  it('R4 is silent', () => {
    expect(levity(base({ risk: 'R4' })).level).toBe(0);
  });
});

describe('caps beat lifts, always', () => {
  it('a playful citizen cannot lift a distressed turn', () => {
    // The adversarial case: they made a joke, then said something awful. The
    // lift is real and the cap must win anyway.
    const v = levity(base({ text: "haha — anyway my dad's in hospital", dial: 2 }));
    expect(v.level).toBe(0);
  });

  it('"roast me" cannot override the listen lane', () => {
    expect(levity(base({ lane: 'LISTEN', text: 'roast me' })).level).toBe(0);
  });

  it('the more dial cannot override medical', () => {
    expect(levity(base({ domain: 'medical', dial: 2, text: 'lol' })).level).toBe(0);
  });
});

describe('playful from the first session', () => {
  /**
   * REVERSED BY THE OWNER, 14 Aug. This block previously asserted the opposite —
   * L1 for a fortnight, on the reasoning that a stranger being familiar is a
   * stranger being presumptuous. The owner's position is that her humour IS the
   * product, so a two-week dry version means most people never meet her.
   *
   * The tests are kept rather than deleted, inverted rather than removed, so
   * the decision is legible instead of just absent.
   */
  it('week 1 is already warm', () => {
    expect(levity(base({ weeksKnown: 0, text: 'order me pizza' })).level).toBeGreaterThanOrEqual(2);
  });

  it('and knowing her longer does not change it', () => {
    expect(levity(base({ weeksKnown: 0 })).level).toBe(levity(base({ weeksKnown: 200 })).level);
  });
});

describe('the dampers', () => {
  it('3am takes the edge off without going flat', () => {
    // A taste cap, relaxed under playful-by-default: still warm, just not loud
    // at three in the morning.
    const v = levity(base({ hour: 3, text: 'haha book me a flight' }));
    expect(v.level).toBeLessThanOrEqual(2);
    expect(v.level).toBeGreaterThan(0);
  });

  it('their "less" setting caps at L1', () => {
    expect(levity(base({ dial: 0, text: 'haha order me pizza' })).level).toBeLessThanOrEqual(1);
  });

  it('R3 caps the turn at L2 without silencing it', () => {
    const v = levity(base({ risk: 'R3', text: 'haha order me pizza' }));
    expect(v.level).toBeLessThanOrEqual(2);
    expect(v.level).toBeGreaterThan(0);
  });
});

describe('lifts', () => {
  it('mirrors their register rather than leading', () => {
    expect(levity(base({ text: 'lol order me pizza' })).level).toBeGreaterThan(
      levity(base({ text: 'order me pizza' })).level,
    );
  });

  it('reads the last few turns, not only this one', () => {
    expect(levity(base({ text: 'order me pizza', recent: ['haha', 'ok'] })).level).toBeGreaterThan(2 - 1);
  });

  it('an explicit invitation goes loud', () => {
    expect(levity(base({ text: 'roast me', dial: 2 })).level).toBe(4);
  });
});

describe('the default is playful', () => {
  it('an ordinary action turn is L3', () => {
    expect(levity(base()).level).toBe(3);
  });

  it('an ordinary retrieval is L2', () => {
    expect(levity(base({ lane: 'RETRIEVE', text: "where's my insurance document" })).level).toBe(2);
  });

  it('but the hard zeroes are untouched by any of that', () => {
    // The point of the split: taste moved, safety did not. If a future dial
    // ever reaches these, this is the test that says so.
    expect(levity(base({ lane: 'LISTEN' })).level).toBe(0);
    expect(levity(base({ text: "my dad's in hospital" })).level).toBe(0);
    expect(levity(base({ domain: 'medical' })).level).toBe(0);
    expect(levity(base({ risk: 'R4' })).level).toBe(0);
    expect(levity(base({ lastStepFailed: true })).level).toBe(0);
  });
});

describe('the trace explains itself', () => {
  it('names the cap that decided the level', () => {
    const v = levity(base({ domain: 'medical' }));
    expect(v.trace.join(' ')).toMatch(/domain medical/);
    expect(v.trace.join(' ')).toMatch(/result L0/);
  });
});

describe('spanAllowsLevity', () => {
  it('never inside a confirmation clause, at any level', () => {
    // The sentence carrying the amount is plain even when the turn around it
    // is playing. Every mishearing that costs money starts here.
    for (const l of [0, 1, 2, 3, 4] as const) {
      expect(spanAllowsLevity(l, 'confirm')).toBe(false);
    }
  });

  it('allows a lede at L2 and above only', () => {
    expect(spanAllowsLevity(1, 'lede')).toBe(false);
    expect(spanAllowsLevity(2, 'lede')).toBe(true);
  });
});
