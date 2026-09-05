/* eslint-disable @typescript-eslint/no-explicit-any */
import { ChatGateway } from './chat.gateway';
import { room } from './chat.events';
import { ConversationsService } from '../conversations/conversations.service';

/**
 * ── A REMOVED MEMBER LEAVES THE ROOM (launch gate, third reading, 4 Sep) ────
 *
 * `removeMember` and `leaveConversation` deleted the membership row and
 * published nothing. REST was gated (`assertMember`), but `message.created`
 * emits to `room.conversation(id)`, the room list is rebuilt only on connect,
 * and the gateway evicted sockets only for a block or an unmatch — so a
 * person removed from a group kept receiving every message it sent, in
 * full, for as long as their tab stayed open. Both writes now publish
 * `member.removed`, and the gateway takes that one person out of that one
 * room.
 */

function gateway() {
  const left: Array<{ from: string; room: string }> = [];
  const server: any = {
    in: (from: string) => ({ socketsLeave: async (r: string) => { left.push({ from, room: r }); } }),
    to: () => ({ emit: () => undefined }),
  };
  const g = new ChatGateway(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, { get: () => 3000 } as never,
  );
  (g as any).server = server;
  (g as any).logger = { error: () => undefined, log: () => undefined };
  return { g, left };
}

function conversations() {
  const published: any[] = [];
  const members = [
    { userId: 'owner', role: 'OWNER', joinedAt: new Date('2026-01-01') },
    { userId: 'admin', role: 'ADMIN', joinedAt: new Date('2026-02-01') },
    { userId: 'them', role: 'MEMBER', joinedAt: new Date('2026-03-01') },
  ];
  const prisma: any = {
    conversation: { findUnique: async () => ({ id: 'g1', type: 'GROUP', members }) },
    conversationMember: {
      deleteMany: async () => ({ count: 1 }),
      updateMany: async () => ({ count: 1 }),
    },
  };
  const svc: any = new ConversationsService(prisma, {} as never, { publish: (e: any) => published.push(e) } as never);
  svc.assertGroupAdmin = async () => ({ convo: { id: 'g1', type: 'GROUP', members }, me: members[0] });
  return { svc, published };
}

describe('a removed member leaves the room', () => {
  it('removing somebody publishes member.removed for them', async () => {
    const { svc, published } = conversations();
    await svc.removeMember('owner', 'g1', 'them');
    expect(published).toEqual([{ kind: 'member.removed', conversationId: 'g1', userId: 'them' }]);
  });

  it('leaving publishes it for yourself', async () => {
    const { svc, published } = conversations();
    await svc.leaveConversation('them', 'g1');
    expect(published).toEqual([{ kind: 'member.removed', conversationId: 'g1', userId: 'them' }]);
  });

  it('the gateway takes that one person out of that one room, and nobody else', async () => {
    const { g, left } = gateway();
    await (g as any).handleBusEvent({ kind: 'member.removed', conversationId: 'g1', userId: 'them' });
    expect(left).toEqual([{ from: room.user('them'), room: room.conversation('g1') }]);
  });

  it('a bus that is not there costs a frame, not the write', async () => {
    const prisma: any = {
      conversation: { findUnique: async () => ({ id: 'g1', type: 'GROUP', members: [{ userId: 'them', role: 'MEMBER', joinedAt: new Date() }, { userId: 'o', role: 'OWNER', joinedAt: new Date() }] }) },
      conversationMember: { deleteMany: async () => ({ count: 1 }), updateMany: async () => ({ count: 1 }) },
    };
    const svc = new ConversationsService(prisma, {} as never);
    await expect(svc.leaveConversation('them', 'g1')).resolves.toEqual({ ok: true });
  });
});
