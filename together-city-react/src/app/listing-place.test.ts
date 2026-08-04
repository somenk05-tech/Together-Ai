import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * A LISTING WENT WHERE THE FORM SAID, NOT WHERE THE PROPERTY WAS.
 *
 * "List Your Property" never asked where the property is. Every listing it
 * published went to the API as `city: 'Pune'` with the BUILDING NAME as the
 * locality — so a flat in Indore was filed in Pune, and "search by locality"
 * searched a list of society names. Explore filters on city, so a seller
 * anywhere else was publishing into a city their buyers were not looking at.
 *
 * The API has always required both fields (`z.string().min(1)` on each). The
 * form satisfied that requirement with a constant, which is the shape of bug
 * worth a guard: it passes every type check and every validator, and it is
 * wrong for everybody outside one city.
 */
describe('a property is listed where it is', () => {
  const sell = strip(read('src/features/realestate/pages/Sell.tsx'));

  it('asks for the city and the locality', () => {
    expect(sell).toMatch(/const PLACE: Field\[\] = \[/);
    expect(sell).toMatch(/key: 'city', label: 'City'/);
    expect(sell).toMatch(/key: 'locality', label: 'Locality \/ Area'/);
  });

  it('asks once, for every kind of property', () => {
    // A field duplicated into the house, office and shop schemas is a field
    // that gets fixed in two of them.
    expect(sell).toMatch(/\[\.\.\.PLACE, \.\.\.schema\.fields\]\.map/);
  });

  it('sends what the seller typed, and nothing hardcoded', () => {
    expect(sell).toMatch(/city: f\.city\?\.trim\(\) \|\| ''/);
    expect(sell).not.toMatch(/city: 'Pune'/);
    expect(sell).not.toMatch(/'Pune'/);
  });

  it('falls the locality back to the city, never to the building', () => {
    // A society is not an area. Filing it as one is what made locality search
    // meaningless in the first place.
    expect(sell).toMatch(/locality: f\.locality\?\.trim\(\) \|\| f\.city\?\.trim\(\) \|\| ''/);
  });

  it('will not publish a listing nobody could find', () => {
    expect(sell).toMatch(/const cityOk = !!fields\.city\?\.trim\(\)/);
    expect(sell).toMatch(/if \(!cityOk\) \{ setWarn\(/);
    // …and the step indicator agrees with the guard, so the form does not say
    // "Pricing" while refusing to leave "Property details".
    expect(sell).toMatch(/!titleOk \|\| !areaOk \|\| !cityOk \? 0/);
  });
});
