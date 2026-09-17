import { useQuery } from '@tanstack/react-query';
import { http } from '@/api/client';
import { sampleOf } from './fake-dashboard';
import type {
  AiEngine, CityActivity, Health, Live, Money, Overview, RangeKey, Reach, Retention, SectionKey, Sections,
} from './types';

/**
 * ── THE DASHBOARD'S DATA LAYER (owner, 16 Sep) ─────────────────────────────
 *
 * The page never reads a number from anywhere but here, and here reads from
 * one place: GET /api/insights (founder: a signed-in account holding
 * `analytics.read`) or GET /api/insights/investor (the deck's password).
 * Each section is its own request, so the page asks only for what it shows.
 *
 * SAMPLE DATA lives in fake-dashboard.ts and is returned ONLY when the page's
 * "Sample data" switch is on. Every sample answer carries `sample: true`, and
 * the page watermarks every card that shows one. Turning the switch off is
 * the only way back to the city's own numbers, and nothing else calls it.
 */
export type Access = { kind: 'founder' } | { kind: 'investor'; password: string };

export type WithSample<T> = T & { sample?: true };

async function read<K extends SectionKey>(section: K, range: RangeKey, access: Access): Promise<Sections[K]> {
  const path = access.kind === 'investor' ? '/insights/investor' : '/insights';
  const headers = access.kind === 'investor' ? { 'x-investor-password': access.password } : undefined;
  const r = await http.get<Sections[K]>(path, { params: { section, range }, headers });
  return r.data;
}

/** One function per section, the names the product brief asked for. */
export const getDashboardOverview = (range: RangeKey, access: Access): Promise<Overview> => read('overview', range, access);
export const getCityActivity = (range: RangeKey, access: Access): Promise<CityActivity> => read('city', range, access);
export const getRetention = (range: RangeKey, access: Access): Promise<Retention> => read('retention', range, access);
export const getAcquisition = (range: RangeKey, access: Access): Promise<Reach> => read('reach', range, access);
export const getAIAnalytics = (range: RangeKey, access: Access): Promise<AiEngine> => read('ai', range, access);
export const getRevenueMetrics = (range: RangeKey, access: Access): Promise<Money> => read('money', range, access);
export const getPlatformHealth = (range: RangeKey, access: Access): Promise<Health> => read('health', range, access);
export const getLiveActivity = (range: RangeKey, access: Access): Promise<Live> => read('live', range, access);

const READERS: { [K in SectionKey]: (range: RangeKey, access: Access) => Promise<Sections[K]> } = {
  overview: getDashboardOverview, city: getCityActivity, retention: getRetention, reach: getAcquisition,
  ai: getAIAnalytics, money: getRevenueMetrics, health: getPlatformHealth, live: getLiveActivity,
};

/** Every section the CSV export needs, from the same place the page reads (sample included). */
export async function readForExport(range: RangeKey, access: Access, sample: boolean) {
  const one = <K extends SectionKey>(k: K): Promise<Sections[K]> => (sample ? Promise.resolve(sampleOf(k, range)) : READERS[k](range, access));
  const [overview, city, retention, reach, ai, money, health] = await Promise.all([
    one('overview'), one('city'), one('retention'), one('reach'), one('ai'), one('money'), one('health'),
  ]);
  return { overview, city, retention, reach, ai, money, health };
}

/** How often a section is asked again while the page is open. Only the pulse and the feed move quickly. */
const REFRESH: Partial<Record<SectionKey, number>> = { overview: 60_000, live: 30_000, health: 30_000 };

export function useSection<K extends SectionKey>(section: K, range: RangeKey, access: Access | null, opts: { sample: boolean; enabled?: boolean }) {
  return useQuery<WithSample<Sections[K]>>({
    queryKey: ['insights', section, range, access?.kind ?? 'none', opts.sample],
    queryFn: async () => (opts.sample ? sampleOf(section, range) : READERS[section](range, access as Access)),
    enabled: Boolean(access) && opts.enabled !== false,
    staleTime: 30_000,
    refetchInterval: opts.sample ? false : REFRESH[section] ?? false,
    refetchIntervalInBackground: false,
    placeholderData: (prev) => prev,
    retry: (n, e) => n < 1 && (e as { response?: { status?: number } })?.response?.status !== 403,
  });
}
