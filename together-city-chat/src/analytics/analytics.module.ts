import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AnalyticsService } from './analytics.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';
import { InsightsModule } from '../insights/insights.module';

/** Global, like RedisModule: a funnel step is recorded from many hubs and none
 *  of them should have to import a module to say "this happened". The visit
 *  counter (owner, 16 Sep) lives beside it: it is the same kind of instrument. */
@Global()
@Module({
  // The investor dashboard (owner, 16 Sep) is built on these instruments and is
  // mounted with them, so the app module does not have to learn a new name.
  imports: [PrismaModule, InsightsModule],
  controllers: [VisitsController],
  providers: [AnalyticsService, VisitsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
