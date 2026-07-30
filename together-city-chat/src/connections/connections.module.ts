import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { HubMembersController } from './hub-members.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionPermissionService } from './connection-permission.service';
import { BlockingService } from './blocking.service';
import { ConnectionsGateway } from './connections.gateway';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [ConnectionsController, HubMembersController],
  providers: [ConnectionsService, ConnectionPermissionService, BlockingService, ConnectionsGateway],
  exports: [ConnectionPermissionService, BlockingService, ConnectionsService],
})
export class ConnectionsModule {}
