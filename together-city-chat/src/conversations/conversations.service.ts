import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { directKeyOf } from './conversation.util';
import { CreateGroupDto } from './dto/conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
  ) {}

  /** Idempotently get-or-create the DIRECT conversation between two connected users. */
  /** City directory for starting chats / groups. */
  async contacts(userId: string) {
    // Fellow citizens only — exclude doctors/dietitians (they are Users for booking/chat,
    // but should not appear in the citizen directory as casual contacts).
    const rows = await this.prisma.user.findMany({
      where: { NOT: { id: userId }, doctorProfile: { is: null }, dietitianProfile: { is: null } },
      select: { id: true, handle: true, name: true, profileImage: true },
      orderBy: { name: 'asc' }, take: 200,
    });
    return rows;
  }

  async startDirect(userId: string, targetUserId: string) {
    await this.permission.assertCanCommunicate(userId, targetUserId);
    const directKey = directKeyOf(userId, targetUserId);
    const existing = await this.prisma.conversation.findUnique({ where: { directKey } });
    if (existing) return existing;

    return this.prisma.conversation.create({
      data: {
        type: 'DIRECT',
        directKey,
        members: {
          create: [{ userId }, { userId: targetUserId }],
        },
      },
      include: { members: true },
    });
  }

  /** Create a GROUP. Every invitee must be connected to the creator. */
  async createGroup(userId: string, dto: CreateGroupDto) {
    for (const memberId of dto.memberIds) {
      if (memberId === userId) continue;
      if (!(await this.permission.canCommunicate(userId, memberId))) {
        throw new ForbiddenException(`You are not connected to ${memberId}`);
      }
    }
    const memberIds = Array.from(new Set([userId, ...dto.memberIds]));
    return this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: dto.title,
        members: {
          create: memberIds.map((id) => ({
            userId: id,
            role: id === userId ? 'OWNER' : 'MEMBER',
          })),
        },
      },
      include: { members: true },
    });
  }

  /** Conversation list with last message + unread count (cache candidate). */
  async listForUser(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, archived: false },
      include: {
        conversation: {
          include: {
            members: { include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } } },
            messages: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: 'desc' } },
    });

    const result = [];
    for (const m of memberships) {
      const unread = await this.prisma.message.count({
        where: {
          conversationId: m.conversationId,
          deleted: false,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      result.push({
        conversation: m.conversation,
        unread,
        pinned: m.pinned,
        muted: m.muted,
        lastMessage: m.conversation.messages[0] ?? null,
      });
    }
    return result;
  }

  async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
  }
}
