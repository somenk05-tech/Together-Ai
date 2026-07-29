import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RetentionService } from './retention.service';

/**
 * Scheduled background work.
 *
 * This is where jobs live now that there is a runner. Anything added here must
 * be idempotent and must tolerate being skipped — a deploy restarts the process,
 * and a job whose window is missed should catch up on its next run rather than
 * leaving state half-finished.
 */
@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [RetentionService],
})
export class TasksModule {}
