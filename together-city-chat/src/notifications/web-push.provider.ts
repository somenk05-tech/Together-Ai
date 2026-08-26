import { swallowed } from '../shared/swallow';
import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Browser / PWA push via the Web Push protocol (VAPID). Delivers a notification
 * to a recipient's device even when Together City is completely closed.
 *
 * Keys MUST come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) — a private key
 * must never be committed to source. If they're unset, web push is simply
 * disabled (the app degrades gracefully; no notifications are sent). Generate a
 * keypair with `npx web-push generate-vapid-keys`. Subscriptions are stored in
 * DeviceToken rows (platform='webpush', token = JSON.stringify(subscription)),
 * so no schema change is required.
 */
@Injectable()
export class WebPushProvider {
  private readonly logger = new Logger('WebPushProvider');
  readonly publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  private readonly subject = process.env.VAPID_SUBJECT || 'mailto:connect@togethercity.tech';
  private ready = false;

  constructor(private readonly prisma: PrismaService) {
    if (!this.publicKey || !this.privateKey) {
      this.logger.log('Web push disabled — set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to enable.');
      return;
    }
    try {
      webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
      this.ready = true;
    } catch (e) {
      this.logger.warn(`VAPID init failed: ${(e as Error).message}`);
    }
  }

  /** Push to a set of stored web-push subscriptions (each `token` is JSON). */
  async send(
    tokens: string[],
    payload: { title: string; body: string; conversationId: string; icon?: string; url?: string },
  ): Promise<void> {
    if (!this.ready || !tokens.length) return;
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      conversationId: payload.conversationId,
      icon: payload.icon,
      // Where a tap lands when it is not a chat (a dating match, a like).
      url: payload.url,
    });
    await Promise.all(
      tokens.map(async (token) => {
        let sub: webpush.PushSubscription;
        try {
          sub = JSON.parse(token);
        } catch {
          return;
        }
        try {
          await webpush.sendNotification(sub, data);
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          // 404/410 → the subscription expired; drop it so we stop trying.
          if (code === 404 || code === 410) {
            await this.prisma.deviceToken.deleteMany({ where: { token } }).catch(swallowed('notifications.send', undefined));
          } else {
            this.logger.warn(`web push failed (${code ?? '?'}): ${(e as Error).message}`);
          }
        }
      }),
    );
  }
}
