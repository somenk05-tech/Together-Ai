import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';

interface SettingRow { key: string; value: string }

export interface PrivacyStateView {
  tosAccepted: boolean;
  acks: Record<string, boolean>;
  prefs: Record<string, boolean>;
}

/**
 * Durable store for contextual consent + granular privacy permissions (audit 2.2).
 * One row per (user, key). The client privacy store is the fast, per-device source
 * of truth; this is the cross-device record. New table reaches the generated
 * client on deploy (db push at boot), so access it via the loose-cast delegate
 * and degrade gracefully until then.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);
  constructor(private readonly prisma: PrismaService) {}

  private get store() {
    return (this.prisma as unknown as {
      privacySetting: {
        findMany: (a: unknown) => Promise<SettingRow[]>;
        upsert: (a: unknown) => Promise<SettingRow>;
      };
    }).privacySetting;
  }

  async get(userId: string): Promise<PrivacyStateView> {
    const rows = await this.store.findMany({ where: { userId } }).catch(() => [] as SettingRow[]);
    const acks: Record<string, boolean> = {};
    const prefs: Record<string, boolean> = {};
    let tosAccepted = false;
    for (const r of rows) {
      const on = r.value === 'true';
      if (r.key === 'tos') tosAccepted = on;
      else if (r.key.startsWith('ack:')) acks[r.key.slice(4)] = on;
      else if (r.key.startsWith('pref:')) prefs[r.key.slice(5)] = on;
    }
    return { tosAccepted, acks, prefs };
  }

  async set(userId: string, key: string, value: string): Promise<PrivacyStateView> {
    await this.store
      .upsert({ where: { userId_key: { userId, key } }, update: { value }, create: { userId, key, value } })
      .catch((e: { message?: string }) => this.logger.warn(`privacy upsert failed: ${e?.message ?? e}`));
    return this.get(userId);
  }
}
