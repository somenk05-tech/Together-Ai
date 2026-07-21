import { AxiosError } from 'axios';
import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  blurb: string; keyIngredient: string; actives: string[]; usage: string; suitableSkin: string[];
  matched: boolean; matchScore: number;
  primaryReasons: string[]; biomarkerReasons: string[]; explanation: string;
  reasons: string[];
}
export interface ProductsResponse {
  products: RecommendedProduct[];
  personalisedBy: { concerns: string[]; labs: boolean; assessment: boolean };
  matchedCount: number;
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
