import { describe, expect, it } from 'vitest';
import {
  CITY_HINTS, allKnownZones, isKnownZone, zoneCity, zoneForBirthPlace, zonesForCountry,
} from './birthZone';

/**
 * THE DEFECT THIS FILE EXISTS FOR. The birth form kept one zone per country —
 * US → America/New_York, CA → America/Toronto, AU → Australia/Sydney — and set
 * it silently when the country was picked. Somebody born in Los Angeles got a
 * chart computed on New York's clock: three hours, which is about a sign and a
 * half of ascendant, and the ascendant is what the gem marketplace prices its
 * Life and Fortune stones from. The field said "(auto)" next to the wrong
 * answer, so there was nothing to notice.
 *
 * The rule these tests hold: THE FORM MAY DERIVE A ZONE OR ASK FOR ONE. It may
 * never assume one. `null` from `zoneForBirthPlace` is the ask, and it is the
 * most important return value in the file.
 */

describe('a country with one time zone answers by itself', () => {
  it('gives the zone with nothing else to go on', () => {
    expect(zoneForBirthPlace('IN', '')).toBe('Asia/Kolkata');
    expect(zoneForBirthPlace('GB', '')).toBe('Europe/London');
    expect(zoneForBirthPlace('AE', '')).toBe('Asia/Dubai');
    expect(zoneForBirthPlace('JP', '')).toBe('Asia/Tokyo');
  });

  it('is the common case, so most citizens are never asked', () => {
    // Named rather than counted: a country that quietly grows a second zone in
    // a tzdata update should show up here as itself, not as an off-by-one.
    const asked = ['IN', 'GB', 'AE', 'JP', 'SG', 'NP', 'LK', 'BD', 'PK', 'TH', 'PH', 'VN', 'KE', 'NG', 'ZA', 'FR', 'IT', 'NL', 'IE', 'CH']
      .filter((cc) => zonesForCountry(cc).length !== 1);
    expect(asked).toEqual([]);
  });

  it('does ask in Germany, because Büsingen is a real answer', () => {
    // Germany has two zones for an enclave of about 1,500 people. The form
    // still refuses to assume — and the hint table means nobody born in a
    // German city anybody has heard of is actually asked.
    expect(zonesForCountry('DE')).toEqual(['Europe/Berlin', 'Europe/Busingen']);
    expect(zoneForBirthPlace('DE', '')).toBeNull();
    expect(zoneForBirthPlace('DE', 'Munich')).toBe('Europe/Berlin');
    expect(zoneForBirthPlace('DE', 'Berlin')).toBe('Europe/Berlin');
  });

  it('is case-insensitive about the country code', () => {
    expect(zoneForBirthPlace('in', 'Jamshedpur')).toBe('Asia/Kolkata');
  });
});

describe('a country with several time zones does not', () => {
  it('returns nothing rather than the biggest city — the whole bug', () => {
    expect(zoneForBirthPlace('US', '')).toBeNull();
    expect(zoneForBirthPlace('CA', '')).toBeNull();
    expect(zoneForBirthPlace('AU', '')).toBeNull();
    expect(zoneForBirthPlace('BR', '')).toBeNull();
  });

  it('never answers New York for a Los Angeles birth', () => {
    expect(zoneForBirthPlace('US', 'Los Angeles')).toBe('America/Los_Angeles');
    expect(zoneForBirthPlace('US', 'Los Angeles')).not.toBe('America/New_York');
  });

  it('leaves a city it has never heard of unanswered', () => {
    expect(zoneForBirthPlace('US', 'Nowhereville')).toBeNull();
    expect(zoneForBirthPlace('BR', 'Vila Qualquer')).toBeNull();
  });
});

describe('the birth city, when it can answer', () => {
  it('reads the city a zone is named after', () => {
    expect(zoneForBirthPlace('US', 'New York')).toBe('America/New_York');
    expect(zoneForBirthPlace('US', 'Chicago')).toBe('America/Chicago');
    expect(zoneForBirthPlace('AU', 'Perth')).toBe('Australia/Perth');
    expect(zoneForBirthPlace('AR', 'Buenos Aires')).toBe('America/Argentina/Buenos_Aires');
  });

  it('reads the large cities that are not zone names', () => {
    expect(zoneForBirthPlace('US', 'San Francisco')).toBe('America/Los_Angeles');
    expect(zoneForBirthPlace('US', 'Seattle')).toBe('America/Los_Angeles');
    expect(zoneForBirthPlace('US', 'Boston')).toBe('America/New_York');
    expect(zoneForBirthPlace('CA', 'Montreal')).toBe('America/Toronto');
    expect(zoneForBirthPlace('CA', 'Calgary')).toBe('America/Edmonton');
    expect(zoneForBirthPlace('AU', 'Canberra')).toBe('Australia/Sydney');
    expect(zoneForBirthPlace('ID', 'Denpasar')).toBe('Asia/Makassar');
    expect(zoneForBirthPlace('ES', 'Tenerife')).toBe('Atlantic/Canary');
  });

  it('does not care about accents, case or punctuation', () => {
    expect(zoneForBirthPlace('BR', 'São Paulo')).toBe('America/Sao_Paulo');
    expect(zoneForBirthPlace('BR', 'sao  paulo')).toBe('America/Sao_Paulo');
    expect(zoneForBirthPlace('RU', 'St. Petersburg')).toBe('Europe/Moscow');
    expect(zoneForBirthPlace('US', '  LOS ANGELES ')).toBe('America/Los_Angeles');
  });

  it('reads the same city name differently in different countries', () => {
    // London, Ontario is not London, England — which is why hints are scoped
    // by country rather than kept in one flat table of city names.
    expect(zoneForBirthPlace('CA', 'London')).toBe('America/Toronto');
    expect(zoneForBirthPlace('GB', 'London')).toBe('Europe/London');
    expect(zoneForBirthPlace('NZ', 'Hamilton')).toBe('Pacific/Auckland');
    expect(zoneForBirthPlace('CA', 'Hamilton')).toBe('America/Toronto');
  });
});

describe('the hint table', () => {
  it('only points at zones the country actually has', () => {
    const wrong: string[] = [];
    for (const [cc, hints] of Object.entries(CITY_HINTS)) {
      const zones = zonesForCountry(cc);
      if (!zones.length) wrong.push(`${cc}: not a country in the tz database`);
      for (const [city, zone] of Object.entries(hints)) {
        if (!zones.includes(zone)) wrong.push(`${cc}/${city} → ${zone}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('is written already folded, or the lookup would never find the row', () => {
    const unfolded: string[] = [];
    for (const [cc, hints] of Object.entries(CITY_HINTS)) {
      for (const city of Object.keys(hints)) {
        if (city !== city.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()) {
          unfolded.push(`${cc}/${city}`);
        }
      }
    }
    expect(unfolded).toEqual([]);
  });

  it('is only ever consulted for countries that need one', () => {
    // A hint for a one-zone country is harmless but pointless, and it would
    // mean somebody misunderstood what this table is for.
    const single = Object.keys(CITY_HINTS).filter((cc) => zonesForCountry(cc).length === 1);
    expect(single).toEqual([]);
  });
});

describe('what counts as a time zone', () => {
  it('accepts the aliases already saved in this city\'s profiles', () => {
    // Profiles carry 'Asia/Calcutta'. A membership test against
    // Intl.supportedValuesOf, which lists canonical names only, would reject
    // it and lock those citizens out of their own birth details.
    expect(isKnownZone('Asia/Calcutta')).toBe(true);
    expect(isKnownZone('Asia/Kolkata')).toBe(true);
    expect(isKnownZone('America/Los_Angeles')).toBe(true);
  });

  it('refuses what is not one', () => {
    expect(isKnownZone('')).toBe(false);
    expect(isKnownZone('IST')).toBe(false);
    expect(isKnownZone('Mars/Olympus_Mons')).toBe(false);
    expect(isKnownZone('+05:30')).toBe(false);
  });

  it('offers a list long enough to be the real one', () => {
    const all = allKnownZones();
    expect(all.length).toBeGreaterThan(300);
    for (const z of ['America/Los_Angeles', 'Europe/London', 'Australia/Sydney']) {
      expect(all).toContain(z);
    }
  });

  it('offers both spellings, because engines disagree about which is canonical', () => {
    // Node/ICU here calls it Asia/Calcutta; the picker offers Asia/Kolkata.
    // Somebody typing by hand must find whichever one they know.
    const all = allKnownZones();
    expect(all).toContain('Asia/Kolkata');
    expect(all).toContain('Asia/Calcutta');
  });
});

describe('the order the picker shows', () => {
  it('is the tz database\'s own, which puts the principal zone first', () => {
    // Alphabetical would open the United States on America/Adak, in the
    // Aleutian Islands, population about 170.
    expect(zonesForCountry('US')[0]).toBe('America/New_York');
    expect(zonesForCountry('BR')[0]).toBe('America/Noronha');
    expect(zonesForCountry('MX')[0]).toBe('America/Mexico_City');
  });
});

describe('what a zone is called on screen', () => {
  it('is the city, spelled the way a person writes it', () => {
    expect(zoneCity('America/Los_Angeles')).toBe('Los Angeles');
    expect(zoneCity('Asia/Kolkata')).toBe('Kolkata');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
  });

  it('names every zone of the countries a citizen is asked about', () => {
    for (const cc of ['US', 'CA', 'AU', 'BR', 'RU', 'MX']) {
      for (const z of zonesForCountry(cc)) expect(zoneCity(z)).not.toBe('');
    }
  });
});
