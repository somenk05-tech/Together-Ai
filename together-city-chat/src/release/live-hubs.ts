/**
 * THE HUBS THE LIVE SITE SHOWS.
 *
 * Written by the Go live button (.github/workflows/go-live.yml rewrites this
 * whole file on `develop`, then merges `develop` into `main`). Edit it by hand
 * only if the button is unavailable — and then on `develop`, never on `main`.
 *
 * Keys are the district keys in release.ts. A key missing from this list is a
 * hub the live site holds back: no door anywhere, and an "opening soon" card
 * for anybody who types its address. The developer site ignores this list and
 * shows everything.
 */
export const LIVE_HUBS: readonly string[] = [
  'personalize',
  'ecommerce',
  'services',
  'social',
  'astrology',
  'babycare',
  'beauty',
  'dating',
  'entertainment',
  'family',
  'financial',
  'fitness',
  'medical',
  'nutrition',
  'pets',
];
