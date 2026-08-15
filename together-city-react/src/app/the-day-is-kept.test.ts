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

  it('the grid says a day holds something, never what it SAYS', () => {
    expect(cal).toMatch(/useDaybookMonth/);
    // Counts, a written-dot, and — the owner's call on 15 Aug, with a
    // reference of polaroids taped across a month — the first PICTURE kept on
    // the day. The line moved, and it moved once, deliberately: a photograph
    // glanced at across a room is a memory; a sentence read across a room is
    // something somebody wrote down in confidence. So the words never come out
    // of the day, and this is the assertion that keeps that true when the next
    // person adds a field to the month payload.
    expect(cal).toMatch(/mark\?\.items/);
    expect(cal).toMatch(/mark\?\.written/);
    expect(cal).toMatch(/mark\?\.photo/);
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

  /**
   * A HALF-WRITTEN TIME IS NOT AN ERROR THE BROWSER GETS TO DECIDE.
   *
   * `<input type="time">` with the minutes typed and no hour is `badInput`:
   * its value is empty and native validation refuses the submit, so Safari
   * answered "Add" with a red "Invalid value" bubble and the line was never
   * added — enforcing a rule nobody wrote, on a field that was never required.
   */
  it('never lets the browser refuse a line over an optional time', () => {
    expect(stripComments(page)).toMatch(/noValidate/);
    // …and the half-written time is not silently dropped either: somebody who
    // typed 30 meant something by it, so the page stops and says so.
    expect(stripComments(page)).toMatch(/validity\.badInput/);
    expect(page).toMatch(/half-written/);
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

/**
 * A DAY CAN BE PHOTOGRAPHED — "let people attach pictures for the day if they
 * want to save a memory" (the owner, 15 Aug).
 *
 * The whole of the risk in this feature is which bucket. Every other picture
 * the city stores wants a permanent public address — a post, a listing, a menu
 * — and the public path is one line shorter to write, so it is the one a hurry
 * takes. A photograph somebody put in their diary is the single most private
 * image in the application, and it goes to the private vault: a namespace that
 * proves whose it is, links that expire, no url column anywhere to leak.
 */
describe('a day can be photographed', () => {
  const page = stripComments(read('features/daybook/pages/DayPage.tsx'));
  const api = stripComments(read('api/daybook.api.ts'));
  const media = stripComments(read('api/media.api.ts'));

  it('a picture is kept on the day, and can be taken off it', () => {
    expect(page).toMatch(/useAddDayPhoto/);
    expect(page).toMatch(/useRemoveDayPhoto/);
    // Named formats rather than `image/*` — the vault stores these and no
    // others, and the wildcard would put a comment-opener inside a string,
    // which is a thing every guard in this file strips before it reads.
    expect(page).toMatch(/accept="image\/jpeg,/);
  });

  it('the bytes go to the private vault, through the one place that scrubs them', () => {
    // The upload lives in media.api.ts with every other upload, because that is
    // where the location is taken out of a photograph — a rule that only holds
    // if no screen is allowed its own presign.
    expect(media).toMatch(/uploadDaybook/);
    expect(media).toMatch(/scrubImage\(file, 'private'\)/);
    expect(media).toMatch(/'\/daybook\/photos\/presign'/);
    expect(api).toMatch(/mediaApi\.uploadDaybook/);
  });

  it('and never to the public bucket, whose whole promise is the opposite', () => {
    expect(api).not.toMatch(/mediaApi\.upload\(/);
    expect(page).not.toMatch(/mediaApi\.upload\(/);
    // A url on the record would be a permanent address for it. What the day
    // carries is a link that expires, minted per read.
    expect(api).toMatch(/url: z\.string\(\)\.nullable\(\)/);
  });

  it('a photo that cannot be shown says so, rather than drawing a broken frame', () => {
    // `url` is nullable — storage may be unconfigured — and "there is a picture
    // here we cannot show you" is a different fact from "there is no picture".
    expect(page).toMatch(/p\.url \?/);
    expect(page).toMatch(/can&rsquo;t be shown just now/);
  });

  it('and the page says where the picture goes, in the place it is being kept', () => {
    expect(page).toMatch(/Private — only you/);
    expect(page).toMatch(/Where a photo was taken is removed/);
  });

  it('everything kept is filed under its date, and the month is the index of it', () => {
    // "Make sure everything stored here is stored date wise labeled which is
    // then shown on the calendar" — the owner, 15 Aug. The date is the key on
    // every row the daybook writes (the API's models carry `date` rather than
    // a timestamp), and the month endpoint is what turns that into the grid.
    const api2 = read('api/daybook.api.ts');
    expect(api2).toMatch(/\/daybook\/\$\{date\}\/photos/);
    expect(api2).toMatch(/photo: z\.string\(\)\.nullable\(\)/);
    expect(read('features/calendar/pages/Calendar.tsx')).toMatch(/cal-pic/);
  });
});

/**
 * THE LOOKING-BACK SHEET — the owner's reference, 15 Aug: a printed
 * self-reflection page, dropped into the day between what you kept and what
 * you write.
 *
 * Its prompts are the product's words on a page whose whole argument is that
 * the product does not put words there. That is survivable — a QUESTION is not
 * a suggestion — and it is survivable only under conditions, which is what
 * this block holds: every box optional, nothing counted, nothing compared to
 * yesterday, and the one number on the page a FEELING rather than a mark.
 */
describe('a day can be looked back on', () => {
  const page = stripComments(read('features/daybook/pages/DayPage.tsx'));
  const api = read('api/daybook.api.ts');

  it('asks the reference’s questions, and asks them as questions', () => {
    for (const q of [
      'What went well today', 'proud of', 'grateful for',
      "didn’t go as planned", 'learn from it', 'Win of today', 'Challenge', 'focus',
    ]) {
      expect({ prompt: q, asked: page.includes(q) }).toEqual({ prompt: q, asked: true });
    }
  });

  it('saves one box at a time, so filling one cannot wipe another', () => {
    // Eleven answers share one JSON column; each is written alone and the
    // server merges. Sending the whole object would overwrite a box somebody
    // filled in another tab — the partial-save bug, one level down.
    expect(page).toMatch(/save\.mutate\(\{ reflection: \{ \[k\]: text \} \}\)/);
    expect(api).toMatch(/reflection\?: Reflection/);
  });

  it('the 1–10 is a feeling, and it can be taken back', () => {
    // Tapping the same number again clears it. A day you cannot un-rate is a
    // day you rate carefully, which is the opposite of a diary.
    expect(page).toMatch(/feeling: look\.feeling === n \? null : n/);
  });

  it('and nothing on the sheet is counted, chained or compared', () => {
    // The whole-file ban already covers score/streak/progress; these are the
    // shapes a reflection sheet in particular grows.
    expect(page).not.toMatch(/average|yesterday|last week|out of 10 so far|\btrend\b/i);
  });

  it('a box that is emptied is cleared rather than left standing', () => {
    // The rule the mood chips earned, applied inside the JSON column.
    expect(page).toMatch(/if \(text !== now\)/);
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
