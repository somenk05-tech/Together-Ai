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
/** `breakdown` (6 Sep): the citizen's own photo with the findings drawn on it, a JPEG data URL — see breakdown.ts. */
export interface BeautyProgressEntry { id: string; date: string; findings: string[]; score: number; thumb: string | null; breakdown?: string | null }
/** Where on the front photo a finding is clearest, in the photo's own fractions (0–1). */
export interface BeautyPhotoMark { finding: string; x: number; y: number; w: number; h: number }
/** Permanent skin & hair timeline (baseline + follow-ups, never overwritten). */
export interface BeautyAttrSnapshot { key: string; label: string; level: string }
export interface BeautyTimelineEntry {
  id: string; date: string; index: number; label: string; baseline: boolean;
  score: number; skinScore?: number; hairScore?: number;
  skin?: BeautyAttrSnapshot[]; hair?: BeautyAttrSnapshot[]; thumb: string | null; findings: string[]; breakdown?: string | null;
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
  uploads?: {
    limit: number; used: number; remaining: number;
    /** One free accepted analysis per rolling 30 days, ₹100 each after (5 Sep). */
    priceInr?: number; freeAvailable?: boolean; nextFreeAt?: string | null; freeWindowDays?: number; extraPriceInr?: number;
  };
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
  /** What is in it, and what kind of list that is: 'sheet' is the key
   *  ingredients the data sheet names, 'label' the pack's full INCI list. The
   *  Ingredients tab prints the list and SAYS which, because a short list read
   *  as a whole label tells an allergic citizen "not in it". */
  ingredients: string[]; ingredientsSource: 'sheet' | 'label';
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
  /** The shelf is shorter because of something they told us about their health,
   *  not because of what we stock. Separate from allergyNotice because the two
   *  are different sentences and conflating them explains neither. */
  conditionNotice: { removed: number; sentence: string } | null;
  /** What the allergy and condition checks could read: for how many products a
   *  full label is on file, and the sentence the shelf says about it (5 Sep). */
  labelCoverage?: { withLabel: number; total: number; note: string | null };
}
/**
 * A product-backed routine step — distinct from the lightweight RoutineStep
 * above, which comes from the photo assessment and names an ingredient rather
 * than something you can actually buy and apply in order.
 */
export interface ProductRoutineStep {
  order: number; step: string; productId: string; name: string; brand: string;
  category: string; keyIngredient: string; priceInr: number;
  /** See RecommendedProduct.ingredients. */
  ingredients: string[]; ingredientsSource: 'sheet' | 'label';
  /** Two hotlinked photographs and the page it is sold on. Either image can be
   *  empty and either can simply fail — the step falls through to the second
   *  and then to a category mark rather than showing a broken frame. */
  image: string; imageAlt: string; productUrl: string;
  instructions: string; frequency: string; warnings: string[];
  /** A step the citizen told us they already have. No product, no price, no
   *  bag — it holds its position in the order and says why there is nothing
   *  to buy. Without it the sequence simply omitted the step. */
  owned?: true;
  ownedWhy?: string;
}
export interface ProductRoutine {
  timeOfDay: 'morning' | 'evening' | 'weekly' | 'body';
  title: string;
  steps: ProductRoutineStep[];
  notes: string[];
}
/**
 * What the routine may cost to buy, per part of it — a purchase budget, not a
 * monthly one. `null` from the server means NOT
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
  /** What it costs to buy — the unit the budget is set and spent in. */
  priceInr: number;
  /** What it costs to keep. Printed beside the price; decides nothing. */
  monthlyInr: number; monthsOfUse: number;
  /** "100 ml" — what is on the pack, or '' when the name never said. */
  packLabel: string;
  /** Only ever on an offer: what spending this would, and would not, buy. */
  reason?: string;
  /** "about 6 weeks" · "about 2½ months". */
  lastsLabel: string;
  /** Why this product, in the assessment's own words. Three at most. */
  reasons?: string[];
}
export interface CategoryPlan {
  category: 'face' | 'hair' | 'body';
  budgetInr: number;
  /** The citizen set this category to zero. Not "we found nothing" — they said
   *  not to, so the band is not drawn at all. */
  skipped: boolean;
  /** What this routine costs to buy — what the budget is measured against. */
  spendInr: number;
  /** What it costs to keep, per month. Reported, never spent against. */
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
  /** Steps the citizen said they already have. Not bought, not charged. */
  kept: { role: string; tier: string; why: string }[];
  /** The most this profile can absorb without taking a worse-matched product. */
  usefulMaxInr: number;
  leftOut: { role: string; tier: RoutineTier; why: string }[];
  /** Findings this routine does not answer. Reported, never acted on. */
  uncoveredNeeds: string[];
  upgrades: RoutinePick[];
}
export interface BudgetPlan {
  face: CategoryPlan; hair: CategoryPlan; body: CategoryPlan;
  totalBudgetInr: number; totalSpendInr: number; totalMonthlyInr: number; totalRemainingInr: number;
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
  analyzePhotos: (photos: { slot: string; base64: string; mediaType?: string }[], thumb?: string, method?: 'wallet' | 'card') =>
    api.post<BeautyProfile & { photoFindings: string[]; aiUsed: boolean; quality: 'ok' | 'unclear' | 'suspect'; warning: string; priceInr: number; payment?: { method: 'wallet' | 'card'; balanceInr: number }; marks: BeautyPhotoMark[]; entryId: string | null }>('/beauty/photos/analyze', { photos, thumb, method }).then((r) => r.data),
  /** The composed breakdown, sent back to sit beside the assessment it was drawn for. */
  saveBreakdown: (entryId: string, image: string) =>
    api.post<{ ok: true; kept: boolean }>('/beauty/photos/breakdown', { entryId, image }).then((r) => r.data),
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
      // A saved profile is an input to everything downstream of it, here and
      // across the city: the routine, the shelf, the insights, the makeup
      // look, and the Master Profile's panels, summary and completion. All of
      // it re-reads, so nowhere on the site keeps showing the answers that
      // were just replaced (owner ask, 3 Sep).
      void qc.invalidateQueries({ queryKey: ['beauty'], predicate: (q) => q.queryKey[1] !== 'profile' });
      void qc.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
export function useAnalyzeBeautyPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { photos: { slot: string; base64: string; mediaType?: string }[]; thumb?: string; method?: 'wallet' | 'card' }) => beautyApi.analyzePhotos(v.photos, v.thumb, v.method),
    onSuccess: (p) => { qc.setQueryData(['beauty', 'profile'], p); void qc.invalidateQueries({ queryKey: ['beauty', 'products'] }); void qc.invalidateQueries({ queryKey: ['beauty', 'history'] }); },
  });
}
export function useSaveBreakdown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { entryId: string; image: string }) => beautyApi.saveBreakdown(v.entryId, v.image),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['beauty', 'profile'] }); void qc.invalidateQueries({ queryKey: ['beauty', 'history'] }); },
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
 * The signature of a bag as the server would return it — every line, in an
 * order that does not depend on the order they were added. It exists so a page
 * can tell "the bag I just wrote" from "the bag as somebody has since changed
 * it", which is what makes a one-press undo safe to offer: the moment the two
 * differ, the undo is stale and the page stops offering it.
 */
export const bagKey = (lines: { id: string; qty: number }[]) =>
  lines.map((l) => `${l.id}:${l.qty}`).sort().join('|');

/**
 * Add, remove, clear — and, once again, add the lot: what a page does to a bag,
 * with the server's copy as the base each time so two quick taps cannot race.
 *
 * `addAll` is `setMany` come back, at the owner's word, and the terms it comes
 * back on are the objection that removed it: adding ten products in one press
 * was the one bag action nobody could undo in one press. So it RETURNS THE BAG
 * IT REPLACED, and `restore` puts it back. The caller keeps that snapshot only
 * while the bag still looks like what `addAll` wrote — see `bagKey`.
 *
 * The merge is a top-up and nothing else: existing quantities are kept
 * untouched, ids that were missing arrive at one, and nothing is ever removed.
 * Somebody who has already put two cleansers in the bag does not get a third
 * for pressing this, and does not get one taken away either.
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
    addAll: (ids: string[]) => {
      const prev = lines();
      const have = new Set(prev.map((l) => l.id));
      const next = [...prev, ...ids.filter((id) => !have.has(id)).map((id) => ({ id, qty: 1 }))];
      put(next);
      return { prev, key: bagKey(next) };
    },
    restore: (prev: { id: string; qty: number }[]) => put(prev),
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
