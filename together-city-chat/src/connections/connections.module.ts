import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { ConnectionPermissionService } from './connection-permission.service';

@Module({
  controllers: [ConnectionsController],
  providers: [ConnectionsService, ConnectionPermissionService],
  exports: [ConnectionPermissionService, ConnectionsService],
})
export class ConnectionsModule {}
