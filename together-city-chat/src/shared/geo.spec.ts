
import { cityCoords, distanceBetween, haversineKm } from './geo';

describe('cityCoords', () => {
  it('resolves the spellings M7 said were strangers to each other', () => {
    expect(cityCoords('Bengaluru')).toEqual(cityCoords('Bangalore'));
    expect(cityCoords('Mumbai')).toEqual(cityCoords('Bombay'));
    expect(cityCoords('Gurugram')).toEqual(cityCoords('Gurgaon'));
    expect(cityCoords('Kolkata')).toEqual(cityCoords('Calcutta'));
  });
  it('reads the state or country when the city alone is not the recognisable word', () => {
    expect(cityCoords('Panaji', 'Goa', 'India')).not.toBeNull();
  });
  it('returns null rather than a guess', () => {
    // The whole point. astro-engine's geocodeApprox would answer here, from the
    // time zone, and put this on a meridian nobody measured.
    expect(cityCoords('Nowhereville')).toBeNull();
    expect(cityCoords('')).toBeNull();
    expect(cityCoords(null, null, null)).toBeNull();
  });
});

describe('haversineKm', () => {
  it('agrees with known distances to within a rounding error', () => {
    const mum = cityCoords('Mumbai')!, del = cityCoords('Delhi')!;
    expect(haversineKm(mum, del)).toBeGreaterThan(1100);
    expect(haversineKm(mum, del)).toBeLessThan(1200);      // ~1150 km
    const pune = cityCoords('Pune')!;
    expect(haversineKm(mum, pune)).toBeGreaterThan(110);
    expect(haversineKm(mum, pune)).toBeLessThan(130);      // ~120 km
    const lon = cityCoords('London')!, ny = cityCoords('New York')!;
    expect(haversineKm(lon, ny)).toBeGreaterThan(5500);
    expect(haversineKm(lon, ny)).toBeLessThan(5620);       // ~5570 km
  });
  it('is zero for a place and itself, and symmetric', () => {
    const a = cityCoords('Chennai')!, b = cityCoords('Kochi')!;
    expect(haversineKm(a, a)).toBe(0);
    expect(haversineKm(a, b)).toBe(haversineKm(b, a));
  });
  it('handles the equator and the date line without NaN', () => {
    expect(haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeLessThan(250);
    expect(Number.isFinite(haversineKm({ lat: 90, lng: 0 }, { lat: -90, lng: 0 }))).toBe(true);
  });
});

describe('distanceBetween', () => {
  it('is null when either side cannot be placed — never a number', () => {
    expect(distanceBetween({ city: 'Pune' }, { city: 'Nowhereville' })).toBeNull();
    expect(distanceBetween({ city: 'Nowhereville' }, { city: 'Pune' })).toBeNull();
    expect(distanceBetween({}, {})).toBeNull();
  });
  it('reports the two spellings of one city as the same place', () => {
    expect(distanceBetween({ city: 'Bengaluru' }, { city: 'Bangalore' })).toBe(0);
  });
  it('separates an India-metro pair from an overseas one', () => {
    // The audit measured India-metro × overseas crossing 75% because distance
    // was never consulted. These are the numbers that will now separate them.
    const near = distanceBetween({ city: 'Mumbai' }, { city: 'Pune' })!;
    const far = distanceBetween({ city: 'Mumbai' }, { city: 'London' })!;
    expect(near).toBeLessThan(150);
    expect(far).toBeGreaterThan(6000);
  });
});
