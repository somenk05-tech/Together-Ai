/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── SCARCITY IS SCARCE, AND A RE-TAP IS SILENT (blockers 08 and 09) ──────────
 *
 * 08  The allowance was correctly skipped for a re-tap of an existing like, but
 *     the PUSH was not — so POSTing like on the same person in a loop sent one
 *     "You have a new like 💛" per call, free, at a stranger whose phone the
 *     victim can't silence because the notification names nobody. Nothing new
 *     happens on a re-tap, so nothing is sent now.
 *
 * 09  The super-like check and the super write both sat inside `!alreadyLiked`,
 *     so liking somebody ordinarily and THEN super-liking them skipped the
 *     limit while still setting the flag — one a day became twenty. A NEW super
 *     is gated whether or not an ordinary like already exists.
 *
 * These call like().
 */
function build(state: any, allowance: any) {
  const notifications = { create: jest.fn(async () => ({})) };
  const updates: any[] = [];
  const prisma: any = {
    datingMatch: {
      update: jest.fn(async ({ data }: any) => { updates.push(data); return { ...state, ...data }; }),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
  };
  const svc = new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    notifications as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: jest.fn(() => undefined) } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  (svc as any).assertMayReach = async () => undefined;
  (svc as any).assertWritable = async () => undefined;
  // The third gate (H3, 31 Aug): filters on the write path. Stubbed like the
  // other two — this file is about what happens AFTER the door.
  (svc as any).assertReachable = async () => undefined;
  (svc as any).bumpListVersion = async () => undefined;
  (svc as any).cachePairScore = async () => undefined;
  (svc as any).upsertState = async () => state;
  (svc as any).likeAllowance = async () => allowance;
  return { svc, prisma, notifications, updates };
}

const st = (over: any = {}) => ({
  id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'pending',
  likedByOne: false, likedByTwo: false, superByOne: false, superByTwo: false, ...over,
});
const plenty = { likesUsed: 3, likesLeft: 17, supersUsed: 0, supersLeft: 1, resetsAtLocal: 'today' };
const noSupers = { likesUsed: 3, likesLeft: 17, supersUsed: 1, supersLeft: 0, resetsAtLocal: 'today' };

describe('a re-tap sends nothing (blocker 08)', () => {
  it('re-liking a card you already liked writes nothing new and notifies nobody', async () => {
    const { svc, notifications } = build(st({ likedByOne: true }), plenty);
    await svc.like('me', 'them', 'romantic');
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('a first like DOES notify — the door is closed, not bricked up', async () => {
    const { svc, notifications } = build(st(), plenty);
    await svc.like('me', 'them', 'romantic');
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});

describe('a withdrawn like, re-given, is not news (31 Aug, sixth pass)', () => {
  // A pass withdraws the like FLAG and keeps the TIMESTAMP (a-no-stays-a-no).
  // That made like -> pass -> like a `newLike` each time: a paid
  // re-notification loop at one person, twenty a day inside the allowance.
  // The timestamp is the memory - a pair this citizen has ever liked before
  // notifies nobody twice. The like itself still lands.
  it('re-liking after a withdrawal writes the like but sends nothing', async () => {
    const { svc, notifications, updates } = build(st({ likedByOne: false, likedAtOne: new Date('2026-08-30T00:00:00Z') }), plenty);
    await svc.like('me', 'them', 'romantic');
    expect(updates[0]).toMatchObject({ likedByOne: true });
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('a first like of the pair still notifies', async () => {
    const { svc, notifications } = build(st(), plenty);
    await svc.like('me', 'them', 'romantic');
    expect(notifications.create).toHaveBeenCalledTimes(1);
  });
});

describe('the daily super-like cannot be bypassed (blocker 09)', () => {
  it('super-liking someone you already liked is refused once the day is spent', async () => {
    const { svc, prisma, notifications } = build(st({ likedByOne: true }), noSupers);
    await expect(svc.like('me', 'them', 'romantic', { superLike: true })).rejects.toBeInstanceOf(BadRequestException);
    // Nothing was written and nobody was pushed — the flag never got set.
    expect(prisma.datingMatch.update).not.toHaveBeenCalled();
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('a genuine new super, within allowance, is applied and says so', async () => {
    const { svc, updates, notifications } = build(st({ likedByOne: true }), plenty);
    await svc.like('me', 'them', 'romantic', { superLike: true });
    expect(updates.some((u) => u.superByOne === true)).toBe(true);
    expect(notifications.create).toHaveBeenCalledTimes(1);
    const arg = (notifications.create as jest.Mock).mock.calls[0][0];
    expect(arg.title).toMatch(/super-liked/);
  });

  it('re-super-liking an already-super match is silent and free', async () => {
    const { svc, notifications } = build(st({ likedByOne: true, superByOne: true }), noSupers);
    await svc.like('me', 'them', 'romantic', { superLike: true });
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
