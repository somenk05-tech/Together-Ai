import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';
import { SOCIAL_WS } from './social.events';
import { wsCors } from '../shared/ws-cors';

/**
 * Audience-scoped gateway for the Social hub. It shares the default Socket.IO
 * server (authenticated by ChatGateway's handshake, which joins each client to a
 * `user:<id>` room) and owns no lifecycle — it fans domain events out ONLY to
 * the users allowed to see the post (its author + eligible viewers), never to
 * every connected client. A previous version used `server.emit()`, which
 * broadcast private/family posts to the whole city in real time.
 */
@Injectable()
@WebSocketGateway({ cors: wsCors })
export class SocialGateway {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(SocialGateway.name);

  postNew(post: unknown, recipientIds: string[]): void {
    this.emitTo(recipientIds, SOCIAL_WS.POST_NEW, post);
  }

  postDeleted(postId: string, recipientIds: string[]): void {
    this.emitTo(recipientIds, SOCIAL_WS.POST_DELETED, { postId });
  }

  commentNew(comment: unknown, recipientIds: string[]): void {
    this.emitTo(recipientIds, SOCIAL_WS.COMMENT_NEW, comment);
  }

  likeChanged(payload: { postId: string; liked: boolean; likes: number }, recipientIds: string[]): void {
    this.emitTo(recipientIds, SOCIAL_WS.LIKE_CHANGED, payload);
  }

  /** Per-user room, matching ChatGateway's `user:<id>` handshake room. */
  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private emitTo(userIds: string[], event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`socket server not ready — dropped ${event}`);
      return;
    }
    const rooms = [...new Set(userIds)].filter(Boolean).map((id) => this.userRoom(id));
    if (!rooms.length) return;
    this.server.to(rooms).emit(event, payload);
  }
}
