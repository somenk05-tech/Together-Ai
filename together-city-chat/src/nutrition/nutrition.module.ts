import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { NutritionController } from './nutrition.controller';
import { NutritionService } from './nutrition.service';
import { FoodJournalController } from './food-journal.controller';
import { FoodJournalService } from './food-journal.service';
import { FinancialModule } from '../financial/financial.module';
import { ConnectionsModule } from '../connections/connections.module';

@Module({
  imports: [PrismaModule, NotificationsModule, ProfileModule, ConversationsModule, FinancialModule, ConnectionsModule],
  controllers: [NutritionController, FoodJournalController],
  providers: [NutritionService, FoodJournalService],
  // Exported for Fitness, which asks for the protein target rather than
  // computing a second one. See FitnessService.clinicalProtein().
  exports: [NutritionService],
})
export class NutritionModule {}
