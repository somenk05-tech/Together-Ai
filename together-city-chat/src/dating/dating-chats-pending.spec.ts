import { DatingService } from './dating.service';
import { BlockingService } from '../connections/blocking.service';

/**
 * A match belongs on the page named after it.
 *
 * datingChats() required `conversationId: { not: null }`. A mutual like does not
 * open a chat — Connect to Chat does, separately — so someone who had just
 * matched opened Dating Chats and read "No dating chats yet", with their match
 * nowhere on it. The one screen named after their matches was the one screen
 * that denied having any.
 */

const UPDATED = new Date('2026-07-29T12:00:00Z');

function serviceWith(matches: Array<Record<string, unknown>>) {
  const prisma = {
    datingMatch: { findMany: jest.fn(async () => matches) },
    datingProfile: { findUnique: jest.fn(async () => ({ userId: 'them', birthDate: new Date('1995-02-02T00:00:00Z'), extras: null })) },
    user: { findUnique: jest.fn(async () => ({ name: 'Rhea', profileImage: 'photo.jpg' })) },
    compatibilityScore: { findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null) },
  };
  const conversations = {
    summaryFor: jest.fn(async () => ({
      lastMessageAt: '2026-07-29T13:00:00.000Z', lastText: 'hi', lastSenderId: 'them', unread: 2,
    })),
  };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    new BlockingService(prisma as never),
  );
  return { svc, conversations };
}

const match = (over: Record<string, unknown> = {}) => ({
  id: 'm1', userOneId: 'me', userTwoId: 'them', kind: 'romantic', status: 'matched',
  revealByOne: false, revealByTwo: false, conversationId: null, updatedAt: UPDATED, ...over,
});

describe('dating chats include matches that have not been connected yet', () => {
  it('lists a mutual match with no conversation, flagged pending', async () => {
    const { svc } = serviceWith([match()]);
    const out = await svc.datingChats('me') as unknown as Array<{ pending: boolean; conversationId: string | null; otherUserId: string }>;
    expect(out).toHaveLength(1);
    expect(out[0].pending).toBe(true);
    expect(out[0].conversationId).toBeNull();
    expect(out[0].otherUserId).toBe('them');
  });

  it('does not try to summarise a conversation that does not exist', async () => {
    const { svc, conversations } = serviceWith([match()]);
    await svc.datingChats('me');
    expect(conversations.summaryFor).not.toHaveBeenCalled();
  });

  it('sorts a pending match by when the match happened', async () => {
    // Otherwise a brand-new match sorts to the bottom on an empty timestamp.
    const { svc } = serviceWith([match()]);
    const out = await svc.datingChats('me') as unknown as Array<{ lastMessageAt: string; unread: number; lastText: string | null }>;
    expect(out[0].lastMessageAt).toBe(UPDATED.toISOString());
    expect(out[0].unread).toBe(0);
    expect(out[0].lastText).toBeNull();
  });

  it('still returns opened chats, not flagged pending', async () => {
    const { svc, conversations } = serviceWith([match({ conversationId: 'conv-1' })]);
    const out = await svc.datingChats('me') as unknown as Array<{ pending: boolean; conversationId: string | null; unread: number }>;
    expect(out[0].pending).toBe(false);
    expect(out[0].conversationId).toBe('conv-1');
    expect(out[0].unread).toBe(2);
    expect(conversations.summaryFor).toHaveBeenCalledWith('conv-1', 'me');
  });

  it('uses the profile name from the first moment — the same name the match card showed', async () => {
    // Decided 1 Aug: ONE identity, the profile's. The Matches page already
    // shows the name and photos before anyone matches; a pseudonym after
    // matching protected nothing and read as the name changing.
    const { svc } = serviceWith([match()]);
    const out = await svc.datingChats('me') as unknown as Array<{ name: string; photo: string | null }>;
    expect(out[0].name).toBe('Rhea');
    expect(out[0].photo).toBe('photo.jpg');
  });

  it('the name does not depend on reveal flags in either direction', async () => {
    const { svc } = serviceWith([match({ revealByTwo: true })]);
    const out = await svc.datingChats('me') as unknown as Array<{ name: string; photo: string | null }>;
    expect(out[0].name).toBe('Rhea');
    expect(out[0].photo).toBe('photo.jpg');
  });
});
