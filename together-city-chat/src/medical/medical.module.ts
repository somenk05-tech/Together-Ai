import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MedicalController } from './medical.controller';
import { MedicalService } from './medical.service';
import { FinancialModule } from '../financial/financial.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [PrismaModule, ConversationsModule, FinancialModule, MediaModule],
  controllers: [MedicalController],
  providers: [MedicalService],
  exports: [MedicalService],
})
export class MedicalModule {}
