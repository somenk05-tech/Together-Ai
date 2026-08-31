import { swallowed } from '../shared/swallow';
import { Injectable, Logger } from '@nestjs/common';
import { shownName } from '../dating/matching';
import { datingContext } from '../shared/dating-conversations';
import { PrismaService } from '../shared/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { PresenceService } from '../users/presence.service';
import { FcmProvider } from './fcm.provider';
import { WebPushProvider } from './web-push.provider';
import { NotificationsGateway } from './notifications.gateway';

/** The recipient's own answer to "may a dating message's words reach my lock
 *  screen". Absent means no. Written through PATCH /api/privacy like every
 *  other `pref:` key, so it lives with the rest of what a citizen has chosen
 *  rather than in a table of its own. */
const DATING_PREVIEW_KEY = 'pref:dating-push-preview';

export interface NotificationRow {
  id: string; userId: string; kind: string; title: string;
  body: string | null; href: string | null; actorId: string | null;
  entityId: string | null; read: boolean; createdAt: Date;
}

export interface CreateNotificationInput {
  userId: string;           // recipient
  kind: string;             // like | comment | follow | connection_request | connection_accepted | post_live
  title: string;
  body?: string | null;
  href?: string | null;
  actorId?: string | null;  // who triggered it (never notify yourself of your own action)
  entityId?: string | null;
  /**
   * Where a NATIVE app should open, if the deep link is not simply the href.
   *
   * No longer the switch that decides whether anything is sent — see `create`.
   * Left in because two of the dating pushes route somewhere the href cannot
   * express (a specific chat), and derived from the href everywhere else.
   */
  push?: { deepLink: string };
  /**
   * Do not interrupt anybody with this one. The bell still gets it.
   *
   * Deliberately unused today and deliberately here: the default below is ON,
   * and the next person who adds a notification that should NOT buzz a phone
   * needs somewhere to say so that is not "leave a field out and hope".
   */
  silent?: boolean;
}

/**
 * `/dating/matches` → `togethercity://dating/matches`.
 *
 * The convention the three hand-written deep links already used, applied to
 * the rest rather than copied a fourth time.
 */
export function deepLinkFrom(href: string | null | undefined): string {
  return `togethercity://${(href ?? '/').replace(/^\/+/, '')}`;
}

/**
 * Notifications. Two roles:
 *  1. Push (FCM / web-push) for new chat messages — unchanged.
 *  2. An in-app notification feed (likes, comments, follows, connection
 *     requests/accepts) stored per recipient and pushed live over WebSocket.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly redis: RedisService,
    private readonly fcm: FcmProvider,
    private readonly webpush: WebPushProvider,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** New-model access (reaches the generated client on deploy via db push). */
  private get notif() {
    return (this.prisma as unknown as {
      notification: {
        create: (a: unknown) => Promise<NotificationRow>;
        findFirst: (a: unknown) => Promise<NotificationRow | null>;
        findMany: (a: unknown) => Promise<NotificationRow[]>;
        count: (a: unknown) => Promise<number>;
        update: (a: unknown) => Promise<NotificationRow>;
        updateMany: (a: unknown) => Promise<unknown>;
      };
    }).notification;
  }

  private shape(n: NotificationRow) {
    return {
      id: n.id, kind: n.kind, title: n.title, body: n.body ?? undefined,
      href: n.href ?? undefined, read: n.read, createdAt: n.createdAt.toISOString(),
    };
  }

  /** Create + push an in-app notification. No-op when actor === recipient
   *  (you never get notified of your own action). Best-effort — never throws
   *  into the caller's request path. */
  async create(input: CreateNotificationInput): Promise<void> {
    try {
      if (input.actorId && input.actorId === input.userId) return;
      const row = await this.notif.create({
        data: {
          userId: input.userId, kind: input.kind, title: input.title,
          body: input.body ?? null, href: input.href ?? null,
          actorId: input.actorId ?? null, entityId: input.entityId ?? null,
        },
      });
      const count = await this.unreadCount(input.userId);
      this.gateway.emitNew(input.userId, this.shape(row), count);
      /**
       * PUSH IS THE DEFAULT NOW (owner, 28 Aug).
       *
       * It was opt-in, and three of roughly forty notifications opted in. So
       * the alert that exists to bring somebody back — "you have a new 91%
       * compatible match" — reached the bell of a person who was not looking
       * at the bell, and the report doorbell reached a moderator only while
       * they had the console open. A notification worth writing to the
       * database is worth telling somebody about; the ones that are not should
       * not be rows either.
       *
       * The interruption rule that made opt-in defensible is kept, and it is
       * the one that matters: nothing is sent to somebody who is HERE. A push
       * on top of a live toast is the same news twice.
       *
       * `silent` is the way out for a notification that genuinely should not
       * buzz. Chat messages are unaffected — they never came through here;
       * they upsert one row per conversation, by a 9 Aug decision, and giving
       * that path a push is a separate question about a different rhythm.
       */
      if (!input.silent && !(await this.presence.isOnline(input.userId))) {
        await this.pushToDevices(
          input.userId, input.title, input.body ?? '',
          input.push?.deepLink ?? deepLinkFrom(input.href), input.href ?? '/',
          /* THE ROW'S OWN ID AS THE TAG. Every bell push went out with an
             empty conversationId, which the service worker collapsed into one
             shared tag — so "It's a match", "You have a new like" and a
             moderation verdict overwrote each other on a locked phone, and the
             one notification the product exists to send was the one destroyed.
             A notification is its own event; nothing else may replace it. */
          `n-${row.id}`,
        );
      }
    } catch (e) {
      this.log.warn(`notification create failed (${input.kind}): ${(e as Error).message}`);
    }
  }

  /** Every device this citizen registered, FCM and web-push alike. Best-effort. */
  private async pushToDevices(userId: string, title: string, body: string, deepLink: string, url: string, tag?: string): Promise<void> {
    // unbounded: one citizen's device tokens — a handful
    const devices = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true, platform: true } });
    const fcmTokens = devices.filter((d) => d.platform !== 'webpush').map((d) => d.token);
    const webTokens = devices.filter((d) => d.platform === 'webpush').map((d) => d.token);
    await this.fcm.send(fcmTokens, { title, body, deepLink, data: { deepLink } });
    await this.webpush.send(webTokens, { title, body, conversationId: '', url, tag });
  }

  /** Recent notifications for a user, newest first. Chats are NOT here —
   *  a message row exists only to drive the toast and per-conversation
   *  clearing; the Chats tab is the one surface that counts correspondence
   *  (owner decision, 9 Aug 2026 — see not-in-the-bell.spec.ts). */
  async listFor(userId: string, limit = 50, cursor?: string, cursorId?: string) {
    /**
     * A CURSOR, BECAUSE THERE WAS NO WAY TO THE FIFTY-FIRST (fifth audit,
     * 29 Aug). `listFor` took a limit, the controller passed none, and the
     * route offered nothing else — so notification 51 was unreachable for the
     * life of the account. Keyset, not offset: notifications arrive while you
     * are reading them, and an offset page shifts under new rows.
     *
     * `createdAt` alone is not a key — two notifications can share a
     * millisecond — so the id breaks the tie. THE TIE-BREAK HAS TO BE IN THE
     * WHERE AND NOT ONLY IN THE ORDER BY (re-audit, 29 Aug): the first version
     * ordered by the pair and filtered on `createdAt < cursor` alone, so when
     * two rows shared the boundary millisecond and a page ended on the first
     * of them, the second was asked for with `< T`, excluded, and unreachable
     * for ever. That is the same "a row that exists and can never be reached"
     * this method was rewritten to remove, reintroduced one line lower down.
     *
     * So the cursor is the pair, and the predicate is the pair: everything
     * strictly older, plus the same instant with a smaller id.
     */
    const at = cursor ? new Date(cursor) : null;
    const after = at && !Number.isNaN(at.getTime()) ? at : null;
    const rows = await this.notif.findMany({
      where: {
        userId, kind: { not: 'message' },
        ...(after ? {
          OR: cursorId
            ? [{ createdAt: { lt: after } }, { createdAt: after, id: { lt: cursorId } }]
            : [{ createdAt: { lt: after } }],
        } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: Math.min(Math.max(limit, 1), 100),
    }).catch(swallowed('notifications.listFor', [] as NotificationRow[]));
    /* STILL AN ARRAY. Web and API deploy independently, so changing the shape
       of this response would break every client on the old build the moment
       the new server landed — for a paging feature. A caller that wants the
       next page passes the `createdAt` of the last item it holds; a full page
       is how it knows to ask. */
    return rows.slice(0, Math.min(Math.max(limit, 1), 100)).map((r) => this.shape(r));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notif.count({ where: { userId, read: false, kind: { not: 'message' } } }).catch(() => 0);
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.notif.updateMany({ where: { id, userId }, data: { read: true } }).catch(swallowed('notifications.markRead', undefined));
    this.gateway.emitCount(userId, await this.unreadCount(userId));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notif.updateMany({ where: { userId, read: false, kind: { not: 'message' } }, data: { read: true } }).catch(swallowed('notifications.markAllRead', undefined));
    this.gateway.emitCount(userId, 0);
  }

  /**
   * A new message as an in-app bell notification — ONE entry per conversation
   * that updates in place (so an active chat doesn't spam the feed with a row
   * per message). Titled with the sender's name; emitting it drives the live
   * bell + the corner toast.
   */
  private async upsertMessageNotification(recipientId: string, conversationId: string, title: string, preview: string, href: string): Promise<void> {
    try {
      const existing = await this.notif.findFirst({
        where: { userId: recipientId, kind: 'message', entityId: conversationId, read: false },
        orderBy: { createdAt: 'desc' },
      });
      const data = { title, body: preview, href };
      const row = existing
        ? await this.notif.update({ where: { id: existing.id }, data: { ...data, createdAt: new Date() } })
        : await this.notif.create({ data: { userId: recipientId, kind: 'message', entityId: conversationId, ...data } });
      const count = await this.unreadCount(recipientId);
      this.gateway.emitNew(recipientId, this.shape(row), count);
    } catch (e) {
      this.log.warn(`message notification failed: ${(e as Error).message}`);
    }
  }

  /** Clear a conversation's message notification once the user opens it, so the
   *  bell badge stays in sync with what they've actually read. */
  async markConversationRead(userId: string, conversationId: string): Promise<void> {
    await this.notif.updateMany({ where: { userId, kind: 'message', entityId: conversationId, read: false }, data: { read: true } }).catch(swallowed('notifications.markConversationRead', undefined));
    this.gateway.emitCount(userId, await this.unreadCount(userId));
  }

  /**
   * MAY A DATING MESSAGE'S WORDS GO TO A LOCK SCREEN?
   *
   * By default, no. A dating push says who it is from — the sender's chosen
   * dating name, which `identityIn` already decides — and nothing about what it
   * says. Everything else in this hub is built on the idea that the person on
   * the other end is not yet part of your life in the city; the one surface
   * that ignored it was the one nobody has to unlock a phone to read.
   *
   * It is the RECIPIENT's setting, because it is the recipient's lock screen.
   * The sender has no say in it, which is the opposite of the reveal ladder and
   * deliberately so: a reveal is about who you are, this is about who is
   * standing behind somebody else on a train.
   *
   * Default off rather than on, and the failure direction is also off: a read
   * that throws returns false, so a database problem costs a preview and never
   * spends one. City chats are untouched — this asks nothing of them.
   */
  private async datingPreviewAllowed(recipientId: string): Promise<boolean> {
    const store = (this.prisma as unknown as {
      privacySetting?: { findUnique(a: unknown): Promise<{ value: string } | null> };
    }).privacySetting;
    // No store, no preview. An explicit branch rather than a bare catch, and it
    // falls the same way every other failure here does: towards saying less.
    if (!store) return false;
    const row = await store
      .findUnique({ where: { userId_key: { userId: recipientId, key: DATING_PREVIEW_KEY } } })
      .catch(swallowed('notifications: dating preview preference', null, { recipientId }));
    return row?.value === 'true';
  }

  /**
   * How one citizen may be named to another, in this conversation.
   *
   * A dating chat is anonymous until each person chooses otherwise, and it
   * lives only in the Dating Hub. Anything that reaches a lock screen has to go
   * through here or the anonymity is decorative: a notification carrying a real
   * name and face is a reveal nobody consented to, and it happens at the moment
   * the recipient is least able to stop it.
   *
   * The SENDER's own choice decides. Waiting for a mutual reveal would keep
   * hiding someone who had already decided to be themselves.
   */
  private async identityIn(
    conversationId: string,
    senderId: string,
  ): Promise<{ displayName: string; displayPhoto?: string; dating: boolean } | null> {
    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true, profileImage: true },
    });
    if (!sender) return null;
    const ctx = await datingContext(this.prisma, conversationId, senderId);
    // A DATING CHAT NEVER PUSHES THE CITY IDENTITY (27 Aug, second audit,
    // blocker 06). This used to send `sender.name` (the ACCOUNT name) and
    // `sender.profileImage` (the city photo the dating card refuses to show) to
    // the match's lock screen — defeating the pseudonym with the first message.
    // Now a dating notification carries exactly what the card carries: the
    // sender's chosen dating name (shownName), and NO photo. Everything else
    // (real city chats) is unchanged.
    if (ctx.dating) {
      // A failure here falls through to shownName's fallback — the ACCOUNT name,
      // on the lock screen, which is the leak the note above closed. Say so.
      const dp = await this.prisma.datingProfile
        .findUnique({ where: { userId: senderId }, select: { extras: true } })
        .catch(swallowed('notifications: read the dating name for a push', null, { senderId }));
      let firstName: unknown;
      try { firstName = dp?.extras ? (JSON.parse(dp.extras) as { firstName?: unknown }).firstName : undefined; } catch { firstName = undefined; }
      return { displayName: shownName({ firstName }, sender.name), displayPhoto: undefined, dating: true };
    }
    return {
      displayName: sender.name,
      displayPhoto: sender.profileImage ?? undefined,
      dating: false,
    };
  }

  /**
   * Somebody is calling.
   *
   * Deliberately unlike a message notification in two ways. It is never
   * suppressed for a recipient who has the chat open — the socket ring and this
   * are different channels and a phone that stays silent because you were
   * typing is a missed call. And it never groups: every call is its own row,
   * because "3 missed calls" collapsed into one line loses the thing a citizen
   * actually wants to know.
   *
   * Best-effort throughout. A push that fails must not fail the call.
   */
  async notifyIncomingCall(params: {
    conversationId: string;
    callerId: string;
    recipientIds: string[];
    callId: string;
    type: string;
  }): Promise<void> {
    try {
      const identity = await this.identityIn(params.conversationId, params.callerId);
      if (!identity) return;
      const { displayName, displayPhoto, dating } = identity;
      const kindWord = params.type === 'audio' ? 'call' : `${params.type} call`;
      const href = dating
        ? `/matchmaking/chats?c=${params.conversationId}&call=${params.callId}`
        : `/chats?c=${params.conversationId}&call=${params.callId}`;
      const deepLink = `togethercity://call/${params.callId}`;

      for (const recipientId of params.recipientIds) {
        // Muting a chat mutes its messages. It does not mute a ringing phone —
        // that is a different promise, and one nobody made.
        //
        // `silent` because THIS method pushes for itself, a few lines down, and
        // by its own rules: a ringing phone reaches you whether or not you are
        // online and whether or not the chat is muted, which the default gate
        // below `create` would not do. Without it the call arrives twice on
        // every offline device — which is what the golden master caught the day
        // push became the default.
        await this.create({
          userId: recipientId,
          kind: 'call_incoming',
          title: `Incoming ${kindWord}`,
          body: `${displayName} is calling you.`,
          href,
          actorId: params.callerId,
          entityId: params.callId,
          silent: true,
        });

        // unbounded: one citizen's device tokens — a handful
        const devices = await this.prisma.deviceToken.findMany({
          where: { userId: recipientId },
          select: { token: true, platform: true },
        });
        const fcmTokens = devices.filter((d) => d.platform !== 'webpush').map((d) => d.token);
        const webTokens = devices.filter((d) => d.platform === 'webpush').map((d) => d.token);

        await this.fcm.send(fcmTokens, {
          title: `Incoming ${kindWord}`,
          body: `${displayName} is calling you.`,
          imageUrl: displayPhoto,
          deepLink,
          data: { conversationId: params.conversationId, callId: params.callId },
        });
        await this.webpush.send(webTokens, {
          title: `Incoming ${kindWord}`,
          body: `${displayName} is calling you.`,
          conversationId: params.conversationId,
          icon: displayPhoto,
          /* THE THIRD EMIT SITE, MISSED THE FIRST TIME (re-audit, 29 Aug).
             With no tag the worker falls back to `chat-<conversationId>`, so a
             call shared a tag with that conversation's chat notification AND
             with every other call in it — while this method's own docblock
             says the opposite: "it never groups: every call is its own row,
             because '3 missed calls' collapsed into one line loses the thing a
             citizen actually wants to know."
             And with no url the tap resolved to the city chats route and lost
             `&call=<id>`, so tapping a call notification never joined the
             call. `href` was computed forty lines up and thrown away, which is
             the same mistake the message path had. */
          tag: `call-${params.callId}`,
          url: href,
        });
      }
    } catch (e) {
      this.log.warn(`call notification failed: ${(e as Error).message}`);
    }
  }

  async notifyNewMessage(params: {
    conversationId: string;
    senderId: string;
    recipientIds: string[];
    preview: string;
  }): Promise<void> {
    const identity = await this.identityIn(params.conversationId, params.senderId);
    if (!identity) return;
    const { displayName, displayPhoto, dating } = identity;
    const href = dating ? `/matchmaking/chats?c=${params.conversationId}` : `/chats?c=${params.conversationId}`;
    const deepLink = dating
      ? `togethercity://dating/chat/${params.conversationId}`
      : `togethercity://chat/${params.conversationId}`;

    for (const recipientId of params.recipientIds) {
      /* ONE RECIPIENT'S FAILURE IS ONE RECIPIENT'S FAILURE (fifth audit,
         29 Aug). This loop had no try/catch, and it is invoked from a floating
         promise on the event bus — so a single Prisma or provider error aborted
         the whole fan-out and everybody after the failing recipient was told
         nothing, with an unhandled rejection as the only trace. */
      try {
        const online = await this.presence.isOnline(recipientId);
        const openConvos = await this.redis.openConversationsOf(recipientId);
        // Suppress if any of the recipient's live tabs is viewing this conversation.
        if (online && openConvos.includes(params.conversationId)) continue;

        const member = await this.prisma.conversationMember.findUnique({
          where: { conversationId_userId: { conversationId: params.conversationId, userId: recipientId } },
        });
        if (member?.muted) continue;

        /* WHAT MAY LEAVE THE APP, for this recipient.
           The bell keeps the preview: it is inside the app, behind a session,
           and a notification list that says "New message" four times is not a
           notification list. The PUSH is the surface a stranger can read over
           somebody's shoulder, and for a dating chat it carries the sender's
           chosen name and nothing else unless this recipient asked otherwise. */
        const pushBody = dating && !(await this.datingPreviewAllowed(recipientId))
          ? 'New message'
          : params.preview;

        // In-app bell notification (grouped per chat) + live toast, titled with
        // the sender's name.
        await this.upsertMessageNotification(recipientId, params.conversationId, displayName, params.preview, href);

        // unbounded: one citizen's device tokens — a handful
        const devices = await this.prisma.deviceToken.findMany({
          where: { userId: recipientId },
          select: { token: true, platform: true },
        });
        const fcmTokens = devices.filter((d) => d.platform !== 'webpush').map((d) => d.token);
        const webTokens = devices.filter((d) => d.platform === 'webpush').map((d) => d.token);

        await this.fcm.send(fcmTokens, {
          title: displayName,
          body: pushBody,
          imageUrl: displayPhoto,
          deepLink,
          data: { conversationId: params.conversationId },
        });

        // Browser / PWA push — reaches the recipient even with the app fully closed.
        await this.webpush.send(webTokens, {
          title: displayName,
          body: pushBody,
          conversationId: params.conversationId,
          icon: displayPhoto,
          /* THE HREF THIS METHOD ALREADY COMPUTED, twenty lines up, and then
             threw away. Without it the worker fell back to `/chats?c=<id>` —
             the CITY Chats route — for a dating conversation, which is the one
             list dating threads are deliberately stripped from, so the thread
             opened with no peer and a broken header. */
          url: href,
        });
      } catch (e) {
        this.log.warn(`message notification failed for one recipient: ${(e as Error).message}`);
      }
    }
  }
}
