import { useCallback, useState } from 'react';
import { currentPosition } from '@/features/services/api';
import type { Shop } from './types';

/**
 * ── HOW FAR A SHELF REACHES ─────────────────────────────────────────────────
 *
 * Owner, 9 Sep: "the combined menu of all the local stores in the 3 km radius…
 * give users a distance tab where they can increase the distance to search for
 * an item they want."
 *
 * TWO SHELVES ARE MADE OF LOCAL STOCK — the grocery store and the electronics
 * store — and they are the only two in the city with a distance to be within: a
 * beauty shortlist read off a profile is not nearer or further away. Both need
 * the same four things (a centre, a radius, a way to ask the browser, a way to
 * go back to the whole city), and a second copy of that is the pair drifting
 * apart the first time either is touched.
 *
 * THE RADIUS NEEDS A CENTRE, and until the citizen shares one there is not a
 * radius — there is a city. So `centre` starts null and a shelf reads its
 * citizen's city as it always did; the moment a location arrives the same query
 * is bounded and the server does the box-then-haversine it already does for
 * Browse. Starting at "3 km" with no coordinates would be a page inventing the
 * one number the whole control is about.
 *
 * THE STEPS STOP AT 25 KM. Past that "near you" is a claim nobody would
 * recognise about their own city, and the honest control at that point is the
 * one that says "whole city" rather than a bigger circle pretending to be a
 * smaller one.
 */
export const NEAR_STEPS = [1, 3, 5, 10, 25] as const;

/** The owner's own default, used the moment a location arrives. */
export const NEAR_DEFAULT_KM = 3;

export function useNearby(fallbackCity: string | undefined): {
  /** Ready to spread into a shelf query — `{}` while there is no centre. */
  query: { near?: string; withinKm?: number };
  centre: { lat: number; lng: number } | null;
  km: number;
  nearby: NonNullable<Shop['nearby']>;
} {
  const [centre, setCentre] = useState<{ lat: number; lng: number } | null>(null);
  const [km, setKm] = useState<number>(NEAR_DEFAULT_KM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findMe = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const p = await currentPosition();
      setCentre({ lat: p.lat, lng: p.lng });
    } catch (e) {
      /* A REFUSED LOCATION IS NOT A BROKEN SHELF. The browser's own sentence is
         shown and the shelf carries on reading the city — a citizen who does
         not want to share where they are still gets their city's shops. */
      setError(e instanceof Error ? e.message : 'That location did not arrive.');
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    query: centre ? { near: `${centre.lat},${centre.lng}`, withinKm: km } : {},
    centre,
    km,
    nearby: {
      centre,
      km,
      steps: NEAR_STEPS,
      onKm: setKm,
      onFindMe: () => { void findMe(); },
      onClear: () => setCentre(null),
      busy,
      error,
      fallback: fallbackCity,
    },
  };
}
