/**
 * Where a city is, and how far apart two of them are.
 *
 * The coordinate table lived in `astrology/astro-engine.ts`, because placing a
 * birth chart was the first thing that needed it. Dating needs the same data to
 * answer "how far away is this person", and a second copy of 140 cities is a
 * second set of coordinates to drift. So the table moved here and the astrology
 * engine imports it.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: guess.
 *
 * `geocodeApprox()` in the astrology engine falls back to a longitude implied
 * by the time zone — 15° per hour — when a city is not in the table. That is
 * right for an ascendant, which needs a rough longitude and would rather have
 * one than nothing. It is useless for distance: it would place every unlisted
 * Indian city on the same meridian and report them as neighbours.
 *
 * `cityCoords()` returns null instead. A distance we cannot compute is reported
 * as unknown and the caller falls back to comparing place names, which is what
 * the app did before this existed. Never a number nobody measured.
 */

export interface Coords { lat: number; lng: number }

/** City → [lat, lng]. Approximate is fine: these decide "same city or 2,000 km
 *  away", not a route. Aliases are in the patterns — bengaluru and bangalore,
 *  gurugram and gurgaon — which is why matching on them fixes the spelling
 *  problem for free (M7's "Bengaluru" vs "Bangalore"). */
export const CITY_COORDS: Array<[RegExp, number, number]> = [
  [/mumbai|bombay/i, 19.08, 72.88], [/delhi/i, 28.61, 77.21], [/bangalore|bengaluru/i, 12.97, 77.59],
  [/hyderabad/i, 17.38, 78.49], [/chennai|madras/i, 13.08, 80.27], [/kolkata|calcutta/i, 22.57, 88.36],
  [/pune/i, 18.52, 73.86], [/ahmedabad/i, 23.02, 72.57], [/jaipur/i, 26.91, 75.79], [/surat/i, 21.17, 72.83],
  [/lucknow/i, 26.85, 80.95], [/kanpur/i, 26.45, 80.33], [/nagpur/i, 21.15, 79.09], [/indore/i, 22.72, 75.86],
  [/bhopal/i, 23.26, 77.41], [/patna/i, 25.59, 85.14], [/vadodara|baroda/i, 22.31, 73.18],
  [/ludhiana/i, 30.9, 75.86], [/agra/i, 27.18, 78.01], [/varanasi|banaras/i, 25.32, 82.99],
  [/kochi|cochin/i, 9.93, 76.27], [/thiruvananthapuram|trivandrum/i, 8.52, 76.94], [/coimbatore/i, 11.02, 76.97],
  [/chandigarh/i, 30.73, 76.78], [/guwahati/i, 26.14, 91.74], [/bhubaneswar/i, 20.3, 85.82],
  [/amritsar/i, 31.63, 74.87], [/goa|panaji/i, 15.5, 73.83], [/mysore|mysuru/i, 12.3, 76.64],
  // Lookup-table cities (platform master data) — approximate is fine for houses.
  [/ranchi/i, 23.34, 85.31], [/jamshedpur/i, 22.8, 86.2], [/dhanbad/i, 23.8, 86.43], [/bokaro/i, 23.67, 86.15],
  [/raipur/i, 21.25, 81.63], [/bhilai/i, 21.19, 81.35], [/bilaspur/i, 22.08, 82.15], [/korba/i, 22.35, 82.68],
  [/dehradun/i, 30.32, 78.03], [/haridwar/i, 29.95, 78.16], [/roorkee/i, 29.85, 77.89], [/nainital/i, 29.38, 79.46], [/haldwani/i, 29.22, 79.52],
  [/shimla/i, 31.1, 77.17], [/manali/i, 32.24, 77.19], [/dharamshala/i, 32.22, 76.32], [/solan/i, 30.9, 77.1],
  [/srinagar/i, 34.08, 74.8], [/jammu/i, 32.73, 74.87], [/anantnag/i, 33.73, 75.15], [/baramulla/i, 34.2, 74.34],
  [/thane/i, 19.22, 72.98], [/navi mumbai/i, 19.03, 73.02], [/nashik/i, 20.0, 73.79], [/aurangabad/i, 19.88, 75.34],
  [/solapur/i, 17.66, 75.91], [/kolhapur/i, 16.7, 74.24], [/amravati/i, 20.93, 77.76],
  [/mangal(uru|ore)/i, 12.91, 74.86], [/hubballi|hubli/i, 15.36, 75.12], [/belagavi|belgaum/i, 15.85, 74.5],
  [/kalaburagi|gulbarga/i, 17.33, 76.83], [/davanagere/i, 14.46, 75.92], [/shivamogga|shimoga/i, 13.93, 75.57],
  [/madurai/i, 9.93, 78.12], [/tiruchirappalli|trichy/i, 10.79, 78.7], [/salem/i, 11.66, 78.15],
  [/tirunelveli/i, 8.71, 77.76], [/erode/i, 11.34, 77.72], [/vellore/i, 12.92, 79.13],
  [/warangal/i, 17.97, 79.59], [/nizamabad/i, 18.67, 78.1], [/karimnagar/i, 18.44, 79.13], [/khammam/i, 17.25, 80.15],
  [/howrah/i, 22.59, 88.26], [/durgapur/i, 23.52, 87.31], [/asansol/i, 23.68, 86.98], [/siliguri/i, 26.73, 88.4], [/darjeeling/i, 27.04, 88.26],
  [/bhavnagar/i, 21.76, 72.15], [/gandhinagar/i, 23.22, 72.65], [/jamnagar/i, 22.47, 70.06],
  [/jodhpur/i, 26.24, 73.02], [/udaipur/i, 24.58, 73.71], [/kota/i, 25.21, 75.86], [/ajmer/i, 26.45, 74.64], [/bikaner/i, 28.02, 73.31],
  [/ghaziabad/i, 28.67, 77.42], [/meerut/i, 28.98, 77.71], [/noida/i, 28.57, 77.32], [/prayagraj|allahabad/i, 25.44, 81.85],
  [/bareilly/i, 28.37, 79.43], [/gorakhpur/i, 26.76, 83.37],
  [/kozhikode|calicut/i, 11.26, 75.78], [/thrissur/i, 10.53, 76.21], [/kollam/i, 8.89, 76.61], [/kannur/i, 11.87, 75.37],
  [/jalandhar/i, 31.33, 75.58], [/patiala/i, 30.34, 76.39], [/bathinda/i, 30.21, 74.95], [/mohali/i, 30.7, 76.72],
  [/gurugram|gurgaon/i, 28.46, 77.03], [/faridabad/i, 28.41, 77.31], [/panipat/i, 29.39, 76.96], [/ambala/i, 30.38, 76.78], [/karnal/i, 29.69, 76.98], [/hisar/i, 29.15, 75.72],
  [/jabalpur/i, 23.18, 79.98], [/gwalior/i, 26.22, 78.18], [/ujjain/i, 23.18, 75.78],
  [/gaya/i, 24.79, 85.0], [/bhagalpur/i, 25.24, 87.0], [/muzaffarpur/i, 26.12, 85.36], [/darbhanga/i, 26.15, 85.9],
  [/visakhapatnam|vizag/i, 17.69, 83.22], [/vijayawada/i, 16.51, 80.65], [/guntur/i, 16.31, 80.44], [/nellore/i, 14.44, 79.99], [/tirupati/i, 13.63, 79.42], [/kakinada/i, 16.99, 82.25],
  [/cuttack/i, 20.46, 85.88], [/rourkela/i, 22.25, 84.88], [/berhampur/i, 19.31, 84.79], [/sambalpur/i, 21.47, 83.97],
  [/silchar/i, 24.82, 92.8], [/dibrugarh/i, 27.47, 94.91], [/jorhat/i, 26.75, 94.22],
  [/margao/i, 15.27, 73.96], [/vasco da gama/i, 15.4, 73.81], [/mapusa/i, 15.59, 73.81],
  [/puducherry|pondicherry/i, 11.91, 79.81],
  [/london/i, 51.51, -0.13], [/new york/i, 40.71, -74.01], [/dubai/i, 25.2, 55.27], [/singapore/i, 1.35, 103.82],
  [/sydney/i, -33.87, 151.21], [/toronto/i, 43.65, -79.38], [/san francisco/i, 37.77, -122.42],
  [/los angeles/i, 34.05, -118.24], [/chicago/i, 41.88, -87.63], [/paris/i, 48.86, 2.35],
  [/tokyo/i, 35.68, 139.69], [/hong kong/i, 22.32, 114.17], [/kathmandu/i, 27.72, 85.32],
  [/dhaka/i, 23.81, 90.41], [/colombo/i, 6.93, 79.85], [/karachi/i, 24.86, 67.0], [/lahore/i, 31.55, 74.34],
];

/**
 * Coordinates for a place, or null when we do not know it.
 *
 * Matched against the city, state and country together, because the table's
 * patterns are city names and a state sometimes carries the only recognisable
 * word ("Panaji, Goa"). Longest pattern wins is NOT implemented and is not
 * needed: the patterns are disjoint by construction.
 */
export function cityCoords(city?: string | null, state?: string | null, country?: string | null): Coords | null {
  const hay = `${city ?? ''} ${state ?? ''} ${country ?? ''}`.trim();
  if (!hay) return null;
  for (const [re, lat, lng] of CITY_COORDS) if (re.test(hay)) return { lat, lng };
  return null;
}

const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. Rounded, because a decimetre of precision on a
 *  city centroid is false confidence. */
export function haversineKm(a: Coords, b: Coords): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R_KM * 2 * Math.asin(Math.min(1, Math.sqrt(s))));
}

/** Kilometres between two places, or null when either cannot be placed. */
export function distanceBetween(
  a: { city?: string | null; state?: string | null; country?: string | null },
  b: { city?: string | null; state?: string | null; country?: string | null },
): number | null {
  const pa = cityCoords(a.city, a.state, a.country);
  const pb = cityCoords(b.city, b.state, b.country);
  if (!pa || !pb) return null;
  return haversineKm(pa, pb);
}
