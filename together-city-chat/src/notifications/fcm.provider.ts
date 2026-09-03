import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { swallowed } from '../shared/swallow';
import { PrismaService } from '../shared/prisma/prisma.service';
import { initializeApp, getApps, getApp, cert, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

export interface PushPayload {
  title: string;
  body: string;
  imageUrl?: string;
  deepLink: string; // togethercity://chat/<conversationId>
  data?: Record<string, string>;
}

/**
 * Firebase Cloud Messaging provider.
 *
 * Live when FCM_ENABLED=true and the service-account env vars are present
 * (FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY — the private key may
 * contain literal "\n" which configuration.ts already un-escapes). Otherwise it
 * no-ops with a debug log so the app runs without credentials.
 */
@Injectable()
export class FcmProvider {
  private readonly logger = new Logger(FcmProvider.name);
  private readonly enabled: boolean;
  private messaging: Messaging | null = null;

  constructor(config: ConfigService, private readonly prisma: PrismaService) {
    this.enabled = config.get<boolean>('fcm.enabled') ?? false;
    if (!this.enabled) return;

    const projectId = config.get<string>('fcm.projectId') ?? '';
    const clientEmail = config.get<string>('fcm.clientEmail') ?? '';
    const privateKey = config.get<string>('fcm.privateKey') ?? '';

    if (projectId && clientEmail && privateKey) {
      const app: App = getApps().length
        ? getApp()
        : initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      this.messaging = getMessaging(app);
      this.logger.log('FCM initialised.');
    } else {
      this.logger.warn('FCM enabled but service-account env vars missing — pushes will be skipped.');
    }
  }

  /** `ownerId` is the citizen these tokens were read under. It scopes the
   *  prune below: a dead token can only ever be dropped from the account it was
   *  found on, which is both correct and what query-scoping.spec asks of every
   *  write against a citizen-owned table. */
  async send(tokens: string[], payload: PushPayload, ownerId?: string): Promise<void> {
    if (!this.messaging || tokens.length === 0) {
      this.logger.debug(
        `[FCM ${this.messaging ? 'no-tokens' : 'disabled'}] would push "${payload.title}" to ${tokens.length} device(s)`,
      );
      return;
    }

    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body, imageUrl: payload.imageUrl },
      data: { deepLink: payload.deepLink, ...(payload.data ?? {}) },
    });

    if (res.failureCount > 0) {
      this.logger.warn(`[FCM] ${res.successCount} delivered, ${res.failureCount} failed of ${tokens.length}`);
      await this.pruneDead(tokens, res.responses, ownerId);
    } else {
      this.logger.log(`[FCM] push "${payload.title}" → ${res.successCount} device(s)`);
    }
  }

  /**
   * A DEAD TOKEN IS DELETED, NOT COUNTED (3 Sep).
   *
   * This read `failureCount` and logged a number. FCM registration tokens die
   * for good — the app is uninstalled, its data cleared, the token refreshed —
   * and the row stayed for the life of the account, so every push to that
   * citizen carried a payload to a device that no longer exists, for ever, and
   * the warning above became a permanent line in the log that meant nothing.
   *
   * `web-push.provider` has done this since it was written: 404/410 there is
   * `registration-token-not-registered` here, plus the malformed token, which
   * is the same permanence by a different route. Every other failure is
   * transient and the row is left alone.
   */
  private async pruneDead(tokens: string[], responses: { success: boolean; error?: { code?: string } }[], ownerId?: string): Promise<void> {
    const dead = tokens.filter((_, i) => {
      const code = responses[i]?.error?.code;
      return code === 'messaging/registration-token-not-registered'
        || code === 'messaging/invalid-registration-token';
    });
    if (!dead.length || !ownerId) return;
    await this.prisma.deviceToken
      .deleteMany({ where: { userId: ownerId, token: { in: dead } } })
      .catch(swallowed('notifications: dropping FCM tokens the device no longer holds', undefined));
    this.logger.log(`[FCM] dropped ${dead.length} dead token(s)`);
  }
}
