import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── A DAY IS A PAGE ─────────────────────────────────────────────────────────
 *
 * Owner, 18 Sep: "When someone clicks on the day it should open the day on a
 * new page with that day's complete workout, and below each workout day page
 * add search and add workout to the day." And: "the workout page should end
 * with 'Which days are yours?' and nothing else."
 */
describe('the day\'s page', () => {
  const page = code('features/fitness/pages/WorkoutDay.tsx');
  const api = code('features/fitness/day.api.ts');

  it('is mounted at /fitness/workout/day/:index and reached from every tile of the month', () => {
    const router = code('app/router.tsx');
    expect(router).toMatch(/const FitWorkoutDay = lazy\(\(\) => import\('@\/features\/fitness\/pages\/WorkoutDay'\)/);
    expect(router).toMatch(/\{ path: '\/fitness\/workout\/day\/:index', element: <RequireAuth>\{wrap\(<FitWorkoutDay \/>\)\}<\/RequireAuth> \}/);
    expect(code('features/fitness/pages/Workout.tsx')).toMatch(/<Link to=\{`\/fitness\/workout\/day\/\$\{d\.index\}`\}/);
    expect(code('main.tsx')).toMatch(/import '\.\/styles\/workout-day\.css';/);
  });

  it('shows the whole day — every movement with its sets, reps, rest, picture and steps — as folds', () => {
    expect(page).toMatch(/<Fold face="wl-lid" panel="wl-how-panel"/);
    expect(page).toMatch(/\{e\.works\} · \{e\.equipment\} · rest \{e\.restSec\}s/);
    expect(page).toMatch(/\{e\.sets\} × \{e\.reps\[0\] === e\.reps\[1\] \? e\.reps\[0\] : `\$\{e\.reps\[0\]\}–\$\{e\.reps\[1\]\}`\}/);
    expect(page).toMatch(/<ol className="wl-steps">\{e\.steps\.map/);
    expect(page).toMatch(/<figcaption className="muted">\{EXERCISE_MEDIA_ATTRIBUTION\}<\/figcaption>/);
  });

  it('runs the day from the runner on the Workout page, and can move it, and goes back', () => {
    expect(page).toMatch(/<Link to=\{`\/fitness\/workout\?start=\$\{day\.index\}`\} className="btn btn-accent">/);
    expect(page).toMatch(/moveDay\.mutate\(day\.index/);
    expect(page).toMatch(/<Link to="\/fitness\/workout" className="btn btn-ghost">Back to your month<\/Link>/);
    const workout = code('features/fitness/pages/Workout.tsx');
    expect(workout).toMatch(/params\.has\('start'\)/);
    expect(workout).toMatch(/if \(day\) startDay\(day\);/);
  });

  it('searches the library under the day and adds with the citizen\'s own sets and reps; what they added carries Remove', () => {
    expect(page).toMatch(/aria-labelledby="wd-add-h"/);
    expect(page).toMatch(/type="search"/);
    expect(page).toMatch(/add\.mutate\(\{ dayIndex: day\.index, exerciseId: mv\.id, sets, reps \}\)/);
    expect(page).toMatch(/e\.additionId \? <RemoveKey/);
    expect(page).toMatch(/'Remove it'/);
    expect(page).toMatch(/>Keep<\/Button>/);
    expect(api).toMatch(/api\.post<Programme>\(`\/fitness\/programme\/day\/\$\{dayIndex\}\/add`, body\)/);
    expect(api).toMatch(/api\.delete<Programme>\(`\/fitness\/programme\/day\/\$\{dayIndex\}\/add\/\$\{id\}`\)/);
    expect(api).toMatch(/qc\.setQueryData\(\['fitness', 'programme'\], month\)/);
  });

  it('draws nothing with an inline style, and its sheet with tokens only', () => {
    expect(page).not.toMatch(/style=\{\{/);
    const css = read('styles/workout-day.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).not.toMatch(/border-radius:\s*[0-9.]+px|font-size:\s*[0-9.]+px/);
  });
});

describe('the Workout page ends with the week', () => {
  const page = read('features/fitness/pages/Workout.tsx');

  it('has no plan, no week log and no trust line after the month any more', () => {
    expect(page).not.toMatch(/Today&rsquo;s plan/);
    expect(page).not.toMatch(/Physical activity log/);
    expect(page).not.toMatch(/Guided Live Timer/);
  });

  it('puts Why this month above the days, so the days are the last thing on the page', () => {
    expect(page.indexOf('className="wk-month-why"')).toBeLessThan(page.indexOf('className="wk-week"'));
    const afterWeek = page.slice(page.indexOf('className="wk-week"'));
    /* After the week block: the card and section close, then only the runner. */
    expect(afterWeek.indexOf('THE RUNNER IS A TELEVISION')).toBeGreaterThan(0);
    expect(afterWeek.slice(0, afterWeek.indexOf('THE RUNNER IS A TELEVISION'))).not.toMatch(/<section className="blk">/);
  });
});
