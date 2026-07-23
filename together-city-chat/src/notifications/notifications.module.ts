import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FcmProvider } from './fcm.provider';
import { WebPushProvider } from './web-push.provider';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PushController } from './push.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [UsersModule],
  controllers: [PushController, NotificationsController],
  providers: [NotificationsService, NotificationsGateway, FcmProvider, WebPushProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
