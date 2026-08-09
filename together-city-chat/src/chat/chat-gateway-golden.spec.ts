/**
 * Golden master — the real-time gateway's decisions over fake sockets: who a
 * bus event reaches, what an unauthenticated socket is told, what opening a
 * conversation clears, and the per-frame re-authorisation of call signalling.
 */
import { ChatGateway } from './chat.gateway';
import { WS } from './chat.events';

interface Emit { room?: string; event: string; payload: unknown }

function build() {
  const g = Object.create(ChatGateway.prototype) as ChatGateway;
  const out: Emit[] = [];
  const calls: string[] = [];
  (g as any).server = {
    to: (room: string) => ({ emit: (event: string, payload: unknown) => out.push({ room, event, payload }) }),
    // A conversation created after somebody connected is a room they could not
    // have joined; the gateway pulls their sockets in by user room before it
    // broadcasts. Recorded here so the golden master shows it happening.
    in: (from: string) => ({ socketsJoin: (into: string) => out.push({ room: from, event: 'sockets_join', payload: into }) }),
  };
  (g as any).logger = { log: () => undefined, warn: () => undefined };
  (g as any).tokens = { verifyAccess: async (t: string) => { if (t !== 'good') throw new Error('bad'); return { sub: 'u1', handle: 'asha' }; } };
  (g as any).presence = { markOnline: async () => true, markOffline: async () => true, heartbeat: async () => undefined };
  (g as any).messages = {
    pendingForUser: async () => [{ id: 'm-offline' }],
    // The two the connection handshake now depends on. A socket that cannot
    // learn its rooms is a socket that stops receiving after a reconnect, and
    // a backlog nobody delivers is a message stuck on one tick — see
    // a-message-gets-delivered.spec.ts, which owns those assertions.
    conversationIdsFor: async (...a: unknown[]) => { calls.push('rooms-for:' + JSON.stringify(a)); return ['c1']; },
    deliverBacklog: async (...a: unknown[]) => { calls.push('backlog-delivered:' + JSON.stringify(a)); return 1; },
    send: async () => ({ id: 'm1' }),
    markDelivered: async (...a: unknown[]) => calls.push('delivered:' + JSON.stringify(a)),
    markRead: async (...a: unknown[]) => calls.push('read:' + JSON.stringify(a)),
  };
  (g as any).notifications = {
    markConversationRead: async (...a: unknown[]) => calls.push('bell-cleared:' + JSON.stringify(a)),
    notifyNewMessage: async (a: unknown) => calls.push('notify:' + JSON.stringify(a)),
  };
  (g as any).permission = { assertCanPostToConversation: async (...a: unknown[]) => calls.push('gate:' + JSON.stringify(a)) };
  (g as any).calls = { assertMaySignal: async (...a: unknown[]) => calls.push('may-signal:' + JSON.stringify(a)) };
  (g as any).redis = { setOpenConversation: async (...a: unknown[]) => calls.push('open:' + JSON.stringify(a)) };
  (g as any).bus = { publish: (e: unknown) => calls.push('bus:' + JSON.stringify(e)), subscribe: () => undefined };
  (g as any).config = { get: () => 3000 };
  return { g, out, calls };
}

function fakeClient(token: string) {
  const clientOut: Emit[] = [];
  const joined: string[] = [];
  let disconnected: boolean | null = null;
  const client = {
    id: 's1',
    handshake: { auth: { token }, headers: {} },
    join: async (r: string) => { joined.push(r); },
    leave: async () => undefined,
    emit: (event: string, payload: unknown) => clientOut.push({ event, payload }),
    to: (room: string) => ({ emit: (event: string, payload: unknown) => clientOut.push({ room, event, payload }) }),
    disconnect: (b: boolean) => { disconnected = b; },
    typingTimers: new Map(),
  };
  return { client: client as never, clientOut, joined, state: () => ({ disconnected }) };
}

describe('chat gateway golden master', () => {
  it('a good token joins the personal room, flips presence, and syncs offline messages', async () => {
    const { g, calls } = build();
    const { client, clientOut, joined } = fakeClient('good');
    await g.handleConnection(client);
    expect({ joined, clientOut, calls }).toMatchSnapshot();
  });

  it('a bad token is told once and disconnected — never half-connected', async () => {
    const { g } = build();
    const { client, clientOut, state } = fakeClient('evil');
    await g.handleConnection(client);
    expect({ clientOut, ...state() }).toMatchSnapshot();
  });

  it('joining a conversation is gated, remembered, and clears its bell entry', async () => {
    const { g, calls } = build();
    const { client, joined } = fakeClient('good');
    (client as { userId?: string }).userId = 'u1';
    await g.onJoin(client, { conversationId: '11111111-1111-4111-8111-111111111111' });
    expect({ joined, calls }).toMatchSnapshot();
  });

  it('message.created fans out: the room hears the message, each recipient gets the badge push, the bell is filed', async () => {
    const { g, out, calls } = build();
    await (g as any).handleBusEvent({
      kind: 'message.created', conversationId: 'c1', recipientIds: ['u2', 'u3'],
      message: { id: 'm1', senderId: 'u1', body: 'chai at four?' },
    });
    expect({ out, calls }).toMatchSnapshot();
  });

  it('previews: text is quoted, media is named, the unknown stays generic', async () => {
    const { g, out } = build();
    for (const message of [
      { id: 'm', senderId: 'u1', body: '  ', messageType: 'IMAGE' },
      { id: 'm', senderId: 'u1', messageType: 'VOICE' },
      { id: 'm', senderId: 'u1', messageType: 'HOLOGRAM' },
    ]) {
      await (g as any).handleBusEvent({ kind: 'message.created', conversationId: 'c1', recipientIds: ['u2'], message });
    }
    expect(out.filter((e) => e.event === WS.CHAT_NOTIFICATION).map((e) => (e.payload as { preview: string }).preview)).toMatchSnapshot();
  });

  it('call signalling re-authorises EVERY frame before relaying, and relays opaque', async () => {
    const { g, out, calls } = build();
    const { client } = fakeClient('good');
    (client as { userId?: string }).userId = 'u1';
    await g.onCallSignal(client, { callId: '22222222-2222-4222-8222-222222222222', to: '33333333-3333-4333-8333-333333333333', kind: 'offer', payload: { sdp: 'opaque' } });
    expect({ out, calls }).toMatchSnapshot();
  });
});
