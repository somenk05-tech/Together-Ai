/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── AN APPEAL CANNOT REINSTATE A MINOR (blocker 06) ──────────────────────────
 *
 * Overturning a profile rejection writes approved+visible. The DTO refuses an
 * under-18 at the door; the overturn must not be the way back in around it. So
 * the SAME age check runs on the stored date, before any audit row or "you're
 * live again" notification — a refused overturn leaves nothing behind.
 *
 * And the queue that used to show the moderator only free text now hands them
 * the age, the current state and the rejection reasons, so the decision is not
 * made blind. Both are exercised by calling the methods.
 */

const CHILD = new Date(`${new Date().getUTCFullYear() - 15}-03-03T00:00:00Z`);
const ADULT = new Date('1994-03-03T00:00:00Z');

function svcWith(prisma: any, access: any) {
  return new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    access as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
}

const okAccess = () => ({
  assert: jest.fn(async () => ['moderator']),
  act: jest.fn(async (_i: any, run: () => Promise<unknown>) => run()),
});

describe('an appeal cannot reinstate a minor', () => {
  it('refuses to overturn a profile whose stored date of birth is under 18', async () => {
    const access = okAccess();
    const prisma = {
      appeal: {
        findUnique: jest.fn(async () => ({ id: 'a1', userId: 'kid', kind: 'dating_profile', targetId: 'kid', status: 'open' })),
        update: jest.fn(async () => ({})),
      },
      datingProfile: {
        findUnique: jest.fn(async () => ({ birthDate: CHILD })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const svc = svcWith(prisma, access);
    await expect(svc.decideAppeal('mod', 'a1', 'overturned', 'they said typo')).rejects.toBeInstanceOf(ForbiddenException);
    // Nothing was written and nobody was told they are live.
    expect(access.act).not.toHaveBeenCalled();
    expect(prisma.datingProfile.updateMany).not.toHaveBeenCalled();
    expect(prisma.appeal.update).not.toHaveBeenCalled();
  });

  it('still overturns a genuine adult whose profile was wrongly rejected', async () => {
    const access = okAccess();
    const prisma = {
      appeal: {
        findUnique: jest.fn(async () => ({ id: 'a2', userId: 'her', kind: 'dating_profile', targetId: 'her', status: 'open' })),
        update: jest.fn(async () => ({})),
      },
      datingProfile: {
        findUnique: jest.fn(async () => ({ birthDate: ADULT })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const svc = svcWith(prisma, access);
    // logModeration + notifications are fire-and-forget/void; a bare stub is fine.
    (svc as any).logModeration = async () => undefined;
    (svc as any).notifications = { create: async () => undefined };
    await expect(svc.decideAppeal('mod', 'a2', 'overturned', 'photo was fine')).resolves.toMatchObject({ status: 'overturned' });
    expect(prisma.datingProfile.updateMany).toHaveBeenCalledWith({ where: { userId: 'her' }, data: { moderation: 'approved', visible: true } });
  });

  it('the appeal queue hands the moderator the age, the state and the reasons', async () => {
    const access = okAccess();
    const prisma = {
      appeal: {
        findMany: jest.fn(async () => [
          { id: 'a1', userId: 'kid', kind: 'dating_profile', targetId: 'kid', text: 'typo', status: 'open', createdAt: new Date() },
          { id: 'a2', userId: 'x', kind: 'dating_photo', targetId: 'dating/x/p.jpg', text: 'fine', status: 'open', createdAt: new Date() },
        ]),
      },
      datingProfile: {
        findMany: jest.fn(async () => [{ userId: 'kid', birthDate: CHILD, moderation: 'rejected', moderationJson: JSON.stringify({ reasons: ['age-18-plus'] }) }]),
      },
    };
    const svc = svcWith(prisma, access);
    const out = await svc.appealQueue('mod') as any[];
    const profileAppeal = out.find((r) => r.id === 'a1');
    expect(profileAppeal.age).toBeLessThan(18);
    expect(profileAppeal.profileModeration).toBe('rejected');
    expect(profileAppeal.rejectionReasons).toEqual(['age-18-plus']);
    // A photo appeal is passed through untouched — no profile facts invented.
    const photoAppeal = out.find((r) => r.id === 'a2');
    expect(photoAppeal.age).toBeUndefined();
  });
});
