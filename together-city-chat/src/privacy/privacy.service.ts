import { swallowed } from '../shared/swallow';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { exportPlan, manifest, scrubRow, type ExportManifest } from './data-export';

interface SettingRow { key: string; value: string }

/** Prisma delegates are camelCase of the model name. */
const camelCase = (m: string) => m.charAt(0).toLowerCase() + m.slice(1);

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

  /**
   * Everything this citizen can take with them (BE-16.1).
   *
   * Walks the export plan — which is the purge plan, filtered — and reads each
   * model through the same loose delegate lookup the purge job uses, so a
   * stale generated client is reported rather than silently skipped.
   *
   * A MODEL THAT CANNOT BE READ IS NAMED IN THE FILE. The failure mode this
   * avoids is the quiet one: an export that omits a table because the delegate
   * was missing looks identical to an export of somebody who had no rows in it,
   * and the citizen has no way to tell. A section that failed says so.
   *
   * Capped per model. An export is a file somebody downloads, not a backup, and
   * a citizen with 40,000 rows in one table is better served by a truncated
   * section that says it was truncated than by a request that times out.
   */
  async exportForCitizen(userId: string): Promise<{ manifest: ExportManifest; data: Record<string, unknown[]> }> {
    const PER_MODEL_CAP = 5000;
    const generatedAt = new Date().toISOString();
    const data: Record<string, unknown[]> = {};
    const sections: Array<{ model: string; rows: number; reason: string }> = [];

    for (const section of exportPlan()) {
      const delegate = (this.prisma as unknown as Record<string, unknown>)[camelCase(section.model)] as
        { findMany?: (a: unknown) => Promise<Array<Record<string, unknown>>> } | undefined;

      if (!delegate?.findMany) {
        data[section.model] = [];
        sections.push({ model: section.model, rows: 0, reason: `${section.reason} — COULD NOT BE READ, so this section may be incomplete.` });
        this.logger.error(`data export: no delegate for ${section.model} — the client may be stale`);
        continue;
      }

      try {
        const rows = await delegate.findMany({
          where: { [section.by]: userId, ...(section.filter ?? {}) },
          take: PER_MODEL_CAP + 1,
        });
        const truncated = rows.length > PER_MODEL_CAP;
        const kept = (truncated ? rows.slice(0, PER_MODEL_CAP) : rows).map(scrubRow);
        data[section.model] = kept;
        sections.push({
          model: section.model, rows: kept.length,
          reason: truncated ? `${section.reason} — truncated at ${PER_MODEL_CAP} rows.` : section.reason,
        });
      } catch (e) {
        data[section.model] = [];
        sections.push({ model: section.model, rows: 0, reason: `${section.reason} — COULD NOT BE READ, so this section may be incomplete.` });
        this.logger.error(`data export failed for ${section.model}: ${(e as Error).message}`);
      }
    }

    return { manifest: manifest(sections, generatedAt), data };
  }

  private get store() {
    return (this.prisma as unknown as {
      privacySetting: {
        findMany: (a: unknown) => Promise<SettingRow[]>;
        upsert: (a: unknown) => Promise<SettingRow>;
      };
    }).privacySetting;
  }

  async get(userId: string): Promise<PrivacyStateView> {
    // unbounded: one row per setting key — the schema bounds it
    const rows = await this.store.findMany({ where: { userId } }).catch(swallowed('privacy.get', [] as SettingRow[]));
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
