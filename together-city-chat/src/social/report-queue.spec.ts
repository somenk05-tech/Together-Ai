/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SocialService } from './social.service';

/**
 * The queue and the decision, against an in-memory Prisma.
 *
 * These are the two things a moderator touches, and the two places where being
 * wrong is expensive: a queue that buries the ten-report post under nine old
 * singletons, and a decision that says "removed" without removing anything.
 */
type Report = {
  id: string; reporterId: string; targetType: string; targetId: string;
  reason: string | null; createdAt: Date; status: string;
  reviewedById?: string | null; reviewedAt?: Date | null; decision?: string | null;
};

function stub(reports: Report[], posts: Array<{ id: string; authorId: string; moderation: string }> = []) {
  const match = (r: Report, where: any) =>
    (where.status === undefined || r.status === where.status)
    && (where.targetType === undefined || r.targetType === where.targetType)
    && (where.targetId === undefined || r.targetId === where.targetId);

  const prisma = {
    report: {
      findMany: async ({ where }: any) => reports.filter((r) => match(r, where ?? {})),
      updateMany: async ({ where, data }: any) => {
        const hit = reports.filter((r) => match(r, where ?? {}));
        for (const r of hit) Object.assign(r, data);
        return { count: hit.length };
      },
    },
    post: {
      findUnique: async ({ where }: any) => posts.find((p) => p.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const hit = posts.filter((p) => p.id === where.id);
        for (const p of hit) Object.assign(p, data);
        return { count: hit.length };
      },
    },
    user: { findUnique: async () => null },
    comment: { findUnique: async () => null },
  } as any;
  return prisma;
}

// The report queue is on the AdminGrant/permission system now (finding 11), so
// the gate is access.assert(need), not admin.assertAdmin.
const admin = {
  assert: jest.fn(async () => ['moderator']),
  act: jest.fn(async (_i: unknown, run: () => Promise<unknown>) => run()),
};
const notAdmin = {
  assert: jest.fn(async () => { throw new ForbiddenException('This needs the "moderation.act" permission.'); }),
  act: jest.fn(async (_i: unknown, run: () => Promise<unknown>) => run()),
};

const svc = (prisma: any, a: unknown = admin) =>
  new SocialService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, a as never);

const at = (iso: string) => new Date(iso);
const rep = (over: Partial<Report>): Report => ({
  id: 'r', reporterId: 'u1', targetType: 'post', targetId: 'p1',
  reason: null, createdAt: at('2026-07-01T10:00:00Z'), status: 'open', ...over,
});

describe('reportQueue', () => {
  it('refuses anyone who is not a moderator', async () => {
    await expect(svc(stub([]), notAdmin).reportQueue('nobody')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('groups reports by what they are about', async () => {
    const q = await svc(stub([
      rep({ id: 'a', reporterId: 'u1', targetId: 'p1' }),
      rep({ id: 'b', reporterId: 'u2', targetId: 'p1' }),
      rep({ id: 'c', reporterId: 'u3', targetId: 'p2' }),
    ])).reportQueue('mod');
    expect(q.openTotal).toBe(3);
    expect(q.items).toHaveLength(2);
    expect(q.items[0].targetId).toBe('p1');
    expect(q.items[0].reportCount).toBe(2);
  });

  it('counts a person once however many times they report the same thing', async () => {
    const q = await svc(stub([
      rep({ id: 'a', reporterId: 'u1' }),
      rep({ id: 'b', reporterId: 'u1' }),
      rep({ id: 'c', reporterId: 'u1' }),
    ])).reportQueue('mod');
    expect(q.items[0].reportCount).toBe(3);
    expect(q.items[0].distinctReporters).toBe(1);
  });

  it('never hands back who reported anything', async () => {
    const q = await svc(stub([rep({ reporterId: 'secret-user' })])).reportQueue('mod');
    expect(JSON.stringify(q)).not.toContain('secret-user');
  });

  it('puts the most-reported first, and the oldest ahead of a tie', async () => {
    const q = await svc(stub([
      rep({ id: 'a', reporterId: 'u1', targetId: 'lonely', createdAt: at('2026-06-01T10:00:00Z') }),
      rep({ id: 'b', reporterId: 'u1', targetId: 'busy', createdAt: at('2026-07-01T10:00:00Z') }),
      rep({ id: 'c', reporterId: 'u2', targetId: 'busy', createdAt: at('2026-07-01T11:00:00Z') }),
      rep({ id: 'd', reporterId: 'u3', targetId: 'older', createdAt: at('2026-05-01T10:00:00Z') }),
    ])).reportQueue('mod');
    expect(q.items.map((i) => i.targetId)).toEqual(['busy', 'older', 'lonely']);
  });

  it('leaves reports somebody already decided out of it', async () => {
    const q = await svc(stub([
      rep({ id: 'a', status: 'dismissed' }),
      rep({ id: 'b', status: 'actioned' }),
    ])).reportQueue('mod');
    expect(q.openTotal).toBe(0);
    expect(q.items).toEqual([]);
  });

  it('says so when the reported thing is already gone', async () => {
    const q = await svc(stub([rep({ targetId: 'deleted-post' })])).reportQueue('mod');
    expect(q.items[0].subject).toEqual({ kind: 'post', gone: true });
  });
});

describe('reportDecide', () => {
  const posts = () => [{ id: 'p1', authorId: 'author', moderation: 'visible' }];

  it('refuses anyone who is not a moderator', async () => {
    await expect(
      svc(stub([]), notAdmin).reportDecide('nobody', { targetType: 'post', targetId: 'p1', decision: 'dismiss' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes the post and closes every open report about it', async () => {
    const reports = [rep({ id: 'a', reporterId: 'u1' }), rep({ id: 'b', reporterId: 'u2' })];
    const p = posts();
    const out = await svc(stub(reports, p)).reportDecide('mod', {
      targetType: 'post', targetId: 'p1', decision: 'remove', note: 'harassment',
    });
    expect(out).toEqual({ decided: 'remove', reportsClosed: 2 });
    expect(p[0].moderation).toBe('removed');
    expect(reports.every((r) => r.status === 'actioned')).toBe(true);
    expect(reports[0].reviewedById).toBe('mod');
    expect(reports[0].decision).toBe('harassment');
  });

  it('dismissing closes the reports and touches nothing else', async () => {
    const reports = [rep({ id: 'a' })];
    const p = posts();
    const out = await svc(stub(reports, p)).reportDecide('mod', {
      targetType: 'post', targetId: 'p1', decision: 'dismiss',
    });
    expect(out).toEqual({ decided: 'dismiss', reportsClosed: 1 });
    expect(p[0].moderation).toBe('visible');
    expect(reports[0].status).toBe('dismissed');
  });

  it('will not remove an account from here, however it is asked', async () => {
    for (const targetType of ['user', 'comment'] as const) {
      await expect(
        svc(stub([], posts())).reportDecide('mod', { targetType, targetId: 'x', decision: 'remove' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('says so when the post has already been deleted', async () => {
    await expect(
      svc(stub([rep({})], [])).reportDecide('mod', { targetType: 'post', targetId: 'p1', decision: 'remove' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
