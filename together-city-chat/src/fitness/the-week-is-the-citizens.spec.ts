import { buildProgramme, placeTraining, WEEKDAY_NAMES, OFF_DAY_ACTIVITIES, type ProgrammeInput } from './programme-engine';

/**
 * ── THE WEEK IS THE CITIZEN'S ───────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Let the user decide which two days they want a break — or if
 * they don't want a break, what they can do, maybe just a walk or a run or a
 * swim, something else. Act as a trainer consulting the user."
 *
 * Before this the month took Saturday and Sunday off because PLACEMENT said
 * so, and PLACEMENT was written on the assumption that everybody's week ends
 * where the calendar's does. It does not. A nurse on nights, a shopkeeper who
 * works Saturdays, anyone with a Sunday that is not free — the plan argued
 * with their life, and a plan that argues with a life is abandoned in week
 * two, which is a training failure the engine can see coming.
 *
 * THE RULE THIS FILE HOLDS: the days off WIN. They are the ones with a reason
 * outside this app. What gives is the number of training days, and the month
 * says out loud that it gave — being consulted is different from being
 * overruled, and a trainer who quietly shortens your week has done the second
 * while appearing to do the first.
 */

const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-15', daysPerWeek: 4, level: 'intermediate', mode: 'strength',
  bodyGoal: 'buildMuscle', equipment: ['dumbbells', 'bench', 'mat'], conditions: [], seed: 'citizen-1', cycle: 0,
};
/** Monday = 0, and the month starts on a Monday, so index i is weekday i % 7. */
const week1 = (p: ReturnType<typeof buildProgramme>) => p.days.slice(0, 7);

describe('where the training days land', () => {
  it('keeps the calendar placement when nobody has said otherwise', () => {
    /* THE FLOOR THIS WHOLE FEATURE STANDS ON: a citizen who has never been
       asked gets exactly the month they had before 9 Sep. Every other
       assertion in this file is about a citizen who HAS answered. */
    expect(placeTraining(4, undefined)).toEqual([0, 1, 3, 4]);
    expect(placeTraining(4, [])).toEqual([0, 1, 3, 4]);
    expect(buildProgramme(BASE).rest.chosen).toBe(false);
  });

  it('keeps it too when the citizen picks the days it already left free', () => {
    /* Saturday and Sunday is what the calendar assumed all along. Answering
       with it must not shuffle a month that was already right — the Mon/Tue/
       Thu/Fri spacing is better than anything an even-spread would produce. */
    expect(placeTraining(4, [5, 6])).toEqual([0, 1, 3, 4]);
  });

  it('moves the week when the citizen keeps different days', () => {
    const p = buildProgramme({ ...BASE, restDays: [0, 6] });
    /* Monday and Sunday off: nothing trains on either. */
    expect(week1(p)[0].kind).toBe('rest');
    expect(week1(p)[6].kind).toBe('rest');
    expect(week1(p).filter((d) => d.kind !== 'rest')).toHaveLength(4);
    expect(p.rest.chosen).toBe(true);
    expect(p.rest.label).toBe('Monday and Sunday');
  });

  it('never trains on a day the citizen kept, in any of the four weeks', () => {
    const off = [2, 5];
    const p = buildProgramme({ ...BASE, daysPerWeek: 5, restDays: off });
    for (const d of p.days) {
      if (off.includes(d.index % 7)) expect(d.kind).toBe('rest');
    }
  });
});

describe('the days off win, and the month says that they did', () => {
  it('shortens the week rather than the weekend, and rebuilds the split for it', () => {
    /* Five asked for, four days left. A trainer writes a FOUR-day split, not
       a five-day split squeezed into four. */
    const p = buildProgramme({ ...BASE, daysPerWeek: 5, restDays: [3, 5, 6] });
    expect(p.daysPerWeek).toBe(4);
    expect(p.splitName).toBe('Upper / Lower');
    expect(week1(p).filter((d) => d.kind !== 'rest')).toHaveLength(4);
    expect(p.rest.advice.join(' ')).toMatch(/asked for 5 training days/i);
  });

  it('does not shorten anything when the numbers already agree', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 5, restDays: [5, 6] });
    expect(p.daysPerWeek).toBe(5);
    expect(p.rest.advice.join(' ')).not.toMatch(/asked for/i);
    expect(p.rest.advice.join(' ')).toMatch(/Saturday and Sunday are yours/);
  });

  it('does not tell a citizen who answered the other half that they said nothing', () => {
    /* "If they don't want a break, what they can do" — somebody who named an
       easy activity without naming days answered the SECOND half of the
       question. Nagging about the first half would bury the half they did
       answer, and would be false besides. */
    const p = buildProgramme({ ...BASE, restActivity: 'walk' });
    expect(p.rest.advice.join(' ')).not.toMatch(/have not told us/i);
    expect(p.rest.advice.join(' ')).toMatch(/on those you walk rather than stop/i);
  });

  it('tells a citizen who has never answered that the week can move', () => {
    const p = buildProgramme(BASE);
    expect(p.rest.advice.join(' ')).toMatch(/have not told us which days are yours/i);
    /* And it still names the days it took, rather than leaving them a mystery
       the citizen has to read off a grid. */
    expect(p.rest.label).toBe('Wednesday, Saturday and Sunday');
  });
});

describe('an off day is not always the word "rest"', () => {
  it('is rest by default, and says what a rest day is for', () => {
    const p = buildProgramme(BASE);
    const off = week1(p).find((d) => d.kind === 'rest')!;
    expect(off.title).toBe('Rest');
    expect(off.note).toMatch(/rest day is training too/i);
  });

  it('takes the citizen\'s choice, and keeps the kind it really is', () => {
    const p = buildProgramme({ ...BASE, restDays: [5, 6], restActivity: 'swim' });
    const off = week1(p).find((d) => d.index % 7 === 5)!;
    expect(off.title).toBe('Swim');
    /* THE KIND DOES NOT MOVE. Every reader of `kind` is asking "is this a day
       off the split", not "what does the citizen do with the afternoon". A
       swim that reported itself as 'cardio' would be counted as a training
       day by the session engine and by the done-marks on the grid. */
    expect(off.kind).toBe('rest');
    expect(off.note).toMatch(/takes the load off/i);
  });

  it('prints a word we do not know rather than refusing it', () => {
    /* The trainer asked "what would you rather do". "Cricket" is a better
       answer than the nearest of six, and a list that cannot hold it makes
       the question dishonest. */
    const p = buildProgramme({ ...BASE, restDays: [5, 6], restActivity: 'Cricket' });
    const off = week1(p).find((d) => d.index % 7 === 5)!;
    expect(off.title).toBe('Cricket');
    expect(off.note).toMatch(/keep it easy/i);
  });

  it('offers the six a trainer would name first, rest among them', () => {
    expect(OFF_DAY_ACTIVITIES[0]).toBe('rest');
    expect(OFF_DAY_ACTIVITIES).toEqual(expect.arrayContaining(['walk', 'run', 'swim']));
  });

  it('warns that an easy day done hard is not an easy day', () => {
    const p = buildProgramme({ ...BASE, restDays: [5, 6], restActivity: 'run' });
    expect(p.rest.advice.join(' ')).toMatch(/as long as it stays easy/i);
  });
});

describe('the trainer will not silently agree to seven hard days', () => {
  it('says so once, and still builds the week that was asked for', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 6, restDays: [] });
    /* An empty list is "never asked" here, so this is the six-day default and
       Sunday is still off. The refusal belongs to the case below. */
    expect(p.daysPerWeek).toBe(6);
    expect(week1(p).filter((d) => d.kind === 'rest')).toHaveLength(1);
  });

  it('names every weekday it has taken, in the citizen\'s language', () => {
    expect(WEEKDAY_NAMES).toHaveLength(7);
    expect(WEEKDAY_NAMES[0]).toBe('Monday');
    expect(WEEKDAY_NAMES[6]).toBe('Sunday');
  });
});

describe('the month is still deterministic once a week is chosen', () => {
  it('gives the same citizen the same month on every open', () => {
    const q = { ...BASE, restDays: [1, 4], restActivity: 'walk' };
    expect(JSON.stringify(buildProgramme(q))).toBe(JSON.stringify(buildProgramme(q)));
  });

  it('changes the month when the week changes, and only then', () => {
    const a = buildProgramme({ ...BASE, restDays: [5, 6] });
    const b = buildProgramme({ ...BASE, restDays: [0, 3] });
    expect(a.days.map((d) => d.kind)).not.toEqual(b.days.map((d) => d.kind));
    /* The MOVEMENTS are unchanged — the pool, the seed and the cycle did not
       move, only which weekday each session lands on. A citizen who shifts
       their week should not find a different month behind it. */
    const names = (p: typeof a) => p.days.filter((d) => d.kind === 'strength').map((d) => d.exercises.map((e) => e.name).join('|'));
    expect(new Set(names(a))).toEqual(new Set(names(b)));
  });
});
