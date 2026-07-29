import { ClockService, DEFAULT_TIMEZONE } from './clock.service';

/**
 * The bug this whole service exists to prevent, pinned down.
 *
 * 20:00 UTC on the 4th is already 01:30 on the 5th in Asia/Kolkata. Every date
 * in this codebase used to be computed as the UTC calendar day, so for the five
 * and a half hours after an Indian citizen's midnight the app named yesterday:
 * yesterday's plate, yesterday's spend, a meal plan anchored a day behind, an
 * order stamped with a date the citizen never placed it on.
 */
const LATE_NIGHT_IST = new Date('2026-07-04T20:00:00.000Z'); // 01:30 on the 5th in Kolkata
const MORNING_IST = new Date('2026-07-05T06:00:00.000Z');    // 11:30 on the 5th in Kolkata

describe('ClockService', () => {
  const prisma = { masterProfile: { findUnique: jest.fn() } };
  const clock = new ClockService(prisma as never);

  beforeEach(() => prisma.masterProfile.findUnique.mockReset());

  it('names the citizen\'s day, not the server\'s, after their midnight', () => {
    expect(LATE_NIGHT_IST.toISOString().slice(0, 10)).toBe('2026-07-04'); // what we used to show
    expect(clock.dayIn('Asia/Kolkata', LATE_NIGHT_IST)).toBe('2026-07-05'); // what it actually is
  });

  it('works west of UTC too, where the shift goes the other way', () => {
    // 06:00 UTC on the 5th is still 23:00 on the 4th in Los Angeles.
    expect(clock.dayIn('America/Los_Angeles', MORNING_IST)).toBe('2026-07-04');
    expect(clock.dayIn('Asia/Kolkata', MORNING_IST)).toBe('2026-07-05');
  });

  it('falls back to the city zone, never the server, when a profile is missing', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue(null);
    await expect(clock.timezoneFor('u1')).resolves.toBe(DEFAULT_TIMEZONE);
  });

  it('falls back to the city zone when the stored zone is junk', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue({ timeZone: 'Mars/Olympus_Mons' });
    await expect(clock.timezoneFor('u1')).resolves.toBe(DEFAULT_TIMEZONE);
    expect(clock.validZone('Mars/Olympus_Mons')).toBe(false);
    expect(clock.validZone('Europe/Lisbon')).toBe(true);
  });

  it('survives a database error without changing which day it is', async () => {
    // A transient read failure must not silently move the citizen to another
    // day — that is how a Card of the Day got re-dealt and a plan re-anchored.
    prisma.masterProfile.findUnique.mockRejectedValue(new Error('connection lost'));
    await expect(clock.timezoneFor('u1')).resolves.toBe(DEFAULT_TIMEZONE);
  });

  it('gives date-only columns a value that reads back the same in every zone', async () => {
    prisma.masterProfile.findUnique.mockResolvedValue({ timeZone: 'Asia/Kolkata' });
    const d = await clock.dateOnlyFor('u1', LATE_NIGHT_IST);
    expect(d.toISOString()).toBe('2026-07-05T00:00:00.000Z');
    // The point of storing it this way: toISOString() is now correct everywhere,
    // which is why the date-only read sites are deliberately left on it.
    expect(d.toISOString().slice(0, 10)).toBe('2026-07-05');
  });

  it('starts the day at the right instant, across a DST boundary', () => {
    // Europe/London is UTC+1 in July, so its day begins at 23:00 UTC the night before.
    const start = clock.startOfDayIn('Europe/London', new Date('2026-07-05T12:00:00.000Z'));
    expect(start.toISOString()).toBe('2026-07-04T23:00:00.000Z');
    // ...and UTC+0 in January, so it begins at midnight UTC.
    const winter = clock.startOfDayIn('Europe/London', new Date('2026-01-05T12:00:00.000Z'));
    expect(winter.toISOString()).toBe('2026-01-05T00:00:00.000Z');
  });
});
