import { http as api } from '@/api/client';
import { useQuery } from '@tanstack/react-query';

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
  movies: () => api.get<MoviesLive>('/entertainment/movies').then((r) => r.data),
  title: (type: 'movie' | 'tv', id: number) => api.get<TitleFull>(`/entertainment/${type === 'tv' ? 'tv' : 'movies'}/${id}`).then((r) => r.data),
  ott: () => api.get<OttLive>('/entertainment/ott').then((r) => r.data),
  search: (q: string) => api.get<SearchLive>('/entertainment/search', { params: { q } }).then((r) => r.data),
  discover: (genre?: string, lang?: string, sort?: string, type?: 'movie' | 'tv') => api.get<DiscoverLive>('/entertainment/discover', { params: { genre, lang, sort, type } }).then((r) => r.data),
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
export function useDiscover(genre?: string, lang?: string, sort?: string, type: 'movie' | 'tv' = 'movie', enabled = true) {
  return useQuery({ queryKey: ['ent', 'discover', type, genre ?? '', lang ?? '', sort ?? ''], queryFn: () => entApi.discover(genre, lang, sort, type), enabled, retry: false, staleTime: 10 * 60_000 });
}
export function useCuratedMovies() {
  return useQuery({ queryKey: ['ent', 'curated'], queryFn: () => entApi.curatedMovies(), retry: false, staleTime: 30 * 60_000 });
}
export function usePerson(id: number | null) {
  return useQuery({ queryKey: ['ent', 'person', id], queryFn: () => entApi.person(id as number), enabled: id != null, retry: false, staleTime: 30 * 60_000 });
}
