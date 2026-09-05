import { Injectable, Logger, Optional } from '@nestjs/common';
import { CronLease, leased } from '../shared/redis/cron-lease';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';

/**
 * ── THE JOB THAT MAKES "TEMPORARY" TRUE ─────────────────────────────────────
 *
 * A snap stops being SERVED the moment its clock runs out — `openSnap` checks
 * the expiry on every request and refuses. This is the other half: the bytes
 * stop EXISTING. Without it "24 Hours" would mean "we stop showing it after 24
 * hours", which is a promise about our UI rather than about the photograph,
 * and the vault would fill with pictures nobody can reach and nobody deleted.
 *
 * `openSnap` already retires a snap the moment its last recipient spends their
 * last view, because the common case should not wait ten minutes. What is left
 * for this job is everything else: the View Once nobody opened, the 24-hour
 * snap that ran out overnight, the group where one member never looked, and
 * any row whose immediate delete failed because the bucket was having a bad
 * minute. That last one is why the query asks `snapGoneAt: null` rather than
 * trusting the write that should have set it.
 *
 * IDEMPOTENT, and it has to be: `snapGoneAt` is set only after the object is
 * confirmed gone, so a row that fails today is simply picked up on the next
 * pass, forever, until it succeeds. A deleted object we try to delete again
 * reports success and the row is closed — that is the right answer, not an
 * error.
 *
 * A KEPT SNAP IS NEVER SWEPT. `snapKeptAt` is what taking the sender up on
 * "keep in chat" writes, and the same write clears the deadline — but the
 * filter names it as well, because a clause that depends on a NULL somebody
 * else wrote is a clause that quietly stops holding the day somebody forgets.
 */
@Injectable()
export class ExpiredSnapsService {
  private readonly logger = new Logger('ExpiredSnaps');

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    @Optional() private readonly lease?: CronLease,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<void> {
    // One instance per firing (5 Sep) — see shared/redis/cron-lease.ts.
    await leased(this.lease, 'expired-snaps.sweep', 540_000, () => this.sweepBody());
  }

  async sweepBody(): Promise<void> {
    try {
      const swept = await this.sweepExpired();
      if (swept) this.logger.log(`removed ${swept} expired snap(s) from the vault`);
    } catch (e) {
      this.logger.warn(`snap sweep failed: ${(e as Error).message}`);
    }
  }

  /**
   * One bounded pass. The cap is a batch size rather than a limit on the work:
   * a backlog is drained ten minutes at a time instead of in one pass that
   * holds a connection open against a bucket. Returns how many objects are
   * actually gone — not how many rows were looked at, which is the number the
   * log line would be lying with.
   */
  async sweepExpired(now = new Date(), take = 200): Promise<number> {
    const due = await this.prisma.attachment.findMany({
      where: {
        snapMode: { not: null },
        snapGoneAt: null,
        snapKeptAt: null,
        snapExpiresAt: { not: null, lte: now },
      },
      select: { id: true, url: true },
      take,
    });
    let gone = 0;
    for (const a of due) {
      /* `deleteObject` REPORTS rather than throws, and this is one of the
         callers that reasoning was written for: a failure must leave the row
         open so the next pass tries again. Closing it on a failed delete would
         mean the only record of what was left in the vault is a log line. */
      if (!(await this.storage.deletePrivateObject(a.url))) {
        this.logger.warn(`snap ${a.id}: expired and its object could not be deleted — left open for the next pass`);
        continue;
      }
      await this.prisma.attachment.update({ where: { id: a.id }, data: { snapGoneAt: now } });
      gone++;
    }
    return gone;
  }
}
