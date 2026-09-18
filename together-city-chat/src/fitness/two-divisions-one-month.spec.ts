import { readFileSync } from 'fs';
import { join } from 'path';
import { DIVISIONS, buildProgramme, isLoaded, type ProgrammeInput } from './programme-engine';

/**
 * ── TWO DIVISIONS, ONE MONTH (owner, 18 Sep) ────────────────────────────────
 *
 * "Create two sets of workout divisions from the existing database and
 * rechange the layout accordingly to the image — make sure the workouts are
 * based on a celebrity trainer."
 *
 * What has to stay true: both divisions are whole weeks, every session is
 * built from the catalogue by the same rules as before, the gym division is
 * loaded work and the home division is what the citizen has, the light day
 * is light, the citizen's own rest days still win, and no trainer's name is
 * printed anywhere a citizen reads.
 */
const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-18', daysPerWeek: 6, level: 'intermediate', mode: 'mixed', bodyGoal: 'athletic',
  equipment: [], conditions: [], seed: 'citizen-1', cycle: 0,
};
const GYM: ProgrammeInput = { ...BASE, place: 'gym', division: 'gym', equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'] };
const HOME: ProgrammeInput = { ...BASE, place: 'home', division: 'home', equipment: [] };
const week1 = (p: ReturnType<typeof buildProgramme>) => p.days.slice(0, 7);

describe('the two divisions', () => {
  it('are each a week of six sessions with one or two light days, and leave Thursday off by default', () => {
    for (const d of Object.values(DIVISIONS)) {
      expect(d.days).toHaveLength(6);
      expect(d.days.filter((x) => x.light).length).toBeGreaterThanOrEqual(1);
      expect(d.days.filter((x) => x.light).length).toBeLessThanOrEqual(2);
      expect(d.placement).toEqual([0, 1, 2, 4, 5, 6]);
      expect(d.weeks).toHaveLength(4);
      for (const x of d.days) expect(x.minutes).toBeGreaterThan(0);
    }
  });

  it('lay the gym week out as chest, back, legs, rest, shoulders, arms, conditioning', () => {
    expect(week1(buildProgramme(GYM)).map((d) => d.title)).toEqual(['Chest + Triceps', 'Back + Biceps', 'Legs', 'Rest', 'Shoulders + Traps', 'Arms', 'Conditioning']);
  });

  it('lay the home week out as full body, upper, lower, rest, core, yoga, active recovery', () => {
    expect(week1(buildProgramme(HOME)).map((d) => d.title)).toEqual(['Full body', 'Upper body', 'Lower body', 'Rest', 'Core', 'Yoga', 'Active recovery']);
  });

  it('build every gym session on loaded kit and every home session on what the citizen has', () => {
    for (const d of buildProgramme(GYM).days.filter((x) => x.kind === 'strength')) {
      expect(d.exercises.length).toBeGreaterThanOrEqual(4);
      expect(d.exercises.filter((e) => !isLoaded(e.equipment)).length).toBeLessThanOrEqual(1);
    }
    for (const d of buildProgramme(HOME).days.filter((x) => x.kind === 'strength')) {
      expect(d.exercises.length).toBeGreaterThanOrEqual(4);
      for (const e of d.exercises) expect(e.equipment).toBe('body weight');
    }
  });

  it('give the light day a length and a note and no working sets, and every day a length', () => {
    const p = buildProgramme(GYM);
    const light = p.days.find((d) => d.title === 'Conditioning')!;
    expect(light.kind).toBe('cardio');
    expect(light.exercises).toEqual([]);
    expect(light.minutes).toBe(25);
    expect(light.note).toMatch(/treadmill/);
    for (const d of p.days) expect(d.minutes).toBeGreaterThan(0);
    expect(p.days[0].minutes).toBe(45);
    expect(p.days[2].minutes).toBe(50);
  });

  it('name the four weeks the division\'s way and date them', () => {
    const g = buildProgramme(GYM), h = buildProgramme(HOME);
    expect(g.weeks.map((w) => w.label)).toEqual(['Build strength', 'Progress', 'Build more', 'Consolidate']);
    expect(h.weeks.map((w) => w.label)).toEqual(['Build movement', 'Build strength', 'Build endurance', 'Feel your best']);
    expect(g.weeks[0]).toMatchObject({ week: 1, from: '2026-09-07', to: '2026-09-13' });
    expect(g.weeks[3]).toMatchObject({ week: 4, from: '2026-09-28', to: '2026-10-04' });
    expect(g.phases.map((p) => p.label)).toEqual(['Build strength', 'Progress', 'Build more', 'Consolidate']);
    /* The numbers under the names are still PHASES': the peak week is heavier. */
    expect(g.phases[2].reps).toBe('low');
  });

  it('say which division the month is, in the words the page prints', () => {
    expect(buildProgramme(GYM).division).toEqual({ key: 'gym', name: 'Your customised gym plan', tag: DIVISIONS.gym.tag, splitName: DIVISIONS.gym.splitName });
    expect(buildProgramme(HOME).division?.name).toBe('Your customised home workout plan');
    expect(buildProgramme(BASE).division).toBeNull();
  });

  it('still let the citizen\'s own days off win', () => {
    const p = buildProgramme({ ...GYM, restDays: [5, 6] });
    const w = week1(p);
    expect(w[5].kind).toBe('rest');
    expect(w[6].kind).toBe('rest');
    /* Five days left, six sessions: the rotation runs on into week two rather
       than dropping a session on the floor. */
    expect(w.filter((d) => d.kind !== 'rest')).toHaveLength(5);
    expect(p.days[7].title).toBe('Conditioning');
  });

  it('leave a month built without a division exactly as it was', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 4 });
    expect(p.splitName).toBe('Upper / Lower');
    expect(p.division).toBeNull();
    expect(p.weeks.map((w) => w.label)).toEqual(['Base', 'Build', 'Peak', 'Deload']);
  });

  it('print no trainer\'s name anywhere a citizen reads', () => {
    const words = JSON.stringify(Object.values(DIVISIONS).map((d) => ({ name: d.name, tag: d.tag, splitName: d.splitName, days: d.days.map((x) => [x.title, x.parts, x.light?.note]), weeks: d.weeks })));
    expect(words).not.toMatch(/centr|zocchi|hemsworth|itsines|kayla|wicks|michaels/i);
    const page = readFileSync(join(__dirname, '..', '..', '..', 'together-city-react', 'src', 'features', 'fitness', 'pages', 'Workout.tsx'), 'utf8');
    expect(page).not.toMatch(/centr|zocchi|hemsworth|itsines|kayla|wicks|michaels/i);
  });
});
