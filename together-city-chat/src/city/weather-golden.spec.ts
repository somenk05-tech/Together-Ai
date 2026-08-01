/**
 * Golden master — the header's location decision tree, recorded over a stubbed
 * fetch. The honest-fallback rule matters most: when geocoding a saved city
 * fails, the default city appears UNDER ITS OWN NAME — never a real reading
 * labelled with the wrong place.
 */
import { WeatherService } from './weather.service';

type Fixtures = { geocode?: unknown; reverse?: unknown; forecast?: unknown };

function build(fx: Fixtures) {
  const svc = Object.create(WeatherService.prototype) as WeatherService;
  const urls: string[] = [];
  (svc as any).log = { warn: () => undefined };
  (svc as any).cache = new Map();
  (svc as any).geoCache = new Map();
  (svc as any).TTL = 15 * 60 * 1000;
  (svc as any).fetchJson = async (url: string) => {
    urls.push(new URL(url).hostname + new URL(url).pathname);
    if (url.includes('geocoding-api')) return fx.geocode ?? null;
    if (url.includes('bigdatacloud')) return fx.reverse ?? null;
    if (url.includes('api.open-meteo.com')) return fx.forecast ?? null;
    return null;
  };
  return { svc, urls };
}

const FORECAST = { current: { temperature_2m: 29.6, apparent_temperature: 33.2, weather_code: 3 } };

describe('city weather golden master', () => {
  it('device coordinates win; reverse geocode names the place', async () => {
    const { svc } = build({ reverse: { city: 'Pune', principalSubdivision: 'Maharashtra' }, forecast: FORECAST });
    expect(await svc.header({ lat: 18.52, lng: 73.85, profileCity: 'Mumbai' })).toMatchSnapshot();
  });

  it('saved city geocodes when there are no device coordinates', async () => {
    const { svc } = build({ geocode: { results: [{ latitude: 12.97, longitude: 77.59, name: 'Bengaluru', admin1: 'Karnataka' }] }, forecast: FORECAST });
    expect(await svc.header({ profileCity: 'Bengaluru' })).toMatchSnapshot();
  });

  it('geocode failure falls back to the default city UNDER ITS OWN NAME', async () => {
    const { svc } = build({ geocode: null, forecast: FORECAST });
    const h = await svc.header({ profileCity: 'Atlantis' });
    expect(h.source).toBe('default');
    expect(h.city).not.toBe('Atlantis');
    expect(h).toMatchSnapshot();
  });

  it('no location at all → default city; upstream outage → null reading, honest nulls', async () => {
    const { svc } = build({ forecast: null });
    expect(await svc.header({})).toMatchSnapshot();
  });

  it('weather is cached ~1km/15min — the second read costs no fetch', async () => {
    const { svc, urls } = build({ forecast: FORECAST });
    await svc.weatherAt(19.076, 72.8777);
    await svc.weatherAt(19.078, 72.8779); // rounds to the same cell
    expect(urls.filter((u) => u.includes('api.open-meteo.com'))).toHaveLength(1);
  });
});
