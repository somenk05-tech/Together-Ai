/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── THE MODERATOR IS ASKED FIRST (fifth audit, 31 Aug, H7) ──────────────────
 *
 * `moderateDecision` read the target's row, refused with "no dating profile"
 * or "does not meet the minimum age", and only THEN let `access.act` ask who
 * was asking. So any signed-in citizen posting to the admin route learned, for
 * any user id, whether a dating profile existed and whether its stored date of
 * birth was under 18 — from the three different refusals.
 *
 * `decideAppeal`, its sibling, was moved to permission-first on 27 Aug. This
 * file holds the other door to the same order: a caller without the grant is
 * refused before a single row is read.
 */

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

describe('the moderator is asked first', () => {
  it('refuses a caller without moderation.act before reading the target', async () => {
    const access = {
      assert: jest.fn(async () => { throw new ForbiddenException('Not a moderator.'); }),
      act: jest.fn(),
    };
    const prisma = { datingProfile: { findUnique: jest.fn(), updateMany: jest.fn() } };
    const svc = svcWith(prisma, access);

    await expect(svc.moderateDecision('citizen', 'anyone', 'approved', 'because')).rejects.toBeInstanceOf(ForbiddenException);
    // No row was read: the caller learns nothing about `anyone` — not that a
    // profile exists, not its age, not its state.
    expect(prisma.datingProfile.findUnique).not.toHaveBeenCalled();
    expect(prisma.datingProfile.updateMany).not.toHaveBeenCalled();
    expect(access.act).not.toHaveBeenCalled();
  });

  it('asks the permission before the first read for a real moderator too', async () => {
    const order: string[] = [];
    const access = {
      assert: jest.fn(async () => { order.push('assert'); return ['moderator']; }),
      act: jest.fn(async (_i: any, run: () => Promise<unknown>) => { order.push('act'); return run(); }),
    };
    const prisma = {
      datingProfile: {
        findUnique: jest.fn(async () => { order.push('read'); return { moderation: 'approved', visible: true }; }),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
      moderationLog: { create: jest.fn(async () => ({})) },
      datingMatch: { findMany: jest.fn(async () => []) },
    };
    const svc = svcWith(prisma, access);
    (svc as any).logModeration = jest.fn(async () => undefined);
    (svc as any).endMyChats = jest.fn(async () => undefined);
    (svc as any).bumpListVersion = jest.fn(async () => undefined);
    (svc as any).notifications = { create: jest.fn(async () => ({})) };

    await svc.moderateDecision('mod', 'target', 'rejected', 'a written reason');
    expect(order[0]).toBe('assert');
    expect(order.indexOf('read')).toBeGreaterThan(0);
  });
});
