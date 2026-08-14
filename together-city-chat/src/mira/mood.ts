import type { LevityLevel } from './levity';

/**
 * Mira's moods.
 *
 * Mood is NOT levity, and keeping the two apart is the whole design.
 *
 *   LEVITY is permission — how funny she is ALLOWED to be. It is governed by
 *   safety: distress, the listen lane, a failed step, medical, R4. It is not
 *   hers to choose and no mood reaches it.
 *
 *   MOOD is colour — WHICH version of her turns up today. Sharper or warmer,
 *   quicker or quieter. It is hers, it varies between sessions, and it changes
 *   word choice and rhythm rather than what she is willing to joke about.
 *
 * The reason to have it at all: a character who is identical every session is a
 * feature with a personality bolted on. People notice moods in each other
 * within a sentence or two, and noticing is what makes someone feel real.
 *
 * The reason it is deterministic rather than random: a random mood is a bug
 * generator. It cannot be reproduced from a support ticket, cannot be tested,
 * and produces the one thing moods must never produce — whiplash inside a
 * single conversation.
 */

export type Mood = 'wry' | 'warm' | 'sharp' | 'brisk' | 'mischievous' | 'quiet';

export interface MoodProfile {
  id: Mood;
  /** What she says if asked what kind of day she is having. Answered plainly, never coy. */
  blurb: string;
  /** Soft ceiling on sentence length. Rhythm is most of what a mood actually is. */
  words: number;
  /** How she acknowledges before doing something. */
  ack: string[];
  /** Openers in this colour. Levity still decides whether the sharper ones are reachable. */
  opens: string[];
  /**
   * Shifts levity WITHIN the permitted level, never across it. A +1 on a cap of
   * 0 is still 0 — which is the single most important line in this file.
   */
  tilt: -1 | 0 | 1;
}

export const MOODS: Record<Mood, MoodProfile> = {
  wry: {
    id: 'wry',
    blurb: 'Dry one today.',
    words: 14,
    ack: ['Right.', 'Mm.', 'Sure.'],
    opens: ['Right. Where do we start?', 'Go on then.', 'Something’s happened, hasn’t it.'],
    tilt: 0,
  },
  warm: {
    id: 'warm',
    blurb: 'Good one, actually.',
    words: 20,
    ack: ['Yeah, of course.', 'Got it.', 'On it.'],
    opens: ['Hey. Good to see you. What’s first?', 'There you are. What do you need?', 'Hello. Take your time.'],
    tilt: 0,
  },
  sharp: {
    id: 'sharp',
    blurb: 'Wide awake and slightly dangerous.',
    words: 11,
    ack: ['Done.', 'Yep.', 'Already on it.'],
    opens: ['Go. What are we fixing?', 'You’re up early. Suspicious.', 'Three things are on fire. Two are yours.'],
    tilt: 1,
  },
  brisk: {
    id: 'brisk',
    blurb: 'Head down today.',
    words: 9,
    ack: ['On it.', 'Yep.', 'Doing it.'],
    opens: ['What’s first?', 'Ready when you are.', 'Go.'],
    tilt: -1,
  },
  mischievous: {
    id: 'mischievous',
    blurb: 'Trouble, mostly.',
    words: 16,
    ack: ['Oh, we’re doing this?', 'Fine.', 'Interesting.'],
    opens: [
      'Oh good, you’re here. I was starting to make my own decisions.',
      'Let me guess. It’s about the thing from Tuesday.',
      'Back so soon. Something’s gone wrong, hasn’t it.',
    ],
    tilt: 1,
  },
  quiet: {
    id: 'quiet',
    blurb: 'Low-key. Still here.',
    words: 8,
    ack: ['Mm.', 'Okay.', 'Yeah.'],
    opens: ['Hey.', 'I’m here. What do you need?', 'What’s first?'],
    tilt: -1,
  },
};

export const ALL_MOODS = Object.keys(MOODS) as Mood[];

/**
 * At L0 every mood collapses to the same still register.
 *
 * This is the rule that stops moods from leaking into the one place they must
 * not. A mischievous Mira in a distress turn is not "mischievous but quiet" —
 * she is simply quiet. Personality doing ANYTHING visible while somebody is
 * telling her something hard is the failure the governor exists to prevent,
 * and a mood system is exactly the sort of thing that would reintroduce it by
 * the side door.
 */
export const STILL: MoodProfile = {
  id: 'quiet',
  blurb: 'Here.',
  words: 12,
  ack: ['Yeah.', 'Okay.'],
  opens: ['Hey.', 'I’m here.'],
  tilt: 0,
};

export interface MoodInput {
  /** Session counter. NOT a random number — a mood must be reproducible. */
  seed: number;
  hour: number;
  /** What they asked for explicitly, if anything. Always wins. */
  requested?: Mood;
  /** The previous session ended somewhere heavy. */
  lastSessionDistressed?: boolean;
}

/**
 * Which Mira turns up.
 *
 * Chosen ONCE per session and held. Re-rolling per turn is what would make her
 * feel unstable rather than moody — people change mood over hours, not between
 * two sentences.
 */
export function moodFor(i: MoodInput): Mood {
  if (i.requested) return i.requested;
  if (i.lastSessionDistressed) return 'quiet';
  // Small hours skew low-key. Not a rule about safety — a rule about plausibility.
  if (i.hour < 6) return i.seed % 2 === 0 ? 'quiet' : 'wry';
  const pool: Mood[] = ['wry', 'warm', 'sharp', 'brisk', 'mischievous', 'wry', 'warm'];
  return pool[Math.abs(i.seed) % pool.length];
}

/** The profile to compose with, given the mood and what levity permits. */
export function profileFor(mood: Mood, level: LevityLevel): MoodProfile {
  return level === 0 ? STILL : MOODS[mood];
}

/**
 * Levity after the mood's tilt — clamped to the permitted level.
 *
 * `cap` is what the governor allowed. A mood may make her quieter than she is
 * allowed to be; it may never make her louder.
 */
export function tilted(mood: Mood, cap: LevityLevel): LevityLevel {
  if (cap === 0) return 0;
  const t = MOODS[mood].tilt;
  const out = Math.max(0, Math.min(cap, cap + t));
  return out as LevityLevel;
}

/** Everything she might say under any mood — for the voice spec to sweep. */
export function allMoodLines(): string[] {
  const out: string[] = [];
  for (const m of Object.values(MOODS)) out.push(...m.opens, ...m.ack, m.blurb);
  out.push(...STILL.opens, ...STILL.ack, STILL.blurb);
  return out;
}
