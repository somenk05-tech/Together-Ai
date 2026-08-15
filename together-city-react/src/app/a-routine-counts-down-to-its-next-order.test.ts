import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { daysUntil } from '@/features/beauty/api';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');
/** Comments out first — this file's own header names the things it forbids. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * A ROUTINE IS A SUPPLY, AND A SUPPLY RUNS OUT.
 *
 * The hub could say what a routine cost to buy and what it cost a month to
 * keep, and it could not say when to buy it again — which is the only one of
 * the three that has a deadline attached. Ten products with ten different lives
 * in them means the answer is not an interval, and an interval is exactly what
 * a subscription box would have shipped here.
 *
 * The four things below would each go quiet on their own:
 *
 *   THE ARITHMETIC IS THE SERVER'S. Which product runs out first, how long a
 *   pack lasts, how many days before empty to ask — all of it is decided in
 *   beauty/reorder.ts and asserted in reorder-is-due.spec.ts. If this app ever
 *   starts computing a due date, there are two copies of that judgement and
 *   they will disagree the first time either is corrected. Same rule as
 *   lastsLabel and packLabel, and the same test one file over.
 *
 *   THE COUNTDOWN IS THE BROWSER'S, and it has to be: a date on the wire is
 *   still right tomorrow morning, and "35 days" is not. That is the whole
 *   reason the split falls where it does.
 *
 *   IT COUNTS CALENDAR DAYS. Subtracting raw timestamps says 34 at breakfast
 *   and 35 at bedtime, which is a countdown that appears to run backwards while
 *   somebody watches it.
 *
 *   AND IT NAMES WHAT RUNS OUT. "35 days" is a number to be trusted; "your
 *   sunscreen runs out first" is a number to be checked against a bottle.
 */

describe('the routine counts down to its next order', () => {
  it('counts whole calendar days, not elapsed hours', () => {
    // THE BUG THIS FORBIDS. Both sides are flattened to local midnight, so the
    // answer does not change between breakfast and bedtime on the same day.
    const morning = new Date(2026, 7, 12, 8, 0, 0);
    const night = new Date(2026, 7, 12, 23, 30, 0);
    expect(daysUntil('2026-09-16', morning)).toBe(35);
    expect(daysUntil('2026-09-16', night)).toBe(35);
  });

  it('reaches zero on the day, and stays there afterwards', () => {
    const today = new Date(2026, 8, 16, 12, 0, 0);
    expect(daysUntil('2026-09-16', today)).toBe(0);
    // Overdue floors at zero rather than counting up. "11 days overdue" is a
    // scolding; this is a supply note, and the instruction is the same either way.
    expect(daysUntil('2026-09-16', new Date(2026, 8, 27))).toBe(0);
  });

  it('ticks down by exactly one a day', () => {
    const a = daysUntil('2026-09-16', new Date(2026, 7, 12));
    const b = daysUntil('2026-09-16', new Date(2026, 7, 13));
    expect(a - b).toBe(1);
  });

  it('survives a date it cannot read instead of rendering NaN', () => {
    expect(daysUntil('not a date')).toBe(0);
  });

  it('takes the due date off the wire and never computes one', () => {
    // The client may read `dueAt`. It may not do the arithmetic that produced
    // it — no lead time, no pack life, no "which runs out first" here.
    const client = [
      code('features/beauty/components/NextOrder.tsx'),
      code('features/beauty/pages/Routine.tsx'),
      code('features/beauty/pages/Orders.tsx'),
    ].join('\n');
    expect(client).not.toMatch(/leadDays\s*[-*+]/);
    expect(client).not.toMatch(/monthsOfUse|packSize|REORDER_LEAD|runsOutAt\s*\)/);
  });

  it('shows the countdown on the routine card and on the newest order only', () => {
    // On the card the owner pointed at, under the product count.
    const routine = read('features/beauty/pages/Routine.tsx');
    expect(routine).toMatch(/\{everyStep\.length\} products<\/div>\s*\n\s*\{data\?\.reorder && <NextOrder due=\{data\.reorder\} \/>\}/);

    // And on ONE row of the history. The server dates every order — an order is
    // a supply with a life — but only the newest is a live instruction, and
    // "Time to reorder" against every row somebody has ever placed is a page of
    // alarms rather than an answer.
    const orders = read('features/beauty/pages/Orders.tsx');
    expect(orders).toMatch(/at === 0 && o\.reorder && <NextOrder due=\{o\.reorder\} variant="row" \/>/);
  });

  it('names the product that sets the date', () => {
    // Without this the countdown is an assertion about somebody's money and
    // their skin, and this hub shows the working behind every other figure.
    const next = read('features/beauty/components/NextOrder.tsx');
    expect(next).toMatch(/productCategory/);
    expect(next).toMatch(/runs out first/);
    expect(next).toMatch(/due\.lastsLabel/);
  });

  it('names the order it is counting, not just the product', () => {
    // The countdown is a fact about a purchase already made, and it renders
    // inside a block headed "The whole routine · 14 products" — one card above
    // a step explaining that a cleanser was deliberately NOT bought. Two true
    // sentences, set side by side by a layout implying a relationship neither
    // claims. The one clause that breaks the false adjacency is the order date,
    // which `orderedAt` carries for exactly this sentence.
    const next = read('features/beauty/components/NextOrder.tsx');
    expect(next).toMatch(/due\.orderedAt/);
    expect(next).toMatch(/from your order of/);
  });
});
