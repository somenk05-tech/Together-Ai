import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { HubMembersController } from './hub-members.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionPermissionService } from './connection-permission.service';
import { ConnectionsGateway } from './connections.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ConnectionsController, HubMembersController],
  providers: [ConnectionsService, ConnectionPermissionService, ConnectionsGateway],
  exports: [ConnectionPermissionService, ConnectionsService],
})
export class ConnectionsModule {}
