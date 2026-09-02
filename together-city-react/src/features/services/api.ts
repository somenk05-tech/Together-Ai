import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DayHours } from './hours';
export type { DayHours } from './hours';

export interface ServiceCategory { key: string; label: string; group: string }
export interface CategoryGroup { group: string; items: ServiceCategory[] }

/**
 * What a browser sees. There is deliberately no `phone` and no owner on this
 * type — the server does not send either, and a type that admits them is an
 * invitation to render them the moment somebody adds them back.
 */
export type FieldKind = 'text' | 'longtext' | 'number' | 'money' | 'minutes' | 'toggle' | 'chips' | 'select';
export type SectionKind =
  | 'about' | 'menu' | 'priceList' | 'offers' | 'gallery'
  | 'reviews' | 'credentials' | 'availability' | 'location';

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  hint?: string;
  options?: string[];
  max?: number;
}
export interface BusinessTypeDef {
  key: string;
  label: string;
  group: string;
  blurb: string;
  fields: FieldDef[];
  sections: SectionKind[];
}

export interface ServiceCard {
  id: string;
  /** Their own address: /services/anna-idli. Null on listings older than
   *  slugs, which the screens address by id instead. */
  slug: string | null;
  businessName: string;
  categoryKey: string;
  categoryLabel: string;
  about: string | null;
  categoryGroup: string;
  /** The schema key this page is generated from. Null on older listings. */
  businessType: string | null;
  /** Which sections this page renders, in order — from the schema, not here. */
  sections: SectionKind[];
  /** Already labelled by the schema. The screen never holds a second copy of
   *  a field's wording. */
  details: Array<{ label: string; value: string }>;
  city: string;
  areas: string[];
  /** The exact door — building name and road name. Public like the pin. */
  building: string | null;
  street: string | null;
  /** The shop's own sign, chosen by the owner. Fallback: first gallery photo. */
  logoUrl: string | null;
  priceFrom: number | null;
  photos: Array<{ url: string; caption?: string }>;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  /** Present only on a "near me" search — the server measured it. */
  distanceKm?: number;
  /** Withheld below three reviews — one five-star review is one happy customer,
   *  not a five-star business. The count is always honest. */
  rating?: number | null;
  count?: number;
  /** Present only when the owner chose to publish it. Absent, never blank. */
  phone?: string;
  /**
   * WHEN THEY ARE OPEN — seven rows, Monday first, or null.
   *
   * NULL IS "NEVER TOLD US", not "closed", and every screen keeps the two
   * apart: one is an absence, the other is a claim about somebody's shop.
   * The open-now answer is NOT on the wire on purpose — it changes on the
   * minute, and a value baked into a response is wrong the moment a page is
   * left open. The rule lives in `hours.ts` on both sides; the browser
   * supplies the clock.
   */
  hours?: DayHours[] | null;
  /**
   * WHAT WAS CHECKED ABOUT THIS BUSINESS, AND BY WHOM.
   *
   * Null at the bottom rung, and that is the absence of a claim rather than a
   * claim of absence — a grey "not verified" chip would mark every honest new
   * business in the city on the day it most needs answering. Both strings come
   * from the server so that one wording exists: a page and an API that disagree
   * about what a badge claims is how "verified" quietly becomes a promise
   * Together City never made.
   */
  trust?: TrustSummary | null;
  createdAt: string;
}

export type TrustTier = 'basic' | 'identity' | 'business' | 'trusted';
export type EntityKind = 'individual' | 'proprietor' | 'registered' | 'company';
export type DocKind =
  | 'gstin' | 'udyam' | 'shop_establishment' | 'trade_licence'
  | 'incorporation' | 'fssai' | 'professional' | 'rera';
export type DocStatus = 'none' | 'submitted' | 'verified' | 'rejected';

export interface TrustSummary {
  tier: TrustTier;
  label: string | null;
  blurb: string | null;
  /**
   * THE INDIVIDUAL CHECKS BEHIND THE BADGE — present on directory cards, absent
   * on the single-listing read, which sends the badge alone.
   *
   * There is no score here and there is not going to be one. A "Trust Score
   * 92/100" printed against somebody else's business is a number the platform
   * cannot show its working for; `done of total` is the same reassurance and
   * every part of it can be pointed at.
   */
  checks?: Array<{ key: 'phone' | 'identity' | 'business' | 'place' | 'video'; label: string; done: boolean }>;
  done?: number;
  total?: number;
}

/** The owner's own view: the rungs, what is missing, and who is waiting. */
export interface ListingTrust extends TrustSummary {
  entityKind: EntityKind | null;
  entityKinds: Array<{ kind: string; label: string }>;
  phoneVerified: boolean;
  identityVerified: boolean;
  docKind: DocKind | null;
  docRef: string | null;
  docStatus: DocStatus;
  docRejectReason: string | null;
  placeConfirmed: boolean;
  /** The owner-on-video rung — none | submitted | verified | rejected. */
  videoStatus: DocStatus;
  videoRejectReason: string | null;
  /** Neighbours whose message this business has not been given yet. */
  waiting: number;
  freePerDay: number;
  gateLifted: boolean;
  nextStep: string | null;
  accepts: Array<{ kind: DocKind; label: string }>;
  requires: DocKind[] | null;
  why: string | null;
}
export interface SubmitVerificationInput {
  entityKind: EntityKind;
  docKind?: DocKind;
  docRef?: string;
  docUrl?: string;
}
/** Your own listing, read back — your number is here whether or not it is public. */
export interface MyServiceCard extends Omit<ServiceCard, 'phone'> {
  /** Yours, whether or not it is published. Null means you never gave one. */
  phone: string | null;
  phonePublic: boolean;
  /** The raw answers, for the edit form. The page uses `details` instead. */
  detailValues: Record<string, unknown>;
  moderation: string;
  updatedAt: string;
}

export interface ServiceThread {
  id: string;
  /** The customer number this business knows them by — "#3", whichever side
   *  is reading. Never a name. */
  alias: string;
  /**
   * WHETHER THE PERSON ASKING CHOSE TO BE NAMED, per business. False for every
   * thread that existed before 16 Aug, and false for every new one: a name
   * appears because somebody pressed something, never because a screen was
   * rebuilt.
   */
  revealName?: boolean;
  /** Their display name — present ONLY on the business's side, and only when
   *  they gave it. Absent, never blank, and never anything else about them:
   *  no id, no handle, no photo, no profile link. */
  name?: string;
  listingId: string;
  lastMessageAt: string;
  closed: boolean;
  createdAt: string;
  unread: number;
  side: 'seeker' | 'owner';
  business?: { id: string; businessName: string; categoryLabel: string; city: string } | null;
  businessName?: string | null;
}
export interface ServiceMessage { id: string; body: string; createdAt: string; mine: boolean; invoiceId?: string; orderId?: string }

export interface ListingInput {
  businessName: string;
  categoryKey: string;
  about?: string;
  city: string;
  areas?: string;
  /** The exact door — building name and road name. Empty string clears it. */
  building?: string;
  street?: string;
  /** The shop's own sign. null takes it down. */
  logoUrl?: string | null;
  slug?: string;
  businessType?: string;
  details?: Record<string, unknown>;
  phone?: string;
  phonePublic?: boolean;
  priceFrom?: number;
  photoUrls?: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Seven rows, Monday first. An empty array takes the hours off the page;
   *  omitting the field leaves them alone. */
  hours?: DayHours[];
}

export interface ServiceOffer {
  id: string;
  listingId: string;
  title: string;
  detail: string | null;
  startsOn: string;
  endsOn: string;
  startsToday: boolean;
  live?: boolean;
}
export interface ServiceReview {
  id: string;
  listingId: string;
  /** The signature, and there is nothing else — no id, no name, no photo. */
  alias: string;
  rating: number;
  body: string | null;
  ownerReply: string | null;
  createdAt: string;
  mine: boolean;
}
export interface ReviewPage {
  rating: number | null;
  count: number;
  items: ServiceReview[];
  canReview: boolean;
  /** Your own alias for this business — what a review of yours is signed with.
   *  Null when you have never spoken to them, which is also when you cannot
   *  review them. */
  alias: string | null;
  mine: ServiceReview | null;
}

export interface MenuOption { name: string; priceInr: number }
export interface MenuItem {
  id: string;
  section: string | null;
  name: string;
  description: string | null;
  /** null is "ask", and it is not the same as free. */
  priceInr: number | null;
  /** The sold-out switch. A row that is off STAYS ON THE PAGE and says so —
   *  a dish that vanishes reads as a menu that shrank. */
  available: boolean;
  /** veg | nonveg | egg | null. Null is "the menu did not say". */
  veg: string | null;
  /** 0–3 chillies, or null for unsaid. */
  spice: number | null;
  photoUrl: string | null;
  prepMinutes: number | null;
  /** Sizes of the same dish (Half/Full). Empty when it comes one way. */
  variants: MenuOption[];
  /** Extras that ride on it ("Extra gravy +₹40"). */
  addons: MenuOption[];
}
/** What the reader proposed — no ids — or a live line loaded for editing,
 *  which KEEPS its id so the fields the bulk editor does not show survive. */
export interface MenuDraftItem {
  id?: string;
  section?: string;
  name: string;
  description?: string;
  priceInr: number | null;
}
export interface MenuPage {
  count: number;
  sections: Array<{ section: string | null; items: MenuItem[] }>;
  scanUrl: string | null;
}

// ── ordering ────────────────────────────────────────────────────────────────

/** One line as the citizen picks it. Names, not prices — prices are the server's. */
export interface OrderPick { itemId: string; qty: number; variant?: string; addons?: string[] }
/** One line as it was agreed — a snapshot no later menu edit can rewrite. */
export interface OrderLine {
  name: string; qty: number; unitPriceInr: number;
  variant?: string; addons?: MenuOption[]; lineTotalInr: number;
}
export interface OrderQuote {
  lines: OrderLine[];
  subtotalInr: number;
  /** The two flat fees, itemized — ₹20 platform always, ₹50 delivery on
   *  delivery orders. Never folded into a line, never only in the charge. */
  platformFeeInr: number;
  deliveryFeeInr: number;
  totalInr: number;
  walletInr: number;
  card: { brand: string | null; last4: string | null; name: string | null } | null;
  shortfallInr: number;
  /** The share-details sentence, server-owned so one wording exists. */
  shares: string;
}
export type OrderStatus =
  | 'submitted' | 'accepted' | 'preparing' | 'ready' | 'completed' | 'rejected' | 'cancelled';
export interface ServiceOrderView {
  id: string;
  number: string;
  status: OrderStatus;
  /** What this state means, in the server's one wording. */
  statusLine: string;
  fulfilment: 'delivery' | 'pickup';
  lines: OrderLine[];
  subtotalInr: number;
  platformFeeInr: number;
  deliveryFeeInr: number;
  totalInr: number;
  prepMinutes: number | null;
  note: string | null;
  adjustmentNote: string | null;
  rejectReason: string | null;
  cancelReason: string | null;
  enquiryId: string;
  listingId: string;
  submittedAt: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  /** Which states this one may still become. Empty when it is finished. */
  next: OrderStatus[];
  /** OWNER'S COPY ONLY — what the citizen chose to share for this order.
   *  Absent on the citizen's own copy: they know where they live, and their
   *  copy of the wire is one more place it could travel from. */
  customerName?: string;
  phone?: string | null;
  addressText?: string | null;
  lat?: number | null;
  lng?: number | null;
  /** On the citizen's list rows only. */
  businessName?: string;
}
export interface PlaceOrderInput {
  items: OrderPick[];
  fulfilment: 'delivery' | 'pickup';
  /** The total on the button. Charged only if it is still true. */
  expectInr: number;
  note?: string;
  phone: string;
  address?: string;
  saveAddress?: boolean;
  lat?: number;
  lng?: number;
}
export interface RecommendResult {
  picks: Array<{
    itemId: string; name: string; section: string | null; description: string | null;
    priceInr: number; veg: string | null; spice: number | null; qty: number; lineTotalInr: number;
  }>;
  totalInr: number;
  why: string;
  /** What was left out because of a declared allergen, named so a wrong match
   *  can be corrected rather than trusted. */
  screened?: string[];
  caveat: string;
}
export interface PatchMenuItemInput {
  available?: boolean;
  priceInr?: number | null;
  name?: string;
  description?: string | null;
  section?: string | null;
  veg?: 'veg' | 'nonveg' | 'egg' | null;
  spice?: number | null;
  photoUrl?: string | null;
  prepMinutes?: number | null;
  variants?: MenuOption[] | null;
  addons?: MenuOption[] | null;
}

export interface RegularCard extends ServiceCard {
  savedAt: string;
  note: string | null;
  closed: boolean;
  offersToday: ServiceOffer[];
}

// ── the place tree: country → state → city → areas ──────────────────────────
export interface PlaceCity { name: string; aliases?: string[]; areas: string[] }
export interface PlaceState { name: string; cities: PlaceCity[] }
export interface PlaceCountry { name: string; states: PlaceState[] }

/** The canonical city for whatever name arrived — picker value, alias, or the
 *  geocoder's district — or null, which sends the form to its typed hatch. */
export function findCityIn(tree: PlaceCountry[], name: string): { country: string; state: string; city: PlaceCity } | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  for (const country of tree) {
    for (const state of country.states) {
      for (const city of state.cities) {
        if (city.name.toLowerCase() === n || (city.aliases ?? []).some((a) => a.toLowerCase() === n)) {
          return { country: country.name, state: state.name, city };
        }
      }
    }
  }
  return null;
}

export const servicesApi = {
  categories: () => api.get<{ groups: CategoryGroup[] }>('/services/categories').then((r) => r.data),
  places: () => api.get<{ countries: PlaceCountry[] }>('/services/places').then((r) => r.data),
  facets: (city?: string) => api.get<Record<string, number>>('/services/facets', { params: { city } }).then((r) => r.data),
  browse: (q: { category?: string; group?: string; city?: string; area?: string; q?: string; page?: number; near?: string; withinKm?: number }) =>
    api.get<{ items: ServiceCard[]; total: number; page: number; pages: number; saved: string[] }>('/services', { params: q }).then((r) => r.data),
  businessTypes: () =>
    api.get<{ types: BusinessTypeDef[] }>('/services/business-types').then((r) => r.data),
  detail: (idOrSlug: string) => api.get<ServiceCard>(`/services/${idOrSlug}`).then((r) => r.data),
  slugAvailable: (slug: string) =>
    api.get<{ slug: string; available: boolean; reason: string | null }>(
      '/services/slug/available', { params: { slug } },
    ).then((r) => r.data),
  mine: () => api.get<MyServiceCard[]>('/services/mine').then((r) => r.data),
  create: (input: ListingInput) => api.post<MyServiceCard>('/services', input).then((r) => r.data),
  // PATCH exists on the server and is exercised by the cross-user probe. There
  // is no `useUpdateService` yet because there is no edit screen yet — a hook
  // nothing calls is a hook nobody maintains, so it arrives with the screen.
  update: (id: string, input: Partial<ListingInput>) => api.patch<MyServiceCard>(`/services/${id}`, input).then((r) => r.data),
  close: (id: string) => api.delete<MyServiceCard>(`/services/${id}`).then((r) => r.data),
  deleteForever: (id: string) =>
    api.delete<{ ok: true; id: string }>(`/services/${id}/forever`).then((r) => r.data),
  enquire: (id: string, message?: string) =>
    api.post<ServiceThread>(`/services/${id}/enquire`, { message }).then((r) => r.data),
  inbox: () => api.get<{ seeking: ServiceThread[]; receiving: ServiceThread[] }>('/services/inbox').then((r) => r.data),
  thread: (id: string) =>
    api.get<{ thread: ServiceThread; business: { id: string; businessName: string; categoryLabel: string; city: string }; messages: ServiceMessage[] }>(`/services/threads/${id}`).then((r) => r.data),
  send: (id: string, body: string) =>
    api.post<ServiceMessage>(`/services/threads/${id}/messages`, { body }).then((r) => r.data),
  saveRegular: (id: string, note?: string) =>
    api.post<{ saved: boolean }>(`/services/${id}/regular`, { note }).then((r) => r.data),
  forgetRegular: (id: string) =>
    api.delete<{ saved: boolean }>(`/services/${id}/regular`).then((r) => r.data),
  regulars: () => api.get<{ items: RegularCard[] }>('/services/regulars').then((r) => r.data),

  offersToday: () =>
    api.get<{ items: Array<ServiceOffer & { business: ServiceCard }> }>('/services/offers/today').then((r) => r.data),
  myOffers: (listingId: string) =>
    api.get<{ items: ServiceOffer[] }>(`/services/offers/mine/${listingId}`).then((r) => r.data),
  postOffer: (listingId: string, input: { title: string; detail?: string; startsOn?: string; endsOn?: string }) =>
    api.post<ServiceOffer>(`/services/${listingId}/offers`, input).then((r) => r.data),
  removeOffer: (offerId: string) =>
    api.delete<{ ok: true }>(`/services/offers/${offerId}`).then((r) => r.data),

  reviews: (listingId: string) =>
    api.get<ReviewPage>(`/services/${listingId}/reviews`).then((r) => r.data),
  postReview: (listingId: string, input: { rating: number; body?: string }) =>
    api.post<ServiceReview>(`/services/${listingId}/reviews`, input).then((r) => r.data),
  removeReview: (listingId: string) =>
    api.delete<{ ok: true }>(`/services/${listingId}/reviews`).then((r) => r.data),
  replyToReview: (reviewId: string, reply: string) =>
    api.post<ServiceReview>(`/services/reviews/${reviewId}/reply`, { reply }).then((r) => r.data),

  verification: (listingId: string) =>
    api.get<ListingTrust>(`/services/${listingId}/verification`).then((r) => r.data),
  submitVerification: (listingId: string, input: SubmitVerificationInput) =>
    api.post<ListingTrust>(`/services/${listingId}/verification`, input).then((r) => r.data),
  submitVerificationVideo: (listingId: string, videoKey: string) =>
    api.post<ListingTrust>(`/services/${listingId}/verification/video`, { videoKey }).then((r) => r.data),

  menu: (listingId: string) => api.get<MenuPage>(`/services/${listingId}/menu`).then((r) => r.data),
  // Reading a photographed menu is a vision-model call and routinely outruns
  // the client's default 20s timeout on a real menu (a dense page takes the
  // model longer than a test card). Without this override the browser gave up
  // mid-read and showed "Could not reach the server" — the same lesson
  // medical/api.ts already recorded on ingestBlood, learned here a second
  // time from the owner's own restaurant listing (24 Aug).
  scanMenu: (listingId: string, image: string) =>
    api.post<{ items: MenuDraftItem[]; note: string; review: string }>(`/services/${listingId}/menu/scan`, { image }, { timeout: 180000 }).then((r) => r.data),
  saveMenu: (listingId: string, input: { scanUrl?: string; items: MenuDraftItem[] }) =>
    api.post<MenuPage>(`/services/${listingId}/menu`, input).then((r) => r.data),
  askAboutMenu: (listingId: string, itemIds: string[], note?: string) =>
    api.post<{ threadId: string }>(`/services/${listingId}/menu/ask`, { itemIds, note }).then((r) => r.data),
  patchMenuItem: (listingId: string, itemId: string, patch: PatchMenuItemInput) =>
    api.patch<MenuPage>(`/services/${listingId}/menu/${itemId}`, patch).then((r) => r.data),

  quoteOrder: (listingId: string, items: OrderPick[], fulfilment: 'delivery' | 'pickup') =>
    api.post<OrderQuote>(`/services/${listingId}/order/quote`, { items, fulfilment }).then((r) => r.data),
  // The one call here that moves money. `Idempotency-Key` is the standard
  // header, the same way the wallet's top-up and the till's pay already say it.
  placeOrder: (listingId: string, input: PlaceOrderInput, idempotencyKey: string) =>
    api.post<{ order: ServiceOrderView; threadId: string }>(`/services/${listingId}/order`, input,
      { headers: { 'Idempotency-Key': idempotencyKey } }).then((r) => r.data),
  recommend: (listingId: string, brief: string) =>
    api.post<RecommendResult>(`/services/${listingId}/menu/recommend`, { brief }, { timeout: 60000 }).then((r) => r.data),

  myOrders: () => api.get<{ orders: ServiceOrderView[] }>('/services/orders/mine').then((r) => r.data),
  businessOrders: (listingId: string) =>
    api.get<{ open: ServiceOrderView[]; done: ServiceOrderView[] }>(`/services/orders/business/${listingId}`).then((r) => r.data),
  order: (orderId: string) => api.get<ServiceOrderView>(`/services/orders/${orderId}`).then((r) => r.data),
  acceptOrder: (orderId: string, input: { prepMinutes?: number; removeLines?: number[]; adjustmentNote?: string }) =>
    api.post<ServiceOrderView>(`/services/orders/${orderId}/accept`, input).then((r) => r.data),
  rejectOrder: (orderId: string, reason: string) =>
    api.post<ServiceOrderView>(`/services/orders/${orderId}/reject`, { reason }).then((r) => r.data),
  advanceOrder: (orderId: string, to: 'preparing' | 'ready' | 'completed') =>
    api.post<ServiceOrderView>(`/services/orders/${orderId}/advance`, { to }).then((r) => r.data),
  cancelOrder: (orderId: string, reason?: string) =>
    api.post<ServiceOrderView>(`/services/orders/${orderId}/cancel`, { reason }).then((r) => r.data),
};

/** The owner's verification tab. Its own query key so that approving a
 *  document refreshes the tab and the inbox together. */
export function useListingTrust(listingId?: string) {
  return useQuery({
    queryKey: ['services', 'verification', listingId],
    queryFn: () => servicesApi.verification(listingId as string),
    enabled: !!listingId,
  });
}
export function useSubmitVerification(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: SubmitVerificationInput) => servicesApi.submitVerification(listingId as string, v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useSubmitVerificationVideo(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoKey: string) => servicesApi.submitVerificationVideo(listingId as string, videoKey),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}

/** The place tree — static vocabulary, cached like the categories are. */
export function usePlaces() {
  return useQuery({ queryKey: ['services', 'places'], queryFn: servicesApi.places, staleTime: 3_600_000 });
}
export function useMenu(listingId?: string) {
  return useQuery({
    queryKey: ['services', 'menu', listingId],
    queryFn: () => servicesApi.menu(listingId as string),
    enabled: !!listingId,
  });
}
export function useScanMenu(listingId?: string) {
  return useMutation({ mutationFn: (image: string) => servicesApi.scanMenu(listingId as string, image) });
}
export function useSaveMenu(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { scanUrl?: string; items: MenuDraftItem[] }) => servicesApi.saveMenu(listingId as string, v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'menu'] }); },
  });
}
export function useAskAboutMenu(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemIds: string[]; note?: string }) => servicesApi.askAboutMenu(listingId as string, v.itemIds, v.note),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}

export function usePatchMenuItem(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { itemId: string; patch: PatchMenuItemInput }) =>
      servicesApi.patchMenuItem(listingId as string, v.itemId, v.patch),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'menu'] }); },
  });
}
export function useQuoteOrder(listingId?: string) {
  return useMutation({
    mutationFn: (v: { items: OrderPick[]; fulfilment: 'delivery' | 'pickup' }) =>
      servicesApi.quoteOrder(listingId as string, v.items, v.fulfilment),
  });
}
export function usePlaceOrder(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { input: PlaceOrderInput; idempotencyKey: string }) =>
      servicesApi.placeOrder(listingId as string, v.input, v.idempotencyKey),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useRecommend(listingId?: string) {
  return useMutation({ mutationFn: (brief: string) => servicesApi.recommend(listingId as string, brief) });
}
export function useMyOrders() {
  return useQuery({ queryKey: ['services', 'orders', 'mine'], queryFn: servicesApi.myOrders });
}
/** The kitchen's board. Polls while it is open — a kitchen does not refresh. */
export function useBusinessOrders(listingId?: string) {
  return useQuery({
    queryKey: ['services', 'orders', 'business', listingId],
    queryFn: () => servicesApi.businessOrders(listingId as string),
    enabled: !!listingId,
    refetchInterval: 15_000,
  });
}
/** One order. Polls while it is still moving, rests once it is finished. */
export function useOrder(orderId?: string) {
  return useQuery({
    queryKey: ['services', 'orders', orderId],
    queryFn: () => servicesApi.order(orderId as string),
    enabled: !!orderId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s && ['completed', 'rejected', 'cancelled'].includes(s) ? false : 12_000;
    },
  });
}
function useOrderVerb<T>(fn: (v: T) => Promise<ServiceOrderView>) {
  // Every verb reprices the same three surfaces: the card, the board, the list.
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'orders'] }); },
  });
}
export function useAcceptOrder(orderId?: string) {
  return useOrderVerb((v: { prepMinutes?: number; removeLines?: number[]; adjustmentNote?: string }) =>
    servicesApi.acceptOrder(orderId as string, v));
}
export function useRejectOrder(orderId?: string) {
  return useOrderVerb((reason: string) => servicesApi.rejectOrder(orderId as string, reason));
}
export function useAdvanceOrder(orderId?: string) {
  return useOrderVerb((to: 'preparing' | 'ready' | 'completed') => servicesApi.advanceOrder(orderId as string, to));
}
export function useCancelOrder(orderId?: string) {
  return useOrderVerb((reason: string | undefined) => servicesApi.cancelOrder(orderId as string, reason));
}

/** Downscale a menu photo before it goes to the reader. 1600px because a menu
 *  is text and text is what gets lost first — the food journal's 1280 is tuned
 *  for a plate, not for 9pt prices in a bottom corner. */
export function menuPhotoToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That image could not be read.')); };
    img.src = url;
  });
}

/**
 * WHAT TO CALL THE LIST, AND WHAT PRESSING THE BUTTON MEANS.
 *
 * A restaurant has a menu and you order from it. A plumber, a tutor and a
 * salon have a price list and you book off it. It is the same table of rows
 * underneath, and asking a plumber to "order" from his menu is the app telling
 * the citizen it has not understood what the business does.
 *
 * Both verbs stop at the same place: a MESSAGE in the thread. Nothing here
 * takes money, holds stock or confirms a time, and the button says so.
 */
export interface MenuVoice {
  heading: string;
  blurb: string;
  action: string;
  caveat: string;
  unit: (n: number) => string;
}
const FOOD = 'Food & Daily Needs';
export function menuVoice(group: string): MenuVoice {
  if (group === FOOD) {
    return {
      heading: 'Menu',
      blurb: 'Pick what you want and send it across. It starts a message, not an order.',
      action: 'Ask about these',
      caveat: 'It is a question, not an order',
      unit: (n) => (n === 1 ? 'item' : 'items'),
    };
  }
  return {
    heading: 'What they do, and what it costs',
    blurb: 'Pick what you need and send it across. It starts a message, not a booking.',
    action: 'Ask to book these',
    caveat: 'It is a question, not a booking',
    unit: (n) => (n === 1 ? 'service' : 'services'),
  };
}

export function useReviews(listingId?: string) {
  return useQuery({
    queryKey: ['services', 'reviews', listingId],
    queryFn: () => servicesApi.reviews(listingId as string),
    enabled: !!listingId,
  });
}
export function usePostReview(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { rating: number; body?: string }) => servicesApi.postReview(listingId as string, v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useRemoveReview(listingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => servicesApi.removeReview(listingId as string),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useReplyToReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reviewId: string; reply: string }) => servicesApi.replyToReview(v.reviewId, v.reply),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'reviews'] }); },
  });
}

/** ★★★☆☆ as text. Not colour-only, and it reads aloud correctly. */
export const stars = (n: number): string => '★'.repeat(n) + '☆'.repeat(Math.max(0, 5 - n));

export function useRegulars() {
  return useQuery({ queryKey: ['services', 'regulars'], queryFn: () => servicesApi.regulars() });
}
/**
 * One mutation for both directions. A separate save and forget hook means two
 * places that have to remember to invalidate the same three queries, and the
 * day one of them forgets, a heart stays filled after it was emptied.
 */
export function useToggleRegular() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; saved: boolean }) =>
      v.saved ? servicesApi.forgetRegular(v.id) : servicesApi.saveRegular(v.id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
/**
 * The address to link to. Their own name when they have chosen one, their id
 * when they have not — never a link that 404s because a slug was assumed.
 */
export const serviceHref = (s: { slug?: string | null; id: string }): string =>
  `/services/${s.slug ?? s.id}`;

/**
 * The schema, fetched rather than bundled, so the questions an owner answers
 * can never be a release behind the rules the server checks them against.
 * Static for the life of a deploy, so it is cached hard.
 */
export function useBusinessTypes() {
  return useQuery({
    queryKey: ['services', 'business-types'],
    queryFn: () => servicesApi.businessTypes(),
    staleTime: 60 * 60 * 1000,
  });
}

/** One business, its own page. */
export function useService(id?: string) {
  return useQuery({
    queryKey: ['services', 'detail', id],
    queryFn: () => servicesApi.detail(id as string),
    enabled: !!id,
  });
}
export function useOffersToday() {
  return useQuery({ queryKey: ['services', 'offers', 'today'], queryFn: () => servicesApi.offersToday() });
}
export function useMyOffers(listingId?: string) {
  return useQuery({
    queryKey: ['services', 'offers', 'mine', listingId],
    queryFn: () => servicesApi.myOffers(listingId as string),
    enabled: !!listingId,
  });
}
export function usePostOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { listingId: string; input: { title: string; detail?: string; startsOn?: string; endsOn?: string } }) =>
      servicesApi.postOffer(v.listingId, v.input),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'offers'] }); },
  });
}
export function useRemoveOffer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (offerId: string) => servicesApi.removeOffer(offerId),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'offers'] }); },
  });
}

/** "Today only", "until 9 Aug" — an offer's dates said the way somebody would. */
export function offerWhen(o: { startsOn: string; endsOn: string }): string {
  const today = new Date().toISOString().slice(0, 10);
  if (o.endsOn === today) return 'Last day';
  if (o.startsOn === o.endsOn) return o.startsOn === today ? 'Today only' : `On ${o.startsOn}`;
  const end = new Date(`${o.endsOn}T00:00:00Z`);
  return `Until ${end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
}

export function useServiceCategories() {
  // The vocabulary is static on the server, so it is worth caching hard — the
  // picker should never show a spinner.
  return useQuery({ queryKey: ['services', 'categories'], queryFn: () => servicesApi.categories(), staleTime: 60 * 60 * 1000 });
}
export function useServiceFacets(city?: string) {
  return useQuery({ queryKey: ['services', 'facets', city ?? ''], queryFn: () => servicesApi.facets(city) });
}
export function useBrowseServices(q: { category?: string; group?: string; city?: string; area?: string; q?: string; page?: number; near?: string; withinKm?: number }) {
  return useQuery({ queryKey: ['services', 'browse', q], queryFn: () => servicesApi.browse(q) });
}
export function useMyServices() {
  return useQuery({ queryKey: ['services', 'mine'], queryFn: () => servicesApi.mine() });
}
export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: ListingInput) => servicesApi.create(v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
/**
 * Editing a listing. Every field the form holds is sent, empty ones included:
 * to the PATCH handler `undefined` means "leave it alone", so an owner who
 * cleared their starting price would watch it reappear.
 */
export function useUpdateService(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: Partial<ListingInput>) => servicesApi.update(id as string, v),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useCloseService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servicesApi.close(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
/**
 * The one that does not come back. Separate from useCloseService because they
 * are different acts and a shared hook is how a screen ends up calling the
 * wrong one — and because this invalidates the inbox too: the threads went with
 * the listing.
 */
export function useDeleteServiceForever() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => servicesApi.deleteForever(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services'] }); },
  });
}
export function useEnquire() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; message?: string }) => servicesApi.enquire(v.id, v.message),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['services', 'inbox'] }); },
  });
}
export function useServiceInbox() {
  return useQuery({ queryKey: ['services', 'inbox'], queryFn: () => servicesApi.inbox() });
}
export function useServiceThread(id?: string) {
  return useQuery({
    queryKey: ['services', 'thread', id],
    queryFn: () => servicesApi.thread(id as string),
    enabled: !!id,
    // A conversation somebody is waiting on. Cheap poll, no socket — this hub's
    // threads deliberately do not ride the chat hub's plumbing.
    refetchInterval: 8000,
  });
}
/**
 * SHOW MY NAME TO THIS BUSINESS — or take it back down.
 *
 * The thread AND the inbox are invalidated: the row in the list says what the
 * business now sees, and a page that updated one and not the other would tell
 * somebody two different things about who knows their name.
 */
export function useRevealName(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reveal: boolean) =>
      api.post<ServiceThread>(`/services/threads/${id}/reveal`, { reveal }).then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services', 'thread', id] });
      void qc.invalidateQueries({ queryKey: ['services', 'inbox'] });
    },
  });
}

export function useSendServiceMessage(id?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => servicesApi.send(id as string, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['services', 'thread', id] });
      void qc.invalidateQueries({ queryKey: ['services', 'inbox'] });
    },
  });
}

export const rupees = (n: number | null): string =>
  n == null ? '' : `₹${n.toLocaleString('en-IN')}`;

/** Metres under a kilometre, one decimal above — the way a person says it.
 *  Mirrors the server's own `humanDistance`; both are three lines and a shared
 *  package for three lines costs more than it saves. */
export const humanDistance = (km: number): string =>
  km < 1 ? `${Math.round((km * 1000) / 10) * 10} m`
    : km < 10 ? `${km.toFixed(1)} km`
    : `${Math.round(km)} km`;

/**
 * The browser's own location, asked for once and only when somebody presses a
 * button. Never on page load: a permission prompt nobody invited is a prompt
 * most people decline, and a declined prompt is hard to ask for again.
 */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracyM: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) { reject(new Error('This browser cannot share a location.')); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED
          ? 'Location permission was declined — you can type the coordinates instead.'
          : 'Could not read your location just now. Try again, or type the coordinates.')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}
