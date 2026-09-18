import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── EVERY DAY HAS A WAY IN AND A WAY OUT ────────────────────────────────────
 *
 * Owner, 18 Sep: "add the warm up and rest workouts too each day, and make it
 * detailed" — and, of the Workout Library: "your plan save day does not work,
 * also let it scroll down if the workout is too much."
 */
describe('the day\'s page: warm-up before the work, cool-down after it', () => {
  const page = code('features/fitness/pages/WorkoutDay.tsx');
  const raw = read('features/fitness/pages/WorkoutDay.tsx');

  it('draws the warm-up above the work and the cool-down under it, each row a fold with its seconds, steps and picture', () => {
    expect(raw.indexOf('id="wd-warm-h"')).toBeLessThan(raw.indexOf('THE DAY, WHOLE'));
    expect(raw.indexOf('THE DAY, WHOLE')).toBeLessThan(raw.indexOf('id="wd-cool-h"'));
    expect(raw.indexOf('id="wd-cool-h"')).toBeLessThan(raw.indexOf('SEARCH, AND ADD TO THE DAY'));
    expect(page).toMatch(/function MobilityList\(/);
    expect(page).toMatch(/<span className="wd-tg">\{s\.seconds\}s<\/span>/);
    expect(page).toMatch(/<ol className="wl-steps">\{s\.steps\.map/);
    expect(page).toMatch(/How it is done · \{s\.seconds\} seconds/);
    expect(page).toMatch(/<video className="wl-film-v" src=\{s\.video\}/);
  });

  it('calls the day off\'s routine the rest workout, and starts it from the same button', () => {
    expect(page).toMatch(/title=\{day\.kind === 'rest' \? 'The rest workout' : 'Cool-down'\}/);
    expect(page).toMatch(/\{\(day\.exercises\.length > 0 \|\| cooldown\.length > 0\) && \(/);
    expect(page).toMatch(/'Start the rest workout'/);
  });

  it('the runner counts the warm-up first and the cool-down last', () => {
    const workout = code('features/fitness/pages/Workout.tsx');
    expect(workout.indexOf("block: 'Warm-up'")).toBeLessThan(workout.indexOf('for (const ex of day.exercises)'));
    expect(workout.indexOf("block: 'Cool-down'")).toBeGreaterThan(workout.indexOf('for (const ex of day.exercises)'));
    expect(code('features/fitness/day.api.ts')).toMatch(/export interface MobilityStep \{ id: string; name: string; works: string; seconds: number; steps: string\[\]; thumb: string; gif: string; video: string \}/);
  });
});

describe('the Workout Library saves a day, and its panel scrolls', () => {
  const page = code('features/fitness/pages/Library.tsx');
  const css = read('styles/workout-library.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('needs one movement to save, not a name — a nameless plan is My day or My week', () => {
    expect(page).toMatch(/const canSave = count\(draft\) > 0 && !save\.isPending;/);
    expect(page).toMatch(/name: draft\.name\.trim\(\) \|\| \(draft\.kind === 'day' \? 'My day' : 'My week'\)/);
    expect(page).toMatch(/Name <span className="muted">\(optional\)<\/span>/);
  });

  it('pins the panel and scrolls inside it, with Save held at the foot', () => {
    expect(css).toMatch(/\.wl-side \{[^}]*max-height: calc\(100vh - var\(--header-h\) - 32px\); overflow-y: auto;/);
    expect(css).toMatch(/\.wl-builder-acts \{ position: sticky; bottom: 0; background: var\(--card\);/);
    expect(css).toMatch(/\.wl-side \{ position: static; max-height: none; overflow: visible; \}/);
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
  });
});
