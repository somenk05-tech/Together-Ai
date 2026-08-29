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
function build(blocked: string[], members: Record<string, string[]>, opts: { groups?: string[]; ended?: string[] } = {}) {
  const left: Array<{ from: string; room: string }> = [];
  const server: any = {
    in: (from: string) => ({ socketsLeave: async (r: string) => { left.push({ from, room: r }); } }),
    to: () => ({ emit: () => undefined }),
  };
  const groups = new Set(opts.groups ?? []);
  const messages: any = {
    conversationIdsFor: async () => Object.keys(members),
    membersOf: async () => new Map(Object.entries(members)),
    directIds: async (ids: string[]) => new Set(ids.filter((id) => !groups.has(id))),
    endedDatingIds: async () => new Set(opts.ended ?? []),
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

  /* A BLOCK IS NOT A WAY OUT OF A ROOM FULL OF OTHER PEOPLE — the sentence
     `connection-permission.service.ts` has carried since the block gate was
     written, and this filter contradicted it. Blocking one member of a group
     took you out of that group's live frames — typing, presence, receipts —
     until the next message re-joined you, which reads as the app quietly
     breaking rather than as a block doing anything. */
  it('does not take you out of a GROUP you share with somebody blocked', async () => {
    const { g } = build(['them'], { c1: ['me', 'them'], g1: ['me', 'them', 'a', 'b'] }, { groups: ['g1'] });
    expect(await (g as any).roomsFor('me')).toEqual(['g1']);
  });

  /* AN UNMATCH HAS TO END CONTACT TOO (fifth audit, 29 Aug). It archived the
     thread, published nothing, and left both sockets in the room — so the two
     of them went on watching each other type and read. This is the half that
     survives a reconnection; the event below is the half that does not wait
     for one. */
  it('leaves out a dating conversation whose match has ended', async () => {
    const { g } = build([], MEMBERS, { ended: ['c1'] });
    expect(await (g as any).roomsFor('me')).toEqual(['c2']);
  });

  it('keeps the list rather than the empty set when the ended-match read fails', async () => {
    const { g } = build([], MEMBERS);
    (g as any).messages.endedDatingIds = async () => { throw new Error('the database is down'); };
    // Fails open on purpose: the archive and the send gate both still hold, so
    // the cost is a stale typing indicator rather than a citizen locked out of
    // their live chats by one failed query.
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

describe('blocking does not take you out of a group, on EITHER half', () => {
  /**
   * `roomsFor` was scoped to DIRECT and the live handler was not (re-audit,
   * 29 Aug), so blocking one member of a group still ejected both people from
   * that group's frames — and the next reconnect silently put them back,
   * because the room list now keeps groups. Two halves of one control
   * disagreeing is worse than either answer on its own.
   */
  it('the live handler leaves the group alone and still empties the direct thread', async () => {
    const { g, left } = build([], { c1: ['me', 'them'], g1: ['me', 'them', 'a'] }, { groups: ['g1'] });
    await (g as any).handleBusEvent({ kind: 'connection.blocked', userIds: ['me', 'them'] });
    expect(left.map((l) => l.room)).toEqual([room.conversation('c1'), room.conversation('c1')]);
  });
});

describe('unmatching somebody you are already in a room with', () => {
  it('takes both of them out of the conversation the match carried', async () => {
    const { g, left } = build([], MEMBERS);
    await (g as any).handleBusEvent({ kind: 'connection.unmatched', userIds: ['me', 'them'], conversationId: 'c1' });
    expect(left).toEqual([
      { from: room.user('me'), room: room.conversation('c1') },
      { from: room.user('them'), room: room.conversation('c1') },
    ]);
  });
});
