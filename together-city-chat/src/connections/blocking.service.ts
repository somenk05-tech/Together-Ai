import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  BLOCKED_STATUS, blockDirection, blockedMessage, blockedWith,
  type BlockDirection, type BlockRow, type ConnectionBlockRow,
} from './blocking';

/**
 * The reading half of blocking.ts — the queries, and nothing else.
 *
 * Both sources are read every time rather than one being kept in step with the
 * other. Two tables that must agree eventually disagree; two tables that are
 * both consulted cannot.
 */
@Injectable()
export class BlockingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Read a delegate that may not exist yet, and never let it break a caller. */
  private async safely<T>(read: () => Promise<T[]>): Promise<T[]> {
    try {
      return await read();
    } catch {
      return [];
    }
  }

  private async rows(userId: string): Promise<{ blocks: BlockRow[]; connections: ConnectionBlockRow[] }> {
    const [blocks, connections] = await Promise.all([
      this.safely<BlockRow>(() => this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })),
      this.safely<ConnectionBlockRow>(() => this.prisma.connection.findMany({
        where: { status: BLOCKED_STATUS as never, OR: [{ userOneId: userId }, { userTwoId: userId }] },
        select: { userOneId: true, userTwoId: true, status: true },
      }) as Promise<ConnectionBlockRow[]>),
    ]);
    return { blocks, connections };
  }

  /** Which way a block runs between these two, from `me`'s side. */
  async direction(me: string, them: string): Promise<BlockDirection> {
    if (!me || !them || me === them) return 'none';
    const { blocks, connections } = await this.rows(me);
    return blockDirection(me, them, blocks, connections);
  }

  /** True if these two may not reach each other, whichever of them did it. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    return (await this.direction(a, b)) !== 'none';
  }

  /** Everyone this user is blocked with — the set every list subtracts. */
  async blockedWith(userId: string): Promise<Set<string>> {
    if (!userId) return new Set<string>();
    const { blocks, connections } = await this.rows(userId);
    return blockedWith(userId, blocks, connections);
  }

  /** Same, as an array, for handing straight to a Prisma `notIn`. */
  async blockedIds(userId: string): Promise<string[]> {
    return [...(await this.blockedWith(userId))];
  }

  /**
   * Refuse the interaction if either of them has blocked the other. The message
   * names the block only for the person who made it — see blockedMessage().
   */
  async assertNotBlocked(me: string, them: string): Promise<void> {
    const d = await this.direction(me, them);
    if (d !== 'none') throw new ForbiddenException(blockedMessage(d));
  }
}
