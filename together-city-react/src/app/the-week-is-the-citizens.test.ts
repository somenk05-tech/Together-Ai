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
 * ── THE WEEK IS THE CITIZEN'S, AND EVERY DAY IS A DOOR ──────────────────────
 *
 * Owner, 9 Sep: "Make this flexible and let user see past and future workouts.
 * Also let user decide which two days they want a break, or if they don't want
 * a break what they can do — maybe just a walk or run or swim, something else.
 * Act as a trainer consulting the user."
 *
 * Two failures in one screenshot. The twenty-eight tiles were a PICTURE of a
 * month — words on a grid with nothing behind them — so a citizen who wanted
 * to know what Thursday held had to wait until Thursday. And "Rest" sat on
 * days 6, 7, 13, 14, 20, 21, 27 and 28 because PLACEMENT put it there, on the
 * assumption that everybody's week ends where the calendar's does.
 */
describe('every day of the month is a door', () => {
  const page = code('features/fitness/pages/Workout.tsx');

  it('makes each tile a button that opens that day', () => {
    expect(page).toMatch(/className=\{\['wk-month-key'/);
    expect(page).toMatch(/onClick=\{\(\) => setOpenDay\(\(cur\) => \(cur === d\.index \? null : d\.index\)\)\}/);
    /* Pressing the open day again shuts it, so the key is a toggle rather
       than a one-way trip that needs a second control to undo. */
    expect(page).toMatch(/aria-pressed=\{d\.index === openDay\}/);
  });

  it('opens on today, and comes back to today tomorrow', () => {
    /* Null is TODAY, not "nothing shown". A citizen who read Thursday and
       came back the next morning should find their own day again. */
    expect(page).toMatch(/const \[openDay, setOpenDay\] = useState<number \| null>\(null\)/);
  });

  it('shows the day\'s real movements, not just its name', () => {
    expect(page).toMatch(/shown\.exercises\.map/);
    expect(page).toMatch(/\{ex\.sets\} × \{ex\.reps\[0\]\}–\{ex\.reps\[1\]\}/);
  });

  it('can run any day, and says which kind of day it is running', () => {
    expect(page).toMatch(/onClick=\{\(\) => startDay\(shown\)\}/);
    expect(page).toMatch(/'Start this day'/);
    expect(page).toMatch(/'Do it again'/);
    expect(page).toMatch(/'Do it early'/);
  });

  it('logs the day it was really done on, not the day on the tile', () => {
    /* `finish` writes against dayKey() — the real date — and nothing in the
       new path touches that. Backdating a log so a grid looks tidier is the
       history lying to the engine that reads it back. */
    expect(page).toMatch(/setLog\(\(l\) => \(\{ \.\.\.l, \[dayKey\(\)\]/);
    expect(page).not.toMatch(/dayKey\(new Date\(shown/);
  });

  it('gives a run-from-the-month no walk it has not earned', () => {
    /* Today's session earns a walk from the citizen's activity goal. A
       Thursday opened on a Tuesday has not, and tacking one on would inflate
       the burn figure the whole page is built around. */
    const fn = page.slice(page.indexOf('function stepsFromDay'), page.indexOf('const walkStepOf'));
    expect(fn).not.toMatch(/walkStepOf/);
  });
});

describe('the citizen says which days are theirs', () => {
  const page = code('features/fitness/pages/Workout.tsx');
  const profile = code('features/fitness/pages/Profile.tsx');

  it('asks on the month card, right under the grid', () => {
    /* The consequence of the choice is the thing directly above the keys:
       press Wednesday and the month redraws while you are looking at it. */
    expect(page).toMatch(/Which days are yours\?/);
    expect(page).toMatch(/className="wk-week-k" aria-pressed=\{chosenRest\.includes\(i\)\}/);
  });

  it('asks in the training profile too, beside how many days a week', () => {
    expect(profile).toMatch(/Which days are yours\? \(optional\)/);
    expect(profile).toMatch(/restDays, restActivity: restActivity\.trim\(\) \|\| undefined,/);
  });

  it('never charges for moving a rest day', () => {
    /* Saving the training profile is metered — five free changes a month,
       then ₹50. A control the owner wants people to press must not be one
       they are charged for pressing, so the month card writes through its own
       route and `saveProfile` is untouched by it. */
    expect(page).toMatch(/useSaveTrainingWeek/);
    expect(page).not.toMatch(/useSaveFitnessProfile/);
    const api = code('features/fitness/api.ts');
    expect(api).toMatch(/api\.put<Programme>\('\/fitness\/programme\/week', input\)/);
  });

  it('will not let the last day of the week be taken', () => {
    /* Seven days off is not a choice about rest — it is having left — and the
       server's schema refuses it too. The key simply does not turn. */
    expect(page).toMatch(/if \(next\.length >= 7\) return;/);
  });

  it('saves the whole choice at once rather than once per tap', () => {
    /* A save per key would rebuild the month between two taps and the grid
       would jump under the finger choosing the second day. */
    expect(page).toMatch(/saveWeek\.variables\?\.restDays \?\? month\.rest\.days/);
  });
});

describe('a day off is rest, or one easy thing — never nothing-or-everything', () => {
  const page = code('features/fitness/pages/Workout.tsx');

  it('offers the six a trainer would name, and calls rest what it is', () => {
    expect(page).toMatch(/OFF_DAY_ACTIVITIES\.map/);
    expect(page).toMatch(/a === 'rest' \? 'Nothing'/);
  });

  it('takes a word we do not know', () => {
    /* The trainer asked what you would rather do. A list that cannot hold
       "cricket" makes the question dishonest. */
    expect(page).toMatch(/placeholder="or something else…"/);
    expect(page).toMatch(/maxLength=\{24\}/);
  });

  it('prints the day\'s own title rather than the word Rest', () => {
    /* The tile said "Rest" on every off day because the page hardcoded it.
       The server names the day now — Rest, or Swim, or Cricket — and the tile
       prints what it was given. */
    expect(page).toMatch(/<span className="t">\{d\.title\}<\/span>/);
    expect(page).not.toMatch(/d\.kind === 'rest' \? 'Rest' : d\.title/);
  });

  it('lets the trainer answer, in the trainer\'s own words', () => {
    /* Written on the server beside the code that acted on the choice, so the
       words a citizen reads about their own week are not composed twice. */
    expect(page).toMatch(/month\.rest\.advice\.map/);
  });
});
