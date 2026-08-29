import { ChatGateway } from './chat.gateway';
import { room } from './chat.events';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A MESSAGE THAT ARRIVES IS A MESSAGE THAT GETS DELIVERED.
 *
 * Written after the owner watched two messages sit on a single tick overnight
 * (10 Aug 2026) while the application was, in every other respect, working.
 * The words had arrived. The receipt had not, and nothing in the system was
 * ever going to produce one.
 *
 * Three separate faults had to line up, and each of them is one line of code,
 * which is exactly why they need a test rather than a comment:
 *
 *   1. Rooms are per-CONNECTION. The client asked to join a conversation once,
 *      from an effect keyed on the conversation id, so every reconnect — a
 *      wifi blip, a redeploy — left an open thread that had joined nothing.
 *      It stayed on screen and silently stopped receiving.
 *   2. The delivered receipt was written only by a live browser answering a
 *      fire-and-forget frame. Offline at that instant meant never.
 *   3. Presence was broadcast to the subject's own room, which is the one
 *      audience for whom the news is useless.
 *
 * These assertions are deliberately about ADDRESSING and CAUSATION — which
 * room, which call — not about socket.io's internals. A refactor is free to
 * change how; it may not change who hears it.
 */
function harness() {
  const joined: string[] = [];
  const emitted: { rooms: string[]; event: string; payload: unknown }[] = [];
  const socketsJoined: { from: string; into: string }[] = [];
  const delivered: string[] = [];

  const client: any = {
    id: 'sock-1',
    handshake: { auth: { token: 't' }, headers: {} },
    join: (r: string | string[]) => { joined.push(...(Array.isArray(r) ? r : [r])); return Promise.resolve(); },
    emit: () => undefined,
    disconnect: () => undefined,
  };

  const server: any = {
    to: (rooms: string | string[]) => ({
      emit: (event: string, payload: unknown) =>
        emitted.push({ rooms: Array.isArray(rooms) ? rooms : [rooms], event, payload }),
    }),
    in: (from: string) => ({
      socketsJoin: (into: string) => socketsJoined.push({ from, into }),
    }),
  };

  const messages: any = {
    conversationIdsFor: () => Promise.resolve(['c1', 'c2']),
    endedDatingIds: () => Promise.resolve(new Set<string>()),
    directIds: (ids: string[]) => Promise.resolve(new Set(ids)),
    membersOf: () => Promise.resolve(new Map()),
    deliverBacklog: (uid: string) => { delivered.push(uid); return Promise.resolve(2); },
    pendingForUser: () => Promise.resolve([]),
  };

  const gateway = new ChatGateway(
    { verifyAccess: () => Promise.resolve({ sub: 'u1', handle: 'somen' }), verifyAccessAndAccount: () => Promise.resolve({ sub: 'u1', handle: 'somen' }), assertAccountLive: async () => undefined } as any,
    { markOnline: () => Promise.resolve(true), markOffline: () => Promise.resolve(true) } as any,
    messages,
    { notifyNewMessage: () => Promise.resolve(), markConversationRead: () => Promise.resolve() } as any,
    { assertCanPostToConversation: () => Promise.resolve(), blockedWith: () => Promise.resolve(new Set<string>()) } as any,
    {} as any,
    { setOpenConversation: () => Promise.resolve() } as any,
    { subscribe: () => undefined, publish: () => undefined } as any,
    { get: () => 3000 } as any,
  );
  (gateway as any).server = server;
  return { gateway, client, joined, emitted, socketsJoined, delivered };
}

/** Wait out the floating promises handleConnection deliberately does not await. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('a message that arrives gets delivered', () => {
  it('puts a reconnecting socket back into every one of its conversation rooms', async () => {
    const h = harness();
    await h.gateway.handleConnection(h.client);

    // The client is not asked to do this and must not have to: a brand-new
    // connection is a fact only the server knows.
    expect(h.joined).toContain(room.user('u1'));
    expect(h.joined).toContain(room.conversation('c1'));
    expect(h.joined).toContain(room.conversation('c2'));
  });

  it('delivers the backlog on connect, so a message sent to someone offline stops being a single tick', async () => {
    const h = harness();
    await h.gateway.handleConnection(h.client);
    await settle();
    expect(h.delivered).toEqual(['u1']);
  });

  it('puts the recipients of a brand-new conversation into its room before broadcasting', async () => {
    const h = harness();
    await (h.gateway as any).handleBusEvent({
      kind: 'message.created',
      conversationId: 'c-new',
      message: { id: 'm1', senderId: 'u1', text: 'hi' },
      recipientIds: ['u2'],
    });

    // A thread that did not exist at connect time is a room nobody could have
    // joined — the first message of an enquiry would otherwise reach no one.
    expect(h.socketsJoined).toContainEqual({ from: room.user('u2'), into: room.conversation('c-new') });
    const broadcast = h.emitted.find((e) => e.event === 'receive_message');
    expect(broadcast?.rooms).toEqual([room.conversation('c-new')]);
  });

  it('tells the people you talk to that you are online, not only yourself', async () => {
    const h = harness();
    await (h.gateway as any).handleBusEvent({ kind: 'presence.changed', userId: 'u1', online: true });

    const presence = h.emitted.find((e) => e.event === 'user_online');
    expect(presence).toBeDefined();
    expect(presence!.rooms).toContain(room.conversation('c1'));
    expect(presence!.rooms).toContain(room.conversation('c2'));
  });

  it('sends the read receipt where the sender can hear it', async () => {
    const h = harness();
    await (h.gateway as any).handleBusEvent({
      kind: 'message.read', conversationId: 'c1', messageId: 'm1', userId: 'u2',
    });

    // The sender is in the conversation room for as long as they are connected
    // (see the first test), which is what makes this address reach them at all.
    const receipt = h.emitted.find((e) => e.event === 'message_read');
    expect(receipt?.rooms).toEqual([room.conversation('c1')]);
  });
});
