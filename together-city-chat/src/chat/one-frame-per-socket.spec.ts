/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-var-requires */
import { ChatGateway } from './chat.gateway';
import { ChatEventBus } from '../shared/events/chat-events';
import { room } from './chat.events';
import { EventEmitter } from 'events';

/**
 * ── ONE FRAME PER SOCKET, AND NOTHING BEFORE THE HANDSHAKE (5 Sep) ──────────
 *
 * Two fan-out layers crossed nodes: the app bus reached every replica, and
 * each replica's `server.to(room).emit` was broadcast again by the socket.io
 * Redis adapter — N replicas, N copies of every message on every socket, N
 * bell rows, N pushes. Railway overlaps two instances on every deploy.
 *
 * And `handleConnection` is async: a frame arriving while the token was
 * still being verified found `client.userId` undefined, and onDelivered /
 * onRead / onSend passed that straight through — a receipt for nobody that
 * flipped every recipient's status, from a socket that had not proved who it
 * was. Only the heartbeat handler dropped the frame.
 */
function harness() {
  const local: { rooms: string; event: string }[] = [];
  const global: { rooms: string; event: string }[] = [];
  const notified: unknown[] = [];
  const server: any = {
    to: (rooms: string) => ({ emit: (event: string) => global.push({ rooms, event }) }),
    in: (from: string) => ({ socketsJoin: () => global.push({ rooms: from, event: 'join' }) }),
    local: {
      to: (rooms: string) => ({ emit: (event: string) => local.push({ rooms, event }) }),
      in: (from: string) => ({ socketsJoin: () => local.push({ rooms: from, event: 'join' }), socketsLeave: () => local.push({ rooms: from, event: 'leave' }) }),
    },
  };
  const g: any = Object.create(ChatGateway.prototype);
  g.server = server;
  g.logger = { log: () => undefined, warn: () => undefined, error: () => undefined };
  g.notifications = { notifyNewMessage: async (a: unknown) => { notified.push(a); } };
  g.messages = {
    markDelivered: async (...a: unknown[]) => { calls.push(['delivered', ...a]); },
    markRead: async (...a: unknown[]) => { calls.push(['read', ...a]); },
    send: async (...a: unknown[]) => { calls.push(['send', ...a]); return { id: 'm1' }; },
  };
  const calls: unknown[][] = [];
  return { g, local, global, notified, calls };
}
const created = { kind: 'message.created', conversationId: 'c1', recipientIds: ['u2'], message: { id: 'm1', senderId: 'u1', body: 'hi' } } as any;

describe('a bus event is delivered to this node’s sockets only', () => {
  it('emits through server.local, never through the adapter-broadcasting server', async () => {
    const h = harness();
    await h.g.handleBusEvent(created, true);
    expect(h.global).toEqual([]);
    expect(h.local.map((e) => e.event)).toEqual(['join', 'receive_message', 'chat_notification']);
  });
  it('the bell row and the push are filed on the origin node only', async () => {
    const h = harness();
    await h.g.handleBusEvent(created, true);
    await h.g.handleBusEvent(created, false);
    expect(h.notified).toHaveLength(1);
  });
  it('a replica that heard the event over Redis still delivers it to its own sockets', async () => {
    const h = harness();
    await h.g.handleBusEvent(created, false);
    expect(h.local.some((e) => e.event === 'receive_message' && e.rooms === room.conversation('c1'))).toBe(true);
  });
});

describe('the bus says which node the event came from', () => {
  it('a local publish is origin:true; a frame from another node is origin:false; my own frame is dropped', () => {
    const bus: any = Object.create(ChatEventBus.prototype);
    bus.emitter = new EventEmitter();
    bus.nodeId = 'me';
    bus.log = { warn: () => undefined };
    const seen: Array<[string, boolean]> = [];
    bus.subscribe((e: any, meta: { origin: boolean }) => seen.push([e.kind, meta.origin]));
    bus.publish({ kind: 'presence.changed', userId: 'u1', online: true });
    bus.receive('chat:events', JSON.stringify({ origin: 'other', event: { kind: 'message.read' } }));
    bus.receive('chat:events', JSON.stringify({ origin: 'me', event: { kind: 'message.read' } }));
    expect(seen).toEqual([['presence.changed', true], ['message.read', false]]);
  });
});

describe('nothing before the handshake', () => {
  const unauthed: any = { rooms: new Set(), emit: () => undefined, handshake: { auth: {} } };
  it.each([
    ['onDelivered', { messageIds: ['m1'] }],
    ['onRead', { messageIds: ['m1'] }],
    ['onSend', { conversationId: 'c1', body: 'hi', clientId: 'x' }],
    ['onJoin', { conversationId: 'c1' }],
    ['onCallSignal', { to: 'u2', callId: 'k', type: 'offer', payload: {} }],
  ])('%s drops the frame from a socket whose auth has not finished', async (handler, body) => {
    const h = harness();
    await h.g[handler](unauthed, body);
    expect(h.calls).toEqual([]);
  });
});
