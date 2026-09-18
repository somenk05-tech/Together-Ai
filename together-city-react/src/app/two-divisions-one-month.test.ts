import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dateSpan, monthOf } from '@/features/fitness/division.api';
import type { Programme } from '@/features/fitness/api';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── TWO DIVISIONS, ONE MONTH ────────────────────────────────────────────────
 *
 * Owner, 18 Sep: "Create two sets of workout divisions from the existing
 * database and rechange the layout accordingly to the image." The month is
 * four rows now — the week on the left, seven cards across — with a Gym /
 * Home choice above it that both plans are built for every day.
 */
describe('the layout', () => {
  const page = code('features/fitness/pages/Workout.tsx');

  it('draws the month a week to a row, with the week\'s name, line and dates on the left', () => {
    expect(page).toMatch(/<ol className="wm-weeks" aria-label="The four weeks">/);
    expect(page).toMatch(/monthOf\(month\)\.weeks\.map\(\(w\) => \(/);
    expect(page).toMatch(/<div className="wm-week-name">\{w\.label\}<\/div>/);
    expect(page).toMatch(/\{dateSpan\(w\.from, w\.to\)\}/);
    expect(page).toMatch(/month\.days\.filter\(\(d\) => d\.week === w\.week\)\.map/);
  });

  it('keeps every day a door — the same key as before, wearing the card', () => {
    /* The 9 Sep key: a button, toggled, today ringed, done ticked. */
    expect(page).toMatch(/className=\{\['wk-month-key'/);
    expect(page).toMatch(/aria-current=\{d\.index === openDay \? 'true' : undefined\}/);
    expect(page).toMatch(/d\.kind === 'strength' && d\.exercises\[0\]\?\.thumb/);
    expect(page).toMatch(/<img className="wm-pic" src=\{d\.exercises\[0\]\.thumb\} alt="" loading="lazy" \/>/);
    expect(page).toMatch(/`\$\{d\.exercises\.length\} exercises`/);
    expect(page).toMatch(/\?\? d\.cardioMinutes\} min/);
    /* The catalogue's pictures carry their attribution wherever they go. */
    expect(page).toMatch(/<p className="muted wm-credit">\{EXERCISE_MEDIA_ATTRIBUTION\}/);
  });

  it('offers the gym plan and the home plan as one choice, and a way to adjust the profile', () => {
    expect(page).toMatch(/aria-label="Which plan to follow"/);
    expect(page).toMatch(/choosePlace\.mutate\(\{ place: k \}\)/);
    expect(page).toMatch(/<Link to="\/fitness\/profile" className="btn btn-line btn-sm wm-adjust">Adjust plan<\/Link>/);
    expect(page).toMatch(/\{monthOf\(month\)\.division\?\.name \?\? 'Your month'\}/);
  });

  it('prints no trainer\'s name', () => {
    expect(read('features/fitness/pages/Workout.tsx')).not.toMatch(/centr|zocchi|hemsworth|itsines|kayla|wicks|michaels/i);
    expect(read('features/fitness/division.api.ts')).not.toMatch(/centr|zocchi|hemsworth|itsines|kayla|wicks|michaels/i);
  });

  it('brings its stylesheet in, drawn with tokens only', () => {
    expect(code('main.tsx')).toMatch(/import '\.\/styles\/workout-month\.css';/);
    const css = read('styles/workout-month.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).not.toMatch(/border-radius:\s*[0-9.]+px/);
    expect(css).not.toMatch(/font-size:\s*[0-9.]+px/);
    for (const m of css.matchAll(/max-width:\s*(\d+)px\)/g)) expect([560, 899, 1100]).toContain(Number(m[1]));
  });
});

describe('the choice', () => {
  const api = code('features/fitness/division.api.ts');

  it('is written through its own unmetered route and redraws the month from the answer', () => {
    expect(api).toMatch(/api\.put<Programme>\('\/fitness\/programme\/place', input\)/);
    expect(api).toMatch(/qc\.setQueryData\(\['fitness', 'programme'\], month\)/);
    expect(api).toMatch(/invalidateQueries\(\{ queryKey: \['fitness', 'session'\] \}\)/);
    expect(api).toMatch(/invalidateQueries\(\{ queryKey: \['fitness', 'profile'\] \}\)/);
  });

  it('reads a month built before the divisions without falling over', () => {
    const old = {
      startDate: '2026-09-07', today: '2026-09-18', todayIndex: 11, cycle: 0, daysPerWeek: 4, splitName: 'Upper / Lower', splitDays: 4,
      phases: [{ key: 'base', label: 'Base', note: 'Learn.' }, { key: 'build', label: 'Build', note: 'Build.' }, { key: 'peak', label: 'Peak', note: 'Peak.' }, { key: 'deload', label: 'Deload', note: 'Ease.' }],
      days: Array.from({ length: 28 }, (_, i) => ({ index: i, date: `2026-09-${String(7 + i).padStart(2, '0')}`, week: (Math.floor(i / 7) + 1) as 1 | 2 | 3 | 4, phase: 'base' as const, kind: 'rest' as const, title: 'Rest', parts: 'recovery', muscles: [], exercises: [], cardioMinutes: 20, note: '', done: false })),
      why: [], rest: { days: [], activity: 'rest', label: '', chosen: false, advice: [] },
    } as unknown as Programme;
    const m = monthOf(old);
    expect(m.division).toBeNull();
    expect(m.weeks.map((w) => w.label)).toEqual(['Base', 'Build', 'Peak', 'Deload']);
    expect(m.weeks[0]).toMatchObject({ week: 1, from: '2026-09-07', to: '2026-09-13' });
  });

  it('prints a week\'s dates the way the reference does', () => {
    expect(dateSpan('2026-09-07', '2026-09-13')).toBe('7 – 13 Sep 2026');
    expect(dateSpan('2026-09-28', '2026-10-04')).toBe('28 Sep – 4 Oct 2026');
  });
});
