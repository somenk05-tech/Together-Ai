import { EXERCISE_CATALOG } from './exercise-catalog';
import { buildProgramme, kitAvailable, poolFor, SPLITS, type ProgrammeInput } from './programme-engine';

/**
 * A MONTH WITH A TRAINER — owner, 6 Sep: "an experienced personal trainer
 * making the plan for each user for one month, from all the exercises in the
 * database: which body part today, the workout, the next body part tomorrow,
 * all from the user's data."
 *
 * What a trainer would check on the whiteboard, checked here: the split fits
 * the days, hard days have rest between them, every muscle on the day is
 * worked with kit the citizen has, nothing a condition rules out is offered,
 * no movement repeats inside a week, the same movements come back two weeks
 * later so load can be added, the fourth week is lighter, and two citizens
 * with the same profile do not get the same month.
 */

const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-15', daysPerWeek: 4, level: 'intermediate', mode: 'strength',
  bodyGoal: 'buildMuscle', equipment: ['dumbbells', 'bench', 'mat'], conditions: [], seed: 'citizen-1', cycle: 0,
};

const strength = (p: ReturnType<typeof buildProgramme>) => p.days.filter((d) => d.kind === 'strength');

describe('the shape of the month', () => {
  it('is twenty-eight days, dated from day one, with today placed on it', () => {
    const p = buildProgramme(BASE);
    expect(p.days).toHaveLength(28);
    expect(p.days[0].date).toBe('2026-09-07');
    expect(p.days[27].date).toBe('2026-10-04');
    expect(p.todayIndex).toBe(8);
    expect(p.days.map((d) => d.week)).toEqual([...Array(28)].map((_, i) => Math.floor(i / 7) + 1));
  });

  it('gives a four-day week the upper/lower split, on Mon Tue Thu Fri, and rotates it', () => {
    const p = buildProgramme(BASE);
    const week1 = p.days.slice(0, 7);
    expect(week1.map((d) => d.kind)).toEqual(['strength', 'strength', 'rest', 'strength', 'strength', 'rest', 'rest']);
    expect(strength(p).slice(0, 8).map((d) => d.title)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B', 'Upper A', 'Lower A', 'Upper B', 'Lower B']);
    expect(p.splitName).toBe('Upper / Lower');
  });

  it('gives three days push / pull / legs with rest between, and six days the same twice over', () => {
    const three = buildProgramme({ ...BASE, daysPerWeek: 3 });
    expect(three.days.slice(0, 7).map((d) => d.kind)).toEqual(['strength', 'rest', 'strength', 'rest', 'strength', 'rest', 'rest']);
    expect(strength(three).slice(0, 3).map((d) => d.title)).toEqual(['Push', 'Pull', 'Legs']);
    const six = buildProgramme({ ...BASE, daysPerWeek: 6 });
    expect(strength(six).slice(0, 6).map((d) => d.title)).toEqual(['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B']);
  });

  it('names the body part in the citizen\'s words on every training day', () => {
    for (const d of strength(buildProgramme(BASE))) {
      expect(d.parts.length).toBeGreaterThan(5);
      expect(d.muscles.length).toBeGreaterThan(2);
      expect(d.exercises.every((e) => e.works.length > 2)).toBe(true);
    }
  });

  it('a walking month keeps two strength days and gives the road the rest; a mixed month alternates', () => {
    const walk = buildProgramme({ ...BASE, mode: 'walking', daysPerWeek: 4 });
    expect(walk.days.slice(0, 7).map((d) => d.kind)).toEqual(['strength', 'strength', 'rest', 'cardio', 'cardio', 'rest', 'rest']);
    expect(walk.days[3].title).toBe('Walk');
    const mixed = buildProgramme({ ...BASE, mode: 'mixed', daysPerWeek: 4 });
    expect(mixed.days.slice(0, 7).filter((d) => d.kind === 'strength')).toHaveLength(2);
    expect(mixed.days.slice(0, 7).filter((d) => d.kind === 'cardio')).toHaveLength(2);
  });
});

describe('what a day is made of', () => {
  it('uses only kit the citizen has, and never a stretch or a hold as a working set', () => {
    const p = buildProgramme(BASE);
    for (const d of strength(p)) for (const e of d.exercises) {
      expect({ name: e.name, ok: kitAvailable(e.equipment, BASE.equipment) }).toEqual({ name: e.name, ok: true });
      expect(e.name).not.toMatch(/stretch|pose/i);
      expect(e.steps.length).toBeGreaterThan(1);
    }
    // Bodyweight only, at home, is still a month.
    const bare = buildProgramme({ ...BASE, equipment: [] });
    for (const d of strength(bare)) {
      expect(d.exercises.length).toBeGreaterThanOrEqual(4);
      expect(d.exercises.every((e) => e.equipment === 'body weight')).toBe(true);
    }
  });

  it('at a gym the whole catalogue opens up', () => {
    const gym = poolFor(['dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'], []);
    const home = poolFor(['dumbbells', 'mat'], []);
    const size = (m: Map<string, unknown[]>) => [...m.values()].reduce((n, xs) => n + xs.length, 0);
    expect(size(gym)).toBeGreaterThan(size(home) * 1.5);
    expect(size(gym)).toBeGreaterThan(800);
  });

  it('leads with a big movement for the day\'s first muscles', () => {
    const p = buildProgramme({ ...BASE, equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'mat'] });
    for (const d of strength(p)) {
      expect(d.exercises[0].name).toMatch(/squat|deadlift|press|row|pull|lunge|dip|thrust|push-up|push up|step|split|clean/i);
    }
  });

  it('never repeats a movement inside a week, and never repeats one on the same day', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 6, equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'mat'] });
    for (let w = 0; w < 4; w++) {
      const ids = p.days.slice(w * 7, w * 7 + 7).flatMap((d) => d.exercises.map((e) => e.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps the same movements in weeks one and three, and two and four, so load can be added', () => {
    const p = buildProgramme(BASE);
    const names = (w: number) => p.days.slice(w * 7, w * 7 + 7).filter((d) => d.kind === 'strength').map((d) => d.exercises.map((e) => e.id).join(','));
    expect(names(0)).toEqual(names(2));
    expect(names(1)).toEqual(names(3));
    expect(names(0)).not.toEqual(names(1));
  });

  it('phases the month: base, build, peak, deload — with the deload lighter than the peak', () => {
    const p = buildProgramme(BASE);
    const first = (w: number) => strength(p).find((d) => d.week === w)!.exercises[0];
    expect(p.days.map((d) => d.phase).filter((v, i, a) => a.indexOf(v) === i)).toEqual(['base', 'build', 'peak', 'deload']);
    expect(first(2).sets).toBe(first(1).sets + 1);
    expect(first(3).reps[0]).toBeLessThan(first(2).reps[0]);
    expect(first(3).restSec).toBeGreaterThan(first(2).restSec);
    expect(first(4).sets).toBeLessThan(first(3).sets);
    expect(first(4).reps[1]).toBeGreaterThan(first(3).reps[1]);
    expect(strength(p).find((d) => d.week === 4)!.note).toMatch(/Lighter on purpose/);
  });
});

describe('what the citizen told us', () => {
  it('keeps a pregnant citizen off her back and off anything that jumps; joint pain off the plyometrics', () => {
    const preg = buildProgramme({ ...BASE, conditions: ['pregnancy'], equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'mat'] });
    for (const d of strength(preg)) for (const e of d.exercises) expect(e.name).not.toMatch(/jump|crunch|sit-up|lying|supine|decline/i);
    const joints = buildProgramme({ ...BASE, conditions: ['jointPain'], equipment: [] });
    for (const d of strength(joints)) for (const e of d.exercises) expect(e.name).not.toMatch(/jump|plyo|burpee|box jump|hop\b/i);
  });

  it('is the same month on every open, and a different month for a different citizen', () => {
    const a = buildProgramme(BASE), b = buildProgramme(BASE), c = buildProgramme({ ...BASE, seed: 'citizen-2' });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(strength(a)[0].exercises.map((e) => e.id)).not.toEqual(strength(c)[0].exercises.map((e) => e.id));
    // And the second cycle is not the first again.
    const next = buildProgramme({ ...BASE, cycle: 1 });
    expect(strength(next)[0].exercises.map((e) => e.id)).not.toEqual(strength(a)[0].exercises.map((e) => e.id));
  });

  it('says why, naming the days, the goal, the kit and the health it read', () => {
    const p = buildProgramme({ ...BASE, conditions: ['hypertension'] });
    expect(p.why.join(' ')).toMatch(/4 days a week/);
    expect(p.why.join(' ')).toMatch(/Upper \/ Lower/);
    expect(p.why.join(' ')).toMatch(new RegExp(`of the ${EXERCISE_CATALOG.length} in the catalogue`));
    expect(p.why.join(' ')).toMatch(/hypertension/);
  });

  it('every split works every one of its muscles somewhere in its rotation', () => {
    for (const [days, split] of Object.entries(SPLITS)) {
      const muscles = new Set(split.flatMap((d) => d.slots.map((s) => s.muscle)));
      for (const m of ['pectorals', 'lats', 'quads', 'hamstrings', 'glutes', 'delts', 'abs']) {
        expect({ days, m, worked: muscles.has(m as never) }).toEqual({ days, m, worked: true });
      }
    }
  });
});
