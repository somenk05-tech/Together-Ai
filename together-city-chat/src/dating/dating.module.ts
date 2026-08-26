import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ProfileModule } from '../profile/profile.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ConnectionsModule } from '../connections/connections.module';
import { DatingController } from './dating.controller';
import { DatingService } from './dating.service';
import { PhotoModerationService } from './photo-moderation.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { AdminConsoleModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, ProfileModule, ConversationsModule, ConnectionsModule, NotificationsModule, MediaModule, AdminConsoleModule],
  controllers: [DatingController],
  providers: [DatingService, PhotoModerationService],
})
export class DatingModule {}
