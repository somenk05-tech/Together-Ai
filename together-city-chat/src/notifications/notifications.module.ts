import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FcmProvider } from './fcm.provider';
import { WebPushProvider } from './web-push.provider';
import { NotificationsService } from './notifications.service';
import { PushController } from './push.controller';

@Module({
  imports: [UsersModule],
  controllers: [PushController],
  providers: [NotificationsService, FcmProvider, WebPushProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
