import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(config: ConfigService) {
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

  async send(tokens: string[], payload: PushPayload): Promise<void> {
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
    } else {
      this.logger.log(`[FCM] push "${payload.title}" → ${res.successCount} device(s)`);
    }
  }
}
