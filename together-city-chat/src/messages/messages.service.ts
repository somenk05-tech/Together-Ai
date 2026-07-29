import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { ChatEventBus } from '../shared/events/chat-events';
import {
  DeleteMessageDto,
  EditMessageDto,
  ListMessagesDto,
  SearchMessagesDto,
  SendMessageDto,
} from './dto/messages.dto';

const messageInclude = {
  sender: { select: { id: true, name: true, handle: true, profileImage: true } },
  attachments: true,
  replyTo: {
    select: { id: true, text: true, messageType: true, senderId: true, deleted: true },
  },
  statuses: true,
} satisfies Prisma.MessageInclude;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
    private readonly bus: ChatEventBus,
    private readonly config: ConfigService,
  ) {}

  /** Send a message. Enforces the connection gate + membership before persisting. */
  async send(senderId: string, dto: SendMessageDto) {
    // 1) permission gate (403 if not connected / not a member)
    await this.permission.assertCanPostToConversation(senderId, dto.conversationId);

    const recipientIds = await this.recipientIds(dto.conversationId, senderId);

    // 2) persist message + per-recipient SENT status + attachments atomically
    const text = dto.text ?? dto.body; // frontend sends `body`; DB column is `text`
    const message = await this.prisma.message.create({
      data: {
        conversationId: dto.conversationId,
        senderId,
        text,
        messageType: dto.messageType,
        replyToMessageId: dto.replyToMessageId,
        shareJson: dto.share ? JSON.stringify(dto.share) : undefined,
        attachments: dto.attachments
          ? { create: dto.attachments.map((a) => ({ ...a })) }
          : undefined,
        statuses: {
          create: recipientIds.map((userId) => ({ userId, status: DeliveryStatus.SENT })),
        },
      },
      include: messageInclude,
    });

    // 3) touch conversation for ordering + emit realtime event
    await this.prisma.conversation.update({
      where: { id: dto.conversationId },
      data: { updatedAt: new Date() },
    });
    const dtoOut = this.serialize(message);
    this.bus.publish({ kind: 'message.created', conversationId: dto.conversationId, message: dtoOut, recipientIds });
    return dtoOut;
  }

  /** Cursor pagination — newest first, no OFFSET. */
  async list(userId: string, dto: ListMessagesDto) {
    await this.assertMember(userId, dto.conversationId);
    const take = dto.limit ?? this.config.get<number>('policy.pageSize') ?? 30;
    // History a citizen deleted from their panel is theirs to have deleted:
    // the rows survive for the other participants, but this reader never sees
    // anything from at or before the moment they cleared it.
    const clearedAt = await this.clearedAtFor(userId, dto.conversationId);
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId: dto.conversationId,
        ...(clearedAt ? { createdAt: { gt: clearedAt } } : {}),
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages; // newest-first
    const visible = page.filter((m) => !this.hiddenFor(m).includes(userId)); // "deleted for me" stays hidden
    return {
      // Frontend expects `items` in chronological order (oldest→newest) for display.
      items: visible.map((m) => this.serialize(m)).reverse(),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Users who chose "delete for me" on a message (new column — offline client can't type it). */
  private hiddenFor(m: unknown): string[] {
    try { return JSON.parse((m as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
  }

  async edit(userId: string, messageId: string, dto: EditMessageDto) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('Not your message');
    if (msg.deleted) throw new ForbiddenException('Message deleted');
    const windowSec = this.config.get<number>('policy.editWindowSec') ?? 900;
    if (Date.now() - msg.createdAt.getTime() > windowSec * 1000) {
      throw new ForbiddenException('Edit window has passed');
    }
    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { text: dto.text, edited: true },
      include: messageInclude,
    });
    const dtoOut = this.serialize(updated);
    this.bus.publish({ kind: 'message.edited', conversationId: msg.conversationId, message: dtoOut });
    return dtoOut;
  }

  async remove(userId: string, messageId: string, dto: DeleteMessageDto) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');

    if (dto.scope === 'EVERYONE') {
      if (msg.senderId !== userId) throw new ForbiddenException('Not your message');
      const windowSec = this.config.get<number>('policy.deleteEveryoneWindowSec') ?? 900; // 15 min default
      if (Date.now() - msg.createdAt.getTime() > windowSec * 1000) {
        throw new ForbiddenException('Delete-for-everyone window has passed');
      }
      // Soft delete: the row stays, with a full audit trail of who/when.
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deleted: true, text: null, deletedAt: new Date(), deletedById: userId } as never,
      });
      this.bus.publish({ kind: 'message.deleted', conversationId: msg.conversationId, messageId });
      return { deleted: true, scope: 'EVERYONE' };
    }

    // "Delete for me": record this user on the message's hidden list — the
    // message disappears from THEIR history only; everyone else still sees it.
    await this.assertMember(userId, msg.conversationId);
    const hidden = ((): string[] => {
      try { return JSON.parse((msg as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
    })();
    if (!hidden.includes(userId)) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { hiddenForJson: JSON.stringify([...hidden, userId]) } as never,
      });
    }
    return { deleted: true, scope: 'ME' };
  }

  /** Mark messages DELIVERED for a recipient (double tick). */
  async markDelivered(userId: string, messageIds: string[]) {
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: messageIds }, userId, status: DeliveryStatus.SENT },
      data: { status: DeliveryStatus.DELIVERED },
    });
    // The updateMany above is scoped to this user's own status rows, so nothing
    // is written for a foreign id. The lookup wasn't scoped, though, which meant
    // a caller could name any message id and have a "delivered" receipt
    // broadcast into a conversation they aren't in. Restricting to conversations
    // they're a member of makes the receipt unforgeable.
    const mine = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    for (const m of mine) {
      this.bus.publish({ kind: 'message.delivered', conversationId: m.conversationId, messageId: m.id, userId });
    }
  }

  /** Mark messages READ for a recipient (blue tick) + advance lastReadAt. */
  async markRead(userId: string, messageIds: string[]) {
    const now = new Date();
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: messageIds }, userId, status: { not: DeliveryStatus.READ } },
      data: { status: DeliveryStatus.READ, readAt: now },
    });
    // Membership-scoped for the same reason as markDelivered — an unscoped
    // lookup let a non-participant emit a read receipt into someone else's chat.
    const rows = await this.prisma.message.findMany({
      where: { id: { in: messageIds }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    const convoIds = Array.from(new Set(rows.map((r) => r.conversationId)));
    for (const conversationId of convoIds) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId, userId },
        data: { lastReadAt: now },
      });
    }
    for (const r of rows) {
      this.bus.publish({ kind: 'message.read', conversationId: r.conversationId, messageId: r.id, userId });
    }
  }

  /** Unread/undelivered messages to sync when a user reconnects. */
  async pendingForUser(userId: string) {
    const statuses = await this.prisma.messageStatus.findMany({
      where: { userId, status: { in: [DeliveryStatus.SENT, DeliveryStatus.DELIVERED] } },
      include: { message: { include: messageInclude } },
      orderBy: { message: { createdAt: 'asc' } },
      take: 500,
    });
    return statuses.map((s) => this.serialize(s.message));
  }

  /** Multi-criteria search (keyword / sender / type / date / conversation). */
  async search(userId: string, dto: SearchMessagesDto) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    const allowed = memberships.map((m) => m.conversationId);
    const where: Prisma.MessageWhereInput = {
      conversationId: dto.conversationId
        ? dto.conversationId // membership re-checked below
        : { in: allowed },
      deleted: false,
      ...(dto.keyword ? { text: { contains: dto.keyword, mode: 'insensitive' } } : {}),
      ...(dto.senderId ? { senderId: dto.senderId } : {}),
      ...(dto.attachmentType ? { messageType: dto.attachmentType } : {}),
      ...(dto.from || dto.to
        ? { createdAt: { ...(dto.from ? { gte: dto.from } : {}), ...(dto.to ? { lte: dto.to } : {}) } }
        : {}),
    };
    if (dto.conversationId && !allowed.includes(dto.conversationId)) {
      throw new ForbiddenException('Not a member of this conversation');
    }
    const messages = await this.prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: dto.limit ?? 50,
    });
    return messages.filter((m) => !this.hiddenFor(m).includes(userId)).map((m) => this.serialize(m));
  }

  // ── helpers ──────────────────────────────────────────────
  private async recipientIds(conversationId: string, senderId: string): Promise<string[]> {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, userId: { not: senderId } },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }

  /** When this citizen last cleared the conversation, if ever. */
  private async clearedAtFor(userId: string, conversationId: string): Promise<Date | null> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    return (member as { clearedAt?: Date | null } | null)?.clearedAt ?? null;
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
  }

  /**
   * Map a persisted message to the shape the frontend consumes:
   * `text`→`body`, `shareJson`→`share`, `attachments`→`media`. Also tombstones
   * the body of deleted messages so their content never leaks.
   */
  private serialize(m: {
    id: string;
    conversationId: string;
    senderId: string;
    text: string | null;
    messageType: string;
    shareJson?: string | null;
    replyToMessageId?: string | null;
    edited?: boolean;
    deleted: boolean;
    createdAt: Date;
    updatedAt?: Date;
    attachments?: Array<{ id: string; url: string; mimeType: string; thumbnail?: string | null }>;
    sender?: unknown;
    statuses?: Array<{ status: string }>;
  }) {
    let share: unknown = null;
    if (m.shareJson) {
      try { share = JSON.parse(m.shareJson); } catch { share = null; }
    }
    const media = (m.attachments ?? []).map((a) => ({
      id: a.id,
      url: a.url,
      kind: a.mimeType?.startsWith('image/') ? 'image' : a.mimeType?.startsWith('video/') ? 'video' : 'file',
      thumbUrl: a.thumbnail ?? undefined,
    }));
    // Aggregate delivery status across recipients (least-progressed wins):
    // all read ⇒ READ, all delivered-or-better ⇒ DELIVERED, else SENT.
    const rank: Record<string, number> = { SENT: 0, DELIVERED: 1, READ: 2 };
    const statuses = m.statuses ?? [];
    let status: 'SENT' | 'DELIVERED' | 'READ' = 'SENT';
    if (statuses.length) {
      const min = Math.min(...statuses.map((s) => rank[s.status] ?? 0));
      status = min >= 2 ? 'READ' : min >= 1 ? 'DELIVERED' : 'SENT';
    }
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.deleted ? '' : (m.text ?? ''),
      messageType: m.messageType,
      share,
      media,
      status,
      replyToMessageId: m.replyToMessageId ?? null,
      edited: !!m.edited,
      deleted: m.deleted,
      editedAt: m.edited ? (m.updatedAt ?? m.createdAt) : null,
      createdAt: m.createdAt,
      sender: m.sender,
    };
  }
}
