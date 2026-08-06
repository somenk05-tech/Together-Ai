import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { LocalServicesController } from './local-services.controller';
import { LocalServicesService } from './local-services.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AiModule],
  controllers: [LocalServicesController],
  providers: [LocalServicesService],
})
export class LocalServicesModule {}
