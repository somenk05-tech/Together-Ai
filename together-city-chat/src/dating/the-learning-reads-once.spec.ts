/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── THE LEARNING READS ONCE (fifth audit, 31 Aug, the N+1) ──────────────────
 *
 * `decisionsFor` called `readPairFactors` — one `findUnique` — per decided
 * row: up to LEARNING_WINDOW serial reads on every uncached stack request,
 * and on EVERY request while Redis was down. The cached factor rows are
 * keyed by the sorted pair, so all of them come back in one `findMany`.
 * The rule it kept: a pair with no cached score is skipped, never guessed.
 */

const row = (one: string, two: string, likedByOne: boolean, passedByOne = false) => ({
  userOneId: one, userTwoId: two,
  likedByOne, likedByTwo: false, passedByOne, passedByTwo: false,
});
const factors = (userA: string, userB: string) => ({
  userA, userB, astrology: 80, personality: 60, relationshipGoal: 50,
  values: 40, lifestyle: 30, interest: 20, distance: 10,
});

describe('the learning reads once', () => {
  it('fetches every decided pair’s factors in one query and skips unscored pairs', async () => {
    const prisma = {
      datingMatch: {
        findMany: jest.fn(async () => [
          row('me', 'a', true),          // liked
          row('b', 'me', false, false),  // their row, no decision of mine → dropped early
          row('me', 'c', false, true),   // passed
          row('me', 'd', true),          // liked, but never scored → skipped
        ]),
      },
      compatibilityScore: {
        findMany: jest.fn(async () => [factors('a', 'me'), factors('c', 'me')]),
        findUnique: jest.fn(),
      },
    };
    const svc: any = Object.create(DatingService.prototype);
    svc.prisma = prisma;

    const out = await svc.decisionsFor('me');
    expect(prisma.compatibilityScore.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.compatibilityScore.findUnique).not.toHaveBeenCalled();
    // Only the pairs I decided about were asked for, by their sorted key.
    const where = (prisma.compatibilityScore.findMany.mock.calls as unknown as Array<[{ where: { OR: unknown[] } }]>)[0][0];
    expect(where.where.OR).toEqual([
      { userA: 'a', userB: 'me' },
      { userA: 'c', userB: 'me' },
      { userA: 'd', userB: 'me' },
    ]);
    // Two decisions with evidence; the unscored pair is absent, not invented.
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ liked: true, factors: { astrology: 80, relationshipGoals: 50, interests: 20, location: 10 } });
    expect(out[1]).toMatchObject({ liked: false });
  });

  it('a broken read learns nothing rather than taking the page down', async () => {
    const svc: any = Object.create(DatingService.prototype);
    svc.prisma = {
      datingMatch: { findMany: jest.fn(async () => [row('me', 'a', true)]) },
      compatibilityScore: { findMany: jest.fn(async () => { throw new Error('down'); }) },
    };
    await expect(svc.decisionsFor('me')).resolves.toEqual([]);
  });

  it('no decisions means no second query at all', async () => {
    const svc: any = Object.create(DatingService.prototype);
    const findMany = jest.fn();
    svc.prisma = {
      datingMatch: { findMany: jest.fn(async () => [row('b', 'me', false)]) },
      compatibilityScore: { findMany },
    };
    await expect(svc.decisionsFor('me')).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
