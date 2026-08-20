import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * A WEEK THAT DOES NOT SAY WHAT IT TRAINS IS NOT A PLAN.
 *
 * The Fitness hub had a seven-day plan and a daily workout, and they were
 * strangers. The plan named body parts in exactly one of its four modes, so a
 * citizen on the default `mixed` read "Full-body strength" four times — the
 * same sentence, four days, no way to tell Tuesday from Thursday. And the
 * Workout page built its session independently: the plan could say "Pull" while
 * the page opened with squats, and nothing in the application would have shown
 * the two disagreeing.
 *
 * Both halves are guarded here, on the SURFACES, because the engines have their
 * own specs and what this file is for is the join: the type that carries the
 * day across, and the two pages that print it.
 */
describe('the week names what it trains, and today follows it', () => {
  const api = strip(read('src/features/fitness/api.ts'));
  const plan = strip(read('src/features/fitness/pages/Plan.tsx'));
  const workout = strip(read('src/features/fitness/pages/Workout.tsx'));

  it('carries what a day trains all the way to the page', () => {
    // `patterns` is the contract between the two engines and is typed here so
    // it cannot be quietly dropped from the payload; `trains` is what a human
    // reads. Losing either is how the two halves drift apart again.
    expect(api).toMatch(/trains: string\[\]/);
    expect(api).toMatch(/patterns: string\[\]/);
  });

  it('prints the day’s muscles on the row, not only its focus', () => {
    expect(plan).toMatch(/s\.trains/);
    expect(plan).toMatch(/s\.trains\.join\(/);
  });

  it('says recovery on a rest day rather than nothing', () => {
    // A blank Sunday reads as the plan having run out.
    expect(plan).toMatch(/s\.kind === 'recovery' \? 'Recovery'/);
  });

  it('tells the citizen what actually makes the plan change', () => {
    // The page may promise evolution only in the terms the code keeps: the
    // profile and the log. It must NOT claim a weekly check-in loop that is
    // not built — the honest sentence is the one that can be pointed at.
    expect(plan).toMatch(/\/fitness\/log/);
    expect(plan).toMatch(/\/fitness\/profile/);
    expect(plan).toMatch(/not a fixed programme/);
    expect(plan).not.toMatch(/check-in|check in/i);
  });

  it('carries the day into the session’s explanation', () => {
    expect(api).toMatch(/day: string \| null/);
    expect(workout).toMatch(/session\.why\.day/);
  });

  it('leaves the Workout page building nothing of its own', () => {
    // The rule the-session-is-built-not-looked-up set, restated because this
    // change was the first thing in months with a reason to break it: naming
    // the day is a thing the SERVER said, printed here.
    expect(workout).not.toMatch(/const SPLITS|splitFor|patterns:\s*\[/);
  });
});
