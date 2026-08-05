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
  businessName: string;
  categoryKey: string;
  categoryLabel: string;
  about: string | null;
  city: string;
  areas: string[];
  priceFrom: number | null;
  photos: Array<{ url: string; caption?: string }>;
  createdAt: string;
}
/** Your own listing, read back — this is the one place a phone number exists. */
export interface MyServiceCard extends ServiceCard {
  phone: string | null;
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
  phone?: string;
  priceFrom?: number;
  photoUrls?: string[];
}

export const servicesApi = {
  categories: () => api.get<{ groups: CategoryGroup[] }>('/services/categories').then((r) => r.data),
  facets: (city?: string) => api.get<Record<string, number>>('/services/facets', { params: { city } }).then((r) => r.data),
  browse: (q: { category?: string; city?: string; area?: string; q?: string; page?: number }) =>
    api.get<{ items: ServiceCard[]; total: number; page: number; pages: number }>('/services', { params: q }).then((r) => r.data),
  detail: (id: string) => api.get<ServiceCard>(`/services/${id}`).then((r) => r.data),
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
};

export function useServiceCategories() {
  // The vocabulary is static on the server, so it is worth caching hard — the
  // picker should never show a spinner.
  return useQuery({ queryKey: ['services', 'categories'], queryFn: () => servicesApi.categories(), staleTime: 60 * 60 * 1000 });
}
export function useServiceFacets(city?: string) {
  return useQuery({ queryKey: ['services', 'facets', city ?? ''], queryFn: () => servicesApi.facets(city) });
}
export function useBrowseServices(q: { category?: string; city?: string; area?: string; q?: string; page?: number }) {
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
