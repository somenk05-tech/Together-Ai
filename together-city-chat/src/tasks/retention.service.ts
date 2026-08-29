import { swallowed } from '../shared/swallow';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma/prisma.service';
import { AccountPurgeService } from '../privacy/account-purge.service';

/** How long a spent or expired credential is kept before it is swept. */
const GRACE_DAYS = 7;
/** How long a READ notification is kept. See the sweep for why it is its own
 *  number and why unread ones are never swept. */
const NOTIFICATION_DAYS = 90;

/**
 * The first scheduled job in this codebase.
 *
 * Until now there was no runner at all — no @nestjs/schedule, no queue, no
 * interval outside per-request fetch timeouts. Nothing swept anything, so four
 * credential tables grew forever: every refresh token ever revoked, every
 * verification link ever clicked, every recovery code ever used or expired.
 * They are dead rows that still contain a hash tied to an account, which makes
 * them a liability in any database dump long after they stopped being useful.
 *
 * A grace window is kept rather than deleting the instant something expires, so
 * that "your link has expired" can still be distinguished from "no such link"
 * for a week — the difference between a helpful message and a confusing one.
 *
 * This assumes a single instance, which is what the deployment runs. If it is
 * ever scaled out, this needs a lock or a leader election, because every replica
 * would otherwise run the same sweep at the same minute. Deletes are idempotent
 * so the failure mode is wasted work rather than damage.
 */
@Injectable()
export class RetentionService {
  private readonly logger = new Logger('RetentionService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly purge: AccountPurgeService,
  ) {}

  /**
   * Destroy the data of accounts deleted more than thirty days ago.
   *
   * Runs an hour after the credential sweep rather than beside it, so the two
   * jobs never contend and so a night's log reads in the order things happened.
   * Everything it deletes is decided in src/privacy/purge-plan.ts.
   *
   * Errors are caught here for the same reason they are caught below: a purge
   * that throws must not take down the process that is also sending medicine
   * reminders. Anything that failed is already logged by name.
   */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDeletedAccounts(): Promise<void> {
    try {
      const reports = await this.purge.sweep();
      if (!reports.length) return;
      const rows = reports.reduce((n, r) => n + r.rowsDeleted, 0);
      const files = reports.reduce((n, r) => n + r.objectsDeleted, 0);
      const incomplete = reports.filter((r) => r.stuck.length).length;
      this.logger.log(
        `account purge: ${reports.length} account(s), ${rows} rows, ${files} files` +
          (incomplete ? `, ${incomplete} INCOMPLETE — see errors above` : ''),
      );
    } catch (e) {
      this.logger.error(`account purge failed: ${(e as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async sweepExpiredCredentials(): Promise<void> {
    const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
    const db = this.prisma as unknown as Record<
      string,
      { deleteMany(a: unknown): Promise<{ count: number }> } | undefined
    >;

    const jobs: Array<[string, Promise<{ count: number } | null>]> = [
      ['refreshToken', this.sweep(db.refreshToken, {
        OR: [{ expiresAt: { lt: cutoff } }, { revoked: true, createdAt: { lt: cutoff } }],
      })],
      ['verificationToken', this.sweep(db.verificationToken, {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      })],
      ['recoveryCode', this.sweep(db.recoveryCode, {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      })],
      ['passwordReset', this.sweep(db.passwordReset, {
        OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }],
      })],
      /**
       * AND THE BELL, WHICH GREW FOR EVER (fifth audit, 29 Aug).
       *
       * `Notification` had no retention anywhere: `purge-plan.ts` covers
       * account DELETION and this sweep covered four credential tables, so a
       * live account's rows accumulated indefinitely — one per like, per
       * match, per moderation verdict, for the life of the city.
       *
       * ITS OWN, MUCH LONGER CUTOFF. A stale refresh token is worthless after
       * a week; a notification is somebody's record of what happened to them,
       * and the bell only ever shows the newest anyway. Ninety days is well
       * past anything anybody scrolls back to and well short of for ever.
       * READ ONES ONLY — an unread notification is a thing the citizen has
       * not seen yet, and age is not a reason to decide for them that they
       * never will.
       */
      ['notification', this.sweep(db.notification, {
        read: true,
        createdAt: { lt: new Date(Date.now() - NOTIFICATION_DAYS * 24 * 60 * 60 * 1000) },
      })],
      /**
       * THE OUTBOUND AUDIT TRAIL, WHICH KEPT WHOLE BODIES FOR EVER.
       *
       * `EmailDelivery.body` holds the full text of every receipt and every
       * citizen-composed message that left the city — `deliverTo` redacts the
       * verification codes, `deliverSystem` does not redact anything — and
       * nothing has ever swept the table. It is a second copy of somebody's
       * correspondence, outliving the mailbox copy the citizen can delete.
       *
       * The ROW is what an audit trail needs: who, when, which provider, what
       * status. The body is what makes it a copy. The same 90 days as the bell,
       * and the row survives — see the `redact` companion below, which is why
       * this is not a delete.
       */
      ['emailDelivery.body', this.redactOldDeliveryBodies()],
    ];

    const swept: string[] = [];
    for (const [name, job] of jobs) {
      const res = await job;
      if (res === null) { this.logger.warn(`Retention sweep failed for ${name}.`); continue; }
      if (res.count) swept.push(`${name}: ${res.count}`);
    }
    if (swept.length) this.logger.log(`Swept expired credentials — ${swept.join(', ')}.`);
  }

  /**
   * Blank the stored body of an old delivery record, keeping the record.
   *
   * Deleting the row would take the audit trail with it — "did we send this
   * person their code, and did the provider take it" is a question asked
   * months later. Deleting the BODY takes only the copy.
   */
  private redactOldDeliveryBodies(): Promise<{ count: number } | null> {
    const cutoff = new Date(Date.now() - NOTIFICATION_DAYS * 24 * 60 * 60 * 1000);
    const db = this.prisma as unknown as {
      emailDelivery?: { updateMany(a: unknown): Promise<{ count: number }> };
    };
    if (!db.emailDelivery) return Promise.resolve({ count: 0 });
    return db.emailDelivery
      .updateMany({
        where: { createdAt: { lt: cutoff }, NOT: { body: '' } },
        data: { body: '' },
      })
      .catch(swallowed('tasks.redactOldDeliveryBodies', null));
  }

  private sweep(
    model: { deleteMany(a: unknown): Promise<{ count: number }> } | undefined,
    where: unknown,
  ): Promise<{ count: number } | null> {
    if (!model) return Promise.resolve({ count: 0 });
    return model.deleteMany({ where }).catch(swallowed('tasks.sweep', null));
  }
}
