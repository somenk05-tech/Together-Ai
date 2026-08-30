import { ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallowed } from '../shared/swallow';
import { ChatEventBus } from '../shared/events/chat-events';
import { ReadCache } from '../shared/cache/read-cache.service';
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
  /** The bus is optional so the many places that construct this service
   *  directly keep working; a block with no bus is still a block. The cache is
   *  optional for the same reason, and for the stronger one in
   *  read-cache.service.ts: nothing here may need it. */
  constructor(
    private readonly prisma: PrismaService,
    private readonly bus?: ChatEventBus,
    @Optional() private readonly cache?: ReadCache,
  ) {}

  /**
   * ── CACHING THE BLOCK SET, AND WHY IT IS SAFE TO ─────────────────────────
   *
   * `blockedWith` is two queries, and it is called on almost every read in the
   * hub: the feed's graph, `assertCanView` on every like and comment, the
   * fan-out audience, the Following lens. At a million citizens that is the
   * most-executed pair of queries in the application, for an answer that
   * changes when somebody presses Block.
   *
   * A stale block set is the one kind of staleness that is not merely
   * inconvenient — it is a blocked person reappearing in the feed of whoever
   * blocked them. So this is cached ONLY because the invalidation lives here,
   * in the single place a block is written, and drops through Redis rather
   * than in process memory: a block made on any container is forgotten on
   * every container, immediately. The TTL is a backstop for a lost drop, not
   * the mechanism.
   *
   * If that invariant ever stops holding — a second writer of Block or of a
   * BLOCKED connection appearing anywhere — this cache has to go with it. That
   * is why `block()` and `unblock()` below are the only two writes in the
   * codebase, stated as a fact in the class docstring above rather than as an
   * aspiration.
   */
  private static readonly BLOCK_TTL_S = ReadCache.ttlFromEnv('SOCIAL_CACHE_TTL_S', 30);

  /** Forget both citizens' cached safety sets AND their cached graphs — a block
   *  severs follow edges too, so the graph is wrong the moment this returns. */
  private forget(a: string, b: string): void {
    if (!this.cache) return;
    void this.cache.drop(`blocked:${a}`, `blocked:${b}`, `graph:${a}`, `graph:${b}`)
      .catch(swallowed('blocking.cache.forget', undefined, { a, b }));
  }

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
    // AND EMPTY THE ROOMS THEY SHARE (launch audit, 27 Aug). Room membership is
    // what carries typing, presence and read receipts, and it was only recomputed
    // when a socket reconnected — so for the rest of a live session the person
    // just blocked still watched the blocker type and come online.
    this.bus?.publish({ kind: 'connection.blocked', userIds: [me, them] });
    this.forget(me, them);
    return { blocked: true, userId: them };
  }

  /** Undo a block this citizen made. Their follow edges are not restored —
   *  those were a relationship, not a setting, and re-following is a choice. */
  async unblock(me: string, them: string): Promise<{ blocked: false; userId: string }> {
    await this.prisma.block.deleteMany({ where: { blockerId: me, blockedId: them } });
    this.forget(me, them);
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
      // unbounded: safety — the block union must be COMPLETE; a truncated list quietly unblocks people
      this.safely<BlockRow>(() => this.prisma.block.findMany({
        where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
        select: { blockerId: true, blockedId: true },
      })),
      // unbounded: same safety rule — blocked-connection states
      this.safely<ConnectionBlockRow>(() => this.prisma.connection.findMany({
        where: { status: BLOCKED_STATUS, OR: [{ userOneId: userId }, { userTwoId: userId }] },
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
    // An ARRAY through the cache, never the Set: `JSON.stringify(new Set())`
    // is `{}`, and a block list that silently comes back empty is the exact
    // failure this cache must not be capable of.
    const ids = this.cache
      ? await this.cache.wrap(`blocked:${userId}`, BlockingService.BLOCK_TTL_S, async () => {
        const { blocks, connections } = await this.rows(userId);
        return [...blockedWith(userId, blocks, connections)];
      })
      : await (async () => {
        const { blocks, connections } = await this.rows(userId);
        return [...blockedWith(userId, blocks, connections)];
      })();
    return new Set(ids);
  }

  /**
   * `blockedIds` stood here — `blockedWith` as an array, "for handing straight
   * to a Prisma notIn". Nothing ever handed it anywhere. A convenience with no
   * caller is a shape somebody has to keep correct for nobody.
   */

  /**
   * Refuse the interaction if either of them has blocked the other. The message
   * names the block only for the person who made it — see blockedMessage().
   */
  async assertNotBlocked(me: string, them: string): Promise<void> {
    const d = await this.direction(me, them);
    if (d !== 'none') throw new ForbiddenException(blockedMessage(d));
  }
}
