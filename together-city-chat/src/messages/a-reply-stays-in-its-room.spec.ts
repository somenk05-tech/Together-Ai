import { BadRequestException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * ── A REPLY STAYS IN ITS ROOM (3 Sep audit) ─────────────────────────────────
 *
 * `replyToMessageId` went from the request body into the row with nothing
 * checking it. `messageInclude` hydrates `replyTo`; `serialize` hands back its
 * body and its real senderId. So this was a read primitive for any message in
 * the database:
 *
 *   POST /messages { conversationId: <a room I am in>, body: 'x',
 *                    replyToMessageId: <an id from a room I am not in> }
 *
 * and the 201, the receive_message broadcast and every later page of that
 * thread carried the quoted message's plaintext — permanently, because it is
 * persisted, and to the other participant as well.
 *
 * The gate is a 400 for BOTH misses. "Not in this conversation" is all either
 * party is owed; separating "does not exist" from "is somewhere else" is
 * itself a disclosure about a room the caller cannot see.
 */
function serviceWith(quoted: { conversationId: string } | null) {
  const created = { calls: 0 };
  const prisma = {
    message: {
      findUnique: jest.fn(async () => quoted),
      create: jest.fn(async () => {
        created.calls += 1;
        return {
          id: 'm1', conversationId: 'c-mine', senderId: 'me', text: 'x',
          messageType: 'TEXT', createdAt: new Date(), deleted: false,
          attachments: [], statuses: [], replyTo: null, sender: null,
          conversation: { anonymousTrust: null },
        };
      }),
    },
    conversationMember: { findMany: jest.fn(async () => []) },
    conversation: { update: jest.fn(async () => ({})) },
  };
  const svc = new MessagesService(
    prisma as never,
    { assertCanPostToConversation: jest.fn(async () => undefined) } as never,
    { publish: jest.fn() } as never,
    { get: jest.fn(() => '') } as never,
    {} as never,
    {} as never,
  );
  return { svc, prisma, created };
}

describe('quoting a message you were never shown', () => {
  it('is refused when the quoted message lives in another conversation', async () => {
    const { svc, created } = serviceWith({ conversationId: 'c-theirs' });
    await expect(
      svc.send('me', { conversationId: 'c-mine', body: 'x', replyToMessageId: 'm-elsewhere' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    // And nothing is written: the leak was permanent because the row persisted.
    expect(created.calls).toBe(0);
  });

  it('is refused, identically, when the id does not exist at all', async () => {
    const { svc } = serviceWith(null);
    await expect(
      svc.send('me', { conversationId: 'c-mine', body: 'x', replyToMessageId: 'm-nowhere' } as never),
    ).rejects.toThrow(/only reply to a message in this conversation/);
  });

  it('still allows a reply inside the same conversation', async () => {
    const { svc, created } = serviceWith({ conversationId: 'c-mine' });
    await svc.send('me', { conversationId: 'c-mine', body: 'x', replyToMessageId: 'm-here' } as never);
    expect(created.calls).toBe(1);
  });

  it('does not ask at all when nothing is being quoted', async () => {
    const { svc, prisma, created } = serviceWith(null);
    await svc.send('me', { conversationId: 'c-mine', body: 'x' } as never);
    expect(prisma.message.findUnique).not.toHaveBeenCalled();
    expect(created.calls).toBe(1);
  });
});
