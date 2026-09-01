import { DatingService } from './dating.service';
import { openCardId } from './card-id';
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


/** Ids on the wire are sealed to the viewer since 31 Aug (card-id.ts); the
 *  assertions below read them back through the service's own key. */
const unseal = (svc: unknown, viewer: string, token: string) =>
  openCardId((svc as unknown as { cardSecret(): string }).cardSecret(), viewer, token) ?? token;

const BIRTH = new Date('1996-04-12T00:00:00Z');

function profile(userId: string, over: Record<string, unknown> = {}) {
  return {
    userId, birthDate: BIRTH, gender: 'female', seeking: 'any', visible: true,
    moderation: 'approved', bio: 'Hello there', interests: 'Fitness,Movies', extras: null,
    user: { id: userId, handle: `@${userId}`, name: userId, profileImage: null },
    ...over,
  };
}

/**
 * A candidate who clears the curated shelf's own rules (28 Aug).
 *
 * `profile()` above is deliberately bare — the "says nothing rather than
 * something empty" test needs it that way, and a MATCHED person is exempt from
 * discovery filters, so it stays valid there. An UNMATCHED candidate now has
 * to clear a 40% completion floor and have said what they are looking for
 * before the shelf will show them. Tests about paging and histograms need
 * candidates that get as far as being counted, so they use this.
 *
 * 60% complete: bio, three interests, three traits, a goal, languages, a city.
 */
const SHELF_READY = JSON.stringify({
  city: 'Pune', languages: ['English', 'Marathi'], relationshipGoal: 'Long-term',
  personalityTraits: ['Calm', 'Creative', 'Curious'],
});

function candidate(userId: string, over: Record<string, unknown> = {}) {
  return profile(userId, {
    bio: 'Long enough a bio to count as one, which is twenty characters or more.',
    interests: 'Fitness,Movies,Cooking',
    extras: SHELF_READY,
    ...over,
  });
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
    expect(unseal(svc, 'me', res.matched[0].user.id)).toBe('rhea');
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
    expect(res.matched.map((m) => unseal(svc, 'me', m.user.id))).toEqual(['rhea']);
  });

  it('keeps matches out of the discovery pool and its histogram', async () => {
    // They are already chosen — they should not still read as a candidate.
    const { svc } = serviceWith(
      [profile('rhea'), candidate('anita')],
      [matchedState('rhea')],
    );
    const res = await svc.stack('me', 'romantic') as unknown as {
      matched: Array<{ user: { id: string } }>;
      top: { user: { id: string } } | null;
      totalCandidates: number;
      distribution: Array<{ count: number }>;
    };
    expect(res.matched.map((m) => unseal(svc, 'me', m.user.id))).toEqual(['rhea']);
    expect(unseal(svc, 'me', res.top?.user.id ?? '')).toBe('anita');
    expect(res.totalCandidates).toBe(1);
    expect(res.distribution.reduce((n, b) => n + b.count, 0)).toBe(1);
  });

  it('sends the page the caller asked for, ranked, and says the list goes on', async () => {
    // `limit` cuts AFTER ranking; the histogram still counts everybody, and
    // the page says whether there is more. No limit is the whole list.
    const { svc } = serviceWith([candidate('a'), candidate('b'), candidate('c')], []);
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

  /**
   * ── THE SHELF'S OWN RULES, ON THE SHELF THAT RENDERS (28 Aug) ─────────────
   *
   * The 40% completion floor and the stated-intent rule were written on 1 Aug
   * into `matchesUncached` — a method this page had stopped calling on 26 Jul.
   * For the month between, a stub reached Curated Matches while the comment
   * above the rule said it could not. These four assertions are the coverage
   * that would have caught it, from the side that matters: behaviour, not the
   * presence of a line of source.
   */
  it('keeps a stub off the shelf', async () => {
    const { svc } = serviceWith([profile('stub')], []);
    const res = await svc.stack('me', 'romantic') as unknown as { candidates: unknown[]; totalCandidates: number };
    expect(res.candidates).toHaveLength(0);
    expect(res.totalCandidates).toBe(0);
  });

  it('keeps somebody who has not said what they want off the ROMANTIC shelf', async () => {
    // Complete enough, but no relationshipGoal. This is the half of the rule
    // that is not about effort — it is about whether the two people are here
    // for the same thing.
    const noGoal = JSON.stringify({
      city: 'Pune', languages: ['English', 'Marathi'],
      personalityTraits: ['Calm', 'Creative', 'Curious'],
    });
    const { svc } = serviceWith([candidate('quiet', { extras: noGoal })], []);
    const res = await svc.stack('me', 'romantic') as unknown as { candidates: unknown[] };
    expect(res.candidates).toHaveLength(0);
  });

  it('still shows that person on the PLATONIC shelf', async () => {
    // `relationshipGoal` is a romantic field. Applying the rule to platonic
    // — which is what the dead code did — empties that tab completely.
    const noGoal = JSON.stringify({
      city: 'Pune', languages: ['English', 'Marathi'],
      personalityTraits: ['Calm', 'Creative', 'Curious'],
    });
    const { svc } = serviceWith([candidate('quiet', { extras: noGoal })], []);
    const res = await svc.stack('me', 'platonic') as unknown as { candidates: unknown[] };
    expect(res.candidates).toHaveLength(1);
  });

  it('never applies either rule to somebody you already matched', async () => {
    // The whole point of the `!isMatched` placement. `profile()` is a stub and
    // has no goal, so both rules would drop it — and dropping it would delete
    // an existing match from the page, which is the defect the third audit
    // already had to fix once.
    const { svc } = serviceWith([profile('rhea')], [matchedState('rhea')]);
    const res = await svc.stack('me', 'romantic') as unknown as { matched: Array<{ user: { id: string } }> };
    expect(res.matched.map((m) => unseal(svc, 'me', m.user.id))).toEqual(['rhea']);
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

/**
 * ── AND A MATCH DOES NOT FALL OFF WHEN THEY PAUSE (third audit, blocker 07) ──
 *
 * Curated Matches was built by FILTERING the discovery pool, so a person you
 * had already matched dropped off the page the moment they paused or hid their
 * profile, edited who they seek, you changed your own age range, or their
 * profile fell past POOL_CEILING — while the chats tab still listed them. Two
 * screens, two answers. Matched partners are fetched by their match rows now,
 * bypassing poolWhere. This proves the pool can return NOTHING and the match
 * still shows.
 */
describe('a match survives its partner leaving the pool', () => {
  function servicePausedPartner() {
    const partner = profile('paused', { visible: false });   // out of every pool
    const prisma = {
      datingProfile: {
        findUnique: jest.fn(async () => profile('me', { gender: 'male', seeking: 'any' })),
        // The pool query (poolWhere: visible=true) finds nobody; the by-id
        // matched-partner query finds the paused partner.
        findMany: jest.fn(async ({ where }: { where: { userId?: { in?: string[] } } }) =>
          where?.userId?.in ? [partner] : []),
      },
      datingMatch: {
        findFirst: jest.fn(async () => null),
        findMany: jest.fn(async () => [matchedState('paused')]),
        count: jest.fn(async () => 0),
      },
      compatibilityScore: { findUnique: jest.fn(async () => null) },
      connection: { findMany: jest.fn(async () => []) },
      block: { findMany: jest.fn(async () => []) },
      follow: { findMany: jest.fn(async () => []) },
    };
    const svc = new DatingService(
      prisma as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
      new BlockingService(prisma as never),
      {} as never, {} as never,
      { approvedOf: async () => new Set<string>(), statusOf: async () => ({}) } as never,
      { track: () => undefined } as never,
      {} as never, { up: false } as never,
      { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
    );
    return { svc };
  }

  it('shows a matched partner whose profile is paused and in no pool', async () => {
    const { svc } = servicePausedPartner();
    const res = await svc.stack('me', 'romantic') as unknown as {
      matched: Array<{ user: { id: string }; matched: boolean }>;
      candidates: unknown[];
    };
    expect(res.matched.map((m) => unseal(svc, 'me', m.user.id))).toEqual(['paused']);
    expect(res.matched[0].matched).toBe(true);
    // …and it did NOT come from the pool, which returned nobody.
    expect(res.candidates).toHaveLength(0);
  });
});
