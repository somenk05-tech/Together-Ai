import type { LevityLevel } from './levity';
import { moodFor, profileFor, type Mood } from './mood';

/**
 * What Mira opens with.
 *
 * The greeting is where the governor is most visible and most dangerous. It is
 * the first thing on screen, chosen BEFORE she knows anything about the turn —
 * so it reads the session rather than the message: how long they have known
 * her, the hour, and whether the last session ended somewhere heavy.
 *
 * She is playful from the first session (owner decision, 14 Aug). What survives
 * that decision is the floor: a session after a hard one opens plain, whatever
 * the dial says.
 *
 * AND EVERY TEASE TARGETS A CHOICE. A flight time, a fourth pizza, a Tuesday
 * that came and went. Never an attribute — never them.
 */

export interface Greeting {
  /** The small line above — her mood, on the first open of the day. May be empty. */
  hello: string;
  /** The large line. Always present. */
  ask: string;
  level: LevityLevel;
  /** Which Mira turned up. Held for the session, not re-rolled per turn. */
  mood: Mood;
}

type Line = [hello: string, ask: string];

/**
 * Indexed by the level required to say it.
 *
 * A level is a CEILING, not a target: she draws from this level and every
 * level below it, so a citizen at L3 still gets plain openings sometimes. A
 * character who is always on is exhausting by Thursday.
 */
const LINES: Record<LevityLevel, Line[]> = {
  0: [
    ['Hey.', 'I’m here. What do you need?'],
    ['Hey.', 'No rush. What’s first?'],
    ['', 'Take your time.'],
  ],
  1: [
    ['', 'Hey. What are we fixing today?'],
    ['Morning', 'What’s first?'],
    ['Hello again', 'Right. Where do we start?'],
    ['Evening', 'Anything left over from today?'],
  ],
  2: [
    ['', 'You’re up early. Suspicious.'],
    ['Morning', 'Your calendar and I have both read today. Only one of us is worried.'],
    ['Back already', 'I’m flattered. What broke?'],
    ['Hello again', 'Three things are on fire. Two of them are yours.'],
  ],
  3: [
    ['Oh good, you’re here', 'I was starting to make my own decisions.'],
    ['Back so soon', 'Something’s gone wrong, hasn’t it.'],
    ['Hello again', 'Let me guess. It’s about the thing from Tuesday.'],
  ],
  4: [
    ['You again', 'At this point I’m less an assistant and more a disappointed parent.'],
    ['Ah', 'What are we breaking today?'],
  ],
};

/**
 * Lines that may only be said at a particular hour, and the level they need.
 *
 * Separate from the pool because a time-of-day joke told at the wrong time of
 * day is not a joke, it is a bug — and because these are the ones most likely
 * to be added carelessly later.
 */
const TIMED: Array<{ from: number; to: number; level: LevityLevel; line: Line }> = [
  { from: 0, to: 5, level: 1, line: ['It’s late', 'I’m here anyway. What do you need?'] },
  { from: 0, to: 4, level: 4, line: ['It’s two in the morning', 'Whatever this is, it can’t be good.'] },
];

/**
 * The fourth wall — rate-limited, in code.
 *
 * "I don't sleep" only lands if she has not said anything like it in a month.
 * A counter, not a vibe: pass how many sessions ago she last broke it.
 */
const FOURTH_WALL: Line = ['', 'I don’t sleep. Unlike you, apparently.'];
export const FOURTH_WALL_EVERY = 40;

export interface GreetingInput {
  /** Which Mira turned up. Omit and one is chosen from the seed. */
  mood?: Mood;
  /**
   * First open of the day.
   *
   * She announces her mood ONCE A DAY, not once a session. Somebody who opens
   * the app nine times before lunch does not need telling nine times what kind
   * of day she is having — that is a catchphrase, and catchphrases are how a
   * character dies. On later opens the small line goes back to being small.
   */
  firstOfDay?: boolean;
  /** Whole weeks since their first session. Humour is earned. */
  weeksKnown: number;
  /** Their local hour, 0–23. Never the server's. */
  hour: number;
  /** The previous session tripped the distress signal. Sticky across sessions, deliberately. */
  lastSessionDistressed?: boolean;
  /** Their explicit setting: 0 less · 1 default · 2 more. */
  dial?: 0 | 1 | 2;
  /** Sessions since she last broke the fourth wall. */
  sessionsSinceFourthWall?: number;
  /** Rotates the pick. Pass the session count — NOT a random number, so a greeting is reproducible. */
  seed: number;
}

/**
 * The level she is allowed to open at, before any line is chosen.
 *
 * Playful from the first session (owner decision, 14 Aug — see levity.ts). The
 * warm-up ramp is gone; the one hard floor is not, and it is the reason this
 * function exists rather than being a constant.
 */
export function greetingLevel(i: GreetingInput): LevityLevel {
  // Nobody comes back after a hard night and gets a joke about their calendar.
  // This is not a tone setting and no dial reaches it.
  if (i.lastSessionDistressed) return 0;
  if (i.dial === 0) return 1;
  if (i.hour < 6) return 2;   // the small hours take the edge off, not the warmth
  return i.dial === 2 ? 4 : 3;
}

export function greet(i: GreetingInput): Greeting {
  const level = greetingLevel(i);
  const mood = i.mood ?? moodFor({ seed: i.seed, hour: i.hour, lastSessionDistressed: i.lastSessionDistressed });
  const profile = profileFor(mood, level);

  /**
   * The mood declaration takes the small line.
   *
   * It fits the layout that already existed — "Hello, Somen" was doing nothing
   * a name badge in the corner does not already do, and this says something
   * only she can say. After a hard session it is `STILL.blurb` — "Here." —
   * which is honest, short, and not a performance.
   */
  const badge = i.firstOfDay ? profile.blurb : '';

  // The fourth wall jumps the queue when it is due — and only then.
  const since = i.sessionsSinceFourthWall ?? 0;
  if (level >= 3 && since >= FOURTH_WALL_EVERY) {
    return { hello: badge || FOURTH_WALL[0], ask: FOURTH_WALL[1], level, mood };
  }

  const timed = TIMED.filter((t) => t.level <= level && i.hour >= t.from && i.hour < t.to);
  // A level is a ceiling: draw from it and everything below, so she is never
  // relentlessly on.
  const pool: Line[] = [];
  for (let l = 0 as LevityLevel; l <= level; l = (l + 1) as LevityLevel) pool.push(...LINES[l]);
  for (const t of timed) pool.push(t.line);

  /**
   * Her mood's own openers are PREFERRED, not merely added.
   *
   * The first cut appended them to the end of the shared pool, and the result
   * was incoherent in a way only visible once it was printed: "Wide awake and
   * slightly dangerous." followed by "Take your time." The badge announced one
   * Mira and the line delivered another.
   *
   * A mood that does not reach the sentence is not a mood, it is a label. So
   * two openings in three come from the mood itself; the third keeps the shared
   * pool in play so she is not reciting the same three lines per mood.
   *
   * Below L2 the register is too quiet to carry a colour, and forcing one would
   * be the mood leaking into a level that did not ask for it.
   */
  const useMood = level >= 2 && profile.opens.length > 0 && Math.abs(i.seed) % 3 !== 0;
  const [hello, ask] = useMood
    ? ['', profile.opens[Math.abs(i.seed) % profile.opens.length]]
    : pool[Math.abs(i.seed) % pool.length];

  return { hello: badge || hello, ask, level, mood };
}

/** Every line she could ever open with — for the voice spec to sweep. */
export function allGreetings(): string[] {
  const out: string[] = [];
  for (const l of Object.values(LINES)) for (const [h, a] of l) out.push(`${h} ${a}`.trim());
  for (const t of TIMED) out.push(`${t.line[0]} ${t.line[1]}`.trim());
  out.push(`${FOURTH_WALL[0]} ${FOURTH_WALL[1]}`.trim());
  return out;
}
