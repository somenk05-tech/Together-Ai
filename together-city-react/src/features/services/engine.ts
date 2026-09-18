/**
 * ── WHICH ENGINE A BUSINESS PAGE RUNS ON (owner, 17 Sep) ─────────────────────
 *
 * "Create a unique business page for each kind of business." The server
 * names the engines in local-services/understand.ts (ENGINE_OF_TYPE) — food,
 * store, appointments, healthcare, job, professional, classes, events, pets,
 * page — and this is the same map, read by the customer-facing page to decide
 * what leads: a menu, a stock list, a booking request, a job request with a
 * photograph, a consultation request.
 *
 * A COPY, HELD TOGETHER BY A TEST. the-page-is-the-trades.test.ts reads both
 * files and fails the build the day one gains a type the other lacks. It is
 * a copy rather than a field on ServiceCard because the server's card is
 * assembled in local-services.service.ts, and the map is eighteen words.
 */
export type EngineKey =
  | 'food' | 'store' | 'appointments' | 'healthcare' | 'job'
  | 'professional' | 'classes' | 'events' | 'pets' | 'page';

const ENGINE_OF_TYPE: Record<string, EngineKey> = {
  restaurant: 'food', cafe: 'food', bakery: 'food',
  grocery: 'store', retail: 'store', electronics: 'store',
  salon: 'appointments', gym: 'appointments',
  clinic: 'healthcare', diagnostics: 'healthcare',
  trade: 'job', cleaning: 'job', transport: 'job',
  professional: 'professional',
  tuition: 'classes',
  creative: 'events',
  petcare: 'pets',
  general: 'page',
};

/**
 * A listing older than the schema has no type; its catalogue still says
 * whether the city orders from it (a menu or a stock list) or writes to it.
 */
export function engineOf(businessType: string | null | undefined, catalogue?: { kind: string; orderable: boolean } | null): EngineKey {
  if (businessType && ENGINE_OF_TYPE[businessType]) return ENGINE_OF_TYPE[businessType];
  if (catalogue?.kind === 'menu') return 'food';
  if (catalogue?.kind === 'stock') return 'store';
  return 'page';
}
