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
   * Reach the phone as well as the bell. Opt-in per call, because the bell
   * is the right place for most of the city and a push is an interruption:
   * a mutual match and a like are the two things worth one. (26 Aug.)
   */
  push?: { deepLink: string };
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
      // Only when they are not here to see the bell: a push on top of a live
      // toast is the same news twice.
      if (input.push && !(await this.presence.isOnline(input.userId))) {
        await this.pushToDevices(input.userId, input.title, input.body ?? '', input.push.deepLink, input.href ?? '/');
      }
    } catch (e) {
      this.log.warn(`notification create failed (${input.kind}): ${(e as Error).message}`);
    }
  }

  /** Every device this citizen registered, FCM and web-push alike. Best-effort. */
  private async pushToDevices(userId: string, title: string, body: string, deepLink: string, url: string): Promise<void> {
    // unbounded: one citizen's device tokens — a handful
    const devices = await this.prisma.deviceToken.findMany({ where: { userId }, select: { token: true, platform: true } });
    const fcmTokens = devices.filter((d) => d.platform !== 'webpush').map((d) => d.token);
    const webTokens = devices.filter((d) => d.platform === 'webpush').map((d) => d.token);
    await this.fcm.send(fcmTokens, { title, body, deepLink, data: { deepLink } });
    await this.webpush.send(webTokens, { title, body, conversationId: '', url });
  }

  /** Recent notifications for a user, newest first. Chats are NOT here —
   *  a message row exists only to drive the toast and per-conversation
   *  clearing; the Chats tab is the one surface that counts correspondence
   *  (owner decision, 9 Aug 2026 — see not-in-the-bell.spec.ts). */
  async listFor(userId: string, limit = 50) {
    const rows = await this.notif.findMany({ where: { userId, kind: { not: 'message' } }, orderBy: { createdAt: 'desc' }, take: limit }).catch(swallowed('notifications.listFor', [] as NotificationRow[]));
    return rows.map((r) => this.shape(r));
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
      const dp = await this.prisma.datingProfile
        .findUnique({ where: { userId: senderId }, select: { extras: true } })
        .catch(() => null);
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
        ? `/dating/chats?c=${params.conversationId}&call=${params.callId}`
        : `/chats?c=${params.conversationId}&call=${params.callId}`;
      const deepLink = `togethercity://call/${params.callId}`;

      for (const recipientId of params.recipientIds) {
        // Muting a chat mutes its messages. It does not mute a ringing phone —
        // that is a different promise, and one nobody made.
        await this.create({
          userId: recipientId,
          kind: 'call_incoming',
          title: `Incoming ${kindWord}`,
          body: `${displayName} is calling you.`,
          href,
          actorId: params.callerId,
          entityId: params.callId,
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
    const href = dating ? `/dating/chats?c=${params.conversationId}` : `/chats?c=${params.conversationId}`;
    const deepLink = dating
      ? `togethercity://dating/chat/${params.conversationId}`
      : `togethercity://chat/${params.conversationId}`;

    for (const recipientId of params.recipientIds) {
      const online = await this.presence.isOnline(recipientId);
      const openConvos = await this.redis.openConversationsOf(recipientId);
      // Suppress if any of the recipient's live tabs is viewing this conversation.
      if (online && openConvos.includes(params.conversationId)) continue;

      const member = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: params.conversationId, userId: recipientId } },
      });
      if (member?.muted) continue;

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
        body: params.preview,
        imageUrl: displayPhoto,
        deepLink,
        data: { conversationId: params.conversationId },
      });

      // Browser / PWA push — reaches the recipient even with the app fully closed.
      await this.webpush.send(webTokens, {
        title: displayName,
        body: params.preview,
        conversationId: params.conversationId,
        icon: displayPhoto,
      });
    }
  }
}
