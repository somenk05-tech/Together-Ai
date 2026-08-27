import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { datingConversationIds } from '../shared/dating-conversations';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { ChatMediaGuard } from './chat-media-guard';
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
    private readonly media: ChatMediaGuard,
  ) {}

  /** Send a message. Enforces the connection gate + membership before persisting. */
  async send(senderId: string, dto: SendMessageDto) {
    // 1) permission gate (403 if not connected / not a member)
    await this.permission.assertCanPostToConversation(senderId, dto.conversationId);
    // 1b) attachment gate — see assertAttachmentsAreYoursToSend below.
    if (dto.attachments?.length) await this.assertAttachmentsAreYoursToSend(senderId, dto.attachments);
    // 1c) and WHAT IS IN THEM, if this is a chat between strangers.
    if (dto.attachments?.length) await this.screenAttachments(senderId, dto.conversationId, dto.attachments);

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
      // `id` is the tiebreak, and it is load-bearing: paginating by a cursor id
      // while ordering by a non-unique createdAt means two messages written in
      // the same millisecond have no defined order, so a page boundary landing
      // between them can repeat one and skip the other. Cheap insurance that
      // only matters at the exact moment chat gets busy.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(dto.cursor ? { cursor: { id: dto.cursor }, skip: 1 } : {}),
    });
    const hasMore = messages.length > take;
    const page = hasMore ? messages.slice(0, take) : messages; // newest-first
    const visible = page.filter((m) => !this.hiddenFor(m).includes(userId)); // "deleted for me" stays hidden
    return {
      // Frontend expects `items` in chronological order (oldest→newest) for display.
      items: visible.map((m) => this.serialize(m, userId)).reverse(),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /** Users who chose "delete for me" on a message (new column — offline client can't type it). */
  private hiddenFor(m: unknown): string[] {
    try { return JSON.parse((m as { hiddenForJson?: string | null }).hiddenForJson ?? '[]') as string[]; } catch { return []; }
  }

  /** Whether this reader has kept this message. */
  private starredBy(m: unknown, userId: string): boolean {
    try {
      const list = JSON.parse((m as { starredForJson?: string | null }).starredForJson ?? '[]') as string[];
      return list.includes(userId);
    } catch { return false; }
  }

  /**
   * Keep a message, or stop keeping it.
   *
   * Conditional updateMany with a retry rather than a $transaction: a
   * transaction is not a lock (transaction-safety.spec says so at length), so
   * the WHERE carries the value that was read and a loser retries against the
   * fresh row. Two people starring the same message in the same instant is
   * the ordinary case in a busy group, not an exotic one.
   */
  async setStarred(userId: string, messageId: string, on: boolean) {
    await this.assertCanSeeMessage(userId, messageId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({
        where: { id: messageId }, select: { starredForJson: true },
      });
      const list = ((): string[] => {
        try { return JSON.parse(fresh?.starredForJson ?? '[]') as string[]; } catch { return []; }
      })();
      const has = list.includes(userId);
      if (has === on) return { ok: true as const, starred: on };
      const next = on ? [...list, userId] : list.filter((id) => id !== userId);
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, starredForJson: fresh?.starredForJson ?? null },
        data: { starredForJson: JSON.stringify(next) },
      });
      if (res.count) return { ok: true as const, starred: on };
    }
    return { ok: true as const, starred: on };
  }

  /** A message you may star, react to or pin is a message you may read:
   *  membership, re-asked. It returns the row now, because the callers that
   *  publish to the bus need the conversation it is in and re-reading for that
   *  would be a second query for a fact this one already had. */
  private async assertCanSeeMessage(
    userId: string,
    messageId: string,
  ): Promise<{ id: string; conversationId: string }> {
    const row = await this.prisma.message.findFirst({
      where: { id: messageId, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    if (!row) throw new NotFoundException('Message not found');
    return row;
  }

  /** Reactions as stored: emoji → the citizens who chose it. */
  private reactionsOf(m: unknown): Record<string, string[]> {
    try {
      const raw = JSON.parse((m as { reactionsJson?: string | null }).reactionsJson ?? '{}') as unknown;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
      return raw as Record<string, string[]>;
    } catch { return {}; }
  }

  /**
   * The wire shape: a stable-ordered list with empty buckets dropped.
   *
   * It carries the USER IDS, not a count and a per-viewer boolean, and that is
   * deliberate — one socket frame goes to a whole room, so any field whose
   * value depends on who is reading is a field the broadcast has to get wrong
   * for everybody but one person. The client knows its own id; let it decide.
   */
  private reactionList(m: unknown): Array<{ emoji: string; userIds: string[] }> {
    const map = this.reactionsOf(m);
    return Object.keys(map)
      .filter((e) => Array.isArray(map[e]) && map[e].length > 0)
      .sort()
      .map((emoji) => ({ emoji, userIds: map[emoji] }));
  }

  /**
   * Answer a message with one of the six, or clear your answer with null.
   *
   * ONE PER PERSON: you are stripped from wherever you were before being added,
   * so a userId is under at most one key. Conditional updateMany with a retry
   * rather than a $transaction — a transaction is not a lock, so the WHERE
   * carries the value that was read and a loser retries against the fresh row.
   * A busy group reacting to the same message in the same second is the
   * ordinary case for this feature, not an exotic one.
   */
  async setReaction(userId: string, messageId: string, emoji: string | null) {
    const msg = await this.assertCanSeeMessage(userId, messageId);
    // Third audit, blocker 05. Seeing a message is not licence to broadcast on
    // its thread. A reaction fans out to the room and persists on the row, so a
    // blocked (or unmatched, or departed) party could keep reacting to every
    // message you ever wrote. The same gate the send path uses closes it — and
    // closes it for all three of those, not only block.
    await this.permission.assertCanPostToConversation(userId, msg.conversationId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({
        where: { id: messageId }, select: { reactionsJson: true },
      });
      const map = this.reactionsOf(fresh);
      const next: Record<string, string[]> = {};
      for (const key of Object.keys(map)) {
        const kept = (Array.isArray(map[key]) ? map[key] : []).filter((id) => id !== userId);
        if (kept.length) next[key] = kept;
      }
      if (emoji) next[emoji] = [...(next[emoji] ?? []), userId];
      const after = JSON.stringify(next);
      // Tapping the reaction you already have is a clear, and tapping a clear
      // twice is nothing at all. Neither deserves a write or a broadcast.
      if (JSON.stringify(map) === after) return { ok: true as const, reactions: this.reactionList(fresh) };
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, reactionsJson: fresh?.reactionsJson ?? null },
        data: { reactionsJson: after },
      });
      if (res.count) {
        const reactions = this.reactionList({ reactionsJson: after });
        this.bus.publish({
          kind: 'message.reacted', conversationId: msg.conversationId, messageId, reactions,
        });
        return { ok: true as const, reactions };
      }
    }
    // Three losses to concurrent writers. Report what is actually there rather
    // than what this call wanted — the citizen can look and tap again.
    const now = await this.prisma.message.findUnique({
      where: { id: messageId }, select: { reactionsJson: true },
    });
    return { ok: true as const, reactions: this.reactionList(now) };
  }

  /**
   * Pin a message, or unpin it. ONE PER CONVERSATION.
   *
   * A pin is a fact about the ROOM — everybody sees the same banner — which is
   * what separates it from a star, and why it is two plain columns rather than
   * a per-reader list. Clearing then setting is two writes and not a
   * $transaction, for the usual reason: the clear's WHERE names the
   * conversation rather than a row somebody read a moment ago, so two people
   * pinning at once resolve to whichever wrote second, with no orphan left
   * pinned behind it.
   */
  async setPinned(userId: string, messageId: string, on: boolean) {
    const msg = await this.assertCanSeeMessage(userId, messageId);
    // Blocker 05: a pin puts a message back at the top of the thread as a
    // banner, with no time window at all. Same gate as send.
    await this.permission.assertCanPostToConversation(userId, msg.conversationId);
    if (!on) {
      await this.prisma.message.updateMany({
        where: { id: messageId, pinnedAt: { not: null } },
        data: { pinnedAt: null, pinnedById: null },
      });
      this.bus.publish({
        kind: 'message.pinned', conversationId: msg.conversationId, messageId: null, message: null,
      });
      return { ok: true as const, pinned: null };
    }
    await this.prisma.message.updateMany({
      where: { conversationId: msg.conversationId, pinnedAt: { not: null } },
      data: { pinnedAt: null, pinnedById: null },
    });
    const row = await this.prisma.message.update({
      where: { id: messageId },
      data: { pinnedAt: new Date(), pinnedById: userId },
      include: messageInclude,
    });
    const dtoOut = this.serialize(row);
    this.bus.publish({
      kind: 'message.pinned', conversationId: msg.conversationId, messageId, message: dtoOut,
    });
    return { ok: true as const, pinned: dtoOut };
  }

  /**
   * What is pinned in this conversation, if anything.
   *
   * A dedicated read rather than a field on the message list, because the
   * pinned message is usually OLD — that is what pinning is for — and the
   * thread only loads its newest page. Tombstones are excluded here rather
   * than unpinned on delete: "this message was deleted" is not worth a banner,
   * and a row that comes back is not a case this schema has.
   */
  async pinnedIn(userId: string, conversationId: string) {
    const row = await this.prisma.message.findFirst({
      where: {
        conversationId,
        pinnedAt: { not: null },
        deleted: false,
        conversation: { members: { some: { userId } } },
      },
      orderBy: { pinnedAt: 'desc' },
      include: messageInclude,
    });
    return { pinned: row ? this.serialize(row, userId) : null };
  }

  async edit(userId: string, messageId: string, dto: EditMessageDto) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) throw new ForbiddenException('Not your message');
    if (msg.deleted) throw new ForbiddenException('Message deleted');
    // Blocker 05: an edit rewrites a message and re-broadcasts it. Without this,
    // send something innocuous, get blocked, then edit it to anything — the new
    // text reaches the person who blocked you. Same gate as send.
    await this.permission.assertCanPostToConversation(userId, msg.conversationId);
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
      // Through the same gate as sending, editing, reacting and pinning: this
      // reaches into the other person's window and changes what is on it, which
      // is a thing a blocked person may not do. It was the one write in this
      // file that only checked authorship and the clock.
      await this.permission.assertCanPostToConversation(userId, msg.conversationId);
      const windowSec = this.config.get<number>('policy.deleteEveryoneWindowSec') ?? 900; // 15 min default
      if (Date.now() - msg.createdAt.getTime() > windowSec * 1000) {
        throw new ForbiddenException('Delete-for-everyone window has passed');
      }
      // Soft delete: the row stays, with a full audit trail of who/when.
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deleted: true, text: null, deletedAt: new Date(), deletedById: userId },
      });
      this.bus.publish({ kind: 'message.deleted', conversationId: msg.conversationId, messageId });
      return { deleted: true, scope: 'EVERYONE' };
    }

    // "Delete for me": record this user on the message's hidden list — the
    // message disappears from THEIR history only; everyone else still sees it.
    // The write is CONDITIONAL on the value read (hiddenForJson in the WHERE),
    // so two people hiding the same message at once cannot erase each other:
    // the loser's write matches nothing and is retried against the fresh row.
    await this.assertMember(userId, msg.conversationId);
    for (let attempt = 0; attempt < 3; attempt++) {
      const fresh = await this.prisma.message.findUnique({ where: { id: messageId }, select: { hiddenForJson: true } });
      const hidden = ((): string[] => {
        try { return JSON.parse(fresh?.hiddenForJson ?? '[]') as string[]; } catch { return []; }
      })();
      if (hidden.includes(userId)) break;
      const res = await this.prisma.message.updateMany({
        where: { id: messageId, hiddenForJson: fresh?.hiddenForJson ?? null },
        data: { hiddenForJson: JSON.stringify([...hidden, userId]) },
      });
      if (res.count) break;
    }
    return { deleted: true, scope: 'ME' };
  }

  /** Mark messages DELIVERED for a recipient (double tick). */
  async markDelivered(userId: string, messageIds: string[]) {
    /* ONLY A TRANSITION EARNS A RECEIPT. This used to publish one
       message.delivered per id whether or not anything changed, and the
       app-wide client listener refetches a thread on every receipt frame — so
       repeated acks for already-delivered rows kept the wire warm forever
       (the read half of that loop is documented on markRead). The pre-select
       narrows the batch to rows actually moving SENT → DELIVERED; none moving
       means nothing to say. */
    // unbounded: `in:` of the caller's receipt batch bounds it
    const pending = await this.prisma.messageStatus.findMany({
      where: { messageId: { in: messageIds }, userId, status: DeliveryStatus.SENT },
      select: { messageId: true },
    });
    if (!pending.length) return;
    const ids = pending.map((p) => p.messageId);
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: ids }, userId, status: DeliveryStatus.SENT },
      data: { status: DeliveryStatus.DELIVERED },
    });
    // The updateMany above is scoped to this user's own status rows, so nothing
    // is written for a foreign id. The lookup is membership-scoped so the
    // receipt broadcast stays unforgeable — a caller must not be able to name
    // any message id and have a receipt ring in a conversation they aren't in.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const mine = await this.prisma.message.findMany({
      where: { id: { in: ids }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true },
    });
    for (const m of mine) {
      this.bus.publish({ kind: 'message.delivered', conversationId: m.conversationId, messageId: m.id, userId });
    }
  }

  /** Mark messages READ for a recipient (blue tick) + advance lastReadAt. */
  async markRead(userId: string, messageIds: string[]) {
    /* ONLY A TRANSITION EARNS A RECEIPT — same rule as markDelivered, and here
       it is the rule that broke the loop: an open thread re-acking messages it
       had already read caused receipts, the receipts caused refetches, and the
       refetches caused re-acks (13 Aug audit). Rows already READ produce
       nothing now — no write, no lastReadAt churn, no broadcast. */
    // unbounded: `in:` of the caller's receipt batch bounds it
    const pending = await this.prisma.messageStatus.findMany({
      where: { messageId: { in: messageIds }, userId, status: { not: DeliveryStatus.READ } },
      select: { messageId: true },
    });
    if (!pending.length) return;
    const ids = pending.map((p) => p.messageId);
    const now = new Date();
    await this.prisma.messageStatus.updateMany({
      where: { messageId: { in: ids }, userId, status: { not: DeliveryStatus.READ } },
      data: { status: DeliveryStatus.READ, readAt: now },
    });
    // Membership-scoped for the same reason as markDelivered — an unscoped
    // lookup let a non-participant emit a read receipt into someone else's chat.
    // unbounded: `in:` of the caller's receipt batch bounds it
    const rows = await this.prisma.message.findMany({
      where: { id: { in: ids }, conversation: { members: { some: { userId } } } },
      select: { id: true, conversationId: true, createdAt: true },
    });
    // LAST-READ IS A MESSAGE'S TIMESTAMP, NOT A CLOCK READING. Stamping `now`
    // marks as read everything that arrives between the newest message in this
    // batch and the moment the write lands — a message that shows up mid-flight
    // is counted read by somebody who never saw it, and the unread count
    // (conversations.service: createdAt > lastReadAt) silently loses it. The
    // high-water mark is the newest message actually acknowledged.
    const highWater = new Map<string, Date>();
    for (const r of rows) {
      const seen = highWater.get(r.conversationId);
      if (!seen || r.createdAt > seen) highWater.set(r.conversationId, r.createdAt);
    }
    for (const [conversationId, at] of highWater) {
      await this.prisma.conversationMember.updateMany({
        // never move the mark backwards — an out-of-order batch from a slow
        // client must not re-open messages this reader has already cleared
        where: { conversationId, userId, OR: [{ lastReadAt: null }, { lastReadAt: { lt: at } }] },
        data: { lastReadAt: at },
      });
    }
    for (const r of rows) {
      this.bus.publish({ kind: 'message.read', conversationId: r.conversationId, messageId: r.id, userId });
    }
  }

  /**
   * The conversation ids this user belongs to — the rooms their socket has to
   * be in for real-time to reach them. Newest first and bounded, because the
   * point is the chats they are actually in; an older one re-joins the moment
   * it is opened.
   */
  async conversationIdsFor(userId: string, take = 200): Promise<string[]> {
    const rows = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
      orderBy: { conversation: { updatedAt: 'desc' } },
      take,
    });
    return rows.map((r) => r.conversationId);
  }

  /** Who is in each of these conversations. One query, because the socket layer
   *  asks about a whole room list at once. */
  async membersOf(conversationIds: string[]): Promise<Map<string, string[]>> {
    const out = new Map<string, string[]>();
    if (!conversationIds.length) return out;
    // unbounded: the members of a bounded list of conversations
    const rows = await this.prisma.conversationMember.findMany({
      where: { conversationId: { in: conversationIds } },
      select: { conversationId: true, userId: true },
    });
    for (const r of rows) out.set(r.conversationId, [...(out.get(r.conversationId) ?? []), r.userId]);
    return out;
  }

  /**
   * EVERY MESSAGE THAT ARRIVED WHILE YOU WERE AWAY IS DELIVERED THE MOMENT YOU
   * COME BACK — and the person who sent it is told so.
   *
   * The delivered receipt used to be written by exactly one thing: the
   * recipient's browser answering a live `chat_notification` frame. That frame
   * is fire-and-forget, so a message sent to somebody who was offline, asleep,
   * or mid-redeploy was never acknowledged by anyone, ever. `sync_pending`
   * existed for this and no client has ever listened to it. The observed
   * result, 10 Aug: two messages stuck on one tick overnight while the app
   * itself was working perfectly — the words had arrived, the receipt had not.
   *
   * A receipt is the server's job, not the browser's. The device has
   * reconnected; the messages are on it as soon as it reads history. That IS
   * delivery, and it is knowable here without asking anyone.
   *
   * Bounded at 500 the same way `pendingForUser` is: a backlog longer than that
   * is a cold-start problem, not a receipt problem.
   */
  async deliverBacklog(userId: string): Promise<number> {
    const pending = await this.prisma.messageStatus.findMany({
      where: { userId, status: DeliveryStatus.SENT },
      select: { messageId: true },
      take: 500,
    });
    if (!pending.length) return 0;
    const ids = pending.map((p) => p.messageId);
    // markDelivered re-reads membership and publishes one bus event per message,
    // which is what puts the second tick on the sender's screen. Reusing it
    // rather than writing a second update path is deliberate: one way to become
    // delivered means one place to get it wrong.
    await this.markDelivered(userId, ids);
    return ids.length;
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

  /**
   * WHO HAS SEEN THIS, AND WHEN — for one message, for the person who sent it.
   *
   * The rows have existed since read receipts shipped: one MessageStatus per
   * recipient, with readAt written. Nothing ever read them back, so the bubble's
   * aggregate tick was the entire story — and that aggregate is the LEAST
   * progressed of everybody, so one person who has not opened the app holds the
   * whole group at a single tick with no way to find out who.
   *
   * Sender-only. In a group, who has read your message is a fact about your
   * message; who has read everybody else's is a log of six people's habits, and
   * this endpoint is not a way to ask for it.
   */
  async info(userId: string, messageId: string) {
    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, createdAt: true },
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Only the sender can see who has read a message.');
    }
    // unbounded: one message's recipients — group-sized, and the group is the point
    const rows = await this.prisma.messageStatus.findMany({
      where: { messageId },
      include: { user: { select: { id: true, name: true, handle: true } } },
    });
    return {
      messageId: msg.id,
      sentAt: msg.createdAt.toISOString(),
      recipients: rows.map((r) => ({
        userId: r.userId,
        name: r.user?.name ?? null,
        handle: r.user?.handle ?? null,
        status: r.status,
        readAt: r.readAt ? r.readAt.toISOString() : null,
      })),
    };
  }

  /** Multi-criteria search (keyword / sender / type / date / conversation). */
  async search(userId: string, dto: SearchMessagesDto) {
    // unbounded: their own memberships — the search scope, socially bounded
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });
    // Dating chats live only in the Dating Hub. Search ran over every
    // membership, so a search in the main Chats screen returned messages from
    // an anonymous dating thread — the one place they were never meant to
    // surface. Excluded here rather than filtered afterwards, so the rows are
    // never read at all.
    const datingIds = await datingConversationIds(this.prisma, userId);
    const allowed = memberships.map((m) => m.conversationId).filter((id) => !datingIds.has(id));
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
      // Includes the dating case: a member of a dating chat still cannot reach
      // it from here, because this endpoint is the main Chats search.
      throw new ForbiddenException('Not a member of this conversation');
    }
    const messages = await this.prisma.message.findMany({
      where,
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: dto.limit ?? 50,
    });
    return messages
      .filter((m) => !this.hiddenFor(m).includes(userId))
      // Starred-only is applied HERE rather than in the where clause: the
      // column is a JSON string, and `contains: userId` would also match a
      // substring of somebody else's id. Cheap, because the page is capped.
      .filter((m) => (dto.starredOnly ? this.starredBy(m, userId) : true))
      .map((m) => this.serialize(m, userId));
  }

  // ── helpers ──────────────────────────────────────────────
  private async recipientIds(conversationId: string, senderId: string): Promise<string[]> {
    // unbounded: one conversation's members — group-sized
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
    return member?.clearedAt ?? null;
  }

  private async assertMember(userId: string, conversationId: string): Promise<void> {
    const member = await this.prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
    if (!member) throw new ForbiddenException('Not a member of this conversation');
  }

  /**
   * AN ATTACHMENT IS A FILE THE SENDER UPLOADED, NOT A URL THE SENDER TYPED.
   *
   * The DTO accepts any syntactically valid URL, and recipient clients render
   * attachments eagerly (<img>, <audio preload>) — so an unchecked URL is a
   * tracking pixel anyone can place in any conversation, or a "file" that is
   * really any content on the internet wearing a trusted name. Storage keys
   * are `uploads/<userId>/<uuid>.<ext>` by design, which makes ownership
   * provable from the URL itself: the path must name the sender. When a public
   * base is configured the URL must live under it too; without one (dev, no
   * cloud creds) the path rule still holds.
   */
  /**
   * SCREEN WHAT A STRANGER IS SENDING (27 Aug, launch audit).
   *
   * Ownership was checked and content never was: a photo sent into a dating
   * chat had no scan, no hold, no recipient consent, while a photo on a dating
   * PROFILE went through a full fail-closed pipeline before anybody saw it.
   *
   * Only dating conversations, which are the ones `anonymousTrust` marks — two
   * strangers a matching engine introduced, rather than two people who accepted
   * a connection. Extending this to the whole city is a bigger decision with a
   * much larger blast radius; see chat-media-guard.ts for the rest of the
   * reasoning, including why voice notes cannot be screened at all.
   *
   * A refusal is a 400 the SENDER sees. Nothing is held and nothing is
   * delivered-then-withdrawn: the person who can do something about it is told
   * at the moment they can still do it.
   */
  private async screenAttachments(
    senderId: string,
    conversationId: string,
    attachments: Array<{ url: string; thumbnail?: string; mimeType?: string }>,
  ): Promise<void> {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { anonymousTrust: true },
    });
    if ((convo as { anonymousTrust?: number | null } | null)?.anonymousTrust == null) return;
    const base = (this.config.get<string>('media.publicBaseUrl') ?? '').replace(/\/+$/, '');
    for (const a of attachments) {
      // BOTH, and the asymmetry was the bug. `assertAttachmentsAreYoursToSend`
      // twenty lines below checks url AND thumbnail — it has to, or you could
      // put somebody else's file in the second field. This checked only the
      // first, and the serializer hands `thumbnail` to the recipient as
      // `thumbUrl` and their chat renders it. So the thumbnail was proven to
      // be yours and never looked at: put the payload there and it arrived
      // unscanned. The ownership gate had the shape right; screening did not.
      for (const target of [a.url, a.thumbnail]) {
        if (!target) continue;
        const verdict = await this.media.screen(target, a.mimeType ?? '', senderId, base);
        if (!verdict.ok) throw new BadRequestException(verdict.reason);
      }
    }
  }

  private async assertAttachmentsAreYoursToSend(
    senderId: string,
    attachments: Array<{ url: string; thumbnail?: string }>,
  ): Promise<void> {
    const base = (this.config.get<string>('media.publicBaseUrl') ?? '').replace(/\/+$/, '');
    const own = (u: string | undefined): boolean => {
      if (!u) return true;
      if (base && !u.startsWith(`${base}/`)) return false;
      const path = (() => { try { return new URL(u).pathname; } catch { return u; } })();
      return path.includes(`/uploads/${senderId}/`);
    };

    /* A FORWARD IS THE ONE LEGITIMATE CASE THE FIRST RULE FORBIDS — the file
       belongs to whoever sent it to you, so `uploads/<you>/` will never match.
       The second clause is a DATABASE question rather than a string one: the
       URL must name an Attachment row whose message sits in a conversation
       this sender is a member of. An arbitrary URL still cannot be posted, and
       a file from a chat they have left or been removed from is no longer
       theirs to pass on, because membership is re-read here and not trusted
       from whenever they first saw it. */
    const urls = attachments.flatMap((a) => [a.url, a.thumbnail]).filter((u): u is string => Boolean(u));
    const foreign = urls.filter((u) => !own(u));
    if (!foreign.length) return;

    // unbounded: `in:` at most ten attachments' worth of urls — the DTO caps it
    const seen = await this.prisma.attachment.findMany({
      where: {
        url: { in: foreign },
        message: { conversation: { members: { some: { userId: senderId } } } },
      },
      select: { url: true },
    });
    const allowed = new Set(seen.map((r) => r.url));
    for (const u of foreign) {
      if (!allowed.has(u)) {
        throw new ForbiddenException('An attachment must be a file you uploaded, or one sent to a conversation you are in.');
      }
    }
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
    attachments?: Array<{
      id: string; url: string; mimeType: string; thumbnail?: string | null;
      name?: string | null; size?: number | null; duration?: number | null;
    }>;
    sender?: unknown;
    statuses?: Array<{ status: string }>;
    replyTo?: { id: string; text: string | null; messageType: string; senderId: string; deleted: boolean } | null;
    starredForJson?: string | null;
    reactionsJson?: string | null;
    pinnedAt?: Date | null;
  }, viewerId?: string) {
    /* A DELETED MESSAGE IS DELETED ALL THE WAY DOWN. The tombstone used to
       zero only the text: `media` URLs and the share card still travelled to
       every member on a row whose whole point is that its content is gone.
       The client happened to hide them; the API must not hand them out. */
    let share: unknown = null;
    if (m.shareJson && !m.deleted) {
      try { share = JSON.parse(m.shareJson); } catch { share = null; }
    }
    /**
     * AUDIO IS ITS OWN KIND, AND THE REST OF THE ROW TRAVELS WITH IT.
     *
     * This used to fold audio into 'file' and drop every column but the URL,
     * so a voice note arrived as an anonymous attachment with no duration and
     * a document arrived with no name and no size — the three facts that make
     * either renderable as anything better than a link. The columns were in
     * the table the whole time (duration has been there since the schema was
     * written); only the serializer was throwing them away.
     */
    const media = (m.deleted ? [] : (m.attachments ?? [])).map((a) => ({
      id: a.id,
      url: a.url,
      kind: a.mimeType?.startsWith('image/')
        ? 'image'
        : a.mimeType?.startsWith('video/')
          ? 'video'
          : a.mimeType?.startsWith('audio/')
            ? 'audio'
            : 'file',
      thumbUrl: a.thumbnail ?? undefined,
      mimeType: a.mimeType,
      name: a.name ?? undefined,
      sizeBytes: typeof a.size === 'number' ? a.size : undefined,
      durationSec: typeof a.duration === 'number' ? a.duration : undefined,
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
      /* THE QUOTED MESSAGE TRAVELS WITH THE REPLY. `messageInclude` has
         fetched replyTo since replies were designed and the serializer dropped
         it on the floor — so a client held the id of the message being
         answered and could not show a word of it without a second fetch per
         bubble. Tombstoned like any other body: answering a message somebody
         later deleted quotes the deletion, never the text. */
      replyTo: m.replyTo
        ? {
            id: m.replyTo.id,
            senderId: m.replyTo.senderId,
            messageType: m.replyTo.messageType,
            deleted: m.replyTo.deleted,
            body: m.replyTo.deleted ? '' : (m.replyTo.text ?? ''),
          }
        : null,
      /* Starred is per READER, so it can only be answered when we know who is
         asking. Callers that serialize for one citizen pass their id; the
         broadcast paths do not, and false is the honest answer there — a
         socket frame goes to several people at once and cannot carry one
         person's bookkeeping. Their own next read fills it in. */
      starred: viewerId ? this.starredBy(m, viewerId) : false,
      /* Unlike `starred` right above it, this needs no viewer: it carries the
         ids and lets the reader recognise themselves. That is the reason a
         reaction frame can be broadcast and a star frame cannot. */
      reactions: this.reactionList(m),
      pinnedAt: m.pinnedAt ?? null,
      edited: !!m.edited,
      deleted: m.deleted,
      editedAt: m.edited ? (m.updatedAt ?? m.createdAt) : null,
      createdAt: m.createdAt,
      sender: m.sender,
    };
  }
}
