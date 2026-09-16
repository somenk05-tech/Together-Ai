import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { AdminConsoleModule } from '../admin/admin.module';
import { InsightsController } from './insights.controller';
import { InsightsService } from './insights.service';
import { InsightsInterceptor } from './insights.interceptor';
import { MemberDayService } from './member-day.service';
import { MemberOriginService } from './member-origin.service';
import { PulseService } from './pulse.service';
import { ServerRunService } from './server-run.service';

/** The control room behind the city (owner, 16 Sep) — see insights.service.ts. */
@Module({
  imports: [PrismaModule, AdminConsoleModule],
  controllers: [InsightsController],
  providers: [
    InsightsService, MemberDayService, MemberOriginService, PulseService, ServerRunService,
    { provide: APP_INTERCEPTOR, useClass: InsightsInterceptor },
  ],
})
export class InsightsModule {}
