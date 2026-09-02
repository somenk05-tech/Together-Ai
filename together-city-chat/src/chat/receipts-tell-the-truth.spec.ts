import { MessagesService } from '../messages/messages.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * ONLY A TRANSITION EARNS A RECEIPT.
 *
 * The read-receipt storm (13 Aug audit): an open thread re-acked messages it
 * had already read, markRead re-published a receipt for every id anyway, the
 * app-wide listener refetched the thread on every receipt, and the refetch
 * re-acked. The server-side dampener is this rule — a receipt is published
 * only for a row that actually moved — held here in both directions, plus the
 * tombstone rule serialize carries for the same commit.
 */
function build(statuses: Array<{ messageId: string }>) {
  const published: unknown[] = [];
  const prisma: any = {
    messageStatus: {
      findMany: jest.fn(async () => statuses),
      updateMany: jest.fn(async () => ({ count: statuses.length })),
    },
    message: {
      findMany: jest.fn(async () =>
        statuses.map((s) => ({ id: s.messageId, conversationId: 'c1', createdAt: new Date('2026-08-13T10:00:00Z') }))),
    },
    conversationMember: { updateMany: jest.fn(async () => ({ count: 1 })) },
  };
  const svc = new MessagesService(
    prisma,
    { assertCanPostToConversation: async () => undefined } as any,
    { publish: (e: unknown) => published.push(e) } as any,
    { get: () => undefined } as any,
    // ChatMediaGuard. This file is about read/delivered receipts, which never
    // reach the send path and never consult it — a stub that approves keeps
    // the file about the thing it is about.
    { screen: async () => ({ ok: true }) } as any,
    // StorageProvider. The vault is reached only by the snap routes, which
    // this file never walks.
    {} as any,
  );
  return { svc, prisma, published };
}

describe('only a transition earns a receipt', () => {
  it('publishes nothing — and writes nothing — when every status already progressed', async () => {
    const { svc, prisma, published } = build([]);
    await svc.markRead('u2', ['m1', 'm2']);
    await svc.markDelivered('u2', ['m1', 'm2']);
    expect(published).toEqual([]);
    expect(prisma.messageStatus.updateMany).not.toHaveBeenCalled();
    expect(prisma.conversationMember.updateMany).not.toHaveBeenCalled();
  });

  it('publishes one read receipt per row that actually moved, and only those', async () => {
    const { svc, published } = build([{ messageId: 'm1' }]);
    await svc.markRead('u2', ['m1', 'm2']);
    expect(published).toEqual([
      { kind: 'message.read', conversationId: 'c1', messageId: 'm1', userId: 'u2' },
    ]);
  });

  it('a deleted message serialises with no media and no share card', () => {
    const { svc } = build([]);
    const out = (svc as any).serialize({
      id: 'm1', conversationId: 'c1', senderId: 'u1', text: null, messageType: 'IMAGE',
      shareJson: '{"kind":"movie","title":"x"}', deleted: true, createdAt: new Date('2026-08-13T10:00:00Z'),
      attachments: [{ id: 'a1', url: 'https://cdn.example/uploads/u1/x.jpg', mimeType: 'image/jpeg' }],
    });
    expect(out.body).toBe('');
    expect(out.media).toEqual([]);
    expect(out.share).toBeNull();
  });
});
