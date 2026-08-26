import { DatingService } from './dating.service';
import { BlockingService } from '../connections/blocking.service';

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
      // The open-conversation count the chat cap reads. Absent, the stub was
      // modelling a delegate this app does have.
      count: jest.fn(async () => states.filter((s) => (s as { conversationId?: string | null }).conversationId).length),
    },
    // The pair-score cache H2 learns from. It was absent, so the stub was
    // modelling a database this app does not have; returning null here exercises
    // the real "no cached score for this pair, so it is not evidence" path.
    compatibilityScore: { findUnique: jest.fn(async () => null) },
    connection: { findMany: jest.fn(async () => []) },
    block: { findMany: jest.fn(async () => []) },
    follow: { findMany: jest.fn(async () => []) },
  };
  const svc = new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    new BlockingService(prisma as never),
    {} as never, {} as never,   // M3: StorageProvider, MediaService
    // Photo review, fail-closed: nothing is approved in a stub, and the cards
    // under test carry no photo keys, so nothing is asked to be signed.
    { approvedOf: async () => new Set<string>(), statusOf: async () => ({}) } as never,
    { track: () => undefined } as never,   // AnalyticsService
    {} as never,                           // AdminAccessService
    { up: false } as never,                // RedisService — no list cache in a stub
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never, // JobsService, off
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

  it('sends the page the caller asked for, ranked, and says the list goes on', async () => {
    // `limit` cuts AFTER ranking; the histogram still counts everybody, and
    // the page says whether there is more. No limit is the whole list.
    const { svc } = serviceWith([profile('a'), profile('b'), profile('c')], []);
    const page = await svc.stack('me', 'romantic', 2) as unknown as {
      candidates: Array<{ score: number }>; totalCandidates: number; hasMore: boolean; distribution: Array<{ count: number }>;
    };
    expect(page.candidates).toHaveLength(2);
    expect(page.totalCandidates).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(page.candidates[0].score).toBeGreaterThanOrEqual(page.candidates[1].score);
    expect(page.distribution.reduce((n, b) => n + b.count, 0)).toBe(3);
    const whole = await svc.stack('me', 'romantic') as unknown as { candidates: unknown[]; hasMore: boolean };
    expect(whole.candidates).toHaveLength(3);
    expect(whole.hasMore).toBe(false);
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

  /**
   * A CURATED CARD IS A PERSON, NOT A PERCENTAGE WITH A FACE.
   *
   * The list used to carry a name, a picture, a bio and a score, so the page
   * that leads with one match could say almost nothing about them — what they
   * do, where they are, what they are looking for all lived on matchDetail,
   * one request per person away. These six are read straight off the extras
   * stack() has already parsed for scoring, so the only thing that changed is
   * what the response says.
   */
  const CARD_EXTRAS = JSON.stringify({
    profession: 'Architect', city: 'Pune', heightCm: 168,
    languages: ['English', 'Marathi'], relationshipGoal: 'Long-term',
    personalityTraits: ['Calm', 'Creative'],
  });

  it('carries the six fields the curated card is written from', async () => {
    const { svc } = serviceWith([profile('rhea', { extras: CARD_EXTRAS })], [matchedState('rhea')]);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<Record<string, unknown>> };
    expect(res.matched[0]).toMatchObject({
      occupation: 'Architect', city: 'Pune', heightCm: 168,
      languages: ['English', 'Marathi'], relationshipGoal: 'Long-term',
      personalityTraits: ['Calm', 'Creative'],
    });
  });

  it('says nothing rather than something empty when the profile is bare', async () => {
    // The card omits a fact it does not have. It can only do that if "absent"
    // arrives as null and an empty list — `undefined` and `''` both render as
    // a label with nothing after it, which is the invented blank this hub has
    // refused everywhere else.
    const { svc } = serviceWith([profile('rhea')], [matchedState('rhea')]);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<Record<string, unknown>> };
    expect(res.matched[0]).toMatchObject({
      occupation: null, city: null, heightCm: null,
      languages: [], relationshipGoal: null, personalityTraits: [],
    });
  });
});
