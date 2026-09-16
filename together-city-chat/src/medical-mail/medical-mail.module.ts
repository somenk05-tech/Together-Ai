import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { MediaModule } from '../media/media.module';
import { MedicalModule } from '../medical/medical.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { MedicalMailController, MedicalMailOpsController } from './medical-mail.controller';
import { MedicalMailService } from './medical-mail.service';

/**
 * Medical Mail. Imported by MailModule (the inbound webhook routes medical
 * addresses here) and by nothing else; MedicalModule is a dependency, not a
 * dependant, so the graph has no cycle.
 */
@Module({
  imports: [PrismaModule, MediaModule, MedicalModule, NotificationsModule],
  controllers: [MedicalMailController, MedicalMailOpsController],
  providers: [MedicalMailService],
  exports: [MedicalMailService],
})
export class MedicalMailModule {}
