import { spanAllowsLevity, type LevityLevel } from './levity';
import { profileFor, type Mood } from './mood';

/**
 * Where the humour actually lands.
 *
 * ── THE BUG THIS FIXES ────────────────────────────────────────────────────
 *
 * `levity()` computed a level, `moodFor()` picked a colour, and the executor
 * then returned a bare sentence and dropped both on the floor. Every safety rail
 * in the governor worked perfectly and guarded nothing, because no answer ever
 * carried any personality for it to govern. "Deadpool but sensitive" was a spec
 * with no implementation, which is worse than no spec: it reads as done.
 *
 * ── WHY THE JOKES ARE DATA ────────────────────────────────────────────────
 *
 * Each branch of the executor hands up its plain sentence AND a small set of
 * asides that would be true of that answer. This module decides whether one is
 * allowed and which one. That split is the entire safety property:
 *
 *   THE BRANCH CANNOT MAKE ITSELF FUNNY. Only `say()` can, and `say()` asks
 *   `spanAllowsLevity()` first — which is false in a confirmation clause at
 *   every level, and false everywhere at L0, which is where distress, the
 *   listen lane, a failed step, medical and R4 all land.
 *
 * A model asked to "read the room and be funny when appropriate" misreads it
 * exactly where misreading is worst. A table of asides gated by a computed
 * level cannot.
 *
 * ── AND WHY THE CHOICE IS DETERMINISTIC ───────────────────────────────────
 *
 * Same seed, same turn, same aside. A random one cannot be reproduced from a
 * support ticket, and gives her whiplash inside a single conversation — the
 * same argument `mood.ts` makes for choosing a mood from the seed rather than
 * from `Math.random()`.
 */

export interface Colour {
  mood: Mood;
  level: LevityLevel;
  /** Session counter, not a random number. */
  seed: number;
}

export type Span = 'lede' | 'body' | 'confirm' | 'receipt';

/** Below this she is straight. At 2 she is dry; at 3 she is properly herself. */
const ASIDE_FROM: LevityLevel = 2;

export interface Said {
  text: string;
  /** An aside was available and the length budget, not the governor, took it. */
  asideDropped: boolean;
}

/**
 * One sentence, coloured only as far as she is allowed — and the record of it.
 *
 * `core` is the answer and is never rewritten — an aside is added, never
 * substituted, so the fact survives every level. That ordering is deliberate:
 * a citizen skimming reads the first clause, and the first clause is always
 * the thing they asked for.
 *
 * ── WHY THIS RETURNS A TRACE ──────────────────────────────────────────────
 *
 * The word budget below silently threw the aside away, and it threw it away on
 * the LONGEST answers — the ones where she has most to say and where the ratio
 * matters most. `levity.ts` calls that "the ratio being lost to arithmetic on
 * the turn that mattered", and until now there was no way to count it: no log,
 * no ledger field, nothing that could tell a budget drop from a governor
 * refusal. `asideDropped` says only that — an aside existed and the ARITHMETIC
 * took it. A governor refusal is not a drop; it is the system working.
 */
export function sayWithTrace(core: string, c: Colour, asides: string[] = [], span: Span = 'body'): Said {
  const text = core.trim();
  const bare = (asideDropped = false): Said => ({ text, asideDropped });
  if (!asides.length) return bare();
  if (!spanAllowsLevity(c.level, span)) return bare();
  if (c.level < ASIDE_FROM) return bare();

  // A mood's tilt moves within the permitted level, never across it — so a
  // quiet mood at L2 keeps its aside to itself and a mischievous one at L3
  // does not become an L4.
  const p = profileFor(c.mood, c.level);
  if (p.tilt < 0 && c.level < 3) return bare();

  const pick = asides[Math.abs(c.seed + turnOf(text)) % asides.length];
  if (!pick) return bare();

  // A long answer plus a long aside is a paragraph, and she does not write
  // paragraphs. The mood's word budget is the ceiling for the whole line.
  if (words(text) + words(pick) > p.words * 2) return bare(true);

  return { text: weave(text, pick.trim()), asideDropped: false };
}

/** The same thing, said. Kept so no caller has to care about the trace. */
export function say(core: string, c: Colour, asides: string[] = [], span: Span = 'body'): string {
  return sayWithTrace(core, c, asides, span).text;
}

/**
 * THE TURN DISCRIMINATOR, AND WHY IT IS THE ANSWER ITSELF.
 *
 * The index was `seed % asides.length`, and `seed` is the SESSION counter — so
 * every turn in one session drew the same aside from the same table. Two
 * navigations in a row both ended "It has been there the whole time", which
 * reads as a catchphrase rather than a character, and catchphrases are how a
 * character dies (`greeting.ts` makes the same argument about the mood badge).
 *
 * The answer's own text is the only thing already to hand that changes between
 * turns and does NOT change between replays of the same turn — so it is what
 * turns a session seed into a turn seed, with reproducibility intact: same
 * session and same answer give the same aside, from a support ticket or from a
 * test.
 */
const turnOf = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
};

/**
 * THE ASIDE GOES BEFORE A TRAILING QUESTION.
 *
 * Appending it put it after one: "Astrology. Want me to take you? It has been
 * there the whole time." — she ends on the wrong sentence, talking over the
 * offer the citizen has to answer. A question asked last is a question that
 * gets answered.
 */
function weave(core: string, aside: string): string {
  // An empty answer used to come back as " Aside." — the join happened whether
  // or not there was anything to join to.
  if (!core) return aside;
  const trailing = /^([\s\S]*[.!?])\s+([^.!?]*\?)$/.exec(core);
  if (trailing) return `${trailing[1]} ${aside} ${trailing[2]}`;
  return `${core} ${aside}`;
}

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length;

/**
 * The one thing she says when a hub has nothing to give.
 *
 * Separate from `say()` because an empty answer is where an assistant is most
 * tempted to fill the silence, and filling it is how you get "I couldn't find
 * anything, but here are some suggestions!" — an invented list attached to a
 * real absence.
 */
export function nothing(subject: string, c: Colour, asides: string[] = []): string {
  return say(`Nothing in ${subject} yet.`, c, asides);
}
