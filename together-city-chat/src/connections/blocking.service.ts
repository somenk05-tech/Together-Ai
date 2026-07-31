import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import {
  BLOCKED_STATUS, blockDirection, blockedMessage, blockedWith,
  type BlockDirection, type BlockRow, type ConnectionBlockRow,
} from './blocking';

/**
 * The queries behind blocking.ts, and the one place a block is written.
 *
 * Both sources are read every time rather than one being kept in step with the
 * other. Two tables that must agree eventually disagree; two tables that are
 * both consulted cannot.
 *
 * `block()` lives here for the same reason. Before H6 the only way to block
 * anybody was SocialService.block(), so a citizen in a bad DATING interaction
 * had to know to open the People hub and find them there. Adding a second
 * implementation in the Dating hub would have given the city two spellings of
 * its most safety-critical write — and the two would have drifted, because one
 * of them severs follow edges and the day somebody forgets that in the copy is
 * the day a blocked person is still in your circle.
 */
@Injectable()
export class BlockingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Block someone. Idempotent, silent, and never notifies the blocked citizen —
   * a block they are told about is the one kind that is not safe to have.
   *
   * Two writes, and the second is the one that gets forgotten in a copy: the
   * Block row, and severing the follow edges both ways so neither person is
   * left in the other's circle.
   */
  async block(me: string, them: string): Promise<{ blocked: true; userId: string }> {
    if (me === them) throw new ForbiddenException("You can't block yourself.");
    await this.prisma.block.createMany({
      data: [{ blockerId: me, blockedId: them }],
      skipDuplicates: true,
    });
    await this.prisma.follow.deleteMany({
      where: {
        OR: [
          { followerId: me, followeeId: them },
          { followerId: them, followeeId: me },
        ],
      },
    });
    return { blocked: true, userId: them };
  }

  /** Undo a block this citizen made. Their follow edges are not restored —
   *  those were a relationship, not a setting, and re-following is a choice. */
  async unblock(me: string, them: string): Promise<{ blocked: false; userId: string }> {
    await this.prisma.block.deleteMany({ where: { blockerId: me, blockedId: them } });
    return { blocked: false, userId: them };
  }

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
