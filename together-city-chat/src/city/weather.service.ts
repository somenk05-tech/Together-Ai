import { Injectable, Logger } from '@nestjs/common';

export interface CityWeather {
  city: string;
  region: string | null;
  temperatureC: number | null;
  feelsLikeC: number | null;
  code: number | null;
  description: string | null;
  icon: string;
  source: 'device' | 'profile' | 'default';
  lat: number;
  lng: number;
}

/** WMO weather-code → emoji + label (Open-Meteo `weather_code`). */
const WX: Record<number, { icon: string; label: string }> = {
  0: { icon: '☀️', label: 'Clear sky' },
  1: { icon: '🌤', label: 'Mainly clear' },
  2: { icon: '⛅', label: 'Partly cloudy' },
  3: { icon: '☁️', label: 'Overcast' },
  45: { icon: '🌫', label: 'Fog' }, 48: { icon: '🌫', label: 'Rime fog' },
  51: { icon: '🌦', label: 'Light drizzle' }, 53: { icon: '🌦', label: 'Drizzle' }, 55: { icon: '🌦', label: 'Heavy drizzle' },
  56: { icon: '🌧', label: 'Freezing drizzle' }, 57: { icon: '🌧', label: 'Freezing drizzle' },
  61: { icon: '🌧', label: 'Light rain' }, 63: { icon: '🌧', label: 'Rain' }, 65: { icon: '🌧', label: 'Heavy rain' },
  66: { icon: '🌧', label: 'Freezing rain' }, 67: { icon: '🌧', label: 'Freezing rain' },
  71: { icon: '🌨', label: 'Light snow' }, 73: { icon: '🌨', label: 'Snow' }, 75: { icon: '❄️', label: 'Heavy snow' }, 77: { icon: '🌨', label: 'Snow grains' },
  80: { icon: '🌦', label: 'Rain showers' }, 81: { icon: '🌦', label: 'Rain showers' }, 82: { icon: '⛈', label: 'Violent showers' },
  85: { icon: '🌨', label: 'Snow showers' }, 86: { icon: '🌨', label: 'Snow showers' },
  95: { icon: '⛈', label: 'Thunderstorm' }, 96: { icon: '⛈', label: 'Thunderstorm' }, 99: { icon: '⛈', label: 'Thunderstorm' },
};
const wxOf = (code: number | null) => (code != null && WX[code]) || { icon: '🌡', label: null };

const DEFAULT_CITY = { name: 'Mumbai', lat: 19.076, lng: 72.8777 };

@Injectable()
export class WeatherService {
  private readonly log = new Logger(WeatherService.name);
  // Cache weather by rounded coords (~1 km) for 15 min to spare the upstream API.
  private readonly cache = new Map<string, { at: number; w: { temperatureC: number | null; feelsLikeC: number | null; code: number | null } }>();
  private readonly geoCache = new Map<string, { lat: number; lng: number; name: string; region: string | null } | null>();
  private readonly TTL = 15 * 60 * 1000;

  private async fetchJson(url: string, timeoutMs = 4500): Promise<unknown | null> {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'TogetherCity/1.0' } });
      clearTimeout(t);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      this.log.warn(`weather fetch failed: ${(e as Error).message}`);
      return null;
    }
  }

  /** City name → coordinates (Open-Meteo geocoding, keyless). */
  async geocodeCity(city: string): Promise<{ lat: number; lng: number; name: string; region: string | null } | null> {
    const key = city.trim().toLowerCase();
    if (!key) return null;
    if (this.geoCache.has(key)) return this.geoCache.get(key)!;
    const j = await this.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`) as { results?: Array<{ latitude: number; longitude: number; name: string; admin1?: string }> } | null;
    const g = j?.results?.[0];
    const out = g ? { lat: g.latitude, lng: g.longitude, name: g.name, region: g.admin1 ?? null } : null;
    this.geoCache.set(key, out);
    return out;
  }

  /** Coordinates → city name (BigDataCloud reverse geocoder, keyless). */
  async reverseGeocode(lat: number, lng: number): Promise<{ name: string; region: string | null } | null> {
    const j = await this.fetchJson(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`) as { city?: string; locality?: string; principalSubdivision?: string } | null;
    if (!j) return null;
    const name = j.city || j.locality || '';
    return name ? { name, region: j.principalSubdivision ?? null } : null;
  }

  /** Current weather at coordinates (cached). */
  async weatherAt(lat: number, lng: number) {
    const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < this.TTL) return hit.w;
    const j = await this.fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code`) as { current?: { temperature_2m: number; apparent_temperature: number; weather_code: number } } | null;
    const c = j?.current;
    const w = c
      ? { temperatureC: Math.round(c.temperature_2m), feelsLikeC: Math.round(c.apparent_temperature), code: c.weather_code }
      : { temperatureC: null, feelsLikeC: null, code: null };
    if (c) this.cache.set(key, { at: Date.now(), w });
    return w;
  }

  /**
   * The header payload. Location priority:
   *  1. device lat/lng (permission granted) → reverse-geocode for the city name
   *  2. saved home city (from the Master Profile)
   *  3. default city
   */
  async header(opts: { lat?: number; lng?: number; profileCity?: string | null }): Promise<CityWeather> {
    let lat: number, lng: number, city: string, region: string | null = null;
    let source: CityWeather['source'];

    if (typeof opts.lat === 'number' && typeof opts.lng === 'number' && Number.isFinite(opts.lat) && Number.isFinite(opts.lng)) {
      lat = opts.lat; lng = opts.lng; source = 'device';
      const rev = await this.reverseGeocode(lat, lng);
      city = rev?.name || opts.profileCity || 'Your location';
      region = rev?.region ?? null;
    } else if (opts.profileCity) {
      const g = await this.geocodeCity(opts.profileCity);
      if (g) { lat = g.lat; lng = g.lng; city = g.name; region = g.region; source = 'profile'; }
      else {
        // Geocoding the saved city failed. Fetching the DEFAULT city's weather
        // and labelling it with the user's own city name produced a reading that
        // was real, correct, and about the wrong place — indistinguishable from
        // the truth. Fall back to the default city under its own name instead,
        // so the label always matches the coordinates the reading came from.
        lat = DEFAULT_CITY.lat; lng = DEFAULT_CITY.lng; city = DEFAULT_CITY.name; region = null; source = 'default';
      }
    } else {
      lat = DEFAULT_CITY.lat; lng = DEFAULT_CITY.lng; city = DEFAULT_CITY.name; source = 'default';
    }

    const w = await this.weatherAt(lat, lng);
    const wx = wxOf(w.code);
    return {
      city, region, temperatureC: w.temperatureC, feelsLikeC: w.feelsLikeC,
      code: w.code, description: wx.label, icon: wx.icon, source, lat, lng,
    };
  }
}
