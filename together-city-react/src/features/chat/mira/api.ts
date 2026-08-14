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
  /**
   * The colour this turn was said in — six of them, announced once a day.
   *
   * OPTIONAL, AND THAT IS A RULE RATHER THAN A DETAIL ABOUT MOODS.
   *
   * This shipped as required and took Mira down completely. The web app deploys
   * to Vercel and the API deploys to Railway, independently, so there is ALWAYS
   * a window — minutes, sometimes longer if a build queues — where the new
   * frontend is live against the old backend. A required field the old backend
   * has never heard of makes `schema.parse` throw on every single turn, the
   * mutation rejects, and the citizen gets the offline line while the API sits
   * there perfectly healthy answering everything correctly.
   *
   * THE RULE: A NEW FIELD IN A RESPONSE IS OPTIONAL ON THE CLIENT, ALWAYS. It
   * may be promoted to required later, once the server that sends it is the only
   * one deployed — and in practice that day never comes and it never matters.
   * `mira-tolerates-an-older-server.test.ts` holds this for the whole schema
   * rather than for this one field.
   */
  mood: z.enum(['wry', 'warm', 'sharp', 'brisk', 'mischievous', 'quiet']).optional(),
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
  /**
   * The conversation meter, on turns that used or hit it. `freeLeft` is null
   * for a subscriber — unmetered, which must never render as "0 left".
   * Optional on the client, ALWAYS — the rule the mood field earned above.
   */
  pass: z.object({ freeLeft: z.number().nullable() }).optional(),
  /** True when this turn is the meter itself answering, and the subscribe
   *  card belongs under it. Same optionality rule. */
  paywall: z.boolean().optional(),
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
    mutationFn: async (input: {
      text: string; recent?: string[]; answering?: Choice[];
      history?: Array<{ who: 'me' | 'mira'; text: string }>;
      /** Which tab is asking — friend (the companion) or city (the assistant). */
      mode?: 'friend' | 'city';
      /** The in-app path they were standing on when they opened her. */
      page?: string;
    }) =>
      apiPost('/mira/ask', {
        text: input.text,
        recent: input.recent?.slice(0, 3),
        mode: input.mode,
        page: input.page,
        // The day's transcript, both voices — what makes "just feeling
        // lonely" a continuation rather than a sentence from nowhere. The
        // thread lives on this device; the server keeps no session.
        history: input.history?.slice(-12),
        hour: new Date().getHours(),
        // Her clock has to be the citizen's clock. `hour` alone cannot convert a
        // date — an offset inferred from it rounds to the hour and is half an
        // hour wrong across all of India — so the zone itself is sent. Optional
        // on the server, so this reaching an older API costs nothing.
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        weeksKnown: opts.weeksKnown,
        dial: opts.dial,
        distressLocked: opts.distressLocked,
        seed: opts.seed,
        answering: input.answering,
      }, MiraReplySchema),
  });
}

export type Choice = { label: string; path: string };

/**
 * Hello, and which Mira turned up today.
 *
 * Every input is a fact about the CITIZEN — their hour, their day, whether this
 * is their first open of it — so every one is sent from here. `seed` is the
 * day's seed, the same number `useMiraAsk` sends, because a badge announcing
 * one Mira and an answer delivering another is worse than no badge.
 *
 * `staleTime: Infinity` because it is a fact about this open of the app, not a
 * value that goes out of date. Refetching it would re-roll the opening line
 * under somebody who is mid-sentence.
 */
const GreetingSchema = z.object({
  /** Her mood, on the first open of the day. Empty every other time. */
  hello: z.string(),
  ask: z.string(),
  mood: z.enum(['wry', 'warm', 'sharp', 'brisk', 'mischievous', 'quiet']).optional(),
  levity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});
export type MiraGreeting = z.infer<typeof GreetingSchema>;

export function useMiraGreeting(opts: {
  hour: number; seed: number; weeksKnown: number;
  firstOfDay: boolean; dial?: 0 | 1 | 2; distressLocked?: boolean;
}) {
  return useQuery({
    queryKey: ['mira', 'greeting', opts.seed, opts.firstOfDay],
    queryFn: () => apiGet('/mira/greeting', GreetingSchema, {
      params: {
        hour: opts.hour, seed: opts.seed, weeksKnown: opts.weeksKnown,
        firstOfDay: opts.firstOfDay, dial: opts.dial, distressLocked: opts.distressLocked,
      },
    }),
    staleTime: Infinity,
    // She has plenty to say without it. A greeting that fails is a quieter
    // opening, never an error in front of somebody.
    retry: false,
  });
}

/**
 * Thirty days of conversation for ₹999, from the city wallet.
 *
 * Behind an explicit button that carries its price on its face — Mira herself
 * cannot spend money, and this is not her doing it; it is the citizen
 * pressing a priced key. An empty wallet answers with the same sentence every
 * checkout in the city uses, and the thread shows it rather than swallowing it.
 */
const SubscribeSchema = z.object({
  paidUntil: z.string(),
  freeLeft: z.null(),
});
export function useMiraSubscribe() {
  return useMutation({
    mutationFn: async () => apiPost('/mira/subscribe', {}, SubscribeSchema),
  });
}

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
