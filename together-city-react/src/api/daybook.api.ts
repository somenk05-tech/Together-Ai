import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/api/http';

/**
 * THE DAYBOOK, ON THE WIRE.
 *
 * One day per request. Every field the server may add later is optional here,
 * always — the rule Mira's `mood` earned the hard way: the web deploys to
 * Vercel and the API to Railway independently, so there is always a window
 * where the new front end is live against the old back end, and a required
 * field it has never heard of turns every day into an error page.
 */
export const DayItemSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  at: z.string().nullable(),
  done: z.boolean(),
});
export const DaySchema = z.object({
  date: z.string(),
  mood: z.string().nullable(),
  feelNote: z.string().nullable(),
  journal: z.string().nullable(),
  items: z.array(DayItemSchema),
});
export type Day = z.infer<typeof DaySchema>;
export type DayItem = z.infer<typeof DayItemSchema>;
export type DayItemKind = 'task' | 'meeting' | 'reminder' | 'appointment';

const MonthSchema = z.record(z.object({
  items: z.number(),
  written: z.boolean(),
  mood: z.string().nullable(),
}));
export type MonthMarks = z.infer<typeof MonthSchema>;

const key = (date: string) => ['daybook', 'day', date];

export function useDay(date: string) {
  return useQuery({ queryKey: key(date), queryFn: () => apiGet(`/daybook/${date}`, DaySchema) });
}

/** Which days of a month hold something. Counts, never contents — the grid is
 *  not allowed to say what a day said, only that it said something. */
export function useDaybookMonth(ym: string) {
  return useQuery({
    queryKey: ['daybook', 'month', ym],
    queryFn: () => apiGet(`/daybook/month/${ym}`, MonthSchema),
    // A month of marks is cheap and stale marks are misleading, so it refetches
    // when the citizen comes back to the grid.
    staleTime: 0,
  });
}

/** Every write returns the whole day, so the page cannot drift from the record. */
function useDayWrite<TVars>(date: string, run: (v: TVars) => Promise<Day>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (day) => {
      qc.setQueryData(key(date), day);
      void qc.invalidateQueries({ queryKey: ['daybook', 'month', date.slice(0, 7)] });
    },
  });
}

export function useSaveDay(date: string) {
  return useDayWrite(date, (patch: { mood?: string | null; feelNote?: string | null; journal?: string | null }) =>
    apiPut(`/daybook/${date}`, patch, DaySchema));
}
export function useAddDayItem(date: string) {
  return useDayWrite(date, (item: { kind: DayItemKind; title: string; at?: string | null }) =>
    apiPost(`/daybook/${date}/items`, item, DaySchema));
}
export function usePatchDayItem(date: string) {
  return useDayWrite(date, ({ id, ...patch }: { id: string; done?: boolean; title?: string; at?: string | null; kind?: DayItemKind }) =>
    apiPatch(`/daybook/items/${id}`, patch, DaySchema));
}
export function useRemoveDayItem(date: string) {
  return useDayWrite(date, ({ id }: { id: string }) => apiDelete(`/daybook/items/${id}`, DaySchema));
}
