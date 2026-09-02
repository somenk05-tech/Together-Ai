import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RetentionService } from './retention.service';
import { MedicineRemindersService } from './medicine-reminders.service';
import { PrescriptionsModule } from '../prescriptions/prescriptions.module';
import { CallsModule } from '../calls/calls.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { StaleCallsService } from './stale-calls.service';
import { ExpiredSnapsService } from './expired-snaps.service';
import { MediaModule } from '../media/media.module';

/**
 * Scheduled background work.
 *
 * This is where jobs live now that there is a runner. Anything added here must
 * be idempotent and must tolerate being skipped — a deploy restarts the process,
 * and a job whose window is missed should catch up on its next run rather than
 * leaving state half-finished.
 */
@Module({
  imports: [ScheduleModule.forRoot(), PrescriptionsModule, CallsModule, PrivacyModule, MediaModule],
  providers: [RetentionService, MedicineRemindersService, StaleCallsService, ExpiredSnapsService],
})
export class TasksModule {}
