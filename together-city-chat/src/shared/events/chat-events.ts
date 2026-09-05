import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { swallowed } from '../swallow';
import { RedisService } from '../redis/redis.service';

/**
 * Event bus decoupling domain services (messages, connections) from the
 * transport layer (ChatGateway). Services emit; the gateway broadcasts.
 */
export type ChatEvent =
  | { kind: 'message.created'; conversationId: string; message: unknown; recipientIds: string[] }
  | { kind: 'message.edited'; conversationId: string; message: unknown }
  | { kind: 'message.deleted'; conversationId: string; messageId: string }
  | { kind: 'message.delivered'; conversationId: string; messageId: string; userId: string }
  | { kind: 'message.read'; conversationId: string; messageId: string; userId: string }
  /* The whole list every time, not a delta. A reaction frame that said "+1 on
     👍" would need the client to already hold a correct count to add to — and a
     client that missed one frame would then be wrong for as long as the thread
     stayed open. Sending the state makes a dropped frame self-healing. */
  | {
      kind: 'message.reacted';
      conversationId: string;
      messageId: string;
      reactions: Array<{ emoji: string; userIds: string[] }>;
    }
  /* messageId is null when the room's pin was cleared. `message` carries the
     newly pinned one so a banner can render without a fetch. */
  | { kind: 'message.pinned'; conversationId: string; messageId: string | null; message: unknown }
  /**
   * SOMETHING HAPPENED TO A SNAP: it was opened, it was kept, or a recipient's
   * device reported a screen capture.
   *
   * THE FACT TRAVELS AND THE MESSAGE DOES NOT, unlike every frame above it,
   * and the reason is `viewsLeft`. How many opens are left is a PER-READER
   * number; a broadcast reaches several readers at once and can only carry the
   * allowance. A frame carrying the serialized message would therefore tell
   * the person who just spent their last view that they have one left, half a
   * second after their own request correctly told them they had none — the
   * `starred` problem, on a field somebody is watching.
   *
   * So this says what happened and to which message, and a client that did not
   * cause it re-reads. Snap events are rare by nature — one per photograph,
   * not one per keystroke — so a refetch is the cheap correct answer rather
   * than a delta somebody has to keep in step.
   */
  | { kind: 'snap.changed'; conversationId: string; messageId: string; by: string; event: 'opened' | 'kept' | 'shot' }
  | { kind: 'presence.changed'; userId: string; online: boolean }
  /** Somebody blocked somebody. The socket layer uses it to empty the rooms the
   *  two of them share, so typing, presence and receipts stop at the block
   *  rather than at their next reconnection. */
  | { kind: 'connection.blocked'; userIds: [string, string] }
  /** A match ended. The block event above empties the rooms two people share
   *  because a block must stop contact; an unmatch must stop it too, and did
   *  not — sending was refused and typing, presence and read receipts carried
   *  on, because all three are gated by the ROOM and the room list was only
   *  rebuilt on connect. The conversation is named, because unlike a block an
   *  unmatch is about exactly one of them. */
  | { kind: 'connection.unmatched'; userIds: [string, string]; conversationId: string }
  /** Somebody is no longer in a group — removed by an admin, or they left.
   *  The row is gone, so REST refuses them; the ROOM did not know (launch
   *  gate, third reading, 4 Sep): rooms were rebuilt only on connect and
   *  evicted only for a block or an unmatch, so a removed member's open
   *  socket went on receiving every message the group sent — text,
   *  attachments, sender — until they happened to reconnect. */
  | { kind: 'member.removed'; conversationId: string; userId: string }
  // Calls. The gateway fans these to per-user rooms rather than the
  // conversation room: a call has to reach someone who is not looking at the
  // chat, which is the entire point of a phone ringing.
  | { kind: 'call.ringing'; callId: string; conversationId: string; recipientIds: string[]; call: unknown }
  | {
      kind: 'call.updated';
      callId: string;
      conversationId: string;
      recipientIds: string[];
      event: 'joined' | 'left' | 'ended';
      call: unknown;
    };

/** One channel for every chat event. The payload names its own `kind`. */
const CHANNEL = 'chat:events';

/**
 * ── THE BUS CROSSES THE NODE BOUNDARY ─────────────────────────────────────
 *
 * This was an `EventEmitter` and nothing else, with a comment saying a
 * multi-node deployment should "replace/augment with a Redis pub/sub adapter".
 * Socket.IO's own Redis adapter was added and that comment was left standing,
 * which made the situation worse than it looked: ROOM broadcasts crossed
 * instances and BUS events did not. So on a second replica, a message sent
 * through node A reached the room everywhere — and the work the gateway does
 * off the bus (the badge frame, the bell, the push, joining recipients to a
 * room they were not in yet) happened only on A. Push and the unread badge
 * would have gone quiet for roughly half the city, intermittently, with nothing
 * in any log to say so, on the day somebody scaled the service to two.
 *
 * The fix keeps the local emitter as the delivery path — same synchronous
 * behaviour, same ordering, and a Redis outage costs nothing on the node that
 * is handling the request — and adds a publish alongside it. Every message
 * carries the id of the process that sent it, and a subscriber drops its own,
 * so the origin node handles each event exactly once.
 *
 * WHAT CROSSES IS JSON. `message` and `call` are DTOs that are about to be
 * serialised onto a socket anyway, so this costs nothing real — but a `Date`
 * arrives at the other node as an ISO string. Nothing downstream does date
 * arithmetic on a bus payload; if that ever changes, it changes here.
 *
 * Redis is OPTIONAL, deliberately. With no `RedisService` (unit tests) or a
 * connection that is down, this degrades to exactly what it was: a correct
 * single-instance bus. Trading a partial outage for a total one is not a fix.
 */
@Injectable()
export class ChatEventBus implements OnModuleDestroy {
  private readonly emitter = new EventEmitter();
  private readonly log = new Logger(ChatEventBus.name);
  /** This process. Not persisted anywhere — its only job is "was this mine". */
  private readonly nodeId = randomUUID();
  private publisher?: { publish(channel: string, message: string): Promise<unknown> };
  private subscriber?: { subscribe(channel: string): Promise<unknown>; on(ev: string, cb: (...a: never[]) => void): unknown; quit(): Promise<unknown>; connect(): Promise<unknown> };

  constructor(@Optional() private readonly redis?: RedisService) {
    this.emitter.setMaxListeners(0);
    if (redis) this.attach(redis);
  }

  private attach(redis: RedisService): void {
    /* A SEPARATE CONNECTION TO LISTEN ON. A Redis client in subscriber mode
       refuses every other command, so the shared client cannot be the one that
       subscribes — it is also holding presence, open-conversation keys and the
       recovery cooldown. `duplicate()` copies the options, including
       lazyConnect, so it has to be connected explicitly. */
    try {
      const sub = redis.raw.duplicate() as unknown as NonNullable<ChatEventBus['subscriber']>;
      this.subscriber = sub;
      this.publisher = redis.raw as unknown as NonNullable<ChatEventBus['publisher']>;
      sub.on('error', ((e: Error) => this.log.warn(`chat bus subscriber: ${e.message}`)) as never);
      sub.on('message', ((channel: string, payload: string) => this.receive(channel, payload)) as never);
      void Promise.resolve(sub.connect())
        .then(() => sub.subscribe(CHANNEL))
        .then(() => this.log.log('Chat event bus fans out across instances.'))
        .catch(swallowed('events.chatBus.subscribe', undefined));
    } catch (e) {
      // A bus that cannot reach Redis is the bus this class used to be, which
      // is correct on one node. Loud, because on two nodes it is not.
      this.log.warn(`chat bus is in-process only: ${(e as Error).message}`);
    }
  }

  private receive(channel: string, payload: string): void {
    if (channel !== CHANNEL) return;
    let parsed: { origin?: string; event?: ChatEvent } | null = null;
    try { parsed = JSON.parse(payload) as { origin?: string; event?: ChatEvent }; } catch {
      this.log.warn('chat bus: undecodable frame dropped');
      return;
    }
    // Mine. I already emitted it locally, and handling it twice would send two
    // pushes and file two bell rows for one message.
    if (!parsed?.event || parsed.origin === this.nodeId) return;
    this.emitter.emit('chat', parsed.event, { origin: false });
  }

  publish(event: ChatEvent): void {
    /* LOCAL FIRST, AND UNCONDITIONALLY. The node handling the request does the
       work whether or not Redis answers, which is the property that lets this
       be an addition rather than a rewrite. */
    this.emitter.emit('chat', event, { origin: true });
    if (!this.publisher) return;
    void Promise.resolve(this.publisher.publish(CHANNEL, JSON.stringify({ origin: this.nodeId, event })))
      .catch(swallowed('events.chatBus.publish', undefined));
  }

  /** `meta.origin` is true on the node whose request produced the event and
   *  false on the nodes that heard it over Redis — the flag a subscriber uses
   *  to run a side effect once rather than once per replica (5 Sep). */
  subscribe(handler: (event: ChatEvent, meta: { origin: boolean }) => void): () => void {
    this.emitter.on('chat', handler);
    return () => this.emitter.off('chat', handler);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.subscriber) await Promise.resolve(this.subscriber.quit()).catch(swallowed('events.chatBus.quit', undefined));
  }
}
