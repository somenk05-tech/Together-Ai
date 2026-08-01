import { swallowed } from '../shared/swallow';
import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';

/**
 * TMDB (The Movie Database) proxy — powers Movies Now + OTT Watch with live
 * data. The API key stays server-side (TMDB_API_KEY on Railway; both v3 keys
 * and v4 read-access tokens work). Responses are cached in memory for 30 min
 * so a whole city of browsing stays comfortably inside TMDB's rate limits.
 * When no key is configured every endpoint returns { live: false } and the
 * frontend keeps its curated fallback cards.
 */

const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const TTL_MS = 30 * 60 * 1000;
const REGION = 'IN';

/** Stable TMDB genre id → name map (movie + TV) — saves a config round-trip. */
const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary',
  18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
  9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller',
  10752: 'War', 37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
};

const LANGS: Record<string, string> = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', kn: 'Kannada',
  bn: 'Bengali', mr: 'Marathi', pa: 'Punjabi', gu: 'Gujarati', ja: 'Japanese', ko: 'Korean',
  fr: 'French', es: 'Spanish', de: 'German', it: 'Italian', zh: 'Chinese',
};

interface TmdbItem {
  id: number; title?: string; name?: string; overview: string;
  poster_path: string | null; backdrop_path: string | null;
  vote_average: number; vote_count: number;
  release_date?: string; first_air_date?: string;
  original_language: string; genre_ids?: number[]; media_type?: string;
}
interface TmdbList { results: TmdbItem[]; total_pages?: number; total_results?: number }
interface TmdbProviders { results?: Record<string, { flatrate?: { provider_name: string }[]; rent?: { provider_name: string }[]; buy?: { provider_name: string }[] }> }
interface TmdbVideo { key: string; site: string; type: string; official: boolean; name: string }
interface TmdbDetail extends TmdbItem {
  runtime?: number; tagline?: string; status?: string;
  genres?: { id: number; name: string }[];
  credits?: { cast?: { id: number; name: string; character: string; profile_path: string | null }[]; crew?: { name: string; job: string }[] };
  'watch/providers'?: TmdbProviders;
  videos?: { results?: TmdbVideo[] };
  recommendations?: TmdbList;
  release_dates?: { results?: { iso_3166_1: string; release_dates: { certification: string }[] }[] };
  content_ratings?: { results?: { iso_3166_1: string; rating: string }[] };
  // TV-only
  number_of_seasons?: number; number_of_episodes?: number;
  seasons?: { season_number: number; name: string; episode_count: number; air_date: string | null; poster_path: string | null }[];
  next_episode_to_air?: { name: string; air_date: string; season_number: number; episode_number: number } | null;
  created_by?: { name: string }[];
  episode_run_time?: number[];
}
interface TmdbPerson {
  id: number; name: string; biography?: string; birthday?: string | null; deathday?: string | null;
  place_of_birth?: string | null; known_for_department?: string; profile_path: string | null;
  combined_credits?: { cast?: (TmdbItem & { popularity: number; character?: string })[] };
}

export interface MovieCard {
  id: number; title: string; rating: number | null; votes: number;
  posterUrl: string | null; backdropUrl: string | null;
  releaseDate: string | null; language: string; genres: string[]; overview: string;
}

@Injectable()
export class TmdbService {
  private readonly log = new Logger(TmdbService.name);
  private readonly key = (process.env.TMDB_API_KEY ?? '').trim();
  private readonly cache = new Map<string, { at: number; data: unknown }>();

  get enabled(): boolean { return this.key.length > 0; }

  /** GET a TMDB path with auth (v4 bearer token or v3 api_key) + 30-min cache. */
  private async get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    const bearer = this.key.startsWith('eyJ'); // v4 read-access tokens are JWTs
    const qs = new URLSearchParams({ language: 'en-US', ...params, ...(bearer ? {} : { api_key: this.key }) });
    const url = `${BASE}${path}?${qs.toString()}`;
    const cacheKey = bearer ? url : url.replace(this.key, '');
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: bearer ? { Authorization: `Bearer ${this.key}`, accept: 'application/json' } : { accept: 'application/json' } });
      if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
      const data = (await res.json()) as T;
      this.cache.set(cacheKey, { at: Date.now(), data });
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  private shape(m: TmdbItem): MovieCard {
    return {
      id: m.id,
      title: m.title ?? m.name ?? 'Untitled',
      rating: m.vote_count > 0 ? Math.round(m.vote_average * 10) / 10 : null,
      votes: m.vote_count,
      posterUrl: m.poster_path ? `${IMG}/w342${m.poster_path}` : null,
      backdropUrl: m.backdrop_path ? `${IMG}/w780${m.backdrop_path}` : null,
      releaseDate: m.release_date ?? m.first_air_date ?? null,
      language: LANGS[m.original_language] ?? m.original_language.toUpperCase(),
      genres: (m.genre_ids ?? []).map((g) => GENRES[g]).filter(Boolean).slice(0, 3),
      overview: m.overview,
    };
  }

  /** Movies Now — in theatres (IN), this week's releases and coming up. */
  async movies() {
    if (!this.enabled) return { live: false as const, nowPlaying: [], thisWeek: [], comingUp: [] };
    try {
      const [now, upcoming] = await Promise.all([
        this.get<TmdbList>('/movie/now_playing', { region: REGION, page: '1' }),
        this.get<TmdbList>('/movie/upcoming', { region: REGION, page: '1' }),
      ]);
      // A catalogue query about what is in cinemas globally, not about any one
      // citizen's day — UTC is the right frame here and needs no zone.
      const today = new Date().toISOString().slice(0, 10);
      const twoWeeksAgo = new Date(Date.now() - 14 * 86400_000).toISOString().slice(0, 10);
      const nowPlaying = now.results.filter((m) => m.poster_path).map((m) => this.shape(m));
      const thisWeek = nowPlaying.filter((m) => m.releaseDate && m.releaseDate >= twoWeeksAgo && m.releaseDate <= today).slice(0, 8);
      const comingUp = upcoming.results
        .filter((m) => m.poster_path && (m.release_date ?? '') > today)
        .sort((a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? ''))
        .map((m) => this.shape(m)).slice(0, 8);
      return { live: true as const, nowPlaying: nowPlaying.slice(0, 12), thisWeek, comingUp };
    } catch (e) {
      this.log.warn(`movies() fell back: ${(e as Error).message}`);
      return { live: false as const, nowPlaying: [], thisWeek: [], comingUp: [] };
    }
  }

  /** Best official YouTube trailer/teaser key. */
  private trailerOf(d: TmdbDetail): string | null {
    const vids = (d.videos?.results ?? []).filter((v) => v.site === 'YouTube');
    const pick = vids.find((v) => v.type === 'Trailer' && v.official) ?? vids.find((v) => v.type === 'Trailer') ?? vids.find((v) => v.type === 'Teaser');
    return pick?.key ?? null;
  }

  private dedupeNames(xs: { provider_name: string }[] | undefined): string[] {
    return [...new Set((xs ?? []).map((p) => p.provider_name))];
  }

  private shapeCast(d: TmdbDetail) {
    return (d.credits?.cast ?? []).slice(0, 10).map((c) => ({ id: c.id, name: c.name, character: c.character, photoUrl: c.profile_path ? `${IMG}/w185${c.profile_path}` : null }));
  }

  private shapeRecs(d: TmdbDetail, type: 'movie' | 'tv') {
    return (d.recommendations?.results ?? []).filter((r) => r.poster_path).slice(0, 8).map((r) => ({ ...this.shape(r), type }));
  }

  /** Full detail for one movie — cast, trailer, certification, recommendations, where to watch. */
  async movieDetail(id: string) {
    if (!this.enabled) throw new ServiceUnavailableException('movie data is not configured');
    if (!/^\d+$/.test(id)) throw new NotFoundException('movie not found');
    try {
      const d = await this.get<TmdbDetail>(`/movie/${id}`, { append_to_response: 'credits,watch/providers,videos,recommendations,release_dates' });
      const inProviders = d['watch/providers']?.results?.[REGION];
      const certRow = d.release_dates?.results?.find((r) => r.iso_3166_1 === REGION) ?? d.release_dates?.results?.find((r) => r.iso_3166_1 === 'US');
      const certification = certRow?.release_dates.map((x) => x.certification).find((c) => c) ?? null;
      return {
        ...this.shape(d),
        type: 'movie' as const,
        genres: (d.genres ?? []).map((g) => g.name).slice(0, 4),
        runtime: d.runtime ?? null,
        tagline: d.tagline || null,
        status: d.status ?? null,
        certification,
        trailerKey: this.trailerOf(d),
        cast: this.shapeCast(d),
        directors: (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 2),
        watch: { stream: this.dedupeNames(inProviders?.flatrate).slice(0, 4), rent: this.dedupeNames(inProviders?.rent).slice(0, 3), buy: this.dedupeNames(inProviders?.buy).slice(0, 3) },
        recommendations: this.shapeRecs(d, 'movie'),
        seasons: [], nextEpisode: null, creators: [],
        attribution: 'Movie data & images: TMDB',
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      this.log.warn(`movieDetail(${id}) failed: ${(e as Error).message}`);
      throw new NotFoundException('movie not found');
    }
  }

  /** Full detail for one TV series — seasons, next episode, trailer, recommendations. */
  async tvDetail(id: string) {
    if (!this.enabled) throw new ServiceUnavailableException('tv data is not configured');
    if (!/^\d+$/.test(id)) throw new NotFoundException('series not found');
    try {
      const d = await this.get<TmdbDetail>(`/tv/${id}`, { append_to_response: 'credits,watch/providers,videos,recommendations,content_ratings' });
      const inProviders = d['watch/providers']?.results?.[REGION];
      const rating = d.content_ratings?.results?.find((r) => r.iso_3166_1 === REGION)?.rating ?? d.content_ratings?.results?.find((r) => r.iso_3166_1 === 'US')?.rating ?? null;
      return {
        ...this.shape(d),
        type: 'tv' as const,
        genres: (d.genres ?? []).map((g) => g.name).slice(0, 4),
        runtime: d.episode_run_time?.[0] ?? null,
        tagline: d.tagline || null,
        status: d.status ?? null,
        certification: rating,
        trailerKey: this.trailerOf(d),
        cast: this.shapeCast(d),
        directors: (d.created_by ?? []).map((c) => c.name).slice(0, 2),
        watch: { stream: this.dedupeNames(inProviders?.flatrate).slice(0, 4), rent: this.dedupeNames(inProviders?.rent).slice(0, 3), buy: this.dedupeNames(inProviders?.buy).slice(0, 3) },
        recommendations: this.shapeRecs(d, 'tv'),
        seasons: (d.seasons ?? []).filter((s) => s.season_number > 0).map((s) => ({ number: s.season_number, name: s.name, episodes: s.episode_count, airDate: s.air_date })),
        nextEpisode: d.next_episode_to_air
          ? { name: d.next_episode_to_air.name, airDate: d.next_episode_to_air.air_date, season: d.next_episode_to_air.season_number, episode: d.next_episode_to_air.episode_number }
          : null,
        creators: (d.created_by ?? []).map((c) => c.name),
        attribution: 'Series data & images: TMDB',
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      this.log.warn(`tvDetail(${id}) failed: ${(e as Error).message}`);
      throw new NotFoundException('series not found');
    }
  }

  /** Search movies, series and people in one query. */
  async search(q: string) {
    if (!this.enabled || !q.trim()) return { live: this.enabled, results: [] };
    try {
      const d = await this.get<TmdbList>('/search/multi', { query: q.trim().slice(0, 80), include_adult: 'false', page: '1' });
      const results = (d.results ?? [])
        .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
        .slice(0, 12)
        .map((r) => ({ ...this.shape(r), type: r.media_type as 'movie' | 'tv' }));
      return { live: true, results };
    } catch (e) {
      this.log.warn(`search failed: ${(e as Error).message}`);
      return { live: false, results: [] };
    }
  }

  /** Discover movies OR series with working filters — genre, language, sort. */
  async discover(genre?: string, lang?: string, sort?: string, type: 'movie' | 'tv' = 'movie') {
    if (!this.enabled) return { live: false as const, results: [] };
    try {
      const genreId = Object.entries(GENRES).find(([, name]) => name.toLowerCase() === (genre ?? '').toLowerCase())?.[0];
      const langCode = Object.entries(LANGS).find(([, name]) => name.toLowerCase() === (lang ?? '').toLowerCase())?.[0];
      const params: Record<string, string> = {
        include_adult: 'false', 'vote_count.gte': '25',
        sort_by: sort === 'rating' ? 'vote_average.desc' : 'popularity.desc',
      };
      if (type === 'movie') params.region = REGION;
      if (genreId) params.with_genres = genreId;
      if (langCode) params.with_original_language = langCode;
      const d = await this.get<TmdbList>(type === 'tv' ? '/discover/tv' : '/discover/movie', params);
      return { live: true as const, results: d.results.filter((m) => m.poster_path).slice(0, 16).map((m) => ({ ...this.shape(m), type })) };
    } catch (e) {
      this.log.warn(`discover failed: ${(e as Error).message}`);
      return { live: false as const, results: [] };
    }
  }

  /** Curated Movies — critics' picks, hidden gems and Indian indie cinema. */
  async curated() {
    if (!this.enabled) return { live: false as const, topRated: [], hiddenGems: [], indianIndie: [] };
    try {
      const [top, gems, indie] = await Promise.all([
        this.get<TmdbList>('/movie/top_rated', { region: REGION, page: '1' }),
        this.get<TmdbList>('/discover/movie', { include_adult: 'false', sort_by: 'vote_average.desc', 'vote_count.gte': '80', 'vote_count.lte': '1200', 'vote_average.gte': '7.4', 'primary_release_date.gte': '2015-01-01' }),
        this.get<TmdbList>('/discover/movie', { include_adult: 'false', sort_by: 'vote_average.desc', with_original_language: 'hi|ta|te|ml|kn|bn|mr', 'vote_count.gte': '40', 'vote_average.gte': '7.0' }),
      ]);
      const shape = (l: TmdbList, n: number) => l.results.filter((m) => m.poster_path).slice(0, n).map((m) => ({ ...this.shape(m), type: 'movie' as const }));
      return { live: true as const, topRated: shape(top, 8), hiddenGems: shape(gems, 8), indianIndie: shape(indie, 8) };
    } catch (e) {
      this.log.warn(`curated() fell back: ${(e as Error).message}`);
      return { live: false as const, topRated: [], hiddenGems: [], indianIndie: [] };
    }
  }

  /** Person — bio and best-known titles. */
  async person(id: string) {
    if (!this.enabled) throw new ServiceUnavailableException('people data is not configured');
    if (!/^\d+$/.test(id)) throw new NotFoundException('person not found');
    try {
      const p = await this.get<TmdbPerson>(`/person/${id}`, { append_to_response: 'combined_credits' });
      const seen = new Set<number>();
      const knownFor = (p.combined_credits?.cast ?? [])
        .filter((c) => c.poster_path && (c.media_type === 'movie' || c.media_type === 'tv') && !seen.has(c.id) && seen.add(c.id))
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, 8)
        .map((c) => ({ ...this.shape(c), type: c.media_type as 'movie' | 'tv' }));
      return {
        id: p.id, name: p.name,
        photoUrl: p.profile_path ? `${IMG}/w342${p.profile_path}` : null,
        department: p.known_for_department ?? null,
        birthday: p.birthday ?? null, deathday: p.deathday ?? null,
        placeOfBirth: p.place_of_birth ?? null,
        biography: (p.biography ?? '').slice(0, 700) || null,
        knownFor,
        attribution: 'People data & images: TMDB',
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      this.log.warn(`person(${id}) failed: ${(e as Error).message}`);
      throw new NotFoundException('person not found');
    }
  }

  /** OTT Watch — trending series + films this week, with the platform streaming each in India. */
  async ott() {
    if (!this.enabled) return { live: false as const, streaming: [], popular: [] };
    try {
      const [tv, mv] = await Promise.all([
        this.get<TmdbList>('/trending/tv/week'),
        this.get<TmdbList>('/trending/movie/week'),
      ]);
      const shapeWithProvider = async (m: TmdbItem, type: 'tv' | 'movie') => {
        let platform: string | null = null;
        try {
          const p = await this.get<TmdbProviders>(`/${type}/${m.id}/watch/providers`);
          platform = p.results?.[REGION]?.flatrate?.[0]?.provider_name ?? null;
        } catch { /* provider lookup is best-effort */ }
        return { ...this.shape(m), type, platform };
      };
      const tvTop = tv.results.filter((x) => x.poster_path).slice(0, 8);
      const mvTop = mv.results.filter((x) => x.poster_path).slice(0, 6);
      const [streaming, popular] = await Promise.all([
        Promise.all(tvTop.map((x) => shapeWithProvider(x, 'tv'))),
        Promise.all(mvTop.map((x) => shapeWithProvider(x, 'movie'))),
      ]);
      // Titles with a known Indian streaming platform lead their list.
      const byPlatform = <T extends { platform: string | null }>(xs: T[]) =>
        [...xs.filter((x) => x.platform), ...xs.filter((x) => !x.platform)];
      return { live: true as const, streaming: byPlatform(streaming), popular: byPlatform(popular) };
    } catch (e) {
      this.log.warn(`ott() fell back: ${(e as Error).message}`);
      return { live: false as const, streaming: [], popular: [] };
    }
  }

  /**
   * Browse the ENTIRE catalogue page-wise — 100 titles per app page, stitched
   * from five TMDB pages (20 each). TMDB serves up to 500 pages per query
   * (10,000 titles), so an app exposes 100 pages of 100 before the well runs
   * dry. Optional genre/language filters narrow the walk.
   */
  async browse(type: 'movie' | 'tv', page: number, genre?: string, lang?: string) {
    if (!this.enabled) return { live: false as const, page: 1, totalPages: 0, totalResults: 0, results: [] };
    const PER = 5; // TMDB pages stitched per app page (5 × 20 = 100 titles)
    const appPage = Math.max(1, Math.min(100, Math.floor(page) || 1));
    const first = (appPage - 1) * PER + 1;
    try {
      const genreId = Object.entries(GENRES).find(([, name]) => name.toLowerCase() === (genre ?? '').toLowerCase())?.[0];
      const langCode = Object.entries(LANGS).find(([, name]) => name.toLowerCase() === (lang ?? '').toLowerCase())?.[0];
      const params: Record<string, string> = { include_adult: 'false', sort_by: 'popularity.desc', 'vote_count.gte': '10' };
      if (genreId) params.with_genres = genreId;
      if (langCode) params.with_original_language = langCode;
      const path = type === 'tv' ? '/discover/tv' : '/discover/movie';

      const firstList = await this.get<TmdbList>(path, { ...params, page: String(first) });
      const tmdbTotal = Math.min(firstList.total_pages ?? 1, 500);
      const totalPages = Math.max(1, Math.ceil(tmdbTotal / PER));
      const restPages: number[] = [];
      for (let p = first + 1; p <= Math.min(first + PER - 1, tmdbTotal); p++) restPages.push(p);
      const rest = await Promise.all(restPages.map((p) => this.get<TmdbList>(path, { ...params, page: String(p) }).catch(() => ({ results: [] as TmdbItem[] }))));

      const seen = new Set<number>();
      const results = [firstList, ...rest]
        .flatMap((l) => l.results)
        .filter((m) => m.poster_path && !seen.has(m.id) && seen.add(m.id))
        .map((m) => ({ ...this.shape(m), type }));
      return {
        live: true as const,
        page: appPage,
        totalPages,
        totalResults: Math.min(firstList.total_results ?? results.length, tmdbTotal * 20),
        results,
      };
    } catch (e) {
      this.log.warn(`browse(${type} p${page}) fell back: ${(e as Error).message}`);
      return { live: false as const, page: appPage, totalPages: 0, totalResults: 0, results: [] };
    }
  }

  /**
   * Personalised picks learned from the Watchlist: TMDB's own recommendations
   * for the most recently saved titles, blended with discover queries built
   * from the collection's dominant genres and languages. Saved titles are
   * excluded, so the row always suggests something new.
   */
  async recommendedFor(saved: { id: number; type: 'movie' | 'tv'; language?: string; genres?: string[] }[]) {
    if (!this.enabled) return { live: false as const, results: [], basis: null };
    if (!saved.length) return { live: true as const, results: [], basis: null };
    try {
      const top = (xs: string[]) => {
        const n = new Map<string, number>();
        xs.forEach((x) => x && n.set(x, (n.get(x) ?? 0) + 1));
        return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      };
      const topGenres = top(saved.flatMap((s) => s.genres ?? []));
      const topLangs = top(saved.map((s) => s.language ?? ''));
      const seeds = saved.slice(0, 4);

      const [recLists, byGenreMovie, byGenreTv] = await Promise.all([
        Promise.all(seeds.map((s) =>
          this.get<TmdbList>(`/${s.type === 'tv' ? 'tv' : 'movie'}/${s.id}/recommendations`)
            .then((r) => r.results.map((m) => ({ ...this.shape(m), type: s.type })))
            .catch(swallowed('entertainment.recommendedFor', [] as (MovieCard & { type: 'movie' | 'tv' })[])),
        )),
        topGenres[0] ? this.discover(topGenres[0], topLangs[0], undefined, 'movie').then((r) => r.results).catch(swallowed('entertainment.recommendedFor', [])) : Promise.resolve([]),
        topGenres[0] ? this.discover(topGenres[0], undefined, undefined, 'tv').then((r) => r.results).catch(swallowed('entertainment.recommendedFor', [])) : Promise.resolve([]),
      ]);

      const savedKeys = new Set(saved.map((s) => `${s.type}${s.id}`));
      const seen = new Set<string>();
      const merged = [...recLists.flat(), ...byGenreMovie, ...byGenreTv].filter((m) => {
        const key = `${m.type}${m.id}`;
        if (savedKeys.has(key) || seen.has(key) || !m.posterUrl) return false;
        seen.add(key);
        return true;
      });
      // Favour titles matching the user's dominant genres, then rating.
      const genreSet = new Set(topGenres.slice(0, 3));
      const score = (m: MovieCard) => (m.genres.some((g) => genreSet.has(g)) ? 2 : 0) + (m.rating ?? 0) / 10;
      merged.sort((a, b) => score(b) - score(a));
      return {
        live: true as const,
        results: merged.slice(0, 12),
        basis: { genres: topGenres.slice(0, 3), languages: topLangs.filter(Boolean).slice(0, 2), fromTitles: seeds.length },
      };
    } catch (e) {
      this.log.warn(`recommendedFor fell back: ${(e as Error).message}`);
      return { live: false as const, results: [], basis: null };
    }
  }
}
