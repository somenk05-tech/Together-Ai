import { daypartOf, slotsAhead, mealAsked, otherDayAsked, timeContext } from './daypart';

/**
 * The screenshot: 18:06, "What should I cook", and she opened with breakfast.
 */
describe('she knows what time it is for them', () => {
  it('names the daypart from the owner\'s table', () => {
    const at: Array<[number, string]> = [
      [5, 'early morning'], [6, 'early morning'], [9, 'early morning'],
      [10, 'late morning'], [11, 'late morning'],
      [12, 'midday'], [14, 'midday'],
      [15, 'afternoon'], [16, 'afternoon'],
      [17, 'evening'], [18, 'evening'], [19, 'evening'],
      [20, 'night'], [22, 'night'],
      [23, 'late night'], [0, 'late night'], [4, 'late night'],
    ];
    for (const [hour, part] of at) expect(daypartOf(hour)).toBe(part);
  });

  it('wraps rather than throwing on an hour nobody should send', () => {
    expect(daypartOf(24)).toBe(daypartOf(0));
    expect(daypartOf(-1)).toBe(daypartOf(23));
  });
});

describe('only what can still be eaten', () => {
  it('at six in the evening, breakfast and lunch are gone', () => {
    expect(slotsAhead(18)).toEqual(['s', 'd']);
  });

  it('in the morning the whole day is ahead', () => {
    expect(slotsAhead(6)).toEqual(['b', 'l', 's', 'd']);
  });

  it('an hour of grace, because 20:30 still means dinner', () => {
    expect(slotsAhead(20.5)).toContain('d');
    expect(slotsAhead(21)).toContain('d');
    expect(slotsAhead(22)).not.toContain('d');
  });

  it('a household that eats late has not missed dinner', () => {
    // At 22:00 the default dinner hour (20:00, plus the hour of grace) has
    // passed; a household that actually eats at 22:00 has not missed it.
    const late = [{ slot: 'd', scheduledTime: '22:00' }];
    expect(slotsAhead(22, late)).toContain('d');
    expect(slotsAhead(22)).not.toContain('d');
  });
});

/**
 * ── INTENT BEATS THE CLOCK ────────────────────────────────────────────────
 * The rule that keeps a context engine from becoming a thing that argues with
 * the person using it.
 */
describe('what they asked for outranks what time it is', () => {
  it('"breakfast tomorrow" at 6pm is a question about breakfast', () => {
    const t = timeContext(18, 'what should i have for breakfast tomorrow');
    expect(t.slots).toEqual(['b']);
    expect(t.theyChose).toBe(true);
  });

  it('naming any meal pins it', () => {
    expect(mealAsked('something for lunch')).toBe('l');
    expect(mealAsked('what is for dinner')).toBe('d');
    expect(mealAsked('nashta ideas')).toBe('b');
    expect(mealAsked('what should i eat')).toBeUndefined();
  });

  it('another day opens the whole plan back up', () => {
    expect(otherDayAsked('what should i cook tomorrow')).toBe(true);
    expect(otherDayAsked('what should i cook on sunday')).toBe(true);
    // Tonight is today, and today is the clock's own day.
    expect(otherDayAsked('what should i cook tonight')).toBe(false);
    expect(otherDayAsked('what should i cook today')).toBe(false);
  });

  it('and with no words to go on, the clock narrows it', () => {
    const t = timeContext(18, 'what should i cook');
    expect(t.slots).toEqual(['s', 'd']);
    expect(t.daypart).toBe('evening');
    expect(t.theyChose).toBe(false);
  });

  it('late at night nothing is ahead, and it says so by returning the day', () => {
    const t = timeContext(23, 'what should i cook');
    expect(t.slots).toEqual(['b', 'l', 's', 'd']);
    expect(t.theyChose).toBe(false);
  });
});
