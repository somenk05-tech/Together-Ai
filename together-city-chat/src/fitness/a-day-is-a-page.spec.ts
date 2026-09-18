import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProgramme, type ProgrammeInput } from './programme-engine';
import { AddToDaySchema, ADDITIONS_PER_DAY } from './dto/fitness.dto';

/**
 * ── A DAY IS A PAGE, AND THE SIXTH DAY (owner, 18 Sep) ──────────────────────
 *
 * "When someone clicks on the day it should open the day on a new page with
 * that day's complete workout, and below each workout day page add search
 * and add workout to the day." And: "if someone wants to work out for 6
 * days, add the 6th day workout."
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-18', daysPerWeek: 6, level: 'intermediate', mode: 'mixed', bodyGoal: 'athletic',
  equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'], conditions: [], seed: 'citizen-1', cycle: 0,
  place: 'gym', division: 'gym',
};
const week1 = (p: ReturnType<typeof buildProgramme>) => p.days.slice(0, 7);

describe('the sixth day', () => {
  it('is the division\'s light session on the first day the citizen kept, when six were asked and two kept', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 6, restDays: [5, 6] });
    const w = week1(p);
    expect(w.map((d) => d.title)).toEqual(['Chest + Triceps', 'Back + Biceps', 'Legs', 'Shoulders + Traps', 'Arms', 'Conditioning', 'Rest']);
    expect(w[5].kind).toBe('cardio');
    expect(w[5].minutes).toBe(25);
    expect(w[6].kind).toBe('rest');
    /* Six days a week, as asked — and the hard five rotate on the five free
       days, so week two opens on chest again rather than on conditioning. */
    expect(w.filter((d) => d.kind !== 'rest')).toHaveLength(6);
    expect(p.days[7].title).toBe('Chest + Triceps');
    expect(p.rest.advice.join(' ')).toMatch(/the sixth is conditioning on Saturday/);
  });

  it('at home, puts yoga on the first kept day and leaves the second as the day off', () => {
    const p = buildProgramme({ ...BASE, place: 'home', division: 'home', equipment: [], daysPerWeek: 6, restDays: [5, 6] });
    const w = week1(p);
    expect(w[5].title).toBe('Yoga');
    expect(w[6].kind).toBe('rest');
    expect(w.filter((d) => d.kind === 'strength')).toHaveLength(5);
  });

  it('changes nothing when the citizen asked for what they kept', () => {
    const p = buildProgramme({ ...BASE, daysPerWeek: 5, restDays: [5, 6] });
    const w = week1(p);
    expect(w[5].kind).toBe('rest');
    expect(w[6].kind).toBe('rest');
    expect(w.filter((d) => d.kind !== 'rest')).toHaveLength(5);
    /* No days named: the division's own week stands, Thursday off. */
    const own = buildProgramme({ ...BASE, daysPerWeek: 6 });
    expect(week1(own).map((d) => d.kind)).toEqual(['strength', 'strength', 'strength', 'rest', 'strength', 'strength', 'cardio']);
  });
});

describe('what the citizen adds to a day', () => {
  it('is a catalogue id with their own sets and reps, and nothing else', () => {
    expect(AddToDaySchema.safeParse({ exerciseId: '0001', sets: 3, reps: 10 }).success).toBe(true);
    expect(AddToDaySchema.safeParse({ exerciseId: 'bw-squat', sets: 3, reps: 10 }).success).toBe(false);
    expect(AddToDaySchema.safeParse({ exerciseId: '0001', sets: 0, reps: 10 }).success).toBe(false);
    expect(AddToDaySchema.safeParse({ exerciseId: '0001', sets: 3, reps: 500 }).success).toBe(false);
    expect(ADDITIONS_PER_DAY).toBe(10);
  });

  it('is merged into the day after the build, read for this cycle, and taken off by its owner only', () => {
    const svc = code(read('fitness.service.ts'));
    expect(svc).toMatch(/programmeAddition\.findMany\(\{\s*where: \{ userId, cycle \}/);
    expect(svc).toMatch(/take: 28 \* ADDITIONS_PER_DAY/);
    expect(svc).toMatch(/exercises: \[\.\.\.d\.exercises, \.\.\.mine\]/);
    expect(svc).toMatch(/additionId: x\.id/);
    expect(svc).toMatch(/programmeAddition\.deleteMany\(\{ where: \{ id, userId \} \}/);
    expect(svc).toMatch(/if \(have >= ADDITIONS_PER_DAY\) throw/);
    /* The id is checked against the catalogue before anything is written. */
    expect(svc.indexOf("if (!catalogById(dto.exerciseId))")).toBeLessThan(svc.indexOf('programmeAddition.create'));
  });

  it('has two routes on the workout room, and the engine carries the mark for a movement that is the citizen\'s', () => {
    const ctrl = code(read('fitness.controller.ts'));
    expect(ctrl).toMatch(/@Post\('programme\/day\/:index\/add'\)/);
    expect(ctrl).toMatch(/@Delete\('programme\/day\/:index\/add\/:id'\)/);
    expect(code(read('programme-engine.ts'))).toMatch(/additionId\?: string;/);
  });
});
