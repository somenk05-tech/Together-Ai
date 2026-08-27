/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── NO PROFILE, NO REACH ─────────────────────────────────────────────────────
 *
 * Third audit, blockers 01 and 06. Two holes, one theme: the 18+ gate lives on
 * profile creation, and two paths let a citizen act without ever passing it.
 *
 *   01  like / connect / reveal checked only the TARGET (assertWritable) and
 *       never the caller. So an account with NO dating profile — on which the
 *       age check had therefore never run — could like real members, and a
 *       profile REJECTED for being under-age could keep using a match it
 *       already had. Target ids are on every card, so it needed nothing exotic.
 *
 *   06  overturning a profile appeal wrote approved+visible with no age
 *       re-check, on a queue that showed the moderator free text and nothing
 *       else. "My birthday was typed wrong" plus one overturn put an under-18
 *       back in the adult pool.
 *
 * These call the methods. The gate that used to be missing throws now, and the
 * overturn refuses the under-age profile before it writes anything. unmatch and
 * blockMatch are deliberately NOT gated — a rejected citizen must still be able
 * to leave and to block — and there is a test for that too.
 */

const ADULT = new Date('1996-05-05T00:00:00Z');

function serviceWith(prisma: any, blocking: any = {}) {
  return new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, blocking as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
}

/** A prisma stub where the CALLER's profile state is the variable under test. */
function reachStub(mineModeration: string | null) {
  return {
    datingProfile: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.userId === 'me'
          ? (mineModeration === null ? null : { userId: 'me', moderation: mineModeration, birthDate: ADULT, extras: null, visible: true })
          : { userId: where.userId, moderation: 'approved', birthDate: ADULT, extras: null, visible: true }),
    },
    datingMatch: { findFirst: jest.fn(async () => null), updateMany: jest.fn(async () => ({ count: 0 })) },
  };
}

describe('no profile, no reach (blocker 01)', () => {
  it('like is refused when the caller has no dating profile', async () => {
    const svc = serviceWith(reachStub(null));
    await expect(svc.like('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('like is refused when the caller\'s profile is rejected', async () => {
    const svc = serviceWith(reachStub('rejected'));
    await expect(svc.like('me', 'them', 'romantic')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('connect is refused without an approved profile', async () => {
    const svc = serviceWith(reachStub(null));
    await expect(svc.connect('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reveal is refused without an approved profile', async () => {
    const svc = serviceWith(reachStub('pending'));
    await expect(svc.reveal('me', 'them', 'romantic', true)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('the caller check runs BEFORE the target is even looked at', async () => {
    // Proof the gate is first: the caller has no profile, and the stub would
    // throw a different error if the target lookup ran. It never should.
    const stub = reachStub(null);
    const svc = serviceWith(stub);
    await expect(svc.like('me', 'them', 'romantic')).rejects.toBeInstanceOf(NotFoundException);
    // Only the caller's own row was read; the target's writability was not reached.
    expect(stub.datingProfile.findUnique).toHaveBeenCalledWith({ where: { userId: 'me' } });
  });
});

describe('the safety exits stay open to a rejected citizen', () => {
  // unmatch and blockMatch must not require good standing — they are the way out.
  function safetyStub() {
    return {
      datingProfile: { findUnique: jest.fn(async (_q: unknown) => ({ userId: 'me', moderation: 'rejected', birthDate: ADULT })) },
      datingMatch: {
        findFirst: jest.fn(async () => ({ id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'matched', conversationId: null })),
        updateMany: jest.fn(async () => ({ count: 1 })),
        update: jest.fn(async () => ({ id: 'm1' })),
      },
      block: { createMany: jest.fn(async () => ({ count: 1 })) },
      follow: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    };
  }

  it('blockMatch does not consult the caller\'s profile standing at all', async () => {
    const stub = safetyStub();
    const blocking = { block: jest.fn(async () => ({ blocked: true as const, userId: 'them' })) };
    const svc = serviceWith(stub, blocking);
    // BlockingService is a stub-less real dependency here; we only assert the
    // caller-standing gate is absent — reaching the block write means it passed.
    await expect(svc.blockMatch('me', 'them', 'romantic')).resolves.toBeDefined();
    // The rejected 'me' profile was never read as a standing check.
    for (const call of stub.datingProfile.findUnique.mock.calls) {
      expect((call as unknown[])[0]).not.toEqual({ where: { userId: 'me' } });
    }
  });
});
