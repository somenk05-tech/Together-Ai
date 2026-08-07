import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(web, '..', '..', 'together-city-chat', 'src');
const read = (p: string) => readFileSync(join(web, p), 'utf8');
const readApi = (p: string) => readFileSync(join(api, p), 'utf8');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const map = strip(read('components/SlippyMap.tsx'));
const picker = strip(read('components/LocationPicker.tsx'));
const form = strip(read('features/services/ListingForm.tsx'));
const geoSvc = strip(readApi('geo/geo.service.ts'));

/**
 * "WHERE ARE YOU" WAS TWO DECIMAL NUMBERS.
 *
 * Nobody knows their latitude. The button that filled the fields in worked,
 * and everybody who declined the permission prompt — or was sitting at a desk
 * across town from their shop — was left typing decimal degrees into two boxes
 * with a validation message about −90 to 90 underneath.
 *
 * OpenStreetMap was chosen over Google deliberately: no key, no billing
 * account, no per-load charge, and nothing to configure before it works. The
 * cost of that choice is real and is paid in these tests — OSM's terms are
 * conditions, not suggestions, and an application that ignores them gets its
 * User-Agent blocked rather than a bill.
 */
describe('OpenStreetMap’s terms are honoured in code, not in a comment', () => {
  it('credits OpenStreetMap wherever a tile appears', () => {
    // The licence requires visible credit. It is rendered by the map component
    // rather than left to each caller, because a caller who forgets has put
    // the project in breach and nothing would say so.
    expect(map).toMatch(/© OpenStreetMap contributors/);
    expect(map).toMatch(/openstreetmap\.org\/copyright/);
  });

  it('geocodes through our own API, never from the citizen’s browser', () => {
    // Three reasons, and the third decided it: a geocode from the page sends
    // what somebody is looking for AND where they are connecting from to a
    // third party, together, in a hub built on citizens being able to approach
    // a business without being identifiable.
    expect(picker).toMatch(/from '@\/api\/geo\.api'/);
    expect(picker).not.toMatch(/nominatim|openstreetmap\.org\/search/i);
  });

  it('identifies itself upstream, which a browser cannot do', () => {
    expect(geoSvc).toMatch(/'User-Agent': UA/);
    expect(geoSvc).toMatch(/const UA = 'TogetherCity/);
  });

  it('spaces upstream requests to one a second, under a burst and not just a trickle', () => {
    // A promise chain rather than a token bucket: every call joins the tail, so
    // the spacing holds when twenty arrive at once — which is the case that
    // actually gets an application blocked.
    expect(geoSvc).toMatch(/private queue: Promise<void>/);
    expect(geoSvc).toMatch(/setTimeout\(r, 1_100\)/);
    expect(geoSvc).toMatch(/await this\.spaced\(/);
  });

  it('caches, because addresses do not move', () => {
    expect(geoSvc).toMatch(/TTL = 24 \* 60 \* 60 \* 1000/);
    // Bounded, so a long-running instance cannot grow it without limit.
    expect(geoSvc).toMatch(/if \(this\.cache\.size > 2000\)/);
  });

  it('searches on submit rather than on every keystroke', () => {
    // Autocomplete-as-you-type would be nicer and would be taking more than
    // our share of something nobody is charging for.
    expect(picker).toMatch(/if \(e\.key === 'Enter'\)/);
    expect(picker).not.toMatch(/onChange=\{[^}]*runSearch/);
  });
});

describe('the map itself', () => {
  it('takes no dependency, and the reason is how this repo ships', () => {
    // Every change reaches the deployment as a self-extracting script that
    // writes files and runs the gates. None of them runs `npm install`, so a
    // new package breaks the build on a machine where nobody knows to run a
    // step that is not in the script.
    const pkg = JSON.parse(read('../package.json')) as { dependencies?: Record<string, string> };
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps.filter((d) => /leaflet|mapbox|maplibre|google/i.test(d))).toEqual([]);
  });

  it('is read-only unless a caller passes onMove', () => {
    // The public business page and the owner's form are the same component.
    // A citizen looking at a salon must not be able to drag its pin.
    expect(map).toMatch(/if \(!onMove\) return;/);
    const page = strip(read('features/services/pages/BusinessPage.tsx'));
    expect(page).toMatch(/<SlippyMap lat=\{s\.lat\} lng=\{s\.lng\}/);
    expect(page).not.toMatch(/<SlippyMap[^>]*onMove/);
  });

  it('reports a new centre once, on release, not on every pointer move', () => {
    // A parent that re-rendered on every pointermove would fight the drag it
    // is being told about.
    expect(map).toMatch(/onPointerUp=/);
    expect(map).not.toMatch(/onPointerMove=\{[^}]*onMove\(/);
  });
});

describe('the form keeps what the map replaced', () => {
  it('still stores coordinates, and still lets somebody type them', () => {
    // A business owner who has their coordinates from a survey should not lose
    // the ability to paste them because a map is nicer for everybody else.
    expect(picker).toMatch(/Enter coordinates instead/);
    expect(picker).toMatch(/id="loc-lat"/);
    expect(picker).toMatch(/id="loc-lng"/);
  });

  it('moved the permission prompt into the control that asks for it', () => {
    // locateMe, locBusy and locErr lived on the form. They belong with the
    // button that triggers them.
    expect(form).not.toMatch(/const locateMe|setLocBusy|setLocErr/);
    expect(picker).toMatch(/navigator\.geolocation\.getCurrentPosition/);
  });

  it('does not relabel a pin with the address of where it used to be', () => {
    // The reverse lookup is async and the pin can move while it is in flight.
    expect(picker).toMatch(/const mine = \+\+token\.current/);
    expect(picker).toMatch(/if \(mine === token\.current\)/);
  });
});
