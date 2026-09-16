/**
 * The investor dashboard's wire (owner, 16 Sep) — mirrors
 * together-city-chat/src/insights/insights.service.ts. A number is measured;
 * null is "could not be measured", and `status` says why.
 */
export type RangeKey = '24h' | '7d' | '30d' | '90d' | 'all';
export type MetricStatus = 'live' | 'not-measured' | 'not-enough-data';

export interface Change { pct: number | null; note: string | null }

export interface Metric {
  value: number | null;
  previous: number | null;
  change: Change;
  changeKind: 'pct' | 'pts';
  status: MetricStatus;
  note: string | null;
}

export interface Tracking { memberDays: string | null; origins: string | null; visitors: string | null }

export interface Overview {
  range: RangeKey; view: 'founder' | 'investor';
  from: string | null; to: string; prevFrom: string | null; prevTo: string | null;
  countingSince: string | null;
  tracking: Tracking;
  pulse: {
    members: Metric; activeToday: Metric; activeWeek: Metric; activeMonth: Metric;
    newMembers: Metric; growthRate: Metric; d7Retention: Metric; avgSession: Metric;
  };
  snapshot: {
    members: Metric; newMembers: Metric; activeWeek: Metric; d7Retention: Metric;
    systemsPerMember: Metric; aiUsers: Metric; paying: Metric; visitors: Metric;
  };
  changes: Array<{ key: string; label: string; change: Change; kind: 'pct' | 'pts' }>;
  growth: { points: Array<{ day: string; members: number; joined: number }>; milestones: Array<{ day: string; label: string }> };
  funnel: {
    activation: { minSystems: number; withinDays: number };
    retained: { activeWithinDays: number; joinedAtLeastDaysAgo: number };
    stages: Array<{ key: string; value: number | null; ofPrevious: number | null; change: Change; note: string | null }>;
  };
}

export interface SystemRow {
  key: string; label: string; users: number; interactions: number;
  perUser: number | null; adoption: number | null; trend7: Change; trend30: Change;
}

export interface CityActivity {
  range: RangeKey; from: string | null; to: string;
  activeMembers: number;
  systems: SystemRow[];
  depth: {
    average: number | null; of: number; activeMembers: number; membersUsingASystem: number;
    distribution: Array<{ systems: number; members: number }>;
  };
  engagement: {
    activeDaysPerMember: number | null; interactionsPerMember: number | null; aiPerMember: number | null;
    messagesPerSender: number | null; messages: number; returning: { members: number; of: number };
  };
}

export interface RetentionCell { day: number; rate: number | null; members: number; returned: number }
export interface Retention {
  definition: { days: number[]; width: Record<string, number>; cohort: string };
  overall: RetentionCell[];
  cohorts: Array<{ week: string; size: number; cells: RetentionCell[] }>;
}

export interface Folded { rows: Array<{ label: string; count: number }>; hidden: number }
export interface Reach {
  range: RangeKey; from: string | null; to: string; minGroup: number; tracking: Tracking;
  acquisition: {
    sources: Array<{ key: string; visitors: number; signups: number; activated: number; retained: number; signupRate: number | null; activationRate: number | null }>;
    untrackedSignups: number; untrackedVisitors: number;
  };
  geography: { india: Folded; abroad: Folded; indiaTotal: number; abroadTotal: number; unknown: number };
  demographics: { ages: Folded; agesUnknown: number; devices: Folded; apps: Folded };
}

export interface AiEngine {
  range: RangeKey; from: string | null; to: string;
  conversations: number; messages: number; replies: number; members: number;
  perMember: number | null; avgConversation: number | null; continuationRate: number | null;
  returningMembers: number; adoption: number | null;
  calls: { available: boolean; calls: number | null; tokensIn: number | null; tokensOut: number | null;
    byModel: Array<{ model: string; calls: number; tokensIn: number; tokensOut: number }> };
  economics: { costPerActiveMember: number | null; costPerConversation: number | null; monthlyEstimate: number | null; note: string };
  latency: { status: MetricStatus; note: string };
  failures: { status: MetricStatus; note: string };
}

export interface Money {
  monetised: boolean; paymentsLive: boolean; note: string;
  mrr: Metric; arr: Metric; paying: Metric; conversion: Metric; arpu: Metric; cac: Metric; ltv: Metric; grossMargin: Metric;
  intent: { subscribers: number; charges: number; creditInr: number | null };
  plans: Array<{ key: string; label: string; priceInr: number }>;
}

export interface Health {
  status: 'operational' | 'degraded' | 'incident';
  since: string; uptimeSeconds: number;
  database: { ok: boolean; ms: number };
  requests: number; failedRequests: number; successRate: number | null; p50ms: number | null; p95ms: number | null;
  timeline: Array<{ at: string; requests: number; errors: number }>;
  notMeasured: string[];
}

export interface Live { items: Array<{ at: string; label: string }> }

export interface Sections {
  overview: Overview; city: CityActivity; retention: Retention; reach: Reach;
  ai: AiEngine; money: Money; health: Health; live: Live;
}
export type SectionKey = keyof Sections;
