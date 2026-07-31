import { CITY_COORDS } from '../shared/geo';
/**
 * Astrology engine — deterministic, dependency-free planetary mathematics.
 *
 * Positions use Paul Schlyter's low-precision orbital elements ("How to
 * compute planetary positions"), accurate to well under a degree for the Sun
 * and 1–2° for the Moon and planets — more than enough to place bodies in
 * their zodiac signs, detect retrogrades, aspects, lunations and ingresses.
 * Everything downstream (daily/monthly horoscopes, best/caution dates, the
 * astrologer's answers) derives from THESE real positions, so readings are
 * genuinely chart-based rather than random text.
 */

export const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
] as const;
export type SignName = typeof SIGNS[number];

export type PlanetName = 'Sun' | 'Moon' | 'Mercury' | 'Venus' | 'Mars' | 'Jupiter' | 'Saturn';
export const PLANETS: PlanetName[] = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
export const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** Julian Day from a UTC date (astronomical, valid for modern dates). */
export function julianDay(utc: Date): number {
  return utc.getTime() / 86400000 + 2440587.5;
}

/** Schlyter's day number d relative to 2000-01-00.0 TDT. */
const dayNumber = (jd: number) => jd - 2451543.5;

/** Solve Kepler's equation (eccentric anomaly, degrees). */
function eccentricAnomaly(M: number, e: number): number {
  let E = M + deg(e) * Math.sin(rad(M)) * (1 + e * Math.cos(rad(M)));
  for (let i = 0; i < 6; i++) {
    const dE = (E - deg(e) * Math.sin(rad(E)) - M) / (1 - e * Math.cos(rad(E)));
    E -= dE;
    if (Math.abs(dE) < 1e-6) break;
  }
  return E;
}

interface Elements { N: number; i: number; w: number; a: number; e: number; M: number }

function elements(planet: Exclude<PlanetName, 'Sun' | 'Moon'>, d: number): Elements {
  switch (planet) {
    case 'Mercury': return {
      N: 48.3313 + 3.24587e-5 * d, i: 7.0047 + 5.0e-8 * d, w: 29.1241 + 1.01444e-5 * d,
      a: 0.387098, e: 0.205635 + 5.59e-10 * d, M: norm360(168.6562 + 4.0923344368 * d),
    };
    case 'Venus': return {
      N: 76.6799 + 2.4659e-5 * d, i: 3.3946 + 2.75e-8 * d, w: 54.891 + 1.38374e-5 * d,
      a: 0.72333, e: 0.006773 - 1.302e-9 * d, M: norm360(48.0052 + 1.6021302244 * d),
    };
    case 'Mars': return {
      N: 49.5574 + 2.11081e-5 * d, i: 1.8497 - 1.78e-8 * d, w: 286.5016 + 2.92961e-5 * d,
      a: 1.523688, e: 0.093405 + 2.516e-9 * d, M: norm360(18.6021 + 0.5240207766 * d),
    };
    case 'Jupiter': return {
      N: 100.4542 + 2.76854e-5 * d, i: 1.303 - 1.557e-7 * d, w: 273.8777 + 1.64505e-5 * d,
      a: 5.20256, e: 0.048498 + 4.469e-9 * d, M: norm360(19.895 + 0.0830853001 * d),
    };
    case 'Saturn': return {
      N: 113.6634 + 2.3898e-5 * d, i: 2.4886 - 1.081e-7 * d, w: 339.3939 + 2.97661e-5 * d,
      a: 9.55475, e: 0.055546 - 9.499e-9 * d, M: norm360(316.967 + 0.0334442282 * d),
    };
  }
}

/** Sun's geocentric ecliptic longitude (degrees). */
export function sunLongitude(jd: number): number {
  const d = dayNumber(jd);
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const M = norm360(356.047 + 0.9856002585 * d);
  const E = eccentricAnomaly(M, e);
  const x = Math.cos(rad(E)) - e;
  const y = Math.sin(rad(E)) * Math.sqrt(1 - e * e);
  const v = deg(Math.atan2(y, x));
  return norm360(v + w);
}

/** Moon's geocentric ecliptic longitude with the main perturbation terms. */
export function moonLongitude(jd: number): number {
  const d = dayNumber(jd);
  const N = 125.1228 - 0.0529538083 * d;
  const w = 318.0634 + 0.1643573223 * d;
  const e = 0.0549;
  const M = norm360(115.3654 + 13.0649929509 * d);
  const E = eccentricAnomaly(M, e);
  const x = 60.2666 * (Math.cos(rad(E)) - e);
  const y = 60.2666 * Math.sqrt(1 - e * e) * Math.sin(rad(E));
  const v = deg(Math.atan2(y, x));
  let lon = norm360(v + w + N);
  // Perturbations (main longitude terms)
  const Ms = norm360(356.047 + 0.9856002585 * d);       // sun mean anomaly
  const Ls = norm360(Ms + 282.9404 + 4.70935e-5 * d);   // sun mean longitude
  const Lm = norm360(N + w + M);                        // moon mean longitude
  const D = norm360(Lm - Ls);                           // elongation
  const F = norm360(Lm - N);                            // argument of latitude
  lon += -1.274 * Math.sin(rad(M - 2 * D))
    + 0.658 * Math.sin(rad(2 * D))
    - 0.186 * Math.sin(rad(Ms))
    - 0.059 * Math.sin(rad(2 * M - 2 * D))
    - 0.057 * Math.sin(rad(M - 2 * D + Ms))
    + 0.053 * Math.sin(rad(M + 2 * D))
    - 0.035 * Math.sin(rad(D))
    - 0.031 * Math.sin(rad(M + Ms))
    + 0.011 * Math.sin(rad(2 * F));
  return norm360(lon);
}

/** A planet's geocentric ecliptic longitude (degrees). */
export function planetLongitude(planet: Exclude<PlanetName, 'Sun' | 'Moon'>, jd: number): number {
  const d = dayNumber(jd);
  const el = elements(planet, d);
  const E = eccentricAnomaly(el.M, el.e);
  const xv = el.a * (Math.cos(rad(E)) - el.e);
  const yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(rad(E));
  const v = deg(Math.atan2(yv, xv));
  const r = Math.sqrt(xv * xv + yv * yv);
  // heliocentric ecliptic rectangular
  const xh = r * (Math.cos(rad(el.N)) * Math.cos(rad(v + el.w)) - Math.sin(rad(el.N)) * Math.sin(rad(v + el.w)) * Math.cos(rad(el.i)));
  const yh = r * (Math.sin(rad(el.N)) * Math.cos(rad(v + el.w)) + Math.cos(rad(el.N)) * Math.sin(rad(v + el.w)) * Math.cos(rad(el.i)));
  // sun's rectangular position (to convert heliocentric → geocentric)
  const ws = 282.9404 + 4.70935e-5 * d;
  const es = 0.016709 - 1.151e-9 * d;
  const Msun = norm360(356.047 + 0.9856002585 * d);
  const Es = eccentricAnomaly(Msun, es);
  const xs0 = Math.cos(rad(Es)) - es;
  const ys0 = Math.sin(rad(Es)) * Math.sqrt(1 - es * es);
  const vs = deg(Math.atan2(ys0, xs0));
  const rs = Math.sqrt(xs0 * xs0 + ys0 * ys0);
  const lonsun = norm360(vs + ws);
  const xsun = rs * Math.cos(rad(lonsun));
  const ysun = rs * Math.sin(rad(lonsun));
  return norm360(deg(Math.atan2(yh + ysun, xh + xsun)));
}

export function bodyLongitude(planet: PlanetName, jd: number): number {
  if (planet === 'Sun') return sunLongitude(jd);
  if (planet === 'Moon') return moonLongitude(jd);
  return planetLongitude(planet, jd);
}

// ───────────────────────── Vedic (sidereal) zodiac ─────────────────────────
// The Astrology Zone uses authentic Vedic astrology (Jyotish): every sign
// placement is SIDEREAL, computed by subtracting the Lahiri ayanamsa from the
// tropical longitude. Aspects, phases and retrogrades are angle differences,
// so they are identical in both zodiacs — only sign boundaries shift.

/** Lahiri (Chitrapaksha) ayanamsa in degrees — standard for Jyotish. */
export function ayanamsaDeg(jd: number): number {
  return 23.85675 + (50.2888 / 3600) * ((jd - 2451545.0) / 365.25);
}
/** Tropical → sidereal longitude at a given instant. */
export const siderealLon = (tropical: number, jd: number) => norm360(tropical - ayanamsaDeg(jd));

export const signIndex = (lon: number) => Math.floor(norm360(lon) / 30) % 12;
export const signOf = (lon: number): SignName => SIGNS[signIndex(lon)];
export const degreeInSign = (lon: number) => Math.round(norm360(lon) % 30);

/** Is a planet retrograde (geocentric longitude decreasing) at jd? */
export function isRetrograde(planet: PlanetName, jd: number): boolean {
  if (planet === 'Sun' || planet === 'Moon') return false;
  const a = bodyLongitude(planet, jd);
  const b = bodyLongitude(planet, jd + 1);
  let diff = b - a;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return diff < 0;
}

export interface BodyPosition { planet: PlanetName; lon: number; sign: SignName; degree: number; retrograde: boolean }

/** All bodies at jd — SIDEREAL longitudes (Vedic sign placements). */
export function positionsAt(jd: number): BodyPosition[] {
  return PLANETS.map((p) => {
    const lon = siderealLon(bodyLongitude(p, jd), jd);
    return { planet: p, lon, sign: signOf(lon), degree: degreeInSign(lon), retrograde: isRetrograde(p, jd) };
  });
}

// ───────────────────────── Ascendant ─────────────────────────

/** Greenwich mean sidereal time in degrees. */
function gmstDeg(jd: number): number {
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0));
}

/** Rising sign (ascendant) longitude for a birth moment + place. */
export function ascendantLongitude(jd: number, latDeg: number, lngDegEast: number): number {
  const d = dayNumber(jd);
  const eps = rad(23.4393 - 3.563e-7 * d);
  const ramc = rad(norm360(gmstDeg(jd) + lngDegEast));
  const lat = rad(Math.max(-66, Math.min(66, latDeg))); // clamp: formula degenerates at poles
  const asc = Math.atan2(Math.cos(ramc), -(Math.sin(ramc) * Math.cos(eps) + Math.tan(lat) * Math.sin(eps)));
  return siderealLon(norm360(deg(asc)), jd); // Vedic lagna (sidereal)
}

// ───────────────────────── Aspects ─────────────────────────

export type AspectType = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition';
const ASPECT_ANGLES: Array<[AspectType, number, number]> = [
  ['conjunction', 0, 6], ['sextile', 60, 4], ['square', 90, 5], ['trine', 120, 5], ['opposition', 180, 6],
];

/** The tightest classical aspect between two longitudes, or null. */
export function aspectBetween(lonA: number, lonB: number): { type: AspectType; orb: number } | null {
  let sep = Math.abs(norm360(lonA) - norm360(lonB));
  if (sep > 180) sep = 360 - sep;
  let best: { type: AspectType; orb: number } | null = null;
  for (const [type, angle, maxOrb] of ASPECT_ANGLES) {
    const orb = Math.abs(sep - angle);
    if (orb <= maxOrb && (!best || orb < best.orb)) best = { type, orb: Math.round(orb * 10) / 10 };
  }
  return best;
}

export const HARMONIOUS: AspectType[] = ['trine', 'sextile'];
export const CHALLENGING: AspectType[] = ['square', 'opposition'];

// ───────────────────────── Moon phase ─────────────────────────

export function moonPhaseAngle(jd: number): number {
  return norm360(moonLongitude(jd) - sunLongitude(jd));
}
export function moonPhaseName(jd: number): string {
  const a = moonPhaseAngle(jd);
  if (a < 22.5 || a >= 337.5) return 'New Moon';
  if (a < 67.5) return 'Waxing Crescent';
  if (a < 112.5) return 'First Quarter';
  if (a < 157.5) return 'Waxing Gibbous';
  if (a < 202.5) return 'Full Moon';
  if (a < 247.5) return 'Waning Gibbous';
  if (a < 292.5) return 'Last Quarter';
  return 'Waning Crescent';
}

// ───────────────────────── Charts ─────────────────────────

export interface NatalChart {
  sun: BodyPosition; moon: BodyPosition; ascendant: { lon: number; sign: SignName } | null;
  planets: BodyPosition[];
}

/** Minutes east of UTC for an IANA zone at a given instant (no dependencies). */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
    const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +(parts.hour === '24' ? 0 : parts.hour), +parts.minute, +parts.second);
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 330; // IST fallback — the app's primary market
  }
}

/** Compute the natal chart from stored birth details. */
export function natalChart(
  birthDate: Date, birthTime: string | null, timeZone: string, lat: number | null, lng: number | null,
): NatalChart {
  const [hh, mm] = (birthTime ?? '12:00').split(':').map((n) => parseInt(n, 10));
  const local = new Date(Date.UTC(
    birthDate.getUTCFullYear(), birthDate.getUTCMonth(), birthDate.getUTCDate(),
    isFinite(hh) ? hh : 12, isFinite(mm) ? mm : 0,
  ));
  // local wall-clock → UTC using the zone offset at that historical moment
  const offset = tzOffsetMinutes(timeZone, local);
  const utc = new Date(local.getTime() - offset * 60000);
  const jd = julianDay(utc);
  const planets = positionsAt(jd);
  const sun = planets.find((p) => p.planet === 'Sun')!;
  const moon = planets.find((p) => p.planet === 'Moon')!;
  const ascendant = birthTime && lat != null && lng != null
    ? (() => { const lon = ascendantLongitude(jd, lat, lng); return { lon, sign: signOf(lon) }; })()
    : null;
  return { sun, moon, ascendant, planets };
}

// ───────────────────────── Month scan ─────────────────────────

export interface MonthEvent { day: number; kind: 'lunation' | 'ingress' | 'retrograde' | 'aspect'; text: string }
export interface MonthAstro {
  year: number; month: number; // month 1-12
  events: MonthEvent[];
  bestDates: number[];
  cautionDates: number[];
  transits: BodyPosition[]; // positions mid-month
}

/** Scan a calendar month against a natal chart: real lunations, ingresses,
 *  retro stations, and the days when benefics/malefics aspect the natal Sun
 *  or Moon — those become the best/caution dates. */
export function scanMonth(chart: NatalChart, year: number, month: number): MonthAstro {
  const daysIn = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const events: MonthEvent[] = [];
  const bestScore = new Map<number, number>();
  const cautionScore = new Map<number, number>();
  let prev: BodyPosition[] | null = null;
  let prevPhase = 0;
  for (let day = 1; day <= daysIn; day++) {
    const jd = julianDay(new Date(Date.UTC(year, month - 1, day, 12)));
    const pos = positionsAt(jd);
    const phase = moonPhaseAngle(jd);
    if (prev) {
      // Lunations: phase angle crossing 0 (new) or 180 (full)
      if (prevPhase > 340 && phase < 20) events.push({ day, kind: 'lunation', text: `New Moon in ${signOf(siderealLon(moonLongitude(jd), jd))}` });
      if (prevPhase < 180 && phase >= 180) events.push({ day, kind: 'lunation', text: `Full Moon in ${signOf(siderealLon(moonLongitude(jd), jd))}` });
      for (const p of pos) {
        const was = prev.find((q) => q.planet === p.planet)!;
        if (p.planet !== 'Moon' && was.sign !== p.sign) {
          events.push({ day, kind: 'ingress', text: `${p.planet} enters ${p.sign}` });
        }
        if (p.planet !== 'Sun' && p.planet !== 'Moon' && was.retrograde !== p.retrograde) {
          events.push({ day, kind: 'retrograde', text: `${p.planet} stations ${p.retrograde ? 'retrograde' : 'direct'} in ${p.sign}` });
        }
      }
    }
    // Score the day against the natal chart
    for (const p of pos) {
      if (p.planet === 'Moon') continue;
      for (const natal of [chart.sun, chart.moon]) {
        const asp = aspectBetween(p.lon, natal.lon);
        if (!asp || asp.orb > 3) continue;
        const benefic = p.planet === 'Venus' || p.planet === 'Jupiter' || (p.planet === 'Sun' && HARMONIOUS.includes(asp.type));
        const malefic = p.planet === 'Mars' || p.planet === 'Saturn';
        if (benefic && (HARMONIOUS.includes(asp.type) || asp.type === 'conjunction')) {
          bestScore.set(day, (bestScore.get(day) ?? 0) + (3 - asp.orb));
        }
        if (malefic && (CHALLENGING.includes(asp.type) || asp.type === 'conjunction')) {
          cautionScore.set(day, (cautionScore.get(day) ?? 0) + (3 - asp.orb));
        }
      }
    }
    prev = pos;
    prevPhase = phase;
  }
  const top = (m: Map<number, number>, n: number) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([d]) => d).sort((a, b) => a - b);
  const midJd = julianDay(new Date(Date.UTC(year, month - 1, Math.min(15, daysIn), 12)));
  return {
    year, month, events,
    bestDates: top(bestScore, 5),
    cautionDates: top(cautionScore, 4),
    transits: positionsAt(midJd),
  };
}

// ───────────────────────── Geocoding (approximate) ─────────────────────────


/** Resolve approximate coordinates from free-text place fields. Falls back to
 *  a longitude implied by the time zone (15°/hour) at a mid-band latitude. */
export function geocodeApprox(city: string, state: string | null, country: string, timeZone: string): { lat: number; lng: number } {
  const hay = `${city} ${state ?? ''} ${country}`;
  for (const [re, lat, lng] of CITY_COORDS) if (re.test(hay)) return { lat, lng };
  const offsetH = tzOffsetMinutes(timeZone, new Date()) / 60;
  const lat = /india|pakistan|bangladesh|nepal|sri lanka/i.test(country) ? 22 : 30;
  return { lat, lng: Math.max(-180, Math.min(180, offsetH * 15)) };
}
