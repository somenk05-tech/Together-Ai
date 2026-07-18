import { ForbiddenException } from '@nestjs/common';
import { ConnectionPermissionService } from '../src/connections/connection-permission.service';

/** Minimal in-memory Prisma stub for the permission gate. */
function prismaStub(connections: Array<{ userOneId: string; userTwoId: string; status: string }>) {
  return {
    connection: {
      findFirst: async ({ where }: any) =>
        connections.find(
          (c) =>
            c.userOneId === where.userOneId &&
            c.userTwoId === where.userTwoId &&
            c.status === where.status,
        ) ?? null,
    },
    conversation: { findUnique: async () => null },
  } as any;
}

describe('ConnectionPermissionService', () => {
  it('allows messaging between ACCEPTED-connected users (order-independent)', async () => {
    const svc = new ConnectionPermissionService(
      prismaStub([{ userOneId: 'a', userTwoId: 'b', status: 'ACCEPTED' }]),
    );
    expect(await svc.canCommunicate('a', 'b')).toBe(true);
    expect(await svc.canCommunicate('b', 'a')).toBe(true); // reversed still resolves
  });

  it('blocks messaging when no accepted connection exists (403)', async () => {
    const svc = new ConnectionPermissionService(prismaStub([]));
    expect(await svc.canCommunicate('a', 'b')).toBe(false);
    await expect(svc.assertCanCommunicate('a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks messaging when the connection is only PENDING', async () => {
    const svc = new ConnectionPermissionService(
      prismaStub([{ userOneId: 'a', userTwoId: 'b', status: 'PENDING' }]),
    );
    expect(await svc.canCommunicate('a', 'b')).toBe(false);
  });

  it('never lets a user message themselves', async () => {
    const svc = new ConnectionPermissionService(prismaStub([]));
    expect(await svc.canCommunicate('a', 'a')).toBe(false);
  });
});
