import { expandDoses, normaliseTimes, notifyAtFor, NOTIFY_LEAD_MS, ScheduleSpec } from './dose-schedule';
import { instantAt, offsetMsAt, addDays, weekdayOf } from '../shared/clock/zone-time';

/**
 * When a citizen is told to take a medicine.
 *
 * These are the cases that a stored-instant schedule gets wrong, which is the
 * whole reason times are kept as wall-clock text plus a zone.
 */

const spec = (over: Partial<ScheduleSpec> = {}): ScheduleSpec => ({
  timesLocal: ['08:00', '20:00'],
  daysOfWeek: null,
  startDate: '2026-03-01',
  endDate: null,
  timezone: 'Asia/Kolkata',
  ...over,
});

const iso = (d: Date) => d.toISOString();

describe('local wall-clock → instant', () => {
  it('resolves a time in a half-hour-offset zone', () => {
    // Asia/Kolkata is UTC+05:30 year round: 08:00 local is 02:30 UTC.
    expect(iso(instantAt('Asia/Kolkata', '2026-03-10', '08:00'))).toBe('2026-03-10T02:30:00.000Z');
  });

  it('resolves a time in UTC itself', () => {
    expect(iso(instantAt('UTC', '2026-03-10', '08:00'))).toBe('2026-03-10T08:00:00.000Z');
  });

  it('holds the wall clock across a spring-forward boundary', () => {
    // US DST began 2026-03-08. 08:00 New York is 13:00 UTC before and 12:00 after.
    expect(iso(instantAt('America/New_York', '2026-03-06', '08:00'))).toBe('2026-03-06T13:00:00.000Z');
    expect(iso(instantAt('America/New_York', '2026-03-10', '08:00'))).toBe('2026-03-10T12:00:00.000Z');
  });

  it('holds the wall clock across a fall-back boundary', () => {
    // US DST ended 2026-11-01.
    expect(iso(instantAt('America/New_York', '2026-10-30', '08:00'))).toBe('2026-10-30T12:00:00.000Z');
    expect(iso(instantAt('America/New_York', '2026-11-03', '08:00'))).toBe('2026-11-03T13:00:00.000Z');
  });

  it('reports the offset a zone was actually at, not a fixed one', () => {
    expect(offsetMsAt('Asia/Kolkata', new Date('2026-06-01T00:00:00Z'))).toBe(5.5 * 3600_000);
    expect(offsetMsAt('America/New_York', new Date('2026-01-15T12:00:00Z'))).toBe(-5 * 3600_000);
    expect(offsetMsAt('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(-4 * 3600_000);
  });

  it('lands a nonexistent spring-forward time on the clock the citizen will see', () => {
    // 02:30 never happens on 2026-03-08 in New York; the clock jumps 02:00→03:00.
    // Skipping the dose would be worse than moving it, so it resolves to 03:30 local.
    const at = instantAt('America/New_York', '2026-03-08', '02:30');
    const localHour = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(at);
    expect(localHour).toBe('03:30');
  });
});

describe('the five-minute lead', () => {
  it('is exactly five minutes, always', () => {
    const dose = new Date('2026-03-10T02:30:00.000Z');
    expect(iso(notifyAtFor(dose))).toBe('2026-03-10T02:25:00.000Z');
    expect(dose.getTime() - notifyAtFor(dose).getTime()).toBe(NOTIFY_LEAD_MS);
  });

  it('crosses midnight backwards without drama', () => {
    expect(iso(notifyAtFor(new Date('2026-03-10T00:02:00.000Z')))).toBe('2026-03-09T23:57:00.000Z');
  });
});

describe('expanding a schedule into doses', () => {
  it('emits every listed time on every day in the window', () => {
    const doses = expandDoses(
      spec({ startDate: '2026-03-09' }),
      new Date('2026-03-09T00:00:00Z'),
      new Date('2026-03-11T00:00:00Z'),
    );
    // 09th 08:00 & 20:00, 10th 08:00 & 20:00, then 11th 08:00 is 02:30Z — inside.
    expect(doses.map(iso)).toEqual([
      '2026-03-09T02:30:00.000Z',
      '2026-03-09T14:30:00.000Z',
      '2026-03-10T02:30:00.000Z',
      '2026-03-10T14:30:00.000Z',
    ]);
  });

  it('keeps 08:00 at 08:00 local right through a DST change', () => {
    const doses = expandDoses(
      spec({ timesLocal: ['08:00'], timezone: 'America/New_York', startDate: '2026-03-06' }),
      new Date('2026-03-06T00:00:00Z'),
      new Date('2026-03-11T00:00:00Z'),
    );
    const localTimes = doses.map((d) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(d),
    );
    expect(localTimes).toEqual(['08:00', '08:00', '08:00', '08:00', '08:00']);
    // ...even though the UTC instant moved by an hour partway through.
    expect(iso(doses[0])).toBe('2026-03-06T13:00:00.000Z');
    expect(iso(doses[doses.length - 1])).toBe('2026-03-10T12:00:00.000Z');
  });

  it('honours a weekday filter', () => {
    // Mondays only (1). 2026-03-09 is a Monday.
    const doses = expandDoses(
      spec({ timesLocal: ['09:00'], daysOfWeek: [1], startDate: '2026-03-01' }),
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-20T00:00:00Z'),
    );
    expect(doses.every((d) => weekdayOf(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d),
    ) === 1)).toBe(true);
    expect(doses).toHaveLength(3); // 2nd, 9th, 16th
  });

  it('never emits before the start date', () => {
    const doses = expandDoses(
      spec({ startDate: '2026-03-15' }),
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-20T00:00:00Z'),
    );
    expect(doses.every((d) => d >= new Date('2026-03-15T00:00:00Z'))).toBe(true);
  });

  it('stops at the end date', () => {
    const doses = expandDoses(
      spec({ startDate: '2026-03-01', endDate: '2026-03-03', timesLocal: ['08:00'] }),
      new Date('2026-03-01T00:00:00Z'),
      new Date('2026-03-31T00:00:00Z'),
    );
    expect(doses.map(iso)).toEqual([
      '2026-03-01T02:30:00.000Z',
      '2026-03-02T02:30:00.000Z',
      '2026-03-03T02:30:00.000Z',
    ]);
  });

  it('crosses a month end without a gap', () => {
    const doses = expandDoses(
      spec({ timesLocal: ['08:00'], startDate: '2026-03-30' }),
      new Date('2026-03-30T00:00:00Z'),
      new Date('2026-04-02T00:00:00Z'),
    );
    expect(doses.map((d) => d.toISOString().slice(0, 10))).toEqual(
      ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02'],
    );
  });

  it('is deterministic — same inputs, byte-identical output', () => {
    const args = [spec(), new Date('2026-03-01T00:00:00Z'), new Date('2026-03-08T00:00:00Z')] as const;
    const a = expandDoses(...args).map(iso);
    for (let i = 0; i < 25; i++) expect(expandDoses(...args).map(iso)).toEqual(a);
  });

  it('returns nothing rather than throwing on nonsense', () => {
    expect(expandDoses(spec({ timesLocal: [] }), new Date('2026-03-01T00:00:00Z'), new Date('2026-03-02T00:00:00Z'))).toEqual([]);
    expect(expandDoses(spec({ timesLocal: ['25:00', 'lunchtime', ''] }), new Date('2026-03-01T00:00:00Z'), new Date('2026-03-02T00:00:00Z'))).toEqual([]);
    // Inverted window.
    expect(expandDoses(spec(), new Date('2026-03-09T00:00:00Z'), new Date('2026-03-01T00:00:00Z'))).toEqual([]);
  });

  it('cannot be made to spin on an absurd range', () => {
    const doses = expandDoses(
      spec({ timesLocal: ['08:00'], startDate: '2020-01-01' }),
      new Date('2020-01-01T00:00:00Z'),
      new Date('2030-01-01T00:00:00Z'),
    );
    expect(doses.length).toBeLessThanOrEqual(400); // the day cap holds
  });
});

describe('time normalisation', () => {
  it('drops nonsense, dedupes and sorts', () => {
    expect(normaliseTimes([' 20:00 ', '08:00', '08:00', '24:00', '7:00', 'x'])).toEqual(['08:00', '20:00']);
  });
  it('accepts the edges of the clock', () => {
    expect(normaliseTimes(['00:00', '23:59'])).toEqual(['00:00', '23:59']);
  });
});

describe('day arithmetic', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29'); // 2028 is a leap year
  });
});
