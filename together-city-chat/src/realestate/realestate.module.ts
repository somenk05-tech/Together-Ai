import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealEstateController } from './realestate.controller';
import { RealEstateService } from './realestate.service';

@Module({
  imports: [PrismaModule, ConversationsModule, MessagesModule, NotificationsModule],
  controllers: [RealEstateController],
  providers: [RealEstateService],
})
export class RealEstateModule {}
