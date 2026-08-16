import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { LocalServicesController } from './local-services.controller';
import { LocalServicesService } from './local-services.service';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AiModule],
  controllers: [VerificationController, LocalServicesController],
  providers: [LocalServicesService, VerificationService],
  // The console decides on submissions, and the decision lives where the
  // permission check and the audit row are.
  exports: [VerificationService],
})
export class LocalServicesModule {}
