import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { directKeyOf } from './conversation.util';
import { nickname } from '../shared/nickname';
import { CreateGroupDto } from './dto/conversations.dto';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
  ) {}

  /**
   * People you can start a chat / group with = your ACCEPTED connections only.
   * There is no global city directory — discovery happens by exact handle
   * (see GET /users/lookup), and messaging is gated on an accepted connection.
   */
  async contacts(userId: string) {
    const conns = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        connectionType: 'FRIEND',
        OR: [{ userOneId: userId }, { userTwoId: userId }],
      },
      include: { userOne: true, userTwo: true },
      orderBy: { updatedAt: 'desc' },
    });
    return conns.map((c) => {
      const u = c.userOneId === userId ? c.userTwo : c.userOne;
      return { id: u.id, handle: u.handle, name: u.name, profileImage: u.profileImage };
    });
  }

  /** Idempotently get-or-create the DIRECT conversation with a member by handle. */
  async startDirect(userId: string, handleRaw: string) {
    const handle = handleRaw.trim().replace(/^@/, '').toLowerCase();
    const target = await this.prisma.user.findUnique({ where: { handle }, select: { id: true } });
    if (!target) throw new ForbiddenException('No citizen with that handle.');
    const targetUserId = target.id;
    await this.permission.assertCanCommunicate(userId, targetUserId);
    const directKey = directKeyOf(userId, targetUserId);
    const existing = await this.prisma.conversation.findUnique({ where: { directKey } });
    const conv =
      existing ??
      (await this.prisma.conversation.create({
        data: {
          type: 'DIRECT',
          directKey,
          members: { create: [{ userId }, { userId: targetUserId }] },
        },
      }));
    return this.toDto(conv.id, userId);
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
    const created = await this.prisma.conversation.create({
      data: {
        type: 'GROUP',
        title: dto.title,
        members: {
          create: memberIds.map((id) => ({ userId: id, role: id === userId ? 'OWNER' : 'MEMBER' })),
        },
      },
    });
    return this.toDto(created.id, userId);
  }

  /** Conversation list — newest first, each as the flat DTO the frontend consumes. */
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

    const out = [];
    for (const m of memberships) {
      const unread = await this.prisma.message.count({
        where: {
          conversationId: m.conversationId,
          deleted: false,
          senderId: { not: userId },
          ...(m.lastReadAt ? { createdAt: { gt: m.lastReadAt } } : {}),
        },
      });
      out.push(this.shape(m.conversation, userId, unread));
    }
    return out;
  }

  /** Load one conversation (with members + last message + unread) as the flat DTO. */
  private async toDto(conversationId: string, userId: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: { include: { user: { select: { id: true, name: true, handle: true, profileImage: true } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!c) throw new ForbiddenException('Conversation not found');
    const me = c.members.find((m) => m.userId === userId);
    const unread = await this.prisma.message.count({
      where: {
        conversationId,
        deleted: false,
        senderId: { not: userId },
        ...(me?.lastReadAt ? { createdAt: { gt: me.lastReadAt } } : {}),
      },
    });
    return this.shape(c, userId, unread);
  }

  /** Flat conversation DTO: { id, title, isGroup, participantIds, lastMessageAt, unread }. */
  private shape(
    c: {
      id: string;
      type: string;
      title: string | null;
      updatedAt: Date;
      anonymousTrust?: number | null;
      members: Array<{ userId: string; user?: { name: string } | null }>;
      messages?: Array<{ createdAt: Date }>;
    },
    userId: string,
    unread: number,
  ) {
    const isGroup = c.type === 'GROUP';
    const others = c.members.filter((m) => m.userId !== userId);
    // Dating-match anonymity: at trust level 1 the other person is a pseudonym.
    // Their real name (the DTO title, which the client also uses for the avatar)
    // is only revealed once both agree (trust ≥ 2). Only dating chats set this.
    const anonymous = !isGroup && c.anonymousTrust != null && c.anonymousTrust < 2;
    const title = isGroup
      ? c.title ?? 'Group'
      : anonymous
        ? (others[0] ? nickname(others[0].userId) : 'Anonymous')
        : others[0]?.user?.name ?? 'Conversation';
    const lastAt = c.messages?.[0]?.createdAt ?? c.updatedAt;
    return {
      id: c.id,
      title,
      isGroup,
      anonymous,
      participantIds: c.members.map((m) => m.userId),
      lastMessageAt: lastAt.toISOString(),
      unread,
    };
  }

  /** Get-or-create a DIRECT conversation between two ids (used by dating matches,
   *  which authorise the chat without a prior connection). */
  async getOrCreateDirectByIds(aId: string, bId: string, anonymousTrust?: number): Promise<string> {
    const directKey = directKeyOf(aId, bId);
    const existing = await this.prisma.conversation.findUnique({ where: { directKey } });
    if (existing) {
      if (anonymousTrust != null && (existing as { anonymousTrust?: number | null }).anonymousTrust == null) {
        await this.prisma.conversation.update({ where: { id: existing.id }, data: { anonymousTrust } as never });
      }
      return existing.id;
    }
    const conv = await this.prisma.conversation.create({
      data: { type: 'DIRECT', directKey, anonymousTrust: anonymousTrust ?? null, members: { create: [{ userId: aId }, { userId: bId }] } } as never,
    });
    return conv.id;
  }

  /** Advance/clear a dating conversation's anonymity (reveal at ≥2). */
  async setAnonymousTrust(conversationId: string, trust: number | null): Promise<void> {
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { anonymousTrust: trust } as never }).catch(() => undefined);
  }

  async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
  }

  /** Mark a whole conversation read for this user (advances lastReadAt → unread = 0). */
  async markRead(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertMember(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { lastReadAt: new Date() },
    });
    return { ok: true };
  }
}
