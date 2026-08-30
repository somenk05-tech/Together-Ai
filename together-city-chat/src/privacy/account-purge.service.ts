import { swallowed } from '../shared/swallow';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { deletions, purgeCutoff, storageBearing, whereFor, PURGE_AFTER_DAYS, type PurgeRule } from './purge-plan';

interface DueAccount { id: string; deletedAt: Date }

export interface PurgeReport {
  userId: string;
  rowsDeleted: number;
  objectsDeleted: number;
  /** Models that would not delete, with the last error. Empty on a clean run. */
  stuck: Array<{ model: string; error: string }>;
}

const camel = (model: string): string => model[0].toLowerCase() + model.slice(1);

/**
 * Destroying a deleted account's data, thirty days later.
 *
 * The plan — what goes, what stays, and why — lives next door in purge-plan.ts
 * and is the part worth reading. This file is the mechanism, and it has three
 * jobs the plan cannot do on its own.
 *
 * **Files before rows.** An object key only exists on the row that points at
 * it. Delete the row first and the file is unreachable forever: still in the
 * bucket, still a person's medical document, with nothing left in the database
 * that knows it is there. That is the deletion failing in the way nobody
 * notices, because the database looks clean afterwards.
 *
 * **Deleting in an order the database will accept.** Foreign keys mean some
 * tables cannot go before others, and the dependency order is not something
 * this file should try to hard-code — it would be one more list to keep in step
 * with the schema. Instead it sweeps repeatedly and keeps whatever succeeded,
 * stopping when a full pass makes no progress. Anything still standing is
 * reported by name rather than swallowed.
 *
 * **Never touching a row it was not told to.** Every delete is scoped by the
 * citizen's own id, taken from the rule, and a rule with no owner column cannot
 * be expressed by the type. The blast radius of a bug here is one account.
 */
@Injectable()
export class AccountPurgeService {
  private readonly logger = new Logger('AccountPurge');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  private table(model: string): {
    findMany(a: unknown): Promise<Array<Record<string, unknown>>>;
    deleteMany(a: unknown): Promise<{ count: number }>;
  } | null {
    const delegate = (this.prisma as unknown as Record<string, unknown>)[camel(model)];
    return (delegate as ReturnType<AccountPurgeService['table']>) ?? null;
  }

  /**
   * Accounts deleted longer ago than the window and not yet purged.
   *
   * Deliberately capped. A first run after this ships could face every account
   * ever deleted, and a job that tries to empty hundreds of accounts in one
   * pass will be killed halfway through by something — a deploy, a timeout —
   * leaving no record of how far it got. Twenty a night finishes, logs, and
   * comes back tomorrow.
   */
  async due(now = new Date(), take = 20): Promise<DueAccount[]> {
    const rows = await (this.prisma as unknown as {
      user: { findMany(a: unknown): Promise<DueAccount[]> };
    }).user.findMany({
      where: { deletedAt: { lt: purgeCutoff(now), not: null }, purgedAt: null },
      select: { id: true, deletedAt: true },
      orderBy: { deletedAt: 'asc' },
      take,
    });
    return rows;
  }

  /** Remove the stored objects belonging to this citizen, before their rows go. */
  private async purgeObjects(userId: string): Promise<number> {
    let removed = 0;
    for (const rule of storageBearing()) {
      const table = this.table(rule.model);
      if (!table) continue;
      /**
       * FOUR SHAPES, BECAUSE A FILE IN THIS APP IS KEPT FOUR WAYS (30 Aug).
       *
       * This loop read exactly one column and assumed the private vault. That
       * covered health, dating and diary photographs — the ones anybody went
       * looking for — and silently covered nothing else. Half the city keeps
       * its pictures in the PUBLIC bucket as a full URL: a shopfront logo, a
       * scanned menu, a CV, a verification document. Those rules were `purge`
       * with no storage clause, which read as complete, and left every one of
       * those files addressable after the account was destroyed.
       *
       *   storageKey / storageKeys  — private-vault keys, in their own columns
       *   storageKeysJson           — private keys inside a JSON blob
       *   storageUrls               — public-bucket URLs, in their own columns
       *   storageUrlsJson           — public URLs inside a JSON array
       */
      const keyCols = [...(rule.storageKey ? [rule.storageKey] : []), ...(rule.storageKeys ?? [])];
      const urlCols = rule.storageUrls ?? [];
      const jsonCols = [
        ...(rule.storageKeysJson ? [rule.storageKeysJson.column] : []),
        ...(rule.storageUrlsJson ? [rule.storageUrlsJson.column] : []),
      ];
      const select: Record<string, boolean> = {};
      for (const c of [...keyCols, ...urlCols, ...jsonCols]) select[c] = true;

      try {
        // unbounded: DELETION must be complete — every stored object of the account dies here
        const rows = await table.findMany({ where: whereFor(rule, userId), select });
        for (const row of rows) {
          // Private-vault keys, in columns of their own.
          for (const col of keyCols) {
            const value = row[col];
            if (typeof value !== 'string' || !value) continue;
            await this.storage.deleteHealthObject(value).catch(swallowed('privacy.purgeObjects', undefined));
            removed++;
          }

          /* Public-bucket URLs. `keyFromUrl` returns '' for anything not under
             our own public base, which is exactly the guard these columns need:
             they are validated as `z.string().url()` and nothing server-side
             ties them to our bucket, so a citizen who pasted a link to
             somewhere else must not have us try to delete it. */
          for (const col of urlCols) {
            const value = row[col];
            if (typeof value !== 'string' || !value) continue;
            const key = this.storage.keyFromUrl(value);
            if (!key) continue;
            await this.storage.deleteObject(key).catch(swallowed('privacy.purgeObjects', undefined));
            removed++;
          }

          // Keys inside a JSON blob (dating photos) rather than a column of
          // their own. A malformed blob must not stop the rest of the purge:
          // failing here would leave a half-deleted account, which is worse
          // than one stubborn object we log and move past.
          if (rule.storageKeysJson) {
            const value = row[rule.storageKeysJson.column];
            // FIELDS, PLURAL — the selfie key lives beside the photo array in
            // the same blob and the singular version of this loop left it in
            // the bucket forever. A field may hold one key or an array of
            // them; both shapes are read.
            let parsed: Record<string, unknown> = {};
            if (typeof value === 'string' && value) {
              try { parsed = JSON.parse(value) as Record<string, unknown>; } catch { parsed = {}; }
            }
            for (const field of rule.storageKeysJson.fields) {
              const raw = parsed[field];
              const keys: unknown[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
              for (const k of keys) {
                // Only OUR keys. A legacy base64 blob or an account-photo URL is
                // not an object in the vault and must not be handed to a delete.
                if (typeof k !== 'string' || !k || k.startsWith('data:') || k.startsWith('http')) continue;
                await this.storage.deleteHealthObject(k).catch(swallowed('privacy.purgeObjects', undefined));
                removed++;
              }
            }
          }

          // Public URLs inside a JSON array — `[{url, caption}]`, the shape
          // every listing gallery in the city uses.
          if (rule.storageUrlsJson) {
            const value = row[rule.storageUrlsJson.column];
            let parsed: unknown = [];
            if (typeof value === 'string' && value) {
              try { parsed = JSON.parse(value); } catch { parsed = []; }
            }
            const field = rule.storageUrlsJson.field;
            for (const entry of Array.isArray(parsed) ? parsed : []) {
              const raw = typeof entry === 'string' ? entry : (entry as Record<string, unknown> | null)?.[field];
              if (typeof raw !== 'string' || !raw) continue;
              const key = this.storage.keyFromUrl(raw);
              if (!key) continue;
              await this.storage.deleteObject(key).catch(swallowed('privacy.purgeObjects', undefined));
              removed++;
            }
          }
        }
      } catch (e) {
        this.logger.warn(`could not read ${rule.model} keys for ${userId}: ${(e as Error).message}`);
      }
    }
    return removed;
  }

  /**
   * Destroy one account's data.
   *
   * Returns a report rather than throwing, because one account that will not
   * empty must not stop the other nineteen — and because the count of what went
   * is the only evidence this ran at all.
   */
  async purgeAccount(userId: string): Promise<PurgeReport> {
    const objectsDeleted = await this.purgeObjects(userId);

    let remaining: PurgeRule[] = deletions();
    let rowsDeleted = 0;
    const errors = new Map<string, string>();

    // Sweep until a whole pass changes nothing. Bounded by the rule count, so a
    // pathological cycle ends rather than spinning.
    for (let pass = 0; pass < remaining.length + 1 && remaining.length; pass++) {
      const failed: PurgeRule[] = [];
      let progressed = false;

      for (const rule of remaining) {
        const table = this.table(rule.model);
        if (!table) {
          // The generated client predates this model. Not an error worth
          // failing the run over, but it MUST be visible: the data is still there.
          errors.set(rule.model, 'no Prisma delegate — client may be stale');
          continue;
        }
        try {
          const { count } = await table.deleteMany({ where: whereFor(rule, userId) });
          rowsDeleted += count;
          progressed = true;
          errors.delete(rule.model);
        } catch (e) {
          errors.set(rule.model, (e as Error).message);
          failed.push(rule);
        }
      }

      remaining = failed;
      if (!progressed) break;
    }

    const stuck = [...errors.entries()].map(([model, error]) => ({ model, error }));
    if (!stuck.length) {
      await (this.prisma as unknown as {
        user: { updateMany(a: unknown): Promise<{ count: number }> };
      }).user.updateMany({ where: { id: userId }, data: { purgedAt: new Date() } });
    } else {
      // Not stamped on purpose. An account whose data did not fully go is not
      // purged, and saying it was would be the one lie this job must never tell.
      this.logger.error(
        `purge incomplete for ${userId}; ${stuck.length} model(s) still hold data: ` +
          stuck.map((s) => `${s.model} (${s.error})`).join('; '),
      );
    }

    return { userId, rowsDeleted, objectsDeleted, stuck };
  }

  /** The nightly pass. Returns one report per account it worked on. */
  async sweep(now = new Date()): Promise<PurgeReport[]> {
    const accounts = await this.due(now);
    const reports: PurgeReport[] = [];
    for (const account of accounts) {
      const report = await this.purgeAccount(account.id);
      const age = Math.floor((now.getTime() - account.deletedAt.getTime()) / 86_400_000);
      this.logger.log(
        `purged ${account.id} (deleted ${age}d ago, window ${PURGE_AFTER_DAYS}d): ` +
          `${report.rowsDeleted} rows, ${report.objectsDeleted} files` +
          (report.stuck.length ? `, ${report.stuck.length} INCOMPLETE` : ''),
      );
      reports.push(report);
    }
    return reports;
  }
}
