import { Injectable, Logger } from '@nestjs/common';
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
        findMany: (a: unknown) => Promise<NotificationRow[]>;
        count: (a: unknown) => Promise<number>;
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
    } catch (e) {
      this.log.warn(`notification create failed (${input.kind}): ${(e as Error).message}`);
    }
  }

  /** Recent notifications for a user, newest first. */
  async listFor(userId: string, limit = 50) {
    const rows = await this.notif.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }).catch(() => [] as NotificationRow[]);
    return rows.map((r) => this.shape(r));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.notif.count({ where: { userId, read: false } }).catch(() => 0);
  }

  async markRead(userId: string, id: string): Promise<void> {
    await this.notif.updateMany({ where: { id, userId }, data: { read: true } }).catch(() => undefined);
    this.gateway.emitCount(userId, await this.unreadCount(userId));
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notif.updateMany({ where: { userId, read: false }, data: { read: true } }).catch(() => undefined);
    this.gateway.emitCount(userId, 0);
  }

  async notifyNewMessage(params: {
    conversationId: string;
    senderId: string;
    recipientIds: string[];
    preview: string;
  }): Promise<void> {
    const sender = await this.prisma.user.findUnique({
      where: { id: params.senderId },
      select: { name: true, profileImage: true },
    });
    if (!sender) return;

    for (const recipientId of params.recipientIds) {
      const online = await this.presence.isOnline(recipientId);
      const openConvo = await this.redis.getOpenConversation(recipientId);
      // Suppress if the recipient is actively viewing this conversation.
      if (online && openConvo === params.conversationId) continue;

      const member = await this.prisma.conversationMember.findUnique({
        where: { conversationId_userId: { conversationId: params.conversationId, userId: recipientId } },
      });
      if (member?.muted) continue;

      const devices = await this.prisma.deviceToken.findMany({
        where: { userId: recipientId },
        select: { token: true, platform: true },
      });
      const fcmTokens = devices.filter((d) => d.platform !== 'webpush').map((d) => d.token);
      const webTokens = devices.filter((d) => d.platform === 'webpush').map((d) => d.token);

      await this.fcm.send(fcmTokens, {
        title: sender.name,
        body: params.preview,
        imageUrl: sender.profileImage ?? undefined,
        deepLink: `togethercity://chat/${params.conversationId}`,
        data: { conversationId: params.conversationId },
      });

      // Browser / PWA push — reaches the recipient even with the app fully closed.
      await this.webpush.send(webTokens, {
        title: sender.name,
        body: params.preview,
        conversationId: params.conversationId,
        icon: sender.profileImage ?? undefined,
      });
    }
  }
}
