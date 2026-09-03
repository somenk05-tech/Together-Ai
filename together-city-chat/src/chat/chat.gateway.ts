import { HttpException, Logger, UseFilters } from '@nestjs/common';
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
import { CallSignalSchema, type CallSignalDto } from '../calls/dto/calls.dto';

/** How often an open socket re-reads its account row. */
const RECHECK_MS = 60_000;

/**
 * How long a citizen has to come back before the calls they were on give up
 * their seat.
 *
 * A reload, a redeploy and a wifi blip all look EXACTLY like closing the
 * laptop from here — the socket goes and a new one arrives a second or two
 * later — and hanging up on the first of those would end a healthy call every
 * time somebody refreshed. 20 seconds is comfortably longer than socket.io's
 * reconnection takes and far shorter than the sweep, which is the backstop for
 * the case this misses entirely: a process that restarts before the timer runs.
 */
const CALL_ABANDON_GRACE_MS = 20_000;

interface AuthedSocket extends Socket {
  userId: string;
  typingTimers: Map<string, NodeJS.Timeout>;
  tokenIat?: number;
  recheck?: ReturnType<typeof setInterval>;
  /** Frames in the current minute, and when that minute started — one bucket
   *  per limited handler kind, `<key>Window` for `overLimit(client, key)`. */
  sendWindow?: RateWindow;
  joinWindow?: RateWindow;
  ackWindow?: RateWindow;
  typingWindow?: RateWindow;
  callWindow?: RateWindow;
}

interface RateWindow { startedAt: number; count: number }

/**
 * A socket's own ceilings. The HTTP send route sits behind the app-wide
 * throttler; this one did not, so a script holding one socket could post
 * without limit. Per connection, in memory: a limit that resets on reconnect
 * is a limit a determined script can dodge, but it is the one that stops the
 * accidental flood and the cheap one, and the HTTP path is the same number.
 *
 * IT WAS THE SEND PATH ONLY, AND THE SEND PATH IS NOT THE EXPENSIVE ONE.
 * Every other handler did real work per frame and had no ceiling at all —
 * `join` a findUnique with a members include plus a Redis write plus a
 * notification read, `read`/`delivered` a findMany plus an updateMany over up
 * to 500 ids, `typing` a timer and a room broadcast. So the bucket is keyed
 * now and the same mechanism covers all of them.
 *
 * The numbers are per minute, and each is what a person doing that thing as
 * fast as a person can do it would never reach:
 *   send   60 — unchanged, and the same number the HTTP route enforces.
 *   join  120 — two conversation switches a second, sustained for a minute;
 *                a reconnect joins its rooms in one call, not one per room.
 *   ack   240 — four frames a second. A client acks in batches of up to 500
 *                ids, so one frame already covers a whole backlog.
 *   typing 600 — ten a second. The client says it ONCE per burst and takes it
 *                back on a 2.5s timer, so a person cannot approach this; the
 *                number is high because the cost of a false positive here is
 *                out of all proportion to the frame. It was 300, chosen when
 *                the comment claimed the client debounced and it did not: a
 *                start frame went out per keystroke, so an 80wpm typist
 *                crossed it mid-sentence.
 *   call   240 — four a second, and it was the ONE handler with no ceiling at
 *                all: four database reads and up to 16 KB per frame, which is
 *                the most expensive thing this socket does and the cheapest to
 *                shout down. The number is high because ICE trickle is
 *                genuinely bursty and it must never be a person's call that
 *                pays: a whole handshake is one offer, one answer and perhaps
 *                thirty candidates on a dual-stack host with a relay, and they
 *                all arrive within a few seconds of answering. 240 leaves room
 *                for several ICE restarts on a train and still caps a
 *                determined socket at well under 60 KB/s of relayed payload.
 *                A dropped candidate is not a dropped call — the connection
 *                simply has one fewer route to try — which is why this can be
 *                a ceiling at all rather than a queue.
 */
const LIMIT_PER_MINUTE = { send: 60, join: 120, ack: 240, typing: 600, call: 240 };
type LimitKey = keyof typeof LIMIT_PER_MINUTE;

function overLimit(client: AuthedSocket, key: LimitKey, now = Date.now()): boolean {
  const field = `${key}Window` as const;
  const w = client[field];
  if (!w || now - w.startedAt >= 60_000) {
    client[field] = { startedAt: now, count: 1 };
    return false;
  }
  w.count += 1;
  return w.count > LIMIT_PER_MINUTE[key];
}

/**
 * Drop an over-limit frame, in the `{ status, message }` shape WsExceptionFilter
 * emits — one `error_event` listener on the client handles both.
 *
 * PLUS THE KIND, WHICH THE FILTER'S FRAMES DO NOT CARRY, and that asymmetry is
 * the point. `error_event` names no message, so the client rejects every send
 * it has in flight when one arrives — right for a refusal that IS about a send
 * (moderation, a block, an ended match, the send ceiling), and wrong for a
 * dropped typing or read frame, which would report a message as failed that
 * the server had accepted. A `kind` other than `send` says "this was not about
 * your message".
 */
function refuse(client: AuthedSocket, what: string, kind: LimitKey): void {
  client.emit(WS.ERROR, { status: 429, kind, message: `Too many ${what} — give it a minute.` });
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
    if (transitioned) {
      this.bus.publish({ kind: 'presence.changed', userId: client.userId, online: false });
      /* AND THE CALL THEY WERE ON, IF THEY DO NOT COME BACK.
         Nothing here ever mentioned calls, so closing a laptop mid-call sent
         no leave: the row stayed `active` with everybody still marked present,
         the sweep skipped it on that strength every minute forever, and the
         next call in that conversation joined the corpse instead of ringing
         anybody. Only on the LAST socket — a second tab closing must not hang
         up the call running in the first — and only after the grace above. */
      this.dropCallsIfGone(client.userId);
    }
  }

  /** Give up this citizen's seats, unless they are back within the grace. */
  private dropCallsIfGone(userId: string): void {
    const t = setTimeout(() => {
      void (async () => {
        try {
          if (await this.presence.isOnline(userId)) return; // they came back
          await this.calls.leaveAbandoned(userId);
        } catch (e) {
          this.logger.warn(`could not release ${userId}'s calls: ${(e as Error).message}`);
        }
      })();
    }, CALL_ABANDON_GRACE_MS);
    // A pending hang-up must never be the reason the process will not exit.
    t.unref?.();
  }

  /**
   * The rooms a citizen may be in — their conversations, minus the ones shared
   * with somebody they blocked (launch audit, 27 Aug).
   *
   * Sending was gated and everything else was not, because everything else is
   * gated by the ROOM: typing indicators, presence, read receipts and reaction
   * frames all go to `room.conversation(id)` and ask nothing further. So after
   * a block the two people could not write to each other and could still watch
   * each other type, come online and read — while the block screen says it
   * "hides you from each other everywhere".
   *
   * Filtering the room list is what makes that sentence true, because it is the
   * one place all of those channels agree on.
   */
  private async roomsFor(userId: string): Promise<string[]> {
    let ids = await this.messages.conversationIdsFor(userId);
    if (!ids.length) return ids;

    /* AN UNMATCH ENDS CONTACT TOO (fifth audit, 29 Aug). `unmatch` archived the
       thread and flipped the row off `matched`, and published nothing — so the
       two of them stayed in the room and kept typing, appearing online and
       reading at each other until a reconnection that never comes. The live
       half of the fix is the `connection.unmatched` event below; this is the
       half that survives the reconnection, because the list is rebuilt here
       from scratch and `conversationIdsFor` knows nothing about matches. */
    try {
      const ended = await this.messages.endedDatingIds(ids);
      if (ended.size) ids = ids.filter((id) => !ended.has(id));
    } catch (e) {
      // Loud, and it fails OPEN on purpose: the archive and the send gate both
      // still hold, so the cost is a stale typing indicator rather than a
      // citizen who cannot use their live chats because one query failed.
      this.logger.error(`Could not read ended matches for ${userId}: ${(e as Error).message}`);
    }
    if (!ids.length) return ids;

    let blocked: Set<string>;
    try {
      blocked = await this.permission.blockedWith(userId);
    } catch (e) {
      // Loud. Failing open here puts a blocked pair back in a shared room, so
      // the one thing this must not do is go quiet about it.
      this.logger.error(`Could not read blocks for ${userId}: ${(e as Error).message}`);
      return ids;
    }
    if (!blocked.size) return ids;
    /* DIRECT ONLY. This filtered ANY conversation holding somebody you had
       blocked, groups included — so blocking one person in a room of six
       silently took you out of that room's live frames until the next message
       put you back. `connection-permission.service.ts` says the opposite in
       as many words: a block "is not a way to remove somebody from a room full
       of other people". */
    const members = await this.messages.membersOf(ids);
    const direct = await this.messages.directIds(ids);
    return ids.filter((id) => !direct.has(id)
      || !(members.get(id) ?? []).some((u) => u !== userId && blocked.has(u)));
  }

  /** Put a freshly-connected socket into every conversation room it belongs in. */
  private async joinOwnConversations(client: AuthedSocket): Promise<void> {
    try {
      const ids = await this.roomsFor(client.userId);
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
    if (overLimit(client, 'join')) { refuse(client, 'conversation opens', 'join'); return; }
    const { conversationId } = parseOrThrow(JoinConversationSchema, body);
    await this.permission.assertCanPostToConversation(client.userId, conversationId);
    await client.join(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, conversationId, client.id);
    // Opening a chat clears its message notification from the bell.
    void this.notifications.markConversationRead(client.userId, conversationId);
  }

  @SubscribeMessage(WS.LEAVE_CONVERSATION)
  async onLeave(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overLimit(client, 'join')) { refuse(client, 'conversation opens', 'join'); return; }
    const { conversationId } = parseOrThrow(LeaveConversationSchema, body);
    await client.leave(room.conversation(conversationId));
    await this.redis.setOpenConversation(client.userId, null, client.id);
  }

  // ── messaging ──────────────────────────────────────────
  @SubscribeMessage(WS.SEND_MESSAGE)
  async onSend(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overLimit(client, 'send')) { refuse(client, 'messages', 'send'); return; }
    const dto = parseOrThrow(SocketSendSchema, body);
    // MessagesService enforces the connection gate; throws 403 if not connected.
    const message = await this.messages.send(client.userId, dto);
    // Broadcast happens via the bus subscription (handleBusEvent) so REST + WS
    // are unified. Ack the sender with the persisted message.
    client.emit('message_ack', { clientId: dto.clientId, message });
  }

  @SubscribeMessage(WS.MESSAGE_DELIVERED)
  async onDelivered(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overLimit(client, 'ack')) { refuse(client, 'receipts', 'ack'); return; }
    const { messageIds } = parseOrThrow(AckSchema, body);
    await this.messages.markDelivered(client.userId, messageIds);
  }

  @SubscribeMessage(WS.MESSAGE_READ)
  async onRead(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overLimit(client, 'ack')) { refuse(client, 'receipts', 'ack'); return; }
    const { messageIds } = parseOrThrow(AckSchema, body);
    await this.messages.markRead(client.userId, messageIds);
  }

  // ── typing ─────────────────────────────────────────────
  @SubscribeMessage(WS.TYPING_START)
  async onTypingStart(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: unknown): Promise<void> {
    if (overLimit(client, 'typing')) { refuse(client, 'typing signals', 'typing'); return; }
    const { conversationId } = parseOrThrow(TypingSchema, body);
    /* Typing is gated by the ROOM, not by a DB query per keystroke: the
       handshake (joinOwnConversations) and onJoin only admit members, so being
       in the room is the proof of membership. Without this check any signed-in
       socket could broadcast a typing indicator into any conversation it could
       name — before its own authentication had even finished. */
    if (!client.userId || !client.rooms.has(room.conversation(conversationId))) return;
    /* NO HANDLE. It rode along here for every conversation in the city,
       including the dating ones, where it is the one field the whole hub is
       built to withhold until somebody chooses to give it — and a match typing
       is exactly when it was sent. Nothing has ever read it: the client's
       TYPING_START listener takes `userId` and stops (chat.api.ts). So it goes
       rather than being masked, and the leak closes everywhere at once.
       (Fourth audit, 28 Aug.) */
    client.to(room.conversation(conversationId)).emit(WS.TYPING_START, {
      conversationId,
      userId: client.userId,
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
    if (overLimit(client, 'typing')) { refuse(client, 'typing signals', 'typing'); return; }
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
    if (overLimit(client, 'call')) { refuse(client, 'call signals', 'call'); return; }
    let dto: CallSignalDto;
    try {
      dto = parseOrThrow(CallSignalSchema, body);
      await this.calls.assertMaySignal(client.userId, dto.callId, dto.to);
    } catch (e) {
      /* REFUSED, WITH A KIND — the same asymmetry `refuse` explains above, for
         the same reason and one step further down. Everything thrown here
         reached the client through WsExceptionFilter as `{ status, message }`
         with no kind, and `error_event` names no message: the chat client
         therefore failed every send it had in flight because a call frame was
         rejected, while the call itself — which had nothing listening for
         `error_event` at all — showed the citizen nothing. A call refusal is
         about the call. */
      client.emit(WS.ERROR, {
        status: e instanceof HttpException ? e.getStatus() : 400,
        kind: 'call',
        message: e instanceof HttpException ? e.message : 'That call signal was refused.',
      });
      return;
    }
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
        /* Instant per-user push: reaches recipients even when they're not
           viewing this conversation (drives the unread badge + a delivered
           receipt).
           ─────────────────────────────────────────────────────────────────
           IT CARRIES NO IDENTITY AND NO CONTENT, AND THAT IS THE POINT.

           This frame used to carry `senderId` and the raw `preview` — for
           DATING conversations too, where the whole product promise is that the
           other person is a pseudonym until both choose otherwise. It was safe
           only by accident: the one listener (`useChatNotifications`) reads
           `conversationId` and `messageId` and throws the rest away. The first
           person to render a toast off this event would have put a real name
           and the text of an anonymous message on screen, bypassing
           `identityIn()` — which is the ONLY place that decides how somebody
           may be named in a dating chat — without touching a line of dating
           code.

           So the frame is now exactly what its reader uses: which conversation,
           which message. Anything that wants to say WHO or WHAT must go through
           the notification path, where the masking lives. Do not add fields
           here; add them to the bell. */
        for (const rid of event.recipientIds) {
          this.server.to(room.user(rid)).emit(WS.CHAT_NOTIFICATION, {
            conversationId: event.conversationId,
            messageId,
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
      case 'snap.changed':
        this.server
          .to(room.conversation(event.conversationId))
          .emit(WS.SNAP_CHANGED, {
            conversationId: event.conversationId,
            messageId: event.messageId,
            by: event.by,
            event: event.event,
          });
        break;
      case 'connection.blocked': {
        /* Both directions, immediately. Leaving the room is what actually stops
           the transient signals — they are broadcast to `room.conversation(id)`
           and ask nothing else — and the room list is only rebuilt on connect,
           so without this the block waited for a reconnection nobody makes. */
        const [a, b] = event.userIds;
        try {
          const ids = await this.messages.conversationIdsFor(a);
          const members = await this.messages.membersOf(ids);
          /* DIRECT ONLY, LIKE `roomsFor` (re-audit, 29 Aug). That method was
             scoped to one-to-one threads because a block "is not a way to
             remove somebody from a room full of other people"; this half of
             the same mechanism was not, so blocking one member of a group
             still ejected BOTH people from that group's live frames — and the
             next reconnect silently put them back, because the room list now
             keeps groups. Two halves of one control disagreeing is worse than
             either answer. */
          const direct = await this.messages.directIds(ids);
          const shared = ids.filter((id) => direct.has(id) && (members.get(id) ?? []).includes(b));
          for (const id of shared) {
            await this.server.in(room.user(a)).socketsLeave(room.conversation(id));
            await this.server.in(room.user(b)).socketsLeave(room.conversation(id));
          }
        } catch (e) {
          this.logger.error(`Could not empty the rooms ${a} and ${b} share: ${(e as Error).message}`);
        }
        break;
      }
      case 'connection.unmatched': {
        /* One conversation, both people, immediately — the same reason the
           block case gives, and narrower because an unmatch names its room. */
        const [a, b] = event.userIds;
        try {
          for (const uid of [a, b]) {
            await this.server.in(room.user(uid)).socketsLeave(room.conversation(event.conversationId));
          }
        } catch (e) {
          this.logger.error(`Could not empty the room ${event.conversationId} after an unmatch: ${(e as Error).message}`);
        }
        break;
      }
      case 'presence.changed': {
        /* This told the subject they had come online and told nobody else.
           `room.user(event.userId)` is their OWN room — the one place the news
           is useless. Presence is for the people who might be typing to you,
           so it goes to the conversations you share with them. Their own room
           stays on the list so a second tab of theirs still agrees. */
        const rooms = [room.user(event.userId)];
        try {
          for (const id of await this.roomsFor(event.userId)) {
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
    const m = message as {
      text?: string | null; body?: string | null; messageType?: string;
      media?: Array<{ kind?: string }>;
    };
    const t = m.body ?? m.text;
    if (t && t.trim()) return t.slice(0, 120);
    /* A SNAP SAYS IT IS A SNAP, and it never says more than that. There is no
       image in a push here — this whole function returns a STRING and the
       notification carries no picture — so the lock screen was never going to
       show the photograph. What it would have shown is "📷 Photo", which is
       wrong in the one way that matters: somebody glancing at a notification
       should know before they unlock that opening this will spend it.

       A caption still previews, above, like any other text: the words are the
       sender's message, not the photograph. */
    if ((m.media ?? []).some((a) => a.kind === 'snap')) return '📸 Snap';
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
