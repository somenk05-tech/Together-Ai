import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/api/http';
import { mediaApi } from '@/api/media.api';

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
/**
 * A picture kept on a day. `url` is a SHORT-LIVED SIGNED LINK minted when the
 * day is read, not an address — and it is nullable because storage may be
 * unconfigured, in which case the honest answer is "there is a picture here and
 * we cannot show it to you" rather than a broken frame.
 *
 * There is no key here, and there should never be one: the key is what proves
 * ownership to the API, and a browser has no use for it.
 */
export const DayPhotoSchema = z.object({
  id: z.string(),
  url: z.string().nullable(),
  createdAt: z.string().optional(),
});
/**
 * THE LOOKING-BACK SHEET, from the owner's reference (15 Aug). One object
 * rather than eleven fields on the day, for the reason the API keeps it in one
 * column: it is a template, and a template's prompts get reworded.
 *
 * Every key optional, and the object itself optional — this build talks to a
 * server that predates it for as long as one deploy takes.
 */
export const ReflectionSchema = z.object({
  feeling: z.number().nullable().optional(),
  wentWell: z.string().nullable().optional(),
  proudOf: z.string().nullable().optional(),
  grateful1: z.string().nullable().optional(),
  grateful2: z.string().nullable().optional(),
  grateful3: z.string().nullable().optional(),
  difficult: z.string().nullable().optional(),
  learned: z.string().nullable().optional(),
  win: z.string().nullable().optional(),
  challenge: z.string().nullable().optional(),
  tomorrow: z.string().nullable().optional(),
});
export type Reflection = z.infer<typeof ReflectionSchema>;
export type ReflectionKey = keyof Reflection;

export const DaySchema = z.object({
  date: z.string(),
  mood: z.string().nullable(),
  feelNote: z.string().nullable(),
  journal: z.string().nullable(),
  reflection: ReflectionSchema.optional(),
  items: z.array(DayItemSchema),
  /* OPTIONAL, like every field added after the first deploy: the web and the
     API ship independently, so there is always a window where this build is
     talking to a server that has never heard of photographs.

     Optional and NOT `.default([])`, which is the version that does not
     compile. A defaulted field makes zod's INPUT type differ from its OUTPUT
     type, and `apiGet<T>(url, schema: ZodType<T>)` has one T for both — so the
     day comes back typed as the input side and every write in this file stops
     matching itself. The screens say `?? []`, which they would anyway. */
  photos: z.array(DayPhotoSchema).optional(),
});
export type Day = z.infer<typeof DaySchema>;
export type DayItem = z.infer<typeof DayItemSchema>;
export type DayItemKind = 'task' | 'meeting' | 'reminder' | 'appointment';

const MonthSchema = z.record(z.object({
  items: z.number(),
  written: z.boolean(),
  mood: z.string().nullable(),
  /* The first picture kept on that day — a signed link that expires, and the
     only thing about a day's CONTENTS the grid is given. Optional for the
     window where this build is talking to a server that predates it. */
  photo: z.string().nullable().optional(),
  photos: z.number().optional(),
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
  return useDayWrite(date, (patch: {
    mood?: string | null; feelNote?: string | null; journal?: string | null;
    /* One answer at a time, not the whole sheet: the server merges what it is
       given into what is already there, so sending the object the screen
       happens to be holding would overwrite a box somebody filled in another
       tab five minutes ago. */
    reflection?: Reflection;
  }) => apiPut(`/daybook/${date}`, patch, DaySchema));
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

/**
 * KEEP A PICTURE ON THIS DAY. Two round trips inside one mutation: the bytes go
 * straight from the browser to the private vault, and only then is the key
 * filed against the date. Both live behind one hook so no screen can do the
 * first without the second and leave an orphan in a bucket.
 */
export function useAddDayPhoto(date: string) {
  return useDayWrite(date, async (file: File) => {
    const up = await mediaApi.uploadDaybook(file);
    return apiPost(`/daybook/${date}/photos`, up, DaySchema);
  });
}
export function useRemoveDayPhoto(date: string) {
  return useDayWrite(date, ({ id }: { id: string }) => apiDelete(`/daybook/photos/${id}`, DaySchema));
}
