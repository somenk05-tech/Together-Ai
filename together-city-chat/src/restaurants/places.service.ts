import { Injectable, Logger } from '@nestjs/common';

/**
 * A restaurant fetched live from Google Places, normalised to the shape the
 * discovery ranker understands. `lat`/`lng` are real, so distance is real.
 */
export type PlaceRestaurant = {
  id: string;              // "gp:<place_id>"
  placeId: string;
  name: string;
  cuisine: string;         // our taxonomy key, best-effort from types/name
  area: string;            // vicinity
  city: string;
  rating: number;
  ratingsCount: number;
  priceForTwoInr: number;  // derived from price_level
  tagline: string;
  openHours: string;       // "" (unknown) — openNow carried separately
  openNow: boolean | null;
  vegFriendly: boolean;
  pureVeg: boolean;
  lat: number;
  lng: number;
  heroUrl: string;
  source: 'places';
};

type CacheEntry = { at: number; items: PlaceRestaurant[] };

/** price_level 0–4 → a rough "for two" INR figure (Indian metro pricing). */
const PRICE_FOR_TWO = [300, 500, 1200, 2500, 4000];

const CUISINE_KEYWORDS: Array<[RegExp, string]> = [
  [/pizza|italian|pasta|trattoria|napoli/i, 'italian'],
  [/chinese|szechuan|sichuan|wok|dragon|hakka|noodle/i, 'chinese'],
  [/sushi|japan|ramen|izakaya|teppan/i, 'japanese'],
  [/biryani|biriyani/i, 'biryani'],
  [/cafe|coffee|café|bakery|patisserie|brew/i, 'cafe'],
  [/south indian|dosa|idli|udupi|sagar|andhra|chettinad|madras/i, 'south-indian'],
  [/dhaba|tandoor|punjab|mughal|kebab|curry|indian|masala|spice|zaika|rasoi/i, 'north-indian'],
  [/street|chaat|tikki|roll|momo/i, 'street'],
];

@Injectable()
export class PlacesService {
  private readonly log = new Logger('PlacesService');
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 20 * 60 * 1000;   // cache 20 min (user's 15–30 min window)
  private readonly cellDeg = 0.005;            // ~500 m grid → moving > ~500 m re-fetches

  private get key(): string | null {
    return process.env.GOOGLE_MAPS_API_KEY || process.env.MAPS_API_KEY || null;
  }

  get enabled(): boolean { return !!this.key; }

  /** Coarse geo-cell + radius bucket. Same cell + fresh TTL → cache hit. */
  private cacheKey(lat: number, lng: number, radiusM: number): string {
    const gy = Math.round(lat / this.cellDeg);
    const gx = Math.round(lng / this.cellDeg);
    const rb = Math.round(radiusM / 500);
    return `${gy}:${gx}:${rb}`;
  }

  private cuisineFrom(name: string, types: string[]): string {
    const hay = `${name} ${types.join(' ')}`;
    for (const [re, key] of CUISINE_KEYWORDS) if (re.test(hay)) return key;
    if (types.includes('cafe')) return 'cafe';
    return 'north-indian'; // sensible default for the Indian market
  }

  private photoUrl(ref: string | undefined): string {
    if (!ref || !this.key) return '';
    return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${this.key}`;
  }

  /**
   * Nearby restaurants around a point. Returns [] when no API key is set or the
   * call fails — the caller then falls back to the seeded catalogue.
   * Results are cached per ~500 m cell for 20 min; a cell change (the user moved
   * significantly) or TTL expiry triggers a fresh call, nothing else does.
   */
  async nearby(lat: number, lng: number, radiusM: number): Promise<PlaceRestaurant[]> {
    if (!this.key) return [];
    const ck = this.cacheKey(lat, lng, radiusM);
    const hit = this.cache.get(ck);
    if (hit && Date.now() - hit.at < this.ttlMs) return hit.items;

    try {
      const url = new URL('https://maps.googleapis.com/maps/api/place/nearbysearch/json');
      url.searchParams.set('location', `${lat},${lng}`);
      url.searchParams.set('radius', String(Math.min(50000, Math.max(500, radiusM))));
      url.searchParams.set('type', 'restaurant');
      url.searchParams.set('key', this.key);
      const res = await fetch(url.toString());
      if (!res.ok) { this.log.warn(`Places HTTP ${res.status}`); return this.stale(ck); }
      const data = (await res.json()) as {
        status: string;
        results?: Array<{
          place_id: string; name: string; rating?: number; user_ratings_total?: number;
          price_level?: number; vicinity?: string; types?: string[];
          geometry?: { location?: { lat: number; lng: number } };
          opening_hours?: { open_now?: boolean };
          photos?: Array<{ photo_reference?: string }>;
        }>;
      };
      if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        this.log.warn(`Places status ${data.status}`);
        return this.stale(ck);
      }
      const items: PlaceRestaurant[] = (data.results ?? []).map((p) => {
        const types = p.types ?? [];
        const nameLc = p.name || 'Restaurant';
        const pureVeg = /pure veg|vegetarian|shakahari|udupi|sattvik/i.test(nameLc);
        const cuisine = this.cuisineFrom(nameLc, types);
        return {
          id: `gp:${p.place_id}`,
          placeId: p.place_id,
          name: p.name,
          cuisine,
          area: p.vicinity ?? '',
          city: '',
          rating: p.rating ?? 4.0,
          ratingsCount: p.user_ratings_total ?? 0,
          priceForTwoInr: PRICE_FOR_TWO[Math.max(0, Math.min(4, p.price_level ?? 2))],
          tagline: '',
          openHours: '',
          openNow: p.opening_hours?.open_now ?? null,
          vegFriendly: pureVeg || /veg|indian|dosa|thali|cafe/i.test(nameLc) || cuisine.includes('indian'),
          pureVeg,
          lat: p.geometry?.location?.lat ?? lat,
          lng: p.geometry?.location?.lng ?? lng,
          heroUrl: this.photoUrl(p.photos?.[0]?.photo_reference),
          source: 'places' as const,
        };
      });
      this.cache.set(ck, { at: Date.now(), items });
      return items;
    } catch (e) {
      this.log.warn(`Places fetch failed: ${(e as Error).message}`);
      return this.stale(ck);
    }
  }

  /** On a failed refresh, serve the last cached copy for this cell if we have one. */
  private stale(ck: string): PlaceRestaurant[] {
    return this.cache.get(ck)?.items ?? [];
  }
}

/** Great-circle distance in km. */
export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}
