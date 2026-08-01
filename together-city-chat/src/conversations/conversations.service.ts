import { swallowed } from '../shared/swallow';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { directKeyOf } from './conversation.util';
import { nickname } from '../shared/nickname';
import { datingConversationIds } from '../shared/dating-conversations';
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

  /** Conversation ids that belong to the Dating Hub (anonymous match chats).
   *  These live ONLY in the Dating Hub's own chat tab and are hidden from the
   *  main Chats list. Shared with messages + notifications so all three agree. */
  private datingConversationIds(userId: string): Promise<Set<string>> {
    return datingConversationIds(this.prisma, userId);
  }

  /** Conversation list — newest first, each as the flat DTO the frontend consumes.
   *  Dating Hub match chats are excluded — they surface only in the Dating Hub. */
  async listForUser(userId: string) {
    const datingIds = await this.datingConversationIds(userId);
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
      if (datingIds.has(m.conversationId)) continue;

      // A conversation this citizen deleted stays gone until someone writes to
      // it again. `messages` is the single newest message (take: 1, desc), so
      // "nothing since I cleared it" is exactly what keeps it out of the panel.
      const clearedAt = m.clearedAt;
      if (clearedAt) {
        const newest = m.conversation.messages[0];
        if (!newest || newest.createdAt <= clearedAt) continue;
      }

      // Unread counts from whichever came later: the last read, or the clear.
      // Without this a cleared thread reappears claiming every old message is
      // unread.
      const since = this.laterOf(m.lastReadAt, clearedAt);
      const unread = await this.prisma.message.count({
        where: {
          conversationId: m.conversationId,
          deleted: false,
          senderId: { not: userId },
          ...(since ? { createdAt: { gt: since } } : {}),
        },
      });
      out.push(this.shape(m.conversation, userId, unread));
    }
    return out;
  }

  /** The later of two optional instants — null only when both are null. */
  private laterOf(a: Date | null | undefined, b: Date | null | undefined): Date | null {
    if (!a) return b ?? null;
    if (!b) return a;
    return a > b ? a : b;
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

  /** Last-message + unread summary for one conversation (used by the Dating Hub
   *  chat list, which surfaces dating conversations outside the main chat list). */
  async summaryFor(conversationId: string, userId: string): Promise<{ lastMessageAt: string; lastText: string | null; lastSenderId: string | null; unread: number }> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    }).catch(swallowed('conversations.summaryFor', null));
    const last = await this.prisma.message.findFirst({
      where: { conversationId, deleted: false },
      orderBy: { createdAt: 'desc' },
    }).catch(swallowed('conversations.summaryFor', null));
    const unread = await this.prisma.message.count({
      where: {
        conversationId, deleted: false, senderId: { not: userId },
        ...(member?.lastReadAt ? { createdAt: { gt: member.lastReadAt } } : {}),
      },
    }).catch(() => 0);
    return {
      lastMessageAt: (last?.createdAt ?? new Date(0)).toISOString(),
      lastText: (last as { body?: string | null } | null)?.body ?? null,
      lastSenderId: (last as { senderId?: string | null } | null)?.senderId ?? null,
      unread,
    };
  }

  /** Archive a conversation for every member (used when a dating match is
   *  unmatched — the chat leaves both people's lists). */
  async archiveForAll(conversationId: string): Promise<void> {
    await this.prisma.conversationMember.updateMany({ where: { conversationId }, data: { archived: true } }).catch(swallowed('conversations.archiveForAll', undefined));
  }

  /** Advance/clear a dating conversation's anonymity (reveal at ≥2). */
  async setAnonymousTrust(conversationId: string, trust: number | null): Promise<void> {
    await this.prisma.conversation.update({ where: { id: conversationId }, data: { anonymousTrust: trust } as never }).catch(swallowed('conversations.setAnonymousTrust', undefined));
  }

  /**
   * Membership check that answers 404 rather than 403.
   *
   * assertMember() below says "you are not a member", which confirms the
   * conversation exists to anyone holding an id. For the panel operations a
   * non-participant should not be able to tell an id apart from a typo, so
   * these answer NotFound. Existing callers keep the 403 they were written
   * against.
   */
  private async assertParticipant(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new NotFoundException('No such conversation.');
  }

  /**
   * Delete a conversation from THIS citizen's left panel.
   *
   * Never removes the conversation or its messages: the other participants
   * still have their copy, and in a group one person leaving the thread behind
   * cannot be allowed to erase everyone's history. It records the instant the
   * citizen cleared it — everything up to that point stops being theirs to see,
   * and the thread leaves their list until somebody writes to it again.
   */
  async clearForUser(userId: string, conversationId: string): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      // archived is cleared deliberately: deleting a chat that was archived
      // should not leave it sitting in the archive.
      data: { clearedAt: new Date(), archived: false },
    });
    return { ok: true };
  }

  /** Move a conversation in or out of this citizen's archive. Reversible. */
  async setArchived(userId: string, conversationId: string, archived: boolean): Promise<{ ok: true }> {
    await this.assertParticipant(userId, conversationId);
    await this.prisma.conversationMember.updateMany({
      where: { conversationId, userId },
      data: { archived },
    });
    return { ok: true };
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
