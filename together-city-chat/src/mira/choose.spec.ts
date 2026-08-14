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
    expect(resolveChoice('Astrology', TWO)?.path).toBe('/astrology');
    expect(resolveChoice('astrology', TWO)?.path).toBe('/astrology');
    expect(resolveChoice('Astrology Log', TWO)?.path).toBe('/astrology/log');
  });

  it('takes the label out of a short sentence', () => {
    expect(resolveChoice('the astrology one', TWO)?.path).toBe('/astrology');
    expect(resolveChoice('budgets please', HUBS)?.path).toBe('/financial/budgets');
    expect(resolveChoice('take me to spending', HUBS)?.path).toBe('/financial/spending');
  });

  it('takes a word only one option owns', () => {
    expect(resolveChoice('log', TWO)?.path).toBe('/astrology/log');
  });

  it('takes a position', () => {
    expect(resolveChoice('the second one', HUBS)?.path).toBe('/financial/spending');
    expect(resolveChoice('first', HUBS)?.path).toBe('/financial/budgets');
    expect(resolveChoice('2', HUBS)?.path).toBe('/financial/spending');
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
    expect(resolveChoice('morning', both)?.path).toBe('/beauty/morning');
  });

  it('answers nothing when there was nothing to answer', () => {
    expect(resolveChoice('astrology', [])).toBeUndefined();
    expect(resolveChoice('', TWO)).toBeUndefined();
    expect(resolveChoice('   ', TWO)).toBeUndefined();
  });

  it('does not read an unrelated word as a position', () => {
    expect(resolveChoice('neither', HUBS)).toBeUndefined();
    expect(resolveChoice('what', HUBS)).toBeUndefined();
  });
});
