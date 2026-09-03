/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DatingService } from './dating.service';

/**
 * ── AN APPEAL IS AGAINST A DECISION, AND THERE HAS TO HAVE BEEN ONE ─────────
 *
 * `appeal('dating_photo', key)` was gated on `StorageProvider.isOwnDatingKey`
 * alone — a `startsWith('dating/<me>/')` test on a string the client sends.
 * No lookup against DatingPhotoReview, no requirement that the photograph had
 * ever been uploaded, held or refused. And the duplicate guard is per-targetId,
 * so every fabricated key was a FRESH open appeal: five a minute, and
 * `appealQueue` takes the hundred OLDEST, so one citizen could push every real
 * appellant off the moderator's screen — the people whose photographs are
 * already down and who have no other way back.
 *
 * The row decides now, not the shape of the string.
 */
function svcWith(prisma: any) {
  return new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
}

const prismaWith = (review: unknown) => ({
  datingPhotoReview: { findUnique: jest.fn(async () => review) },
  appeal: {
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }: any) => ({ id: 'ap1', ...data })),
  },
});

describe('an appeal needs a decision to argue with', () => {
  it('refuses a key that has never been reviewed', async () => {
    const prisma = prismaWith(null);
    const svc = svcWith(prisma) as any;
    await expect(svc.appeal('me', 'dating_photo', 'dating/me/made-up.jpg', 'let me in'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appeal.create).not.toHaveBeenCalled();
  });

  it('refuses a review row that belongs to somebody else', async () => {
    // The key shape says "mine"; the row says otherwise, and the row wins.
    const prisma = prismaWith({ userId: 'someone-else', status: 'rejected' });
    const svc = svcWith(prisma) as any;
    await expect(svc.appeal('me', 'dating_photo', 'dating/me/theirs.jpg', 'x'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.appeal.create).not.toHaveBeenCalled();
  });

  it('refuses a photograph nothing has been done to', async () => {
    // Approved and pending are both honest refusals: nothing has been taken
    // away yet, so there is no decision to appeal.
    for (const status of ['approved', 'pending']) {
      const prisma = prismaWith({ userId: 'me', status });
      const svc = svcWith(prisma) as any;
      await expect(svc.appeal('me', 'dating_photo', 'dating/me/p.jpg', 'x'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.appeal.create).not.toHaveBeenCalled();
    }
  });

  it('accepts a refused photograph, which is what the door is for', async () => {
    for (const status of ['rejected', 'held']) {
      const prisma = prismaWith({ userId: 'me', status });
      const svc = svcWith(prisma) as any;
      const out = await svc.appeal('me', 'dating_photo', 'dating/me/p.jpg', 'it is my face');
      expect(out.status).toBe('open');
      expect(prisma.appeal.create).toHaveBeenCalled();
    }
  });

  it('still refuses a key outside the appellant’s own namespace', async () => {
    const prisma = prismaWith({ userId: 'me', status: 'rejected' });
    const svc = svcWith(prisma) as any;
    await expect(svc.appeal('me', 'dating_photo', 'dating/them/p.jpg', 'x'))
      .rejects.toBeInstanceOf(NotFoundException);
    // The namespace check comes first, so the row is never even read.
    expect(prisma.datingPhotoReview.findUnique).not.toHaveBeenCalled();
  });
});
