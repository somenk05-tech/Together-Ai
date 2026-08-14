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

/**
 * One sentence, coloured only as far as she is allowed.
 *
 * `core` is the answer and is never rewritten — an aside is appended, never
 * substituted, so the fact survives every level. That ordering is deliberate:
 * a citizen skimming reads the first clause, and the first clause is always
 * the thing they asked for.
 */
export function say(core: string, c: Colour, asides: string[] = [], span: Span = 'body'): string {
  const text = core.trim();
  if (!asides.length) return text;
  if (!spanAllowsLevity(c.level, span)) return text;
  if (c.level < ASIDE_FROM) return text;

  // A mood's tilt moves within the permitted level, never across it — so a
  // quiet mood at L2 keeps its aside to itself and a mischievous one at L3
  // does not become an L4.
  const p = profileFor(c.mood, c.level);
  if (p.tilt < 0 && c.level < 3) return text;

  const pick = asides[Math.abs(c.seed) % asides.length];
  if (!pick) return text;

  // A long answer plus a long aside is a paragraph, and she does not write
  // paragraphs. The mood's word budget is the ceiling for the whole line.
  if (words(text) + words(pick) > p.words * 2) return text;

  return `${text} ${pick.trim()}`;
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
