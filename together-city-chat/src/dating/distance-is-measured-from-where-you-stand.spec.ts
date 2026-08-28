/**
 * Distance is measured from where you stand.
 *
 * Until now the engine had exactly one idea of where a citizen was: the city
 * string on their profile. `distanceBetween(me, them)` geocoded two typed city
 * names and that was the whole geometry — so somebody who had moved, or who
 * had never got round to editing their profile city, was searched from a place
 * they were not.
 *
 * Two settings replace the three that were on the form (owner, 27 Aug):
 * "Current location", which is the default and stores the point the browser
 * gave us, and "Anywhere", which ranks on distance and excludes on nothing.
 * The "Specific location" mode is gone; the country/state/city trio it revealed
 * wrote three keys that no server code has ever read.
 *
 * The rule this file pins: coordinates win over the city string, and Anywhere
 * never rules anybody out on geography.
 */
import * as fs from 'fs';
import * as path from 'path';
import { hardFilterReason, searchDistanceKm, standCoords, type DXProfile } from './matching';

/** Mumbai and London, from the same table `cityCoords` reads. */
const MUMBAI = { lat: 19.076, lng: 72.8777 };
const LONDON = { lat: 51.5074, lng: -0.1278 };

const inMumbai: DXProfile = { city: 'Mumbai', state: 'Maharashtra', country: 'India' };
const inLondon: DXProfile = { city: 'London', country: 'United Kingdom' };

describe('where a citizen stands', () => {
  it('is the city on the profile when no point was ever shared', () => {
    const p = standCoords(inMumbai);
    expect(p).not.toBeNull();
    expect(Math.round(p!.lat)).toBe(19);
  });

  it('is the shared point when there is one, whatever the profile city says', () => {
    const moved: DXProfile = { ...inMumbai, partnerLocationMode: 'around', searchLat: LONDON.lat, searchLng: LONDON.lng };
    expect(standCoords(moved)).toEqual(LONDON);
  });

  it('measures from that point, not from the profile city', () => {
    const moved: DXProfile = { ...inMumbai, partnerLocationMode: 'around', searchLat: LONDON.lat, searchLng: LONDON.lng };
    // A Londoner is next door; the neighbours they left behind are not.
    expect(searchDistanceKm(moved, inLondon)!).toBeLessThan(50);
    expect(searchDistanceKm(moved, inMumbai)!).toBeGreaterThan(6_000);
  });

  it('is null when either side cannot be placed, and so excludes nobody', () => {
    expect(searchDistanceKm(inMumbai, { city: 'Nowhereville' })).toBeNull();
  });
});

describe('the Distance deal-breaker', () => {
  const near = { ...inMumbai, partnerLocationMode: 'around' as const, searchLat: MUMBAI.lat, searchLng: MUMBAI.lng };

  it('is measured from the shared point — a Mumbai citizen standing in London keeps the Londoner', () => {
    const me: DXProfile = {
      ...inMumbai, dealBreakers: ['Distance'], prefDistanceKm: 100,
      partnerLocationMode: 'around', searchLat: LONDON.lat, searchLng: LONDON.lng,
    };
    expect(hardFilterReason(me, inLondon, 30)).not.toBe('distance');
    expect(hardFilterReason(me, inMumbai, 30)).toBe('distance');
  });

  it('still excludes on the profile city when nobody shared a point', () => {
    const me: DXProfile = { ...inMumbai, dealBreakers: ['Distance'], prefDistanceKm: 100 };
    expect(hardFilterReason(me, inLondon, 30)).toBe('distance');
  });

  it('never fires under Anywhere, whatever the slider was left at', () => {
    const me: DXProfile = { ...near, dealBreakers: ['Distance'], prefDistanceKm: 5, partnerLocationMode: 'any' };
    expect(hardFilterReason(me, inLondon, 30)).not.toBe('distance');
  });

  it('does fire under Current location at the same radius — so the mode is what changed, not the radius', () => {
    const me: DXProfile = { ...near, dealBreakers: ['Distance'], prefDistanceKm: 5 };
    expect(hardFilterReason(me, inLondon, 30)).toBe('distance');
  });
});

describe('the form and the engine agree on the vocabulary', () => {
  const form = fs.readFileSync(
    path.join(__dirname, '../../../together-city-react/src/features/dating/pages/DatingProfile.tsx'),
    'utf8',
  );

  it('offers two settings and no third', () => {
    expect(form).toContain("partnerLocationMode: 'around'");
    expect(form).toContain("partnerLocationMode: 'any'");
    // Named in a comment as the mode that was retired; never written or read.
    expect(form).not.toContain("partnerLocationMode: 'specific'");
    expect(form).not.toContain("partnerLocationMode === 'specific'");
  });

  it('has no partner country/state/city picker left to write keys nothing reads', () => {
    expect(form).not.toMatch(/partnerCountry|partnerState|partnerCity/);
  });

  it('defaults to current location rather than to Anywhere', () => {
    expect(form).toContain("dx.partnerLocationMode === 'any' ? 'any' : 'around'");
  });

  /* The radius and the point it is drawn around are one answer, and the form
     has to read like one: the slider sits UNDER the setting and prints the
     origin in its own label. Both pins fail if the slider drifts back up into
     the grid of unrelated preferences it came out of. */
  it('puts the radius below the setting it is measured from', () => {
    expect(form.indexOf('Where to find your partner'))
      .toBeLessThan(form.indexOf('Maximum distance in kilometres'));
  });

  it('names that origin in the slider label, not just above it', () => {
    expect(form).toContain('`Distance from ${originName} — `');
  });
});
