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
 *
 * WHAT CHANGED WHEN THE CITY WENT GLOBAL (26 Aug).
 *
 * The table used to be searched as one flat list of regexes against
 * `city + state + country` with no word boundaries and no country gate. Its own
 * comment said the patterns were "disjoint by construction". They are disjoint
 * over India. Over the world they are not, and the 1M stress test found what
 * that costs:
 *
 *   Fargo, North Dakota, USA   → Kota, Rajasthan   (the substring "kota")
 *   Jerusalem, Israel          → Salem, Tamil Nadu (the substring "salem")
 *   Salem, Oregon, USA         → Salem, Tamil Nadu
 *   London, Ontario, Canada    → London, UK
 *   Kōchi, Japan               → Kochi, Kerala
 *   Hyderabad, Sindh, Pakistan → Hyderabad, Telangana
 *
 * A user in Fargo was told they were "In your city" with people in Kota. Two
 * changes fix the whole class:
 *
 *  · every pattern is matched on WORD BOUNDARIES, so "Dakota" no longer contains
 *    Kota and "Jerusalem" no longer contains Salem;
 *  · the country is resolved FIRST, and only that country's cities are searched.
 *    An unresolvable country searches the India table alone and then gives up —
 *    the same refusal to guess this file was written around.
 *
 * `CITY_COORDS` keeps its shape and its contents because `astro-engine.ts`
 * iterates it directly for birth-place geocoding, where a rough longitude beats
 * nothing. The world table is separate and country-gated.
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
 * Which country a profile is in, as a stable key.
 *
 * Matched against the country field first and the state second, because a
 * citizen who typed "London, England" and left the country blank has still told
 * us. Anything unrecognised is `null` and is treated as "we do not know", never
 * as India.
 */
/**
 * [full name pattern, two-letter code pattern, key].
 *
 * The codes are tested against the COUNTRY field only, never against the state.
 * India's own state codes collide with country codes on eight letters — CH is
 * Chandigarh and Switzerland, BR is Bihar and Brazil, AR is Arunachal Pradesh
 * and Argentina — so reading a state code as a country would move a citizen in
 * Patna to São Paulo. Full names are safe on both fields, which is what lets
 * "London, England" resolve with the country box left empty.
 */
const COUNTRY_PATTERNS: Array<[RegExp, RegExp | null, string]> = [
  [/\b(india|bharat)\b/i, /^\s*in\s*$/i, 'IN'],
  [/\b(united states|u\.?s\.?a\.?|america)\b/i, /^\s*us\s*$/i, 'US'],
  [/\b(united kingdom|great britain|britain|england|scotland|wales|northern ireland)\b/i, /^\s*(uk|gb)\s*$/i, 'GB'],
  [/\bcanada\b/i, /^\s*ca\s*$/i, 'CA'],
  [/\baustralia\b/i, /^\s*au\s*$/i, 'AU'],
  [/\bnew zealand\b/i, /^\s*nz\s*$/i, 'NZ'],
  [/\b(united arab emirates|uae)\b/i, /^\s*ae\s*$/i, 'AE'],
  [/\b(saudi arabia|ksa)\b/i, /^\s*sa\s*$/i, 'SA'],
  [/\bqatar\b/i, /^\s*qa\s*$/i, 'QA'],
  [/\bkuwait\b/i, /^\s*kw\s*$/i, 'KW'],
  [/\boman\b/i, /^\s*om\s*$/i, 'OM'],
  [/\bbahrain\b/i, /^\s*bh\s*$/i, 'BH'],
  [/\bisrael\b/i, /^\s*il\s*$/i, 'IL'],
  [/\b(t(ü|u)rkiye|turkey)\b/i, /^\s*tr\s*$/i, 'TR'],
  [/\begypt\b/i, /^\s*eg\s*$/i, 'EG'],
  [/\bsingapore\b/i, /^\s*sg\s*$/i, 'SG'],
  [/\bmalaysia\b/i, /^\s*my\s*$/i, 'MY'],
  [/\bindonesia\b/i, /^\s*id\s*$/i, 'ID'],
  [/\bphilippines\b/i, /^\s*ph\s*$/i, 'PH'],
  [/\bthailand\b/i, /^\s*th\s*$/i, 'TH'],
  [/\bviet\s?nam\b/i, /^\s*vn\s*$/i, 'VN'],
  [/\bjapan\b/i, /^\s*jp\s*$/i, 'JP'],
  [/\b(south korea|korea)\b/i, /^\s*kr\s*$/i, 'KR'],
  [/\bchina\b/i, /^\s*cn\s*$/i, 'CN'],
  [/\bhong kong\b/i, /^\s*hk\s*$/i, 'HK'],
  [/\btaiwan\b/i, /^\s*tw\s*$/i, 'TW'],
  [/\b(germany|deutschland)\b/i, /^\s*de\s*$/i, 'DE'],
  [/\bfrance\b/i, /^\s*fr\s*$/i, 'FR'],
  [/\b(spain|espa(ñ|n)a)\b/i, /^\s*es\s*$/i, 'ES'],
  [/\b(italy|italia)\b/i, /^\s*it\s*$/i, 'IT'],
  [/\b(netherlands|holland)\b/i, /^\s*nl\s*$/i, 'NL'],
  [/\bbelgium\b/i, /^\s*be\s*$/i, 'BE'],
  [/\bpoland\b/i, /^\s*pl\s*$/i, 'PL'],
  [/\bportugal\b/i, /^\s*pt\s*$/i, 'PT'],
  [/\bsweden\b/i, /^\s*se\s*$/i, 'SE'],
  [/\bnorway\b/i, /^\s*no\s*$/i, 'NO'],
  [/\bdenmark\b/i, /^\s*dk\s*$/i, 'DK'],
  [/\bfinland\b/i, /^\s*fi\s*$/i, 'FI'],
  [/\bireland\b/i, /^\s*ie\s*$/i, 'IE'],
  [/\bswitzerland\b/i, /^\s*ch\s*$/i, 'CH'],
  [/\baustria\b/i, /^\s*at\s*$/i, 'AT'],
  [/\bgreece\b/i, /^\s*gr\s*$/i, 'GR'],
  [/\bromania\b/i, /^\s*ro\s*$/i, 'RO'],
  [/\b(czechia|czech republic)\b/i, /^\s*cz\s*$/i, 'CZ'],
  [/\bhungary\b/i, /^\s*hu\s*$/i, 'HU'],
  [/\b(brazil|brasil)\b/i, /^\s*br\s*$/i, 'BR'],
  [/\b(mexico|m(é|e)xico)\b/i, /^\s*mx\s*$/i, 'MX'],
  [/\bargentina\b/i, /^\s*ar\s*$/i, 'AR'],
  [/\bcolombia\b/i, /^\s*co\s*$/i, 'CO'],
  [/\bchile\b/i, /^\s*cl\s*$/i, 'CL'],
  [/\bperu\b/i, /^\s*pe\s*$/i, 'PE'],
  [/\bnigeria\b/i, /^\s*ng\s*$/i, 'NG'],
  [/\bkenya\b/i, /^\s*ke\s*$/i, 'KE'],
  [/\bsouth africa\b/i, /^\s*za\s*$/i, 'ZA'],
  [/\bghana\b/i, /^\s*gh\s*$/i, 'GH'],
  [/\bethiopia\b/i, /^\s*et\s*$/i, 'ET'],
  [/\buganda\b/i, /^\s*ug\s*$/i, 'UG'],
  [/\bmorocco\b/i, /^\s*ma\s*$/i, 'MA'],
  [/\btanzania\b/i, /^\s*tz\s*$/i, 'TZ'],
  [/\bpakistan\b/i, /^\s*pk\s*$/i, 'PK'],
  [/\bbangladesh\b/i, /^\s*bd\s*$/i, 'BD'],
  [/\bsri lanka\b/i, /^\s*lk\s*$/i, 'LK'],
  [/\bnepal\b/i, /^\s*np\s*$/i, 'NP'],
];

/**
 * Which country a profile is in, as a stable key, or null when we cannot tell.
 *
 * `null` is never treated as India by anything downstream — it means the India
 * table is searched and then the answer is "unknown", which is what this file
 * has always done rather than guess.
 */
export function countryKey(country?: string | null, state?: string | null): string | null {
  const c = (country ?? '').trim(), st = (state ?? '').trim();
  if (c) for (const [long, code, key] of COUNTRY_PATTERNS) if (long.test(c) || (code && code.test(c))) return key;
  if (st) for (const [long, , key] of COUNTRY_PATTERNS) if (long.test(st)) return key;
  return null;
}

/** [city pattern, lat, lng, country key] — searched only within a resolved country. */
export const WORLD_COORDS: Array<[RegExp, number, number, string]> = [
  // United States
  [/new york|nyc|brooklyn|manhattan/i, 40.71, -74.01, 'US'], [/los angeles/i, 34.05, -118.24, 'US'],
  [/chicago/i, 41.88, -87.63, 'US'], [/houston/i, 29.76, -95.37, 'US'], [/phoenix/i, 33.45, -112.07, 'US'],
  [/philadelphia/i, 39.95, -75.17, 'US'], [/san antonio/i, 29.42, -98.49, 'US'], [/san diego/i, 32.72, -117.16, 'US'],
  [/dallas/i, 32.78, -96.80, 'US'], [/austin/i, 30.27, -97.74, 'US'], [/san jose/i, 37.34, -121.89, 'US'],
  [/san francisco/i, 37.77, -122.42, 'US'], [/seattle/i, 47.61, -122.33, 'US'], [/denver/i, 39.74, -104.99, 'US'],
  [/boston/i, 42.36, -71.06, 'US'], [/atlanta/i, 33.75, -84.39, 'US'], [/miami/i, 25.76, -80.19, 'US'],
  [/washington|dc\b/i, 38.91, -77.04, 'US'], [/portland/i, 45.52, -122.68, 'US'], [/minneapolis/i, 44.98, -93.27, 'US'],
  [/nashville/i, 36.16, -86.78, 'US'], [/detroit/i, 42.33, -83.05, 'US'], [/las vegas/i, 36.17, -115.14, 'US'],
  [/charlotte/i, 35.23, -80.84, 'US'], [/raleigh/i, 35.78, -78.64, 'US'], [/pittsburgh/i, 40.44, -79.996, 'US'],
  [/salt lake city/i, 40.76, -111.89, 'US'], [/kansas city/i, 39.10, -94.58, 'US'], [/st\.? louis/i, 38.63, -90.20, 'US'],
  [/columbus/i, 39.96, -83.00, 'US'], [/indianapolis/i, 39.77, -86.16, 'US'], [/milwaukee/i, 43.04, -87.91, 'US'],
  [/new orleans/i, 29.95, -90.07, 'US'], [/orlando/i, 28.54, -81.38, 'US'], [/tampa/i, 27.95, -82.46, 'US'],
  [/sacramento/i, 38.58, -121.49, 'US'], [/albuquerque/i, 35.08, -106.65, 'US'], [/boise/i, 43.62, -116.20, 'US'],
  [/fargo/i, 46.88, -96.79, 'US'], [/salem/i, 44.94, -123.04, 'US'], [/springfield/i, 39.78, -89.65, 'US'],
  [/missoula/i, 46.87, -113.99, 'US'], [/bozeman/i, 45.68, -111.04, 'US'], [/anchorage/i, 61.22, -149.90, 'US'],
  [/honolulu/i, 21.31, -157.86, 'US'], [/buffalo/i, 42.89, -78.88, 'US'], [/richmond/i, 37.54, -77.44, 'US'],
  // Canada
  [/toronto/i, 43.65, -79.38, 'CA'], [/vancouver/i, 49.28, -123.12, 'CA'], [/montreal|montréal/i, 45.50, -73.57, 'CA'],
  [/calgary/i, 51.05, -114.07, 'CA'], [/ottawa/i, 45.42, -75.70, 'CA'], [/edmonton/i, 53.55, -113.49, 'CA'],
  [/winnipeg/i, 49.90, -97.14, 'CA'], [/quebec|québec/i, 46.81, -71.21, 'CA'], [/hamilton/i, 43.26, -79.87, 'CA'],
  [/london/i, 42.98, -81.25, 'CA'], [/halifax/i, 44.65, -63.58, 'CA'], [/victoria/i, 48.43, -123.37, 'CA'],
  [/saskatoon/i, 52.13, -106.67, 'CA'], [/thunder bay/i, 48.38, -89.25, 'CA'],
  // United Kingdom & Ireland
  [/london/i, 51.51, -0.13, 'GB'], [/manchester/i, 53.48, -2.24, 'GB'], [/birmingham/i, 52.49, -1.89, 'GB'],
  [/glasgow/i, 55.86, -4.25, 'GB'], [/leeds/i, 53.80, -1.55, 'GB'], [/liverpool/i, 53.41, -2.98, 'GB'],
  [/bristol/i, 51.45, -2.59, 'GB'], [/edinburgh/i, 55.95, -3.19, 'GB'], [/sheffield/i, 53.38, -1.47, 'GB'],
  [/cardiff/i, 51.48, -3.18, 'GB'], [/belfast/i, 54.60, -5.93, 'GB'], [/newcastle/i, 54.98, -1.61, 'GB'],
  [/nottingham/i, 52.95, -1.15, 'GB'], [/cambridge/i, 52.21, 0.12, 'GB'], [/oxford/i, 51.75, -1.26, 'GB'],
  [/brighton/i, 50.82, -0.14, 'GB'], [/norwich/i, 52.63, 1.30, 'GB'], [/inverness/i, 57.48, -4.22, 'GB'],
  [/dublin/i, 53.35, -6.26, 'IE'], [/cork/i, 51.90, -8.47, 'IE'], [/galway/i, 53.27, -9.05, 'IE'],
  // Europe
  [/paris/i, 48.86, 2.35, 'FR'], [/lyon/i, 45.76, 4.84, 'FR'], [/marseille/i, 43.30, 5.37, 'FR'],
  [/toulouse/i, 43.60, 1.44, 'FR'], [/bordeaux/i, 44.84, -0.58, 'FR'], [/nice/i, 43.70, 7.27, 'FR'],
  [/berlin/i, 52.52, 13.40, 'DE'], [/munich|münchen/i, 48.14, 11.58, 'DE'], [/hamburg/i, 53.55, 9.99, 'DE'],
  [/frankfurt/i, 50.11, 8.68, 'DE'], [/cologne|köln/i, 50.94, 6.96, 'DE'], [/stuttgart/i, 48.78, 9.18, 'DE'],
  [/madrid/i, 40.42, -3.70, 'ES'], [/barcelona/i, 41.39, 2.17, 'ES'], [/valencia/i, 39.47, -0.38, 'ES'],
  [/seville|sevilla/i, 37.39, -5.98, 'ES'], [/bilbao/i, 43.26, -2.93, 'ES'],
  [/rome|roma/i, 41.90, 12.50, 'IT'], [/milan|milano/i, 45.46, 9.19, 'IT'], [/naples|napoli/i, 40.85, 14.27, 'IT'],
  [/turin|torino/i, 45.07, 7.69, 'IT'], [/florence|firenze/i, 43.77, 11.26, 'IT'],
  [/amsterdam/i, 52.37, 4.90, 'NL'], [/rotterdam/i, 51.92, 4.48, 'NL'], [/utrecht/i, 52.09, 5.12, 'NL'],
  [/brussels|bruxelles/i, 50.85, 4.35, 'BE'], [/antwerp/i, 51.22, 4.40, 'BE'],
  [/warsaw|warszawa/i, 52.23, 21.01, 'PL'], [/krakow|kraków/i, 50.06, 19.94, 'PL'], [/lublin/i, 51.25, 22.57, 'PL'],
  [/lisbon|lisboa/i, 38.72, -9.14, 'PT'], [/porto/i, 41.15, -8.61, 'PT'],
  [/stockholm/i, 59.33, 18.07, 'SE'], [/gothenburg|göteborg/i, 57.71, 11.97, 'SE'],
  [/oslo/i, 59.91, 10.75, 'NO'], [/trondheim/i, 63.43, 10.40, 'NO'], [/bergen/i, 60.39, 5.32, 'NO'],
  [/copenhagen|københavn/i, 55.68, 12.57, 'DK'], [/aarhus/i, 56.16, 10.20, 'DK'],
  [/helsinki/i, 60.17, 24.94, 'FI'], [/zurich|zürich/i, 47.38, 8.54, 'CH'], [/geneva|genève/i, 46.20, 6.14, 'CH'],
  [/vienna|wien/i, 48.21, 16.37, 'AT'], [/athens|athina/i, 37.98, 23.73, 'GR'], [/thessaloniki/i, 40.64, 22.94, 'GR'],
  [/kalamata/i, 37.04, 22.11, 'GR'], [/bucharest|bucuresti|bucurești/i, 44.43, 26.10, 'RO'],
  [/prague|praha/i, 50.08, 14.44, 'CZ'], [/budapest/i, 47.50, 19.04, 'HU'],
  // Middle East
  [/dubai/i, 25.20, 55.27, 'AE'], [/abu dhabi/i, 24.45, 54.38, 'AE'], [/sharjah/i, 25.35, 55.39, 'AE'],
  [/riyadh/i, 24.71, 46.68, 'SA'], [/jeddah/i, 21.49, 39.19, 'SA'], [/dammam/i, 26.43, 50.10, 'SA'],
  [/doha/i, 25.29, 51.53, 'QA'], [/kuwait/i, 29.38, 47.99, 'KW'], [/muscat/i, 23.59, 58.41, 'OM'],
  [/manama/i, 26.23, 50.59, 'BH'], [/tel aviv/i, 32.09, 34.78, 'IL'], [/jerusalem/i, 31.77, 35.21, 'IL'],
  [/haifa/i, 32.79, 34.99, 'IL'], [/istanbul/i, 41.01, 28.98, 'TR'], [/ankara/i, 39.93, 32.86, 'TR'],
  [/izmir/i, 38.42, 27.14, 'TR'], [/cairo/i, 30.04, 31.24, 'EG'], [/alexandria/i, 31.20, 29.92, 'EG'],
  // South & Southeast Asia (outside India)
  [/karachi/i, 24.86, 67.00, 'PK'], [/lahore/i, 31.55, 74.34, 'PK'], [/islamabad/i, 33.68, 73.05, 'PK'],
  [/hyderabad/i, 25.40, 68.37, 'PK'], [/dhaka/i, 23.81, 90.41, 'BD'], [/chittagong/i, 22.36, 91.78, 'BD'],
  [/colombo/i, 6.93, 79.85, 'LK'], [/kathmandu/i, 27.72, 85.32, 'NP'],
  [/singapore/i, 1.35, 103.82, 'SG'], [/kuala lumpur/i, 3.14, 101.69, 'MY'], [/penang|george town/i, 5.41, 100.34, 'MY'],
  [/jakarta/i, -6.21, 106.85, 'ID'], [/surabaya/i, -7.25, 112.75, 'ID'], [/bandung/i, -6.92, 107.61, 'ID'],
  [/bali|denpasar/i, -8.65, 115.22, 'ID'], [/manila/i, 14.60, 120.98, 'PH'], [/cebu/i, 10.32, 123.89, 'PH'],
  [/davao/i, 7.19, 125.46, 'PH'], [/bangkok/i, 13.76, 100.50, 'TH'], [/chiang mai/i, 18.79, 98.99, 'TH'],
  [/phuket/i, 7.88, 98.39, 'TH'], [/ho chi minh|saigon/i, 10.82, 106.63, 'VN'], [/hanoi/i, 21.03, 105.85, 'VN'],
  [/da nang/i, 16.05, 108.20, 'VN'],
  // East Asia
  [/tokyo/i, 35.68, 139.69, 'JP'], [/osaka/i, 34.69, 135.50, 'JP'], [/kyoto/i, 35.01, 135.77, 'JP'],
  [/yokohama/i, 35.44, 139.64, 'JP'], [/nagoya/i, 35.18, 136.91, 'JP'], [/fukuoka/i, 33.59, 130.40, 'JP'],
  [/sapporo/i, 43.06, 141.35, 'JP'], [/kochi|kōchi/i, 33.56, 133.53, 'JP'],
  [/seoul/i, 37.57, 126.98, 'KR'], [/busan/i, 35.18, 129.08, 'KR'], [/incheon/i, 37.46, 126.71, 'KR'],
  [/shanghai/i, 31.23, 121.47, 'CN'], [/beijing/i, 39.90, 116.41, 'CN'], [/shenzhen/i, 22.54, 114.06, 'CN'],
  [/guangzhou/i, 23.13, 113.26, 'CN'], [/chengdu/i, 30.57, 104.07, 'CN'], [/hangzhou/i, 30.27, 120.15, 'CN'],
  [/hong kong|kowloon/i, 22.32, 114.17, 'HK'], [/taipei/i, 25.03, 121.57, 'TW'], [/kaohsiung/i, 22.63, 120.30, 'TW'],
  // Oceania
  [/sydney/i, -33.87, 151.21, 'AU'], [/melbourne/i, -37.81, 144.96, 'AU'], [/brisbane/i, -27.47, 153.03, 'AU'],
  [/perth/i, -31.95, 115.86, 'AU'], [/adelaide/i, -34.93, 138.60, 'AU'], [/canberra/i, -35.28, 149.13, 'AU'],
  [/gold coast/i, -28.02, 153.40, 'AU'], [/hobart/i, -42.88, 147.33, 'AU'], [/alice springs/i, -23.70, 133.88, 'AU'],
  [/darwin/i, -12.46, 130.85, 'AU'], [/auckland/i, -36.85, 174.76, 'NZ'], [/wellington/i, -41.29, 174.78, 'NZ'],
  [/christchurch/i, -43.53, 172.64, 'NZ'],
  // Latin America
  [/sao paulo|são paulo/i, -23.55, -46.63, 'BR'], [/rio de janeiro/i, -22.91, -43.17, 'BR'],
  [/brasilia|brasília/i, -15.79, -47.88, 'BR'], [/belo horizonte/i, -19.92, -43.94, 'BR'],
  [/porto alegre/i, -30.03, -51.23, 'BR'], [/recife/i, -8.05, -34.88, 'BR'], [/curitiba/i, -25.43, -49.27, 'BR'],
  [/mexico city|ciudad de mexico|cdmx/i, 19.43, -99.13, 'MX'], [/guadalajara/i, 20.67, -103.35, 'MX'],
  [/monterrey/i, 25.69, -100.32, 'MX'], [/cancun|cancún/i, 21.16, -86.85, 'MX'],
  [/buenos aires/i, -34.60, -58.38, 'AR'], [/cordoba|córdoba/i, -31.42, -64.18, 'AR'], [/rosario/i, -32.95, -60.64, 'AR'],
  [/bogota|bogotá/i, 4.71, -74.07, 'CO'], [/medellin|medellín/i, 6.24, -75.58, 'CO'], [/cali/i, 3.45, -76.53, 'CO'],
  [/santiago/i, -33.45, -70.67, 'CL'], [/lima/i, -12.05, -77.04, 'PE'],
  // Africa
  [/lagos/i, 6.52, 3.38, 'NG'], [/abuja/i, 9.06, 7.49, 'NG'], [/port harcourt/i, 4.82, 7.05, 'NG'],
  [/nairobi/i, -1.29, 36.82, 'KE'], [/mombasa/i, -4.04, 39.67, 'KE'], [/kisumu/i, -0.09, 34.77, 'KE'],
  [/johannesburg/i, -26.20, 28.05, 'ZA'], [/cape town/i, -33.92, 18.42, 'ZA'], [/durban/i, -29.86, 31.02, 'ZA'],
  [/pretoria/i, -25.75, 28.19, 'ZA'], [/accra/i, 5.60, -0.19, 'GH'], [/kumasi/i, 6.69, -1.62, 'GH'],
  [/addis ababa/i, 9.03, 38.74, 'ET'], [/kampala/i, 0.35, 32.58, 'UG'], [/dar es salaam/i, -6.79, 39.21, 'TZ'],
  [/casablanca/i, 33.57, -7.59, 'MA'], [/rabat/i, 34.02, -6.84, 'MA'], [/marrakech|marrakesh/i, 31.63, -8.01, 'MA'],
];

/** A pattern that must match a whole word — "Dakota" no longer contains "Kota". */
const anchored = new WeakMap<RegExp, RegExp>();
function whole(re: RegExp): RegExp {
  let a = anchored.get(re);
  if (!a) { a = new RegExp(`\\b(?:${re.source})\\b`, 'i'); anchored.set(re, a); }
  return a;
}

/**
 * Coordinates for a place, or null when we do not know it.
 *
 * Matched against the city, state and country together, because the table's
 * patterns are city names and a state sometimes carries the only recognisable
 * word ("Panaji, Goa"). Longest pattern wins is NOT implemented and is not
 * needed: the patterns are disjoint by construction.
 */
export function cityCoords(city?: string | null, state?: string | null, country?: string | null): Coords | null {
  const place = `${city ?? ''} ${state ?? ''}`.trim();
  if (!place) return null;
  const key = countryKey(country, state);

  // A resolved country outside India searches that country's cities and nothing
  // else. No fall-through to the India table: a name we cannot place inside the
  // country somebody told us they live in is unknown, not Rajasthan.
  if (key && key !== 'IN') {
    for (const [re, lat, lng, k] of WORLD_COORDS) if (k === key && whole(re).test(place)) return { lat, lng };
    return null;
  }

  // India, or a country we could not read. The India table is searched exactly
  // as before, minus the substring matches word boundaries now remove.
  for (const [re, lat, lng] of CITY_COORDS) if (whole(re).test(place)) return { lat, lng };
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
