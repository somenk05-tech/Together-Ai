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
  /** The whole answer as one paragraph — still the fallback, still unchanged. */
  summary: string;
  /**
   * THE SAME ANSWER IN ITS PARTS, so the profile plate can SET it: the findings
   * in display type, the qualifier in italic beneath. Both are decided on the
   * server — see beauty-analysis.ts — because a page that split the paragraph
   * itself would hold a second copy of the rule that composed it.
   *
   * Optional on this type, and that is about DATA rather than deployment: the
   * server derives both for assessments saved before the fields existed, and
   * `focus` is legitimately empty for somebody whose skin and hair came back
   * well-balanced. The page falls back to the paragraph in both cases.
   */
  focus?: string[];
  note?: string;
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

/**
 * WHEN THE NEXT ORDER IS DUE — decided on the server, formatted here.
 *
 * Every field on this is a judgement made in `beauty/reorder.ts`: which product
 * runs out first, how long a pack of it lasts, how many days before empty to
 * ask. The browser turns `dueAt` into "35 days" and does nothing else with it,
 * which is the same division of labour as `lastsLabel` and `packLabel` — and
 * the reason the countdown ticks over at midnight without a refetch.
 *
 * `null` means no order has been placed yet, and the surfaces show nothing.
 */
export interface ReorderDue {
  /** ISO day to place the next order — `runsOutAt` less `leadDays`. */
  dueAt: string;
  /** ISO day the first product is actually empty. */
  runsOutAt: string;
  productId: string;
  /** What runs out first. Named, so the number can be checked against a shelf. */
  productName: string;
  /** "Sunscreen" — the short form, for a sentence somebody reads in passing. */
  productCategory: string;
  /** "about 6 weeks" — the same phrase the routine card uses for this product. */
  lastsLabel: string;
  orderedAt: string;
  leadDays: number;
}

/**
 * Whole days from today until an ISO day, floored at zero.
 *
 * BOTH SIDES ARE FLATTENED TO LOCAL MIDNIGHT, because the answer is a count of
 * calendar days and not of elapsed hours. Subtracting raw timestamps says "34
 * days" at nine in the morning and "35" the same evening, which is a countdown
 * that appears to go backwards while somebody watches it.
 */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(target.getTime())) return 0;
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
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
  /** Null until the first order. See ReorderDue. */
  reorder: ReorderDue | null;
}

/**
 * The bag — one per citizen, held on the server.
 *
 * It was two React states before this: one on the routine and one on the
 * market, each with its own total and its own checkout button, and both erased
 * by clicking a link. A bag that forgets is worse than no bag, because it
 * invites the work of filling it twice.
 *
 * Only ids and quantities are stored. Every rupee here is priced from the shelf
 * at read time, so a bag can never check out at a price the market no longer
 * offers.
 */
export interface BeautyBag {
  /** The photograph travels with the line — the last screen before paying
   *  should not be the first one without pictures. */
  lines: { id: string; name: string; priceInr: number; qty: number; image: string; imageAlt: string; category: string }[];
  totalInr: number;
  count: number;
  /** Products that have left the catalogue since they were added. Said out
   *  loud rather than silently dropped. */
  removed: number;
}

export interface BeautyOrder {
  id: string; totalInr: number; status: string;
  items: { id: string; name: string; priceInr: number; qty: number }[]; createdAt: string;
  /** When this order's supply runs out. Null when nothing in it is still sold. */
  reorder: ReorderDue | null;
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
  bag: () => api.get<BeautyBag>('/beauty/bag').then((r) => r.data),
  saveBag: (lines: { id: string; qty: number }[]) =>
    api.put<BeautyBag>('/beauty/bag', { lines }).then((r) => r.data),
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

/**
 * The one bag. Every surface that adds to it uses these two hooks and no local
 * state, which is what makes it the same bag on every page.
 */
export function useBeautyBag() {
  return useQuery({ queryKey: ['beauty', 'bag'], queryFn: () => beautyApi.bag() });
}
export function useSaveBeautyBag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: beautyApi.saveBag,
    // Written straight into the cache rather than invalidated: a bag that
    // flickers back to its old contents while a refetch lands feels broken, and
    // the response IS the new bag.
    onSuccess: (b) => qc.setQueryData(['beauty', 'bag'], b),
  });
}

/**
 * Add, remove and clear — what a page does to a bag, with the server's copy as
 * the base each time so two quick taps cannot race.
 *
 * `setMany` was here too, and it went with the Routine page's "Add all to bag".
 * It was written for that button and had exactly one caller; a bulk write left
 * behind with nothing calling it is a loaded gun in a drawer, and the next
 * surface that wants one should write it against its own need rather than
 * inherit this one's assumption that topping up is the right merge. The
 * behaviour, if it is ever wanted back: existing quantities kept, missing ones
 * set to one, nothing removed.
 */
export function useBagActions() {
  const bag = useBeautyBag();
  const save = useSaveBeautyBag();
  const lines = () => (bag.data?.lines ?? []).map((l) => ({ id: l.id, qty: l.qty }));
  const put = (next: { id: string; qty: number }[]) => save.mutate(next.filter((l) => l.qty > 0));
  return {
    bag: bag.data,
    isLoading: bag.isLoading,
    isSaving: save.isPending,
    qtyOf: (id: string) => bag.data?.lines.find((l) => l.id === id)?.qty ?? 0,
    add: (id: string) => {
      const cur = lines();
      const at = cur.findIndex((l) => l.id === id);
      put(at === -1 ? [...cur, { id, qty: 1 }] : cur.map((l, i) => (i === at ? { ...l, qty: l.qty + 1 } : l)));
    },
    remove: (id: string) => put(lines().map((l) => (l.id === id ? { ...l, qty: l.qty - 1 } : l))),
    clear: () => put([]),
  };
}

export function useBeautyOrders() {
  return useQuery({ queryKey: ['beauty', 'orders'], queryFn: () => beautyApi.orders() });
}
export function usePlaceBeautyOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { items: { id: string; name: string; priceInr: number; qty: number }[]; method: 'wallet' | 'card' }) => beautyApi.placeOrder(v.items, v.method),
    onSuccess: (res) => {
      qc.setQueryData(['beauty', 'orders'], res.orders);
      // The order empties the bag on the server; the cache has to hear about it
      // or the sticky bar keeps offering to sell what was just bought.
      void qc.invalidateQueries({ queryKey: ['beauty', 'bag'] });
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}

export function useMakeupLook(occasion?: string) {
  return useQuery({ queryKey: ['beauty', 'makeup', occasion ?? ''], queryFn: () => beautyApi.makeupLook(occasion), retry: false, staleTime: 10 * 60_000 });
}
