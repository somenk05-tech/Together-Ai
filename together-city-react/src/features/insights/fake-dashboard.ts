import type { Change, Metric, RangeKey, SectionKey, Sections } from './types';

/**
 * ── SAMPLE DATA — NOT TOGETHER CITY'S NUMBERS ──────────────────────────────
 *
 * A declared invented dataset, which is what the `fake-` prefix means to
 * nav-audit: the one file in the dashboard allowed to hold made-up numbers.
 *
 * Returned only when the page's "Sample data" switch is on, so the layout can
 * be seen full before the city has the history to fill it. Every answer is
 * marked `sample: true` and every card showing one says SAMPLE. The numbers
 * are round on purpose and describe no real member. Nothing outside api.ts
 * imports this file.
 */
const ch = (pct: number | null): Change => ({ pct, note: pct === null ? 'Sample' : null });
const m = (value: number, pct: number | null, kind: 'pct' | 'pts' = 'pct'): Metric =>
  ({ value, previous: null, change: ch(pct), changeKind: kind, status: 'live', note: 'Sample data' });

const days = (n: number) => {
  const out: string[] = [];
  const t = Date.UTC(2026, 8, 16);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(t - i * 86_400_000).toISOString().slice(0, 10));
  return out;
};

const SYSTEMS = [
  ['assistant', 'City Assistant', 720, 4400], ['astrology', 'Astrology', 610, 2300], ['dating', 'Find Love', 540, 3100],
  ['nutrition', 'Nutrition', 480, 2200], ['fitness', 'Fitness', 420, 1900], ['beauty', 'Hair & Skin', 380, 1200],
  ['medical', 'Medical Records', 310, 700], ['pets', 'Pets', 270, 600],
] as const;

export function sampleOf<K extends SectionKey>(section: K, range: RangeKey): Sections[K] & { sample: true } {
  const span = range === '24h' ? 2 : range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 120;
  const s: { [X in SectionKey]: () => Sections[X] } = {
    overview: () => ({
      range, view: 'investor', from: days(span)[0], to: '2026-09-16', prevFrom: null, prevTo: null,
      countingSince: '2026-05-01T00:00:00.000Z',
      tracking: { memberDays: '2026-05-01', origins: '2026-05-01T00:00:00.000Z', visitors: '2026-05-01T00:00:00.000Z' },
      pulse: {
        members: m(1000, 38), activeToday: m(180, 6), activeWeek: m(520, 12), activeMonth: m(760, 9),
        newMembers: m(140, 24), growthRate: m(16.3, 2.1, 'pts'), d7Retention: m(54, 4.2, 'pts'),
        avgSession: m(420, 8),
      },
      snapshot: {
        members: m(1000, 38), newMembers: m(140, 24), activeWeek: m(520, 12), d7Retention: m(54, 4.2, 'pts'),
        systemsPerMember: m(4.7, null), aiUsers: m(720, 31), paying: { ...m(0, null), value: null, status: 'not-measured' }, visitors: m(5400, 18),
      },
      changes: [
        { key: 'members', label: 'Members', change: ch(18), kind: 'pct' },
        { key: 'active', label: 'Active members', change: ch(12), kind: 'pct' },
        { key: 'ai', label: 'City Assistant use', change: ch(31), kind: 'pct' },
        { key: 'signups', label: 'New members', change: ch(24), kind: 'pct' },
        { key: 'interactions', label: 'Interactions', change: ch(19), kind: 'pct' },
      ],
      growth: {
        points: days(span).map((day, i) => ({ day, members: Math.round(1000 - (span - 1 - i) * (860 / 120)), joined: 7 })),
        // The milestone sits on the day the invented line really crosses 900.
        milestones: [{ day: days(span)[Math.max(0, span - 1 - Math.floor(100 / (860 / 120)))], label: 'Member 900 (sample)' }],
      },
      funnel: {
        activation: { minSystems: 2, withinDays: 7 },
        retained: { activeWithinDays: 7, joinedAtLeastDaysAgo: 14 },
        stages: [
          ['visitors', 5400], ['signups', 1080], ['members', 1000], ['activated', 640], ['weekly', 420], ['retained', 300],
        ].map(([key, value], i, all) => ({
          key: key as string, value: value as number | null, note: null as string | null,
          ofPrevious: i ? Math.round(((value as number) / (all[i - 1][1] as number)) * 1000) / 10 : null, change: ch(null),
        })).concat([{ key: 'paying', value: null, note: 'Sample: not monetised', ofPrevious: null, change: ch(null) }]),
      },
    }),
    city: () => ({
      range, from: null, to: '2026-09-16', activeMembers: 1000,
      systems: SYSTEMS.map(([key, label, users, n]) => ({
        key, label, users, interactions: n, perUser: Math.round((n / users) * 10) / 10,
        adoption: Math.round((users / 1000) * 1000) / 10, trend7: ch(8), trend30: ch(21),
      })),
      depth: {
        average: 4.7, of: 8, activeMembers: 1000, membersUsingASystem: 1000,
        distribution: [60, 90, 150, 200, 210, 150, 90, 50].map((members, i) => ({ systems: i + 1, members })),
      },
      engagement: { activeDaysPerMember: 9.4, interactionsPerMember: 16.4, aiPerMember: 6.1, messagesPerSender: 22, messages: 12000, returning: { members: 640, of: 760 } },
    }),
    retention: () => ({
      definition: { days: [1, 7, 14, 30], width: { 1: 1, 7: 7, 14: 7, 30: 7 }, cohort: 'city week, Monday start' },
      overall: [82, 54, 42, 31].map((rate, i) => ({ day: [1, 7, 14, 30][i], rate, members: 900, returned: Math.round(rate * 9) })),
      cohorts: ['2026-09-07', '2026-08-31', '2026-08-24', '2026-08-17', '2026-08-10', '2026-08-03'].map((week, w) => ({
        week, size: 120 + w * 10,
        cells: [1, 7, 14, 30].map((day, i) => {
          const mature = [0, 7, 14, 30][i] <= w * 7;
          return { day, rate: mature || i === 0 ? [82, 54, 42, 31][i] - w : null, members: 120, returned: 60 };
        }),
      })),
    }),
    reach: () => ({
      range, from: null, to: '2026-09-16', minGroup: 3,
      tracking: { memberDays: '2026-05-01', origins: '2026-05-01T00:00:00.000Z', visitors: '2026-05-01T00:00:00.000Z' },
      acquisition: {
        sources: [['direct', 1800, 360], ['google', 1200, 240], ['instagram', 1400, 250], ['youtube', 500, 90], ['referral', 300, 110], ['paid_social', 150, 20], ['other', 50, 10]]
          .map(([key, visitors, signups]) => ({
            key: key as string, visitors: visitors as number, signups: signups as number,
            activated: Math.round((signups as number) * 0.6), retained: Math.round((signups as number) * 0.3),
            signupRate: Math.round(((signups as number) / (visitors as number)) * 1000) / 10, activationRate: 60,
          })),
        untrackedSignups: 0, untrackedVisitors: 0,
      },
      geography: {
        india: { rows: [['Mumbai', 260], ['Delhi', 210], ['Bengaluru', 180], ['Hyderabad', 90], ['Pune', 80], ['Chennai', 60], ['Kolkata', 40], ['Other', 50]].map(([label, count]) => ({ label: label as string, count: count as number })), hidden: 0 },
        abroad: { rows: [{ label: 'UAE', count: 20 }, { label: 'UK', count: 10 }], hidden: 0 },
        indiaTotal: 970, abroadTotal: 30, unknown: 0,
      },
      demographics: {
        ages: { rows: [['18–24', 180], ['25–34', 450], ['35–44', 250], ['45–54', 90], ['55+', 30]].map(([label, count]) => ({ label: label as string, count: count as number })), hidden: 0 },
        agesUnknown: 0,
        devices: { rows: [{ label: 'phone', count: 3900 }, { label: 'desktop', count: 1300 }, { label: 'tablet', count: 200 }], hidden: 0 },
        apps: { rows: [{ label: 'ios', count: 300 }, { label: 'android', count: 420 }], hidden: 0 },
      },
    }),
    ai: () => ({
      range, from: null, to: '2026-09-16', conversations: 1400, messages: 4400, replies: 4400, members: 720,
      perMember: 6.1, avgConversation: 3.1, continuationRate: 64, returningMembers: 510, adoption: 72,
      calls: { available: true, calls: 9800, tokensIn: 5_200_000, tokensOut: 1_100_000, byModel: [] },
      economics: { costPerActiveMember: 14, costPerConversation: 7, monthlyEstimate: 10_000, note: 'Sample data' },
      latency: { status: 'live', note: 'Sample' }, failures: { status: 'live', note: 'Sample' },
    }),
    money: () => ({
      monetised: false, paymentsLive: false, note: 'Sample: not yet monetised.',
      mrr: { ...m(0, null), value: null, status: 'not-measured' }, arr: { ...m(0, null), value: null, status: 'not-measured' },
      paying: { ...m(0, null), value: null, status: 'not-measured' }, conversion: { ...m(0, null), value: null, status: 'not-measured' },
      arpu: { ...m(0, null), value: null, status: 'not-measured' }, cac: { ...m(0, null), value: null, status: 'not-measured' },
      ltv: { ...m(0, null), value: null, status: 'not-measured' }, grossMargin: { ...m(0, null), value: null, status: 'not-measured' },
      intent: { subscribers: 40, charges: 52, creditInr: null },
      plans: [{ key: 'assistant-30d', label: 'City Assistant, 30 days', priceInr: 999 }],
    }),
    health: () => ({
      status: 'operational', since: '2026-09-16T00:00:00.000Z', uptimeSeconds: 86_400,
      database: { ok: true, ms: 4 }, requests: 48_000, failedRequests: 12, successRate: 99.97, p50ms: 38, p95ms: 210,
      timeline: Array.from({ length: 48 }, (_, i) => ({ at: new Date(Date.UTC(2026, 8, 15, 6) + i * 30 * 60_000).toISOString(), requests: 1000, errors: i === 30 ? 6 : 0 })),
      notMeasured: [],
    }),
    live: () => ({
      items: ['A member joined Together City', 'A nutrition plan was made', 'A City Assistant conversation started', 'A workout was logged', 'An astrology reading was made']
        .map((label, i) => ({ at: new Date(Date.UTC(2026, 8, 16, 7, 42) - i * 5 * 60_000).toISOString(), label })),
    }),
  };
  return { ...s[section](), sample: true } as Sections[K] & { sample: true };
}
