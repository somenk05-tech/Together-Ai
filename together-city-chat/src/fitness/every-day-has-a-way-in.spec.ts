import { readFileSync } from 'fs';
import { join } from 'path';
import { buildProgramme, seeded, type ProgrammeInput } from './programme-engine';
import { coolDownFor, warmUpFor } from './warm-up-and-cool-down';

/**
 * ── EVERY DAY HAS A WAY IN AND A WAY OUT (owner, 18 Sep) ────────────────────
 *
 * "Add the warm up and rest workouts too each day, and make it detailed."
 * And, from a man shown the women's library: "show only men workouts for
 * men."
 */
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');

const BASE: ProgrammeInput = {
  startDate: '2026-09-07', today: '2026-09-18', daysPerWeek: 5, level: 'intermediate', mode: 'mixed', bodyGoal: 'athletic',
  equipment: ['dumbbells', 'barbell', 'machines', 'bench', 'cardioMachine', 'mat'], conditions: [], seed: 'citizen-1', cycle: 0,
  place: 'gym', division: 'gym',
};

describe('the warm-up', () => {
  it('is movement for the joints the day will load, with its steps on every row', () => {
    const upper = warmUpFor(['pectorals', 'triceps'], 'strength');
    expect(upper.map((s) => s.id)).toEqual(['lib-march-in-place', 'lib-cat-cow', 'lib-shoulder-circles']);
    const lower = warmUpFor(['quads', 'glutes'], 'strength');
    expect(lower.map((s) => s.id)).toEqual(['lib-march-in-place', 'lib-cat-cow', 'lib-hip-opener']);
    const full = warmUpFor(['quads', 'pectorals'], 'strength');
    expect(full).toHaveLength(4);
    expect(warmUpFor([], 'cardio')).toHaveLength(4);
    for (const s of [...upper, ...lower]) {
      expect(s.seconds).toBeGreaterThan(0);
      expect(s.steps.length).toBeGreaterThan(0);
      expect(typeof s.video).toBe('string');
    }
    expect(upper[0].seconds).toBe(60);
  });

  it('is nothing on a day off', () => {
    expect(warmUpFor([], 'rest')).toEqual([]);
  });
});

describe('the cool-down', () => {
  it('stretches what the day worked, one per muscle, thirty seconds each, then the filmed closer', () => {
    const out = coolDownFor(['pectorals', 'lats', 'delts'], 'strength', seeded('x'));
    expect(out).toHaveLength(4);
    expect(out.slice(0, 3).map((s) => s.works)).toEqual(['pectorals', 'lats', 'delts']);
    expect(out.slice(0, 3).every((s) => /stretch/i.test(s.name) && s.seconds === 30 && s.steps.length > 0 && s.gif !== '')).toBe(true);
    expect(out[3].id).toBe('lib-chest-opener');
    const legs = coolDownFor(['quads', 'hamstrings'], 'strength', seeded('x'));
    expect(legs[legs.length - 1].id).toBe('lib-calf-stretch');
  });

  it('is the same on every open of the same day', () => {
    const a = coolDownFor(['glutes', 'quads'], 'strength', seeded('citizen-1:0:mobility:2')).map((s) => s.id);
    const b = coolDownFor(['glutes', 'quads'], 'strength', seeded('citizen-1:0:mobility:2')).map((s) => s.id);
    expect(a).toEqual(b);
  });

  it('on a day off is the rest workout: hips, hamstrings, chest, back, calves', () => {
    const off = coolDownFor([], 'rest', seeded('x'));
    expect(off.map((s) => s.works)).toEqual(['glutes', 'hamstrings', 'pectorals', 'lats', 'calves']);
    expect(off.every((s) => s.seconds === 30)).toBe(true);
  });
});

describe('the month carries both on every day', () => {
  it('a strength day has a warm-up and a cool-down; a day off has only the rest workout; a light day has both', () => {
    const p = buildProgramme({ ...BASE, restDays: [5, 6] });
    const work = p.days.find((d) => d.kind === 'strength')!;
    expect(work.warmup.length).toBeGreaterThanOrEqual(3);
    expect(work.cooldown.length).toBeGreaterThanOrEqual(2);
    const off = p.days.find((d) => d.kind === 'rest')!;
    expect(off.warmup).toEqual([]);
    expect(off.cooldown).toHaveLength(5);
    expect(off.exercises).toEqual([]);
    const light = buildProgramme({ ...BASE, daysPerWeek: 6, restDays: [5, 6] }).days[5];
    expect(light.kind).toBe('cardio');
    expect(light.warmup).toHaveLength(4);
    expect(light.cooldown).toHaveLength(5);
  });

  it('is seeded beside the working sets, so the day reads the same twice', () => {
    const a = buildProgramme(BASE).days.map((d) => d.cooldown.map((s) => s.id).join(','));
    const b = buildProgramme(BASE).days.map((d) => d.cooldown.map((s) => s.id).join(','));
    expect(a).toEqual(b);
    expect(read('programme-engine.ts')).toMatch(/seeded\(`\$\{input\.seed\}:\$\{input\.cycle\}:mobility:\$\{i\}`\)/);
  });
});

describe('a man reads the men\'s library', () => {
  it('falls back to the Training Profile\'s sex when the identity question was never answered', () => {
    const grade = read('library/exercise-grade.ts');
    expect(grade).toMatch(/sex\?: string \| null/);
    const svc = read('library/library.service.ts');
    expect(svc).toMatch(/sex: true/);
    expect(svc).toMatch(/profile\?\.sex/);
  });
});
