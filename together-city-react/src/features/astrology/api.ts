import { http as api } from '@/api/client';

/** Astrology Zone endpoints — all readings are computed on the backend from
 *  the shared birth profile; the client never duplicates chart logic. */

export interface AstroChartSummary { sunSign: string; moonSign: string; ascendant: string | null }
export interface AstroProfile {
  birthDate: string; birthTime: string | null; timeKnown: boolean; birthCountry: string;
  birthState: string | null; birthCity: string; timeZone: string;
  updatedAt?: string;
  chart: AstroChartSummary;
}
export interface AstroProfileView {
  complete: boolean;
  profile: AstroProfile | null;
  prefill: { birthDate: string; birthTime: string; birthCity: string; birthState: string; birthCountry: string } | null;
  source: 'astrology' | 'dating' | null;
}
export interface SaveAstroProfileInput {
  birthDate: string; birthTime: string | null; birthCountry: string;
  birthState?: string | null; birthCity: string; timeZone: string;
}
export interface GuidanceSection { key: string; title: string; icon: string; body: string }
export interface LuckyElements { number: number; color: string; time: string; direction: string }
export interface DailyReading {
  needsProfile: boolean; date: string; theme: string; text: string;
  moonPhase: string; sunSign: string; words: number;
  // Personal Guidance Engine (optional — older history rows won't have these).
  framing?: string;
  numerology?: { lifePath: number; personalYear: number; personalMonth: number; personalDay: number };
  dasha?: { maha: string; antar: string };
  sections?: GuidanceSection[];
  lucky?: LuckyElements;
  reflection?: string;
}
export interface MonthlySection { key: string; title: string; body: string }
export interface MonthlyReading {
  needsProfile: boolean; month: string; title: string; sections: MonthlySection[];
  words: number; bestDates: number[]; cautionDates: number[];
}
export interface AstroQuestion {
  id: string; topic: string; question: string; answer: string;
  priceInr: number; createdAt: string;
}
export interface AskResult extends AstroQuestion {
  needsProfile: boolean;
  payment?: { method: string; balanceInr: number };
}

export const astrologyApi = {
  profile: () => api.get<AstroProfileView>('/astrology/profile').then((r) => r.data),
  saveProfile: (dto: SaveAstroProfileInput) =>
    api.put<{ saved: boolean; profile: AstroProfile }>('/astrology/profile', dto).then((r) => r.data),
  daily: () => api.get<DailyReading>('/astrology/daily').then((r) => r.data),
  dailyHistory: () => api.get<Array<Omit<DailyReading, 'needsProfile'>>>('/astrology/daily/history').then((r) => r.data),
  monthly: () => api.get<MonthlyReading>('/astrology/monthly').then((r) => r.data),
  ask: (dto: { topic: string; question: string; method?: 'wallet' | 'card' }) =>
    api.post<AskResult>('/astrology/ask', dto).then((r) => r.data),
  questions: () => api.get<AstroQuestion[]>('/astrology/questions').then((r) => r.data),
};
