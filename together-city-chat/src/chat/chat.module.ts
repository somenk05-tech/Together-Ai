import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { MessagesModule } from '../messages/messages.module';
import { ConnectionsModule } from '../connections/connections.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallsModule } from '../calls/calls.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, UsersModule, MessagesModule, ConnectionsModule, NotificationsModule, CallsModule],
  providers: [ChatGateway],
})
export class ChatModule {}
