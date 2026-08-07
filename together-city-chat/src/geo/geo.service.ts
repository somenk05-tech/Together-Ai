import { Injectable, Logger } from '@nestjs/common';

/**
 * ADDRESSES, THROUGH US RATHER THAN FROM THE CITIZEN'S BROWSER.
 *
 * The listing form used to ask for a latitude and a longitude as two decimal
 * numbers. Nobody knows their latitude. It is now a map with a search box, and
 * this is what answers the search box.
 *
 * ── WHY THIS IS A PROXY AND NOT A FETCH FROM THE PAGE ──
 *
 * Three reasons, and the third is the one that decided it.
 *
 * 1. NOMINATIM'S USAGE POLICY. It is a free service run on donated hardware,
 *    it allows roughly one request per second per application, and it asks for
 *    an identifying User-Agent. A browser cannot honour any of that: a hundred
 *    citizens typing is a hundred uncoordinated clients, and a browser cannot
 *    set a User-Agent at all. Here there is one queue, one identity, and a
 *    cache in front of both.
 *
 * 2. CACHING. Addresses do not move. The same shop searched by twenty people
 *    is one upstream request, and the answer is good for a day.
 *
 * 3. THE CITIZEN'S IP NEVER REACHES OSM. A geocode from the page would send
 *    "what this person is looking for" and "where they are connecting from" to
 *    a third party, together. This hub is built on a promise that a citizen can
 *    approach a business without being identifiable; sending their address
 *    search somewhere else with their IP attached is not obviously inside that
 *    promise, and routing it through the API costs nothing and removes the
 *    question.
 */

export interface Place {
  label: string;          // the full formatted address
  short: string;          // the leading part, for a list
  lat: number;
  lng: number;
  /** OSM's own class/type, kept because "this is a road" and "this is a shop"
   *  are worth telling apart when a search returns both. */
  kind: string | null;
}

/** The identity Nominatim's policy asks every application to send. */
const UA = 'TogetherCity/1.0 (https://togethercity.app; local services directory)';
const BASE = 'https://nominatim.openstreetmap.org';

@Injectable()
export class GeoService {
  private readonly log = new Logger(GeoService.name);

  /** Addresses do not move. A day is a conservative TTL for a street. */
  private readonly TTL = 24 * 60 * 60 * 1000;
  private readonly cache = new Map<string, { at: number; v: Place[] }>();

  /**
   * ONE REQUEST AT A TIME, AT MOST ONE PER SECOND.
   *
   * A promise chain rather than a token bucket: every call joins the tail, so
   * the spacing holds under a burst instead of only under a steady trickle,
   * which is the case that actually gets an application blocked.
   */
  private queue: Promise<void> = Promise.resolve();
  private async spaced<T>(run: () => Promise<T>): Promise<T> {
    const mine = this.queue.then(() => new Promise<void>((r) => setTimeout(r, 1_100)));
    this.queue = mine;
    await mine;
    return run();
  }

  private async fetchJson(url: string, timeoutMs = 5000): Promise<unknown | null> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, {
        signal: ctl.signal,
        // The citizen's own headers are NOT forwarded. This request is from
        // Together City, on their behalf, and says so.
        headers: { 'User-Agent': UA, 'Accept-Language': 'en' },
      });
      clearTimeout(t);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      this.log.warn(`geo fetch failed: ${(e as Error).message}`);
      return null;
    }
  }

  private cached(key: string): Place[] | null {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.TTL) return hit.v;
    return null;
  }

  private put(key: string, v: Place[]): Place[] {
    // Bounded, so a long-running instance cannot grow this without limit. The
    // oldest key goes; at a day's TTL the loss is one upstream request.
    if (this.cache.size > 2000) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, { at: Date.now(), v });
    return v;
  }

  private toPlace(r: {
    display_name?: string; name?: string; lat?: string; lon?: string;
    class?: string; type?: string;
  }): Place | null {
    const lat = Number(r.lat), lng = Number(r.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const label = (r.display_name ?? '').trim();
    if (!label) return null;
    return {
      label,
      short: (r.name ?? label.split(',')[0] ?? label).trim(),
      lat, lng,
      kind: r.type ?? r.class ?? null,
    };
  }

  /**
   * Search an address.
   *
   * `countrycodes=in` is NOT set. It would be a better search for almost every
   * citizen and wrong for the ones it is wrong for, silently — a business in
   * Dubai or Singapore would simply never be found and nothing would say why.
   * The bias is `viewbox` when the caller has a position, which prefers nearby
   * results without excluding anything.
   */
  async search(q: string, near?: { lat: number; lng: number }): Promise<Place[]> {
    const term = q.trim();
    if (term.length < 3) return [];
    const key = `s:${term.toLowerCase()}:${near ? `${near.lat.toFixed(1)},${near.lng.toFixed(1)}` : ''}`;
    const hit = this.cached(key);
    if (hit) return hit;

    const params = new URLSearchParams({
      q: term, format: 'jsonv2', limit: '6', addressdetails: '0',
    });
    if (near) {
      // A degree is ~111 km; ±1.5° is a generous "around here" that still
      // ranks a local result above a namesake on another continent.
      params.set('viewbox', [near.lng - 1.5, near.lat + 1.5, near.lng + 1.5, near.lat - 1.5].join(','));
      params.set('bounded', '0');
    }
    const j = await this.spaced(() => this.fetchJson(`${BASE}/search?${params.toString()}`));
    if (!Array.isArray(j)) return [];
    return this.put(key, (j as Parameters<GeoService['toPlace']>[0][])
      .map((r) => this.toPlace(r))
      .filter((p): p is Place => p !== null));
  }

  /**
   * Coordinates → an address, for the pin somebody has just dragged.
   *
   * Rounded to five decimals in the cache key — about a metre. Finer than that
   * is a different cache entry for the same doorway.
   */
  async reverse(lat: number, lng: number): Promise<Place | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    const key = `r:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const hit = this.cached(key);
    if (hit) return hit[0] ?? null;

    const params = new URLSearchParams({
      lat: String(lat), lon: String(lng), format: 'jsonv2', zoom: '18', addressdetails: '0',
    });
    const j = await this.spaced(() => this.fetchJson(`${BASE}/reverse?${params.toString()}`));
    const p = j && typeof j === 'object' ? this.toPlace(j as Parameters<GeoService['toPlace']>[0]) : null;
    this.put(key, p ? [p] : []);
    return p;
  }
}
