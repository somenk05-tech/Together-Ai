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
/**
 * Are the VAPID keys set AND usable?
 *
 * The first version of this asked only whether the two variables were
 * non-empty, and the docblock claimed it asked "the same question this class
 * asks itself" — which was not true (re-audit, 29 Aug). The class's real gate
 * is `ready`, and that additionally requires `setVapidDetails` to accept the
 * pair: a malformed or swapped key logs a warning at boot, leaves `ready`
 * false, and every send returns early. Reporting `pushConfigured: true` for
 * that state is the precise "healthy while nothing arrives" answer the health
 * endpoint was extended to stop giving.
 *
 * Validated rather than counted, and cheaply: the same call the constructor
 * makes, in a try, against a library that parses the keys.
 */
export function pushConfigured(): boolean {
  const pub = (process.env.VAPID_PUBLIC_KEY ?? '').trim();
  const priv = (process.env.VAPID_PRIVATE_KEY ?? '').trim();
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:connect@togethercity.app', pub, priv);
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class WebPushProvider {
  private readonly logger = new Logger('WebPushProvider');
  readonly publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
  private readonly privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
  private readonly subject = process.env.VAPID_SUBJECT || 'mailto:connect@togethercity.app';
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
    payload: { title: string; body: string; conversationId: string; icon?: string; url?: string; tag?: string },
  ): Promise<void> {
    if (!this.ready || !tokens.length) return;
    const data = JSON.stringify({
      title: payload.title,
      body: payload.body,
      conversationId: payload.conversationId,
      icon: payload.icon,
      // Where a tap lands. ALWAYS sent now, chats included: the service worker
      // used to prefer the conversation id and send a dating message to the
      // city Chats route, which deliberately does not list dating threads.
      url: payload.url,
      /* WHAT THIS NOTIFICATION REPLACES ON THE DEVICE. Everything that is not
         a chat message was pushed with an empty conversationId, and the worker
         turned that into the single shared tag 'chat' — so a match alert and a
         like alert arriving together left one of them. Named here, where the
         caller knows what the notification is about. */
      tag: payload.tag,
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
