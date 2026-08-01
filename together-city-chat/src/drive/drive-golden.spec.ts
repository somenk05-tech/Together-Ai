/**
 * Golden master — the drive's load-bearing decisions: the unified storage
 * meter, ownership scoping, the subtree deletion walk (rows AND objects), the
 * quota gate, and the folder-into-itself refusals.
 */
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DriveService } from './drive.service';

interface Fo { id: string; ownerId: string; name: string; parentId: string | null; createdAt: Date; updatedAt: Date }
interface Fi { id: string; ownerId: string; folderId: string | null; name: string; mimeType: string | null; sizeBytes: number; storageKey: string; attachedType: string | null; attachedId: string | null; createdAt: Date; updatedAt: Date }

const T = new Date('2026-08-01T00:00:00Z');
const fo = (id: string, parentId: string | null, name = id): Fo => ({ id, ownerId: 'u1', name, parentId, createdAt: T, updatedAt: T });
const fi = (id: string, folderId: string | null, sizeBytes = 10): Fi => ({ id, ownerId: 'u1', folderId, name: id, mimeType: 'application/pdf', sizeBytes, storageKey: `drive/u1/${id}`, attachedType: null, attachedId: null, createdAt: T, updatedAt: T });

function build(folders: Fo[], files: Fi[], opts: { mailBytes?: number; healthBytes?: number } = {}) {
  const svc = Object.create(DriveService.prototype) as DriveService;
  const deletedObjects: string[] = [];
  const match = (row: Record<string, unknown>, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === 'object' && 'in' in (v as object) ? ((v as { in: unknown[] }).in).includes(row[k]) : row[k] === v);
  (svc as any).prisma = {
    driveFolder: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => folders.find((r) => match(r as never, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => folders.filter((r) => match(r as never, where)),
      delete: async ({ where }: { where: { id: string } }) => folders.find((r) => r.id === where.id),
    },
    driveFile: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => files.find((r) => match(r as never, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) => files.filter((r) => match(r as never, where)),
      delete: async ({ where }: { where: { id: string } }) => files.find((r) => r.id === where.id),
      aggregate: async () => ({ _sum: { sizeBytes: files.reduce((s, f) => s + f.sizeBytes, 0) } }),
    },
    mailMessage: { findMany: async () => [{ sizeBytes: opts.mailBytes ?? 0 }] },
    medicalRecord: { findMany: async () => [{ sizeBytes: opts.healthBytes ?? 0 }] },
  };
  (svc as any).storage = {
    deleteHealthObject: async (k: string) => { deletedObjects.push(k); },
    presignDriveUpload: async (u: string, mime: string, ext: string) => ({ uploadUrl: 'put-here', key: `drive/${u}/new.${ext}`, mime }),
  };
  return { svc, deletedObjects };
}

describe('drive golden master', () => {
  it('the storage meter sums all three vault tenants against the one 10GB quota', async () => {
    const { svc } = build([], [fi('a', null, 1000), fi('b', null, 2000)], { mailBytes: 500, healthBytes: 250 });
    expect(await svc.usage('u1')).toMatchSnapshot();
  });

  it("someone else's folder id reads as not-found, never as forbidden-but-real", async () => {
    const { svc } = build([{ ...fo('f1', null), ownerId: 'INTRUDER-TARGET' }], []);
    await expect(svc.list('u1', 'f1')).rejects.toThrow(NotFoundException);
  });

  it('list shapes breadcrumb from the folder up to the root', async () => {
    const { svc } = build([fo('root', null, 'Documents'), fo('mid', 'root', 'Health'), fo('leaf', 'mid', '2026')], [fi('report.pdf', 'leaf')]);
    expect(await svc.list('u1', 'leaf')).toMatchSnapshot();
  });

  it('deleting a folder walks the WHOLE subtree and deletes every stored object', async () => {
    const folders = [fo('top', null), fo('kid', 'top'), fo('grandkid', 'kid'), fo('unrelated', null)];
    const files = [fi('x', 'top'), fi('y', 'grandkid'), fi('z', 'unrelated')];
    const { svc, deletedObjects } = build(folders, files);
    const res = await svc.deleteFolder('u1', 'top');
    expect({ res, deletedObjects }).toMatchSnapshot();
    expect(deletedObjects).not.toContain('drive/u1/z'); // the unrelated tree survives
  });

  it('quota gate: a file that fits is presigned; one that busts the vault is refused', async () => {
    const { svc } = build([], [fi('big', null, 10 * 1024 * 1024 * 1024 - 100)]);
    await expect(svc.presign('u1', { sizeBytes: 101 })).rejects.toThrow(ForbiddenException);
    expect(await svc.presign('u1', { sizeBytes: 99, ext: 'pdf' })).toMatchSnapshot();
    await expect(svc.presign('u1', { sizeBytes: 0 })).rejects.toThrow(BadRequestException);
  });

  it('a folder cannot be moved into itself or its own subtree', async () => {
    const { svc } = build([fo('a', null), fo('b', 'a')], []);
    await expect(svc.renameFolder('u1', 'a', { parentId: 'a' })).rejects.toThrow("A folder can't contain itself.");
    await expect(svc.renameFolder('u1', 'a', { parentId: 'b' })).rejects.toThrow("You can't move a folder into itself.");
  });
});
