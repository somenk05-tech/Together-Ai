import { http as api } from '@/api/client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Programme } from './api';

/**
 * ── A DAY IS A PAGE, AND THE CITIZEN CAN ADD TO IT (owner, 18 Sep) ──────────
 *
 * "When someone clicks on the day it should open the day on a new page with
 * that day's complete workout, and below each workout day page add search
 * and add workout to the day."
 *
 * The two writes the day page makes. Both answer with the rebuilt month,
 * written straight under the month's key so the page redraws from the
 * answer; the session is invalidated because today's work may have grown.
 */
export interface AddToDayInput { dayIndex: number; exerciseId: string; sets: number; reps: number }

function settle(qc: ReturnType<typeof useQueryClient>, month: Programme) {
  qc.setQueryData(['fitness', 'programme'], month);
  void qc.invalidateQueries({ queryKey: ['fitness', 'session'] });
}

export function useAddToDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dayIndex, ...body }: AddToDayInput) =>
      api.post<Programme>(`/fitness/programme/day/${dayIndex}/add`, body).then((r) => r.data),
    onSuccess: (month) => settle(qc, month),
  });
}

export function useRemoveFromDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dayIndex, id }: { dayIndex: number; id: string }) =>
      api.delete<Programme>(`/fitness/programme/day/${dayIndex}/add/${id}`).then((r) => r.data),
    onSuccess: (month) => settle(qc, month),
  });
}
