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
   * The number the mood was chosen from — HERS, not this browser's.
   *
   * It used to be derived here, from the date and a random per-device salt, so
   * she was a different character on the phone and the laptop on the same
   * afternoon and a cleared cache changed her mid-conversation. The server
   * derives it from the citizen now and says which one it used; the client
   * reads it back and holds it. Optional, always — the rule the mood field
   * earned above.
   */
  seed: z.number().optional(),
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
 * The clock is sent by the CLIENT; the SAFETY STATE is not, any more.
 *
 * The hour and the zone stay here because a server deciding it is not 3am for
 * somebody is the exact class of bug `MasterProfile.timeZone` exists to
 * prevent — and they are now a fallback rather than the source: the server
 * prefers the zone on the profile and reads these only when it has none.
 *
 * WHAT LEFT, AND WHY IT HAD TO. `weeksKnown` and `distressLocked` decide how
 * playful she is allowed to be and whether the last session ended somewhere
 * heavy. Both were state held in a browser tab — which means both were
 * editable by anyone holding the browser, and neither survived a refresh
 * honestly. A citizen's distress latch is not a fact a client gets a vote on.
 * The server derives them from the profile and the MiraPass row; the request
 * schema still accepts the fields, and this no longer sends them.
 */
export function useMiraAsk(opts: {
  dial?: 0 | 1 | 2;
  /** The last seed the server named, or the day's local guess before one has. */
  seed: number;
}) {
  return useMutation({
    mutationFn: async (input: {
      text: string; recent?: string[]; answering?: Choice[];
      history?: Array<{ who: 'me' | 'mira'; text: string }>;
      /** The in-app path they were standing on when they opened her. */
      page?: string;
      /**
       * The way out of a request that is not coming back. Without one the
       * composer is disabled for as long as the network takes to give up,
       * which on a dead connection is minutes with no cancel and no timeout —
       * a citizen stranded in front of a Send button that does nothing.
       */
      signal?: AbortSignal;
    }) =>
      apiPost('/mira/ask', {
        text: input.text,
        recent: input.recent?.slice(0, 3),
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
        dial: opts.dial,
        seed: opts.seed,
        answering: input.answering,
      }, MiraReplySchema, { signal: input.signal }),
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
  /** The seed the server chose for this citizen today. See MiraReplySchema. */
  seed: z.number().optional(),
});
export type MiraGreeting = z.infer<typeof GreetingSchema>;

export function useMiraGreeting(opts: {
  hour: number; seed: number;
  firstOfDay: boolean; dial?: 0 | 1 | 2;
}) {
  return useQuery({
    /**
     * NOT KEYED ON THE SEED, and that is the point of the seed moving.
     *
     * The greeting ANSWERS with the seed now, so keying the query on the one
     * this device guessed would fetch a second greeting the moment the real one
     * arrived — a new opening line re-rolled under somebody who is already
     * reading the first, which is precisely what `staleTime: Infinity` below
     * exists to prevent.
     */
    queryKey: ['mira', 'greeting', opts.firstOfDay],
    queryFn: () => apiGet('/mira/greeting', GreetingSchema, {
      params: {
        // Still sent, still only a fallback: a server with no zone on the
        // profile reads the hour, and a server older than this change still
        // requires the seed. Neither is trusted where the profile answers.
        hour: opts.hour, seed: opts.seed,
        firstOfDay: opts.firstOfDay, dial: opts.dial,
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
/**
 * THE PRICE AND THE QUOTA, IN ONE PLACE ON THIS SIDE OF THE WIRE.
 *
 * Both were typed out at three call sites — the subscribe key in her room, the
 * same key in the confidant, and the meter line — with nothing checking any of
 * them against what the wallet is actually charged. A price on a button that
 * disagrees with the price on the invoice is not a copy bug.
 *
 * THE SOURCE OF TRUTH IS `together-city-chat/src/mira/persona.ts` (`SUB_INR`,
 * `FREE_CHATS`), and no response carries either number today, so this is one
 * constant instead of three literals rather than the real fix. Serving them —
 * on `/mira/ask`'s `pass`, where the meter already rides — is a follow-up, and
 * until it lands this comment is the only thing holding the two files together.
 */
export const SUB_INR = 999;
export const FREE_CHATS = 200;

const SubscribeSchema = z.object({
  paidUntil: z.string(),
  freeLeft: z.null(),
});
export function useMiraSubscribe() {
  return useMutation({
    mutationFn: async () => apiPost('/mira/subscribe', {}, SubscribeSchema),
  });
}

/**
 * The confidant's one turn back. Deliberately smaller than MiraReplySchema:
 * this lane has no lanes, no mood, no navigation — one paragraph about one
 * conversation, plus the meter when it moved. Every field beyond `text` is
 * optional, per the rule the mood field earned above.
 */
const ConfideReplySchema = z.object({
  text: z.string(),
  pass: z.object({ freeLeft: z.number().nullable() }).optional(),
  paywall: z.boolean().optional(),
});
export type ConfideReply = z.infer<typeof ConfideReplySchema>;

/**
 * Mira, invited into ONE conversation.
 *
 * The transcript rides FROM THE CLIENT, and that is the scope made mechanical:
 * the server never queries the chat tables for this, so the only thing she can
 * ever read is the window this screen was already showing. Capped at the last
 * forty turns — the same bound the server enforces — so a ten-year thread
 * sends a window, not an archive.
 */
export function useMiraConfide() {
  return useMutation({
    mutationFn: async (input: {
      otherName?: string;
      ask: string;
      transcript: Array<{ who: 'me' | 'them'; text: string }>;
      /** 'draft' is the Help-me-reply button: she returns a message to paste,
       *  not a reading of the thread. Absent for anything typed by hand. */
      mode?: 'read' | 'draft';
    }) =>
      apiPost('/mira/confide', {
        ask: input.ask,
        otherName: input.otherName,
        transcript: input.transcript.slice(-40),
        mode: input.mode,
      }, ConfideReplySchema),
  });
}

/**
 * The visible thread, from her record on the server — what makes the SAME
 * conversation appear on the phone and the site. The record was already the
 * model's memory; this reads it for the screen. `retry: false` and the
 * caller ignores failure entirely: an older API without this route, or a
 * slow table, means the device's own day store stands — sync is an upgrade,
 * never a dependency.
 */
const MiraThreadSchema = z.object({
  turns: z.array(z.object({
    who: z.enum(['you', 'mira']),
    text: z.string(),
    at: z.string(),
  })),
});
export type MiraServerThread = z.infer<typeof MiraThreadSchema>;

export function useMiraThread() {
  return useQuery({
    queryKey: ['mira', 'thread'],
    // No `room` param: there is one transcript. The route still ACCEPTS one so
    // an older client does not 400, and the API ignores it.
    queryFn: () => apiGet('/mira/thread', MiraThreadSchema),
    retry: false,
    staleTime: 0,
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
