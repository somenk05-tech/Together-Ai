import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { AiModule } from '../ai/ai.module';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { ExternalJobsService } from './external/external-jobs.service';

@Module({
  // AiModule reads an uploaded CV into a profile. The heuristic parser is
  // still there and still runs — this is a better first draft, not a
  // dependency the hub cannot start without.
  imports: [PrismaModule, ProfileModule, AiModule],
  controllers: [JobsController],
  // ExternalJobsService's @Cron registers with the ScheduleModule that
  // tasks.module already installs globally — same pattern as retention.
  providers: [JobsService, ExternalJobsService],
})
export class JobsModule {}
