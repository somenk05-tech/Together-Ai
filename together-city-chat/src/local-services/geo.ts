/**
 * DISTANCE, AND THE BOX YOU ASK THE DATABASE FOR FIRST.
 *
 * Two functions, and the split between them is the whole point.
 *
 * `boundingBox` is what goes into the WHERE clause. Postgres can use an index
 * for `lat BETWEEN a AND b AND lng BETWEEN c AND d`; it cannot use one for
 * haversine, so a query that filters by real distance in SQL reads every row in
 * the table. The box is deliberately a little too big — it is a square drawn
 * around a circle — and that is fine, because:
 *
 * `haversineKm` then trims the corners in memory, on the handful of rows the
 * box returned. Cheap, exact, and it never touches a row the index already
 * excluded.
 *
 * Doing it the other way round — exact first, then paginate — is the mistake
 * that makes "businesses near me" a full table scan on every map pan.
 */
const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Box { minLat: number; maxLat: number; minLng: number; maxLng: number }

export function boundingBox(lat: number, lng: number, km: number): Box {
  const dLat = km / 111.32;
  // A degree of longitude shrinks towards the poles. Without the cosine the box
  // is far too wide in Europe and far too narrow at the equator; the clamp stops
  // it exploding to infinity if somebody searches from within a few metres of a
  // pole, where "east" stops meaning anything useful.
  const dLng = km / (111.32 * Math.max(0.01, Math.cos(rad(lat))));
  return {
    minLat: lat - dLat, maxLat: lat + dLat,
    minLng: lng - dLng, maxLng: lng + dLng,
  };
}

/** "12.9716,77.5946" → a point, or null. Never throws — a malformed query
 *  parameter is a filter that does not apply, not a 500. */
export function parsePoint(s?: string): { lat: number; lng: number } | null {
  if (!s) return null;
  const [a, b] = s.split(',').map((x) => Number(x.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/** Metres under a kilometre, one decimal above it — the way a person says it. */
export function humanDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
