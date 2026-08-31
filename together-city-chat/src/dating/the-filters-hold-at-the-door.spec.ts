/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── THE FILTERS HOLD AT THE DOOR (fifth audit, 31 Aug, H3) ──────────────────
 *
 * Every list ran `seeks` and `unreachableReason` in both directions before a
 * card was produced. Two things did not:
 *
 *   · `like` and `pass` ran neither. With a user id from anywhere a citizen
 *     could like somebody whose own age range, distance or deal-breakers had
 *     removed them; that person got "You have a new like 💛" from somebody
 *     their non-negotiables excluded, and a like back flipped the row to
 *     `matched`, which the stack then merged in past every filter.
 *
 *   · `kind=platonic` skipped both checks on the detail page and the lists,
 *     so `@handle → /users/lookup → id → /dating/matches/:id?kind=platonic`
 *     opened anyone approved and visible — a coworker, an ex — with their
 *     gallery, past the target's own filters, in a mode nobody had opted
 *     into. There is no Friends UI; the mode was reachable only this way.
 *
 * Owner decision, 31 Aug: platonic honours everyone's age range, distance and
 * deal-breakers and skips only WHO they seek (friends may be any gender). The
 * write path makes the lists' two checks, except for a pair already matched —
 * a match is reached through the match, and a filter tightened afterwards
 * does not freeze it. The refusal is the lists' own 404.
 */

const ADULT_30 = new Date('1996-05-05T00:00:00Z');
const ADULT_45 = new Date('1981-05-05T00:00:00Z');

function serviceWith(prisma: any) {
  return new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { blockedWith: async () => [] } as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
}

/**
 * Two people: `me`, 30, seeking anyone up to 35; `them`, 45. My age range
 * excludes them. Their profile is approved, visible, and in no way blocked.
 */
function pair(opts: { matched?: boolean; meAgeMax?: number } = {}) {
  const me = {
    userId: 'me', gender: 'female', seeking: 'any', moderation: 'approved', visible: true, birthDate: ADULT_30,
    interests: '', extras: JSON.stringify({ prefAgeMin: 18, prefAgeMax: opts.meAgeMax ?? 35 }),
    user: { id: 'me', name: 'Me', emailVerified: true, deletedAt: null },
  };
  const them = {
    userId: 'them', gender: 'male', seeking: 'any', moderation: 'approved', visible: true, birthDate: ADULT_45,
    interests: '', extras: JSON.stringify({}),
    user: { id: 'them', name: 'Them', emailVerified: true, deletedAt: null },
  };
  const rows: Record<string, unknown> = { me, them };
  const prisma = {
    datingProfile: { findUnique: jest.fn(async ({ where }: any) => rows[where.userId] ?? null) },
    datingMatch: {
      findFirst: jest.fn(async ({ where }: any) =>
        (opts.matched && where?.status === 'matched')
          ? { id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'matched' } : null),
      findMany: jest.fn(async () => []),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    connection: { findMany: jest.fn(async () => []) },
  };
  const svc = serviceWith(prisma);
  const s = svc as any;
  // Past the gates, `like` and `pass` go on to write; the gates are the subject.
  s.upsertState = jest.fn(async () => { throw new Error('WROTE'); });
  s.bumpListVersion = jest.fn(async () => undefined);
  s.cachePairScore = jest.fn(async () => undefined);
  return { svc, prisma, s };
}

describe('the filters hold at the door', () => {
  it('a like on somebody your own age range excludes is the lists’ 404, and writes nothing', async () => {
    const { svc, s } = pair();
    await expect(svc.like('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.upsertState).not.toHaveBeenCalled();
  });

  it('a pass on them is refused the same way', async () => {
    const { svc, s } = pair();
    await expect(svc.pass('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.upsertState).not.toHaveBeenCalled();
  });

  it('platonic is no way around it', async () => {
    const { svc, s } = pair();
    await expect(svc.like('me', 'them', 'platonic')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.upsertState).not.toHaveBeenCalled();
  });

  it('reaches the write when the filters allow', async () => {
    const { svc, s } = pair({ meAgeMax: 50 });
    // The stub throws WROTE at the first write: getting there is the assertion.
    await expect(svc.like('me', 'them', 'romantic')).rejects.toThrow('WROTE');
    expect(s.upsertState).toHaveBeenCalled();
  });

  it('an existing match is reached through the match, not the filters', async () => {
    const { svc, s } = pair({ matched: true });
    await expect(svc.like('me', 'them', 'romantic')).rejects.toThrow('WROTE');
    expect(s.upsertState).toHaveBeenCalled();
  });

  it('the detail page refuses in both kinds', async () => {
    const { svc } = pair();
    await expect(svc.matchDetail('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.matchDetail('me', 'them', 'platonic')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('platonic still skips WHO somebody seeks — friends may be any gender', async () => {
    // Same pair, ages within range, but `them` seeks women only and I am a
    // woman seeking men: romantic refuses on seeking, platonic does not.
    const { svc, prisma, s } = pair({ meAgeMax: 50 });
    const rows = prisma.datingProfile.findUnique;
    rows.mockImplementation(async ({ where }: any) => {
      if (where.userId === 'me') return { userId: 'me', gender: 'female', seeking: 'male', moderation: 'approved', visible: true, birthDate: ADULT_30, interests: '', extras: '{}', user: { id: 'me', name: 'Me', emailVerified: true, deletedAt: null } };
      if (where.userId === 'them') return { userId: 'them', gender: 'female', seeking: 'female', moderation: 'approved', visible: true, birthDate: ADULT_45, interests: '', extras: '{}', user: { id: 'them', name: 'Them', emailVerified: true, deletedAt: null } };
      return null;
    });
    await expect(svc.like('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.like('me', 'them', 'platonic')).rejects.toThrow('WROTE');
    expect(s.upsertState).toHaveBeenCalledTimes(1);
  });
});
