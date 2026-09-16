import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AnalyticsService } from './analytics.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

/** Global, like RedisModule: a funnel step is recorded from many hubs and none
 *  of them should have to import a module to say "this happened". The visit
 *  counter (owner, 16 Sep) lives beside it: it is the same kind of instrument. */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [VisitsController],
  providers: [AnalyticsService, VisitsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
