import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { CONNECTIONS_WS, userRoom } from './connections.events';
import { wsCors } from '../shared/ws-cors';

/**
 * Broadcast-only gateway for the connection/permission system. It shares the
 * default Socket.IO server (authenticated by ChatGateway's handshake, which
 * joins each user into `user:<id>`) and fans permission changes to exactly the
 * two members involved, so both the People page and every affected hub page
 * invalidate their caches and re-read the single source of truth — no manual
 * refresh anywhere.
 */
@Injectable()
@WebSocketGateway({ cors: wsCors })
export class ConnectionsGateway {
  @WebSocketServer() private server?: Server;
  private readonly logger = new Logger(ConnectionsGateway.name);

  permissionsChanged(userIds: string[], payload: unknown): void {
    if (!this.server) {
      this.logger.warn('socket server not ready — dropped connections:changed');
      return;
    }
    for (const id of new Set(userIds)) {
      this.server.to(userRoom(id)).emit(CONNECTIONS_WS.CHANGED, payload);
    }
  }
}
