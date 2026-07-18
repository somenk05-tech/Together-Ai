import { Logger, UseFilters } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../auth/token.service';
import { PresenceService } from '../users/presence.service';
import { MessagesService } from '../messages/messages.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ConnectionPermissionService } from '../connections/connection-permission.service';
import { RedisService } from '../shared/redis/redis.service';
import { ChatEventBus, ChatEvent } from '../shared/events/chat-events';
import { parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { WsExceptionFilter } from './ws-exception.filter';
import { WS, room } from './chat.events';
import {
  AckSchema,
  JoinConversationSchema,
  LeaveConversationSchema,
  SocketSendSchema,
  TypingSchema,
} from './dto/socket.dto';

interface AuthedSocket extends Socket {
  userId: string;
  handle: string;
  typingTimers: Map<string, NodeJS.Timeout>;
}

/**
 * Real-time transport. Authenticates the JWT on the handshake, tracks presence,
 * relays typing/read/delivery, and broadcasts domain events published on the
 * ChatEventBus (so REST-sent messages fan out over sockets too).
 *
 * Target: <100ms delivery — work done here is O(1) room emits; all DB work is
 * delegated to services and awaited before broadcast.
 */
@UseFilters(new WsExceptionFilter())
@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    private readonly permission: ConnectionPermissionService,
    private readonly redis: RedisService,
    private readonly bus: ChatEventBus,
    private readonly config: ConfigService,
  ) {}

  afterInit(): void {
    // Fan domain events out to the right socket rooms.
    this.bus.subscribe((event) => this.handleBusEvent(event));
  }

  // ── connection lifecycle ───────────────────────────────
  async handleConnection(client: AuthedSocket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ??
        (client.handshake.headers.authorization ?? '').replace('Bearer ', '');
      const user = await this.tokens.verifyAccess(token);
      client.userId = user.sub;
      client.handle = user.handle;
      client.typingTimers = new Map();

      await client.join(room.user(user.sub));
      const transitioned = await this.presence.markOnline(user.sub, client.id);
      if (transitioned) this.bus.publish({ kind: 'presence.changed', userId: user.sub, online: true });

      // Sync any messages that arrived while the user was offline.
      const pending = await this.messages.pendingForUser(user.sub);
      if (pending.length) client.emit('sync_pending', pending);
    } catch {
      client.emit(WS.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    if (!client.userId) return;
    client.typingTimers?.forEach((t) => clearTimeout(t));
    await this.redis.setOpenConversation(client.userId, null);
    const transitioned = await this.presence.markOffline(client.userId, client.id);
    if (transitioned) this.bus.publish({ kind: 'presence.changed', userId: client.userId, online: false });
  }

  // ── rooms ──────────────────────────────────────────────
  @SubscribeMessage(WS.JOIN_CONVERSATION)
  async onJoin(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(JoinConversationSchema, body);
    await this.permission.assertCanPostToConversation(client.userId, conversationId);
    await client.join(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, conversationId);
  }

  @SubscribeMessage(WS.LEAVE_CONVERSATION)
  async onLeave(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(LeaveConversationSchema, body);
    await client.leave(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, null);
  }

  // ── messaging ──────────────────────────────────────────
  @SubscribeMessage(WS.SEND_MESSAGE)
  async onSend(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const dto = parseOrThrow(SocketSendSchema, body);
    // MessagesService enforces the connection gate; throws 403 if not connected.
    const message = await this.messages.send(client.userId, dto);
    // Broadcast happens via the bus subscription (handleBusEvent) so REST + WS
    // are unified. Ack the sender with the persisted message.
    client.emit('message_ack', { clientId: dto.clientId, message });
  }

  @SubscribeMessage(WS.MESSAGE_DELIVERED)
  async onDelivered(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { messageIds } = parseOrThrow(AckSchema, body);
    await this.messages.markDelivered(client.userId, messageIds);
  }

  @SubscribeMessage(WS.MESSAGE_READ)
  async onRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { messageIds } = parseOrThrow(AckSchema, body);
    await this.messages.markRead(client.userId, messageIds);
  }

  // ── typing ─────────────────────────────────────────────
  @SubscribeMessage(WS.TYPING_START)
  async onTypingStart(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(TypingSchema, body);
    client.to(room.conversation(conversationId)).emit(WS.TYPING_START, {
      conversationId,
      userId: client.userId,
      handle: client.handle,
    });
    // Auto-stop after N ms of inactivity.
    const timeout = this.config.get<number>('policy.typingTimeoutMs') ?? 3000;
    const existing = client.typingTimers.get(conversationId);
    if (existing) clearTimeout(existing);
    client.typingTimers.set(
      conversationId,
      setTimeout(() => {
        client.to(room.conversation(conversationId)).emit(WS.TYPING_STOP, {
          conversationId,
          userId: client.userId,
        });
        client.typingTimers.delete(conversationId);
      }, timeout),
    );
  }

  @SubscribeMessage(WS.TYPING_STOP)
  async onTypingStop(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(TypingSchema, body);
    const existing = client.typingTimers.get(conversationId);
    if (existing) clearTimeout(existing);
    client.typingTimers.delete(conversationId);
    client.to(room.conversation(conversationId)).emit(WS.TYPING_STOP, {
      conversationId,
      userId: client.userId,
    });
  }

  // ── presence heartbeat ─────────────────────────────────
  @SubscribeMessage(WS.HEARTBEAT)
  async onHeartbeat(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    await this.presence.heartbeat(client.userId);
  }

  // ── bus → socket fan-out ───────────────────────────────
  private async handleBusEvent(event: ChatEvent): Promise<void> {
    switch (event.kind) {
      case 'message.created': {
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.RECEIVE_MESSAGE, event.message);
        // Also notify recipients not currently in the room (offline / other screen).
        const preview = this.previewOf(event.message);
        const sender = (event.message as { senderId: string }).senderId;
        await this.notifications.notifyNewMessage({
          conversationId: event.conversationId,
          senderId: sender,
          recipientIds: event.recipientIds,
          preview,
        });
        break;
      }
      case 'message.edited':
        this.server.to(room.conversation(event.conversationId)).emit(WS.MESSAGE_EDITED, event.message);
        break;
      case 'message.deleted':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_DELETED, { messageId: event.messageId });
        break;
      case 'message.delivered':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_DELIVERED, { messageId: event.messageId, userId: event.userId });
        break;
      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { messageId: event.messageId, userId: event.userId });
        break;
      case 'presence.changed':
        this.server
          .to(room.user(event.userId))
          .emit(event.online ? WS.USER_ONLINE : WS.USER_OFFLINE, { userId: event.userId });
        break;
    }
  }

  private previewOf(message: unknown): string {
    const m = message as { text?: string | null; messageType?: string };
    if (m.text && m.text.trim()) return m.text.slice(0, 120);
    const map: Record<string, string> = {
      IMAGE: '📷 Photo',
      VIDEO: '🎥 Video',
      VOICE: '🎤 Voice message',
      FILE: '📎 Attachment',
      GIF: 'GIF',
      STICKER: 'Sticker',
      LOCATION: '📍 Location',
      CONTACT: '👤 Contact',
    };
    return map[m.messageType ?? 'TEXT'] ?? 'New message';
  }
}
