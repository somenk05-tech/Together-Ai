/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── A NO STAYS A NO (fifth audit, 31 Aug, medium 1) ─────────────────────────
 *
 * `unmatch` has cleared the likes since 27 Aug, and the reason written above
 * it applied to two siblings that did not:
 *
 *   · `pass` left the passer's own like standing, so like-then-pass was a
 *     withdrawn like that could still MATCH: the other person's later ♡
 *     walked through `alreadyLiked` and flipped the row, "It's a match!" with
 *     somebody who had changed their mind.
 *   · `blockMatch` left BOTH likes standing, so block → unblock (from the
 *     People hub) → their single like re-opened the archived chat, against
 *     the strongest no in the product.
 *   · `undoLastPass` ran no target gate at all and could rebuild a live row
 *     towards somebody who had since blocked the undoer or been taken down.
 *
 * The pass clears the FLAG and keeps the TIMESTAMP: `likeAllowance` counts
 * spent likes by `likedAt*`, so clearing the time would refund the like and
 * make like → pass → like a free push loop at one person. Spent stays spent.
 */

function svcWith(prisma: any, blocking: any = { blockedWith: async () => [] }) {
  return new DatingService(
    prisma as never, {} as never,
    { archiveForAll: async () => undefined } as never, {} as never,
    {} as never, {} as never, {} as never, blocking as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
}

describe('a no stays a no', () => {
  it('a pass withdraws the passer’s own like — flag off, timestamp kept', async () => {
    const updates: any[] = [];
    const prisma = {
      datingMatch: {
        findFirst: jest.fn(async () => null),
        update: jest.fn(async ({ data }: any) => { updates.push(data); return {}; }),
      },
    };
    const svc = svcWith(prisma) as any;
    svc.assertMayReach = async () => undefined;
    svc.assertWritable = async () => undefined;
    svc.assertReachable = async () => undefined;
    svc.bumpListVersion = async () => undefined;
    svc.cachePairScore = async () => undefined;
    svc.upsertState = async () => ({ id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'pending', likedByOne: true, likedAtOne: new Date() });

    await svc.pass('me', 'them', 'romantic');
    const data = updates[0];
    expect(data.likedByOne).toBe(false);
    // The timestamp is the allowance's ledger — it is not touched.
    expect(data).not.toHaveProperty('likedAtOne');
    // The other side's like is theirs; a pass says nothing about it.
    expect(data).not.toHaveProperty('likedByTwo');
  });

  it('a block clears the likes the way an unmatch does', async () => {
    const updates: any[] = [];
    const prisma = {
      datingMatch: {
        findFirst: jest.fn(async () => ({ id: 'm1', userOneId: 'me', userTwoId: 'them', status: 'matched', conversationId: 'c1', likedByOne: true, likedByTwo: true })),
        update: jest.fn(async ({ data }: any) => { updates.push(data); return {}; }),
      },
    };
    const blocking = { block: jest.fn(async () => ({ blocked: true, userId: 'them' })), blockedWith: async () => [] };
    const svc = svcWith(prisma, blocking) as any;
    svc.bumpListVersion = async () => undefined;

    await svc.blockMatch('me', 'them', 'romantic');
    const data = updates[0];
    expect(data.status).toBe('passed');
    expect(data.likedByOne).toBe(false);
    expect(data.likedByTwo).toBe(false);
    expect(data.likedAtOne).toBeNull();
    expect(data.likedAtTwo).toBeNull();
    expect(data.superByOne).toBe(false);
    expect(data.superByTwo).toBe(false);
  });

  it('an undo towards somebody who can no longer be reached undoes nothing', async () => {
    const passRow = {
      id: 'm1', userOneId: 'me', userTwoId: 'them',
      passedAtOne: new Date(), passedAtTwo: null, likedByOne: false, likedByTwo: true,
    };
    const prisma = {
      datingMatch: {
        findFirst: jest.fn(async ({ where }: any) => (where.userOneId === 'me' && where.passedByOne ? passRow : null)),
        update: jest.fn(),
      },
      // The target still exists, but assertWritable refuses (blocked / taken
      // down / hidden — undo is not told which, and neither is the undoer).
      datingProfile: { findUnique: jest.fn(async () => null) },
      user: { findUnique: jest.fn(async () => ({ id: 'them', deletedAt: null })) },
    };
    const svc = svcWith(prisma) as any;
    svc.bumpListVersion = async () => undefined;
    svc.stillHere = async () => true;

    const out = await svc.undoLastPass('me', 'romantic');
    expect(out.undone).toBe(false);
    expect(out.reason).toContain('no longer be reached');
    expect(prisma.datingMatch.update).not.toHaveBeenCalled();
  });
});
