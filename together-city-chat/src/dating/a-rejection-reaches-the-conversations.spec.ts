/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── A REJECTION HAS TO REACH THE CONVERSATIONS (launch audit, 27 Aug) ──
 *
 * `moderateDecision` wrote two columns — `moderation` and `visible` — and
 * stopped. The caller gate landed the same day means a rejected profile can no
 * longer like, connect or reveal, so the hole is invisible from Discover. But
 * the send gate reads `DatingMatch.status` and never looks at `DatingProfile`,
 * so every chat the rejected person was already in stayed open.
 *
 * The scenario the fix exists for: a moderator establishes that a member is 16
 * and hits Reject. They leave the pool, and keep messaging the adults they had
 * already matched with, indefinitely, with nothing on the moderator's screen to
 * suggest otherwise.
 *
 * The second half is the age check. `decideAppeal` re-reads the stored date of
 * birth before it can reinstate anybody. This — the other door to `approved` —
 * did not, so the guard held on the path somebody thought about and not on the
 * path they did not.
 */
function build(birthDate: Date) {
  const archived: string[] = [];
  const updated: Array<{ id: string; data: any }> = [];
  const profileWrites: any[] = [];
  const prisma: any = {
    datingProfile: {
      findUnique: jest.fn(async ({ select }: any) => (select?.birthDate
        ? { birthDate }
        : { moderation: 'approved', visible: true })),
      updateMany: jest.fn(async ({ data }: any) => { profileWrites.push(data); return { count: 1 }; }),
    },
    datingMatch: {
      findMany: jest.fn(async () => [
        { id: 'chatted', conversationId: 'c1' },
        { id: 'pending', conversationId: null },
      ]),
      update: jest.fn(async ({ where, data }: any) => { updated.push({ id: where.id, data }); return {}; }),
      delete: jest.fn(async () => ({})),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    datingModerationLog: { create: jest.fn(async () => ({})) },
  };
  const conversations = { archiveForAll: jest.fn(async (id: string) => { archived.push(id); }) };
  // `act` runs the write only after the permission check it stands for.
  const access = { act: jest.fn(async (_spec: any, run: () => Promise<void>) => { await run(); }), assert: jest.fn(async () => undefined) };
  const svc = new DatingService(
    prisma as never, {} as never, conversations as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: () => undefined } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  (svc as any).access = access;
  (svc as any).logModeration = jest.fn(async () => undefined);
  return { svc, prisma, archived, updated, profileWrites, access };
}

const ADULT = new Date('1995-01-01');
const MINOR = new Date(Date.now() - 16 * 365.25 * 24 * 60 * 60 * 1000);

describe('rejecting a dating profile', () => {
  it('archives every chat it was in and takes the match off matched', async () => {
    const { svc, archived, updated } = build(ADULT);
    await svc.moderateDecision('mod', 'them', 'rejected', 'under age');
    expect(archived).toEqual(['c1']);
    const ended = updated.find((u) => u.id === 'chatted');
    expect(ended?.data.status).toBe('passed');
    expect(ended?.data.revealByOne).toBe(false);
    expect(ended?.data.revealByTwo).toBe(false);
  });

  it('leaves a match with no conversation alone — a rejection can be appealed', async () => {
    const { svc, prisma, updated } = build(ADULT);
    await svc.moderateDecision('mod', 'them', 'rejected', 'under age');
    expect(updated.map((u) => u.id)).not.toContain('pending');
    expect(prisma.datingMatch.delete).not.toHaveBeenCalled();
    expect(prisma.datingMatch.deleteMany).not.toHaveBeenCalled();
  });

  it('still writes the moderation decision itself', async () => {
    const { svc, profileWrites } = build(ADULT);
    await svc.moderateDecision('mod', 'them', 'rejected', 'under age');
    expect(profileWrites).toEqual([{ moderation: 'rejected', visible: false }]);
  });
});

describe('approving a dating profile', () => {
  it('does not touch the conversations — approval ends nothing', async () => {
    const { svc, archived, updated } = build(ADULT);
    await svc.moderateDecision('mod', 'them', 'approved', 'looks fine');
    expect(archived).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('refuses when the stored date of birth is under 18, and writes nothing at all', async () => {
    const { svc, profileWrites, access } = build(MINOR);
    await expect(svc.moderateDecision('mod', 'them', 'approved', 'looks fine'))
      .rejects.toThrow(/minimum age/i);
    expect(profileWrites).toEqual([]);
    // Refused before the audited write, so no audit row and no notification.
    expect(access.act).not.toHaveBeenCalled();
  });

  it('a rejection of the same under-age profile is still allowed — the check is on approving', async () => {
    const { svc, profileWrites } = build(MINOR);
    await svc.moderateDecision('mod', 'them', 'rejected', 'under age');
    expect(profileWrites).toEqual([{ moderation: 'rejected', visible: false }]);
  });
});
