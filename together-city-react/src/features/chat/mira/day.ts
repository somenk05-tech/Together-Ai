import { z } from 'zod';

/**
 * Mira's day.
 *
 * ── THE COMPLAINT THIS ANSWERS ────────────────────────────────────────────
 *
 * Her thread was `useState`. Open a hub, come back, and the conversation was
 * gone — including the thing she had just offered to do. For a surface whose
 * whole pitch is "tell me and I'll do it", forgetting the sentence before is
 * not a missing feature, it is a broken promise.
 *
 * ── AND THE HONEST LIMIT ON THE ANSWER ────────────────────────────────────
 *
 * THIS IS ONE DEVICE, AND ONE DAY. `one-bag.test.ts` bans localStorage for the
 * shopping bag and gives the reason: a bag in the browser is a bag one device
 * knows about. That reasoning applies here too and is not being dodged — it is
 * being priced. A cross-device Mira history is a Prisma model, a migration and
 * a `purge-plan.ts` rule, which belongs with the consent ledger in phase 2. A
 * day on this device is what closes the actual complaint today, and Sleep.tsx
 * already says the sentence for it: localStorage is the honest maximum.
 *
 * So the product says so. `MiraThread` prints "Today, on this device" under the
 * thread rather than letting somebody find out by opening their phone.
 *
 * ── WHY THE DAY EXPIRES BY ITSELF ─────────────────────────────────────────
 *
 * The record carries the day it was written. A different day is not merged, not
 * trimmed, not migrated — it is dropped, before it is parsed. That is what
 * makes "a day" true without a timer, without a cleanup task, and without the
 * class of bug where the expiry code is the thing that never runs.
 *
 * The day is the CITIZEN's local day here, unlike the server ledger's fixed
 * city clock — this record has exactly one reader, sitting in front of it, and
 * their midnight is the one they mean.
 */

const KEY = 'mira.day';
const GREETED_KEY = 'mira.greeted';

/**
 * ── ONE THREAD AGAIN ──────────────────────────────────────────────────────
 *
 * The split was the owner's call and it has been reversed: there are no tabs
 * to be in, so there is nothing for two keys to belong to. Every day now lives
 * under the ORIGINAL key, which is where the conversations that predate the
 * split have been the whole time.
 *
 * The `room` parameter is gone rather than ignored. An unread argument kept
 * "for the call sites" is a signature that lies about what the function does,
 * and there were four of them — a smaller sweep than the comment defending it.
 */
const FRIEND_KEY = 'mira.day.friend';

/**
 * The friend's day, folded back in, once.
 *
 * HONEST ABOUT THE ORDER: a stored turn carries no timestamp, so two days
 * cannot be interleaved by time — the friend's turns are appended after the
 * assistant's rather than woven between them. That is wrong about sequence and
 * right about content, for one day, on one device, for a cache whose authority
 * is the server record anyway. The alternative was throwing half a
 * conversation away on the morning of the merge.
 */
function foldFriendIn(s: Storage, at: Date): void {
  let raw: string | null = null;
  try { raw = s.getItem(FRIEND_KEY); } catch { return; }
  if (raw === null) return;
  try {
    const friend = DaySchema.safeParse(JSON.parse(raw));
    if (friend.success && friend.data.day === today(at) && friend.data.turns.length) {
      const mineRaw = s.getItem(KEY);
      const mine = mineRaw ? DaySchema.safeParse(JSON.parse(mineRaw)) : null;
      const kept = mine?.success && mine.data.day === today(at) ? mine.data.turns : [];
      s.setItem(KEY, JSON.stringify({
        day: today(at),
        turns: [...kept, ...friend.data.turns].slice(-MAX_TURNS),
      }));
    }
  } catch { /* a malformed cache is a cache, and it is being dropped anyway */ }
  // Removed either way: leaving it means folding it in again tomorrow.
  try { s.removeItem(FRIEND_KEY); } catch { /* nothing to do about it */ }
}
const SALT_KEY = 'mira.salt';

/** A long day of talking, and a hard stop. Anything past this is a runaway loop
 *  rather than a conversation, and it should not be able to fill a quota. */
const MAX_TURNS = 200;

const StoredTurnSchema = z.object({
  /**
   * A NAME FOR THE TURN, SO REACT CAN STOP COUNTING.
   *
   * The thread was keyed by array index against an array that is replaced
   * wholesale on hydration and again on every tab switch — so React matched
   * yesterday's third bubble to today's third bubble and moved the text
   * between them rather than the bubbles. Optional, because a record written
   * before this field existed is still a record.
   */
  id: z.string().optional(),
  who: z.union([z.literal('you'), z.literal('mira')]),
  text: z.string(),
  levity: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
  goto: z.object({ label: z.string(), path: z.string() }).optional(),
});
export type StoredTurn = z.infer<typeof StoredTurnSchema>;

/**
 * One id per turn, unique across reloads.
 *
 * The clock is in it because a counter alone restarts at zero on the next
 * open, and yesterday's persisted `t1` would then collide with this morning's
 * — two turns with one key, which is the bug this field exists to stop.
 */
let made = 0;
export const turnId = (): string => `${Date.now().toString(36)}.${(made++).toString(36)}`;

const DaySchema = z.object({ day: z.string(), turns: z.array(StoredTurnSchema).max(MAX_TURNS) });

/** Their calendar day, in their timezone, as YYYY-MM-DD. `toISOString` would be
 *  UTC and would roll the day over at 5:30am for the city this app is for. */
export function today(at: Date = new Date()): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** Storage throws rather than returning null in Safari's private mode and when
 *  a quota is full, so every call site here is wrapped. Losing the history is a
 *  disappointment; taking the chat hub down with it is a bug. */
function store(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function loadDay(at: Date = new Date()): StoredTurn[] {
  const s = store();
  if (!s) return [];
  foldFriendIn(s, at);
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = DaySchema.safeParse(JSON.parse(raw));
    // A shape we do not recognise is yesterday's format, and it is dropped for
    // the same reason yesterday's day is: this is a cache of a conversation,
    // not a record anybody is owed.
    if (!parsed.success || parsed.data.day !== today(at)) { s.removeItem(KEY); return []; }
    return parsed.data.turns;
  } catch { return []; }
}

/**
 * The rooms whose day ended while this tab stayed open.
 *
 * `loadDay` expires the record on the way out and that was only half of it: the
 * turns are ALSO in memory, and the save that follows the next sentence stamps
 * them with the new date — which is yesterday quietly becoming today, the one
 * thing the day stamp exists to prevent. So the write expires too, and the room
 * stops writing for the rest of this tab's life rather than expiring on every
 * save and re-writing the same stale array a sentence later.
 *
 * What the citizen loses is the local copy of a conversation that has already
 * ended; the record on the server still has it, and the next open hydrates from
 * there. What they keep is a screen that does not rewrite itself at midnight.
 */
const ended = new Set<string>();

export function saveDay(turns: StoredTurn[], at: Date = new Date()): void {
  const s = store();
  if (!s) return;
  const key = KEY;
  if (ended.has(key)) return;
  try {
    const raw = s.getItem(key);
    const had = raw ? DaySchema.safeParse(JSON.parse(raw)) : null;
    if (had?.success && had.data.day !== today(at)) { ended.add(key); s.removeItem(key); return; }
    s.setItem(key, JSON.stringify({ day: today(at), turns: turns.slice(-MAX_TURNS) }));
  } catch { /* a full quota is not worth an error boundary */ }
}

/**
 * ── THE DAY'S SEED, AND WHY IT IS NOT A RANDOM NUMBER ─────────────────────
 *
 * Her mood is chosen from this. It was `Math.random()` held in a ref, which
 * meant a NEW MIRA ON EVERY PAGE LOAD: announce "Wide awake and slightly
 * dangerous", refresh, get a different character. A mood that survives less
 * time than the tab is not a mood.
 *
 * It also has to be the SAME number the greeting and the answers both use, or
 * she announces one Mira in the badge and delivers another in the next
 * sentence — the exact incoherence `greeting.ts` guards against one level down,
 * where it prefers the mood's own openers instead of appending them to a shared
 * pool.
 *
 * So: one integer, derived from the calendar day, stable for that day on that
 * device, and gone with everything else at midnight.
 *
 * ── AND WHY IT IS NOW ONLY THE FIRST PAINT ────────────────────────────────
 *
 * A number derived HERE is a number that differs between her phone and her
 * laptop, and changes mid-conversation when site data is cleared — which is a
 * different Mira in each hand on the same afternoon. The server derives the
 * seed from the citizen rather than from the browser and returns the one it
 * used on every reply and on the greeting. This is what the screen holds until
 * the first of those answers, and nothing more.
 */
/**
 * The ceiling is the API's, and they have to agree.
 *
 * `GreetSchema` bounds `seed` at ten million, so a seed above it is not a large
 * number — it is a 400 on every greeting, on every open. The first version
 * returned a full 32-bit hash and did exactly that; the spec caught it because
 * the bound was written into the test to match the schema rather than to match
 * the implementation.
 *
 * Ten million is far more than the pickers need — every consumer takes it
 * modulo a list of six or seven — so narrowing costs nothing real.
 */
const SEED_CEILING = 10_000_000;

export function daySeed(at: Date = new Date()): number {
  const day = today(at);
  let h = 0;
  for (let i = 0; i < day.length; i++) h = (h * 31 + day.charCodeAt(i)) | 0;
  // Mixed with the device's own record so two people do not get the same Mira
  // on the same date — a mood is hers with YOU, not the day's horoscope.
  return Math.abs(h ^ deviceSalt()) % SEED_CEILING;
}

/** A per-device integer, made once and kept. Not an identifier: it never leaves
 *  the browser and nothing is looked up by it. */
function deviceSalt(): number {
  const s = store();
  if (!s) return 0;
  try {
    const had = s.getItem(SALT_KEY);
    if (had) return Number(had) || 0;
    const made = Math.floor(Math.random() * 1_000_000);
    s.setItem(SALT_KEY, String(made));
    return made;
  } catch { return 0; }
}

/**
 * True the FIRST time this is called on a given day, false every time after.
 *
 * She announces her mood once a day, not once a session — somebody who opens
 * the app nine times before lunch does not need telling nine times what kind of
 * day she is having. That is a catchphrase, and catchphrases are how a
 * character dies. The call is what marks it, so ask once per open.
 */
export function firstOpenToday(at: Date = new Date()): boolean {
  const s = store();
  if (!s) return true;
  try {
    if (s.getItem(GREETED_KEY) === today(at)) return false;
    s.setItem(GREETED_KEY, today(at));
    return true;
  } catch { return true; }
}

/** Forget today. Clears ONE room's thread when named — "Forget today" is
 *  pressed inside a tab, and forgetting the friend must not take the
 *  assistant's errands with it. There is one thread now, so the parameter is
 *  ignored and everything goes — a button that says it forgets today must not
 *  leave half of today on the screen. The greeting marker goes with it:
 *  half-remembering having said hello is worse than saying it twice. */
export function clearDay(): void {
  const s = store();
  if (!s) return;
  try {
    // Clearing hands the room back: a day that ended is forgotten anyway, and a
    // room that may not write again is a room where the next sentence would not
    // survive a refresh.
    // ONE ROOM, SO CLEARING CLEARS IT. The old signature let "Forget today" in
    // one tab leave the other tab's thread standing; with a single thread on
    // screen that behaviour would leave visible turns behind after the citizen
    // pressed the button that says it forgets them.
    s.removeItem(KEY);
    s.removeItem(FRIEND_KEY);
    ended.delete(KEY);
    ended.delete(FRIEND_KEY);
    s.removeItem(GREETED_KEY);
  } catch { /* nothing to do about it */ }
}
