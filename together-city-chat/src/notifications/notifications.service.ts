import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { RedisService } from '../shared/redis/redis.service';
import { PresenceService } from '../users/presence.service';
import { FcmProvider } from './fcm.provider';
import { WebPushProvider } from './web-push.provider';

/**
 * Decides whether a push should be sent for a new message and dispatches it.
 * Rule: push only if the recipient is OFFLINE, or online but does NOT have this
 * conversation open. Never push to the sender.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly presence: PresenceService,
    private readonly redis: RedisService,
    private readonly fcm: FcmProvider,
    private readonly webpush: WebPushProvider,
  ) {}

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
