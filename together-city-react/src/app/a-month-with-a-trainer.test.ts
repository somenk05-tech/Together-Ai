import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A MONTH WITH A TRAINER — owner, 6 Sep: "a personal trainer telling you which
 * body part you are working on that day, showing you the workout, and moving
 * you to the next body part the next day — a month, for each user, from all
 * the exercises in the database."
 *
 * The month is built on the server (programme-engine.ts, and its own spec);
 * this reads the whiteboard the page draws from it: today's day and body
 * part, the phase note, what is next, the twenty-eight days with the done
 * ones ticked, and the reasons — and that today's session takes the month's
 * movements on a strength day.
 */

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
const page = read('features/fitness/pages/Workout.tsx');
const api = read('features/fitness/api.ts');
const service = readFileSync(join(SRC, '..', '..', 'together-city-chat', 'src', 'fitness', 'fitness.service.ts'), 'utf8');

describe('the whiteboard', () => {
  it('asks the server for the month and draws it above today\'s plan', () => {
    expect(api).toMatch(/api\.get<Programme>\('\/fitness\/programme'\)/);
    expect(page).toMatch(/const programme = useProgramme\(\);/);
    expect(page.indexOf('className="blk wk-month"')).toBeLessThan(page.indexOf('Today&rsquo;s plan'));
  });

  it('says which day, which week, which phase and which body part — and what is next', () => {
    expect(page).toMatch(/Day \{monthDay\.index \+ 1\} of \{month\.days\.length\} · week \{monthDay\.week\}/);
    expect(page).toMatch(/<h3 className="wk-month-title">\{dayWord\(monthDay\)\}<\/h3>/);
    expect(page).toMatch(/d\.kind === 'strength' \? `\$\{d\.title\} — \$\{d\.parts\}`/);
    expect(page).toMatch(/Next: \{dayWord\(monthNext\)\}/);
  });

  it('draws the twenty-eight days, ticks the done ones and rings today', () => {
    expect(page).toMatch(/<ol className="wk-month-grid" aria-label="The twenty-eight days">/);
    expect(page).toMatch(/d\.index === monthDay\.index \? 'is-today'/);
    expect(page).toMatch(/d\.done \? 'is-done'/);
    const css = read('styles/layout.css');
    expect(css).toMatch(/\.wk-month-grid \{[^}]*grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.wk-month-grid li\.is-today \{ border: 2px solid var\(--accent\)/);
    expect(css).toMatch(/\.wk-month-grid li\.is-done \{ border-color: var\(--ok-line\)/);
  });

  it('says why the month is shaped this way', () => {
    expect(page).toMatch(/<summary>Why this month<\/summary>/);
    expect(page).toMatch(/month\.why\.map/);
  });
});

describe('today takes the month\'s day', () => {
  it('on a strength day the session\'s working block is the month\'s movements, and the headline names the body part', () => {
    expect(service).toMatch(/const month = await this\.programme\(userId\)/);
    expect(service).toMatch(/if \(today\.kind === 'strength' && today\.exercises\.length\)/);
    expect(service).toMatch(/work\.exercises = today\.exercises\.map/);
    expect(service).toMatch(/built\.headline = `\$\{built\.minutes\} min \$\{today\.title\.toLowerCase\(\)\} — \$\{today\.parts\}/);
  });

  it('on a rest day it is told, not stopped', () => {
    expect(service).toMatch(/your month has today as a rest day/);
  });

  it('the day is the city\'s day, not Greenwich\'s', () => {
    expect(service).toMatch(/timeZone: 'Asia\/Kolkata'/);
  });
});
