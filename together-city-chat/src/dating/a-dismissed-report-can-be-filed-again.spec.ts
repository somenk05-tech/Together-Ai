/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatingService } from './dating.service';

/**
 * ── A DISMISSED REPORT CAN BE FILED AGAIN (blocker 03) ───────────────────────
 *
 * The Report unique index is (reporterId, targetType, targetId) and NOT scoped
 * to status. Its comment said "one OPEN report per target"; the constraint did
 * not know the word. So once a moderator dismissed a report, a second create
 * hit P2002 and reportMatch returned duplicate:true — the UI said "a moderator
 * will look at this" while nothing was written and nobody was woken. Escalation
 * after a wrong dismissal was invisible.
 *
 * Now a resolved report is REOPENED and the moderators told again; a still-open
 * one stays a duplicate. This calls the method.
 */
function build(existingStatus: string | null) {
  const state = { row: existingStatus ? { id: 'r1', status: existingStatus } : null };
  const updates: any[] = [];
  const prisma: any = {
    user: { findUnique: jest.fn(async () => ({ id: 'them' })) },
    report: {
      create: jest.fn(async () => {
        if (state.row) { const e: any = new Error('unique'); e.code = 'P2002'; throw e; }
        state.row = { id: 'r1', status: 'open' };
        return state.row;
      }),
      findFirst: jest.fn(async () => state.row),
      update: jest.fn(async ({ data }: any) => { updates.push(data); state.row = { id: 'r1', status: data.status }; return state.row; }),
      count: jest.fn(async () => 1),
    },
    adminGrant: { findMany: jest.fn(async () => []) },  // tellModerators: nobody to wake, loop is a no-op
    notification: { create: jest.fn(async () => ({})) },
  };
  const svc = new DatingService(
    prisma as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, {} as never,
    { track: jest.fn(() => undefined) } as never,
    {} as never, { up: false } as never,
    { add: async () => false, handle: () => undefined, schedule: async () => false } as never,
  );
  return { svc, prisma, updates };
}

describe('a dismissed report can be filed again', () => {
  it('reopens a dismissed report and wakes the moderators again', async () => {
    const { svc, prisma, updates } = build('dismissed');
    const out = await svc.reportMatch('me', 'them', 'they escalated to threats') as any;
    expect(out).toEqual({ reported: true, reopened: true });
    expect(updates[0].status).toBe('open');
    expect(updates[0].reviewedById).toBeNull();
    expect(updates[0].decision).toBeNull();
    expect(updates[0].reason).toBe('they escalated to threats');
    // tellModerators ran (it counted reports) — the doorbell rang again.
    expect(prisma.report.count).toHaveBeenCalled();
  });

  it('reopens an actioned report too — a closed report of any kind can re-open', async () => {
    const { svc, updates } = build('actioned');
    const out = await svc.reportMatch('me', 'them') as any;
    expect(out.reopened).toBe(true);
    expect(updates[0].status).toBe('open');
  });

  it('a still-open report is a genuine repeat tap, not a re-file', async () => {
    const { svc, prisma } = build('open');
    const out = await svc.reportMatch('me', 'them') as any;
    expect(out).toEqual({ reported: true, duplicate: true });
    expect(prisma.report.update).not.toHaveBeenCalled();
  });

  it('the first report of a brand-new target is created normally', async () => {
    const { svc, prisma } = build(null);
    const out = await svc.reportMatch('me', 'them') as any;
    expect(out).toEqual({ reported: true });
    expect(prisma.report.create).toHaveBeenCalled();
  });
});
