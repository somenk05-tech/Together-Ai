import { resolveChoice, type Choice } from './choose';

const TWO: Choice[] = [
  { label: 'Astrology', path: '/astrology' },
  { label: 'Astrology Log', path: '/astrology/log' },
];
const HUBS: Choice[] = [
  { label: 'Budgets', path: '/financial/budgets' },
  { label: 'Spending', path: '/financial/spending' },
];

describe('she reads the answer to her own question', () => {
  it('takes the label, exactly', () => {
    expect(resolveChoice('Astrology', TWO)).toEqual(TWO[0]);
    expect(resolveChoice('astrology', TWO)).toEqual(TWO[0]);
    expect(resolveChoice('Astrology Log', TWO)).toEqual(TWO[1]);
  });

  it('takes the label out of a short sentence', () => {
    expect(resolveChoice('the astrology one', TWO)).toEqual(TWO[0]);
    expect(resolveChoice('budgets please', HUBS)).toEqual(HUBS[0]);
    expect(resolveChoice('take me to spending', HUBS)).toEqual(HUBS[1]);
  });

  it('takes a word only one option owns', () => {
    expect(resolveChoice('log', TWO)).toEqual(TWO[1]);
  });

  it('takes a position', () => {
    expect(resolveChoice('the second one', HUBS)).toEqual(HUBS[1]);
    expect(resolveChoice('first', HUBS)).toEqual(HUBS[0]);
    expect(resolveChoice('2', HUBS)).toEqual(HUBS[1]);
  });
});

describe('and refuses to guess, which is the harder half', () => {
  /**
   * A PARTIAL WORD IS NOT A CHOICE.
   *
   * "pro" for "Profile" looks generous and is a coin toss. A wrong pick here
   * navigates somebody away from what they were doing AND teaches them that
   * answering her is a gamble — which costs more than the extra turn.
   */
  it('does not accept a prefix', () => {
    expect(resolveChoice('astro', TWO)).toBeUndefined();
    expect(resolveChoice('bud', HUBS)).toBeUndefined();
  });

  /** Somebody who typed a paragraph has moved on. Treating it as a pick is how
   *  you navigate away mid-thought. */
  it('treats a long sentence as a new request, not an answer', () => {
    const long = 'actually forget that, can you tell me what I spent on food last month instead';
    expect(resolveChoice(long, HUBS)).toBeUndefined();
  });

  it('gives up rather than picking one of two words it cannot separate', () => {
    const both: Choice[] = [
      { label: 'Morning Routine', path: '/beauty/morning' },
      { label: 'Evening Routine', path: '/beauty/evening' },
    ];
    // "routine" belongs to both, so it is not an answer.
    expect(resolveChoice('routine', both)).toBeUndefined();
    expect(resolveChoice('morning', both)).toEqual(both[0]);
  });

  it('answers nothing when there was nothing to answer', () => {
    expect(resolveChoice('astrology', [])).toBeUndefined();
    expect(resolveChoice('', TWO)).toBeUndefined();
    expect(resolveChoice('   ', TWO)).toBeUndefined();
  });

  it('does not read an unrelated word as a position', () => {
    // "neither" moved out of this test on 21 Aug: it is not an unreadable
    // answer, it is a refusal, and it now comes back as one. See below.
    expect(resolveChoice('what', HUBS)).toBeUndefined();
    expect(resolveChoice('maybe', HUBS)).toBeUndefined();
  });
});

describe('"one" is an answer, and it is the commonest one', () => {
  /** FILLER strips the word `one`, so a bare "one" arrived at the position
   *  test as an empty string and matched nothing. It is the most natural
   *  spoken answer there is to a two-way question. */
  it('takes a bare one, two, three', () => {
    expect(resolveChoice('one', HUBS)).toEqual(HUBS[0]);
    expect(resolveChoice('two', HUBS)).toEqual(HUBS[1]);
  });

  it('still takes the phrasings it always did', () => {
    expect(resolveChoice('the first one', HUBS)).toEqual(HUBS[0]);
    expect(resolveChoice('number 2', HUBS)).toEqual(HUBS[1]);
  });

  it('but a number inside a sentence is a quantity, not a position', () => {
    // "2 tickets" picked the second option and navigated. A number on its own
    // is a choice; a number in a sentence is an amount of something.
    expect(resolveChoice('2 tickets', HUBS)).toBeUndefined();
    expect(resolveChoice('3 people', HUBS)).toBeUndefined();
  });
});

describe('"no" is an answer too — and it used to navigate', () => {
  /**
   * All of these fell through as `undefined`, which the service reads as "not
   * an answer" and re-routes as a fresh request — so declining her question
   * took you somewhere. Refusing is a third outcome, not a missing one.
   */
  it('reads a refusal of both options', () => {
    for (const said of ['no', 'nope', 'neither', 'none', 'no thanks', 'cancel', 'stop', 'forget it']) {
      expect(resolveChoice(said, HUBS)).toBe('none');
    }
  });

  it('reads a request for both of them', () => {
    for (const said of ['both', 'either', 'both of them']) {
      expect(resolveChoice(said, HUBS)).toBe('both');
    }
  });

  it('a refusal is never mistaken for a choice', () => {
    const out = resolveChoice('neither', HUBS);
    expect(typeof out).toBe('string');
    expect(out).not.toEqual(HUBS[0]);
  });

  it('and "no one" is heard as no, not as one', () => {
    expect(resolveChoice('no one', HUBS)).toBe('none');
  });

  it('a label still wins over a word that looks like a refusal', () => {
    const odd: Choice[] = [{ label: 'None of the above', path: '/a' }, { label: 'Spending', path: '/b' }];
    expect(resolveChoice('none of the above', odd)).toEqual(odd[0]);
  });

  it('does not fire on a refusal word buried in a real answer', () => {
    expect(resolveChoice('no idea, the second one', HUBS)).toEqual(HUBS[1]);
  });
});
