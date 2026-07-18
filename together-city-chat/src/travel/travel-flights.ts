/**
 * Together City — Flight metasearch engine (Skyscanner-style), NO external API.
 * Given a route + date it deterministically SYNTHESISES a realistic set of flights
 * (airlines, times, duration, stops, fares). Same search → same results (seeded RNG),
 * so it behaves like a real comparison engine without any third-party call.
 */

export interface Airport { code: string; city: string; name: string; intl: boolean }
export const AIRPORTS: Airport[] = [
  { code: 'DEL', city: 'Delhi', name: 'Indira Gandhi Intl', intl: false },
  { code: 'BOM', city: 'Mumbai', name: 'Chhatrapati Shivaji', intl: false },
  { code: 'BLR', city: 'Bengaluru', name: 'Kempegowda Intl', intl: false },
  { code: 'MAA', city: 'Chennai', name: 'Chennai Intl', intl: false },
  { code: 'HYD', city: 'Hyderabad', name: 'Rajiv Gandhi Intl', intl: false },
  { code: 'CCU', city: 'Kolkata', name: 'Netaji Subhas', intl: false },
  { code: 'GOI', city: 'Goa', name: 'Dabolim', intl: false },
  { code: 'COK', city: 'Kochi', name: 'Cochin Intl', intl: false },
  { code: 'PNQ', city: 'Pune', name: 'Pune Airport', intl: false },
  { code: 'JAI', city: 'Jaipur', name: 'Jaipur Intl', intl: false },
  { code: 'DXB', city: 'Dubai', name: 'Dubai Intl', intl: true },
  { code: 'SIN', city: 'Singapore', name: 'Changi', intl: true },
  { code: 'LHR', city: 'London', name: 'Heathrow', intl: true },
  { code: 'BKK', city: 'Bangkok', name: 'Suvarnabhumi', intl: true },
  { code: 'DPS', city: 'Bali', name: 'Ngurah Rai', intl: true },
];
const byCode = new Map(AIRPORTS.map((a) => [a.code, a]));

const DOMESTIC_AIRLINES = [
  { code: '6E', name: 'IndiGo', factor: 1.0 }, { code: 'AI', name: 'Air India', factor: 1.08 },
  { code: 'UK', name: 'Vistara', factor: 1.15 }, { code: 'QP', name: 'Akasa Air', factor: 0.98 },
  { code: 'SG', name: 'SpiceJet', factor: 0.95 },
];
const INTL_AIRLINES = [
  { code: 'EK', name: 'Emirates', factor: 1.2 }, { code: 'SQ', name: 'Singapore Airlines', factor: 1.25 },
  { code: 'TG', name: 'Thai Airways', factor: 1.1 }, { code: 'AI', name: 'Air India', factor: 1.0 },
  { code: '6E', name: 'IndiGo', factor: 0.92 },
];

/** Approx one-way non-stop minutes for known pairs; generic fallback otherwise. */
const ROUTE_MIN: Record<string, number> = {
  'DEL-BOM': 130, 'DEL-BLR': 165, 'BOM-BLR': 95, 'DEL-MAA': 165, 'BLR-MAA': 60, 'DEL-CCU': 135,
  'BOM-GOI': 65, 'BLR-GOI': 70, 'DEL-HYD': 135, 'BLR-HYD': 70, 'DEL-JAI': 55, 'BOM-COK': 105, 'BLR-PNQ': 90,
  'BLR-DXB': 240, 'BOM-DXB': 195, 'DEL-DXB': 210, 'BLR-SIN': 270, 'BOM-LHR': 570, 'DEL-LHR': 555,
  'BLR-BKK': 255, 'BLR-DPS': 300, 'BOM-SIN': 320,
};
function routeMinutes(from: string, to: string): number {
  const key = `${from}-${to}`, rev = `${to}-${from}`;
  if (ROUTE_MIN[key]) return ROUTE_MIN[key];
  if (ROUTE_MIN[rev]) return ROUTE_MIN[rev];
  const a = byCode.get(from), b = byCode.get(to);
  const intl = Boolean(a?.intl || b?.intl);
  return intl ? 300 : 110;
}
function baseFare(from: string, to: string): number {
  const a = byCode.get(from), b = byCode.get(to);
  const intl = Boolean(a?.intl || b?.intl);
  const mins = routeMinutes(from, to);
  return Math.round((intl ? 9000 : 2500) + mins * (intl ? 55 : 28));
}

// deterministic seeded RNG (mulberry32)
function seedFrom(str: string): number { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const CABIN_MULT: Record<string, number> = { economy: 1, premium: 1.6, business: 2.8 };
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (mins: number) => `${pad(Math.floor((mins % 1440) / 60))}:${pad(mins % 60)}`;
const durLabel = (mins: number) => `${Math.floor(mins / 60)}h ${pad(mins % 60)}m`;

export interface FlightResult {
  id: string; airlineCode: string; airline: string; flightNo: string;
  from: string; to: string; departTime: string; arriveTime: string;
  durationMins: number; durationLabel: string; stops: number; stopLabel: string; nextDay: boolean;
  cabin: string; priceInr: number; cheapest?: boolean; fastest?: boolean; best?: boolean;
}

export interface SearchInput { from: string; to: string; date: string; pax: number; cabin: string }

/** Synthesise a comparable list of flights for a route + date. Deterministic. */
export function searchFlights(input: SearchInput): { flights: FlightResult[]; from: Airport | null; to: Airport | null } {
  const from = byCode.get(input.from) ?? null;
  const to = byCode.get(input.to) ?? null;
  if (!from || !to || input.from === input.to) return { flights: [], from, to };

  const intl = from.intl || to.intl;
  const airlines = intl ? INTL_AIRLINES : DOMESTIC_AIRLINES;
  const cabin = CABIN_MULT[input.cabin] ? input.cabin : 'economy';
  const rng = mulberry32(seedFrom(`${input.from}-${input.to}-${input.date}-${cabin}`));
  const nonstopMins = routeMinutes(input.from, input.to);
  const base = baseFare(input.from, input.to);

  const n = 6 + Math.floor(rng() * 4); // 6–9 options
  const flights: FlightResult[] = [];
  for (let i = 0; i < n; i++) {
    const al = airlines[Math.floor(rng() * airlines.length)];
    const departMin = 5 * 60 + Math.floor(rng() * (17 * 60)); // 05:00–22:00
    const stops = rng() < (intl ? 0.55 : 0.3) ? 1 : 0;
    const layover = stops ? 45 + Math.floor(rng() * 90) : 0;
    const duration = nonstopMins + layover + Math.floor((rng() - 0.5) * 20);
    const arriveMin = departMin + duration;
    const demand = 0.9 + rng() * 0.5;
    const stopDiscount = stops ? 0.82 : 1.08; // nonstop premium
    const price = Math.round((base * al.factor * demand * stopDiscount * CABIN_MULT[cabin]) / 100) * 100;
    flights.push({
      id: `${al.code}${100 + Math.floor(rng() * 899)}-${input.date}-${i}`,
      airlineCode: al.code, airline: al.name, flightNo: `${al.code} ${100 + Math.floor(rng() * 899)}`,
      from: input.from, to: input.to, departTime: hhmm(departMin), arriveTime: hhmm(arriveMin),
      durationMins: duration, durationLabel: durLabel(duration), stops, stopLabel: stops === 0 ? 'Non-stop' : `${stops} stop`,
      nextDay: arriveMin >= 1440, cabin, priceInr: price,
    });
  }
  // tag cheapest / fastest / best
  const cheapest = flights.reduce((a, b) => (b.priceInr < a.priceInr ? b : a));
  const fastest = flights.reduce((a, b) => (b.durationMins < a.durationMins ? b : a));
  const best = flights.reduce((a, b) => ((b.priceInr / 1000 + b.durationMins / 60) < (a.priceInr / 1000 + a.durationMins / 60) ? b : a));
  cheapest.cheapest = true; fastest.fastest = true; best.best = true;
  flights.sort((a, b) => a.priceInr - b.priceInr);
  return { flights, from, to };
}

export function airportOptions() {
  return AIRPORTS.map((a) => ({ code: a.code, city: a.city, name: a.name, intl: a.intl }));
}
export function findFlight(input: SearchInput, flightId: string): FlightResult | null {
  return searchFlights(input).flights.find((f) => f.id === flightId) ?? null;
}
