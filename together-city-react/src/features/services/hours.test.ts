import { describe, it, expect } from 'vitest';
import { blankWeek, clockLabel, openSentence, openStateAt, summarise, todayIdx, type DayHours } from './hours';

/**
 * The browser half of the hours rule — the sentence a citizen reads. The
 * server's own spec covers storage and the spill past midnight; this covers
 * the two things only this side does: turning a `getDay()` into a working-week
 * index, and folding seven rows into the three lines that fit on a shop sign.
 */
const week = (open: number[], from = '09:00', to = '18:00'): DayHours[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, open: open.includes(day), from, to }));

describe('the working week starts on Monday', () => {
  it('turns a calendar Sunday into index 6, not index 0', () => {
    // The one conversion in the feature. Getting it wrong shifts every row by
    // a day, which reads as plausible and is wrong all week.
    expect(todayIdx(new Date(2026, 7, 16))).toBe(6); // a Sunday
    expect(todayIdx(new Date(2026, 7, 17))).toBe(0); // the Monday after
  });
});

describe('the words under the badge', () => {
  const mon_fri = week([0, 1, 2, 3, 4], '09:00', '17:00');

  it('says when today ends while it is open', () => {
    const s = openStateAt(mon_fri, 0, 10 * 60);
    expect(openSentence(s, 0)).toBe('until 5:00 pm');
  });

  it('says today, tomorrow or the day by name — whichever is true', () => {
    expect(openSentence(openStateAt(mon_fri, 0, 8 * 60), 0)).toBe('opens at 9:00 am');
    // Thursday night → Friday morning.
    expect(openSentence(openStateAt(mon_fri, 3, 22 * 60), 3)).toBe('opens tomorrow at 9:00 am');
    // Friday night → Monday, which is neither today nor tomorrow.
    expect(openSentence(openStateAt(mon_fri, 4, 22 * 60), 4)).toBe('opens Monday at 9:00 am');
  });

  it('says nothing at all when nobody set any hours', () => {
    // Null is not "closed". A page that renders the absence as a claim is
    // putting words in a business's mouth.
    expect(openSentence(openStateAt(null, 0, 600), 0)).toBeNull();
  });

  it('and admits it when every day is shut, rather than naming a fake opening', () => {
    expect(openSentence(openStateAt(week([]), 2, 600), 2)).toBe('no opening hours set for any day');
  });

  it('writes clock times the way people say them', () => {
    expect(clockLabel('09:00')).toBe('9:00 am');
    expect(clockLabel('12:30')).toBe('12:30 pm');
    expect(clockLabel('00:15')).toBe('12:15 am');
    expect(clockLabel('18:45')).toBe('6:45 pm');
  });
});

describe('the week, folded', () => {
  it('collapses identical consecutive days into one line', () => {
    const rows = summarise(week([0, 1, 2, 3, 4], '09:00', '18:00'));
    expect(rows).toEqual([
      { label: 'Mon–Fri', when: '9:00 am – 6:00 pm', closed: false },
      { label: 'Sat–Sun', when: 'Closed', closed: true },
    ]);
  });

  it('keeps a day that differs on its own line', () => {
    const w = week([0, 1, 2, 3, 4, 5], '09:00', '18:00');
    w[5] = { day: 5, open: true, from: '10:00', to: '14:00' };
    const rows = summarise(w);
    expect(rows.map((r) => r.label)).toEqual(['Mon–Fri', 'Sat', 'Sun']);
    expect(rows[1].when).toBe('10:00 am – 2:00 pm');
  });

  it('has nothing to fold when there are no hours', () => {
    expect(summarise(null)).toEqual([]);
    expect(summarise(undefined)).toEqual([]);
  });

  it('offers a sane week to start from, and it is only a suggestion', () => {
    const b = blankWeek();
    expect(b).toHaveLength(7);
    expect(b[6].open).toBe(false); // Sunday
    expect(b.filter((d) => d.open)).toHaveLength(6);
  });
});
