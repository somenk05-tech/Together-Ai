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
interface TmdbList { results: TmdbItem[] }
interface TmdbProviders { results?: Record<string, { flatrate?: { provider_name: string }[]; rent?: { provider_name: string }[]; buy?: { provider_name: string }[] }> }
interface TmdbDetail extends TmdbItem {
  runtime?: number; tagline?: string; status?: string;
  genres?: { id: number; name: string }[];
  credits?: { cast?: { name: string; character: string; profile_path: string | null }[]; crew?: { name: string; job: string }[] };
  'watch/providers'?: TmdbProviders;
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

  /** Full detail for one movie — overview, cast, runtime and where to watch in India. */
  async movieDetail(id: string) {
    if (!this.enabled) throw new ServiceUnavailableException('movie data is not configured');
    if (!/^\d+$/.test(id)) throw new NotFoundException('movie not found');
    try {
      const d = await this.get<TmdbDetail>(`/movie/${id}`, { append_to_response: 'credits,watch/providers' });
      const inProviders = d['watch/providers']?.results?.[REGION];
      const dedupe = (xs: { provider_name: string }[] | undefined) => [...new Set((xs ?? []).map((p) => p.provider_name))];
      return {
        ...this.shape(d),
        genres: (d.genres ?? []).map((g) => g.name).slice(0, 4),
        runtime: d.runtime ?? null,
        tagline: d.tagline || null,
        status: d.status ?? null,
        cast: (d.credits?.cast ?? []).slice(0, 6).map((c) => ({ name: c.name, character: c.character, photoUrl: c.profile_path ? `${IMG}/w185${c.profile_path}` : null })),
        directors: (d.credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 2),
        watch: { stream: dedupe(inProviders?.flatrate).slice(0, 4), rent: dedupe(inProviders?.rent).slice(0, 3), buy: dedupe(inProviders?.buy).slice(0, 3) },
        attribution: 'Movie data & images: TMDB',
      };
    } catch (e) {
      if (e instanceof NotFoundException) throw e;
      this.log.warn(`movieDetail(${id}) failed: ${(e as Error).message}`);
      throw new NotFoundException('movie not found');
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
}
