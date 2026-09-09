import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old line as the thing they exist to correct. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── THE DAY YOU MOVE TO TODAY ───────────────────────────────────────────────
 *
 * Owner, 9 Sep: "Have an 'update to today's workout plan' button, and that
 * goes to today's workout plan, and then today's plan shifts to the next day."
 *
 * The month already let a citizen open Saturday's legs day on a Thursday and
 * run it — 'Do it early'. What it could not do was CHANGE THE PLAN: the grid
 * went back to saying Thursday was push the moment you closed the day. This
 * button is the other question, and the page has to make the difference
 * legible before it is pressed, because the month redraws underneath it.
 */
describe('the button that moves a day', () => {
  const page = code('features/fitness/pages/Workout.tsx');

  it('is on the opened day, in the owner\'s words', () => {
    expect(page).toMatch(/Update today\\u2019s workout plan/);
    expect(page).toMatch(/moveDay\.mutate\(shown\.index/);
  });

  it('stands beside "Do it early" rather than replacing it', () => {
    /* Different questions: one runs a session now and leaves the month alone,
       the other moves the month. A citizen who wanted the first and got the
       second has had their plan rewritten by a button they misread. */
    expect(page).toMatch(/'Do it early'/);
    expect(page).toMatch(/onClick=\{\(\) => startDay\(shown\)\}/);
  });

  it('says what the press will do before it is pressed', () => {
    expect(page).toMatch(/shifts to your next training day/);
    expect(page).toMatch(/wk-day-move/);
  });

  it('never offers to move a day onto the same session', () => {
    /* Legs onto legs is a press that appears to do nothing, which reads as a
       broken button rather than as a plan that was already right. */
    expect(page).toMatch(/shown\.slot !== anchor\.slot/);
  });

  it('anchors on the next training day, so a rest day stays the citizen\'s', () => {
    expect(page).toMatch(/d\.index >= month\.todayIndex && d\.kind === 'strength'/);
    expect(page).toMatch(/Make this your next session/);
  });

  it('says so when the move did not reach the server', () => {
    /* The month on screen is then the old one, and a citizen who believes
       otherwise trains the wrong body part tomorrow. */
    expect(page).toMatch(/moveDay\.isError/);
    expect(page).toMatch(/your month is unchanged/);
  });
});

describe('the wire the button writes on', () => {
  const api = code('features/fitness/api.ts');

  it('has its own unmetered route, like the week beside it', () => {
    /* Five profile changes a month then ₹50 — and a control the owner wants
       pressed must never be one a citizen is charged for pressing. */
    expect(api).toMatch(/'\/fitness\/programme\/today'/);
    expect(api).toMatch(/export function useMoveWorkoutDay\(\)/);
  });

  it('redraws the whole month from the answer', () => {
    /* The move changes every training day after it, so patching one day on
       the client would put a lie on the grid. */
    expect(api).toMatch(/qc\.setQueryData\(\['fitness', 'programme'\], p\)/);
    expect(api).toMatch(/invalidateQueries\(\{ queryKey: \['fitness', 'session'\] \}\)/);
  });
});
