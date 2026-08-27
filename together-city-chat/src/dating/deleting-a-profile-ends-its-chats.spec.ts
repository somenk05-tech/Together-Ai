/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── DELETING A PROFILE ENDS ITS CHATS, IT DOES NOT ORPHAN THEM (blocker 02) ──
 *
 * deleteProfile did datingMatch.deleteMany — including the matched rows that
 * had a conversation. That row is the only thing keeping an anonymous dating
 * chat out of the main Chats list (datingConversationIds reads it) and the only
 * thing the message gate consults (assertMatchStillStands reads its status).
 * Deleting it moved the thread into both people's ordinary Chats and left it
 * writable forever — "delete my dating profile" did the opposite of end contact.
 *
 * Now a match WITH a conversation is ENDED (archived, row kept as 'passed') and
 * one with none is deleted. This calls deleteProfile and asserts exactly that.
 */
function build() {
  const archived: string[] = [];
  const updated: Array<{ id: string; data: any }> = [];
  const deletedMatchIds: string[] = [];
  const prisma: any = {
    datingProfile: {
      findUnique: jest.fn(async () => ({ extras: null })),
      delete: jest.fn(async () => ({})),
    },
    datingMatch: {
      findMany: jest.fn(async () => [
        { id: 'chatted', conversationId: 'c1' },   // has a chat → end it
        { id: 'pending', conversationId: null },    // no chat → delete it
      ]),
      update: jest.fn(async ({ where, data }: any) => { updated.push({ id: where.id, data }); return {}; }),
      delete: jest.fn(async ({ where }: any) => { deletedMatchIds.push(where.id); return {}; }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    compatibilityScore: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    datingPhotoReview: { deleteMany: jest.fn(async () => ({ count: 0 })) },
  };
  const conversations = { archiveForAll: jest.fn(async (id: string) => { archived.push(id); }) };
  const storage = { deleteHealthObject: jest.fn(async () => undefined) };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    storage as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  return { svc, prisma, archived, updated, deletedMatchIds };
}

describe('deleting a profile ends its chats', () => {
  it('archives the conversation and keeps the match as an ended row, never deletes it', async () => {
    const { svc, prisma, archived, updated, deletedMatchIds } = build();
    await svc.deleteProfile('me');
    expect(archived).toEqual(['c1']);
    // The chatted match is ended, not deleted…
    expect(deletedMatchIds).not.toContain('chatted');
    const ended = updated.find((u) => u.id === 'chatted');
    expect(ended?.data.status).toBe('passed');
    expect(ended?.data.likedByOne).toBe(false);
    expect(ended?.data.revealByOne).toBe(false);
    // …and the whole-table deleteMany of matches is gone.
    expect(prisma.datingMatch.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a pending match that has no conversation to orphan', async () => {
    const { svc, deletedMatchIds, archived } = build();
    await svc.deleteProfile('me');
    expect(deletedMatchIds).toEqual(['pending']);
    expect(archived).not.toContain('pending');
  });

  it('still deletes the profile row itself', async () => {
    const { svc, prisma } = build();
    const out = await svc.deleteProfile('me');
    expect(prisma.datingProfile.delete).toHaveBeenCalledWith({ where: { userId: 'me' } });
    expect(out).toEqual({ ok: true, deleted: true });
  });
});
