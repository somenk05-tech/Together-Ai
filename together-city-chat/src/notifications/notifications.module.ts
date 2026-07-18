import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { FcmProvider } from './fcm.provider';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [UsersModule],
  providers: [NotificationsService, FcmProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
