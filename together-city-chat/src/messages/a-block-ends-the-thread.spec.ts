/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { MessagesService } from './messages.service';

/**
 * ── A BLOCK ENDS THE THREAD, NOT JUST THE NEXT MESSAGE (blocker 05) ──────────
 *
 * Blocking severed sending and nothing else. Seeing a message was gated on
 * conversation MEMBERSHIP, which a block never removes — so a blocked person
 * could still react to every message you wrote, pin one of their own as a
 * banner, and edit anything they sent in the last fifteen minutes into new
 * text that broadcasts to the room. The screen said "hides you from each other
 * everywhere".
 *
 * The fix routes react / pin / edit through the SAME gate as send
 * (assertCanPostToConversation), so a refusal there is a refusal here. These
 * call the methods with a permission stub that throws — as the real gate does
 * once a block exists — and assert nothing was written or broadcast.
 */
function build(gateThrows: boolean) {
  const published: unknown[] = [];
  const prisma: any = {
    message: {
      findFirst: jest.fn(async () => ({ id: 'm1', conversationId: 'c1' })),  // assertCanSeeMessage
      findUnique: jest.fn(async () => ({ id: 'm1', conversationId: 'c1', senderId: 'me', deleted: false, createdAt: new Date(), reactionsJson: null })),
      update: jest.fn(async () => ({ id: 'm1' })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const permission = {
    assertCanPostToConversation: jest.fn(async () => {
      if (gateThrows) throw new ForbiddenException('This conversation has ended.');
    }),
  };
  const svc = new MessagesService(
    prisma, permission as any,
    { publish: (e: unknown) => { published.push(e); } } as any,
    { get: () => 900 } as any,
    { screen: async () => ({ ok: true }) } as any,
    {} as any,   // StorageProvider — the snap routes only, and a block reaches none of them.
  );
  return { svc, prisma, permission, published };
}

describe('a block ends the thread', () => {
  it('a reaction is refused, and nothing is written or broadcast', async () => {
    const { svc, prisma, published } = build(true);
    await expect(svc.setReaction('me', 'm1', '👍')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('a pin is refused, and nothing is written or broadcast', async () => {
    const { svc, prisma, published } = build(true);
    await expect(svc.setPinned('me', 'm1', true)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('an edit is refused — even of your own message, inside the window', async () => {
    const { svc, prisma, published } = build(true);
    await expect(svc.edit('me', 'm1', { text: 'new text' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(published).toHaveLength(0);
  });

  it('all three still work when the gate allows it — the door is closed, not bricked up', async () => {
    const { svc, permission } = build(false);
    await expect(svc.setReaction('me', 'm1', '👍')).resolves.toBeDefined();
    await expect(svc.setPinned('me', 'm1', true)).resolves.toBeDefined();
    await expect(svc.edit('me', 'm1', { text: 'ok' } as any)).resolves.toBeDefined();
    // Each of the three consulted the gate — the proof it is actually wired.
    expect(permission.assertCanPostToConversation.mock.calls.length).toBe(3);
  });
});
