import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';

/**
 * ── THE CONTENT ANALYTICS, AS THE PAGE READS IT (owner, 17 Sep) ────────────
 *
 * Every number is the server's (broadcast/content-analytics.service.ts). A
 * null is "not measured" and always arrives with the reason; the page never
 * turns one into a zero.
 */
const withPassword = (password: string, params?: Record<string, string>) =>
  ({ headers: { 'x-dev-password': password }, params });

export type RangeKey = 'today' | '7d' | '30d' | '90d' | '6m' | 'all' | 'custom';
export interface Filters {
  range: RangeKey; from?: string; to?: string;
  platform?: string; topic?: string; series?: string; episode?: string; campaign?: string; type?: string;
  published?: 'all' | 'period';
}

export interface Figure { value: number | null; previous: number | null; change: number | null; basis: string; reason: string | null }
export type SummaryKey =
  | 'views' | 'uniqueReach' | 'uniqueClickers' | 'reach' | 'impressions' | 'engagements' | 'likes' | 'comments'
  | 'shares' | 'saves' | 'clicks' | 'linkClicks' | 'profileVisits' | 'followersGained' | 'avgWatchTime'
  | 'engagementRate' | 'ctr' | 'completionRate' | 'registrations' | 'conversions';

export interface PlatformSplit { channel: string; label: string; url: string | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; clicks: number }
export interface ContentRow {
  id: string; title: string; topic: string; series: string | null; episode: string | null; campaign: string | null;
  kind: string; createdAt: string; tag: string;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; engagements: number | null;
  engagementRate: number | null; clicks: number; uniqueClicks: number; registrations: number; ctr: number | null;
  reach: null; watchTime: null; followers: null; conversions: null;
  platforms: PlatformSplit[];
}
export interface PostRow {
  contentId: string; title: string; topic: string; channel: string; label: string; url: string | null; postedAt: string;
  views: number | null; likes: number | null; comments: number | null; shares: number | null; engagements: number | null;
  clicks: number; uniqueClicks: number; registrations: number;
}
export interface PlatformRow {
  channel: string; label: string; posts: number; views: number | null; likes: number | null; comments: number | null;
  shares: number | null; clicks: number; registrations: number;
  followers: { total: number | null; gained: number | null } | null; note: string;
}
export interface GroupRow { name: string; contents: number; views: number | null; engagements: number | null; clicks: number; registrations: number }
export interface Stage {
  key: string; label: string; value: number | null; rate: number | null; reason: string | null;
  byPlatform: Array<{ channel: string; label: string; value: number | null }>;
  byDay: Array<{ day: string; value: number | null }>;
}
export interface Window { range: RangeKey; from: string | null; to: string; prevFrom: string | null; prevTo: string | null }
export interface Choices {
  types: string[];
  series: string[]; episodes: string[]; campaigns: string[];
  topics: Array<{ key: string; label: string }>;
  channels: Array<{ platform: string; topic: string; handle: string }>;
  platforms: Array<{ key: string; label: string }>;
}
export interface Overview {
  window: Window; measuredAt: string | null; choices: Choices;
  summary: Record<SummaryKey, Figure>;
  best: (ContentRow & { by: 'views' | 'engagements' }) | null;
  worst: (ContentRow & { by: 'views' | 'engagements' }) | null;
  content: ContentRow[]; posts: PostRow[]; platforms: PlatformRow[];
  campaigns: GroupRow[]; series: GroupRow[]; funnel: Stage[];
}
export interface DayPoint { day: string; index: number; views: number | null; engagements: number | null; clicks: number; registrations: number }
export interface Detail {
  window: Window;
  content: { id: string; tag: string; title: string; topic: string; series: string | null; episode: string | null; campaign: string | null; kind: string; createdAt: string; hub: string };
  totals: Record<string, number | null>;
  notMeasured: Record<string, string>;
  platforms: Array<PlatformSplit & { postedAt: string; engagements: number | null; uniqueClicks: number; registrations: number; ctr: number | null; readAt: string | null; readings: number }>;
  timeline: DayPoint[];
  funnel: Stage[];
}

const params = (f: Filters): Record<string, string> =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => typeof v === 'string' && v !== '')) as Record<string, string>;

export const analyticsApi = {
  overview: (password: string, f: Filters) =>
    api.get<Overview>('/dev/media/analytics', withPassword(password, params(f))).then((r) => r.data),
  detail: (password: string, id: string, f: Filters) =>
    api.get<Detail>(`/dev/media/analytics/${encodeURIComponent(id)}`, withPassword(password, params(f))).then((r) => r.data),
  refresh: (password: string) =>
    api.post<{ read: number; failed: Array<{ channel: string; topic: string; error: string }>; skipped: string | null }>(
      '/dev/media/analytics/refresh', {}, withPassword(password)).then((r) => r.data),
};

export function useContentOverview(password: string, f: Filters) {
  return useQuery({
    queryKey: ['dev', 'analytics', 'overview', f],
    queryFn: () => analyticsApi.overview(password, f),
    retry: false,
    staleTime: 60_000,
  });
}

export function useContentDetail(password: string, id: string | null, f: Filters) {
  return useQuery({
    queryKey: ['dev', 'analytics', 'detail', id, f],
    queryFn: () => analyticsApi.detail(password, id as string, f),
    enabled: Boolean(id),
    retry: false,
    staleTime: 60_000,
  });
}

export function useRefreshCounts(password: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => analyticsApi.refresh(password),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['dev', 'analytics'] }); },
  });
}
