import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../shared/prisma/prisma.service';

/**
 * Browser / PWA push via the Web Push protocol (VAPID). Delivers a notification
 * to a recipient's device even when Together City is completely closed.
 *
 * Keys come from env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); a baked-in default
 * keypair keeps it working out of the box. Subscriptions are stored in
 * DeviceToken rows (platform='webpush', token = JSON.stringify(subscription)),
 * so no schema change is required.
 */
const DEFAULT_PUBLIC = 'BIoQIxiLAQfsc21jkQ0lcCEA0l3o_6QxtffRxhPqx7xZL91YzF7HEVyZQvSeen7s8A-eUsrM1ylzQx9Z6BPFFIg';
const DEFAULT_PRIVATE = 'lZx_OARVcX49EAh1QAX0QXErF4raokFu-wDgBjcjglI';

@Injectable()
export class WebPushProvider {
  private readonly logger = new Logger('WebPushProvider');
  readonly publicKey = process.env.VAPID_PUBLIC_KEY || DEFAULT_PUBLIC;
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY || DEFAULT_PRIVATE;
  private readonly subject = process.env.VAPID_SUBJECT || 'mailto:connect@togethercity.tech';
  private ready = false;

  constructor(private readonly prisma: PrismaService) {
    try {
      if (this.publicKey && this.privateKey) {
        webpush.setVapidDetails(this.subject, this.publicKey, this.privateKey);
        this.ready = true;
      }
    } catch (e) {
      this.logger.warn(`VAPID init failed: ${(e as Error).message}`);
    }
  }

  /** Push to a set of stored web-push subscriptions (each `token` is JSON). */
  async send(
    tokens: string[],
    payload: { title: string; body: string; conversationId: string; icon?: string },
  ): Promise<void> {
    if (!this.ready || !tokens.length) return;
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      conversationId: payload.conversationId,
      icon: payload.icon,
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
            await this.prisma.deviceToken.deleteMany({ where: { token } }).catch(() => undefined);
          } else {
            this.logger.warn(`web push failed (${code ?? '?'}): ${(e as Error).message}`);
          }
        }
      }),
    );
  }
}
