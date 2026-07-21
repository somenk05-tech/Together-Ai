import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { FinancialModule } from '../financial/financial.module';
import { MailModule } from '../mail/mail.module';
import { EntertainmentController } from './entertainment.controller';
import { EntertainmentService } from './entertainment.service';
import { TmdbService } from './tmdb.service';
import { WatchmodeService } from './watchmode.service';

@Module({
  imports: [PrismaModule, FinancialModule, MailModule],
  controllers: [EntertainmentController],
  providers: [EntertainmentService, TmdbService, WatchmodeService],
})
export class EntertainmentModule {}
