import { allowanceLeft, dayStartUtc, releasable, shouldHold } from './trust-gate';
import { FREE_NEW_THREADS_PER_DAY } from './trust';

/**
 * THE GATE.
 *
 * Every test here is about one of two things: that nothing is ever refused,
 * and that nobody waiting can be buried by somebody who arrived later.
 */

const thread = (id: string, iso: string) => ({ id, createdAt: new Date(iso) });

describe('five new neighbours a day', () => {
  it('gives an unverified listing exactly five, then holds', () => {
    expect(FREE_NEW_THREADS_PER_DAY).toBe(5);
    expect(allowanceLeft('basic', 0)).toBe(5);
    expect(allowanceLeft('basic', 4)).toBe(1);
    expect(shouldHold('basic', 4)).toBe(false);
    expect(shouldHold('basic', 5)).toBe(true);
  });

  it('never goes negative, however far past the line a day has run', () => {
    // Held rows can outnumber the allowance many times over on a busy day, and
    // a negative "room" would slice backwards off the end of the queue and
    // release the NEWEST thread instead of the oldest.
    expect(allowanceLeft('basic', 40)).toBe(0);
    expect(releasable([thread('a', '2026-08-16T09:00:00Z')], 'basic', 40)).toEqual([]);
  });

  it('stops counting the moment the listing is verified', () => {
    for (const tier of ['identity', 'business', 'trusted'] as const) {
      expect(allowanceLeft(tier, 900)).toBe(Number.POSITIVE_INFINITY);
      expect(shouldHold(tier, 900)).toBe(false);
    }
  });
});

describe('the queue', () => {
  const held = [
    thread('third', '2026-08-16T18:00:00Z'),
    thread('first', '2026-08-14T09:00:00Z'),
    thread('second', '2026-08-15T11:30:00Z'),
  ];

  it('releases oldest first, so a busy day cannot bury anybody', () => {
    expect(releasable(held, 'basic', 3).map((t) => t.id)).toEqual(['first', 'second']);
  });

  it('releases every held thread at once when the listing verifies', () => {
    expect(releasable(held, 'business', 0).map((t) => t.id)).toEqual(['first', 'second', 'third']);
  });

  it('releases nothing into a day that is already full', () => {
    expect(releasable(held, 'basic', FREE_NEW_THREADS_PER_DAY)).toEqual([]);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [...held];
    releasable(input, 'business', 0);
    expect(input.map((t) => t.id)).toEqual(['third', 'first', 'second']);
  });
});

describe('the day', () => {
  it('is a UTC calendar day, and a late-evening IST message is still today', () => {
    // 16 Aug 11:30pm IST is 16 Aug 18:00 UTC. A boundary taken off the local
    // clock would have moved this into the 17th for half the country.
    expect(dayStartUtc(new Date('2026-08-16T18:00:00Z')).toISOString())
      .toBe('2026-08-16T00:00:00.000Z');
    expect(dayStartUtc(new Date('2026-08-16T00:00:00Z')).toISOString())
      .toBe('2026-08-16T00:00:00.000Z');
  });
});
