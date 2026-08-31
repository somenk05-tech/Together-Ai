/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── AN APPROVAL IS NOT AN UNPAUSING (fifth audit, 31 Aug, medium 3) ─────────
 *
 * `moderateDecision` and an overturned appeal both wrote `visible: true` on
 * approval — overriding paused and hidden, the one choice that is entirely
 * the citizen's. A save made while paused lands in the review queue, so
 * clearing the queue exposed exactly the people who had asked not to be
 * seen. The moderator decides whether a profile MAY be seen; whether it IS
 * stays with its owner.
 *
 * And a rejected profile no longer reads the room (medium 5): `datingChats`
 * had no standing gate, so a taken-down profile still listed its matches'
 * names, ages and scores. Rejected only — pending and review are states
 * every ordinary edit passes through, and mid-review chats stay.
 */

const ADULT = new Date('1994-03-03T00:00:00Z');

function svcWith(prisma: any) {
  const access = {
    assert: jest.fn(async () => ['moderator']),
    act: jest.fn(async (_i: any, run: () => Promise<unknown>) => run()),
  };
  const svc = new DatingService(
    prisma as never, {} as never,
    { summariesFor: async () => new Map() } as never, {} as never,
    { create: jest.fn(async () => ({})) } as never,
    {} as never, {} as never,
    { blockedWith: async () => [] } as never,
    {} as never, {} as never,
    { decide: async () => undefined } as never,
    { track: () => undefined } as never,
    access as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  ) as any;
  svc.logModeration = jest.fn(async () => undefined);
  svc.endMyChats = jest.fn(async () => undefined);
  (svc as { storage: unknown }).storage = { presignPrivateDownload: async () => null };
  return svc;
}

const profilePrisma = (visibility: string | null) => {
  const updates: any[] = [];
  return {
    updates,
    datingProfile: {
      findUnique: jest.fn(async ({ select }: any) => (
        select?.birthDate && !select?.moderation
          ? { birthDate: ADULT, extras: visibility ? JSON.stringify({ visibility }) : '{}' }
          : { moderation: 'review', visible: false, extras: visibility ? JSON.stringify({ visibility }) : '{}', birthDate: ADULT }
      )),
      updateMany: jest.fn(async (a: any) => { updates.push(a.data); return { count: 1 }; }),
    },
    appeal: {
      findUnique: jest.fn(async () => ({ id: 'a1', userId: 'u1', kind: 'dating_profile', targetId: 'u1', status: 'open' })),
      update: jest.fn(async () => ({})),
    },
  };
};

describe('an approval is not an unpausing', () => {
  it('a moderator approval leaves a paused profile out of the pool', async () => {
    const prisma = profilePrisma('paused');
    await svcWith(prisma).moderateDecision('mod', 'u1', 'approved', 'looks fine');
    expect(prisma.updates[0]).toEqual({ moderation: 'approved', visible: false });
  });

  it('and puts an unpaused one back in', async () => {
    const prisma = profilePrisma('everyone');
    await svcWith(prisma).moderateDecision('mod', 'u1', 'approved', 'looks fine');
    expect(prisma.updates[0]).toEqual({ moderation: 'approved', visible: true });
  });

  it('an overturned appeal respects hidden the same way', async () => {
    const prisma = profilePrisma('hidden');
    await svcWith(prisma).decideAppeal('mod', 'a1', 'overturned', 'they were right');
    const write = prisma.updates.find((u: any) => 'moderation' in u);
    expect(write).toEqual({ moderation: 'approved', visible: false });
  });

  it('a rejection still takes the profile out regardless', async () => {
    const prisma = profilePrisma('everyone');
    await svcWith(prisma).moderateDecision('mod', 'u1', 'rejected', 'a written reason');
    expect(prisma.updates[0]).toEqual({ moderation: 'rejected', visible: false });
  });
});

describe('a rejected profile does not read the room', () => {
  it('datingChats refuses a rejected caller with the appeal sentence', async () => {
    const prisma = {
      datingProfile: { findUnique: jest.fn(async () => ({ moderation: 'rejected' })) },
      datingMatch: { findMany: jest.fn() },
    };
    await expect(svcWith(prisma).datingChats('u1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.datingMatch.findMany).not.toHaveBeenCalled();
  });

  it('a profile mid-review keeps its chats', async () => {
    const prisma = {
      datingProfile: { findUnique: jest.fn(async () => ({ moderation: 'review' })), findMany: jest.fn(async () => []) },
      datingMatch: { findMany: jest.fn(async () => []) },
      user: { findMany: jest.fn(async () => []) },
    };
    const svc = svcWith(prisma);
    svc.fillPhotos = jest.fn(async () => undefined);
    await expect(svc.datingChats('u1')).resolves.toEqual([]);
  });
});
