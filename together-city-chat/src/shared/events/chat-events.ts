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
  | { kind: 'presence.changed'; userId: string; online: boolean };

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
