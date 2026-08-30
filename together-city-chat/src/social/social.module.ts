import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { SocialController } from './social.controller';
import { SocialGateway } from './social.gateway';
import { SocialService } from './social.service';
import { PostMediaGuard } from './post-media-guard';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AdminConsoleModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, NotificationsModule, MediaModule, ConnectionsModule, AdminConsoleModule],
  controllers: [SocialController],
  /* PostMediaGuard needs StorageProvider, which MediaModule already exports
     into this module — the same wiring MessagesModule uses for ChatMediaGuard. */
  providers: [SocialService, SocialGateway, PostMediaGuard],
})
export class SocialModule {}
