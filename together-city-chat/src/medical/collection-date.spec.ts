import { checkCollectionDate } from './collection-date';

/** Start of the citizen's local day, as ClockService.dateOnlyFor returns it. */
const today = new Date('2026-07-30T00:00:00.000Z');

describe('a blood sample cannot have been drawn in the future', () => {
  it('accepts a date in the past', () => {
    const r = checkCollectionDate('2026-05-26', today);
    expect(r.ok).toBe(true);
  });

  it('accepts today', () => {
    expect(checkCollectionDate('2026-07-30', today).ok).toBe(true);
  });

  it('accepts an instant part-way through today', () => {
    // The client may send a date-only string or a full ISO instant. Both mean
    // "today" and both must be allowed, or somebody entering this morning's
    // test is told it is in the future.
    expect(checkCollectionDate('2026-07-30T14:30:00.000Z', today).ok).toBe(true);
    expect(checkCollectionDate('2026-07-30T23:59:59.000Z', today).ok).toBe(true);
  });

  it('refuses tomorrow', () => {
    const r = checkCollectionDate('2026-07-31', today);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/cannot be dated in the future/i);
  });

  it('refuses a mistyped year, which is how this happens in practice', () => {
    // 2062 rather than 2026. A future-dated panel sorts to the top and becomes
    // "your latest", which then drives the health summary and the blood flags
    // feeding nutrition targets.
    expect(checkCollectionDate('2062-07-30', today).ok).toBe(false);
  });

  it('refuses a year that cannot be a lab result', () => {
    const r = checkCollectionDate('1823-04-01', today);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/typo/i);
  });

  it('refuses something that is not a date', () => {
    expect(checkCollectionDate('last tuesday', today).ok).toBe(false);
  });

  it('defaults an absent date to today rather than refusing', () => {
    const r = checkCollectionDate(undefined, today);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(today);
    expect(checkCollectionDate(null, today).ok).toBe(true);
    expect(checkCollectionDate('', today).ok).toBe(true);
  });

  describe('the citizen’s today, not the server’s', () => {
    it('accepts a local date that is ahead of UTC', () => {
      // 01:00 on the 30th in Asia/Kolkata is 19:30 on the 29th in UTC.
      // dateOnlyFor returns the citizen's local day start; comparing against a
      // UTC-derived "now" would reject a date they are living in.
      const localToday = new Date('2026-07-30T00:00:00.000Z');
      expect(checkCollectionDate('2026-07-30', localToday).ok).toBe(true);
    });

    it('still refuses the day after their today', () => {
      const localToday = new Date('2026-07-30T00:00:00.000Z');
      expect(checkCollectionDate('2026-07-31T00:00:00.000Z', localToday).ok).toBe(false);
    });
  });

  it('explains itself whenever it refuses', () => {
    for (const bad of ['2099-01-01', '1500-01-01', 'nonsense']) {
      const r = checkCollectionDate(bad, today);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason.length).toBeGreaterThan(15);
    }
  });
});
