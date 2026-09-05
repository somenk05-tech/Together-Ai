import type { QueryClient } from '@tanstack/react-query';

/**
 * ── A SIGNED LINK THAT EXPIRED IS RE-MINTED, NOT LEFT BROKEN (5 Sep) ─────────
 *
 * Post media is served by a signed URL that lives an hour. A tab left open
 * past that, or a lazy image scrolled into view after sixty minutes, rendered
 * a broken picture with no way back short of a manual refresh: nothing
 * listened to the image's error. `onStaleMedia` is that listener — it
 * invalidates the feature's queries so the cards re-read fresh links — and it
 * is throttled to one refetch per window, because a page of forty expired
 * images must not become forty refetches.
 */
let lastRemint = 0;
export const REMINT_WINDOW_MS = 30_000;

export function onStaleMedia(qc: QueryClient, prefix: readonly unknown[]): boolean {
  const now = Date.now();
  if (now - lastRemint < REMINT_WINDOW_MS) return false;
  lastRemint = now;
  void qc.invalidateQueries({ queryKey: [...prefix] });
  return true;
}

/** For tests: forget the throttle. */
export function resetRemint(): void { lastRemint = 0; }
