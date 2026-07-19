import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConnectionStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { orderPair } from './connection.util';

/**
 * THE GATE.
 * Every message send/edit/delete and every conversation start passes through here.
 * Rule: two users may communicate only if they share at least one ACCEPTED,
 * non-blocked connection. Anything else → 403 Forbidden. No exceptions.
 */
@Injectable()
export class ConnectionPermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Returns true iff an ACCEPTED connection exists between the two users. */
  async canCommunicate(a: string, b: string): Promise<boolean> {
    if (a === b) return false;
    const { userOneId, userTwoId } = orderPair(a, b);
    const conn = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, status: ConnectionStatus.ACCEPTED },
      select: { id: true },
    });
    return conn !== null;
  }

  /** Throws 403 unless the two users share an ACCEPTED connection. */
  async assertCanCommunicate(a: string, b: string): Promise<void> {
    if (!(await this.canCommunicate(a, b))) {
      throw new ForbiddenException('You can only message connected members.');
    }
  }

  /** True if either user has BLOCKED the other on any connection. */
  async isBlocked(a: string, b: string): Promise<boolean> {
    const { userOneId, userTwoId } = orderPair(a, b);
    const blocked = await this.prisma.connection.findFirst({
      where: { userOneId, userTwoId, status: ConnectionStatus.BLOCKED },
      select: { id: true },
    });
    return blocked !== null;
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
