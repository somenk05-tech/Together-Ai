import { AstrologyService } from './astrology.service';

/**
 * SAVING YOUR BIRTH DETAILS IS NOT A REQUEST TO BURN YOUR LETTERS.
 *
 * THE DEFECT THIS FILE EXISTS FOR. `saveProfile()` ended with
 * `astroReading.deleteMany({ where: { userId } })` — every reading row the
 * citizen had. The intent was right and is still right: the letter for the
 * period you are in was written from the old chart, and after correcting your
 * birth details you must see the corrected one. But `dailyHistory()` and
 * `monthlyHistory()` serve the archive out of that same table, so the purge
 * also took thirty days of letters and two years of monthlies — for a typo in a
 * birth city, on a request that returned `{ saved: true }` and looked perfect.
 *
 * It is the same shape as the version-prefix defect that letter-archive.spec
 * was written for: the page renders, the request succeeds, the list is
 * legitimately empty, and nothing anywhere reports a problem. Its sentence is
 * the rule here too — A LETTER THAT WAS SENT WAS SENT.
 *
 * THE FAKE FILTERS FOR REAL, and that is the whole load-bearing part of this
 * file. A `deleteMany` mock that records its argument and deletes nothing
 * agrees with any implementation, including the one that deletes everything.
 * This one evaluates the `where` the way Postgres would and THROWS on an
 * operator it has not been taught, so a rewrite of the query cannot quietly
 * start passing.
 */

type Kind = 'daily' | 'monthly';
type Row = { kind: Kind; period: string; createdAt: Date; readingJson: string };

const letter = (date: string) => JSON.stringify({
  date, title: 'A Title Of The Right Length', salutation: 'Dear Somen,',
  body: `The letter for ${date}.`, signOff: 'With care,', words: 5,
});

const row = (kind: Kind, period: string, date: string, madeAt: string): Row =>
  ({ kind, period, createdAt: new Date(madeAt), readingJson: letter(date) });

/** Prisma's `where`, as much of it as this module actually uses. */
function matches(r: Row, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'userId') continue;               // the fixture table is one citizen's
    if (key === 'OR') {
      if (!(cond as Array<Record<string, unknown>>).some((c) => matches(r, c))) return false;
      continue;
    }
    if (key === 'kind') { if (r.kind !== cond) return false; continue; }
    if (key === 'period') {
      if (typeof cond === 'string') { if (r.period !== cond) return false; continue; }
      const c = cond as { startsWith?: string; endsWith?: string };
      if (c.startsWith !== undefined && !r.period.startsWith(c.startsWith)) return false;
      if (c.endsWith !== undefined && !r.period.endsWith(c.endsWith)) return false;
      if (c.startsWith === undefined && c.endsWith === undefined) throw new Error('unmodelled period filter');
      continue;
    }
    if (key === 'createdAt') {
      const c = cond as { gte?: Date; lt?: Date };
      if (c.gte !== undefined && r.createdAt.getTime() < new Date(c.gte).getTime()) return false;
      if (c.lt !== undefined && r.createdAt.getTime() >= new Date(c.lt).getTime()) return false;
      if (c.gte === undefined && c.lt === undefined) throw new Error('unmodelled createdAt filter');
      continue;
    }
    // Teach the fake before relying on it. A silently-ignored clause is a test
    // that passes for a query that deletes the wrong rows.
    throw new Error(`the fake does not model where.${key}`);
  }
  return true;
}

function svc(rows: Row[]) {
  const store = [...rows];
  const deletes: Array<Record<string, unknown>> = [];
  const prisma = {
    astroProfile: {
      upsert: (a: { create: Record<string, unknown> }) => Promise.resolve({
        id: 'p1', userId: 'u1', ...a.create, updatedAt: new Date(),
      }),
    },
    astroReading: {
      deleteMany: (a: { where: Record<string, unknown> }) => {
        deletes.push(a.where);
        const kept = store.filter((r) => !matches(r, a.where));
        const count = store.length - kept.length;
        store.length = 0; store.push(...kept);
        return Promise.resolve({ count });
      },
      findMany: (a: { where: { kind: Kind }; take: number }) => Promise.resolve(
        store.filter((r) => r.kind === a.where.kind)
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
          .slice(0, a.take),
      ),
    },
  };
  const masterProfile = { syncShared: () => Promise.resolve(undefined) };
  const s = new AstrologyService(prisma as never, masterProfile as never, null as never, null as never);
  return { s, store, deletes };
}

const DETAILS = {
  birthDate: '1985-05-22', birthTime: '09:15',
  birthCountry: 'India', birthState: 'Jharkhand', birthCity: 'Jamshedpur',
  timeZone: 'Asia/Calcutta',
};

/** 14:30 on 12 August where the citizen is, which is what decides every key. */
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-08-12T09:00:00Z')); });
afterEach(() => { jest.useRealTimers(); });

describe('saving birth details again', () => {
  it('drops the letters for right now and keeps every letter behind them', async () => {
    const { s, store } = svc([
      row('daily', 'v6:2026-08-12', '2026-08-12', '2026-08-12T02:00:00Z'),  // today
      row('daily', 'v5:2026-08-12', '2026-08-12', '2026-08-12T01:00:00Z'),  // today, older brief
      row('daily', '2026-08-12', '2026-08-12', '2026-08-12T00:30:00Z'),     // today, before versions
      row('daily', 'v6:2026-08-11', '2026-08-11', '2026-08-11T03:00:00Z'),  // yesterday
      row('daily', 'v6:2026-07-14', '2026-07-14', '2026-07-14T03:00:00Z'),  // last month
      row('monthly', 'v6:2026-08', '2026-08', '2026-08-01T03:00:00Z'),      // this month
      row('monthly', 'v6:2026-07', '2026-07', '2026-07-01T03:00:00Z'),      // last month
    ]);
    await s.saveProfile('u1', { ...DETAILS, birthCity: 'Ranchi' });
    expect(store.map((r) => r.period)).toEqual([
      'v6:2026-08-11', 'v6:2026-07-14', 'v6:2026-07',
    ]);
  });

  it('takes this month\'s letter even though it was written weeks ago', async () => {
    // The monthly is the reason the purge cannot be "anything written today":
    // it was written on the 1st and it is still the letter on screen.
    const { s, store } = svc([
      row('monthly', 'v6:2026-08', '2026-08', '2026-08-01T03:00:00Z'),
    ]);
    await s.saveProfile('u1', DETAILS);
    expect(store).toEqual([]);
  });

  it('takes today\'s letter even when the time zone is what changed', async () => {
    // Filed under the 13th by a +13 zone, written four minutes ago. The date
    // key no longer matches the citizen's day, so the second clause is what
    // catches it — and it still cannot reach a letter written before midnight.
    const { s, store } = svc([
      row('daily', 'v6:2026-08-13', '2026-08-13', '2026-08-12T08:56:00Z'),
      row('daily', 'v6:2026-08-11', '2026-08-11', '2026-08-11T03:00:00Z'),
    ]);
    await s.saveProfile('u1', DETAILS);
    expect(store.map((r) => r.period)).toEqual(['v6:2026-08-11']);
  });

  it('is a scoped delete, not a whole-citizen one', async () => {
    // Asserted on the QUERY as well, because a `deleteMany({ userId })` put
    // back here would pass every line above on a fixture that happens to hold
    // only current letters.
    const { s, deletes } = svc([]);
    await s.saveProfile('u1', DETAILS);
    expect(deletes).toHaveLength(1);
    expect(Object.keys(deletes[0]).sort()).toEqual(['OR', 'userId']);
  });

  it('leaves an archive the pages can still read', async () => {
    const { s } = svc([
      row('daily', 'v6:2026-08-12', '2026-08-12', '2026-08-12T02:00:00Z'),
      row('daily', 'v6:2026-08-11', '2026-08-11', '2026-08-11T03:00:00Z'),
      row('daily', 'v6:2026-08-10', '2026-08-10', '2026-08-10T03:00:00Z'),
      row('monthly', 'v6:2026-07', '2026-07', '2026-07-01T03:00:00Z'),
    ]);
    await s.saveProfile('u1', { ...DETAILS, birthTime: '09:45' });
    // The two pages the citizen opens after fixing a typo.
    expect((await s.dailyHistory('u1')).map((l) => l.date)).toEqual(['2026-08-11', '2026-08-10']);
    expect((await s.monthlyHistory('u1')).map((l) => l.date)).toEqual(['2026-07']);
  });

  it('still saves when the purge itself fails', async () => {
    // swallow(): a letter that cannot be dropped is a stale letter for a day,
    // not a birth date the citizen cannot correct.
    const prisma = {
      astroProfile: {
        upsert: (a: { create: Record<string, unknown> }) => Promise.resolve({
          id: 'p1', userId: 'u1', ...a.create, updatedAt: new Date(),
        }),
      },
      astroReading: { deleteMany: () => Promise.reject(new Error('no such table')) },
    };
    const s = new AstrologyService(
      prisma as never, { syncShared: () => Promise.resolve(undefined) } as never, null as never, null as never,
    );
    expect((await s.saveProfile('u1', DETAILS)).saved).toBe(true);
  });
});
