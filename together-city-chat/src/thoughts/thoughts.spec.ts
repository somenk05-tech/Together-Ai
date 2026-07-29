import { NotFoundException } from '@nestjs/common';
import { ThoughtsService } from './thoughts.service';

/**
 * A journal nobody else can read.
 *
 * Every assertion here is really the same one: the userId is in the query, not
 * in a check beside it. A thought has no audience, so there is no read of one
 * that is not its author reading their own.
 */

const NOW = new Date('2026-07-29T10:00:00Z');

function serviceWith(rows: Array<Record<string, unknown>>) {
  const calls: Array<{ op: string; where?: any; data?: any }> = [];
  const match = (where: any, r: any) =>
    (where.id === undefined || r.id === where.id) &&
    (where.userId === undefined || r.userId === where.userId) &&
    (where.deletedAt !== null || r.deletedAt === null);

  const table = {
    findMany: jest.fn(async ({ where, take }: any) => {
      calls.push({ op: 'findMany', where });
      return rows.filter((r) => match(where, r)).slice(0, take);
    }),
    findFirst: jest.fn(async ({ where }: any) => {
      calls.push({ op: 'findFirst', where });
      return rows.find((r) => match(where, r)) ?? null;
    }),
    create: jest.fn(async ({ data }: any) => {
      calls.push({ op: 'create', data });
      const row = { id: 'new', createdAt: NOW, updatedAt: NOW, deletedAt: null, visibility: 'private', ...data };
      rows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      calls.push({ op: 'updateMany', where, data });
      const hit = rows.filter((r) => match(where, r));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    }),
  };
  const svc = new ThoughtsService({ thought: table } as never);
  return { svc, table, calls };
}

const thought = (over: Record<string, unknown> = {}) => ({
  id: 't1', userId: 'me', title: 'Monday', body: 'A quiet day.', mood: 'calm',
  tags: 'work,calm', visibility: 'private', createdAt: NOW, updatedAt: NOW, deletedAt: null, ...over,
});

describe('thoughts are private to their author', () => {
  it('lists only your own', async () => {
    const { svc, calls } = serviceWith([thought(), thought({ id: 't2', userId: 'someone-else' })]);
    const out = await svc.list('me', {});
    expect(out.items.map((t) => t.id)).toEqual(['t1']);
    expect(calls[0].where.userId).toBe('me'); // scoped in the query, not after it
  });

  it('answers 404 for someone else’s thought rather than confirming it exists', async () => {
    const { svc } = serviceWith([thought({ userId: 'someone-else' })]);
    await expect(svc.get('me', 't1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to update a thought that is not yours, and changes nothing', async () => {
    const rows = [thought({ userId: 'someone-else', body: 'theirs' })];
    const { svc } = serviceWith(rows);
    await expect(svc.update('me', 't1', { body: 'mine now' })).rejects.toBeInstanceOf(NotFoundException);
    expect(rows[0].body).toBe('theirs');
  });

  it('refuses to delete a thought that is not yours, and it survives', async () => {
    const rows = [thought({ userId: 'someone-else' })];
    const { svc } = serviceWith(rows);
    await expect(svc.remove('me', 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(rows[0].deletedAt).toBeNull();
  });
});

describe('writing and editing', () => {
  it('stores tags comma-separated and returns them as a list', async () => {
    const { svc, calls } = serviceWith([]);
    const out = await svc.create('me', { body: 'Hello', tags: ['work', 'calm'] });
    expect(calls[0].data.tags).toBe('work,calm');
    expect(out.tags).toEqual(['work', 'calm']);
  });

  it('dedupes and drops blank tags', async () => {
    const { svc, calls } = serviceWith([]);
    await svc.create('me', { body: 'Hello', tags: ['work', 'work', '  ', 'calm'] });
    expect(calls[0].data.tags).toBe('work,calm');
  });

  it('stores no tags as null rather than an empty string', async () => {
    const { svc, calls } = serviceWith([]);
    await svc.create('me', { body: 'Hello' });
    expect(calls[0].data.tags).toBeNull();
  });

  it('leaves untouched fields alone on a partial edit', async () => {
    const rows = [thought()];
    const { svc, calls } = serviceWith(rows);
    await svc.update('me', 't1', { mood: 'tired' });
    const data = calls.find((c) => c.op === 'updateMany')!.data;
    expect(data).toEqual({ mood: 'tired' });   // body and title not overwritten with undefined
    expect(rows[0].body).toBe('A quiet day.');
  });

  it('can clear a title back to nothing', async () => {
    // null is a value here; undefined means "leave it".
    const { svc, calls } = serviceWith([thought()]);
    await svc.update('me', 't1', { title: null });
    expect(calls.find((c) => c.op === 'updateMany')!.data).toEqual({ title: null });
  });
});

describe('deleting', () => {
  it('is soft, and the thought leaves every list at once', async () => {
    const rows = [thought()];
    const { svc } = serviceWith(rows);
    await expect(svc.remove('me', 't1')).resolves.toEqual({ ok: true });
    expect(rows[0].deletedAt).toBeInstanceOf(Date);
    const out = await svc.list('me', {});
    expect(out.items).toEqual([]);
  });

  it('cannot be deleted twice', async () => {
    const { svc } = serviceWith([thought({ deletedAt: NOW })]);
    await expect(svc.remove('me', 't1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('pagination', () => {
  it('returns a cursor only when there is more to read', async () => {
    const many = Array.from({ length: 25 }, (_, i) => thought({ id: `t${i}` }));
    const { svc } = serviceWith(many);
    const page = await svc.list('me', { limit: 10 });
    expect(page.items).toHaveLength(10);
    expect(page.nextCursor).toBe('t9');
  });

  it('has no cursor on the last page', async () => {
    const { svc } = serviceWith([thought()]);
    const page = await svc.list('me', { limit: 10 });
    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });
});
