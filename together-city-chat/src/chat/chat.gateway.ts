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
import { CallsService } from '../calls/calls.service';
import { RedisService } from '../shared/redis/redis.service';
import { ChatEventBus, ChatEvent } from '../shared/events/chat-events';
import { parseOrThrow } from '../shared/zod/zod-validation.pipe';
import { WsExceptionFilter } from './ws-exception.filter';
import { WS, room } from './chat.events';
import { wsCors } from '../shared/ws-cors';
import {
  AckSchema,
  JoinConversationSchema,
  LeaveConversationSchema,
  SocketSendSchema,
  TypingSchema,
} from './dto/socket.dto';
import { CallSignalSchema } from '../calls/dto/calls.dto';

/** How often an open socket re-reads its account row. */
const RECHECK_MS = 60_000;

interface AuthedSocket extends Socket {
  userId: string;
  handle: string;
  typingTimers: Map<string, NodeJS.Timeout>;
  tokenIat?: number;
  recheck?: ReturnType<typeof setInterval>;
  /** Sends in the current minute, and when that minute started. */
  sendWindow?: { startedAt: number; count: number };
}

/**
 * A socket's own send ceiling. The HTTP send route sits behind the app-wide
 * throttler; this one did not, so a script holding one socket could post
 * without limit. Per connection, in memory: a limit that resets on reconnect
 * is a limit a determined script can dodge, but it is the one that stops the
 * accidental flood and the cheap one, and the HTTP path is the same number.
 */
const SEND_LIMIT_PER_MINUTE = 60;

function overSendLimit(client: AuthedSocket, now = Date.now()): boolean {
  const w = client.sendWindow;
  if (!w || now - w.startedAt >= 60_000) {
    client.sendWindow = { startedAt: now, count: 1 };
    return false;
  }
  w.count += 1;
  return w.count > SEND_LIMIT_PER_MINUTE;
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
@WebSocketGateway({ cors: wsCors })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private server!: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private readonly tokens: TokenService,
    private readonly presence: PresenceService,
    private readonly messages: MessagesService,
    private readonly notifications: NotificationsService,
    private readonly permission: ConnectionPermissionService,
    private readonly calls: CallsService,
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
      // Signature AND account — see TokenService.verifyAccessAndAccount for
      // the hole a signature-only check left open here.
      const user = await this.tokens.verifyAccessAndAccount(token);
      client.userId = user.sub;
      client.handle = user.handle;
      client.typingTimers = new Map();
      client.tokenIat = user.iat;
      // A connection is re-checked for as long as it lives. Suspension,
      // deletion and "sign out everywhere" take effect on an OPEN socket within
      // one interval, not at the next reconnect — which for a laptop that
      // never closes the tab is never.
      client.recheck = setInterval(() => {
        void this.tokens.assertAccountLive({ sub: user.sub, iat: user.iat }).catch((e: Error) => {
          this.logger.warn(`socket ${client.id} closed on re-check: ${e.message}`);
          client.disconnect(true);
        });
      }, RECHECK_MS);
      client.recheck.unref?.();

      await client.join(room.user(user.sub));

      /* A ROOM THE CLIENT ASKED FOR ONCE IS NOT A ROOM IT IS IN.
         Socket.IO rooms belong to a CONNECTION. The web client emitted
         `join_conversation` from an effect keyed on the conversation id, so it
         asked exactly once per open thread — and every reconnect (a wifi blip,
         a backend redeploy, a laptop lid) handed it a new connection that had
         joined nothing. The thread stayed on screen and quietly stopped
         receiving messages, because `receive_message` is addressed to
         `conversation:<id>` and this socket was no longer in it.
         Re-joining is the server's job: it is the only side that knows the
         connection is new, and it already knows every room this user belongs
         in. The client's own join still fires and is now merely an
         optimisation — the correctness does not depend on it. */
      await this.joinOwnConversations(client);

      const transitioned = await this.presence.markOnline(user.sub, client.id);
      if (transitioned) this.bus.publish({ kind: 'presence.changed', userId: user.sub, online: true });

      /* Everything that arrived while they were away is delivered NOW, and the
         senders are told. See messages.service.deliverBacklog — this is the
         line that puts the second tick on a message sent to somebody who was
         offline. `sync_pending` below is kept for clients that want the rows
         without a refetch; nothing depends on it. */
      void this.messages.deliverBacklog(user.sub).catch((e: Error) => {
        this.logger.error(`deliverBacklog failed for ${user.sub}: ${e.message}`);
      });

      /* `sync_pending` is gone: no client has ever listened for it, and the
         query behind it — up to 500 fully-hydrated messages — ran inside every
         handshake for an audience of nobody. History is REST's job;
         deliverBacklog above is what makes the receipts true. */
    } catch {
      client.emit(WS.ERROR, { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthedSocket): Promise<void> {
    if (client.recheck) clearInterval(client.recheck);
    if (!client.userId) return;
    client.typingTimers?.forEach((t) => clearTimeout(t));
    await this.redis.setOpenConversation(client.userId, null, client.id);
    const transitioned = await this.presence.markOffline(client.userId, client.id);
    if (transitioned) this.bus.publish({ kind: 'presence.changed', userId: client.userId, online: false });
  }

  /** Put a freshly-connected socket into every conversation room it belongs in. */
  private async joinOwnConversations(client: AuthedSocket): Promise<void> {
    try {
      const ids = await this.messages.conversationIdsFor(client.userId);
      if (ids.length) await client.join(ids.map((id) => room.conversation(id)));
    } catch (e) {
      // A socket that cannot join its rooms still gets `chat_notification` on
      // its user room, so the badge and the refetch survive. Loud, not fatal.
      this.logger.error(`Could not join conversation rooms for ${client.userId}: ${(e as Error).message}`);
    }
  }

  // ── rooms ──────────────────────────────────────────────
  @SubscribeMessage(WS.JOIN_CONVERSATION)
  async onJoin(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(JoinConversationSchema, body);
    await this.permission.assertCanPostToConversation(client.userId, conversationId);
    await client.join(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, conversationId, client.id);
    // Opening a chat clears its message notification from the bell.
    void this.notifications.markConversationRead(client.userId, conversationId);
  }

  @SubscribeMessage(WS.LEAVE_CONVERSATION)
  async onLeave(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const { conversationId } = parseOrThrow(LeaveConversationSchema, body);
    await client.leave(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, null, client.id);
  }

  // ── messaging ──────────────────────────────────────────
  @SubscribeMessage(WS.SEND_MESSAGE)
  async onSend(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overSendLimit(client)) {
      client.emit('error_event', { message: 'Too many messages — give it a minute.' });
      return;
    }
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
    /* Typing is gated by the ROOM, not by a DB query per keystroke: the
       handshake (joinOwnConversations) and onJoin only admit members, so being
       in the room is the proof of membership. Without this check any signed-in
       socket could broadcast a typing indicator into any conversation it could
       name — before its own authentication had even finished. */
    if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;
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
    if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;
    const existing = client.typingTimers.get(conversationId);
    if (existing) clearTimeout(existing);
    client.typingTimers.delete(conversationId);
    client.to(room.conversation(conversationId)).emit(WS.TYPING_STOP, {
      conversationId,
      userId: client.userId,
    });
  }

  // ── calls ──────────────────────────────────────────────
  /**
   * Relay one piece of the WebRTC handshake to one other participant.
   *
   * The server reads none of it and stores none of it — an offer, an answer and
   * a trickle of ICE candidates pass through opaque. What it does do, on every
   * single frame, is re-ask whether these two people are on the same live call.
   * Authorising once at join and trusting the socket afterwards would let a
   * participant who has been removed from the conversation keep talking, and
   * would let anyone holding a call id address a stranger by user id.
   */
  @SubscribeMessage(WS.CALL_SIGNAL)
  async onCallSignal(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    const dto = parseOrThrow(CallSignalSchema, body);
    await this.calls.assertMaySignal(client.userId, dto.callId, dto.to);
    this.server.to(room.user(dto.to)).emit(WS.CALL_SIGNAL, {
      callId: dto.callId,
      from: client.userId,
      kind: dto.kind,
      payload: dto.payload,
    });
  }

  // ── presence heartbeat ─────────────────────────────────
  @SubscribeMessage(WS.HEARTBEAT)
  async onHeartbeat(@ConnectedSocket() client: AuthedSocket): Promise<void> {
    if (!client.userId) return; // handshake auth not finished — drop the frame
    await this.presence.heartbeat(client.userId);
  }

  // ── bus → socket fan-out ───────────────────────────────
  private async handleBusEvent(event: ChatEvent): Promise<void> {
    switch (event.kind) {
      case 'message.created': {
        /* A conversation that did not exist when you connected is a room you
           could not have joined — the first message of a brand-new thread (an
           enquiry, a first DM) would land in a room with one person in it.
           `socketsJoin` addresses the recipients by their user room, which
           every connected socket is in, and works across the Redis adapter, so
           it reaches their sockets on other instances too. Idempotent. */
        for (const rid of event.recipientIds) {
          this.server.in(room.user(rid)).socketsJoin(room.conversation(event.conversationId));
        }
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.RECEIVE_MESSAGE, event.message);
        const preview = this.previewOf(event.message);
        const sender = (event.message as { senderId: string }).senderId;
        const messageId = (event.message as { id: string }).id;
        // Instant per-user push: reaches recipients even when they're not viewing
        // this conversation (drives the unread badge + a delivered receipt).
        for (const rid of event.recipientIds) {
          this.server.to(room.user(rid)).emit(WS.CHAT_NOTIFICATION, {
            conversationId: event.conversationId,
            messageId,
            senderId: sender,
            preview,
          });
        }
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
          .emit(WS.MESSAGE_DELETED, { conversationId: event.conversationId, messageId: event.messageId });
        break;
      case 'message.delivered':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_DELIVERED, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;
      case 'message.read':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_READ, { conversationId: event.conversationId, messageId: event.messageId, userId: event.userId });
        break;
      /* Both go to the conversation room and to nobody else. Neither is worth a
         per-user push the way a new message is: a reaction and a pin are things
         you notice when you are in the room, not things that should light up a
         phone in somebody's pocket. */
      case 'message.reacted':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_REACTED, {
            conversationId: event.conversationId,
            messageId: event.messageId,
            reactions: event.reactions,
          });
        break;
      case 'message.pinned':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.MESSAGE_PINNED, {
            conversationId: event.conversationId,
            messageId: event.messageId,
            message: event.message,
          });
        break;
      case 'presence.changed': {
        /* This told the subject they had come online and told nobody else.
           `room.user(event.userId)` is their OWN room — the one place the news
           is useless. Presence is for the people who might be typing to you,
           so it goes to the conversations you share with them. Their own room
           stays on the list so a second tab of theirs still agrees. */
        const rooms = [room.user(event.userId)];
        try {
          for (const id of await this.messages.conversationIdsFor(event.userId)) {
            rooms.push(room.conversation(id));
          }
        } catch (e) {
          this.logger.error(`presence fan-out lookup failed: ${(e as Error).message}`);
        }
        this.server
          .to(rooms)
          .emit(event.online ? WS.USER_ONLINE : WS.USER_OFFLINE, { userId: event.userId });
        break;
      }
      case 'call.ringing':
        for (const rid of event.recipientIds) {
          this.server.to(room.user(rid)).emit(WS.CALL_RINGING, event.call);
        }
        break;
      case 'call.updated':
        // Everyone on the roster, including whoever just left, so their own UI
        // agrees with everybody else's about how the call finished.
        for (const rid of event.recipientIds) {
          this.server.to(room.user(rid)).emit(WS.CALL_UPDATED, { event: event.event, call: event.call });
        }
        break;
    }
  }

  private previewOf(message: unknown): string {
    const m = message as { text?: string | null; body?: string | null; messageType?: string };
    const t = m.body ?? m.text;
    if (t && t.trim()) return t.slice(0, 120);
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
