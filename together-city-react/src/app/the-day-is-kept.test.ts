import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * A GUARD THAT READS THE PROSE IS READING THE WRONG THING.
 *
 * The first version of "it does not grade the day" searched the whole file for
 * `score`, and the first thing it found was the page's own docstring saying it
 * does not score the day. A rule that fails when you write down the rule is a
 * rule people delete, so anything that bans a WORD is run against the code with
 * the comments taken out. (`failure-states.test.ts` earned this the same way.)
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/**
 * THE DAY IS KEPT, NOT SCHEDULED.
 *
 * The Master Calendar was a grid with nothing behind it — `const activities:
 * Activity[] = []`, hardcoded, waiting for hub bookings that were never wired
 * in — while its own subtitle promised "every hub in one view". The owner's
 * answer was better than fetching the bookings: a calendar tells you what is
 * scheduled, and what people actually want is the record of the day.
 *
 * So this file guards the two halves of that idea. The grid became a MAP —
 * every date a door, marks that say a day holds something and never what.
 * And the day became a PLACE the citizen keeps.
 */
describe('the calendar is a map now', () => {
  const cal = read('features/calendar/pages/Calendar.tsx');

  it('every date is a door into its day', () => {
    expect(cal).toMatch(/to=\{`\/daybook\/\$\{dstr\}`\}/);
    expect(cal).toMatch(/aria-label=\{`Open \$\{dstr\}/);
  });

  it('the grid says a day holds something, never what it says', () => {
    expect(cal).toMatch(/useDaybookMonth/);
    // Counts and a written-dot. If a title or a mood line ever reaches the
    // grid, a shoulder reads somebody's Tuesday from across the room.
    expect(cal).toMatch(/mark\?\.items/);
    expect(cal).toMatch(/mark\?\.written/);
    expect(cal).not.toMatch(/mark\?\.(journal|feelNote|title)/);
  });

  it('and it stops promising what it never delivered', () => {
    // "Everything scheduled, one calendar / every hub in one view" over an
    // empty grid was the one promise this page could not keep.
    expect(cal).not.toMatch(/Master Calendar/);
    expect(cal).toMatch(/My Daybook/);
  });
});

describe('a day is a place', () => {
  const page = read('features/daybook/pages/DayPage.tsx');
  const api = read('api/daybook.api.ts');

  it('holds the day in the order a day is lived', () => {
    expect(page).toMatch(/How did today feel\?/);
    expect(page).toMatch(/On this day/);
    expect(page).toMatch(/Write about today/);
    expect(page).toMatch(/Ask Mira about this day/);
  });

  it('the four kinds a line can be', () => {
    for (const k of ['task', 'meeting', 'reminder', 'appointment']) {
      expect({ kind: k, offered: page.includes(`id: '${k}'`) }).toEqual({ kind: k, offered: true });
    }
  });

  it('it does not grade the day', () => {
    // No score, no streak, no "2 of 5". A diary that marks you is a diary you
    // stop telling the truth in, and every one of these was easy to add.
    expect(stripComments(page)).not.toMatch(/streak|of \$\{items\.length\}|completed|progress|score/i);
  });

  it('and it does not tell you the day is empty when it simply could not read it', () => {
    // Without this branch `day.data` is undefined on a failed request and the
    // page renders "Nothing down yet" — a claim about somebody's own record
    // that was never checked. It is the one lie a diary cannot take back.
    expect(stripComments(page)).toMatch(/day\.isError/);
    expect(page).toMatch(/couldn&rsquo;t open this day/i);
  });

  it('the date is read as a date, never as an instant', () => {
    // `new Date('2026-08-15')` is midnight UTC — the 14th for anybody west of
    // Greenwich. A diary may not rename somebody's day.
    expect(page).toMatch(/date\.split\('-'\)\.map\(Number\)/);
    expect(page).not.toMatch(/new Date\(date\)/);
  });

  it('every new field on the wire is optional, always', () => {
    // The rule Mira's `mood` earned: web and API deploy independently, so a
    // required field the old server has never sent is an error page.
    expect(api).toMatch(/mood: z\.string\(\)\.nullable\(\)/);
    expect(api).toMatch(/journal: z\.string\(\)\.nullable\(\)/);
  });
});

describe('and Mira reads one day of it', () => {
  const panel = read('features/daybook/MiraDay.tsx');

  it('asks its own route, for one date', () => {
    expect(panel).toMatch(/apiPost\('\/mira\/day'/);
    expect(panel).toMatch(/date, ask,/);
  });

  it('keeps nothing, and says so', () => {
    expect(panel).not.toMatch(/localStorage|sessionStorage/);
    expect(panel).toMatch(/keeps nothing from it/);
  });

  it('closes on the outside tap and on Escape', () => {
    expect(panel).toMatch(/mira-dock-scrim/);
    expect(panel).toMatch(/key === 'Escape'/);
  });
});
