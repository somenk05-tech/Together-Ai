import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatingController } from './dating.controller';
import { DatingService } from './dating.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports: [PrismaModule, ConversationsModule, FinancialModule],
  controllers: [DatingController],
  providers: [DatingService],
})
export class DatingModule {}
