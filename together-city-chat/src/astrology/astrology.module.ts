import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { FinancialModule } from '../financial/financial.module';
import { AstrologyController } from './astrology.controller';
import { AstrologyService } from './astrology.service';
import { TarotService } from './tarot.service';

@Module({
  imports: [PrismaModule, ProfileModule, FinancialModule, NotificationsModule],
  controllers: [AstrologyController],
  providers: [AstrologyService, TarotService],
  /** Mira reads the citizen's own daily letter, stones and remedies. */
  exports: [AstrologyService, TarotService],
})
export class AstrologyModule {}
