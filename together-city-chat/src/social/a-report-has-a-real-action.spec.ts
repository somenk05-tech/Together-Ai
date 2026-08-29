/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException } from '@nestjs/common';
import { SocialService } from './social.service';

/**
 * ── A REPORT ABOUT A PERSON HAS A REAL ACTION (third audit, 04 and 11) ───────
 *
 * 11  The report queue gated on User.role (MODERATION_ADMINS) while the dating
 *     console gated on AdminGrant permissions (CONSOLE_FOUNDERS) — two systems,
 *     never reconciled, so tellModerators could ring an inbox the queue then
 *     403'd. reportQueue and reportDecide are on the AdminGrant/permission
 *     system now: `moderation.read` to read, `moderation.act` to act.
 *
 * 04  A report about a person could ONLY be dismissed. Now a moderator can WARN
 *     (a message the person reads) or SUSPEND (suspendedAt set, closed until an
 *     admin restores) from the same queue — both under moderation.act, audited.
 *
 * These call the method with an access stub that grants or refuses the
 * permission, exactly as the real AdminAccessService does.
 */
function build(opts: { granted?: boolean } = {}) {
  const granted = opts.granted !== false;
  const users: any[] = [];
  const notifs: any[] = [];
  const reportUpdates: any[] = [];
  const prisma: any = {
    user: { updateMany: jest.fn(async ({ data }: any) => { users.push(data); return { count: 1 }; }) },
    post: { updateMany: jest.fn(async () => ({ count: 1 })) },
    report: { updateMany: jest.fn(async ({ data }: any) => { reportUpdates.push(data); return { count: 2 }; }) },
  };
  const notifications = { create: jest.fn(async (n: any) => { notifs.push(n); return {}; }) };
  const access = {
    assert: jest.fn(async (_id: string, _need: string) => {
      if (!granted) throw new ForbiddenException('This needs the "moderation.act" permission.');
      return ['moderator'];
    }),
    act: jest.fn(async (input: any, run: () => Promise<unknown>) => {
      if (!granted) throw new ForbiddenException('This needs the "moderation.act" permission.');
      return run();
    }),
  };
  const svc = new SocialService(
    prisma, {} as never, notifications as never, {} as never, {} as never, {} as never, access as never,
  );
  return { svc, prisma, access, users, notifs, reportUpdates };
}

describe('a report about a person has a real action', () => {
  it('suspend closes the account and marks the reports actioned', async () => {
    const { svc, prisma, users, reportUpdates } = build();
    const out = await svc.reportDecide('mod', { targetType: 'user', targetId: 'bad', decision: 'suspend', note: 'threats' }) as any;
    expect(out.decided).toBe('suspend');
    expect(users[0].suspendedAt).toBeInstanceOf(Date);
    expect(users[0].suspendedReason).toBe('threats');
    expect(prisma.user.updateMany).toHaveBeenCalled();
    expect(reportUpdates[0].status).toBe('actioned');
  });

  it('warn notifies the person, names no reporter, and marks the reports actioned', async () => {
    const { svc, notifs, reportUpdates } = build();
    await svc.reportDecide('mod', { targetType: 'user', targetId: 'bad', decision: 'warn', note: 'be kind' });
    expect(notifs[0].userId).toBe('bad');
    // No reporter identity travels with it — the notification carries no actor.
    expect(notifs[0].actorId).toBeUndefined();
    expect(notifs[0].body).toContain('be kind');
    expect(reportUpdates[0].status).toBe('actioned');
  });

  it('dismiss still marks the reports dismissed', async () => {
    const { svc, reportUpdates } = build();
    await svc.reportDecide('mod', { targetType: 'user', targetId: 'ok', decision: 'dismiss' });
    expect(reportUpdates[0].status).toBe('dismissed');
  });

  it('warn and suspend are refused for a post — they act on an account', async () => {
    const { svc } = build();
    await expect(svc.reportDecide('mod', { targetType: 'post', targetId: 'p', decision: 'suspend' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.reportDecide('mod', { targetType: 'post', targetId: 'p', decision: 'warn' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('every decision is refused without the moderation.act permission (finding 11)', async () => {
    const { svc, prisma } = build({ granted: false });
    await expect(svc.reportDecide('nobody', { targetType: 'user', targetId: 'x', decision: 'suspend' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('the queue is gated on moderation.read', async () => {
    const { svc, access } = build();
    // reportQueue reads the queue; assert that it asks for the read permission.
    // `count` joined the queue on 30 Aug: openTotal used to be the length of the
    // page, so a brigade of 900 reports read as "500 open".
    const prismaQ: any = { report: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), count: jest.fn(async () => 0) } };
    (svc as any).prisma = prismaQ;
    await svc.reportQueue('mod');
    expect(access.assert).toHaveBeenCalledWith('mod', 'moderation.read');
  });
});
