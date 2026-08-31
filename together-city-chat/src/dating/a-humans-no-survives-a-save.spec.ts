/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── A HUMAN'S NO SURVIVES A SAVE (fifth audit, 31 Aug, H1) ──────────────────
 *
 * `upsertProfile` never read the prior `moderation`. It wrote `pending`, ran
 * the regex + AI check, and wrote whatever came back — so a profile a
 * moderator had taken down for catfishing or after reports was `approved`
 * again the moment its owner edited a word and pressed Save. The fraud score
 * adds ten per prior rejection and caps at thirty, so it could never hold it.
 *
 * The last HUMAN word is now read off the moderation log. A rejection that no
 * human has since reversed turns a machine `approved` into `review`. A
 * moderator's approval, or an overturned appeal, both write a human `approved`
 * and release the hold. The machine's own decisions are untouched.
 */

const APPROVED = () => ({
  decision: 'approved' as const, confidence: 1, score: 0, checks: [], reasons: [] as string[], decidedAt: '',
});

function build(lastHuman: { decision: string } | null | 'throws') {
  const prisma = {
    datingProfile: {
      findUnique: jest.fn(async () => ({ extras: '{}' })),
      upsert: jest.fn(async (a: any) => ({ userId: 'u1', ...a.update, moderationJson: null, interests: '' })),
      update: jest.fn(async () => ({})),
    },
    moderationLog: {
      findFirst: jest.fn(async (_q: unknown) => {
        if (lastHuman === 'throws') throw new Error('log unavailable');
        return lastHuman;
      }),
      create: jest.fn(async () => ({})),
    },
  };
  const svc = new DatingService(
    prisma as never,
    { syncShared: async () => undefined } as never,
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never,
    { statusOf: async () => ({}), fileAndReview: async () => undefined } as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => true, handle: () => undefined, schedule: async () => false } as never,
  );
  const s = svc as any;
  s.moderateProfile = jest.fn(async () => APPROVED());
  s.bumpListVersion = jest.fn(async () => undefined);
  s.photoUrlsAligned = jest.fn(async () => []);
  s.queueReindex = jest.fn();
  return { svc, prisma, s };
}

const dto = {
  gender: 'female' as const, seeking: 'any' as const, bio: 'A perfectly ordinary bio about hills and books.',
  birthDate: '1995-06-15', interests: ['Hills', 'Books', 'Tea'],
  extras: JSON.stringify({ sensitiveConsentAt: '2026-08-01T00:00:00Z', photos: [] }),
};

const written = (prisma: any) => prisma.datingProfile.update.mock.calls.at(-1)[0].data.moderation;

describe("a human's no survives a save", () => {
  it('holds a re-save for review when a moderator last rejected it', async () => {
    const { svc, prisma, s } = build({ decision: 'rejected' });
    const out = await svc.upsertProfile('u1', dto);
    expect(written(prisma)).toBe('review');
    expect(out.moderation).toBe('review');
    // The reader asked for the last non-system word, newest first.
    const q = prisma.moderationLog.findFirst.mock.calls[0][0] as { where: unknown; orderBy: unknown };
    expect(q.where).toEqual({ listingId: 'u1', NOT: { actor: 'system' } });
    expect(q.orderBy).toEqual({ createdAt: 'desc' });
    // And a held profile does not start a "new match" scan.
    expect(s.queueReindex).not.toHaveBeenCalled();
  });

  it('lets it through once a human has said approved since', async () => {
    const { svc, prisma } = build({ decision: 'approved' });
    await svc.upsertProfile('u1', dto);
    expect(written(prisma)).toBe('approved');
  });

  it('is not triggered by the machine’s own earlier rejections', async () => {
    // No human row at all — every prior decision was `system`. The citizen
    // fixed the sentence the machine named, and the machine clears it.
    const { svc, prisma } = build(null);
    await svc.upsertProfile('u1', dto);
    expect(written(prisma)).toBe('approved');
  });

  it('does not lose a save when the log cannot be read', async () => {
    const { svc, prisma } = build('throws');
    await expect(svc.upsertProfile('u1', dto)).resolves.toBeDefined();
    expect(written(prisma)).toBe('approved');
  });
});
