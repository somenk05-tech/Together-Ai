import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealEstateController } from './realestate.controller';
import { RealEstateService } from './realestate.service';
import { AdminConsoleModule } from '../admin/admin.module';
import { MediaModule } from '../media/media.module';
import { PostMediaGuard } from '../social/post-media-guard';

/* AdminConsoleModule for AdminAccessService: listing moderation is on the one
   permission-and-audit system now, not on User.role. MediaModule for
   StorageProvider, which PostMediaGuard takes — the same wiring SocialModule
   and MessagesModule use for their own guards. */
@Module({
  imports: [PrismaModule, ConversationsModule, MessagesModule, NotificationsModule, AdminConsoleModule, MediaModule],
  controllers: [RealEstateController],
  providers: [RealEstateService, PostMediaGuard],
})
export class RealEstateModule {}
