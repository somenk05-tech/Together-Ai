import { AstrologyService } from './astrology.service';

/**
 * An archive that hides letters is not an archive.
 *
 * THE DEFECT THIS FILE EXISTS FOR. `recentLetters()` read the saved letters
 * through `period: { startsWith: 'v6:' }`. The version prefix is a CACHE key —
 * it exists so that changing the brief does not leave everybody reading
 * yesterday's cached letter until their own midnight. Reading HISTORY through
 * it meant that the moment v5 became v6, every letter a citizen had ever been
 * sent disappeared from their own archive, on both pages, at once. The archive
 * shipped and the owner looked at an empty page with a month of letters behind
 * it.
 *
 * It is the worst shape a bug can have: the page renders, the request succeeds,
 * the list is legitimately empty, and nothing anywhere reports a problem. It
 * shows up only as an absence, and it would come back at the next bump unless
 * something fails first. That is what these are.
 *
 * They drive the two public history methods rather than the private helper, so
 * they also break if either page is ever wired to something else.
 */

const letter = (date: string, over: Record<string, unknown> = {}) => JSON.stringify({
  date, title: 'A Title Of The Right Length', salutation: 'Dear Somen,',
  body: `The letter for ${date}.`, signOff: 'With care,', words: 5, ...over,
});

/** `createdAt` is what the query orders by, so the fixtures carry a real one. */
const row = (period: string, date: string, madeAt: string, json = letter(date)) =>
  ({ period, readingJson: json, createdAt: new Date(madeAt) });

/**
 * The fake obeys the `orderBy` it is handed, and the `startsWith` if there is
 * one. A mock that quietly returns rows in the order the test listed them
 * cannot fail on a wrong query — it would agree with any implementation, which
 * is exactly how this defect survived having tests around it.
 */
function svc(rows: Array<{ period: string; readingJson: string; createdAt: Date }>) {
  const asked: Array<{ where: Record<string, unknown>; orderBy: unknown; take: number }> = [];
  const prisma = {
    astroReading: {
      findMany: (a: { where: { period?: { startsWith?: string } }; orderBy: Record<string, string>; take: number }) => {
        asked.push(a as never);
        const prefix = a.where.period?.startsWith;
        const kept = prefix ? rows.filter((r) => r.period.startsWith(prefix)) : [...rows];
        const by = Object.keys(a.orderBy)[0];
        kept.sort((x, y) => (by === 'period'
          ? y.period.localeCompare(x.period)
          : y.createdAt.getTime() - x.createdAt.getTime()));
        return Promise.resolve(kept.slice(0, a.take));
      },
    },
  };
  return { s: new AstrologyService(prisma as never, null as never, null as never, null as never), asked };
}

describe('the letters somebody has been sent', () => {
  it('does not filter them by the version of the brief that wrote them', async () => {
    const { s, asked } = svc([
      row('v6:2026-08-11', '2026-08-11', '2026-08-11T04:00:00Z'),
      row('v5:2026-08-09', '2026-08-09', '2026-08-09T04:00:00Z'),
      row('2026-08-07', '2026-08-07', '2026-08-07T04:00:00Z'), // older than the prefix itself
    ]);
    expect((await s.dailyHistory('u1')).map((l) => l.date))
      .toEqual(['2026-08-11', '2026-08-09', '2026-08-07']);
    // Asserted on the QUERY as well, because a `startsWith` put back here would
    // still pass the line above on fixtures that all happen to be current.
    expect(asked[0].where).toEqual({ userId: 'u1', kind: 'daily' });
  });

  it('orders by when the letter was written, not by the period string', async () => {
    // `period` sorts every v6 above every v5: February of this version would
    // stand above August of the last one.
    const { s } = svc([
      row('v6:2026-02', '2026-02', '2026-02-01T04:00:00Z'),
      row('v5:2026-08', '2026-08', '2026-08-01T04:00:00Z'),
    ]);
    expect((await s.monthlyHistory('u1')).map((l) => l.date)).toEqual(['2026-08', '2026-02']);
  });

  it('shows one letter per date when a bump left two rows for one day', async () => {
    const { s } = svc([
      row('v5:2026-08-10', '2026-08-10', '2026-08-10T03:00:00Z', letter('2026-08-10', { body: 'The long one.' })),
      row('v6:2026-08-10', '2026-08-10', '2026-08-10T23:00:00Z', letter('2026-08-10', { body: 'The short one.' })),
    ]);
    // Both were really sent. The one that was on screen last is the one kept.
    expect((await s.dailyHistory('u1')).map((l) => [l.date, l.body]))
      .toEqual([['2026-08-10', 'The short one.']]);
  });

  it('keeps a letter that has no title, because it predates titles', async () => {
    const { s } = svc([
      row('v5:2026-08-02', '2026-08-02', '2026-08-02T04:00:00Z', letter('2026-08-02', { title: undefined })),
    ]);
    const out = await s.dailyHistory('u1');
    expect([out.length, out[0].title, out[0].body]).toEqual([1, undefined, 'The letter for 2026-08-02.']);
  });

  it('drops a row that is not a letter at all, rather than listing an empty one', async () => {
    const { s } = svc([
      row('2026-07-30', '2026-07-30', '2026-07-30T04:00:00Z', JSON.stringify({ sections: [], lucky: { number: 7 } })),
      row('2026-07-29', '2026-07-29', '2026-07-29T04:00:00Z', 'not json at all'),
      row('v6:2026-08-11', '2026-08-11', '2026-08-11T04:00:00Z'),
    ]);
    expect((await s.dailyHistory('u1')).map((l) => l.date)).toEqual(['2026-08-11']);
  });

  it('over-fetches, so a collapsed pair costs a row rather than a day', async () => {
    const { s, asked } = svc([]);
    await s.dailyHistory('u1');
    await s.monthlyHistory('u1');
    // Thirty days and twenty-four months are the promises the pages make.
    expect([asked[0].take, asked[1].take]).toEqual([60, 48]);
  });

  it('is an empty list, not a failure, when the table cannot be read', async () => {
    const prisma = { astroReading: { findMany: () => Promise.reject(new Error('no such table')) } };
    const s = new AstrologyService(prisma as never, null as never, null as never, null as never);
    expect(await s.dailyHistory('u1')).toEqual([]);
  });
});
