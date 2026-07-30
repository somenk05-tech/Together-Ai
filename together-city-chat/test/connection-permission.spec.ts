import { ForbiddenException } from '@nestjs/common';
import { ConnectionPermissionService } from '../src/connections/connection-permission.service';
import { BlockingService } from '../src/connections/blocking.service';

interface Conn { userOneId: string; userTwoId: string; status: string }
interface Blk { blockerId: string; blockedId: string }

/**
 * In-memory Prisma stub for the permission gate.
 *
 * It serves the block reads too, and the gate is given a REAL BlockingService
 * over the same data rather than a stubbed one. The bug this file now covers
 * was precisely that the two knew nothing about each other, so a test that
 * faked the seam would have passed while the app leaked messages.
 */
function prismaStub(connections: Conn[], blocks: Blk[] = []) {
  const involves = (where: any, one: string, two: string) =>
    (where.OR ?? []).some((c: any) => c[one] !== undefined ? c[one] === where.__me : c[two] === where.__me);
  void involves;
  return {
    connection: {
      findFirst: async ({ where }: any) =>
        connections.find(
          (c) => c.userOneId === where.userOneId && c.userTwoId === where.userTwoId && c.status === where.status,
        ) ?? null,
      findMany: async ({ where }: any) => {
        const me = where.OR?.[0]?.userOneId ?? where.OR?.[0]?.userTwoId;
        return connections.filter(
          (c) => c.status === where.status && (c.userOneId === me || c.userTwoId === me),
        );
      },
    },
    block: {
      findMany: async ({ where }: any) => {
        const me = where.OR?.[0]?.blockerId ?? where.OR?.[0]?.blockedId;
        return blocks.filter((b) => b.blockerId === me || b.blockedId === me);
      },
    },
    conversation: { findUnique: async () => null },
  } as any;
}

const gate = (connections: Conn[], blocks: Blk[] = []) => {
  const prisma = prismaStub(connections, blocks);
  return new ConnectionPermissionService(prisma, new BlockingService(prisma));
};

const accepted: Conn = { userOneId: 'a', userTwoId: 'b', status: 'ACCEPTED' };

describe('ConnectionPermissionService', () => {
  it('allows messaging between ACCEPTED-connected users (order-independent)', async () => {
    const svc = gate([accepted]);
    expect(await svc.canCommunicate('a', 'b')).toBe(true);
    expect(await svc.canCommunicate('b', 'a')).toBe(true); // reversed still resolves
  });

  it('blocks messaging when no accepted connection exists (403)', async () => {
    const svc = gate([]);
    expect(await svc.canCommunicate('a', 'b')).toBe(false);
    await expect(svc.assertCanCommunicate('a', 'b')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks messaging when the connection is only PENDING', async () => {
    const svc = gate([{ userOneId: 'a', userTwoId: 'b', status: 'PENDING' }]);
    expect(await svc.canCommunicate('a', 'b')).toBe(false);
  });

  it('never lets a user message themselves', async () => {
    expect(await gate([]).canCommunicate('a', 'a')).toBe(false);
  });

  describe('a Social-hub block reaches the gate (BE-13.3)', () => {
    it('stops messages from a friend you blocked, connection intact', async () => {
      const svc = gate([accepted], [{ blockerId: 'a', blockedId: 'b' }]);
      expect(await svc.canCommunicate('a', 'b')).toBe(false);
      expect(await svc.canCommunicate('b', 'a')).toBe(false);   // and in the other direction
      expect(await svc.isBlocked('a', 'b')).toBe(true);
    });

    it('stops messages from a friend who blocked you', async () => {
      const svc = gate([accepted], [{ blockerId: 'b', blockedId: 'a' }]);
      expect(await svc.canCommunicate('a', 'b')).toBe(false);
    });

    it('tells the blocker what they did, and tells the blocked person nothing', async () => {
      const mine = gate([accepted], [{ blockerId: 'a', blockedId: 'b' }]);
      await expect(mine.assertCanCommunicate('a', 'b')).rejects.toThrow(/You have blocked/);

      const theirs = gate([accepted], [{ blockerId: 'b', blockedId: 'a' }]);
      await expect(theirs.assertCanCommunicate('a', 'b')).rejects.toThrow(/not accepting messages/);
      await expect(theirs.assertCanCommunicate('a', 'b')).rejects.not.toThrow(/block/i);
    });

    it('leaves everyone else alone', async () => {
      const svc = gate([accepted], [{ blockerId: 'a', blockedId: 'c' }]);
      expect(await svc.canCommunicate('a', 'b')).toBe(true);
    });
  });

  describe('a connection-level block still works', () => {
    it('refuses the pair, in both directions', async () => {
      const svc = gate([{ userOneId: 'a', userTwoId: 'b', status: 'BLOCKED' }]);
      expect(await svc.isBlocked('a', 'b')).toBe(true);
      expect(await svc.isBlocked('b', 'a')).toBe(true);
      expect(await svc.canCommunicate('a', 'b')).toBe(false);
    });
  });
});
