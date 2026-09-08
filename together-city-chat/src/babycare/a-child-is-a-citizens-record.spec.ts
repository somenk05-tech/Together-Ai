import { BabyCareService } from './babycare.service';

/**
 * A CHILD IS A CITIZEN'S RECORD, AND STAYS THAT WAY.
 *
 * Four promises this district makes out loud, each of which is a comment
 * somewhere until it is a test:
 *
 *  1. NOTHING REACHES ANOTHER PERSON'S CHILD. Every read and write carries the
 *     asker's userId in the WHERE, so a leaked child id is still not a key.
 *     This matters more here than it does one hub over: a child's name and date
 *     of birth are the two facts an impersonation is built out of.
 *  2. AN EDIT IS PARTIAL, AND A NULL IS A CLEAR. The form sends one box at a
 *     time, so a birthday saved on one screen must survive a notes field saved
 *     on another — and a parent who wants a birthday GONE must be able to take
 *     it out, which is why `null` and `undefined` mean different things.
 *  3. NO AGE IS STORED. The row holds a birthday and nothing derived from it.
 *  4. THE CAP IS IN THE SERVICE. A limit that lives only in a form is not one.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

function bare(): any {
  const svc: any = Object.create(BabyCareService.prototype);
  const rows: any[] = [];
  const hit = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);

  svc.__rows = rows;
  svc.prisma = {
    child: {
      findMany: ({ where }: any) => Promise.resolve(rows.filter((r) => hit(r, where))),
      findFirst: ({ where }: any) => Promise.resolve(rows.find((r) => hit(r, where)) ?? null),
      count: ({ where }: any) => Promise.resolve(rows.filter((r) => hit(r, where)).length),
      create: ({ data }: any) => {
        const row = { id: `child-${rows.length + 1}`, createdAt: new Date(), ...data };
        rows.push(row);
        return Promise.resolve(row);
      },
      updateMany: ({ where, data }: any) => {
        const hits = rows.filter((r) => hit(r, where));
        for (const r of hits) Object.assign(r, data);
        return Promise.resolve({ count: hits.length });
      },
      deleteMany: ({ where }: any) => {
        const hits = rows.filter((r) => hit(r, where));
        for (const r of hits) rows.splice(rows.indexOf(r), 1);
        return Promise.resolve({ count: hits.length });
      },
    },
  };
  return svc;
}

describe('a child is a citizen’s record', () => {
  it('lists only the asker’s own children', async () => {
    const svc = bare();
    await svc.create('u1', { name: 'Aarav', dob: '2025-06-01' });
    await svc.create('u2', { name: 'Zoya', dob: '2024-01-01' });

    expect((await svc.list('u1')).map((c: any) => c.name)).toEqual(['Aarav']);
    expect((await svc.list('u2')).map((c: any) => c.name)).toEqual(['Zoya']);
  });

  it('refuses an edit to somebody else’s child even with the right id', async () => {
    const svc = bare();
    const mine = await svc.create('u1', { name: 'Aarav', dob: '2025-06-01' });

    await expect(svc.update('u2', mine.id, { name: 'Taken' })).rejects.toThrow();
    expect((await svc.list('u1'))[0].name).toBe('Aarav');
  });

  it('refuses a delete of somebody else’s child even with the right id', async () => {
    const svc = bare();
    const mine = await svc.create('u1', { name: 'Aarav' });

    await expect(svc.remove('u2', mine.id)).rejects.toThrow();
    expect(await svc.list('u1')).toHaveLength(1);
  });

  it('merges an edit rather than replacing the row', async () => {
    const svc = bare();
    const c = await svc.create('u1', { name: 'Aarav', dob: '2025-06-01', notes: 'eczema' });

    await svc.update('u1', c.id, { notes: 'eczema, no fragrance' });
    const after = (await svc.list('u1'))[0];
    expect(after).toMatchObject({ name: 'Aarav', dob: '2025-06-01', notes: 'eczema, no fragrance' });
  });

  it('tells a cleared birthday apart from an unmentioned one', async () => {
    const svc = bare();
    const c = await svc.create('u1', { name: 'Aarav', dob: '2025-06-01' });

    // Absent: leave it alone.
    await svc.update('u1', c.id, { name: 'Aarav K' });
    expect((await svc.list('u1'))[0].dob).toBe('2025-06-01');

    // Null: take it out.
    await svc.update('u1', c.id, { dob: null });
    expect((await svc.list('u1'))[0].dob).toBeNull();
  });

  it('stores a birthday and nothing derived from it', async () => {
    const svc = bare();
    await svc.create('u1', { name: 'Aarav', dob: '2025-06-01' });
    const row = svc.__rows[0];
    for (const key of ['age', 'ageMonths', 'band', 'ageBand']) {
      expect({ key, present: key in row }).toEqual({ key, present: false });
    }
  });

  it('caps a household at twenty children, in the service', async () => {
    const svc = bare();
    for (let i = 0; i < 20; i += 1) await svc.create('u1', { name: `Child ${i}` });
    await expect(svc.create('u1', { name: 'Twenty-first' })).rejects.toThrow();
    // and the cap is per account
    await expect(svc.create('u2', { name: 'Somebody else’s' })).resolves.toBeTruthy();
  });

  it('trims a name and defaults the notes to empty rather than null', async () => {
    const svc = bare();
    const c = await svc.create('u1', { name: '  Aarav  ' });
    expect(c.name).toBe('Aarav');
    expect(c.notes).toBe('');
  });
});
