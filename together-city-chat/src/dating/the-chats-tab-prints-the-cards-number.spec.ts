import { DatingService } from './dating.service';
import { BlockingService } from '../connections/blocking.service';
import { compatibilityScore, type NatalSigns } from './astrology';
import { natalChart } from '../astrology/astro-engine';
import { factorScores, overallScore, pairMultiplier, type DXProfile } from './matching';

/**
 * ONE NUMBER, EVERYWHERE — THE CHATS TAB TOO (owner, 16 Sep).
 *
 * Shruti read 79% on Curated Matches and 66% on Matchmaking Chats. The cards
 * work the number out when asked; the chats tab read the pair's cached row,
 * written at the like and never again. It now works it out the same way, and
 * the cached row is only what it falls back to.
 */
const ME = { userId: 'me', moderation: 'approved', birthDate: new Date('1990-04-12T00:00:00Z'), interests: 'travel,pets,music',
  extras: JSON.stringify({ relationshipGoal: 'long-term', diet: 'vegetarian' }) };
const THEM = { userId: 'them', moderation: 'approved', birthDate: new Date('1991-09-03T00:00:00Z'), interests: 'travel,pets,books',
  extras: JSON.stringify({ relationshipGoal: 'long-term', diet: 'vegetarian' }) };
const STALE = 3; // what the cache says — a number no live formula gives these two

function serviceWith(opts: { mine?: Record<string, unknown>; cached?: number | null } = {}) {
  const prisma = {
    datingMatch: { findMany: jest.fn(async () => [{
      id: 'm1', userOneId: 'me', userTwoId: 'them', kind: 'romantic', status: 'matched',
      revealByOne: false, revealByTwo: false, conversationId: null, updatedAt: new Date('2026-09-01T00:00:00Z'),
    }]) },
    datingProfile: { findMany: jest.fn(async () => [THEM]), findUnique: jest.fn(async () => opts.mine ?? ME) },
    user: { findMany: jest.fn(async () => [{ id: 'them', name: 'Shruti' }]) },
    compatibilityScore: {
      findMany: jest.fn(async () => (opts.cached === null ? [] : [{ userA: 'me', userB: 'them', overall: opts.cached ?? STALE }])),
      findUnique: jest.fn(async () => null), findFirst: jest.fn(async () => null), upsert: jest.fn(async () => null),
    },
  };
  const conversations = { summariesFor: jest.fn(async () => new Map()) };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
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

/** The chart every scorer reads when no astro profile is on file: date only, Kolkata. */
const natalOf = (d: Date): NatalSigns => {
  const c = natalChart(d, null, 'Asia/Kolkata', null, null);
  return { moon: c.moon.sign, ascendant: c.ascendant?.sign ?? null };
};

/** The number every card prints for this pair. */
function cardNumber(): number {
  const dx = (s: string) => JSON.parse(s) as DXProfile;
  const mine = ME.interests.split(','); const theirs = THEM.interests.split(',');
  const { score: astro } = compatibilityScore(
    { userId: 'me', birthDate: ME.birthDate, interests: mine, natal: natalOf(ME.birthDate) },
    { userId: 'them', birthDate: THEM.birthDate, interests: theirs, natal: natalOf(THEM.birthDate) },
  );
  const b = factorScores(astro, mine, theirs, dx(ME.extras), dx(THEM.extras));
  return overallScore(b, pairMultiplier(dx(ME.extras), dx(THEM.extras), mine, theirs));
}

const scoreOf = async (svc: DatingService) =>
  ((await svc.datingChats('me')) as unknown as Array<{ score: number | null }>)[0].score;

describe('the chats tab prints the number the cards print', () => {
  it('works the number out, rather than reading a row written at the like', async () => {
    const { svc } = serviceWith();
    const expected = cardNumber();
    expect(expected).not.toBe(STALE);
    expect(await scoreOf(svc)).toBe(expected);
  });

  it('never writes the cache back — that row is the new-match push’s ledger', async () => {
    const { svc, prisma } = serviceWith();
    await svc.datingChats('me');
    expect(prisma.compatibilityScore.upsert).not.toHaveBeenCalled();
  });

  it('falls back to the cached number when this side cannot be scored, and to nothing without one', async () => {
    expect(await scoreOf(serviceWith({ mine: { moderation: 'approved' } }).svc)).toBe(STALE);
    expect(await scoreOf(serviceWith({ mine: { moderation: 'approved' }, cached: null }).svc)).toBeNull();
  });
});
