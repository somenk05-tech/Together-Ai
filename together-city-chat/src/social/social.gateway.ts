import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { SOCIAL_WS } from './social.events';
import { wsCors } from '../shared/ws-cors';

/**
 * Broadcast-only gateway for the Social hub. It shares the default Socket.IO
 * server (authenticated by ChatGateway's handshake) and owns no lifecycle —
 * it only fans domain events out so feeds update live.
 */
@Injectable()
@WebSocketGateway({ cors: wsCors })
export class SocialGateway {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(SocialGateway.name);

  postNew(post: unknown): void {
    this.emit(SOCIAL_WS.POST_NEW, post);
  }

  postDeleted(postId: string): void {
    this.emit(SOCIAL_WS.POST_DELETED, { postId });
  }

  commentNew(comment: unknown): void {
    this.emit(SOCIAL_WS.COMMENT_NEW, comment);
  }

  likeChanged(payload: { postId: string; liked: boolean; likes: number }): void {
    this.emit(SOCIAL_WS.LIKE_CHANGED, payload);
  }

  private emit(event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`socket server not ready — dropped ${event}`);
      return;
    }
    this.server.emit(event, payload);
  }
}
