import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';

/**
 * In-process event bus decoupling domain services (messages, connections) from
 * the transport layer (ChatGateway). Services emit; the gateway broadcasts.
 * In a multi-node deployment, replace/augment with a Redis pub/sub adapter so
 * events fan out across instances (see ARCHITECTURE.md → Scaling).
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

@Injectable()
export class ChatEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(event: ChatEvent): void {
    this.emitter.emit('chat', event);
  }

  subscribe(handler: (event: ChatEvent) => void): () => void {
    this.emitter.on('chat', handler);
    return () => this.emitter.off('chat', handler);
  }
}
