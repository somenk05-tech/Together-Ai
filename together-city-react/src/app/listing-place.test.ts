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

/**
 * SAME FAMILY, SECOND MEMBER: values the seller chose, translated wrongly on
 * the way out.
 *
 * The form's selects speak in labels ("Semi Furnished", "North-East"); the
 * API's zod enums speak in keys ("semi", "north-east"). Sending the label
 * 400'd the ENTIRE post — silently, because every failure became a `null` —
 * so the listing never existed, My Listings stayed empty, and the seller read
 * "Submitted for review". And a floor typed as "5 of 12", stripped of its
 * non-digits, is 512 — past the API's ceiling of 200, same silent 400.
 */
describe('the listing crosses the wire as the seller said it', () => {
  const sell = strip(read('src/features/realestate/pages/Sell.tsx'));

  it('furnishing and facing are sent as API enum keys, not labels', () => {
    expect(sell).toMatch(/FURNISH_API\[/);
    expect(sell).toMatch(/facingApi\(/);
    expect(sell).not.toMatch(/furnishing:\s*f\.furnish\b/);
    expect(sell).not.toMatch(/facing:\s*f\.facing\b/);
  });

  it('a floor written as "5 of 12" is a floor and a total, never five hundred and twelve', () => {
    expect(sell).toMatch(/floorNums\(/);
    expect(sell).not.toMatch(/floor:\s*f\.floor\s*\?\s*digits\(/);
  });

  it('a submit that never reached the server keeps what was typed and says why', () => {
    // setList must survive failures: only what the server accepted may leave
    // the draft list, and the server's message must reach the seller's eyes.
    expect(sell).toMatch(/setList\(failed\.map\(/);
    expect(sell).not.toMatch(/catch \{ results\.push\(null\); \}/);
  });
});
