/**
 * Golden master — what the lookup service DOES, recorded before anything
 * changes it. Not aspirational: these snapshots are the current behaviour,
 * bugs included, so the next change produces a readable diff.
 */
import { LookupsService } from './lookups.service';

function build(rows: unknown[] = [], fail = false) {
  const svc = Object.create(LookupsService.prototype) as LookupsService;
  const calls: unknown[] = [];
  (svc as any).logger = { warn: () => undefined, log: () => undefined };
  (svc as any).prisma = {
    lookup: {
      findMany: async (args: unknown) => { calls.push(args); if (fail) throw new Error('db down'); return rows; },
    },
  };
  return { svc, calls };
}

describe('lookups golden master', () => {
  it('a blank category never touches the database', async () => {
    const { svc, calls } = build();
    expect(await svc.list('')).toEqual([]);
    expect(await svc.list('   ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  it('query shape: trim, parent filter, case-insensitive search', async () => {
    const { svc, calls } = build();
    await svc.list(' city ', ' IN-MH ', ' pun ');
    expect(calls[0]).toMatchSnapshot();
  });

  it('limit is clamped to [1, 500]', async () => {
    const { svc, calls } = build();
    await svc.list('city', undefined, undefined, 0);
    await svc.list('city', undefined, undefined, 9999);
    expect(calls.map((c) => (c as { take: number }).take)).toMatchSnapshot();
  });

  it('a database failure degrades to an empty list, never a throw', async () => {
    const { svc } = build([], true);
    await expect(svc.list('city')).resolves.toEqual([]);
  });
});
