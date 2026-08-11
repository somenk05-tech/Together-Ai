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
  /**
   * "Move, But Don't Rush" — three to seven words naming what the period is
   * asking. OPTIONAL, and that is not laziness: letters written before the
   * title existed are still in the archive and still render, so a screen that
   * required one would break the past in order to display the present.
   */
  title?: string;
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
  /**
   * ONE PRACTICE, THIS WEEK — and the rest are still listed, dated.
   *
   * Six worthwhile things at once is a menu, and a menu of self-improvement is
   * a menu people close. These work by repetition, so what matters is not what
   * could be done but what is being done this week. The week picks it: the same
   * practice from Monday to Sunday, turning over on its own overnight, working
   * through the whole list before it repeats. Nothing is stored.
   */
  thisWeek: RemedyTemplate | null;
  /** Monday and Sunday of the current week, ISO dates. */
  weekFrom: string;
  weekTo: string;
  upcoming: Array<{ startsOn: string; remedy: RemedyTemplate }>;
  remedies: RemedyTemplate[];
  /** Practices held back because of declared health flags. */
  withheld: Array<{ title: string; reason: string }>;
  disclaimer: string;
}
export type GemResponse = GemGuidance | { needsProfile: true };
export type RemedyResponse = RemedyGuidance | { needsProfile: true };


/**
 * The gem marketplace.
 *
 * A CHART NAMES AT MOST FIVE STONES and each arrives with the ROLE it plays,
 * not a rank in a list — which is the whole difference between this and a
 * jewellery catalogue with an astrology theme.
 */
export type GemRole = 'life' | 'fortune' | 'period' | 'moon' | 'number';

export interface GemStone {
  number: number; id: string; sku: string; name: string;
  planet: string; numerologyNumber: number;
  kind: 'primary' | 'substitute' | 'wellness';
  substituteFor: string | null;
  traits: string[];
  description: string;
  whyRecommended: string;
  whatYouFeel: string;
  wearingNote: string;
  image: string; imageAlt: string;
  perCaratMinInr: number; perCaratMaxInr: number;
  theme: { background: string; title: string; body: string; accent: string };
}

/** Metal, finger, hand and day — one table, shared with the remedies page. */
export interface GemWearing {
  metal: string; finger: string; hand: string; day: string;
  allies: string[]; soft: boolean;
}

/** The weight the tradition prescribes for this person, in carats. */
export interface GemWeight {
  carats: number; ratti: number;
  /** The stone's own customary range — coral is worn heavy, sapphire light. */
  fromCt: number; toCt: number; fromRatti: number; toRatti: number;
  /** Why the figure sits where it does: inside the stone's range, or held at
   *  one end of it because the wearer is lighter or heavier than it is worn. */
  bound: 'placed' | 'floor' | 'ceiling';
}

/** A stone at that weight, with what it costs there. */
export interface GemAtWeight {
  gem: GemStone;
  weight: GemWeight | null;
  fromInr: number | null;
  toInr: number | null;
}

export type GemPriority = 'must-have' | 'strong' | 'recommended' | 'optional';

export interface GemRecommendation {
  gem: GemStone;
  role: GemRole;
  /** 1 is the one to buy first; the list is ordered by it. Derived from the
   *  POSITION rather than the role, because the order changes — without a birth
   *  time the moon stone leads and is genuinely the must-have. */
  rank: number;
  priority: GemPriority;
  /** Other stones on this page traditionally worn with this one. */
  wornWith: string[];
  /** Null when no body weight is on file — no figure is invented. */
  weight: GemWeight | null;
  /** What the stone costs AT that weight — the only price anybody can act on. */
  fromInr: number | null;
  toInr: number | null;
  /** Every reason this stone came up — a stone holds one role and may still be
   *  justified three ways. */
  reasons: string[];
  wearing: GemWearing;
  /** Set on the three stones traditionally worn on trial before commissioning. */
  trialNote: string | null;
  /** Cheaper stones for the same planet, priced at the heavier weight the
   *  tradition asks of a substitute. */
  substitutes: GemAtWeight[];
}

export interface GemstonesResponse {
  needsProfile?: boolean;
  chart: {
    ascendant: string | null; moonSign: string;
    mahadasha: string; antardasha: string; lifePath: number;
    bodyKg: number | null;
  };
  /** No birth time means no ascendant, so no life or fortune stone. */
  timeUnknown: boolean;
  /** No body weight means no carat figure — an average would be a guess about
   *  the difference between a ₹50,000 stone and a ₹90,000 one. */
  weightUnknown: boolean;
  recommendations: GemRecommendation[];
  disclaimer: string;
}

/** A shape, a setting or a pendant style — with the line drawing it was drawn
 *  with. Line art rather than photography: a photograph of somebody else's ring
 *  is a picture of a thing we are not selling. */
export interface StudioOption { key: string; name: string; desc: string; svg: string }
export type DesignVerdict = 'recommended' | 'suitable' | 'avoid';
export interface SettingOption extends StudioOption { verdict: DesignVerdict; why: string }
export interface RingSize { indian: number; diameterMm: number; circumferenceMm: number }

export type MetalKey = 'gold22' | 'silver' | 'panchdhatu';
/** Priced per design and per size — a cluster in size 22 carries nearly twice
 *  the gold of a solitaire in size 8. The making charge is already inside
 *  `priceInr`; there is nothing to add to it. */
export interface MetalQuote {
  key: MetalKey; name: string; grams: number; priceInr: number; traditional: boolean;
}

export interface GemDesign {
  needsProfile?: boolean;
  gem: GemStone;
  weight: GemWeight | null;
  fromInr: number | null;
  toInr: number | null;
  wearing: GemWearing;
  /** Set when this stone is a stand-in for a costlier one. */
  standsInFor: string | null;
  shapes: StudioOption[];
  /** Judged against THIS stone's planet — whether a tension mount will crack
   *  this particular stone is not a presentation detail. */
  settings: SettingOption[];
  pendantStyles: StudioOption[];
  sizes: RingSize[];
  metals: Record<MetalKey, string>;
  disclaimer: string;
}

export const astrologyApi = {
  profile: () => api.get<AstroProfileView>('/astrology/profile').then((r) => r.data),
  saveProfile: (dto: SaveAstroProfileInput) =>
    api.put<{ saved: boolean; profile: AstroProfile }>('/astrology/profile', dto).then((r) => r.data),
  daily: () => api.get<DailyLetter>('/astrology/daily').then((r) => r.data),
  dailyHistory: () => api.get<Array<Omit<DailyLetter, 'needsProfile' | 'pending'>>>('/astrology/daily/history').then((r) => r.data),
  monthly: () => api.get<MonthlyLetter>('/astrology/monthly').then((r) => r.data),
  monthlyHistory: () => api.get<Array<Omit<MonthlyLetter, 'needsProfile' | 'pending'>>>('/astrology/monthly/history').then((r) => r.data),
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
  deleteTarotReading: (id: string) =>
    api.delete<{ deleted: boolean }>(`/astrology/tarot/${id}`).then((r) => r.data),

  gems: () => api.get<GemResponse>('/astrology/gems').then((r) => r.data),
  gemstones: () => api.get<GemstonesResponse>('/astrology/gemstones').then((r) => r.data),
  gemDesign: (id: string) => api.get<GemDesign>(`/astrology/gemstones/${id}/design`).then((r) => r.data),
  gemMetals: (id: string, worn: 'ring' | 'pendant', design: string, size: number) =>
    api.get<{ metals: MetalQuote[] }>(`/astrology/gemstones/${id}/metals`, { params: { worn, design, size } })
      .then((r) => r.data),
  /** The choices, never the price — the server prices them from the same
   *  catalogue and weight rule the studio was rendered from. */
  commissionGem: (v: {
    gemId: string; grade: number; worn: 'ring' | 'pendant' | 'loose'; shape: string;
    setting?: string; style?: string; size?: number; metal?: MetalKey; method: 'wallet' | 'card';
  }) => api.post<{ paid: true; spec: string; amountInr: number; stoneInr: number }>(
    `/astrology/gemstones/${v.gemId}/commission`,
    { grade: v.grade, worn: v.worn, shape: v.shape, setting: v.setting, style: v.style, size: v.size, metal: v.metal, method: v.method },
  ).then((r) => r.data),
  remedies: () => api.get<RemedyResponse>('/astrology/remedies').then((r) => r.data),
};
