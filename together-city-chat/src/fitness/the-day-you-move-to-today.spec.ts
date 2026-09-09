import { buildProgramme, readMoves, writeMoves, applyMoves, type ProgrammeInput, type ProgrammeMove } from './programme-engine';

/**
 * ── THE DAY YOU MOVE TO TODAY ───────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Have an 'update to today's workout plan' button, and that
 * goes to today's workout plan, and then today's plan shifts to the next day."
 *
 * Read that twice, because it rules out the obvious implementation. A SWAP
 * would put legs on today and today's push on Thursday — but the owner said
 * today's plan shifts to the NEXT day, and everything behind it walks forward
 * one place. That is an insert, and the difference is the whole point of a
 * split: the order IS the training. A swap puts the same body part twice in
 * three days and leaves a hole where it came from; lifting the day out and
 * closing the gap keeps every muscle in its turn, one session later.
 */

const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-07', daysPerWeek: 5, level: 'intermediate', mode: 'strength',
  bodyGoal: 'buildMuscle', equipment: ['dumbbells', 'bench', 'mat'], conditions: [], seed: 'citizen-1', cycle: 0,
};

/** What the button does, in the two day numbers the service computes from. */
const moveTo = (input: ProgrammeInput, todayIndex: number, wantedIndex: number): ProgrammeMove[] => {
  const month = buildProgramme(input);
  const anchor = month.days.find((d) => d.index >= todayIndex && d.kind === 'strength')!;
  return [...(input.moves ?? []), { from: wantedIndex, to: anchor.index }];
};

const sessions = (p: ReturnType<typeof buildProgramme>) => p.days.filter((d) => d.kind === 'strength').map((d) => d.title);

describe('a citizen who has never moved a day', () => {
  it('gets exactly the month the calendar laid out', () => {
    /* THE FLOOR. Every assertion below is about a citizen who HAS pressed the
       button; this one is about everybody who never will. */
    const before = buildProgramme(BASE);
    const after = buildProgramme({ ...BASE, moves: [] });
    expect(after.days.map((d) => d.title)).toEqual(before.days.map((d) => d.title));
    expect(applyMoves([0, 1, 2, 3, 4], 5, undefined)).toEqual([0, 1, 2, 3, 4]);
    expect(applyMoves([0, 1, 2, 3, 4], 5, [])).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('moving a later day to today', () => {
  it('puts that day’s session on today', () => {
    const before = buildProgramme(BASE);
    const wanted = before.days[2].title;
    expect(before.days[0].title).not.toBe(wanted);
    const after = buildProgramme({ ...BASE, moves: moveTo(BASE, 0, 2) });
    expect(after.days[0].title).toBe(wanted);
  });

  it('shifts today’s plan to the next training day', () => {
    /* The owner's own sentence, as an assertion: "today's plan shifts to the
       next day". Not dropped, not doubled — one session later. */
    const before = buildProgramme(BASE);
    const wasToday = before.days[0].title;
    const after = buildProgramme({ ...BASE, moves: moveTo(BASE, 0, 2) });
    const next = after.days.find((d) => d.index > 0 && d.kind === 'strength')!;
    expect(next.title).toBe(wasToday);
  });

  it('walks the days in between forward rather than swapping two days', () => {
    /* An insert, exactly: the queue of sessions with one lifted out and put at
       the front. Everything between runs a session later; everything after the
       day that moved is where it always was. */
    const before = buildProgramme(BASE);
    const after = buildProgramme({ ...BASE, moves: moveTo(BASE, 0, 2) });
    const expected = sessions(before);
    expected.unshift(expected.splice(2, 1)[0]);
    expect(sessions(after)).toEqual(expected);
    /* And no body part lands twice in a week, which is what a swap costs. */
    const week1 = sessions(after).slice(0, 5);
    expect(new Set(week1).size).toBe(week1.length);
  });

  it('leaves the days the citizen kept for themselves alone', () => {
    /* The button moves the SPLIT, never the calendar. A rest day is somebody's
       Sunday lunch, and a workout button is not a reason to take it. */
    const input: ProgrammeInput = { ...BASE, daysPerWeek: 4, restDays: [2, 6] };
    const before = buildProgramme(input);
    const after = buildProgramme({ ...input, moves: moveTo(input, 0, 3) });
    expect(after.days.map((d) => d.kind)).toEqual(before.days.map((d) => d.kind));
    expect(after.days.map((d) => d.date)).toEqual(before.days.map((d) => d.date));
  });

  it('anchors on the next training day when today is a day off', () => {
    /* A citizen who opens their month on a rest day and asks for legs is
       asking for their NEXT session to be legs. The rest day stays a rest day
       and the move lands after it. */
    const input: ProgrammeInput = { ...BASE, daysPerWeek: 4, restDays: [0, 6] };
    const month = buildProgramme(input);
    expect(month.days[0].kind).toBe('rest');
    const moves = moveTo(input, 0, 3);
    expect(moves[0].to).toBe(1);
    const after = buildProgramme({ ...input, moves });
    expect(after.days[0].kind).toBe('rest');
    expect(after.days[1].title).toBe(month.days[3].title);
  });

  it('takes a second move on top of the first', () => {
    /* Two presses are two moves, applied in the order they were made — the
       second does not quietly undo the first. */
    const one = moveTo(BASE, 0, 2);
    const after1 = buildProgramme({ ...BASE, moves: one });
    const two = moveTo({ ...BASE, moves: one }, 7, 9);
    const after2 = buildProgramme({ ...BASE, moves: two });
    expect(after2.days[0].title).toBe(after1.days[0].title);
    expect(after2.days[7].title).toBe(after1.days[9].title);
  });
});

describe('the column the moves are stored in', () => {
  it('reads back what it wrote, for the cycle it was written in', () => {
    const m: ProgrammeMove[] = [{ from: 11, to: 4 }, { from: 20, to: 11 }];
    expect(writeMoves(3, m)).toBe('3|11-4,20-11');
    expect(readMoves('3|11-4,20-11', 3)).toEqual(m);
  });

  it('drops the moves once the month has rolled', () => {
    /* Day indices are cycle-relative. Last month's day 4 is not this month's,
       and applying one to the other is a plan nobody asked for. */
    expect(readMoves('3|11-4', 4)).toEqual([]);
    expect(writeMoves(4, [])).toBe('4|');
  });

  it('reads a malformed column as no moves rather than throwing', () => {
    /* One bad row must not take a citizen's whole month down with it. */
    expect(readMoves(null, 0)).toEqual([]);
    expect(readMoves('', 0)).toEqual([]);
    expect(readMoves('0|nonsense', 0)).toEqual([]);
    expect(readMoves('0|4-4,99-1', 0)).toEqual([]);
  });

  it('skips a move whose days are no longer training days', () => {
    /* The citizen moved a day and then gave that weekday to their own life.
       A stale move must not cost somebody their month. */
    expect(applyMoves([0, 1, 3, 4], 4, [{ from: 2, to: 0 }])).toEqual([0, 1, 2, 3]);
  });
});
