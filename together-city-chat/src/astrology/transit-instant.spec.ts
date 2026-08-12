import { AstrologyService } from './astrology.service';
import * as content from './astro-content';
import { natalChart } from './astro-engine';
import { computeNumerology, vimshottariDasha } from './personal-factors';

/**
 * THE SKY IS READ AT AN INSTANT. THE LETTER IS DATED BY A CALENDAR.
 *
 * THE DEFECT THIS FILE EXISTS FOR. `userNow()` returned the real instant with
 * the citizen's UTC offset added — a wall-clock Date, whose calendar fields
 * read as their date. That is exactly right for naming the day and completely
 * wrong for the ephemeris, and the one value was used for both: for an Indian
 * citizen the composer computed the day's transits five and a half hours into
 * the future. The Moon moves about three degrees in that time, which is enough
 * to put it in the next sign or to name the next phase, on a letter whose date
 * was perfectly correct. `ask()` used the true instant, so two surfaces of one
 * hub could describe two different skies within a second of each other.
 *
 * Nothing in the output could show it: the letters never name a planet, a sign
 * or a phase — the voice rules forbid it — so the only visible trace was a day
 * that read slightly wrong to somebody who would have to be checking.
 */

const born = new Date('1985-05-22T00:00:00Z');
const chart = natalChart(born, '09:15', 'Asia/Kolkata', 22.8, 86.18);

const profileRow = {
  id: 'p1', userId: 'u1', birthDate: born, birthTime: '09:15',
  birthCountry: 'India', birthState: 'Jharkhand', birthCity: 'Jamshedpur',
  timeZone: 'Asia/Calcutta', lat: 22.8, lng: 86.18, updatedAt: new Date('2026-01-01T00:00:00Z'),
};

/** Enough of the world for `daily()` to reach the composer and stop there:
 *  the writer is not configured, so no letter is written and none is cached. */
function svc() {
  const prisma = {
    astroProfile: { findUnique: () => Promise.resolve(profileRow) },
    astroReading: {
      findUnique: () => Promise.resolve(null),
      findMany: () => Promise.resolve([]),
      upsert: () => Promise.resolve({ readingJson: '{}' }),
    },
    user: { findUnique: () => Promise.resolve({ name: 'Somen' }) },
  };
  return new AstrologyService(
    prisma as never, { get: () => Promise.resolve(null) } as never,
    null as never, { enabled: false } as never,
  );
}

afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe('the daily letter', () => {
  it('reads the sky at the real instant, not at the citizen\'s wall clock', async () => {
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-08-12T09:00:00Z'));
    const spy = jest.spyOn(content, 'composeDailyBrief');
    await svc().daily('u1');

    expect(spy).toHaveBeenCalledTimes(1);
    const when = spy.mock.calls[0][2];
    expect(when.at.getTime()).toBe(Date.parse('2026-08-12T09:00:00Z'));
    // The old value, spelled out so nobody restores it by accident.
    expect(when.at.getTime()).not.toBe(Date.parse('2026-08-12T09:00:00Z') + 330 * 60000);
  });

  it('still dates itself by the citizen\'s calendar, not by UTC', async () => {
    // 19:00 UTC is 00:30 the next morning in India. The letter belongs to the
    // 12th — that is the whole reason a wall clock is computed at all — and the
    // sky is still read at 19:00 UTC on the 11th.
    jest.useFakeTimers(); jest.setSystemTime(new Date('2026-08-11T19:00:00Z'));
    const spy = jest.spyOn(content, 'composeDailyBrief');
    const out = await svc().daily('u1');

    const when = spy.mock.calls[0][2];
    expect(when.date).toBe('2026-08-12');
    expect(when.at.toISOString()).toBe('2026-08-11T19:00:00.000Z');
    expect(out).toMatchObject({ pending: true, date: '2026-08-12' });
  });
});

describe('the brief itself', () => {
  /** Composed the way the service composes it, so the two clocks are the only
   *  thing these tests are holding still. */
  const briefFor = (date: string, at: string) => {
    const on = new Date(at);
    return content.composeDailyBrief(
      chart, 'u1', { date, at: on },
      computeNumerology(born, new Date(`${date}T12:00:00Z`)),
      vimshottariDasha(chart.moon.lon, born, on),
    ).observations;
  };

  it('follows the instant — the same day read three days apart is a different sky', () => {
    expect(briefFor('2026-08-12', '2026-08-12T09:00:00Z'))
      .not.toEqual(briefFor('2026-08-12', '2026-08-15T09:00:00Z'));
  });

  it('is the same letter twice for the same moment', () => {
    expect(briefFor('2026-08-12', '2026-08-12T09:00:00Z'))
      .toEqual(briefFor('2026-08-12', '2026-08-12T09:00:00Z'));
  });

  it('is a different letter on a different day of theirs', () => {
    expect(briefFor('2026-08-12', '2026-08-12T09:00:00Z'))
      .not.toEqual(briefFor('2026-08-13', '2026-08-13T09:00:00Z'));
  });
});
