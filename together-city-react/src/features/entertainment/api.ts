import { http as api } from '@/api/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Category { key: string; label: string; icon: string }
export interface Tier { name: string; priceInr: number; available: number }
export interface EventCard {
  id: string; title: string; category: string; categoryLabel: string; icon: string;
  venue: string; city: string; date: string; time: string; posterUrl: string; priceFromInr: number;
}
export interface EventDetail extends EventCard { description: string; tiers: Tier[] }
export interface Ticket {
  id: string; eventId: string; title: string; tier: string; qty: number; totalInr: number; code: string; status: string;
  date: string; time: string; venue: string; city: string; icon: string; bookedOn: string;
}
export interface EventQuery { category?: string; city?: string }

export const entApi = {
  categories: () => api.get<Category[]>('/entertainment/categories').then((r) => r.data),
  events: (q: EventQuery) => api.get<EventCard[]>('/entertainment/events', { params: q }).then((r) => r.data),
  event: (id: string) => api.get<EventDetail>(`/entertainment/events/${id}`).then((r) => r.data),
  book: (eventId: string, input: { tier: string; qty: number; method: 'wallet' | 'card' }) =>
    api.post<Ticket[]>(`/entertainment/events/${eventId}/book`, input).then((r) => r.data),
  tickets: () => api.get<Ticket[]>('/entertainment/tickets').then((r) => r.data),
};

export function useCategories() {
  return useQuery({ queryKey: ['ent', 'categories'], queryFn: () => entApi.categories() });
}
export function useEvents(q: EventQuery) {
  return useQuery({ queryKey: ['ent', 'events', q], queryFn: () => entApi.events(q) });
}
export function useEvent(id: string) {
  return useQuery({ queryKey: ['ent', 'event', id], queryFn: () => entApi.event(id), enabled: !!id });
}
export function useMyTickets() {
  return useQuery({ queryKey: ['ent', 'tickets'], queryFn: () => entApi.tickets() });
}
export function useBookTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { eventId: string; tier: string; qty: number; method: 'wallet' | 'card' }) => entApi.book(v.eventId, { tier: v.tier, qty: v.qty, method: v.method }),
    onSuccess: (tickets) => { qc.setQueryData(['ent', 'tickets'], tickets); void qc.invalidateQueries({ queryKey: ['financial'] }); },
  });
}

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
export const eventDate = (d: string) => { const [y, m, day] = d.split('-'); const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${day} ${months[Number(m) - 1]} ${y}`; };
