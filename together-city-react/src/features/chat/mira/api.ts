import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/api/http';

/**
 * One turn back from the server, validated at the boundary.
 *
 * Zod here rather than a cast, for the reason the build spec names it as
 * load-bearing: this is the seam where a server change becomes a frontend
 * crash, and a parse turns that into a caught error at the one place that can
 * report it honestly.
 *
 * `payload` is deliberately unknown — it is whatever hub answered, and Mira's
 * thread does not render it in phase 1. Typing it here would be inventing a
 * shape shared by a wallet, a document list and a restaurant.
 */
export const MiraReplySchema = z.object({
  text: z.string(),
  lane: z.enum(['ACT', 'RETRIEVE', 'ADVISE', 'LISTEN', 'AMBIGUOUS']),
  capabilityId: z.string().optional(),
  confidence: z.number(),
  levity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  payload: z.unknown().optional(),
  /** Where she is offering to take you. Navigation changes nothing, so it needs no confirmation. */
  goto: z.object({ label: z.string(), path: z.string() }).optional(),
  /** The colour this turn was said in — six of them, announced once a day. */
  mood: z.enum(['wry', 'warm', 'sharp', 'brisk', 'mischievous', 'quiet']),
  /**
   * The options she just offered, when the turn was a question.
   *
   * Held by the caller and sent straight back on the next ask. That round trip
   * is the whole of her short-term memory, and without it a one-word reply goes
   * back through the matcher that produced the question — which is how she
   * asked "Astrology or Log? Which one?" twice in a row in production.
   */
  choices: z.array(z.object({ label: z.string(), path: z.string() })).optional(),
  trace: z.array(z.string()),
});
export type MiraReply = z.infer<typeof MiraReplySchema>;

/**
 * The hour and the week count are sent by the CLIENT, on purpose.
 *
 * The governor caps humour at 3am and holds it at L1 for the first fortnight,
 * and both are facts about the citizen rather than about the server. A server
 * in another timezone deciding it is not 3am for someone is the exact class of
 * bug `MasterProfile.timeZone` exists to prevent.
 */
export function useMiraAsk(opts: {
  weeksKnown: number;
  dial?: 0 | 1 | 2;
  distressLocked?: boolean;
  /** Held for the life of the thread, so her mood does not change mid-sentence. */
  seed: number;
}) {
  return useMutation({
    mutationFn: async (input: { text: string; recent?: string[]; answering?: Choice[] }) =>
      apiPost('/mira/ask', {
        text: input.text,
        recent: input.recent?.slice(0, 3),
        hour: new Date().getHours(),
        weeksKnown: opts.weeksKnown,
        dial: opts.dial,
        distressLocked: opts.distressLocked,
        seed: opts.seed,
        answering: input.answering,
      }, MiraReplySchema),
  });
}

export type Choice = { label: string; path: string };

const CapabilitySchema = z.object({
  id: z.string(), intent: z.string(), risk: z.string(), path: z.string(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/**
 * What she can actually do, from the generated manifest.
 *
 * The opening line is built from THIS rather than written by hand, so it can
 * only ever promise what has been decorated. A greeting that says "I can order
 * your groceries" while the executor has no branch that writes is the one
 * failure this whole codebase is built to avoid — and a hand-written promise
 * rots the day somebody adds a capability and forgets the copy.
 */
export function useMiraCapabilities() {
  return useQuery({
    queryKey: ['mira', 'capabilities'],
    queryFn: () => apiGet('/mira/capabilities', z.array(CapabilitySchema)),
    staleTime: 5 * 60 * 1000,
  });
}
