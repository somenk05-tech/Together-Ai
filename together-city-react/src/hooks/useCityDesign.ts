import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { http as api } from '@/api/client';
import { useAuthStore } from '@/store/auth.store';
import { isDesignable } from '@/config/services';
import type { HubKey } from '@/types';

/**
 * DESIGN YOUR SERVICES — the citizen's own city, read once and applied
 * everywhere.
 *
 * The server stores the hubs a citizen switched OFF (see the profile section
 * on /profile and together-city-chat/src/profile/design-your-services.ts).
 * This hook is the one place that answer is read, and its default is the whole
 * of the point: while signed out, while loading, and when the request fails,
 * `hubOn` answers true for everything. The design is a convenience, and a
 * convenience must never be the reason the header renders empty — the two
 * states "no design saved" and "we don't know" both leave the city standing.
 */
interface ServicesDesign { hidden: string[] }

const KEY = ['profile', 'services'] as const;

export function useCityDesign() {
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const q = useQuery({
    queryKey: KEY,
    queryFn: () => api.get<ServicesDesign>('/profile/services').then((r) => r.data),
    enabled: authed,
    staleTime: 5 * 60_000,
  });
  // Unknown keys are dropped on read as well as refused on write, so a stale
  // cache from before a hub retired can never hide something it shouldn't.
  const hidden = new Set<string>((authed ? q.data?.hidden ?? [] : []).filter(isDesignable));
  return {
    /** Whether this hub keeps its doors for this citizen. Non-designable keys
     *  (mail, personal, travel) are always on — they were never up for design. */
    hubOn: (key: string): boolean => !hidden.has(key),
    /** The OFF list itself, for the section that edits it. */
    hidden,
    offCount: hidden.size,
  };
}

/** Replace the design. The whole list travels every time; the cache is moved
 *  first so the switch answers the hand, and rolled back if the city refuses. */
export function useDesignServices() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (hidden: HubKey[]) =>
      api.put<ServicesDesign>('/profile/services', { hidden }).then((r) => r.data),
    onMutate: async (hidden) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<ServicesDesign>(KEY);
      qc.setQueryData<ServicesDesign>(KEY, { hidden });
      return { prev };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
