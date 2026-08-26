import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AnalyticsService } from './analytics.service';

/** Global, like RedisModule: a funnel step is recorded from many hubs and none
 *  of them should have to import a module to say "this happened". */
@Global()
@Module({ imports: [PrismaModule], providers: [AnalyticsService], exports: [AnalyticsService] })
export class AnalyticsModule {}
