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
/**
 * A letter.
 *
 * `sections`, `lucky`, `theme`, `moonPhase`, `sunSign`, `numerology`, `dasha`,
 * `reflection` and `framing` were all removed here rather than left unread. The
 * screen stopped rendering them, and a field nothing renders is a field that
 * quietly stops being true — the same rule that took the grocery ordering flow
 * out in B.18.
 *
 * `pending` is the one addition, and it carries real weight: it means the letter
 * for this period has not been successfully written. It is NOT an error, and it
 * is NOT "you have nothing". Those are three different sentences and the screen
 * says whichever one is true.
 */
export interface Letter {
  /** "Dear Somen," — always the opening line, always on its own. */
  salutation: string;
  /** The letter. Paragraphs separated by a blank line, and nothing else in it. */
  body: string;
  signOff: string;
  words: number;
}
export interface DailyLetter extends Letter {
  needsProfile: boolean;
  pending?: boolean;
  date: string;
}
export interface MonthlyLetter extends Letter {
  needsProfile: boolean;
  pending?: boolean;
  date: string;
  /** "August 2026" — the month it was written for, ready to show. */
  month?: string;
}
export interface AstroQuestion {
  id: string; topic: string; question: string; answer: string;
  priceInr: number; createdAt: string;
}
export interface AskResult extends AstroQuestion {
  needsProfile: boolean;
  /** No answer could be written this time. Nothing was saved and nothing charged. */
  pending?: boolean;
  payment?: { method: string; balanceInr: number };
}
/**
 * Where this citizen stands before they ask: five free consultations, then ₹100
 * for the next five.
 *
 * Read from the server rather than worked out on the screen. The counter it
 * comes from is the same one the charge is decided by, so the price shown and
 * the price taken cannot drift apart — and a mirrored constant here would be
 * one deploy away from advertising the wrong number.
 */
export interface AskQuota {
  asked: number;
  priceInr: number;
  includedLeft: number;
  onFreeAllowance: boolean;
  packSize: number;
  packPriceInr: number;
  freeQuestions: number;
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
  /** Which of the face-down cards was turned. Absent on cards dealt before
   *  choosing existed, and on every paid spread. */
  position?: number;
  /** Which face-down cards were turned, in order. Absent on spreads dealt
   *  before picking existed — those came off the top and it would be a lie to
   *  claim otherwise. */
  picks?: number[];
  cards: TarotDrawnCard[]; summary: string; disclaimer: string; seed: string;
}
/**
 * Card of the Day, in two shapes.
 *
 * `chosen: false` means NOTHING HAS BEEN DEALT AND NOTHING HAS BEEN STORED —
 * there is no card yet, only `fan` face-down ones to pick from. It is not an
 * empty state and it is not an error; it is the moment before the choice, and
 * the screen has to be able to tell the difference.
 */
export type TarotDaily =
  | { chosen: false; fan: number; priceInr: number; disclaimer: string }
  | (TarotReading & { chosen: true; saved: boolean; priceInr: number });
export interface TarotSpreadResult extends TarotReading { id: string; priceInr: number }
export interface TarotSpreadOption {
  kind: SpreadKind; name: string; cards: number; priceInr: number;
  /** How many face-down cards this spread lays out to choose from. The server's
   *  number, not the stylesheet's — it also refuses a pick outside it. */
  fan: number;
}
export interface TarotHistoryItem {
  id: string; kind: string; spreadName: string; question: string | null;
  priceInr: number; createdAt: string; seed: string;
  cards: TarotDrawnCard[]; summary: string; disclaimer: string;
}

/** Labelled data — the panel may name the machinery; the prose beside it may not. */
export interface GemEntry {
  lord: string; stone: string; alternatives: string[]; metal: string; finger: string;
  beginOn: string; intention: string; caution: string;
}
export interface GemGuidance {
  needsProfile: false; primary: GemEntry; supporting: GemEntry; disclaimer: string;
}
export interface RemedyTemplate {
  key: string; title: string; practice: string; kind: 'observance' | 'giving' | 'practice';
}
export interface RemedyGuidance {
  needsProfile: false;
  remedies: RemedyTemplate[];
  /** Practices held back because of declared health flags. */
  withheld: Array<{ title: string; reason: string }>;
  disclaimer: string;
}
export type GemResponse = GemGuidance | { needsProfile: true };
export type RemedyResponse = RemedyGuidance | { needsProfile: true };

export const astrologyApi = {
  profile: () => api.get<AstroProfileView>('/astrology/profile').then((r) => r.data),
  saveProfile: (dto: SaveAstroProfileInput) =>
    api.put<{ saved: boolean; profile: AstroProfile }>('/astrology/profile', dto).then((r) => r.data),
  daily: () => api.get<DailyLetter>('/astrology/daily').then((r) => r.data),
  dailyHistory: () => api.get<Array<Omit<DailyLetter, 'needsProfile' | 'pending'>>>('/astrology/daily/history').then((r) => r.data),
  monthly: () => api.get<MonthlyLetter>('/astrology/monthly').then((r) => r.data),
  askQuota: () => api.get<AskQuota>('/astrology/ask').then((r) => r.data),
  ask: (dto: { topic: string; question: string; method?: 'wallet' | 'card' }) =>
    api.post<AskResult>('/astrology/ask', dto).then((r) => r.data),
  questions: () => api.get<AstroQuestion[]>('/astrology/questions').then((r) => r.data),
  deleteQuestion: (id: string) =>
    api.delete<{ deleted: boolean }>(`/astrology/questions/${id}`).then((r) => r.data),

  tarotSpreads: () => api.get<{ disclaimer: string; spreads: TarotSpreadOption[] }>('/astrology/tarot/spreads').then((r) => r.data),
  tarotDaily: () => api.get<TarotDaily>('/astrology/tarot/daily').then((r) => r.data),
  tarotChooseDaily: (position: number) =>
    api.post<TarotDaily>('/astrology/tarot/daily/choose', { position }).then((r) => r.data),
  tarotDraw: (dto: { kind: 'three' | 'celtic'; question: string; picks: number[]; method?: 'wallet' | 'card' }) =>
    api.post<TarotSpreadResult>('/astrology/tarot/draw', dto).then((r) => r.data),
  tarotHistory: () => api.get<TarotHistoryItem[]>('/astrology/tarot/history').then((r) => r.data),

  gems: () => api.get<GemResponse>('/astrology/gems').then((r) => r.data),
  remedies: () => api.get<RemedyResponse>('/astrology/remedies').then((r) => r.data),
};
