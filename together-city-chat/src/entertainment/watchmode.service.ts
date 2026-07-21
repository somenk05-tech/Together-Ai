import { Injectable, Logger } from '@nestjs/common';

/**
 * Watchmode aggregation — "Watch at Together City". For any movie or series
 * (referenced by its TMDB id), returns every Indian streaming source with a
 * DEEP LINK straight into the platform, so users launch the right app from
 * one interface instead of hunting through each OTT app.
 *
 * Key: WATCHMODE_API_KEY (Railway env). Responses are cached 24 h per title —
 * Watchmode's free tier is 1,000 requests/month, so cache hard and fetch only
 * on demand (when a title sheet opens). Fully optional: when the key is absent
 * the endpoint reports live:false and the UI falls back to TMDB provider names.
 */

const BASE = 'https://api.watchmode.com/v1';
const TTL_MS = 24 * 60 * 60 * 1000;
const REGION = 'IN';

interface WmSource {
  source_id: number; name: string; type: 'sub' | 'free' | 'rent' | 'buy' | 'tve';
  region: string; web_url: string | null; price: number | null; format: string | null;
}

const KIND_LABEL: Record<string, string> = {
  sub: 'Subscription', free: 'Free', rent: 'Rent', buy: 'Buy', tve: 'Via TV provider',
};
const FORMAT_RANK: Record<string, number> = { '4K': 3, HD: 2, SD: 1 };

export interface StreamSource {
  name: string; kind: string; kindLabel: string;
  price: number | null; format: string | null; url: string;
}

@Injectable()
export class WatchmodeService {
  private readonly log = new Logger(WatchmodeService.name);
  private readonly key = (process.env.WATCHMODE_API_KEY ?? '').trim();
  private readonly cache = new Map<string, { at: number; data: unknown }>();

  get enabled(): boolean { return this.key.length > 0; }

  /** Every Indian streaming source for one title, deep links included. */
  async sources(type: 'movie' | 'tv', tmdbId: string) {
    if (!this.enabled) return { live: false as const, sources: [] as StreamSource[] };
    if (!/^\d+$/.test(tmdbId)) return { live: false as const, sources: [] as StreamSource[] };
    const cacheKey = `${type}-${tmdbId}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data as { live: true; sources: StreamSource[] };

    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 8000);
      // Watchmode accepts TMDB ids directly with a movie-/tv- prefix.
      const url = `${BASE}/title/${type}-${tmdbId}/sources/?apiKey=${this.key}&regions=${REGION}`;
      const res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } }).finally(() => clearTimeout(timer));
      if (!res.ok) throw new Error(`Watchmode ${res.status}`);
      const rows = (await res.json()) as WmSource[];

      // Keep the best entry per platform+kind (highest format), sorted:
      // free first, then subscriptions, then rent (cheap first), then buy.
      const best = new Map<string, WmSource>();
      for (const r of rows) {
        if (r.region !== REGION || !r.web_url) continue;
        const k = `${r.name}|${r.type}`;
        const prev = best.get(k);
        if (!prev || (FORMAT_RANK[r.format ?? ''] ?? 0) > (FORMAT_RANK[prev.format ?? ''] ?? 0)) best.set(k, r);
      }
      const KIND_ORDER: Record<string, number> = { free: 0, sub: 1, tve: 2, rent: 3, buy: 4 };
      const sources: StreamSource[] = [...best.values()]
        .sort((a, b) => (KIND_ORDER[a.type] - KIND_ORDER[b.type]) || ((a.price ?? 0) - (b.price ?? 0)))
        .slice(0, 14)
        .map((r) => ({
          name: r.name, kind: r.type, kindLabel: KIND_LABEL[r.type] ?? r.type,
          price: r.price, format: r.format, url: r.web_url as string,
        }));

      const data = { live: true as const, sources };
      this.cache.set(cacheKey, { at: Date.now(), data });
      return data;
    } catch (e) {
      this.log.warn(`sources(${cacheKey}) fell back: ${(e as Error).message}`);
      return { live: false as const, sources: [] as StreamSource[] };
    }
  }
}
