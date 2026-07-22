/**
 * QuickCommerce API client — the LIVE adapter for quickcommerceapi.com.
 *
 *   GET https://api.quickcommerceapi.com/v1/search?q=&platform=&lat=&lon=
 *   GET https://api.quickcommerceapi.com/v1/eta?platform=&lat=&lon=
 *   Auth: X-API-Key header. 1 call = 1 credit.
 *
 * Enabled when QUICKCOMMERCE_API_KEY is set; otherwise the deterministic
 * simulator in quick-commerce.ts serves every quote (the API contract to the
 * frontend is identical either way). Live results are cached per item +
 * location for six hours so comparing a 40-item list costs ~40 credits per
 * day, not per page view. Parsing is deliberately tolerant: the upstream
 * response shape may evolve, and a parse miss falls back to the simulator
 * for that item rather than failing the request.
 */

import { Logger } from '@nestjs/common';

export interface LivePrice { platformKey: string; priceInr: number; mrpInr: number | null; packLabel: string | null; available: boolean; productName: string }
export interface LiveEta { platformKey: string; etaMinutes: number; storeOpen: boolean }

/** provider key (ours) ↔ platform name (theirs). Matching is fuzzy on purpose. */
const PLATFORM_MAP: Array<{ key: string; api: string; match: RegExp }> = [
  { key: 'blinkit', api: 'BlinkIt', match: /blink/i },
  { key: 'zepto', api: 'Zepto', match: /zepto/i },
  { key: 'instamart', api: 'SwiggyInstamart', match: /instamart|swiggy/i },
  { key: 'bigbasket', api: 'BigBasket', match: /bigbasket|bb\s*now/i },
  { key: 'jiomart', api: 'JioMart', match: /jiomart|jio/i },
];

const BASE = process.env.QUICKCOMMERCE_API_BASE || 'https://api.quickcommerceapi.com';

export class QuickCommerceClient {
  private readonly logger = new Logger('QuickCommerceAPI');
  private readonly key = process.env.QUICKCOMMERCE_API_KEY || '';
  readonly enabled = !!this.key;
  /** cacheKey → { at, data } — six-hour TTL, in-memory (single instance). */
  private cache = new Map<string, { at: number; data: unknown }>();
  private static TTL_MS = 6 * 3600_000;

  constructor() {
    this.logger.log(this.enabled
      ? 'QuickCommerce API live mode: real cross-store prices enabled.'
      : 'QUICKCOMMERCE_API_KEY not set — quick-commerce quotes use the built-in simulator.');
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T | null> {
    const qs = new URLSearchParams(params).toString();
    const cacheKey = `${path}?${qs}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < QuickCommerceClient.TTL_MS) return hit.data as T;
    try {
      const res = await fetch(`${BASE}${path}?${qs}`, {
        headers: { 'X-API-Key': this.key, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) { this.logger.warn(`${path} → HTTP ${res.status}`); return null; }
      const data = (await res.json()) as T;
      this.cache.set(cacheKey, { at: Date.now(), data });
      if (this.cache.size > 3000) this.cache.clear(); // crude bound
      return data;
    } catch (e) {
      this.logger.warn(`${path} failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** Pull a numeric price out of whatever field name the payload uses. */
  private num(v: unknown): number | null {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (typeof v === 'string') { const n = parseFloat(v.replace(/[₹,\s]/g, '')); return isFinite(n) ? n : null; }
    return null;
  }

  private matchPlatform(raw: unknown): string | null {
    const s = String(raw ?? '');
    for (const p of PLATFORM_MAP) if (p.match.test(s)) return p.key;
    return null;
  }

  /** Search ONE item across platforms at a location → best price per platform. */
  async searchItem(q: string, lat: number, lon: number): Promise<LivePrice[] | null> {
    const raw = await this.get<unknown>('/v1/search', { q, lat: lat.toFixed(2), lon: lon.toFixed(2) });
    if (!raw) return null;
    // Tolerant extraction: results may live under data/products/results/items,
    // grouped per platform or flat with a platform field on each product.
    const buckets: unknown[] = [];
    const dig = (o: unknown) => {
      if (Array.isArray(o)) { buckets.push(...o); return; }
      if (o && typeof o === 'object') {
        for (const k of ['data', 'products', 'results', 'items']) {
          const v = (o as Record<string, unknown>)[k];
          if (v) dig(v);
        }
      }
    };
    dig(raw);
    const best = new Map<string, LivePrice>();
    for (const b of buckets) {
      if (!b || typeof b !== 'object') continue;
      const o = b as Record<string, unknown>;
      const key = this.matchPlatform(o.platform ?? o.source ?? o.app ?? o.store);
      if (!key) continue;
      const price = this.num(o.price ?? o.selling_price ?? o.sellingPrice ?? o.offer_price ?? o.sp);
      if (price == null || price <= 0) continue;
      const available = o.available !== false && o.in_stock !== false && o.inStock !== false && !/out.?of.?stock/i.test(String(o.availability ?? ''));
      const cand: LivePrice = {
        platformKey: key,
        priceInr: Math.round(price),
        mrpInr: this.num(o.mrp ?? o.list_price ?? o.listPrice),
        packLabel: typeof (o.quantity ?? o.pack ?? o.unit ?? o.weight) === 'string' ? String(o.quantity ?? o.pack ?? o.unit ?? o.weight) : null,
        available,
        productName: String(o.name ?? o.title ?? q),
      };
      const prev = best.get(key);
      if (!prev || (cand.available && !prev.available) || (cand.available === prev.available && cand.priceInr < prev.priceInr)) {
        best.set(key, cand);
      }
    }
    return best.size ? [...best.values()] : null;
  }

  /** Live delivery ETA + store status per platform at a location. */
  async etas(lat: number, lon: number): Promise<LiveEta[]> {
    const out: LiveEta[] = [];
    await Promise.all(PLATFORM_MAP.map(async (p) => {
      const raw = await this.get<Record<string, unknown>>('/v1/eta', {
        platform: p.api, lat: lat.toFixed(2), lon: lon.toFixed(2),
      });
      if (!raw) return;
      const o = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
      const eta = this.num(o.eta_minutes ?? o.etaMinutes ?? o.eta ?? o.delivery_time ?? o.deliveryTime);
      if (eta != null && eta > 0 && eta < 240) {
        out.push({ platformKey: p.key, etaMinutes: Math.round(eta), storeOpen: o.store_open !== false && o.open !== false && o.serviceable !== false });
      }
    }));
    return out;
  }
}
