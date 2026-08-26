import { cityCoords, countryKey, haversineKm } from './geo';

/**
 * The collisions the 1M global run found, pinned.
 *
 * `cityCoords` searched one flat list of un-anchored regexes against
 * `city + state + country`, and its comment claimed the patterns were "disjoint
 * by construction". They are disjoint over India. Over the world, "North Dakota"
 * contains Kota and "Jerusalem" contains Salem, so a user in Fargo was placed in
 * Rajasthan and told they were "In your city" with people in Kota.
 */
const near = (got: { lat: number; lng: number } | null, lat: number, lng: number) => {
  expect(got).not.toBeNull();
  expect(haversineKm(got!, { lat, lng })).toBeLessThan(30);
};

describe('cityCoords outside India', () => {
  it('does not read a city name out of the middle of another word', () => {
    near(cityCoords('Fargo', 'North Dakota', 'United States'), 46.88, -96.79);
    near(cityCoords('Jerusalem', 'Jerusalem', 'Israel'), 31.77, 35.21);
  });

  it('separates the cities that share a name with an Indian one', () => {
    near(cityCoords('Salem', 'Oregon', 'United States'), 44.94, -123.04);
    near(cityCoords('Salem', 'Tamil Nadu', 'India'), 11.66, 78.15);
    near(cityCoords('Kochi', 'Kochi', 'Japan'), 33.56, 133.53);
    near(cityCoords('Kochi', 'Kerala', 'India'), 9.93, 76.27);
    near(cityCoords('Hyderabad', 'Sindh', 'Pakistan'), 25.4, 68.37);
    near(cityCoords('Hyderabad', 'Telangana', 'India'), 17.38, 78.49);
  });

  it('separates the two Londons', () => {
    near(cityCoords('London', 'Ontario', 'Canada'), 42.98, -81.25);
    near(cityCoords('London', 'England', 'United Kingdom'), 51.51, -0.13);
  });

  it('reads the country from the state when the country box is empty', () => {
    near(cityCoords('London', 'England', null), 51.51, -0.13);
  });

  it('places the cities the old table could not place at all', () => {
    for (const [c, st, co] of [
      ['Sao Paulo', 'Sao Paulo', 'Brazil'], ['Lagos', 'Lagos', 'Nigeria'],
      ['Berlin', 'Berlin', 'Germany'], ['Seoul', 'Seoul', 'South Korea'],
      ['Nairobi', 'Nairobi', 'Kenya'], ['Manila', 'Metro Manila', 'Philippines'],
      ['Riyadh', 'Riyadh', 'Saudi Arabia'], ['Melbourne', 'Victoria', 'Australia'],
      ['Mexico City', 'CDMX', 'Mexico'], ['Jakarta', 'Jakarta', 'Indonesia'],
    ] as [string, string, string][]) {
      expect(cityCoords(c, st, co)).not.toBeNull();
    }
  });

  it('still refuses to guess', () => {
    // Not in any table. Unknown is the honest answer, and it must not fall
    // through to an Indian city that happens to share a substring.
    expect(cityCoords('Bagalkot', 'Karnataka', 'India')).toBeNull();
    expect(cityCoords('Nowheresville', 'Nowhere', 'United States')).toBeNull();
  });
});

describe('countryKey', () => {
  it('does not read an Indian state code as a country code', () => {
    // CH is Chandigarh and Switzerland; BR is Bihar and Brazil; AR is Arunachal
    // Pradesh and Argentina. Codes are read from the country field only.
    expect(countryKey(null, 'CH')).toBeNull();
    expect(countryKey(null, 'BR')).toBeNull();
    expect(countryKey(null, 'AR')).toBeNull();
    near(cityCoords('Patna', 'BR', null), 25.59, 85.14);
    near(cityCoords('Chandigarh', 'CH', null), 30.73, 76.78);
  });
  it('reads a country code from the country field', () => {
    expect(countryKey('CH', null)).toBe('CH');
    expect(countryKey('IN', null)).toBe('IN');
  });
});
