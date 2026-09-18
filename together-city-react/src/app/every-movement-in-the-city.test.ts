import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HUBS } from '@/config/hubs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments quote the old line as the thing they exist to correct. */
const code = (p: string) =>
  read(p).replace(/(^[ \t]*|\{)\/\*[\s\S]*?\*\//gm, '$1 ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * ── EVERY MOVEMENT IN THE CITY ──────────────────────────────────────────────
 *
 * Owner, 18 Sep: "Create a separate page where all workouts in the database
 * are mentioned with body parts, and also which level they are with
 * instructions; the user can add the workouts to create his own plan for the
 * day or week and save those plans on the page; each workout should have
 * space for workout videos which tells them how to work out; sort men and
 * women workouts separately."
 *
 * Asked where it should live: a new door on the Personal Trainer rail. Asked
 * how the two libraries meet a citizen: locked to the gender on their
 * profile, not a switch. Asked about the films: a space on every card, empty
 * until the city's own film is there — no borrowed clip.
 */
describe('the door', () => {
  it('is 03 · Workout Library on the Personal Trainer rail, and the rooms after it count on', () => {
    const items = HUBS.fitness.items;
    const i = items.findIndex((r) => r.path === '/fitness/library');
    expect(i).toBe(2);
    expect(items[i]).toMatchObject({ index: '03', label: 'Workout Library' });
    /* A menu that counts 01-02-04 advertises the thing it is trying not to
       advertise — the numbering closes up after a room the same way it does
       before one. */
    expect(items.map((r) => r.index)).toEqual(items.map((_, n) => String(n + 1).padStart(2, '0')));
  });

  it('is mounted at /fitness/library, lazily, on the Library page', () => {
    const router = code('app/router.tsx');
    expect(router).toMatch(/const FitLibrary = lazy\(\(\) => import\('@\/features\/fitness\/pages\/Library'\)/);
    expect(router).toMatch(/\{ path: '\/fitness\/library', element: <RequireAuth>\{wrap\(<FitLibrary \/>\)\}<\/RequireAuth> \}/);
  });

  it('brings its stylesheet in with the rest', () => {
    expect(code('main.tsx')).toMatch(/import '\.\/styles\/workout-library\.css';/);
  });
});

describe('the page', () => {
  const page = code('features/fitness/pages/Library.tsx');
  const api = code('features/fitness/library.api.ts');

  it('reads the whole library once and how a movement is done only when its card opens', () => {
    expect(api).toMatch(/api\.get<Library>\('\/fitness\/library'\)/);
    expect(api).toMatch(/staleTime: Infinity/);
    expect(api).toMatch(/api\.get<MovementHowTo>\(`\/fitness\/library\/\$\{id\}`\)/);
    expect(api).toMatch(/enabled: Boolean\(id\)/);
    /* The steps live in the Fold's children, which the Fold renders only
       while it is open — so a closed card fetches nothing. */
    expect(page).toMatch(/<HowTo id=\{m\.id\} \/>\s*<\/Fold>/);
  });

  it('says which library it opened and that the level is the city’s own grading', () => {
    expect(page).toMatch(/\{data\.trackLabel\}/);
    expect(page).toMatch(/follows the gender on your profile/);
    expect(page).toMatch(/city&rsquo;s grading of the movement, a rule of thumb rather than a prescription/);
    /* Locked, not switched: nothing on the page lets a citizen pick the other
       library. */
    expect(page).not.toMatch(/setTrack|track=|'men'|'women'/);
  });

  it('filters by body part, level, kit and a word, and shows the citizen’s own shelf on the level chips', () => {
    expect(page).toMatch(/aria-label="Body part"/);
    expect(page).toMatch(/aria-label="Level"/);
    expect(page).toMatch(/<span className="wl-label">Kit<\/span>/);
    expect(page).toMatch(/type="search"/);
    expect(page).toMatch(/data\.level === l\.key && <span className="wl-you">· yours<\/span>/);
  });

  it('opens a row with the city’s one disclosure, with Add beside the face', () => {
    /* One Fold per movement — "Open + / Close −" — and the Add button in the
       Fold's `action` slot, never inside the face (a button in a button). */
    expect(page).toMatch(/<Fold face="wl-lid" panel="wl-how-panel"/);
    expect(page).toMatch(/action=\{\s*<Button[^>]*onClick=\{\(\) => add\(m\)\}/);
    expect(page).not.toMatch(/aria-expanded=\{/);
  });

  it('carries a space for the film on every card, and never a borrowed clip', () => {
    expect(page).toMatch(/m\.film \? \(\s*<video className="wl-film-v" src=\{m\.film\}/);
    expect(page).toMatch(/The city&rsquo;s film of this movement is on its way\./);
    /* The dataset's animation travels with its attribution, at its resolution. */
    expect(page).toMatch(/width=\{180\} height=\{180\}/);
    expect(page).toMatch(/<figcaption className="muted">\{EXERCISE_MEDIA_ATTRIBUTION\}<\/figcaption>/);
  });

  it('builds a day or a week, keeps the draft for the tab, and saves it through the plans routes', () => {
    expect(page).toMatch(/aria-label="Plan for"/);
    expect(page).toMatch(/role="tablist" aria-label="Day of the week"/);
    expect(page).toMatch(/sessionStorage\.setItem\(DRAFT_KEY/);
    expect(api).toMatch(/api\.post<WorkoutPlan>\('\/fitness\/library\/plans', body\)/);
    expect(api).toMatch(/api\.patch<WorkoutPlan>\(`\/fitness\/library\/plans\/\$\{id\}`, body\)/);
    expect(api).toMatch(/api\.delete\(`\/fitness\/library\/plans\/\$\{id\}`\)/);
    expect(api).toMatch(/api\.get<\{ plans: WorkoutPlan\[\]; cap: number \}>\('\/fitness\/library\/plans'\)/);
  });

  it('asks before it removes a saved plan, in the same words the log uses', () => {
    expect(page).toMatch(/'Remove it'/);
    expect(page).toMatch(/>Keep<\/Button>/);
  });

  it('draws nothing with an inline style', () => {
    /* The size system counts `style={{` and the page adds none. */
    expect(page).not.toMatch(/style=\{\{/);
  });
});

describe('the stylesheet', () => {
  const css = read('styles/workout-library.css').replace(/\/\*[\s\S]*?\*\//g, '');

  it('draws with tokens only — no literal colour, no literal radius, no literal font size', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    expect(css).not.toMatch(/border-radius:\s*[0-9.]+px/);
    expect(css).not.toMatch(/font-size:\s*[0-9.]+px/);
    expect(css).not.toMatch(/font-family/);
  });

  it('breaks where the app breaks', () => {
    const widths = [...css.matchAll(/max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) expect([560, 899, 1179, 1499]).toContain(w);
  });
});
