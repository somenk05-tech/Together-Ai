/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatGateway } from './chat.gateway';
import { room } from './chat.events';

/**
 * ── "HIDES YOU FROM EACH OTHER EVERYWHERE" (launch audit, 27 Aug) ──
 *
 * Blocking gated SENDING and nothing else, because nothing else asks. Typing
 * indicators, presence, read receipts and reaction frames are broadcast to
 * `room.conversation(id)` and consult no database at all — being in the room is
 * the whole of the permission. So after a block the two people could not write
 * to each other and could still watch each other type, come online, and read
 * their messages, while the block screen said otherwise.
 *
 * Two halves, both here. The room list a socket joins now excludes conversations
 * shared with somebody blocked — that covers every future connection. And the
 * block itself empties the rooms the two already share, because the list is
 * rebuilt on connect and nobody reconnects to make a block take effect.
 */
function build(blocked: string[], members: Record<string, string[]>) {
  const left: Array<{ from: string; room: string }> = [];
  const server: any = {
    in: (from: string) => ({ socketsLeave: async (r: string) => { left.push({ from, room: r }); } }),
    to: () => ({ emit: () => undefined }),
  };
  const messages: any = {
    conversationIdsFor: async () => Object.keys(members),
    membersOf: async () => new Map(Object.entries(members)),
    deliverBacklog: async () => 0,
    pendingForUser: async () => [],
  };
  const permission: any = {
    assertCanPostToConversation: async () => undefined,
    blockedWith: async () => new Set(blocked),
  };
  const g = new ChatGateway(
    {} as never, {} as never, messages, {} as never, permission,
    {} as never, {} as never, {} as never, { get: () => 3000 } as never,
  );
  (g as any).server = server;
  (g as any).logger = { error: () => undefined, log: () => undefined };
  return { g, left };
}

const MEMBERS = { c1: ['me', 'them'], c2: ['me', 'someone-else'] };

describe('the rooms a socket is put into', () => {
  it('leaves out a conversation shared with somebody blocked', async () => {
    const { g } = build(['them'], MEMBERS);
    expect(await (g as any).roomsFor('me')).toEqual(['c2']);
  });

  it('is the whole list when nobody is blocked — the filter is off, not always-on', async () => {
    const { g } = build([], MEMBERS);
    expect(await (g as any).roomsFor('me')).toEqual(['c1', 'c2']);
  });

  it('keeps the list rather than silently emptying it when the block read fails', async () => {
    const { g } = build([], MEMBERS);
    (g as any).permission.blockedWith = async () => { throw new Error('redis is down'); };
    // Fails open, deliberately and loudly — but the block still holds on the
    // gate that refuses the message. Silence is what this must never do.
    expect(await (g as any).roomsFor('me')).toEqual(['c1', 'c2']);
  });
});

describe('blocking somebody you are already in a room with', () => {
  it('takes both of them out of every room they share, at once', async () => {
    const { g, left } = build([], MEMBERS);
    await (g as any).handleBusEvent({ kind: 'connection.blocked', userIds: ['me', 'them'] });
    expect(left).toEqual([
      { from: room.user('me'), room: room.conversation('c1') },
      { from: room.user('them'), room: room.conversation('c1') },
    ]);
  });

  it('leaves the rooms they do not share alone', async () => {
    const { g, left } = build([], MEMBERS);
    await (g as any).handleBusEvent({ kind: 'connection.blocked', userIds: ['me', 'them'] });
    expect(left.map((l) => l.room)).not.toContain(room.conversation('c2'));
  });
});
