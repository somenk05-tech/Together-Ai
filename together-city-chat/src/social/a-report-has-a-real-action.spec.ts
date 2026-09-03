/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs';
import { join } from 'path';
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
    post: {
      updateMany: jest.fn(async () => ({ count: 1 })),
      findUnique: jest.fn(async () => ({ authorId: 'author' })),
    },
    comment: {
      findUnique: jest.fn(async () => ({ authorId: 'author', postId: 'p1', text: 'the words that were reported' })),
      delete: jest.fn(async () => ({})),
    },
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
    expect(reportUpdates[0].status).toBe('actioned');
  });

  /**
   * ── THE NOTE IS FOR THE NEXT MODERATOR, AND IT NEVER LEAVES (this audit) ────
   *
   * The field is labelled "Note for the next moderator (optional)" in the
   * console and schema.prisma says of the column it lands in: "The moderator's
   * note. Read by nobody but the next moderator." It was then sent verbatim as
   * the BODY of the warning push. A note reading "third report this week,
   * latest from @priya about the DMs" was delivered to the person the report
   * was about — naming the reporter, on the one surface built to keep reporters
   * unnameable. The citizen gets a fixed sentence; the note goes to the audit.
   */
  it('never delivers the moderator’s note to the person it is about', async () => {
    const { svc, notifs, access } = build();
    const note = 'third report this week, latest from @priya about the DMs';
    await svc.reportDecide('mod', { targetType: 'user', targetId: 'bad', decision: 'warn', note });
    expect(notifs[0].body).not.toContain('priya');
    expect(notifs[0].body).not.toContain(note);
    expect(notifs[0].body).toContain('community guidelines');
    // It is not lost — it is the reason on the audit row, which is where it was
    // always meant to be read.
    expect(access.act.mock.calls[0][0].reason).toBe(note);
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

  /**
   * ── NOTHING HAPPENS SILENTLY, AND THAT MEANS EVERY VERDICT ─────────────────
   *
   * `moderation.act` is on MUST_AUDIT and permissions.ts promises that a
   * handler which declares one and does not record fails this suite. Three of
   * the five verdicts went straight to Prisma: removing a post, HARD-DELETING a
   * comment, and dismissing — the last of which closes every open report about
   * a target and was the one with no record at all. So a moderator could clear
   * the whole queue and the audit log would show an empty evening.
   *
   * Asserted per verdict rather than "the method calls act somewhere", because
   * "somewhere" is exactly what was true while three branches skipped it.
   */
  const DECIDES = [
    { decision: 'remove', targetType: 'post', action: 'report.post.remove' },
    { decision: 'remove', targetType: 'comment', action: 'report.comment.remove' },
    { decision: 'dismiss', targetType: 'post', action: 'report.dismiss' },
    { decision: 'warn', targetType: 'user', action: 'report.user.warn' },
    { decision: 'suspend', targetType: 'user', action: 'report.user.suspend' },
    { decision: 'avatar', targetType: 'user', action: 'report.user.avatar' },
  ] as const;

  it.each(DECIDES)('$decision on a $targetType writes exactly one audit row', async ({ decision, targetType, action }) => {
    const { svc, access } = build();
    await svc.reportDecide('mod', { targetType, targetId: 't1', decision: decision as any, note: 'why' });
    expect(access.act).toHaveBeenCalledTimes(1);
    expect(access.act.mock.calls[0][0].action).toBe(action);
    expect(access.act.mock.calls[0][0].reason).toBe('why');
  });

  it('deleting a comment puts its words into the audit row, because the row is all that is left', async () => {
    // A comment is a HARD delete — deleteComment says why, and says the
    // reversible version needs a `moderation` column on Comment. Until that
    // exists the audit row is the only surviving copy of the evidence, so
    // `before` carries the text rather than a boolean.
    const { svc, access, prisma } = build();
    await svc.reportDecide('mod', { targetType: 'comment', targetId: 'c1', decision: 'remove', note: 'slur' });
    expect(access.act.mock.calls[0][0].before.text).toBe('the words that were reported');
    expect(prisma.comment.delete).toHaveBeenCalled();
  });

  it('exercises every verdict the route will accept', () => {
    // A new decision added to the enum without a row above would ship
    // unaudited, which is the whole shape of this defect.
    const controller = readFileSync(join(__dirname, 'social.controller.ts'), 'utf8');
    const enumLine = /decision: z\.enum\(\[([^\]]+)\]\)/.exec(controller);
    const offered = (enumLine?.[1] ?? '').split(',').map((v) => v.trim().replace(/'/g, '')).filter(Boolean).sort();
    expect([...new Set(DECIDES.map((d) => d.decision))].sort()).toEqual(offered);
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
