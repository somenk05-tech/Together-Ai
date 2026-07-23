import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';
import { FinancialModule } from '../financial/financial.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [PrismaModule, ProfileModule, ConversationsModule, FinancialModule, ConnectionsModule],
  controllers: [NutritionController],
  providers: [NutritionService],
})
export class NutritionModule {}
