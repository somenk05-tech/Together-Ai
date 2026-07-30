import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';
import { BlockingService } from './blocking.service';

/**
 * THE GATE.
 * Every message send/edit/delete and every conversation start passes through here.
 * Rule: two users may communicate only if they share at least one ACCEPTED,
 * non-blocked connection. Anything else → 403 Forbidden. No exceptions.
 */
@Injectable()
export class ConnectionPermissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocking: BlockingService,
  ) {}

  /**
   * True iff an ACCEPTED connection exists AND neither has blocked the other.
   *
   * The block half used to be missing, and the consequence was not small: a
   * citizen who blocked someone from the Social hub had their posts hidden and
   * carried on receiving their messages, because this gate only ever looked at
   * the connection record and the Social hub writes to a different table. See
   * blocking.ts. Every message, call and new conversation comes through here,
   * so this one line is where the block becomes real everywhere at once.
   */
  async canCommunicate(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    if (await this.blocking.isBlocked(a, b)) return false;
    const { userOneId, userTwoId } = orderPair(a, b);
    const conn = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED },
      select: { id: true },
    });
    return conn !== null;
  }

  /**
   * Throws 403 unless the two may communicate. A block and a missing connection
   * are refused separately so the wording can differ: only the person who made
   * a block is told a block exists.
   */
  async assertCanCommunicate(a: string, b: string): Promise<void> {
    await this.blocking.assertNotBlocked(a, b);
    if (!(await this.canCommunicate(a, b))) {
      throw new ForbiddenException('You can only message connected members.');
    }
  }

  /** True if either user has blocked the other, by any of the ways to do it. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    return this.blocking.isBlocked(a, b);
  }

  /**
   * Gate for group/direct conversations: the sender must be a member AND, for
   * DIRECT conversations, be connected to the other member. For GROUP, membership
   * is sufficient (group creation itself checks connections of invitees).
   */
  async assertCanPostToConversation(userId: string, conversationId: string): Promise<void> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { members: { select: { userId: true } } },
    });
    if (!convo) throw new ForbiddenException('Conversation not found');
    const memberIds = convo.members.map((m) => m.userId);
    if (!memberIds.includes(userId)) {
      throw new ForbiddenException('You are not a member of this conversation.');
    }
    if (convo.type === 'DIRECT') {
      // Dating-match chats (anonymousTrust set) are authorised by the match
      // itself — the two people aren't a connection until they become friends.
      if ((convo as { anonymousTrust?: number | null }).anonymousTrust != null) return;
      const other = memberIds.find((id) => id !== userId);
      if (!other) throw new ForbiddenException('Invalid direct conversation.');
      await this.assertCanCommunicate(userId, other);
    }
  }
}
