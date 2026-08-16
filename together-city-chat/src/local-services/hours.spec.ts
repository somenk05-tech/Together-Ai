import { DAY_NAMES, minutesOf, normaliseHours, openStateAt, parseHours } from './hours';

/**
 * THE HOURS ON THE DOOR.
 *
 * Two things are worth a test here and the rest is plumbing: the week that
 * comes back out of a half-filled input, and the moment where a closing time
 * is before its opening time. Both are places where the naive version is
 * wrong in a way nobody notices until a Saturday night.
 */

const week = (open: number[], from = '09:00', to = '18:00') =>
  Array.from({ length: 7 }, (_, d) => ({ day: d, open: open.includes(d), from, to }));

describe('a week of opening hours', () => {
  it('is always seven rows, Monday first, however few arrive', () => {
    // A client that sends only the days it opens is saying the rest are shut.
    // Storing that explicitly is what lets a page say "closed on Sunday"
    // rather than going quiet about it.
    const out = normaliseHours([{ day: 0, open: true, from: '10:00', to: '19:00' }])!;
    expect(out).toHaveLength(7);
    expect(out[0]).toEqual({ day: 0, open: true, from: '10:00', to: '19:00' });
    expect(out.slice(1).every((d) => d.open === false)).toBe(true);
    expect(DAY_NAMES[0]).toBe('Monday');
  });

  it('tells "never said" apart from "closed all week"', () => {
    // The distinction the whole feature rests on: null is not a claim about
    // anybody's shop, and a closed week is.
    expect(normaliseHours([])).toBeNull();
    expect(normaliseHours(undefined)).toBeNull();
    expect(parseHours(null)).toBeNull();
    expect(parseHours('{ not json')).toBeNull();
    expect(normaliseHours(week([]))).toHaveLength(7);
  });

  it('refuses a clock time it cannot read, rather than storing it', () => {
    const out = normaliseHours([{ day: 2, open: true, from: '25:00', to: 'lunchtime' }])!;
    expect(out[2].from).toBe('09:00');
    expect(out[2].to).toBe('18:00');
    expect(minutesOf('24:00')).toBeNull();
    expect(minutesOf('09:30')).toBe(570);
  });

  it('keeps the times on a day that has been switched off', () => {
    // Reopening Sunday should not cost somebody the times they typed.
    const out = normaliseHours([{ day: 6, open: false, from: '11:00', to: '16:00' }])!;
    expect(out[6]).toEqual({ day: 6, open: false, from: '11:00', to: '16:00' });
  });
});

describe('open now', () => {
  const nine_to_five = week([0, 1, 2, 3, 4], '09:00', '17:00'); // Mon–Fri

  it('is null when nobody has said — never false', () => {
    expect(openStateAt(null, 0, 600).open).toBeNull();
  });

  it('answers inside the window, and names the closing time', () => {
    expect(openStateAt(nine_to_five, 0, 10 * 60)).toEqual({ open: true, until: '17:00' });
  });

  it('is closed before opening, and points at today', () => {
    expect(openStateAt(nine_to_five, 0, 8 * 60)).toEqual({ open: false, nextDay: 0, nextFrom: '09:00' });
  });

  it('is closed after closing, and points at the next day that opens', () => {
    // Friday evening → Monday morning, stepping over the closed weekend.
    expect(openStateAt(nine_to_five, 4, 18 * 60)).toEqual({ open: false, nextDay: 0, nextFrom: '09:00' });
  });

  it('reads a night that spills past midnight as one window', () => {
    /**
     * THE CASE THE NAIVE VERSION GETS WRONG. A kitchen open 18:00–01:00 is
     * open at half past midnight, and at that moment the answer lives in
     * YESTERDAY's row — nothing in Sunday's row can tell you about Saturday
     * night. `from < to` validation would have refused the hours outright and
     * taught the owner to type 23:59 and mean something else.
     */
    const nights = week([5], '18:00', '01:00'); // Saturday only
    expect(openStateAt(nights, 5, 20 * 60).open).toBe(true);      // Sat 20:00
    expect(openStateAt(nights, 5, 23 * 60 + 59).open).toBe(true); // Sat 23:59
    expect(openStateAt(nights, 6, 30)).toEqual({ open: true, until: '01:00' }); // Sun 00:30
    expect(openStateAt(nights, 6, 2 * 60).open).toBe(false);      // Sun 02:00
  });

  it('says closed with no next opening when every day is shut', () => {
    // A guess would be worse than an absence: there is no next opening to
    // name, and inventing one is how a page tells somebody to turn up.
    expect(openStateAt(week([]), 3, 600)).toEqual({ open: false });
  });
});
