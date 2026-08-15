import { DaybookService } from './daybook.service';

/**
 * THE DAYBOOK KEEPS THE DAY, AND KEEPS IT TO ITSELF.
 *
 * Three promises are worth a test rather than a comment:
 *
 *  1. A PARTIAL SAVE IS PARTIAL. The page is three fields written at three
 *     different moments — a mood in the morning, a line at lunch, the writing
 *     at night. A save that carried all three would let the last screen open
 *     erase the other two, which for a diary is not a bug you notice in time.
 *  2. NOTHING REACHES ANOTHER PERSON'S DAY. Every read and write carries the
 *     asker's userId in the WHERE, so a leaked item id is still not a key.
 *  3. AN EMPTY DAY IS A REAL ANSWER. It comes back empty, not pre-filled.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(over: Partial<Record<string, any>> = {}) {
  const svc: any = Object.create(DaybookService.prototype);
  svc.__pages = new Map<string, any>();
  svc.__items = [] as any[];
  /**
   * THE DOUBLE HAS TO SPEAK THE QUERY THE SERVICE ACTUALLY WRITES.
   *
   * The first version of this file understood `date: '2026-08-15'` and not
   * `date: { gte, lte }` — so `month()`, which asks for a range, matched
   * nothing and the month test failed with `items: 0` while the service was
   * correct. A fake that only understands the queries you remembered writing
   * will fail the ones you did, so this one implements both forms, once, for
   * both tables. (The range itself is lexicographic on YYYY-MM-DD, which is
   * why the sentinels are -00 and -99: no real date sorts outside them, and
   * no date of another month sorts inside.)
   */
  const matches = (row: any, where: any) => {
    if (where.userId && row.userId !== where.userId) return false;
    const d = where.date;
    if (d === undefined) return true;
    if (typeof d === 'string') return row.date === d;
    if (d.gte !== undefined && row.date < d.gte) return false;
    if (d.lte !== undefined && row.date > d.lte) return false;
    return true;
  };
  svc.prisma = {
    dayPage: {
      findUnique: async ({ where }: any) => svc.__pages.get(`${where.userId_date.userId}:${where.userId_date.date}`) ?? null,
      findMany: async ({ where }: any = {}) => [...svc.__pages.values()].filter((p: any) => matches(p, where ?? {})),
      upsert: async ({ where, update, create }: any) => {
        const key = `${where.userId_date.userId}:${where.userId_date.date}`;
        const now = svc.__pages.get(key);
        svc.__pages.set(key, now ? { ...now, ...update } : { ...create, userId: where.userId_date.userId, date: where.userId_date.date });
      },
    },
    dayItem: {
      findMany: async ({ where }: any) => svc.__items.filter((i: any) => matches(i, where)),
      findFirst: async ({ where }: any) => svc.__items.find((i: any) => i.id === where.id && i.userId === where.userId) ?? null,
      create: async ({ data }: any) => { svc.__items.push({ id: `i${svc.__items.length + 1}`, done: false, ...data }); },
      update: async ({ where, data }: any) => {
        const row = svc.__items.find((i: any) => i.id === where.id);
        Object.assign(row, data);
      },
      delete: async ({ where }: any) => { svc.__items = svc.__items.filter((i: any) => i.id !== where.id); },
    },
  };
  Object.assign(svc, over);
  return svc;
}

describe('a day, as they left it', () => {
  it('an empty day is empty — nothing is invented to fill it', async () => {
    const svc = bare();
    const d = await svc.day('u1', '2026-08-15');
    expect(d).toEqual({ date: '2026-08-15', mood: null, feelNote: null, journal: null, items: [] });
  });

  it('a partial save touches only what it names', async () => {
    const svc = bare();
    await svc.save('u1', '2026-08-15', { mood: 'quiet', feelNote: 'slept badly' });
    await svc.save('u1', '2026-08-15', { journal: 'The long version.' });
    const d = await svc.day('u1', '2026-08-15');
    // The evening's writing did not wipe the morning's mood.
    expect(d.mood).toBe('quiet');
    expect(d.feelNote).toBe('slept badly');
    expect(d.journal).toBe('The long version.');
  });

  it('an emptied field is cleared rather than left standing', async () => {
    const svc = bare();
    await svc.save('u1', '2026-08-15', { mood: 'low' });
    await svc.save('u1', '2026-08-15', { mood: '' });
    expect((await svc.day('u1', '2026-08-15')).mood).toBeNull();
  });
});

describe('what is on the day', () => {
  it('a line lands on its day, and can be ticked', async () => {
    const svc = bare();
    await svc.add('u1', '2026-08-15', { kind: 'reminder', title: '  Call Rahul  ', at: '17:00' });
    const d = await svc.day('u1', '2026-08-15');
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ kind: 'reminder', title: 'Call Rahul', at: '17:00', done: false });
    const after = await svc.update('u1', d.items[0].id, { done: true });
    expect(after.items[0].done).toBe(true);
  });

  it('most of what people mean to do has no hour, and that is not a missing value', async () => {
    const svc = bare();
    await svc.add('u1', '2026-08-15', { kind: 'task', title: 'Finish the architecture' });
    expect((await svc.day('u1', '2026-08-15')).items[0].at).toBeNull();
  });
});

describe('and it belongs to one person', () => {
  it('another citizen cannot tick, edit or delete your line — the id is not a key', async () => {
    const svc = bare();
    await svc.add('u1', '2026-08-15', { kind: 'task', title: 'Mine' });
    const id = (await svc.day('u1', '2026-08-15')).items[0].id;
    expect(await svc.update('u2', id, { done: true })).toBeNull();
    expect(await svc.remove('u2', id)).toBeNull();
    // …and it is still there, untouched.
    expect((await svc.day('u1', '2026-08-15')).items[0].done).toBe(false);
  });

  it('the month answers with counts, never with contents', async () => {
    const svc = bare();
    await svc.add('u1', '2026-08-15', { kind: 'task', title: 'Something private' });
    await svc.save('u1', '2026-08-15', { mood: 'quiet', journal: 'Something else private' });
    // A neighbour's day in the same month must not appear in this month.
    await svc.add('u2', '2026-08-16', { kind: 'task', title: 'Not yours' });
    await svc.save('u2', '2026-08-16', { mood: 'busy' });
    const m = await svc.month('u1', '2026-08');
    expect(m['2026-08-15']).toEqual({ items: 1, written: true, mood: 'quiet' });
    expect(m['2026-08-16']).toBeUndefined();
    // The grid learns THAT the day holds something, not what.
    expect(JSON.stringify(m)).not.toContain('private');
  });
});
