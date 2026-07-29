import { DatingService } from './dating.service';

/**
 * A match must not disappear.
 *
 * stack() used to skip anyone whose match was `status: 'matched'` with a bare
 * `continue`. Since a mutual like does NOT open a conversation — that is a
 * separate Connect to Chat step — the person then existed nowhere the citizen
 * could reach: gone from Curated Matches, and not yet in Dating Chats. The
 * notification even said "open Dating to say hi" and linked to the page that had
 * just dropped them.
 */

const BIRTH = new Date('1996-04-12T00:00:00Z');

function profile(userId: string, over: Record<string, unknown> = {}) {
  return {
    userId, birthDate: BIRTH, gender: 'female', seeking: 'any', visible: true,
    moderation: 'approved', bio: 'Hello there', interests: 'Fitness,Movies', extras: null,
    user: { id: userId, handle: `@${userId}`, name: userId, profileImage: null },
    ...over,
  };
}

function serviceWith(candidates: Array<Record<string, unknown>>, states: Array<Record<string, unknown>>) {
  const prisma = {
    datingProfile: {
      findUnique: jest.fn(async () => profile('me', { gender: 'male', seeking: 'any' })),
      findMany: jest.fn(async () => candidates),
    },
    datingMatch: {
      findFirst: jest.fn(async () => null),   // not engaged in a chat
      findMany: jest.fn(async () => states),
    },
    connection: { findMany: jest.fn(async () => []) },
    block: { findMany: jest.fn(async () => []) },
    follow: { findMany: jest.fn(async () => []) },
  };
  const svc = new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
  );
  return { svc, prisma };
}

const matchedState = (otherId: string, over: Record<string, unknown> = {}) => ({
  id: `m-${otherId}`, userOneId: 'me', userTwoId: otherId, kind: 'romantic',
  status: 'matched', likedByOne: true, likedByTwo: true,
  passedByOne: false, passedByTwo: false, conversationId: null, ...over,
});

describe('curated stack keeps mutually-liked people', () => {
  it('returns a matched person instead of dropping them', async () => {
    const { svc } = serviceWith([profile('rhea')], [matchedState('rhea')]);
    const res = await svc.stack('me', 'romantic') as unknown as {
      matched: Array<{ user: { id: string }; matched: boolean; chatLocked: boolean; conversationId: string | null }>;
      top: unknown; totalCandidates: number;
    };

    expect(res.matched).toHaveLength(1);
    expect(res.matched[0].user.id).toBe('rhea');
    expect(res.matched[0].matched).toBe(true);
  });

  it('marks the chat locked until a conversation is actually opened', async () => {
    // A mutual like does not create the conversation — Connect to Chat does.
    const { svc } = serviceWith([profile('rhea')], [matchedState('rhea')]);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<{ chatLocked: boolean; conversationId: string | null }> };
    expect(res.matched[0].chatLocked).toBe(true);
    expect(res.matched[0].conversationId).toBeNull();
  });

  it('reports the conversation once it exists, so the card can open it', async () => {
    const { svc } = serviceWith([profile('rhea')], [matchedState('rhea', { conversationId: 'conv-1' })]);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<{ chatLocked: boolean; conversationId: string | null }> };
    expect(res.matched[0].conversationId).toBe('conv-1');
    expect(res.matched[0].chatLocked).toBe(false);
  });

  it('keeps a match even when they no longer pass discovery filters', async () => {
    // Editing your seeking preference after matching must not silently delete
    // an existing match from the page.
    const { svc } = serviceWith(
      [profile('rhea', { gender: 'female', seeking: 'female' })], // no longer mutually seeking
      [matchedState('rhea')],
    );
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<{ user: { id: string } }> };
    expect(res.matched.map((m) => m.user.id)).toEqual(['rhea']);
  });

  it('keeps matches out of the discovery pool and its histogram', async () => {
    // They are already chosen — they should not still read as a candidate.
    const { svc } = serviceWith(
      [profile('rhea'), profile('anita')],
      [matchedState('rhea')],
    );
    const res = await svc.stack('me', 'romantic') as unknown as {
      matched: Array<{ user: { id: string } }>;
      top: { user: { id: string } } | null;
      totalCandidates: number;
      distribution: Array<{ count: number }>;
    };
    expect(res.matched.map((m) => m.user.id)).toEqual(['rhea']);
    expect(res.top?.user.id).toBe('anita');
    expect(res.totalCandidates).toBe(1);
    expect(res.distribution.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it('still drops people who were passed', async () => {
    const { svc } = serviceWith(
      [profile('rhea')],
      [matchedState('rhea', { status: 'passed', passedByOne: true, likedByTwo: false })],
    );
    const res = await svc.stack('me', 'romantic') as unknown as { matched: unknown[]; top: unknown };
    expect(res.matched).toEqual([]);
    expect(res.top).toBeNull();
  });

  it('returns an empty list when nothing is matched', async () => {
    const { svc } = serviceWith([profile('rhea')], []);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: unknown[] };
    expect(res.matched).toEqual([]);
  });
});
