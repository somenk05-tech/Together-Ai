import { MIN_DATING_AGE, ageOn, isAdult } from './age';

/**
 * The 18+ rule had NO test coverage at all before this file — which the launch
 * audit found, and which is how a check that ran after the row was already
 * visible went unnoticed for as long as it did.
 *
 * The boundary cases are the whole point. An off-by-one here is either a minor
 * in an adult pool or an adult told they are a child on their own birthday.
 */
const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('how old somebody is', () => {
  it('counts calendar years, not 365.25-day chunks', () => {
    // The exact case the old divisor got wrong: born on a leap day, asked on a
    // birthday four years later.
    expect(ageOn('2000-02-29', at('2024-02-29'))).toBe(24);
    expect(ageOn('1990-06-15', at('2026-06-14'))).toBe(35);   // day before
    expect(ageOn('1990-06-15', at('2026-06-15'))).toBe(36);   // the day itself
  });

  it('turns 18 ON the birthday, not a day either side of it', () => {
    const dob = '2008-08-27';
    expect(isAdult(dob, at('2026-08-26'))).toBe(false);
    expect(isAdult(dob, at('2026-08-27'))).toBe(true);
    expect(isAdult(dob, at('2026-08-28'))).toBe(true);
  });

  it('refuses everything it cannot read, rather than guessing', () => {
    // `null` must never read as "unknown, allow". This is the one place in the
    // product where an unreadable value has to mean no.
    for (const bad of ['', 'not-a-date', '0000-00-00', undefined, null]) {
      expect({ bad, adult: isAdult(bad as string) }).toEqual({ bad, adult: false });
    }
    expect(ageOn('not-a-date')).toBeNull();
  });

  it('never reads a future birth date as an age', () => {
    // A date in the future is not a small age, and it is certainly not a large
    // one — an unsigned subtraction somewhere would make 2040 read as adult.
    expect(ageOn('2040-01-01', at('2026-08-27'))).toBeNull();
    expect(isAdult('2040-01-01', at('2026-08-27'))).toBe(false);
  });

  it('keeps the threshold as one named number', () => {
    expect(MIN_DATING_AGE).toBe(18);
  });
});
