import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Readable } from 'stream';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma/prisma.service';
import { endedDatingConversationIds } from '../shared/dating-conversations';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { ChatMediaGuard } from './chat-media-guard';
import { StorageProvider } from '../media/storage.provider';
import { ChatEventBus } from '../shared/events/chat-events';
import { nickname } from '../shared/nickname';
import { shownName } from '../dating/matching';
import {
  AttachmentDto,
  DeleteMessageDto,
  EditMessageDto,
  ListMessagesDto,
  SearchMessagesDto,
  SendMessageDto,
} from './dto/messages.dto';

/**
 * THE CONVERSATION TRAVELS WITH THE MESSAGE SO THE SERIALIZER CAN ASK IT ONE
 * QUESTION: is this a dating chat nobody has revealed themselves in yet.
 *
 * `serialize` has seven call sites and the masking below must hold at all
 * seven. A flag threaded through seven callers is a flag somebody forgets at
 * the eighth, and the fact would then be true in six places and false in one —
 * which is the duplication this codebase keeps paying for. One join, one
 * question, one place that answers it.
 */
const messageInclude = {
  conversation: { select: { anonymousTrust: true } },
  // `datingProfile.extras` rides along for one reason: below trust 2 the
  // sender is named by their chosen dating name, and that is where it lives.
  sender: { select: { id: true, name: true, handle: true, profileImage: true, datingProfile: { select: { extras: true } } } },
  attachments: true,
  replyTo: {
    select: { id: true, text: true, messageType: true, senderId: true, deleted: true },
  },
  statuses: true,
} satisfies Prisma.MessageInclude;

/** The `firstName` a citizen chose for the Dating Hub, or nothing — never a
 *  throw: an unparseable blob falls through to `shownName`'s fallback. */
function datingFirstName(dp: { extras: string | null } | null | undefined): { firstName?: unknown } {
  if (!dp?.extras) return {};
  try { return { firstName: (JSON.parse(dp.extras) as { firstName?: unknown }).firstName }; } catch { return {}; }
}

/**
 * ── A PHOTO THAT DOES NOT STAY: THE CLOCKS ──────────────────────────────────
 *
 * Every deadline a snap keeps is decided HERE, on the server, from the mode
 * alone. The client says "once" or "day"; it never says "until Tuesday". A
 * deadline in the request body is a clock the sender sets on somebody else's
 * copy, and the first thing anybody would do with it is set it to a century.
 *
 * `views` is PER RECIPIENT — see Attachment.snapOpensJson for why a shared
 * counter is a bug in a group rather than a simplification.
 *
 * `ttlMs` on once and twice is a BACKSTOP, not the feature: a View Once is
 * finished when it is viewed, and this is only the answer to "what if it never
 * is". Seven days, because an unopened snap should still be there when
 * somebody comes back from a week away, and should not sit in the vault
 * forever if they do not.
 *
 * `keep` is the reading of the owner's fourth mode, written down because it
 * was the one ambiguous item on the list: "Keep in Chat — recipient can
 * explicitly save it, if the sender allows." Taken as a MODE rather than a
 * flag on the other three, so it is 24 hours with a Keep button on it, and
 * keeping stops the clock. Read as an orthogonal permission it would have
 * doubled the state — "view once, keepable" is a contradiction anyway.
 */
const SNAP_CLOCK: Record<string, { views: number | null; ttlMs: number | null }> = {
  once:  { views: 1,    ttlMs: 7 * 24 * 3600_000 },
  twice: { views: 2,    ttlMs: 7 * 24 * 3600_000 },
  day:   { views: null, ttlMs: 24 * 3600_000 },
  keep:  { views: null, ttlMs: 24 * 3600_000 },
};

/** `{ "<userId>": <opens so far> }`, or nothing. Never throws: an unparseable
 *  blob is read as "nobody has opened it", which is the fail-SHUT answer —
 *  it costs a recipient a view they already spent, and it cannot hand one to
 *  somebody who has spent theirs. */
function snapOpens(json: string | null | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, number>) : {};
  } catch { return {}; }
}

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permission: ConnectionPermissionService,
    private readonly bus: ChatEventBus,
    private readonly config: ConfigService,
    private readonly media: ChatMediaGuard,
    /* THE VAULT, because a snap is the one attachment this service reads and
       deletes itself. Every other file in a message is handed to the client as
       a URL and never touched again. */
    private readonly storage: StorageProvider,
  ) {}

  private readonly logger = new Logger(MessagesService.name);

  /** Send a message. Enforces the connection gate + membership before persisting. */
  async send(senderId: string, dto: SendMessageDto) {
    // 1) permission gate (403 if not connected / not a member)
    await this.permission.assertCanPostToConversation(senderId, dto.conversationId);
    /* 1a) HAVE WE ALREADY DONE THIS ONE? (fifth audit, 29 Aug.)
       `clientId` has been documented in the DTO as "optimistic UI / idempotency"
       since it was written and was read in exactly one place — the socket ack
       echoed it back — so nothing was idempotent: a POST retried after a
       timeout, or a socket re-sending what it could not confirm had landed,
       wrote a second row, and the person who said one thing had said it twice.
       AFTER the gate, so a repeat still has to be allowed to post; BEFORE the
       attachment work, because re-screening an image already screened is a
       second Rekognition call for a decision we have made. */
    if (dto.clientId) {
      const already = await this.prisma.message.findUnique({
        where: { senderId_clientId: { senderId, clientId: dto.clientId } },
        include: messageInclude,
      });
      /* AND IT MUST BE THE SAME CONVERSATION (re-audit, 29 Aug). The unique
         key is (sender, clientId), so a client that reuses an id across rooms
         — a per-conversation sequence rather than a uuid — would have been
         handed back the FIRST message, from the wrong room, with the second
         send dropped silently: no row, no event, no error. Today's web app
         uses `crypto.randomUUID()`, so this was latent rather than live; a
         latent silent-message-loss is still one. A collision across rooms is
         not idempotency, so it is refused rather than quietly answered. */
      if (already && already.conversationId === dto.conversationId) return this.serialize(already);
      if (already) {
        throw new BadRequestException('That message id has already been used in another conversation.');
      }
    }
    // 1b) attachment gate — see assertAttachmentsAreYoursToSend below.
    if (dto.attachments?.length) await this.assertAttachmentsAreYoursToSend(senderId, dto.attachments);
    // 1c) and WHAT IS IN THEM, if this is a chat between strangers.
    if (dto.attachments?.length) await this.screenAttachments(senderId, dto.conversationId, dto.attachments);
    /* 1c-ii) AND EVERY SNAP, IN EVERY ROOM. The line above is drawn at dating
       conversations and chat-media-guard.ts argues that boundary at length. A
       snap is the deliberate exception: it is the one image nobody can report
       after the fact, because by the time somebody complains the bytes are
       gone. Screening at the door is the only moment there is. */
    for (const a of dto.attachments ?? []) {
      if (!a.snap) continue;
      /* ONE OBJECT, ONE SNAP. A key already named by an attachment row is a
         key with a clock already running on it: sending it a second time would
         give the same bytes a second budget, and retiring either message would
         delete the photograph out from under the other. The upload route mints
         a fresh uuid per snap, so this only ever fires on a client replaying an
         old key — which is precisely the case worth refusing. */
      const already = await this.prisma.attachment.findFirst({ where: { url: a.url }, select: { id: true } });
      if (already) throw new BadRequestException('That snap has already been sent.');
      const verdict = await this.media.screenSnap(a.url, senderId);
      if (!verdict.ok) throw new BadRequestException(verdict.reason);
    }
    // 1d) and the ONE PICTURE THAT IS NOT AN ATTACHMENT — see below.
    const share = dto.share ? await this.shareForConversation(dto.conversationId, dto.share) : undefined;

    const recipientIds = await this.recipientIds(dto.conversationId, senderId);

    // 2) persist message + per-recipient SENT status + attachments atomically
    const text = dto.text ?? dto.body; // frontend sends `body`; DB column is `text`
    const args = {
      data: {
        conversationId: dto.conversationId,
        senderId,
        clientId: dto.clientId,
        text,
        messageType: dto.messageType,
        replyToMessageId: dto.replyToMessageId,
        shareJson: share ? JSON.stringify(share) : undefined,
        attachments: dto.attachments
          ? { create: dto.attachments.map((a) => this.attachmentRow(a)) }
          : undefined,
        statuses: {
          create: recipientIds.map((userId) => ({ userId, status: DeliveryStatus.SENT })),
        },
      },
      include: messageInclude,
    };
    let message;
    try {
      message = await this.prisma.message.create(args);
    } catch (e) {
      /* TWO IDENTICAL CLIENT IDS IN FLIGHT AT ONCE — the read above cannot see
         a row that has not committed yet, so the unique index is what actually
         decides, and the loser has to hand back the winner rather than an
         error. Anything else and the retry that this whole field exists for
         fails precisely when it was needed most. */
      const won = dto.clientId
        && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
        ? await this.prisma.message.findUnique({
            where: { senderId_clientId: { senderId, clientId: dto.clientId } },
            include: messageInclude,
          })
        : null;
      // Same conversation only — see the pre-check above for why.
      if (won && won.conversationId === dto.conversationId) return this.serialize(won);
      throw e;
    }

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
    // kind-spans: the socket room list is BOTH hubs on purpose. Dating chats
    // are realtime through this same gateway — typing, presence and receipts
    // all ride the room — so filtering to 'city' here would silently take the
    // Dating Hub's chat offline. What keeps a dating conversation out of the
    // main Chats surface is the list and the search, not the room.
    const rows = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
      orderBy: { conversation: { updatedAt: 'desc' } },
      take,
    });
    return rows.map((r) => r.conversationId);
  }

  /** Which of these conversations are one-to-one. The socket layer asks
   *  because a block ends a DIRECT thread and does not empty a group. */
  async directIds(conversationIds: string[]): Promise<Set<string>> {
    if (!conversationIds.length) return new Set();
    // unbounded: `in:` a room list conversationIdsFor has already capped
    const rows = await this.prisma.conversation.findMany({
      where: { id: { in: conversationIds }, type: 'DIRECT' },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Of these conversations, the dating ones whose match has ended. The socket
   *  layer asks; the rule lives in shared/dating-conversations.ts with the rest
   *  of what a dating conversation is. */
  async endedDatingIds(conversationIds: string[]): Promise<Set<string>> {
    return endedDatingConversationIds(this.prisma, conversationIds);
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

  /**
   * `pendingForUser` stood here — up to 500 fully-hydrated messages, the query
   * behind the `sync_pending` socket event.
   *
   * chat.gateway.ts removed that emit on purpose and says why: "no client has
   * ever listened for it, and the query behind it ran inside every handshake
   * for an audience of nobody." The emit went and this stayed, which left the
   * argument in one file and the temptation in another. Deleted so the two
   * agree.
   */

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
      select: {
        id: true, senderId: true, createdAt: true,
        // Read the room's anonymity with the row, not after it — see below.
        conversation: { select: { type: true, anonymousTrust: true } },
      },
    });
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.senderId !== userId) {
      throw new ForbiddenException('Only the sender can see who has read a message.');
    }
    /**
     * AND IT DOES NOT HAND OVER THE CITY HANDLE EITHER (fifth audit, 29 Aug).
     *
     * `serialize` masks the sender block, `members()` masks the roster,
     * `roster()` masks the list — three places that agree that below
     * anonymousTrust 2 a dating chat carries an id and a name and nothing that
     * reaches out of the Dating Hub. This method arrived later and knew about
     * none of it: send one message, read its id off the response, ask who has
     * seen it, and the answer named the other person's handle — the city's
     * primary key for a person, their posts, their public face — undoing the
     * reveal the whole hub is built around, in one GET.
     *
     * The masking is the same masking `members()` does, deliberately: a
     * pseudonym for the name, null for the handle, and only for people who are
     * not the caller.
     */
    const at = msg.conversation?.anonymousTrust;
    const anonymous = msg.conversation?.type === 'DIRECT' && at != null && at < 2;
    // unbounded: one message's recipients — group-sized, and the group is the point
    const rows = await this.prisma.messageStatus.findMany({
      where: { messageId },
      include: { user: { select: { id: true, name: true, handle: true } } },
    });
    return {
      messageId: msg.id,
      sentAt: msg.createdAt.toISOString(),
      recipients: rows.map((r) => {
        const masked = anonymous && r.userId !== userId;
        return {
          userId: r.userId,
          name: masked ? nickname(r.userId) : (r.user?.name ?? null),
          handle: masked ? null : (r.user?.handle ?? null),
          status: r.status,
          readAt: r.readAt ? r.readAt.toISOString() : null,
        };
      }),
    };
  }

  /** Multi-criteria search (keyword / sender / type / date / conversation). */
  async search(userId: string, dto: SearchMessagesDto) {
    // Dating chats live only in the Dating Hub. Search ran over every
    // membership, so a search in the main Chats screen returned messages from
    // an anonymous dating thread — the one place they were never meant to
    // surface.
    //
    // The exclusion is `kind: 'city'` on the conversation, not a set of dating
    // ids subtracted afterwards: that set came from a lookup that swallows a
    // database error and answers "none", which would have turned one broken
    // read into a search across everybody's anonymous threads. On the row, a
    // broken read throws and the search returns nothing.
    // unbounded: their own city memberships — the search scope, socially bounded
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, conversation: { kind: 'city' } },
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
      // Includes the dating case: a member of a dating chat still cannot reach
      // it from here, because this endpoint is the main Chats search.
      throw new ForbiddenException('Not a member of this conversation');
    }
    /* kind-spans: `where` is built above from `allowed`, and `allowed` comes
       from a membership read scoped to `kind: 'city'` — so the hub is decided
       there rather than here. Declared because this call cannot show it: the
       filter is in a variable, which is exactly the shape that hides a missing
       scope from a reviewer. */
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
  /**
   * ── OPEN A SNAP, AND SPEND THE VIEW IN THE SAME BREATH ─────────────────────
   *
   * The bytes are streamed by the controller from what this returns. Every
   * refusal is `null`, and they are all the same null on purpose — "expired",
   * "you have used both views", "you are not in this conversation" and "there
   * is no such message" are one 404 at the door, because a route that tells
   * them apart tells whoever is asking something about a photograph they are
   * not allowed to see.
   *
   * THE SENDER CANNOT RE-OPEN THEIR OWN, which is WhatsApp's rule and the
   * strict reading of the owner's. It costs the sender nothing they do not
   * already have — they took the picture — and it removes the branch where a
   * "view once" has been viewed twice by somebody. One rule, no exceptions to
   * hold in your head while reading the counter below.
   *
   * THE SPEND IS A COMPARE-AND-SET, and it has to be. Two taps arriving
   * together on a View Once both read `{}` , both see a view available and
   * both serve the photograph — the classic read-modify-write, on the one
   * counter in this feature that is load-bearing. `updateMany` with the OLD
   * json in the WHERE clause is an atomic conditional write on any database
   * we might run on, with no raw SQL and no advisory lock: the loser matches
   * zero rows, re-reads and tries once more, and a second failure refuses
   * rather than guessing. Serving the bytes AFTER the write is the other half
   * — a stream that breaks mid-flight has still spent the view, which is the
   * safe direction to be wrong in.
   */
  async openSnap(userId: string, messageId: string): Promise<{ body: Readable; contentType: string; contentLength?: number } | null> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const m = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true, senderId: true, conversationId: true, deleted: true,
          attachments: true,
        },
      });
      const a = m?.attachments.find((x) => x.snapMode);
      if (!m || !a || m.deleted) return null;
      if (m.senderId === userId) return null;
      const member = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: m.conversationId, userId } },
      });
      if (!member) return null;
      const kept = Boolean(a.snapKeptAt);
      if (!kept) {
        if (a.snapGoneAt) return null;
        if (a.snapExpiresAt && a.snapExpiresAt.getTime() <= Date.now()) return null;
      }
      const opens = snapOpens(a.snapOpensJson);
      const taken = opens[userId] ?? 0;
      /* A kept snap has no budget left to spend — keeping is what took the
         clock off it — so it is served without touching the counter. */
      if (kept) return this.storage.readPrivateObject(a.url);
      if (a.snapViews != null && taken >= a.snapViews) return null;

      const next = JSON.stringify({ ...opens, [userId]: taken + 1 });
      const won = await this.prisma.attachment.updateMany({
        where: { id: a.id, snapOpensJson: a.snapOpensJson ?? null },
        data: {
          snapOpensJson: next,
          ...(a.snapOpenedAt ? {} : { snapOpenedAt: new Date() }),
        },
      });
      if (won.count === 0) continue;   // somebody else opened it first — re-read

      const found = await this.storage.readPrivateObject(a.url);
      if (!found) return null;
      /* SPENT BY EVERYONE MEANS GONE NOW, not at the next sweep. The sweep
         exists for the snap nobody opens; this is the common case, and the
         bytes should not outlive the last view by ten minutes. */
      await this.retireSnapIfSpent(m.conversationId, m.senderId, a.id);
      this.bus.publish({ kind: 'snap.changed', conversationId: m.conversationId, messageId: m.id, by: userId, event: 'opened' });
      return found;
    }
    return null;
  }

  /**
   * Delete the object once every recipient has used every view they had.
   *
   * Best-effort, and never allowed to fail the open that triggered it: the
   * photograph has already been served, and a bucket having a bad day must not
   * turn that into an error for somebody who did nothing wrong. A row that is
   * past its views and has no `snapGoneAt` is exactly what the sweep looks
   * for, so a miss here is picked up within ten minutes.
   */
  private async retireSnapIfSpent(conversationId: string, senderId: string, attachmentId: string): Promise<void> {
    const a = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
    if (!a?.snapMode || a.snapViews == null || a.snapGoneAt || a.snapKeptAt) return;
    const recipients = await this.recipientIds(conversationId, senderId);
    const opens = snapOpens(a.snapOpensJson);
    if (!recipients.every((r) => (opens[r] ?? 0) >= a.snapViews!)) return;
    const gone = await this.storage.deletePrivateObject(a.url);
    if (!gone) {
      this.logger.error(`snap ${a.id} is spent and its object could NOT be deleted — it is still in the vault.`);
      return;
    }
    await this.prisma.attachment.update({ where: { id: a.id }, data: { snapGoneAt: new Date() } });
  }

  /**
   * KEEP IT — but only if the sender said it could be kept.
   *
   * `keep` is a mode, not a button the recipient always gets: the whole point
   * of the other three is that keeping is not on offer. So the check is on the
   * MODE, not on who is asking, and a recipient asking to keep a View Once is
   * refused rather than quietly ignored — they are about to lose it and should
   * be told that is what was always going to happen.
   */
  async keepSnap(userId: string, messageId: string) {
    const m = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, deleted: true, attachments: true },
    });
    const a = m?.attachments.find((x) => x.snapMode);
    if (!m || !a || m.deleted) throw new NotFoundException('That photo is not available.');
    await this.assertMember(userId, m.conversationId);
    if (m.senderId === userId) throw new ForbiddenException('It is the person you sent it to who keeps it.');
    if (a.snapMode !== 'keep') throw new ForbiddenException('This photo was not sent to be kept.');
    if (a.snapGoneAt || (a.snapExpiresAt && a.snapExpiresAt.getTime() <= Date.now())) {
      throw new NotFoundException('That photo is not available.');
    }
    if (!a.snapKeptAt) {
      await this.prisma.attachment.update({ where: { id: a.id }, data: { snapKeptAt: new Date() } });
      this.bus.publish({ kind: 'snap.changed', conversationId: m.conversationId, messageId: m.id, by: userId, event: 'kept' });
    }
    return this.snapState(m.id, userId);
  }

  /**
   * ── A SCREEN CAPTURE WAS REPORTED, AND THE WEB WILL NEVER CALL THIS ────────
   *
   * No browser tells a page it has been screenshotted or screen-recorded.
   * There is no API, and the heuristics people reach for — blur,
   * visibilitychange, a PrintScreen keydown — miss every real screenshot tool
   * on every platform and fire on every tab switch, which does not produce a
   * weaker notice, it produces a notice nobody believes. So the web client
   * does not call this route and does not claim the capability.
   *
   * The Capacitor shells CAN: iOS has `userDidTakeScreenshotNotification` and
   * `UIScreen.isCaptured`, Android has the API-34 screenshot callback. This is
   * the door they will knock on, and it is written now so that the native work
   * is a plugin and a fetch rather than a schema change, a migration and a new
   * socket event. Until then the column stays NULL and the thread says
   * nothing, which is the only honest thing to say.
   *
   * FIRST REPORT WINS and nothing counts. "They took a screenshot" is the
   * fact; how many times is a detail that would turn the notice into a
   * scoreboard, and in a group it would name people. The event carries who,
   * because the sender is owed that in a room with five people in it.
   */
  async reportSnapShot(userId: string, messageId: string) {
    const m = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, conversationId: true, attachments: true },
    });
    const a = m?.attachments.find((x) => x.snapMode);
    if (!m || !a) throw new NotFoundException('That photo is not available.');
    await this.assertMember(userId, m.conversationId);
    if (m.senderId === userId) throw new ForbiddenException('That is your own photo.');
    if (!a.snapShotAt) {
      await this.prisma.attachment.update({ where: { id: a.id }, data: { snapShotAt: new Date() } });
    }
    this.bus.publish({ kind: 'snap.changed', conversationId: m.conversationId, messageId: m.id, by: userId, event: 'shot' });
    return this.snapState(m.id, userId);
  }

  /** What the caller's own client should now show for this message. The whole
   *  message rather than a snap fragment, because the client already knows how
   *  to replace a message in its cache and does not need a second shape. */
  private async snapState(messageId: string, viewerId: string) {
    const m = await this.prisma.message.findUnique({ where: { id: messageId }, include: messageInclude });
    if (!m) throw new NotFoundException('That photo is not available.');
    return this.serialize(m, viewerId);
  }

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
      /* A snap is screened by `screenSnap` in every conversation, before this
         runs, and its `url` is a private key that `keyFromUrl` would refuse.
         Letting it fall through here would refuse every snap in a dating chat
         with "that file could not be read". */
      if ((a as { snap?: unknown }).snap) continue;
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

  /**
   * A CHAT BETWEEN STRANGERS TAKES NO PICTURE FROM OUTSIDE THE CITY.
   *
   * The DTO already refuses a `data:` payload in the share card's `image`, so
   * what is left is a link — and a link is still two things in a dating chat.
   * It is a viewer-IP harvester, which is the whole reason
   * `assertAttachmentsAreYoursToSend` exists twenty lines below. And it is a
   * picture nobody screened: an attacker hosts whatever they like on their own
   * server, calls it a film poster, and the recipient's client fetches and
   * renders it before anybody has looked.
   *
   * THE CARD TRAVELS AND THE PICTURE DOES NOT, rather than a 400 for the whole
   * message. The share is the point — the film, the dish, the post, its title
   * and its line of text all arrive — and the client already renders a card
   * with no image, because `image` has always been nullable. Refusing the
   * message instead would take a working feature away from the hub this rule
   * exists to protect, to remove a photograph the recipient never asked for.
   *
   * ONLY dating conversations, which are the ones `anonymousTrust` marks — the
   * same line `screenAttachments` draws, for the same reason: two people who
   * accepted a connection are not two strangers a matching engine introduced.
   */
  private async shareForConversation(
    conversationId: string,
    share: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!share.image) return share;
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { anonymousTrust: true },
    });
    /* BELOW THE REVEAL, NOT MERELY "SET" (re-audit, 29 Aug). The first
       version fired on any non-null `anonymousTrust`, and every other
       anonymity test in the tree draws the line at `< 2`: `serialize`,
       `members()`, `roster()` and `info()` all do. Two things broke that this
       rule was never about — a dating chat where BOTH people have revealed,
       which is by definition no longer a chat between strangers, and the
       real-estate enquiry thread, which opens at trust 2 and whose whole
       purpose is sharing the property, photograph and all. */
    const at = (convo as { anonymousTrust?: number | null } | null)?.anonymousTrust;
    if (at == null || at >= 2) return share;
    return { ...share, image: null };
  }

  /**
   * The Attachment row a request's attachment becomes.
   *
   * For everything that is not a snap this is the spread it replaced — the DTO
   * fields ARE the columns and always have been. A snap adds the clock, and
   * every value of it is computed here from the mode, never copied from the
   * request: see SNAP_CLOCK for why the sender does not get to name a deadline.
   */
  private attachmentRow(a: AttachmentDto) {
    const { snap, ...rest } = a;
    if (!snap) return rest;
    const clock = SNAP_CLOCK[snap.mode];
    return {
      ...rest,
      snapMode: snap.mode,
      snapLive: Boolean(snap.live),
      snapViews: clock.views,
      snapExpiresAt: clock.ttlMs == null ? null : new Date(Date.now() + clock.ttlMs),
    };
  }

  private async assertAttachmentsAreYoursToSend(
    senderId: string,
    attachments: Array<{ url: string; thumbnail?: string }>,
  ): Promise<void> {
    const base = (this.config.get<string>('media.publicBaseUrl') ?? '').replace(/\/+$/, '');
    const own = (u: string | undefined): boolean => {
      if (!u) return true;
      /* A SNAP PROVES ITSELF WITH ITS PREFIX. Its `url` is a private key, not
         a URL, so the public-base and `/uploads/` rules below cannot speak to
         it at all — and must not be allowed to pass it by accident either.
         `snaps/<senderId>/…` is the ownership proof, the same way
         `uploads/<senderId>/` is; a key naming somebody else fails here and
         then fails the forward lookup too, which is right: a snap is never
         forwardable, because the row it names carries a spent view budget. */
      if (u.startsWith('snaps/')) return u.startsWith(`snaps/${senderId}/`);
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
    /* A SNAP IS NEVER FORWARDABLE, and it must be refused BEFORE the forward
       clause below — which would otherwise wave it straight through.
       "An attachment from a conversation you are in" is exactly what a snap
       somebody sent you is, so the lookup would find the row, the send would
       be allowed, and a second message would point at the same object with a
       fresh view budget. A View Once forwarded to a group is the whole feature
       undone, in the one code path that was written to be generous.
       (The web client cannot construct this — a snap's `url` reaches it empty
       — which is exactly the kind of "safe by accident" this gate exists to
       stop being.) */
    const stolen = urls.find((u) => u.startsWith('snaps/') && !u.startsWith(`snaps/${senderId}/`));
    if (stolen) {
      throw new ForbiddenException('A snap cannot be forwarded — it belongs to the moment it was sent in.');
    }
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
      snapMode?: string | null; snapLive?: boolean | null; snapViews?: number | null;
      snapOpensJson?: string | null; snapExpiresAt?: Date | null; snapOpenedAt?: Date | null;
      snapKeptAt?: Date | null; snapShotAt?: Date | null; snapGoneAt?: Date | null;
    }>;
    sender?: unknown;
    statuses?: Array<{ status: string }>;
    replyTo?: { id: string; text: string | null; messageType: string; senderId: string; deleted: boolean } | null;
    starredForJson?: string | null;
    reactionsJson?: string | null;
    pinnedAt?: Date | null;
    conversation?: { anonymousTrust?: number | null } | null;
  }, viewerId?: string) {
    /**
     * A DATING CHAT DOES NOT HAND OVER THE CITY IDENTITY. (Fourth audit, 28 Aug.)
     *
     * `messageInclude` selects the sender's handle and profile photo, and this
     * returned them verbatim on the REST read and on every socket broadcast.
     * In a dating conversation that is the exact disclosure `cardIdentity`
     * exists to prevent, in the words written above it: the handle is the
     * city's primary key for a person — their posts, their connections, their
     * public face — and the profile photo is the face the whole city already
     * knows them by. `nothing-links-the-card-to-the-city.spec.ts` forbids both
     * from appearing in the dating module; the message serializer lives here,
     * outside its reach, and was handing over both on every message.
     *
     * A name stays — and it is the DATING name (fifth audit, 31 Aug, H4).
     *
     * This used to keep `User.name`, the account name, on the reasoning that
     * "the Matches page always showed the profile's real name". That stopped
     * being true on 27 Aug: cards, the dating chat list and every push now
     * name a person by `shownName(extras.firstName, User.name)` — the name
     * they chose for this hub, falling back to the account name only when
     * they chose none. The message row was the one surface still carrying the
     * account name, on every REST read, every socket frame and every pin,
     * from the first bubble, before any reveal. The profile page promises
     * "not your real name"; this is that promise, kept where the messages are.
     *
     * anonymousTrust 2 is the choice, and `reveal` is how it is made: both
     * sides say yes, the conversation moves to 2, and the sender block is
     * whole. Before that it carries an id and the dating name and nothing
     * that reaches out of the Dating Hub into the rest of somebody's life.
     */
    const anonymous = m.conversation?.anonymousTrust != null && m.conversation.anonymousTrust < 2;
    const sender = anonymous && m.sender && typeof m.sender === 'object'
      ? (({ id, name, datingProfile }) => ({ id, name: shownName(datingFirstName(datingProfile), name) }))(
        m.sender as { id: string; name: string; datingProfile?: { extras: string | null } | null })
      : m.sender;
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
    const media = (m.deleted ? [] : (m.attachments ?? [])).map((a) => {
      /**
       * ── A SNAP HANDS OVER NO ADDRESS ────────────────────────────────────
       *
       * `url` is EMPTY on a snap, and that is the load-bearing line in this
       * function. The column holds a private key — `snaps/<sender>/<uuid>` —
       * and a recipient holding it could ask for the bytes without spending a
       * view, forever, past the expiry, after the sweep, which is the entire
       * thing "view once" is supposed to mean. The bytes are reached ONLY
       * through `GET /messages/:id/snap`, which spends the view in the same
       * request that serves them.
       *
       * Empty rather than absent because `MediaAttachment.url` is a required
       * string in the client's schema and on eleven render paths; an optional
       * url is a `<img src={undefined}>` waiting to happen in a component that
       * forgot which kind it had. `kind: 'snap'` is the discriminator, it is
       * checked first in MessageBody, and a server spec holds this empty.
       */
      const snap = a.snapMode
        ? (() => {
            const opens = snapOpens(a.snapOpensJson);
            const taken = viewerId ? (opens[viewerId] ?? 0) : 0;
            const past = a.snapExpiresAt != null && a.snapExpiresAt.getTime() <= Date.now();
            return {
              mode: a.snapMode,
              live: Boolean(a.snapLive),
              /* The allowance, and what is left of it FOR THE PERSON ASKING.
                 Without a viewer — every socket broadcast — `viewsLeft` is the
                 whole allowance, which is the true thing to say to a room:
                 each of you gets this many. The reader's own next fetch
                 narrows it, exactly as `starred` does two fields down. */
              views: a.snapViews ?? null,
              viewsLeft: a.snapViews == null ? null : Math.max(0, a.snapViews - taken),
              expiresAt: a.snapKeptAt ? null : (a.snapExpiresAt ?? null),
              openedAt: a.snapOpenedAt ?? null,
              keptAt: a.snapKeptAt ?? null,
              /* Reported by a native shell, never by the web app — see
                 Attachment.snapShotAt for why the browser cannot know. */
              shotAt: a.snapShotAt ?? null,
              /* Nothing left to open: the bytes are deleted, or the clock ran
                 out, or this reader has spent every view they had. Keeping
                 stops all three. */
              gone: Boolean(a.snapKeptAt)
                ? false
                : Boolean(a.snapGoneAt) || past || (a.snapViews != null && taken >= a.snapViews),
            };
          })()
        : undefined;
      return {
        id: a.id,
        /* A KEPT SNAP IS STILL A SNAP HERE. Keeping stops the clock; it does
           not move the bytes. The object is in the private vault and has no
           public address to hand over, so a kept snap is fetched through the
           same route as any other — it simply never spends anything and never
           expires. Handing back the key on this branch would have published
           every snap anybody chose to keep. */
        url: snap ? '' : a.url,
        kind: snap
          ? 'snap'
          : a.mimeType?.startsWith('image/')
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
        ...(snap ? { snap } : null),
      };
    });
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
      sender,
    };
  }
}
