import { DaybookService } from './daybook.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * THE DAYBOOK KEEPS THE DAY, AND KEEPS IT TO ITSELF.
 *
 * Four promises are worth a test rather than a comment:
 *
 *  1. A PARTIAL SAVE IS PARTIAL. The page is three fields written at three
 *     different moments — a mood in the morning, a line at lunch, the writing
 *     at night. A save that carried all three would let the last screen open
 *     erase the other two, which for a diary is not a bug you notice in time.
 *  2. NOTHING REACHES ANOTHER PERSON'S DAY. Every read and write carries the
 *     asker's userId in the WHERE, so a leaked item id is still not a key.
 *  3. AN EMPTY DAY IS A REAL ANSWER. It comes back empty, not pre-filled.
 *  4. A PHOTOGRAPH IS PRIVATE, AND STAYS THAT WAY. Its key is never handed to
 *     a browser, a key from another namespace cannot be filed, and removing a
 *     picture removes the file rather than just the row that pointed at it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(over: Partial<Record<string, any>> = {}) {
  const svc: any = Object.create(DaybookService.prototype);
  svc.__pages = new Map<string, any>();
  svc.__items = [] as any[];
  svc.__photos = [] as any[];
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
    dayPhoto: {
      findMany: async ({ where }: any) => svc.__photos.filter((p: any) => matches(p, where)),
      findFirst: async ({ where }: any) => svc.__photos.find((p: any) => p.id === where.id && p.userId === where.userId) ?? null,
      create: async ({ data }: any) => { svc.__photos.push({ id: `p${svc.__photos.length + 1}`, createdAt: new Date(0), ...data }); },
      delete: async ({ where }: any) => { svc.__photos = svc.__photos.filter((p: any) => p.id !== where.id); },
    },
  };
  /* The vault, as far as this service is concerned: a place a key either is or
     is not, that hands out links and forgets things. `__gone` is what makes the
     "the file goes too" test a test rather than a hope. */
  svc.__gone = [] as string[];
  svc.storage = {
    presignPrivateDownload: async (key: string) => `https://vault.example/${key}?signature=…`,
    privateObjectExists: async () => true,
    deletePrivateObject: async (key: string) => { svc.__gone.push(key); },
    presignDaybookUpload: async (userId: string) => ({ uploadUrl: 'https://vault.example/put', key: `daybook/${userId}/x.jpg`, expiresInSec: 900 }),
  };
  Object.assign(svc, over);
  return svc;
}

describe('a day, as they left it', () => {
  it('an empty day is empty — nothing is invented to fill it', async () => {
    const svc = bare();
    const d = await svc.day('u1', '2026-08-15');
    expect(d).toEqual({ date: '2026-08-15', mood: null, feelNote: null, journal: null, reflection: {}, items: [], photos: [] });
  });

  it('the looking-back sheet fills a box at a time, and never wipes the others', async () => {
    /* THE FIELD-LEVEL PARTIAL SAVE, ONE LEVEL DOWN. Eleven answers share a
       single JSON column and each is written on its own as somebody tabs out
       of a box. A save that replaced the object would mean answering "what
       went well" erases the three things they were grateful for — which is
       exactly the bug the partial save exists to prevent, reintroduced inside
       a column, and invisible until somebody loses an evening's writing. */
    const svc = bare();
    await svc.save('u1', '2026-08-15', { reflection: { grateful1: 'the rain', grateful2: 'a call' } });
    await svc.save('u1', '2026-08-15', { reflection: { wentWell: 'the meeting' } });
    await svc.save('u1', '2026-08-15', { reflection: { feeling: 7 } });
    const d = await svc.day('u1', '2026-08-15');
    expect(d.reflection).toEqual({ grateful1: 'the rain', grateful2: 'a call', wentWell: 'the meeting', feeling: 7 });
    // …and an emptied box is cleared rather than left standing, the rule the
    // mood chips earned.
    await svc.save('u1', '2026-08-15', { reflection: { grateful2: '' } });
    expect((await svc.day('u1', '2026-08-15')).reflection).toEqual({ grateful1: 'the rain', wentWell: 'the meeting', feeling: 7 });
    // The sheet does not disturb the writing beside it.
    await svc.save('u1', '2026-08-15', { journal: 'The long version.' });
    const after = await svc.day('u1', '2026-08-15');
    expect(after.journal).toBe('The long version.');
    expect(after.reflection.wentWell).toBe('the meeting');
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

  it('a photograph is filed, shown by a link that expires, and never by its key', async () => {
    const svc = bare();
    await svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u1/a.jpg', mimeType: 'image/jpeg', sizeBytes: 1234 });
    const d = await svc.day('u1', '2026-08-15');
    expect(d.photos).toHaveLength(1);
    expect(d.photos[0].url).toContain('signature');
    /* NO KEY FIELD ON THE RECORD. A signed GET necessarily contains the object
       path, so this is not a claim that the browser can never see the string —
       it is that the key is not a DATUM the API hands over, to be stored, sent
       on, or filed back. (Which is also why ownership is proved by the
       namespace rather than by the key being a secret: a citizen holding their
       own key holds nothing they did not already have.) */
    expect(Object.keys(d.photos[0]).sort()).toEqual(['createdAt', 'id', 'url']);
  });

  it('a key from somebody else’s namespace cannot be filed as your memory', async () => {
    const svc = bare();
    await expect(svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u2/theirs.jpg' })).rejects.toThrow();
    // …and the same for a key belonging to another FEATURE of your own account.
    await expect(svc.addPhoto('u1', '2026-08-15', { fileKey: 'health/u1/scan.pdf' })).rejects.toThrow();
    expect((await svc.day('u1', '2026-08-15')).photos).toHaveLength(0);
  });

  it('a picture the browser never finished uploading is not filed at all', async () => {
    // Otherwise the row survives the failure and the day shows a broken frame
    // where a memory is supposed to be — a worse lie than showing nothing.
    const svc = bare();
    svc.storage.privateObjectExists = async () => false;
    await expect(svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u1/never-arrived.jpg' })).rejects.toThrow();
    expect((await svc.day('u1', '2026-08-15')).photos).toHaveLength(0);
  });

  it('removing a picture removes the file, not just the row pointing at it', async () => {
    const svc = bare();
    await svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u1/a.jpg' });
    const id = (await svc.day('u1', '2026-08-15')).photos[0].id;
    // Another citizen holding the id still cannot reach it.
    expect(await svc.removePhoto('u2', id)).toBeNull();
    expect(svc.__gone).toEqual([]);
    const after = await svc.removePhoto('u1', id);
    expect(after.photos).toHaveLength(0);
    expect(svc.__gone).toEqual(['daybook/u1/a.jpg']);
  });

  it('and only a picture is offered a place to land', async () => {
    const svc = bare();
    expect(() => svc.presignPhoto('u1', 'application/pdf', 1000)).toThrow();
    expect(() => svc.presignPhoto('u1', 'image/jpeg', 999 * 1024 * 1024)).toThrow();
    expect(StorageProvider.isOwnDaybookKey('u1', (await svc.presignPhoto('u1', 'image/jpeg', 1000)).key)).toBe(true);
  });

  it('the month answers with counts, never with contents', async () => {
    const svc = bare();
    await svc.add('u1', '2026-08-15', { kind: 'task', title: 'Something private' });
    await svc.save('u1', '2026-08-15', { mood: 'quiet', journal: 'Something else private' });
    // A neighbour's day in the same month must not appear in this month.
    await svc.add('u2', '2026-08-16', { kind: 'task', title: 'Not yours' });
    await svc.save('u2', '2026-08-16', { mood: 'busy' });
    const m = await svc.month('u1', '2026-08');
    expect(m['2026-08-15']).toEqual({ items: 1, written: true, mood: 'quiet', photo: null, photos: 0 });
    expect(m['2026-08-16']).toBeUndefined();
    // The grid learns THAT the day holds something, not what.
    expect(JSON.stringify(m)).not.toContain('private');
  });

  it('and the month carries the first picture of a day, and none of its words', async () => {
    // The owner's call, 15 Aug: a month of photographs is what makes this a
    // scrapbook. A picture glanced at across a room is a memory; a sentence
    // read across a room is something somebody wrote down in confidence — so
    // the writing stays behind the door and only the picture comes out.
    const svc = bare();
    await svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u1/first.jpg' });
    await svc.addPhoto('u1', '2026-08-15', { fileKey: 'daybook/u1/second.jpg' });
    await svc.save('u1', '2026-08-15', { journal: 'Something else private' });
    const m = await svc.month('u1', '2026-08');
    expect(m['2026-08-15'].photos).toBe(2);
    expect(m['2026-08-15'].photo).toContain('first.jpg');
    expect(JSON.stringify(m)).not.toContain('private');
  });
});
