import { DatingService } from './dating.service';

/**
 * The daily digest is also the alarm: a step whose share-of-previous falls
 * below half its seven-day figure puts that in the title, for everybody
 * holding a console role. Too few people to mean anything is not an alarm.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(dayRates: number[], weekRates: number[], weekUsers = 100, queues = { pending: 0, held: 0, appeals: 0, reports: 0 }) {
  const s: any = Object.create(DatingService.prototype);
  const mk = (rates: number[], users: number) => ({
    steps: ['dating.profile.started', 'dating.profile.approved', 'dating.matches.viewed', 'dating.like'].map((name, i) => ({
      name, users, events: users, ofPrevious: i === 0 ? null : rates[i - 1],
    })),
  });
  s.analytics = { funnel: async (days: number) => (days === 1 ? mk(dayRates, 30) : mk(weekRates, weekUsers)) };
  // The digest now also reads what is WAITING FOR A HUMAN, so the fake has to
  // answer those four counts. Keyed off the status asked for, because that is
  // the only thing distinguishing them.
  s.prisma = {
    adminGrant: { findMany: async () => [{ userId: 'founder' }, { userId: 'mod' }] },
    datingPhotoReview: { count: async (a: { where: { status: string } }) => (a.where.status === 'pending' ? queues.pending : queues.held) },
    appeal: { count: async () => queues.appeals },
    report: { count: async () => queues.reports },
  };
  const sent: Array<{ userId: string; title: string; body: string }> = [];
  s.notifications = { create: async (n: { userId: string; title: string; body: string }) => { sent.push(n); } };
  return { s, sent };
}

describe('the funnel digest', () => {
  it('reaches every console holder with yesterday, and no alarm on a steady week', async () => {
    const { s, sent } = build([80, 60, 40], [80, 60, 40]);
    const out = await s.funnelDigest();
    expect(out.recipients).toBe(2);
    expect(out.alarms).toEqual([]);
    expect(sent.map((n) => n.title)).toEqual(['Dating funnel, yesterday', 'Dating funnel, yesterday']);
  });

  /**
   * ── AND IT LOOKS AT THE QUEUES, NOT ONLY THE FUNNEL (27 Aug, launch audit) ─
   *
   * The digest alarmed only on funnel steps DROPPING BY HALF, skipped any step
   * with fewer than twenty weekly users, and never looked at reports, held
   * photos or appeals. So a ten-fold spike in reports was invisible by
   * construction — the alarm is one-directional — and in launch week, with
   * every step under twenty users, nothing could alarm about anything at all.
   *
   * Backlog counts need no week to compare against and no minimum to mean
   * something, which is exactly why they work when the funnel cannot.
   */
  it('alarms on a queue nobody is emptying, even with too few users to score', async () => {
    // weekUsers below the funnel's own threshold: the funnel half of this
    // digest is asleep, and the queue half still speaks.
    const { s, sent } = build([80, 60, 40], [80, 60, 40], 5, { pending: 12, held: 0, appeals: 0, reports: 3 });
    const out = await s.funnelDigest();
    expect(out.alarms).toEqual([
      '12 photos waiting on review — if this only grows, photo review is not running',
      '3 reports open',
    ]);
    expect(sent[0].title).toMatch(/2 steps dropped by half|Dating funnel/);
  });

  it('says nothing about queues that are empty', async () => {
    const { s, sent } = build([80, 60, 40], [80, 60, 40]);
    const out = await s.funnelDigest();
    expect(out.alarms).toEqual([]);
    // The counts still ride in the body, so a glance answers "is anything
    // waiting" without opening anything.
    expect(sent[0].body).toMatch(/queues: 0 reports, 0 photos pending, 0 held, 0 appeals/);
  });

  it('names the step that fell by half', async () => {
    const { s, sent } = build([80, 25, 40], [80, 60, 40]);
    const out = await s.funnelDigest();
    expect(out.alarms).toEqual(['dating.matches.viewed: 25% of previous, was 60% over the week']);
    expect(sent[0].title).toBe('Dating funnel: 1 step dropped by half');
  });

  it('does not raise an alarm over a handful of people', async () => {
    const { s } = build([80, 25, 40], [80, 60, 40], 5);
    expect((await s.funnelDigest()).alarms).toEqual([]);
  });
});
