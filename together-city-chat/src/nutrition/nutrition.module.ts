import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';
import { FinancialModule } from '../financial/financial.module';

@Module({
  imports: [PrismaModule, ConversationsModule, FinancialModule],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}
