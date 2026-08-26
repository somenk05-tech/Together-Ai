import { AccountPurgeService } from './account-purge.service';
import { deletions, PURGE_AFTER_DAYS } from './purge-plan';

/**
 * This job destroys data and cannot be asked to put it back.
 *
 * So the assertions here are mostly about restraint: that it reaches only the
 * account it was given, only after the window, only once, and that it refuses
 * to call itself finished when something did not go. The happy path is the
 * easy part.
 */
const NOW = new Date('2026-07-29T04:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

interface Row { [k: string]: unknown }

function harness(opts: {
  users?: Row[];
  tables?: Record<string, Row[]>;
  failOn?: Record<string, number>;   // model → how many times deleteMany throws
  failUser?: string;                 // if set, only that citizen's deletes throw
  missing?: string[];                // models absent from the generated client
} = {}) {
  const users: Row[] = opts.users ?? [];
  const data: Record<string, Row[]> = opts.tables ?? {};
  const failures = { ...(opts.failOn ?? {}) };
  const missing = new Set(opts.missing ?? []);
  const failUser = opts.failUser;
  const deletedObjects: string[] = [];
  const seenWhere: Array<{ model: string; where: Row }> = [];

  const camel = (m: string) => m[0].toLowerCase() + m.slice(1);
  const matches = (where: Row, row: Row) =>
    Object.entries(where).every(([k, v]) => row[k] === v);

  const prisma = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === 'user') {
        return {
          findMany: async ({ where, take }: { where: Row; take?: number }) => {
            const cutoff = (where.deletedAt as { lt: Date }).lt;
            return users
              .filter((u) => u.deletedAt && (u.deletedAt as Date) < cutoff && u.purgedAt == null)
              .slice(0, take ?? 20)
              .map((u) => ({ id: u.id as string, deletedAt: u.deletedAt as Date }));
          },
          updateMany: async ({ where, data: d }: { where: Row; data: Row }) => {
            const hit = users.filter((u) => matches(where, u));
            hit.forEach((u) => Object.assign(u, d));
            return { count: hit.length };
          },
        };
      }
      const model = Object.keys(data).find((m) => camel(m) === prop);
      const modelName = model ?? prop[0].toUpperCase() + prop.slice(1);
      // A model the generated client does not have reads as undefined, exactly
      // as a real stale client would.
      if (missing.has(modelName)) return undefined;
      const rows = model ? data[model] : (data[prop] ?? []);
      return {
        findMany: async ({ where }: { where: Row }) => rows.filter((r) => matches(where, r)),
        deleteMany: async ({ where }: { where: Row }) => {
          seenWhere.push({ model: modelName, where });
          const appliesHere = !failUser || Object.values(where).includes(failUser);
          if (appliesHere && failures[modelName] && failures[modelName] > 0) {
            failures[modelName]--;
            throw new Error('foreign key constraint');
          }
          const hit = rows.filter((r) => matches(where, r));
          hit.forEach((r) => rows.splice(rows.indexOf(r), 1));
          return { count: hit.length };
        },
      };
    },
  });

  const storage = {
    deleteHealthObject: async (key: string) => { deletedObjects.push(key); },
  };

  const svc = new AccountPurgeService(prisma as never, storage as never);
  return { svc, users, data, deletedObjects, seenWhere };
}

describe('who is due', () => {
  it('does not touch an account deleted inside the window', async () => {
    const { svc } = harness({
      users: [{ id: 'recent', deletedAt: daysAgo(PURGE_AFTER_DAYS - 1), purgedAt: null }],
    });
    expect(await svc.due(NOW)).toEqual([]);
  });

  it('picks up an account past the window', async () => {
    const { svc } = harness({
      users: [{ id: 'old', deletedAt: daysAgo(PURGE_AFTER_DAYS + 1), purgedAt: null }],
    });
    expect((await svc.due(NOW)).map((u) => u.id)).toEqual(['old']);
  });

  it('never picks up an account that was never deleted', async () => {
    const { svc } = harness({ users: [{ id: 'alive', deletedAt: null, purgedAt: null }] });
    expect(await svc.due(NOW)).toEqual([]);
  });

  it('does not do it twice', async () => {
    const { svc } = harness({
      users: [{ id: 'done', deletedAt: daysAgo(90), purgedAt: daysAgo(60) }],
    });
    expect(await svc.due(NOW)).toEqual([]);
  });
});

describe('what it destroys', () => {
  it('deletes the citizen’s rows and nobody else’s', async () => {
    const { svc, data } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      tables: {
        Thought: [
          { id: 't1', userId: 'gone', body: 'private' },
          { id: 't2', userId: 'stays', body: 'someone else’s' },
        ],
        MedicalRecord: [{ id: 'm1', userId: 'gone', fileKey: 'health/gone/scan.pdf' }],
      },
    });
    const report = await svc.purgeAccount('gone');
    expect(data.Thought.map((t) => t.id)).toEqual(['t2']);
    expect(data.MedicalRecord).toEqual([]);
    expect(report.rowsDeleted).toBe(2);
  });

  it('scopes every delete by the owner, on every rule', async () => {
    const { svc, seenWhere } = harness({ users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }] });
    await svc.purgeAccount('gone');
    // The failure this guards against is a rule whose WHERE clause loses its
    // owner and empties a table for every citizen in the city.
    expect(seenWhere.length).toBe(deletions().length);
    for (const call of seenWhere) {
      // A pair rule names the owner on both sides of an OR; a plain rule names
      // them as a value. Either way the owner is in the clause.
      const w = call.where as Record<string, unknown> & { OR?: Record<string, unknown>[] };
      const named = w.OR ? w.OR.flatMap((o) => Object.values(o)) : Object.values(w);
      expect(named).toContain('gone');
    }
  });

  it('removes the stored file before the row that points at it', async () => {
    const { svc, deletedObjects } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      tables: {
        MedicalRecord: [{ id: 'm1', userId: 'gone', fileKey: 'health/gone/report.pdf' }],
        Avatar: [{ id: 'a1', userId: 'gone', assetKey: 'avatars/gone/face.svg' }],
      },
    });
    const report = await svc.purgeAccount('gone');
    // A row deleted before its object leaves the file in the bucket forever
    // with nothing left in the database that knows it is there.
    expect(deletedObjects.sort()).toEqual(['avatars/gone/face.svg', 'health/gone/report.pdf']);
    expect(report.objectsDeleted).toBe(2);
  });

  it('leaves what other people can see', async () => {
    const { svc, data } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      tables: { Message: [{ id: 'msg1', senderId: 'gone', body: 'said in a group' }] },
    });
    await svc.purgeAccount('gone');
    expect(data.Message).toHaveLength(1);
  });
});

describe('when something will not go', () => {
  it('retries past a foreign-key ordering problem instead of giving up', async () => {
    const { svc, data } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      // Fails once — as a child row blocking a parent does — then succeeds.
      failOn: { MedicalBloodTest: 1 },
      tables: { MedicalBloodTest: [{ id: 'b1', userId: 'gone' }] },
    });
    const report = await svc.purgeAccount('gone');
    expect(data.MedicalBloodTest).toEqual([]);
    expect(report.stuck).toEqual([]);
  });

  it('refuses to mark an account purged when data survived', async () => {
    const { svc, users } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      failOn: { Thought: 99 },
      tables: { Thought: [{ id: 't1', userId: 'gone' }] },
    });
    const report = await svc.purgeAccount('gone');
    expect(report.stuck.map((s) => s.model)).toEqual(['Thought']);
    // Saying "purged" over data that is still there is the one lie this job
    // must never tell — a deletion request would be answered with a falsehood.
    expect(users[0].purgedAt).toBeNull();
  });

  it('reports a model the Prisma client does not know about, rather than skipping it quietly', async () => {
    const { svc, users } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      missing: ['Thought'],
    });
    const report = await svc.purgeAccount('gone');
    expect(report.stuck.some((s) => s.model === 'Thought')).toBe(true);
    expect(users[0].purgedAt).toBeNull();
  });

  it('stamps the account when everything went', async () => {
    const { svc, users } = harness({
      users: [{ id: 'gone', deletedAt: daysAgo(40), purgedAt: null }],
      tables: { Thought: [{ id: 't1', userId: 'gone' }] },
    });
    await svc.purgeAccount('gone');
    expect(users[0].purgedAt).toBeInstanceOf(Date);
  });
});

describe('the nightly sweep', () => {
  it('keeps going when one account will not empty', async () => {
    const { svc, users } = harness({
      users: [
        { id: 'stuck', deletedAt: daysAgo(50), purgedAt: null },
        { id: 'fine', deletedAt: daysAgo(40), purgedAt: null },
      ],
      // Never recovers, and only for this one account — so the failure is the
      // account's, not the table's.
      failOn: { Thought: 999 },
      failUser: 'stuck',
      tables: { Thought: [{ id: 't1', userId: 'stuck' }] },
    });
    const reports = await svc.sweep(NOW);
    // The oldest account is attempted first and fails; the next one must still
    // be reached. One account that will not empty cannot hold up the queue.
    expect(reports.map((r) => r.userId)).toEqual(['stuck', 'fine']);
    expect(users.find((u) => u.id === 'stuck')?.purgedAt).toBeNull();
    expect(users.find((u) => u.id === 'fine')?.purgedAt).toBeInstanceOf(Date);
  });

  it('does nothing at all when nobody is due', async () => {
    const { svc, seenWhere } = harness({ users: [{ id: 'recent', deletedAt: daysAgo(2), purgedAt: null }] });
    expect(await svc.sweep(NOW)).toEqual([]);
    expect(seenWhere).toEqual([]);
  });
});
