import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { NOTIF_WS, userRoom } from './notifications.events';
import { wsCors } from '../shared/ws-cors';

/**
 * Broadcast-only gateway for in-app notifications. Shares the default Socket.IO
 * server (authenticated by ChatGateway's handshake, which joins each user into
 * `user:<id>`) and fans a new notification + updated unread count to exactly the
 * recipient, so the header bell and the Notifications page update live.
 */
@Injectable()
@WebSocketGateway({ cors: wsCors })
export class NotificationsGateway {
  @WebSocketServer() private server?: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  emitNew(userId: string, notification: unknown, unreadCount: number): void {
    if (!this.server) {
      this.logger.warn('socket server not ready — dropped notification:new');
      return;
    }
    this.server.to(userRoom(userId)).emit(NOTIF_WS.NEW, notification);
    this.server.to(userRoom(userId)).emit(NOTIF_WS.COUNT, { count: unreadCount });
  }

  emitCount(userId: string, unreadCount: number): void {
    if (!this.server) return;
    this.server.to(userRoom(userId)).emit(NOTIF_WS.COUNT, { count: unreadCount });
  }
}
