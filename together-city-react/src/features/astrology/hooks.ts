import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { astrologyApi, SaveAstroProfileInput } from './api';

export function useAstroProfile() {
  return useQuery({ queryKey: ['astrology', 'profile'], queryFn: astrologyApi.profile });
}

export function useSaveAstroProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SaveAstroProfileInput) => astrologyApi.saveProfile(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['astrology'] }),
  });
}

/** Today's saved prediction (one per user per day, flips at the user's midnight). */
export function useAstroDaily() {
  return useQuery({ queryKey: ['astrology', 'daily'], queryFn: astrologyApi.daily, staleTime: 5 * 60_000 });
}

export function useAstroDailyHistory() {
  return useQuery({ queryKey: ['astrology', 'daily-history'], queryFn: astrologyApi.dailyHistory });
}

/** The month's saved reading (one per user per calendar month). */
export function useAstroMonthly() {
  return useQuery({ queryKey: ['astrology', 'monthly'], queryFn: astrologyApi.monthly, staleTime: 30 * 60_000 });
}

export function useAstroQuestions() {
  return useQuery({ queryKey: ['astrology', 'questions'], queryFn: astrologyApi.questions });
}

export function useAskAstrologer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: astrologyApi.ask,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['astrology', 'questions'] }),
  });
}

/* ─────────────────────────── Tarot ─────────────────────────── */

/** Card of the Day — free, and the same card until the citizen's midnight. */
export function useTarotDaily() {
  return useQuery({ queryKey: ['astrology', 'tarot', 'daily'], queryFn: astrologyApi.tarotDaily, staleTime: 30 * 60_000 });
}

export function useTarotSpreads() {
  return useQuery({ queryKey: ['astrology', 'tarot', 'spreads'], queryFn: astrologyApi.tarotSpreads, staleTime: 60 * 60_000 });
}

export function useTarotHistory() {
  return useQuery({ queryKey: ['astrology', 'tarot', 'history'], queryFn: astrologyApi.tarotHistory });
}

export function useDrawTarot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: astrologyApi.tarotDraw,
    // A paid draw spends from the wallet, so the financial views are stale too.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['astrology', 'tarot', 'history'] });
      void qc.invalidateQueries({ queryKey: ['financial'] });
    },
  });
}
