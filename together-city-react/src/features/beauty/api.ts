import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AllergyNoticeShape } from '@/components/ui';

export interface Citation { id: string; label: string; ref: string }

export type AssessLevel = 'good' | 'monitor' | 'attention' | 'priority';
export interface BeautyReading { key: string; label: string; level: AssessLevel; note: string }
export interface RoutineStep { step: string; ingredient?: string }
export interface IngredientRec { name: string; why: string }
export interface MakeupRec { item: string; note: string }
export interface BeautyAssessment {
  summary: string;
  skin: { readings: BeautyReading[]; issues: string[]; recommendations: string[] };
  hair: { readings: BeautyReading[]; issues: string[]; recommendations: string[] };
  ingredients: IngredientRec[];
  routine: { am: RoutineStep[]; pm: RoutineStep[]; weekly: RoutineStep[]; seasonal: string };
  makeup: MakeupRec[];
  cautions: string[];
}
export interface BeautyPhotoRow { slot: string; analyzedAt: string; findings: string[] }
export interface BeautyProgressEntry { id: string; date: string; findings: string[]; score: number; thumb: string | null }
/** Permanent skin & hair timeline (baseline + follow-ups, never overwritten). */
export interface BeautyAttrSnapshot { key: string; label: string; level: string }
export interface BeautyTimelineEntry {
  id: string; date: string; index: number; label: string; baseline: boolean;
  score: number; skinScore?: number; hairScore?: number;
  skin?: BeautyAttrSnapshot[]; hair?: BeautyAttrSnapshot[]; thumb: string | null; findings: string[];
}
export interface BeautyAttrCompare { key: string; label: string; from: string | null; to: string; direction: string; delta: number }
export interface BeautyComparison { skin: BeautyAttrCompare[]; hair: BeautyAttrCompare[]; skinDelta: number; hairDelta: number; summary: string }
export interface BeautyHistory { hasHistory: boolean; entries: BeautyTimelineEntry[]; comparison: BeautyComparison | null; followUpDue: boolean; daysSinceLast: number | null }
/** Evidence-based medical-condition suggestions from blood tests (shared across hubs). */
export interface ConditionSuggestion { key: string; label: string; chip: string | null; reason: string; source: string }
export interface ConditionSuggestions { hasPanel: boolean; suggestions: ConditionSuggestion[]; autoSelectChips: string[]; alopeciaHint: string | null; note: string }
export interface BeautyProfile {
  skinType: string; hairType: string; concerns: string[]; saved: boolean;
  profile?: Record<string, unknown>;
  analysis?: BeautyAssessment | null;
  photos?: BeautyPhotoRow[];
  progress?: BeautyProgressEntry[];
  analyzedAt?: string | null;
  aiEnabled?: boolean;
  uploads?: { limit: number; used: number; remaining: number };
  concernOptions?: { key: string; label: string }[];
}
export interface BeautyInsight {
  marker: string; status: 'low' | 'normal' | 'high'; value: number;
  concern: string; mechanism: string; advice: string; tags: string[]; citations: Citation[];
}
export interface InsightsResponse {
  granted: boolean; hasPanel: boolean; takenOn: string | null;
  insights: BeautyInsight[]; source: string; disclaimer: string;
}
export interface RecommendedProduct {
  id: string; name: string; brand: string; category: string; priceInr: number; tags: string[];
  /** 'Skincare' | 'Hair Care' | 'Body Care', and the sheet's own price grade. */
  group: string; tier: string;
  /** Two retailers' photographs and the page it is sold on. Both images are
   *  hotlinked, so either may fail. */
  image: string; imageAlt: string; productUrl: string;
  blurb: string; keyIngredient: string; actives: string[]; usage: string; suitableSkin: string[];
  matched: boolean; matchScore: number;
  primaryReasons: string[]; biomarkerReasons: string[]; explanation: string;
  reasons: string[];
}
export interface ProductsResponse {
  products: RecommendedProduct[];
  personalisedBy: { concerns: string[]; labs: boolean; assessment: boolean };
  matchedCount: number;
  /** What the sensitivity rule took off this shelf, or null. (K5.66.) */
  allergyNotice: AllergyNoticeShape | null;
}
/**
 * A product-backed routine step — distinct from the lightweight RoutineStep
 * above, which comes from the photo assessment and names an ingredient rather
 * than something you can actually buy and apply in order.
 */
export interface ProductRoutineStep {
  order: number; step: string; productId: string; name: string; brand: string;
  category: string; keyIngredient: string; priceInr: number;
  /** Two hotlinked photographs and the page it is sold on. Either image can be
   *  empty and either can simply fail — the step falls through to the second
   *  and then to a category mark rather than showing a broken frame. */
  image: string; imageAlt: string; productUrl: string;
  instructions: string; frequency: string; warnings: string[];
}
export interface ProductRoutine {
  timeOfDay: 'morning' | 'evening' | 'weekly' | 'body';
  title: string;
  steps: ProductRoutineStep[];
  notes: string[];
}
/**
 * A monthly limit, per part of the routine. `null` from the server means NOT
 * SET, and that is not the same as zero — the routine is not generated until
 * somebody has said a number, and nothing is defaulted on their behalf.
 */
export interface BeautyBudget {
  face: number; hair: number; body: number;
  setAt: string | null; currency: string; preference: string | null;
}

export type RoutineTier = 'essential' | 'high-value' | 'optional';
/**
 * One chosen product, as the plan describes it — joined to a routine step by
 * `productId`.
 *
 * `packLabel` and `lastsLabel` ARRIVE FINISHED and are not recomputed here.
 * "100 ml", "about 2½ months" and the monthly figure are all judgements made in
 * the server's `monthly-cost.ts` — how much of a thing a person actually gets
 * through in a month, capped at a year once opened. A second copy of that
 * arithmetic in the browser would be a second answer the day either was
 * corrected. This file formats rupees; everything else is quoted.
 */
export interface RoutinePick {
  productId: string; name: string; role: string; tier: RoutineTier;
  monthlyInr: number; monthsOfUse: number;
  /** "100 ml" — what is on the pack, or '' when the name never said. */
  packLabel: string;
  /** "about 6 weeks" · "about 2½ months". */
  lastsLabel: string;
}
export interface CategoryPlan {
  category: 'face' | 'hair' | 'body';
  budgetInr: number;
  /** The citizen set this category to zero. Not "we found nothing" — they said
   *  not to, so the band is not drawn at all. */
  skipped: boolean;
  monthlyInr: number;
  remainingInr: number;
  /** How far past the budget the routine went, inside the 5% headroom the
   *  planner is allowed for a meaningfully better match. Usually zero. */
  overInr: number;
  /** B × 0.90. Under this the routine is lean and `leanReason` says why. */
  targetLowInr: number;
  /** B × 1.05 — the hard stop. Nothing is ever chosen that crosses it. */
  ceilingInr: number;
  /** Only when the budget cannot carry the essentials: what it would take. */
  minimumInr: number | null;
  /** The best compatible routine, when it costs more than the ceiling allows.
   *  A question to put to the citizen, never a change made for them. */
  idealInr: number | null;
  /** Why the routine stopped under its target, when it did. */
  leanReason: string | null;
  picks: RoutinePick[];
  leftOut: { role: string; tier: RoutineTier; why: string }[];
  upgrades: RoutinePick[];
}
export interface BudgetPlan {
  face: CategoryPlan; hair: CategoryPlan; body: CategoryPlan;
  totalBudgetInr: number; totalMonthlyInr: number; totalRemainingInr: number;
}

export interface RoutineResponse {
  /** True until a budget exists. The page says so; nothing is generated behind it. */
  needsBudget: boolean;
  budget: BeautyBudget | null;
  plan: BudgetPlan | null;
  routines: ProductRoutine[];
  personalisedBy: { concerns: string[]; labs: boolean; assessment: boolean };
  productCount: number;
  disclaimer: string;
}

export interface BeautyOrder {
  id: string; totalInr: number; status: string;
  items: { id: string; name: string; priceInr: number; qty: number }[]; createdAt: string;
}

/** True when the failure is the Medical Hub's consent gate (403). */
export function isConsentBlocked(err: unknown): boolean {
  return err instanceof AxiosError && err.response?.status === 403;
}

/** Makeup Studio — face-first AI look (no biomarkers). */
export interface MakeupTechnique { area: string; tip: string }
export interface MakeupPalette { foundation: string; concealer: string; lips: string[]; blush: string; eyes: string[]; highlighter: string }
export interface MakeupLook {
  occasion: string; occasions: string[]; finish: string; season: string;
  palette: MakeupPalette; techniques: MakeupTechnique[]; baseNotes: string[];
  explanation: string; inputs: { face: boolean; skin: boolean; colour: boolean };
  budget: string | null;
}

export const beautyApi = {
  profile: () => api.get<BeautyProfile>('/beauty/profile').then((r) => r.data),
  saveProfile: (input: Record<string, unknown>) =>
    api.put<BeautyProfile>('/beauty/profile', input).then((r) => r.data),
  analyzePhotos: (photos: { slot: string; base64: string; mediaType?: string }[], thumb?: string) =>
    api.post<BeautyProfile & { photoFindings: string[]; aiUsed: boolean; quality: 'ok' | 'unclear' | 'suspect'; warning: string }>('/beauty/photos/analyze', { photos, thumb }).then((r) => r.data),
  history: () => api.get<BeautyHistory>('/beauty/history').then((r) => r.data),
  deleteLatestAssessment: () => api.delete<BeautyProfile>('/beauty/assessments/latest').then((r) => r.data),
  makeupLook: (occasion?: string) => api.get<MakeupLook>('/beauty/makeup', { params: { occasion } }).then((r) => r.data),
  conditionSuggestions: () => api.get<ConditionSuggestions>('/medical/conditions/suggested').then((r) => r.data),
  insights: () => api.get<InsightsResponse>('/beauty/insights').then((r) => r.data),
  products: () => api.get<ProductsResponse>('/beauty/products').then((r) => r.data),
  routine: () => api.get<RoutineResponse>('/beauty/routine').then((r) => r.data),
  budget: () => api.get<BeautyBudget | null>('/beauty/budget').then((r) => r.data),
  saveBudget: (b: { face: number; hair: number; body: number; preference?: string }) =>
    api.put<BeautyBudget>('/beauty/budget', b).then((r) => r.data),
  orders: () => api.get<BeautyOrder[]>('/beauty/orders').then((r) => r.data),
  placeOrder: (items: { id: string; name: string; priceInr: number; qty: number }[], method: 'wallet' | 'card' = 'wallet') =>
    api.post<{ orderId: string; orders: BeautyOrder[] }>('/beauty/orders', { items, method }).then((r) => r.data),
};

export function useBeautyProfile() {
  return useQuery({ queryKey: ['beauty', 'profile'], queryFn: () => beautyApi.profile() });
}
export function useSaveBeautyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: beautyApi.saveProfile,
    onSuccess: (p) => {
      qc.setQueryData(['beauty', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['beauty', 'products'] });
      void qc.invalidateQueries({ queryKey: ['beauty', 'history'] });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
export function useAnalyzeBeautyPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { photos: { slot: string; base64: string; mediaType?: string }[]; thumb?: string }) => beautyApi.analyzePhotos(v.photos, v.thumb),
    onSuccess: (p) => { qc.setQueryData(['beauty', 'profile'], p); void qc.invalidateQueries({ queryKey: ['beauty', 'products'] }); void qc.invalidateQueries({ queryKey: ['beauty', 'history'] }); },
  });
}
export function useDeleteLatestAssessment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => beautyApi.deleteLatestAssessment(),
    onSuccess: (p) => {
      qc.setQueryData(['beauty', 'profile'], p);
      void qc.invalidateQueries({ queryKey: ['beauty', 'history'] });
      void qc.invalidateQueries({ queryKey: ['beauty', 'products'] });
    },
  });
}
export function useBeautyHistory() {
  return useQuery({ queryKey: ['beauty', 'history'], queryFn: () => beautyApi.history() });
}
export function useConditionSuggestions() {
  return useQuery({ queryKey: ['medical', 'condition-suggestions'], queryFn: () => beautyApi.conditionSuggestions(), retry: false });
}
export function useBeautyInsights() {
  return useQuery({
    queryKey: ['beauty', 'insights'], queryFn: () => beautyApi.insights(), retry: false,
  });
}
export function useBeautyProducts() {
  return useQuery({ queryKey: ['beauty', 'products'], queryFn: () => beautyApi.products() });
}
/** Morning, evening and weekly — derived from the same recommendation the market
 *  shows, so the shelf and the routine can never disagree. */
export function useBeautyRoutine() {
  return useQuery({ queryKey: ['beauty', 'routine'], queryFn: () => beautyApi.routine() });
}
/** What is saved, or null. `retry: false` because "not set" is an answer. */
export function useBeautyBudget() {
  return useQuery({ queryKey: ['beauty', 'budget'], queryFn: () => beautyApi.budget(), retry: false });
}
/** Saving a budget re-plans the routine, so the routine query goes with it. */
export function useSaveBeautyBudget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: beautyApi.saveBudget,
    onSuccess: (b) => {
      qc.setQueryData(['beauty', 'budget'], b);
      void qc.invalidateQueries({ queryKey: ['beauty', 'routine'] });
    },
  });
}

export function useBeautyOrders() {
  return useQuery({ queryKey: ['beauty', 'orders'], queryFn: () => beautyApi.orders() });
}
export function usePlaceBeautyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: { id: string; name: string; priceInr: number; qty: number }[]; method: 'wallet' | 'card' }) => beautyApi.placeOrder(v.items, v.method),
    onSuccess: (res) => { qc.setQueryData(['beauty', 'orders'], res.orders); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}

export function useMakeupLook(occasion?: string) {
  return useQuery({ queryKey: ['beauty', 'makeup', occasion ?? ''], queryFn: () => beautyApi.makeupLook(occasion), retry: false, staleTime: 10 * 60_000 });
}
