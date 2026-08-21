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
  /**
   * Which line this was — stable across sessions, and the caller's to keep.
   *
   * Pass the last few back in `exclude` and she stops repeating herself. Ids
   * are positional within a level's list, so a line may be APPENDED to a level
   * freely and must not be inserted into the middle of one: somebody's stored
   * "recently said" list would then point at a different sentence.
   */
  id: string;
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
    ['Hello again', 'Right. Where do we start?'],
  ],
  2: [
    ['Back already', 'I’m flattered. What broke?'],
    ['Hello again', 'I have been staring at a wall. Give me something.'],
    ['', 'Right. What are we not dealing with?'],
  ],
  3: [
    ['Oh good, you’re here', 'I was starting to make my own decisions.'],
    ['Back so soon', 'Something’s gone wrong, hasn’t it.'],
    ['Hello again', 'Let me guess. This is not a small one.'],
  ],
  4: [
    ['You again', 'At this point I’m less an assistant and more a disappointed parent.'],
    ['Ah', 'What are we breaking today?'],
  ],
};

/**
 * SHE ONLY CLAIMS WHAT SHE WAS GIVEN — and three of the best lines went for it.
 *
 * Removed 21 Aug, and they were the three funniest in the file:
 *
 *   "Your calendar and I have both read today. Only one of us is worried."
 *   "Three things are on fire. Two of them are yours."
 *   "Let me guess. It’s about the thing from Tuesday."
 *
 * `GreetingInput` carries a mood, an hour, a dial, a seed and two counters. It
 * carries no calendar, no unread count and no last topic — so all three were
 * confident inventions about the citizen's own data, said in the first line of
 * the session, before she had looked anything up. §25 is truth over
 * reassurance, and a sentence does not stop making a claim because it is a
 * joke: somebody with an empty calendar and a quiet Tuesday reads the opening
 * line and learns, correctly, that she makes things up. Everything she says
 * after that is worth less.
 *
 * The replacements hold the register and assert nothing. If a real calendar or
 * a real unread count ever reaches this input, the originals can come back —
 * behind a condition on the actual number.
 */

/**
 * Lines that may only be said at a particular hour, and the level they need.
 *
 * Separate from the pool because a time-of-day joke told at the wrong time of
 * day is not a joke, it is a bug — and because these are the ones most likely
 * to be added carelessly later.
 */
const TIMED: Array<{ from: number; to: number; level: LevityLevel; line: Line }> = [
  { from: 0, to: 5, level: 1, line: ['It’s late', 'I’m here anyway. What do you need?'] },
  { from: 5, to: 12, level: 1, line: ['Morning', 'What’s first?'] },
  { from: 17, to: 23, level: 1, line: ['Evening', 'Anything left over from today?'] },
  { from: 5, to: 9, level: 2, line: ['', 'You’re up early. Suspicious.'] },
];

/**
 * The three above arrived here from the pool, where they had no hour at all.
 *
 * "Morning", "Evening" and "You’re up early. Suspicious." sat in `LINES` and
 * were drawn from the seed, so "Evening" could and did fire at nine in the
 * morning. That is the exact failure this table was written to prevent, and it
 * was happening two declarations above it.
 *
 * The 2 a.m. line — "It’s two in the morning. Whatever this is, it can’t be
 * good." — was DELETED rather than moved. It asked for L4, and `greetingLevel`
 * returns 2 for every hour before six, checked before the dial is read, so no
 * citizen could ever reach it. Re-admitting it at L2 would make the small hours
 * louder than the damper exists to allow, and the damper is the stronger rule
 * and the spec'd one. The L1 "It’s late" line already keeps that hour.
 */

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
  /**
   * Whole weeks since their first session.
   *
   * NO LONGER READ. The comment here used to say "humour is earned", which
   * stopped being true on 14 Aug when the owner made her playful from the first
   * session and the warm-up ramp came out of `greetingLevel` — leaving a field
   * that documented a rule the file had deleted. It is kept, and kept in the
   * input, for the reason `levity.ts` keeps its own copy: it is genuine session
   * context, and reversing that decision should be a one-line change in
   * `greetingLevel` rather than a re-plumb through the controller.
   */
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
  /**
   * Ids she used recently. Skipped, so she stops saying the same four things.
   *
   * The mood cycled on the seed and the line cycled on the seed, with periods
   * of 7 and 3 — a combined period of 42. Over forty-five consecutive sessions
   * she produced twenty-four distinct openings and then repeated them exactly,
   * in order. Nobody who writes the lines ever sees that, because it only shows
   * up on somebody's fortieth session, which is somebody who likes her.
   *
   * Held by the CALLER rather than in here, for the same reason `answering` is
   * in `choose.ts`: this module is a pure function of its input, and a server
   * that remembers the last greeting is a server that has to expire it, scope
   * it to a device, and decide what two open tabs mean.
   */
  exclude?: string[];
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

/** A line and the name it is remembered by. */
type Candidate = { id: string; line: Line };

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
    return { hello: badge || FOURTH_WALL[0], ask: FOURTH_WALL[1], level, mood, id: 'fourth-wall' };
  }

  // A level is a ceiling: draw from it and everything below, so she is never
  // relentlessly on.
  const pool: Candidate[] = [];
  for (let l = 0 as LevityLevel; l <= level; l = (l + 1) as LevityLevel) {
    LINES[l].forEach((line, n) => pool.push({ id: `line.${l}.${n}`, line }));
  }
  for (const t of TIMED) {
    if (t.level <= level && i.hour >= t.from && i.hour < t.to) pool.push({ id: `timed.${t.from}.${t.level}`, line: t.line });
  }

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
  const opens: Candidate[] = level >= 2
    ? profile.opens.map((ask, n) => ({ id: `mood.${mood}.${n}`, line: ['', ask] as Line }))
    : [];
  const useMood = opens.length > 0 && Math.abs(i.seed) % 3 !== 0;

  /**
   * THE INDEX DIVIDES THE SEED IT HAS ALREADY USED.
   *
   * The line above spends `seed % 3` deciding WHETHER to use the mood, and the
   * pick below used to spend `seed % opens.length` deciding WHICH — and every
   * mood but `wry` has exactly three openers. The two conditions were reading
   * the same digit: `opens[0]` needs `seed % 3 === 0`, which is precisely the
   * case that had already sent her to the shared pool. Four of her six moods
   * carried a first line no citizen could ever be shown.
   *
   * Dividing by the modulus already spent is the whole fix: what is left is
   * independent of the digit that chose the list.
   */
  const rank = Math.floor(Math.abs(i.seed) / 3);
  const exclude = i.exclude ?? [];
  const unsaid = (cands: Candidate[]) => cands.filter((c) => !exclude.includes(c.id));
  const preferred = useMood ? opens : pool;
  // Her mood's lines first, then anything else she has not just said. If she
  // has said all of it recently she still has to open her mouth, and repeating
  // the oldest is the least bad of the remaining options.
  const from = unsaid(preferred).length ? unsaid(preferred)
    : unsaid(pool).length ? unsaid(pool)
      : preferred;

  const chosen = from[rank % from.length];
  const [hello, ask] = chosen.line;

  return { hello: badge || hello, ask, level, mood, id: chosen.id };
}

/** Every line she could ever open with — for the voice spec to sweep. */
export function allGreetings(): string[] {
  const out: string[] = [];
  for (const l of Object.values(LINES)) for (const [h, a] of l) out.push(`${h} ${a}`.trim());
  for (const t of TIMED) out.push(`${t.line[0]} ${t.line[1]}`.trim());
  out.push(`${FOURTH_WALL[0]} ${FOURTH_WALL[1]}`.trim());
  return out;
}
