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

/** Live movie & OTT data (TMDB proxy — backend holds the key). */
export interface LiveMovie {
  id: number; title: string; rating: number | null; votes: number;
  posterUrl: string | null; backdropUrl: string | null;
  releaseDate: string | null; language: string; genres: string[]; overview: string;
}
export interface MoviesLive { live: boolean; nowPlaying: LiveMovie[]; thisWeek: LiveMovie[]; comingUp: LiveMovie[] }
export interface OttTitle extends LiveMovie { type: 'tv' | 'movie'; platform: string | null }
export interface OttLive { live: boolean; streaming: OttTitle[]; popular: OttTitle[] }
export interface CastMember { id: number; name: string; character: string; photoUrl: string | null }
export interface TitleRef extends LiveMovie { type: 'movie' | 'tv' }
export interface TitleFull extends LiveMovie {
  type: 'movie' | 'tv';
  runtime: number | null; tagline: string | null; status: string | null;
  certification: string | null; trailerKey: string | null;
  cast: CastMember[]; directors: string[]; creators: string[];
  watch: { stream: string[]; rent: string[]; buy: string[] };
  recommendations: TitleRef[];
  seasons: { number: number; name: string; episodes: number; airDate: string | null }[];
  nextEpisode: { name: string; airDate: string; season: number; episode: number } | null;
  attribution: string;
}
export interface SearchLive { live: boolean; results: TitleRef[] }
export interface DiscoverLive { live: boolean; results: TitleRef[] }
export interface CuratedLive { live: boolean; topRated: TitleRef[]; hiddenGems: TitleRef[]; indianIndie: TitleRef[] }
export interface PersonFull {
  id: number; name: string; photoUrl: string | null; department: string | null;
  birthday: string | null; deathday: string | null; placeOfBirth: string | null;
  biography: string | null; knownFor: TitleRef[]; attribution: string;
}

export const entApi = {
  categories: () => api.get<Category[]>('/entertainment/categories').then((r) => r.data),
  events: (q: EventQuery) => api.get<EventCard[]>('/entertainment/events', { params: q }).then((r) => r.data),
  event: (id: string) => api.get<EventDetail>(`/entertainment/events/${id}`).then((r) => r.data),
  book: (eventId: string, input: { tier: string; qty: number; method: 'wallet' | 'card' }) =>
    api.post<Ticket[]>(`/entertainment/events/${eventId}/book`, input).then((r) => r.data),
  tickets: () => api.get<Ticket[]>('/entertainment/tickets').then((r) => r.data),
  movies: () => api.get<MoviesLive>('/entertainment/movies').then((r) => r.data),
  title: (type: 'movie' | 'tv', id: number) => api.get<TitleFull>(`/entertainment/${type === 'tv' ? 'tv' : 'movies'}/${id}`).then((r) => r.data),
  ott: () => api.get<OttLive>('/entertainment/ott').then((r) => r.data),
  search: (q: string) => api.get<SearchLive>('/entertainment/search', { params: { q } }).then((r) => r.data),
  discover: (genre?: string, lang?: string, sort?: string) => api.get<DiscoverLive>('/entertainment/discover', { params: { genre, lang, sort } }).then((r) => r.data),
  curatedMovies: () => api.get<CuratedLive>('/entertainment/curated-movies').then((r) => r.data),
  person: (id: number) => api.get<PersonFull>(`/entertainment/person/${id}`).then((r) => r.data),
};

export function useLiveMovies() {
  return useQuery({ queryKey: ['ent', 'movies'], queryFn: () => entApi.movies(), retry: false, staleTime: 10 * 60_000 });
}
export function useLiveTitle(sel: { type: 'movie' | 'tv'; id: number } | null) {
  return useQuery({ queryKey: ['ent', 'title', sel?.type, sel?.id], queryFn: () => entApi.title(sel!.type, sel!.id), enabled: sel != null, retry: false, staleTime: 30 * 60_000 });
}
export function useLiveOtt() {
  return useQuery({ queryKey: ['ent', 'ott'], queryFn: () => entApi.ott(), retry: false, staleTime: 10 * 60_000 });
}
export function useTitleSearch(q: string) {
  return useQuery({ queryKey: ['ent', 'search', q], queryFn: () => entApi.search(q), enabled: q.trim().length >= 2, retry: false, staleTime: 5 * 60_000 });
}
export function useDiscover(genre?: string, lang?: string, sort?: string, enabled = true) {
  return useQuery({ queryKey: ['ent', 'discover', genre ?? '', lang ?? '', sort ?? ''], queryFn: () => entApi.discover(genre, lang, sort), enabled, retry: false, staleTime: 10 * 60_000 });
}
export function useCuratedMovies() {
  return useQuery({ queryKey: ['ent', 'curated'], queryFn: () => entApi.curatedMovies(), retry: false, staleTime: 30 * 60_000 });
}
export function usePerson(id: number | null) {
  return useQuery({ queryKey: ['ent', 'person', id], queryFn: () => entApi.person(id as number), enabled: id != null, retry: false, staleTime: 30 * 60_000 });
}

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
