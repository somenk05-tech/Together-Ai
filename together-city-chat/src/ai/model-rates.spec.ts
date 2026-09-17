import { parseRates, rateFor, costPaise, rupees, type RateTable } from './model-rates';

/**
 * ── A RATE IS A NUMBER SOMEBODY SET, NEVER ONE WE GUESSED ───────────────────
 *
 * The city's accuracy rule — never invent a price — is usually about a shop's
 * shelf. This applies it to our own bill: the tokens are ours to count, the
 * rate is a commercial term, and the failure this file exists to prevent is a
 * plausible number on the operator's page that nobody can stand behind.
 */
const TABLE: RateTable = {
  'claude-opus-5': { in: 1250, out: 6250, cacheRead: 125, cacheWrite: 1560 },
  'claude-sonnet-5': { in: 250, out: 1250 },
};

describe('the rate table', () => {
  it('is empty when nobody has set it, and empty is not zero', () => {
    /* THE WHOLE POINT. No rates means "we cannot price this", which the page
       prints as a question rather than as ₹0.00 — a figure that would read as
       "this citizen cost nothing" and be believed. */
    expect(parseRates(undefined)).toEqual({});
    expect(parseRates('')).toEqual({});
    expect(costPaise('claude-opus-5', { tokensIn: 1_000_000, tokensOut: 0 }, {})).toBeNull();
  });

  it('reads a malformed variable as no rates rather than throwing', () => {
    /* A typo in an environment variable may not stop the API from booting, and
       it may not produce a bill either. */
    expect(parseRates('not json')).toEqual({});
    expect(parseRates('[1,2,3]')).toEqual({});
    expect(parseRates('{"m":{"in":"lots","out":2}}')).toEqual({});
    expect(parseRates('{"m":{"in":-5,"out":2}}')).toEqual({});
    expect(parseRates('{"m":{"in":1,"out":2}}')).toEqual({ m: { in: 1, out: 2 } });
  });

  it('prices a dated model id from the family it belongs to', () => {
    /* Providers date their ids, and a table that has to be re-typed on every
       point release is a table that goes stale. */
    expect(rateFor('claude-opus-5-20260401', TABLE)).toEqual(TABLE['claude-opus-5']);
    expect(rateFor('claude-haiku-9', TABLE)).toBeNull();
  });

  it('lets the longer key win, so an exact id can override its family', () => {
    const t: RateTable = { 'claude-opus-5': { in: 100, out: 200 }, 'claude-opus-5-20260401': { in: 1, out: 2 } };
    expect(rateFor('claude-opus-5-20260401', t)?.in).toBe(1);
    expect(rateFor('claude-opus-5-20251201', t)?.in).toBe(100);
  });

  it('counts in paise, because most calls cost a fraction of a rupee', () => {
    /* A bill summed from rounded rupees reads as ₹0 for every citizen who used
       the city lightly — which is most of them, and exactly the row an
       operator is trying to tell apart from a script. */
    const p = costPaise('claude-sonnet-5', { tokensIn: 1_000_000, tokensOut: 0 }, TABLE);
    expect(p).toBe(25_000);
    expect(rupees(25_000)).toBe('₹250.00');
    expect(costPaise('claude-sonnet-5', { tokensIn: 1_000, tokensOut: 0 }, TABLE)).toBeCloseTo(25, 6);
  });

  it('never counts a cached token as free', () => {
    /* Cache pricing is why a bill can fall without traffic falling, so it is
       kept apart — but a deployment that has not broken it out is better served
       by a slightly-high estimate it understands than by a silent zero. */
    const withCache = costPaise('claude-sonnet-5', { tokensIn: 0, tokensOut: 0, cacheRead: 1_000_000 }, TABLE);
    expect(withCache).toBe(25_000);
    const broken = costPaise('claude-opus-5', { tokensIn: 0, tokensOut: 0, cacheRead: 1_000_000 }, TABLE);
    expect(broken).toBe(12_500);
  });
});
