import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planDates, planDayOffset, dayLabel, longDate } from '@/features/nutrition/planDates';
import { HUBS } from '@/config/hubs';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');
const addToPlan = strip(readFileSync(join(web, 'features', 'nutrition', 'components', 'AddToPlan.tsx'), 'utf8'));
const router = readFileSync(join(web, 'app', 'router.tsx'), 'utf8');

/**
 * "DAY 1" WAS AN ANSWER TO A QUESTION NOBODY ASKED — AND OFTEN THE WRONG DAY.
 *
 * Somebody deciding where a dish goes is thinking about Saturday, not about an
 * index into an array. That much is taste. The bug underneath it is not:
 *
 * A composed plan is anchored to a real date, so index 0 is `planStartDate`,
 * which on the fourth day of a plan is three days ago. The picker opened on
 * index 0 and defaulted to it, so the easiest possible action — open, press
 * Add — put tonight's dinner on a day that had already been eaten. Nothing
 * refused it and nothing said so.
 */
describe('the day picker offers dates', () => {
  it('labels options with a date, and no longer with a day number', () => {
    expect(addToPlan).toMatch(/dayLabel\(date, index - todayIndex\)/);
    // The exact string this replaced, so it cannot come back unnoticed.
    expect(addToPlan).not.toMatch(/Day \{i \+ 1\}/);
  });

  it('offers today onwards and never a day that has passed', () => {
    expect(addToPlan).toMatch(/\.filter\(\(\{ index \}\) => index >= todayIndex\)/);
  });

  it('moves the selection to today once the plan arrives', () => {
    // `day` starts at 0 because there is nothing to start it at before the
    // query resolves, and 0 is in the past on every plan that did not begin
    // today.
    expect(addToPlan).toMatch(/setDay\(\(d\) => \(d < todayIndex \? todayIndex : d\)\)/);
  });

  it('sends the plan INDEX, not the date — the API contract did not change', () => {
    expect(addToPlan).toMatch(/<option key=\{index\} value=\{index\}>/);
    expect(addToPlan).toMatch(/pin\.mutate\(\{ day, slot, recipeId \}/);
  });

  it('names the date in the confirmation instead of an index', () => {
    expect(addToPlan).toMatch(/Added to \{dates\[done\.day\] \? longDate\(dates\[done\.day\]\) : 'your plan'\}/);
  });

  it('says so when every day in the plan has passed', () => {
    // Different from having no plan at all, and said differently — otherwise
    // the screen tells somebody with a finished plan to go and build their
    // first one.
    expect(addToPlan).toMatch(/if \(offerable\.length === 0\)/);
    expect(addToPlan).toMatch(/every day in it has passed/);
  });
});

describe('the date labels themselves', () => {
  const D = (y: number, m: number, d: number) => new Date(y, m - 1, d);

  it('reads as a date somebody picking one would recognise', () => {
    expect(longDate(D(2026, 8, 8))).toBe('Sat 8 Aug');
  });

  it('says Today and Tomorrow, and still shows the date beside them', () => {
    // "Today" alone is ambiguous once a tab has been open past midnight, which
    // for a page about dinner is not a rare case.
    expect(dayLabel(D(2026, 8, 7), 0)).toBe('Today · Fri 7 Aug');
    expect(dayLabel(D(2026, 8, 8), 1)).toBe('Tomorrow · Sat 8 Aug');
    expect(dayLabel(D(2026, 8, 9), 2)).toBe('Sun 9 Aug');
  });

  it('counts the offset from TODAY, not from the start of the plan', () => {
    // A plan that began on Monday, opened on Wednesday: the third entry is
    // Wednesday and it is the one that says Today.
    const dates = planDates('2026-08-03', 7);
    expect(dates).toHaveLength(7);
    expect(longDate(dates[0])).toBe('Mon 3 Aug');
    expect(longDate(dates[6])).toBe('Sun 9 Aug');
  });

  it('treats a plan that starts in the future as starting at its own index 0', () => {
    // planDayOffset floors at 0, so a plan beginning next week offers its own
    // first day rather than a negative index.
    const future = new Date();
    future.setDate(future.getDate() + 10);
    const iso = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    expect(planDayOffset(iso)).toBe(0);
  });

  it('falls back to today when the plan has no anchor date at all', () => {
    expect(planDayOffset(undefined)).toBe(0);
    expect(planDates(undefined, 3)).toHaveLength(3);
  });
});

/**
 * A BUTTON THAT WROTE TO A LIST NOBODY COULD READ.
 *
 * Every recipe page has had a Save control since it was built, and
 * GET /nutrition/saved has always returned `{ ids, recipes }`. Only `ids` was
 * ever used — to decide whether the bookmark on the page you were already
 * looking at should be filled in. The recipes were fetched and discarded on
 * every recipe page, because there was nowhere to show them.
 */
describe('saved recipes have somewhere to be', () => {
  it('has a page, and it is in the Nutrition menu', () => {
    expect(router).toMatch(/path: '\/nutrition\/saved'/);
    const item = HUBS.nutrition.items.find((i) => i.path === '/nutrition/saved');
    expect(item).toBeTruthy();
    expect(item!.index).toBe('07');
  });

  it('reads the recipes the endpoint was already returning', () => {
    const page = strip(readFileSync(join(web, 'features', 'nutrition', 'pages', 'SavedRecipes.tsx'), 'utf8'));
    expect(page).toMatch(/saved\.data\?\.recipes \?\? \[\]/);
    // Removing lives on the tile: a list you can only prune by opening each
    // item is a list that grows until somebody stops using it.
    expect(page).toMatch(/toggle\.mutate\(\{ id: r\.id, saved: false \}/);
  });

  it('claims no order it cannot prove', () => {
    // The payload carries no save timestamp. A list that says "recently saved"
    // while being arbitrary is worse than one that says nothing.
    const page = strip(readFileSync(join(web, 'features', 'nutrition', 'pages', 'SavedRecipes.tsx'), 'utf8'));
    expect(page).not.toMatch(/[Rr]ecently saved|sort\(/);
  });
});
