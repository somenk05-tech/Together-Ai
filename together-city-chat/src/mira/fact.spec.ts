import { keepable, blockedBecause, knownBlock, EXTRACT_SYSTEM } from './fact';

const f = (subject: string, value: string, confidence = 'known') => ({ subject, value, confidence });

describe('what she is allowed to keep', () => {
  it('keeps an ordinary durable preference', () => {
    expect(keepable([f('coffee', 'drinks it black, twice a day')])).toEqual([
      { subject: 'coffee', value: 'drinks it black, twice a day', confidence: 'known' },
    ]);
  });

  it('defaults an unknown confidence to the weakest one', () => {
    expect(keepable([f('coffee', 'black', 'certain')])[0].confidence).toBe('possible');
  });

  /**
   * ── THE CATEGORIES THAT NEVER LAND ────────────────────────────────────
   *
   * The model is INSTRUCTED to withhold these and its output is FILTERED for
   * them anyway. An instruction is a hope; a filter is a rule. Both, because
   * this writes durable inferred records about a person from things they said
   * in passing, and that earns a different standard from a form they filled in.
   */
  const REFUSED: Array<[string, string, string]> = [
    ['medication', 'takes metformin every morning', 'health'],
    ['sleep', 'sleeping badly since the diagnosis', 'health'],
    ['thursdays', 'sees a therapist', 'mental health'],
    ['mornings', 'anxiety is worse before work', 'mental health'],
    ['weekends', 'goes to temple with her mother', 'religion or caste'],
    ['politics', 'voted for the same party twice', 'political affiliation'],
    ['travel', 'waiting on a visa', 'immigration status'],
    ['banking', 'account number ends 4471', 'identifiers'],
    ['partner', 'they are gay', 'sexual orientation or activity'],
    ['court case', 'charged with something last year', 'criminal history'],
    ['right now', 'i am at the office on MG Road', 'real-time location'],
  ];

  for (const [subject, value, why] of REFUSED) {
    it(`refuses ${JSON.stringify(value)} — ${why}`, () => {
      expect(blockedBecause({ subject, value, confidence: 'known' })).toBe(why);
      expect(keepable([f(subject, value)])).toEqual([]);
    });
  }

  it('a dose has a number in front of it, and MG Road is a place', () => {
    // `mg\b` alone read "MG Road" as a dosage and refused a location sentence
    // as a health one — the safe direction, for the wrong reason.
    expect(blockedBecause({ subject: 'office', value: 'on MG Road', confidence: 'known' })).toBeNull();
    expect(blockedBecause({ subject: 'evening', value: 'takes 500 mg', confidence: 'known' })).toBe('health');
  });

  it('catches the category in the SUBJECT as well as the value', () => {
    // "sleep" is fine and "sleep medication" is not, and the give-away can be
    // in either half.
    expect(blockedBecause({ subject: 'sleep', value: 'eight hours', confidence: 'known' })).toBeNull();
    expect(blockedBecause({ subject: 'sleep medication', value: 'at ten', confidence: 'known' })).not.toBeNull();
  });

  it('the prompt names the same categories the filter enforces', () => {
    for (const word of ['health', 'medication', 'therapy', 'religion', 'immigration', 'criminal']) {
      expect(EXTRACT_SYSTEM.toLowerCase()).toContain(word);
    }
  });
});

describe('what she does with malformed output', () => {
  it('a cast is a promise nobody checked, so nothing is trusted', () => {
    expect(keepable(undefined)).toEqual([]);
    expect(keepable('facts')).toEqual([]);
    expect(keepable([null, 3, 'x', {}, { subject: 'a' }])).toEqual([]);
  });

  it('drops an empty, an enormous and a paragraph-shaped value', () => {
    expect(keepable([f('', 'black')])).toEqual([]);
    expect(keepable([f('coffee', 'x'.repeat(300))])).toEqual([]);
    expect(keepable([f('coffee', 'a b c d e f g h i j k l m n o p')])).toEqual([]);
  });

  it('one subject once, and no more than three from a turn', () => {
    expect(keepable([f('coffee', 'black'), f('Coffee', 'with milk')])).toHaveLength(1);
    expect(keepable([f('a1', 'xx'), f('a2', 'xx'), f('a3', 'xx'), f('a4', 'xx')])).toHaveLength(3);
  });
});

describe('the block she is given', () => {
  it('is nothing at all on the first day', () => {
    expect(knownBlock([])).toBeNull();
  });

  it('marks a guess as a guess, and says not to assert it back', () => {
    const b = knownBlock([
      { subject: 'coffee', value: 'black', confidence: 'known' },
      { subject: 'running', value: 'mornings', confidence: 'likely' },
    ]) ?? '';
    expect(b).toContain('coffee: black');
    // The certain one carries no qualifier; the inferred one does.
    expect(b).toContain('running: mornings (likely)');
    expect(b).not.toContain('coffee: black (');
    expect(b).toMatch(/never assert it back to them as fact/i);
  });
});
