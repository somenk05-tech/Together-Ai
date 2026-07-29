import { NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

/**
 * Deleting a chat from the left panel.
 *
 * The rule being pinned: deletion is one citizen's decision about their own
 * panel, never an edit to anyone else's history. The service is exercised
 * directly against a stubbed Prisma, as the other tests in this repo do, because
 * what matters here is which rows are written and which are filtered out.
 */

const T = (iso: string) => new Date(iso);
const CLEARED = T('2026-07-20T10:00:00Z');

type Member = {
  conversationId: string;
  userId: string;
  lastReadAt?: Date | null;
  clearedAt?: Date | null;
  archived?: boolean;
};

function serviceWith(members: Member[], newestMessageAt: Record<string, Date | null> = {}) {
  const updates: Array<{ where: unknown; data: Record<string, unknown> }> = [];

  const prisma = {
    conversationMember: {
      findUnique: jest.fn(async ({ where }: any) => {
        const { conversationId, userId } = where.conversationId_userId;
        return members.find((m) => m.conversationId === conversationId && m.userId === userId) ?? null;
      }),
      findMany: jest.fn(async ({ where }: any) =>
        members
          .filter((m) => m.userId === where.userId && (m.archived ?? false) === where.archived)
          .map((m) => ({
            ...m,
            conversation: {
              id: m.conversationId,
              type: 'DIRECT',
              title: null,
              updatedAt: T('2026-07-25T00:00:00Z'),
              members: [{ userId: m.userId, user: { id: m.userId, name: 'Me', handle: 'me', profileImage: null } }],
              messages: newestMessageAt[m.conversationId]
                ? [{ id: 'msg', createdAt: newestMessageAt[m.conversationId], body: 'hi', senderId: 'other' }]
                : [],
            },
          })),
      ),
      updateMany: jest.fn(async (args: any) => {
        updates.push({ where: args.where, data: args.data });
        return { count: 1 };
      }),
    },
    message: { count: jest.fn(async () => 0) },
    datingMatch: { findMany: jest.fn(async () => []) },
  };

  const svc = new ConversationsService(prisma as never, {} as never);
  return { svc, prisma, updates };
}

describe('deleting a chat from the left panel', () => {
  it('records the moment it was cleared rather than deleting anything', async () => {
    const { svc, updates } = serviceWith([{ conversationId: 'c1', userId: 'a' }]);

    await expect(svc.clearForUser('a', 'c1')).resolves.toEqual({ ok: true });

    expect(updates).toHaveLength(1);
    expect(updates[0].where).toEqual({ conversationId: 'c1', userId: 'a' });
    expect(updates[0].data.clearedAt).toBeInstanceOf(Date);
    // Crucially: no message or conversation row is touched.
    expect(updates[0].where).not.toHaveProperty('id');
  });

  it('lifts the chat out of the archive as it goes', async () => {
    // Deleting a chat that was archived should not leave it in the archive.
    const { svc, updates } = serviceWith([{ conversationId: 'c1', userId: 'a', archived: true }]);
    await svc.clearForUser('a', 'c1');
    expect(updates[0].data.archived).toBe(false);
  });

  it('answers 404 — not 403 — to someone who is not in the conversation', async () => {
    // 403 would confirm the conversation exists to anyone holding an id.
    const { svc, updates } = serviceWith([{ conversationId: 'c1', userId: 'a' }]);
    await expect(svc.clearForUser('intruder', 'c1')).rejects.toBeInstanceOf(NotFoundException);
    expect(updates).toHaveLength(0); // and nothing was written
  });

  it('does not let a non-participant archive someone else’s chat either', async () => {
    const { svc, updates } = serviceWith([{ conversationId: 'c1', userId: 'a' }]);
    await expect(svc.setArchived('intruder', 'c1', true)).rejects.toBeInstanceOf(NotFoundException);
    expect(updates).toHaveLength(0);
  });

  it('archives and unarchives reversibly', async () => {
    const { svc, updates } = serviceWith([{ conversationId: 'c1', userId: 'a' }]);
    await svc.setArchived('a', 'c1', true);
    await svc.setArchived('a', 'c1', false);
    expect(updates.map((u) => u.data.archived)).toEqual([true, false]);
  });
});

describe('what a cleared chat looks like afterwards', () => {
  it('stays out of the panel while nothing new has been said', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'a', clearedAt: CLEARED, archived: false }],
      { c1: T('2026-07-19T09:00:00Z') }, // newest message predates the clear
    );
    await expect(svc.listForUser('a')).resolves.toEqual([]);
  });

  it('stays out of the panel when it had no messages at all', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'a', clearedAt: CLEARED, archived: false }],
      { c1: null },
    );
    await expect(svc.listForUser('a')).resolves.toEqual([]);
  });

  it('comes back the moment the other person writes again', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'a', clearedAt: CLEARED, archived: false }],
      { c1: T('2026-07-21T08:00:00Z') }, // after the clear
    );
    const list = await svc.listForUser('a');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('c1');
  });

  it('is unaffected for a citizen who never cleared it', async () => {
    const { svc } = serviceWith(
      [{ conversationId: 'c1', userId: 'b', archived: false }],
      { c1: T('2026-07-19T09:00:00Z') },
    );
    await expect(svc.listForUser('b')).resolves.toHaveLength(1);
  });

  it('counts unread from the clear, not from the start of time', async () => {
    // Otherwise a chat that returns claims every message before the clear is unread.
    const { svc, prisma } = serviceWith(
      [{ conversationId: 'c1', userId: 'a', clearedAt: CLEARED, lastReadAt: T('2026-07-01T00:00:00Z'), archived: false }],
      { c1: T('2026-07-21T08:00:00Z') },
    );
    await svc.listForUser('a');
    const where = (prisma.message.count as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gt: CLEARED }); // the clear is later than lastReadAt
  });

  it('still honours a lastReadAt that is later than the clear', async () => {
    const readAfter = T('2026-07-22T00:00:00Z');
    const { svc, prisma } = serviceWith(
      [{ conversationId: 'c1', userId: 'a', clearedAt: CLEARED, lastReadAt: readAfter, archived: false }],
      { c1: T('2026-07-23T08:00:00Z') },
    );
    await svc.listForUser('a');
    const where = (prisma.message.count as jest.Mock).mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ gt: readAfter });
  });
});
