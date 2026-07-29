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
  /** "Dear {First}," — every report opens as a letter. Optional: history rows
   *  written before the voice change won't carry one. */
  greeting?: string;
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
  greeting?: string;
  words: number; bestDates: number[]; cautionDates: number[];
  framing?: string;
  numerology?: { lifePath: number; personalYear: number; personalMonth: number };
  dasha?: { maha: string; antar: string };
}
export interface AstroQuestion {
  id: string; topic: string; question: string; answer: string;
  priceInr: number; createdAt: string;
}
export interface AskResult extends AstroQuestion {
  needsProfile: boolean;
  payment?: { method: string; balanceInr: number };
}

/* ─────────────────────────── Tarot ─────────────────────────── */
export type SpreadKind = 'daily' | 'three' | 'celtic';
export interface TarotDrawnCard {
  cardId: string; name: string; arcana: 'major' | 'minor'; suit?: string;
  reversed: boolean; position: string; positionMeaning: string;
  reading: string; keywords: string[];
}
export interface TarotReading {
  kind: SpreadKind; spreadName: string; question?: string;
  cards: TarotDrawnCard[]; summary: string; disclaimer: string; seed: string;
}
export interface TarotDaily extends TarotReading { saved: boolean; priceInr: number }
export interface TarotSpreadResult extends TarotReading { id: string; priceInr: number }
export interface TarotSpreadOption { kind: SpreadKind; name: string; cards: number; priceInr: number }
export interface TarotHistoryItem {
  id: string; kind: string; spreadName: string; question: string | null;
  priceInr: number; createdAt: string; seed: string;
  cards: TarotDrawnCard[]; summary: string; disclaimer: string;
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

  tarotSpreads: () => api.get<{ disclaimer: string; spreads: TarotSpreadOption[] }>('/astrology/tarot/spreads').then((r) => r.data),
  tarotDaily: () => api.get<TarotDaily>('/astrology/tarot/daily').then((r) => r.data),
  tarotDraw: (dto: { kind: 'three' | 'celtic'; question: string; method?: 'wallet' | 'card' }) =>
    api.post<TarotSpreadResult>('/astrology/tarot/draw', dto).then((r) => r.data),
  tarotHistory: () => api.get<TarotHistoryItem[]>('/astrology/tarot/history').then((r) => r.data),
};
