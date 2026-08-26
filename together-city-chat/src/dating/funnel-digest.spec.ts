import { DatingService } from './dating.service';

/**
 * The daily digest is also the alarm: a step whose share-of-previous falls
 * below half its seven-day figure puts that in the title, for everybody
 * holding a console role. Too few people to mean anything is not an alarm.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
function build(dayRates: number[], weekRates: number[], weekUsers = 100) {
  const s: any = Object.create(DatingService.prototype);
  const mk = (rates: number[], users: number) => ({
    steps: ['dating.profile.started', 'dating.profile.approved', 'dating.matches.viewed', 'dating.like'].map((name, i) => ({
      name, users, events: users, ofPrevious: i === 0 ? null : rates[i - 1],
    })),
  });
  s.analytics = { funnel: async (days: number) => (days === 1 ? mk(dayRates, 30) : mk(weekRates, weekUsers)) };
  s.prisma = { adminGrant: { findMany: async () => [{ userId: 'founder' }, { userId: 'mod' }] } };
  const sent: Array<{ userId: string; title: string }> = [];
  s.notifications = { create: async (n: { userId: string; title: string }) => { sent.push(n); } };
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
