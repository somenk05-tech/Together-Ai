import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DatingController } from './dating.controller';
import { DatingService } from './dating.service';
import { FinancialModule } from '../financial/financial.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, ProfileModule, ConversationsModule, FinancialModule, NotificationsModule],
  controllers: [DatingController],
  providers: [DatingService],
})
export class DatingModule {}
