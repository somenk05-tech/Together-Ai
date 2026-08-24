import { PLACES, findCity } from './places';

/**
 * THE PLACE TREE'S OWN HYGIENE. It is data somebody will grow by hand, and
 * hand-grown data drifts in exactly three ways: duplicate names that make a
 * picker ambiguous, blank strings that render as empty options, and an alias
 * that collides with a real city so half the lookups land on the wrong one.
 * Each is caught here, at the desk, instead of on somebody's listing form.
 */
describe('the place tree', () => {
  const cities = PLACES.flatMap((c) => c.states.flatMap((s) => s.cities));

  it('has no blank names anywhere', () => {
    for (const country of PLACES) {
      expect(country.name.trim()).not.toBe('');
      for (const state of country.states) {
        expect(state.name.trim()).not.toBe('');
        for (const city of state.cities) {
          expect(city.name.trim()).not.toBe('');
          for (const area of city.areas) expect(area.trim()).not.toBe('');
        }
      }
    }
  });

  it('never names the same city twice, aliases included', () => {
    const seen = new Map<string, string>();
    for (const city of cities) {
      for (const name of [city.name, ...(city.aliases ?? [])]) {
        const key = name.toLowerCase();
        // The same string claiming two cities is a picker that lies to one of them.
        expect({ name, alreadyOn: seen.get(key) ?? null }).toEqual({ name, alreadyOn: seen.has(key) ? city.name : null });
        seen.set(key, city.name);
      }
    }
  });

  it('gives every city a real neighbourhood list, unduplicated', () => {
    for (const city of cities) {
      expect(city.areas.length).toBeGreaterThanOrEqual(5);
      expect(new Set(city.areas.map((a) => a.toLowerCase())).size).toBe(city.areas.length);
    }
  });

  it('finds a city by its own name, by an alias, and by what the geocoder calls it', () => {
    expect(findCity('Mumbai')?.state).toBe('Maharashtra');
    expect(findCity('bombay')?.city.name).toBe('Mumbai');
    // The exact string that sent an owner's form sideways on 24 Aug.
    expect(findCity('Mumbai Suburban District')?.city.name).toBe('Mumbai');
    expect(findCity('Bangalore')?.city.name).toBe('Bengaluru');
    expect(findCity('Gurgaon')?.country).toBe('India');
    expect(findCity('Atlantis')).toBeNull();
    expect(findCity('')).toBeNull();
  });
});
