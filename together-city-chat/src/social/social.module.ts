import { Module } from '@nestjs/common';
import { PrismaModule } from '../shared/prisma/prisma.module';
import { SocialController } from './social.controller';
import { SocialGateway } from './social.gateway';
import { SocialService } from './social.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MediaModule } from '../media/media.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AdminConsoleModule } from '../admin/admin.module';

@Module({
  imports: [PrismaModule, NotificationsModule, MediaModule, ConnectionsModule, AdminConsoleModule],
  controllers: [SocialController],
  providers: [SocialService, SocialGateway],
})
export class SocialModule {}
