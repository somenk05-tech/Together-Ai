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
const SWITCHES = ['city', 'visibility'] as const;

/** Mira's door, in the six places she has one (the home hero joined, 5 Sep). She is not a hub, so she is
 *  not in `hubOn` — but she is a thing with doors, which is what the
 *  operator's switch is about. Off hides the door and nothing else: she keeps
 *  answering, and an open conversation stays open. */
export function useMiraShown(): boolean {
  return useCitySwitches().shown('mira');
}

/**
 * ── THE OTHER HAND ON THE SAME DOOR (owner, 27 Aug) ────────────────────────
 *
 * "Visibility switches for the entire global website, so I can control turning
 * off or on a sector." Two people can now close a door: the citizen, on
 * /profile, for themselves; and the operator, on /dev, for everybody.
 *
 * They are read separately because they ARE separate — different endpoint,
 * different authority, different reason — and then answered together, because
 * every place that draws a door only ever has one question: is there a door.
 * Two sources, one answer, so a render site cannot honour one and forget the
 * other.
 *
 * PUBLIC, and it has to be: the header draws before anybody signs in, so a
 * sector hidden for everyone must be hidden on the signed-out page too. An
 * authed-only read would show strangers a door it hides from citizens.
 *
 * FAILS OPEN, like everything else in this file. Loading, signed out, offline,
 * server on fire — the answer is "draw it". Hiding the city because a
 * convenience request did not come back is the worst possible reading of a
 * switch that exists to hide one sector on purpose.
 */
export function useCitySwitches() {
  const q = useQuery({
    queryKey: SWITCHES,
    queryFn: () => api.get<{ off: string[] }>('/visibility').then((r) => r.data),
    staleTime: 60_000,
  });
  const off = new Set<string>(q.data?.off ?? []);
  return {
    /** Is this sector drawn at all, for anybody? */
    shown: (key: string): boolean => !off.has(key),
    off,
  };
}

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
  const switches = useCitySwitches();
  return {
    /**
     * Whether this hub keeps its doors. TWO HANDS, ONE ANSWER: the citizen's
     * own choice, and the operator's site-wide visibility switch. Either one
     * closes the door; neither can be honoured without the other, because the
     * four render sites ask this and nothing else.
     *
     * Non-designable keys (mail, personal, travel) are always on for the
     * citizen — they were never up for design — but the operator's switch
     * still applies to anything it names.
     */
    hubOn: (key: string): boolean => !hidden.has(key) && switches.shown(key),
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
