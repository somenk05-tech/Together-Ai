import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface ServiceCategory { key: string; label: string; group: string }
export interface CategoryGroup { group: string; items: ServiceCategory[] }

/**
 * What a browser sees. There is deliberately no `phone` and no owner on this
 * type — the server does not send either, and a type that admits them is an
 * invitation to render them the moment somebody adds them back.
 */
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
  city: string;
  areas: string[];
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
  createdAt: string;
}
/** Your own listing, read back — your number is here whether or not it is public. */
export interface MyServiceCard extends Omit<ServiceCard, 'phone'> {
  /** Yours, whether or not it is published. Null means you never gave one. */
  phone: string | null;
  phonePublic: boolean;
  moderation: string;
  updatedAt: string;
}

export interface ServiceThread {
  id: string;
  alias: string;
  listingId: string;
  lastMessageAt: string;
  closed: boolean;
  createdAt: string;
  unread: number;
  side: 'seeker' | 'owner';
  business?: { id: string; businessName: string; categoryLabel: string; city: string } | null;
  businessName?: string | null;
}
export interface ServiceMessage { id: string; body: string; createdAt: string; mine: boolean }

export interface ListingInput {
  businessName: string;
  categoryKey: string;
  about?: string;
  city: string;
  areas?: string;
  slug?: string;
  phone?: string;
  phonePublic?: boolean;
  priceFrom?: number;
  photoUrls?: string[];
  lat?: number;
  lng?: number;
  radiusKm?: number;
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
  mine: ServiceReview | null;
}

export interface MenuItem {
  id: string;
  section: string | null;
  name: string;
  description: string | null;
  /** null is "ask", and it is not the same as free. */
  priceInr: number | null;
}
/** What the reader proposed. No ids, because nothing has been stored. */
export interface MenuDraftItem {
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

export interface RegularCard extends ServiceCard {
  savedAt: string;
  note: string | null;
  closed: boolean;
  offersToday: ServiceOffer[];
}

export const servicesApi = {
  categories: () => api.get<{ groups: CategoryGroup[] }>('/services/categories').then((r) => r.data),
  facets: (city?: string) => api.get<Record<string, number>>('/services/facets', { params: { city } }).then((r) => r.data),
  browse: (q: { category?: string; city?: string; area?: string; q?: string; page?: number; near?: string; withinKm?: number }) =>
    api.get<{ items: ServiceCard[]; total: number; page: number; pages: number; saved: string[] }>('/services', { params: q }).then((r) => r.data),
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
  enquire: (id: string, message?: string) =>
    api.post<ServiceThread>(`/services/${id}/enquire`, { message }).then((r) => r.data),
  inbox: () => api.get<{ seeking: ServiceThread[]; receiving: ServiceThread[] }>('/services/inbox').then((r) => r.data),
  thread: (id: string) =>
    api.get<{ thread: ServiceThread; business: { id: string; businessName: string; categoryLabel: string; city: string }; messages: ServiceMessage[] }>(`/services/threads/${id}`).then((r) => r.data),
  send: (id: string, body: string) =>
    api.post<ServiceMessage>(`/services/threads/${id}/messages`, { body }).then((r) => r.data),
  closeThread: (id: string) =>
    api.post<{ ok: true }>(`/services/threads/${id}/close`, {}).then((r) => r.data),

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

  menu: (listingId: string) => api.get<MenuPage>(`/services/${listingId}/menu`).then((r) => r.data),
  scanMenu: (listingId: string, image: string) =>
    api.post<{ items: MenuDraftItem[]; note: string; review: string }>(`/services/${listingId}/menu/scan`, { image }).then((r) => r.data),
  saveMenu: (listingId: string, input: { scanUrl?: string; items: MenuDraftItem[] }) =>
    api.post<MenuPage>(`/services/${listingId}/menu`, input).then((r) => r.data),
  askAboutMenu: (listingId: string, itemIds: string[], note?: string) =>
    api.post<{ threadId: string }>(`/services/${listingId}/menu/ask`, { itemIds, note }).then((r) => r.data),
};

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
export function useBrowseServices(q: { category?: string; city?: string; area?: string; q?: string; page?: number; near?: string; withinKm?: number }) {
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
