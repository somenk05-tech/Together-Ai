import { NotFoundException } from '@nestjs/common';
import { MedicalService } from './medical.service';

/**
 * Deleting a blood report has to take its panel with it.
 *
 * The bug this pins: uploading a report creates exactly one MedicalBloodTest,
 * and deleting the report used to remove the document and the stored file while
 * leaving the panel behind. The citizen deleted their blood test and its markers
 * carried on being shown in Blood Test Analysis and counted in "your health over
 * time" — with no document left to explain them and no route to remove them.
 */

type Rec = { id: string; userId: string; fileKey: string | null; fileUrl: string | null; bloodTestId: string | null };

function serviceWith(records: Rec[], panels: Array<{ id: string; userId: string }>) {
  const deleted = { records: [] as string[], panels: [] as unknown[], detached: [] as unknown[] };

  const tx = {
    medicalRecord: {
      delete: jest.fn(async ({ where }: any) => { deleted.records.push(where.id); return {}; }),
      updateMany: jest.fn(async (args: any) => { deleted.detached.push(args); return { count: 1 }; }),
    },
    medicalBloodTest: {
      deleteMany: jest.fn(async ({ where }: any) => { deleted.panels.push(where); return { count: 1 }; }),
      delete: jest.fn(async ({ where }: any) => { deleted.panels.push(where); return {}; }),
    },
  };

  const prisma = {
    medicalRecord: {
      findFirst: jest.fn(async ({ where }: any) =>
        records.find((r) => r.id === where.id && r.userId === where.userId) ?? null),
      findMany: jest.fn(async () => []),
    },
    medicalBloodTest: {
      findFirst: jest.fn(async ({ where }: any) =>
        panels.find((p) => p.id === where.id && p.userId === where.userId) ?? null),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };

  const storage = {
    deleteHealthObject: jest.fn(async () => undefined),
    deleteObject: jest.fn(async () => undefined),
    keyFromUrl: jest.fn((u: string) => u),
  };

  // Constructor order: prisma, conversations, financial, ai, storage, clock.
  const svc = new MedicalService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    storage as never,
    {} as never,
  );
  // records() is the return value, not what we're testing.
  (svc as unknown as { records: () => Promise<unknown> }).records = jest.fn(async () => []);
  return { svc, prisma, storage, tx, deleted };
}

describe('deleting a health record', () => {
  it('deletes the blood panel the report produced', async () => {
    const { svc, deleted } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: 'health/a/x.pdf', fileUrl: null, bloodTestId: 'bt1' }],
      [{ id: 'bt1', userId: 'a' }],
    );
    await svc.deleteRecord('a', 'r1');
    expect(deleted.records).toEqual(['r1']);
    expect(deleted.panels).toEqual([{ id: 'bt1', userId: 'a' }]);
  });

  it('scopes the panel delete by owner, not by the document that pointed at it', async () => {
    // deleteMany with userId means a tampered bloodTestId cannot reach another
    // citizen's panel — the query refuses it rather than the caller checking.
    const { svc, deleted } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: null, fileUrl: null, bloodTestId: 'someone-elses' }],
      [],
    );
    await svc.deleteRecord('a', 'r1');
    expect(deleted.panels).toEqual([{ id: 'someone-elses', userId: 'a' }]);
  });

  it('leaves panels alone for a record that never produced one', async () => {
    const { svc, deleted } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: null, fileUrl: null, bloodTestId: null }],
      [],
    );
    await svc.deleteRecord('a', 'r1');
    expect(deleted.records).toEqual(['r1']);
    expect(deleted.panels).toEqual([]);
  });

  it('removes document and panel in one transaction', async () => {
    // Half a deletion is worse than none: a panel with no document is exactly
    // the orphan state this fixes.
    const { svc, prisma } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: null, fileUrl: null, bloodTestId: 'bt1' }],
      [{ id: 'bt1', userId: 'a' }],
    );
    await svc.deleteRecord('a', 'r1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('refuses a record belonging to someone else', async () => {
    const { svc, deleted } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: null, fileUrl: null, bloodTestId: 'bt1' }],
      [{ id: 'bt1', userId: 'a' }],
    );
    await expect(svc.deleteRecord('intruder', 'r1')).rejects.toBeInstanceOf(NotFoundException);
    expect(deleted.records).toEqual([]);
    expect(deleted.panels).toEqual([]);
  });
});

describe('deleting a blood panel directly', () => {
  it('removes the panel and detaches — but keeps — its source document', async () => {
    const { svc, deleted } = serviceWith(
      [{ id: 'r1', userId: 'a', fileKey: null, fileUrl: null, bloodTestId: 'bt1' }],
      [{ id: 'bt1', userId: 'a' }],
    );
    await expect(svc.deleteBloodTest('a', 'bt1')).resolves.toEqual({ ok: true });
    expect(deleted.panels).toEqual([{ id: 'bt1' }]);
    expect(deleted.records).toEqual([]); // the report itself survives
    expect(deleted.detached[0]).toMatchObject({
      where: { userId: 'a', bloodTestId: 'bt1' },
      data: { bloodTestId: null },
    });
  });

  it('refuses a panel belonging to someone else', async () => {
    const { svc, deleted } = serviceWith([], [{ id: 'bt1', userId: 'a' }]);
    await expect(svc.deleteBloodTest('intruder', 'bt1')).rejects.toBeInstanceOf(NotFoundException);
    expect(deleted.panels).toEqual([]);
  });
});
