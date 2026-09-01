import { DatingService } from './dating.service';
import { openCardId } from './card-id';
import { BlockingService } from '../connections/blocking.service';

/**
 * ── A LENS IS ASKED OF BOTH OF YOU (owner, 1 Sep) ──────────────────────────
 *
 * "Apart from dating, add dating with intention and marriage." Three lenses
 * over ONE pool: the likes, the daily allowance and the chats stay shared, and
 * the only thing a lens changes is who a list is willing to show.
 *
 * `three-lenses-one-pool.spec.ts` pins the derivation. This file runs the
 * service, because a filter that is written and not reached is the defect this
 * hub has now shipped twice — once in `matchesUncached`, once in the pool
 * guard H3 closed. Everything here goes through `stack()` and `discover()`
 * with a stub database, so a lens that stops being applied fails HERE rather
 * than in a screen nobody is looking at.
 *
 * The rule under test, stated once: a candidate appears under a lens only if
 * BOTH of you are open to it. Filtering only them would put somebody who is
 * here for marriage in front of a person browsing casually — a door locked
 * from the other side.
 */

const unseal = (svc: unknown, viewer: string, token: string) =>
  openCardId((svc as unknown as { cardSecret(): string }).cardSecret(), viewer, token) ?? token;

const BIRTH = new Date('1996-04-12T00:00:00Z');

/** 60% complete, so the curated shelf's own floor is never what is being read. */
const shelfReady = (over: Record<string, unknown> = {}) => JSON.stringify({
  city: 'Pune', languages: ['English', 'Marathi'],
  personalityTraits: ['Calm', 'Creative', 'Curious'],
  ...over,
});

function candidate(userId: string, extras: Record<string, unknown>) {
  return {
    userId, birthDate: BIRTH, gender: 'female', seeking: 'any', visible: true,
    moderation: 'approved',
    bio: 'Long enough a bio to count as one, which is twenty characters or more.',
    interests: 'Fitness,Movies,Cooking',
    extras: shelfReady(extras),
    user: { id: userId, handle: `@${userId}`, name: userId, profileImage: null },
  };
}

function serviceWith(me: Record<string, unknown>, candidates: Array<Record<string, unknown>>) {
  const mine = {
    userId: 'me', birthDate: BIRTH, gender: 'male', seeking: 'any', visible: true,
    moderation: 'approved', bio: 'Hello there', interests: 'Fitness,Movies',
    extras: shelfReady(me),
    user: { id: 'me', handle: '@me', name: 'me', profileImage: null },
  };
  const prisma = {
    datingProfile: {
      findUnique: jest.fn(async () => mine),
      findMany: jest.fn(async () => candidates),
    },
    datingMatch: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
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
    {} as never,
    { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  return { svc, prisma };
}

type Card = { user: { id: string } };
type Stack = { candidates: Card[]; matched: Card[] };

/** Who the stack offered, by their real id. */
async function shown(
  me: Record<string, unknown>, candidates: Array<Record<string, unknown>>,
  lens?: 'dating' | 'intentional' | 'marriage',
): Promise<string[]> {
  const { svc } = serviceWith(me, candidates);
  const res = await svc.stack('me', 'romantic', undefined, lens) as unknown as Stack;
  return [...res.candidates, ...res.matched].map((c) => unseal(svc, 'me', c.user.id)).sort();
}

const CASUAL = { relationshipGoal: 'Casual dating' };
const SERIOUS = { relationshipGoal: 'Serious dating' };
const MARRYING = { relationshipGoal: 'Marriage' };

describe('a lens is asked of both of you', () => {
  it('changes nothing at all when no lens is chosen', async () => {
    /*
     * THE LIST EVERY EXISTING CLIENT ASKS FOR. A lens that leaked a default
     * would narrow it the day it shipped, and nobody reports a hub that shows
     * FEWER people — the failure mode this hub keeps having.
     *
     * And what it returns is NOT everybody, which is the thing worth writing
     * down. `Marriage Intentions` has been a default-on, mutual deal-breaker
     * since 26 Aug: a casual viewer already never saw the committed side of
     * the pool, measured, deliberately, and long before there was a word for
     * it. So two of the three lenses were half-built already — `dating` is
     * exactly the line that filter draws. What the lenses add is a NAME for
     * it, and a split inside the committed side that did not exist: serious
     * and marriage are one pool to that filter, by design ("a side, not a
     * distance"), and two headings here.
     */
    expect(await shown(CASUAL, [
      candidate('casual', CASUAL), candidate('serious', SERIOUS), candidate('marrying', MARRYING),
    ])).toEqual(['casual']);
    // From the other side of that same line, unchanged: serious and marriage
    // still see each other with no lens, and the lens is what separates them.
    expect(await shown(MARRYING, [
      candidate('casual', CASUAL), candidate('serious', SERIOUS), candidate('marrying', MARRYING),
    ])).toEqual(['marrying', 'serious']);
    expect(await shown(MARRYING, [candidate('serious', SERIOUS)], 'marriage')).toEqual([]);
  });

  it('lets a citizen who is open to both sides be shown people on both', async () => {
    /*
     * AND THIS IS WHY `committedSides` HAD TO GROW A PLURAL. The multi-select
     * says "Dating and Marriage" and the engine had one boolean to answer
     * with, read off a single old goal. Left alone, the deal-breaker would
     * have deleted one of the two sides the citizen had just ticked — three
     * boxes on the screen, one of them honoured, and nothing red anywhere.
     */
    const both = { relationshipGoal: 'Casual dating', openTo: ['dating', 'marriage'] };
    expect(await shown(both, [candidate('casual', CASUAL), candidate('marrying', MARRYING)]))
      .toEqual(['casual', 'marrying']);
  });

  it('narrows to one lens, and reads their stated goal to do it', async () => {
    const pool = [candidate('casual', CASUAL), candidate('serious', SERIOUS), candidate('marrying', MARRYING)];
    // Nobody was asked anything: every one of these profiles predates the
    // control, and their goal is what puts them under a heading.
    expect(await shown({ ...MARRYING }, pool, 'marriage')).toEqual(['marrying']);
    expect(await shown({ ...SERIOUS }, pool, 'intentional')).toEqual(['serious']);
    expect(await shown({ ...CASUAL }, pool, 'dating')).toEqual(['casual']);
  });

  it('gives you nothing under a lens you are not on yourself', async () => {
    // THE DOOR LOCKED FROM THE OTHER SIDE. `?intent=marriage` from somebody
    // browsing casually used to be the obvious hole to leave: filter the
    // candidates, forget the viewer, and every marriage-seeker is in front of
    // a person they would never have agreed to meet.
    expect(await shown(CASUAL, [candidate('marrying', MARRYING)], 'marriage')).toEqual([]);
  });

  it('honours somebody open to more than one, in both directions', async () => {
    const both = { relationshipGoal: 'Casual dating', openTo: ['dating', 'marriage'] };
    // They appear under both headings...
    expect(await shown(MARRYING, [candidate('both', both)], 'marriage')).toEqual(['both']);
    expect(await shown(CASUAL, [candidate('both', both)], 'dating')).toEqual(['both']);
    // ...and not under the one they left out, even though their old goal is
    // no longer what speaks for them.
    expect(await shown(SERIOUS, [candidate('both', both)], 'intentional')).toEqual([]);
    // And it works when THEY are the viewer: openTo is read on both sides.
    expect(await shown(both, [candidate('marrying', MARRYING)], 'marriage')).toEqual(['marrying']);
  });

  it('leaves somebody who has not said what they want on the unfiltered list only', async () => {
    // 'Still figuring it out' normalises to null, so they are under no
    // heading — and the curated shelf already refused them, so this takes
    // nothing away that they had.
    const unsure = { relationshipGoal: 'Still figuring it out' };
    expect(await shown(CASUAL, [candidate('unsure', unsure)], 'dating')).toEqual([]);
    // A viewer who has not said cannot browse a heading either, and their
    // unfiltered list is untouched.
    expect(await shown(unsure, [candidate('casual', CASUAL)], 'dating')).toEqual([]);
    expect(await shown(unsure, [candidate('casual', CASUAL)])).toEqual(['casual']);
  });

  it('applies the same rule on the discover list, not just the stack', async () => {
    // Two list reads, two loops, and a rule that lives in one of them is the
    // shape of every defect in this file's docblock.
    const { svc } = serviceWith(CASUAL, [candidate('marrying', MARRYING), candidate('casual', CASUAL)]);
    const res = await svc.discover('me', 'romantic', undefined, 'dating') as unknown as {
      sections: Array<{ matches: Card[] }>;
    };
    const ids = res.sections.flatMap((s) => s.matches).map((c) => unseal(svc, 'me', c.user.id));
    expect([...new Set(ids)].sort()).toEqual(['casual']);
  });
});
