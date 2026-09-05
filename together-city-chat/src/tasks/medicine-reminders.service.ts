import { Injectable, Logger, Optional } from '@nestjs/common';
import { CronLease, leased } from '../shared/redis/cron-lease';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';

/**
 * The job that actually makes a medicine reminder a reminder.
 *
 * Three responsibilities, all idempotent, because a deploy restarts the process
 * mid-run and a missed window has to heal on the next pass rather than leave a
 * citizen un-reminded or double-reminded:
 *
 *  • every minute — send the alarms now due (5 minutes before each dose)
 *  • nightly — top reminders back up to the horizon
 *  • hourly — mark doses nobody acted on as missed
 *
 * Like RetentionService, this assumes a single instance, which is what the
 * deployment runs. Scaled out, every replica would run the same minute — the
 * dispatch claim (status pending → sent, guarded) makes that safe rather than
 * merely unlikely, but the wasted work would want a lock.
 */
@Injectable()
export class MedicineRemindersService {
  private readonly logger = new Logger('MedicineReminders');

  constructor(private readonly prescriptions: PrescriptionsService,
    @Optional() private readonly lease?: CronLease,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchDue(): Promise<void> {
    // One instance per firing (5 Sep) — see shared/redis/cron-lease.ts.
    await leased(this.lease, 'medicine.dispatch', 50_000, () => this.dispatchDueBody());
  }

  async dispatchDueBody(): Promise<void> {
    try {
      const due = await this.prescriptions.dueReminders();
      if (!due.length) return;
      let sent = 0;
      for (const r of due) {
        if (await this.prescriptions.dispatchReminder(r)) sent++;
      }
      if (sent) this.logger.log(`dispatched ${sent} medicine reminder(s)`);
    } catch (e) {
      this.logger.warn(`reminder dispatch failed: ${(e as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async extendHorizon(): Promise<void> {
    // One instance per firing (5 Sep) — see shared/redis/cron-lease.ts.
    await leased(this.lease, 'medicine.extend', 1_800_000, () => this.extendHorizonBody());
  }

  async extendHorizonBody(): Promise<void> {
    try {
      const created = await this.prescriptions.extendHorizon();
      if (created) this.logger.log(`expanded ${created} upcoming reminder(s)`);
    } catch (e) {
      this.logger.warn(`horizon extension failed: ${(e as Error).message}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async sweepMissed(): Promise<void> {
    // One instance per firing (5 Sep) — see shared/redis/cron-lease.ts.
    await leased(this.lease, 'medicine.sweep-missed', 3_000_000, () => this.sweepMissedBody());
  }

  async sweepMissedBody(): Promise<void> {
    try {
      const missed = await this.prescriptions.markMissed();
      if (missed) this.logger.log(`marked ${missed} dose(s) missed`);
    } catch (e) {
      this.logger.warn(`missed-dose sweep failed: ${(e as Error).message}`);
    }
  }
}
