import { readFileSync } from 'fs';

import { AddSpendLogSchema } from './dto/financial.dto';

/**
 * A LOG IS NOT A LEDGER, AND THE DIFFERENCE IS WHERE THE BUGS LIVE.
 *
 * Everything else the Financial hub reports is money the CITY moved: it knows
 * the amount because it charged it, the category because it placed the order,
 * and the day because it stamped the row. A log entry has none of that
 * authority — it is somebody's handwriting — and the three things below are
 * what stop that difference from quietly corrupting a number.
 *
 * The service arithmetic is exercised in financial.service.spec.ts against a
 * real Prisma client; this file guards the CONTRACT, which is the part a
 * later change is most likely to "simplify".
 */

describe('a log entry is a day, a line and a number', () => {
  const ok = { spentOn: '2026-08-13', note: 'Auto to work', amountInr: 80 };

  it('takes a calendar day, not a timestamp', () => {
    // THE BUG THIS FORBIDS is the one the shared clock service exists for. An
    // entry made at 01:00 in Asia/Kolkata is the previous day in UTC; stored as
    // an instant it lands in the wrong month for five and a half hours out of
    // every twenty-four, and the month it lands in is the one being totalled.
    expect(AddSpendLogSchema.safeParse(ok).success).toBe(true);
    for (const bad of ['2026-08-13T00:00:00Z', '13/08/2026', '2026-8-13', 'today', '']) {
      expect({ bad, ok: AddSpendLogSchema.safeParse({ ...ok, spentOn: bad }).success })
        .toEqual({ bad, ok: false });
    }
  });

  it('asks for a line of text and refuses an empty one', () => {
    // An entry with an amount and no note is a number nobody can place later,
    // which is the same as not having written it down.
    expect(AddSpendLogSchema.safeParse({ ...ok, note: '   ' }).success).toBe(false);
    // …and it is trimmed rather than stored with the spaces somebody typed.
    const parsed = AddSpendLogSchema.parse({ ...ok, note: '  Chai  ' });
    expect(parsed.note).toBe('Chai');
  });

  it('has no category, and that is the feature', () => {
    // Making somebody file "auto to work" under one of seven headings before
    // the entry will save is how a log stops being written in. If a category
    // ever arrives here it must be OPTIONAL, and the totals have to keep
    // working for the entries that do not carry one.
    expect(Object.keys(AddSpendLogSchema.shape).sort()).toEqual(['amountInr', 'note', 'spentOn']);
  });

  it('is money that went, in whole rupees', () => {
    // A log entry is a SPEND. Something received is a top-up, which is a
    // different thing with a different table behind it — and a negative here
    // would subtract from a month's total and read as a discount nobody gave.
    for (const bad of [0, -80, 12.5]) {
      expect({ bad, ok: AddSpendLogSchema.safeParse({ ...ok, amountInr: bad }).success })
        .toEqual({ bad, ok: false });
    }
    expect(AddSpendLogSchema.safeParse({ ...ok, amountInr: 10_000_001 }).success).toBe(false);
  });

  it('caps the note at a line rather than a paste', () => {
    expect(AddSpendLogSchema.safeParse({ ...ok, note: 'x'.repeat(200) }).success).toBe(true);
    expect(AddSpendLogSchema.safeParse({ ...ok, note: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('the log joins the total and not the categories', () => {
  /**
   * READ THE SERVICE RATHER THAN MOCK PRISMA. What matters here is a shape
   * decision — which figure the percentages divide by — and a mock that returns
   * the rows I choose would prove only that I can add. The source says which
   * denominator was used, and that is the thing a later edit would change
   * without noticing.
   */
  const src = readFileSync(`${__dirname}/financial.service.ts`, 'utf8');

  it('adds the logged amount to the month total', () => {
    expect(src).toMatch(/const total = cityTotal \+ loggedThis\.amountInr;/);
    expect(src).toMatch(/const prevTotal = cityPrev \+ loggedPrev\.amountInr;/);
  });

  it('reports the two halves separately, so neither can be mistaken for the other', () => {
    expect(src).toMatch(/cityInr: cityTotal,/);
    expect(src).toMatch(/loggedInr: loggedThis\.amountInr,/);
  });

  it('divides category percentages by the CITY total, not the combined one', () => {
    // THE SUBTLE ONE. A category showing "32%" of a number that includes
    // uncategorised cash is describing a share of something it is not a share
    // of — every bar on the page would be quietly short, and nothing would look
    // broken. If somebody ever "fixes" this to use `total`, this fails.
    expect(src).toMatch(/pct: cityTotal \? Math\.round\(\(amt \/ cityTotal\) \* 100\) : 0/);
    expect(src).not.toMatch(/pct: total \?/);
  });

  it('leaves the month arithmetic uncapped while the list is capped', () => {
    // paging.ts says it in its own header: a cap on a LIST is a slow query
    // avoided, a cap on a COMPUTATION is a wrong number shipped. `spendLog`
    // takes SPEND_LOG_CAP; `loggedInMonth` takes nothing.
    const list = src.slice(src.indexOf('async spendLog('), src.indexOf('async addSpendLog('));
    const month = src.slice(src.indexOf('private async loggedInMonth('), src.indexOf('async spendLog('));
    expect(list).toMatch(/take: SPEND_LOG_CAP/);
    expect(month).not.toMatch(/take:/);
    // AND THE INTENT IS DECLARED, not merely acted on. shared/unbounded-reads
    // .spec.ts requires every uncapped findMany to sit beside an
    // `// unbounded: <reason>` line, so the list-or-computation call is made
    // once, in writing, where the query is. I shipped this uncapped without the
    // comment first and the ceiling caught it; this asserts the two agree.
    expect(month).toMatch(/\/\/ unbounded: /);
  });

  it('scopes the delete by owner in the statement, not after reading', () => {
    // A delete that fetches, compares and then deletes is two round trips and
    // one race. Both keys in one WHERE cannot touch somebody else's row.
    expect(src).toMatch(/deleteMany\(\{ where: \{ id, userId \} \}\)/);
  });
});
