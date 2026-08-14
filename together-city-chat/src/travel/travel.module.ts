import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialModule } from '../financial/financial.module';
import { MailModule } from '../mail/mail.module';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';

@Module({
  imports: [PrismaModule, FinancialModule, MailModule],
  controllers: [TravelController],
  providers: [TravelService],
  /** Mira reads the citizen's trips. */
  exports: [TravelService],
})
export class TravelModule {}
