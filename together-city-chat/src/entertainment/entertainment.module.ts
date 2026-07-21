import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialModule } from '../financial/financial.module';
import { MailModule } from '../mail/mail.module';
import { EntertainmentController } from './entertainment.controller';
import { EntertainmentService } from './entertainment.service';
import { TmdbService } from './tmdb.service';

@Module({
  imports: [PrismaModule, FinancialModule, MailModule],
  controllers: [EntertainmentController],
  providers: [EntertainmentService, TmdbService],
})
export class EntertainmentModule {}
