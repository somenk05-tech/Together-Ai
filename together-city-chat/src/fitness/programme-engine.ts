import { EXERCISE_CATALOG, exerciseGifUrl, exerciseThumbUrl, type CatalogExercise } from './exercise-catalog';
import type { Condition, Equipment } from './exercise-library';
import { GOAL_PRESCRIPTION, LEVEL_ADJUST, type BodyGoalKey, type LevelKey } from './session-engine';

/**
 * ── A MONTH WITH A TRAINER ──────────────────────────────────────────────────
 *
 * The owner, 6 Sep: "Imagine this entire thing like a personal trainer telling
 * you which body part you are working on on that given day, showing you the
 * workout, and making you work the next body part the next day — all from
 * the user's data. An experienced personal trainer making the plan for each
 * user for one month, from all the exercises in the database."
 *
 * WHAT A TRAINER ACTUALLY DOES, and this is the shape of the file. They look
 * at how many days you can give them and pick a SPLIT — full body, push/pull/
 * legs, upper/lower — so every muscle is worked and then left alone long
 * enough to grow. They lay the split over the calendar with rest between the
 * hard days. They pick movements from what you have to train with, compound
 * first, one or two per muscle. They keep the same movements for two weeks so
 * you can add load, then change them so you do not stall. And they build the
 * month in PHASES: a base week, a build week, a peak week, a deload — because
 * four weeks of the same effort is how people get hurt, not strong.
 *
 * THE POOL is the whole catalogue: 1,324 movements, each with the muscle it
 * is for, the kit it needs and its own steps and animation. A movement is
 * offered only when its kit is on the citizen's list (or the room is a gym),
 * only when no declared condition rules it out, and never twice in a week.
 *
 * DETERMINISTIC. Same citizen, same profile, same day: same month. The only
 * randomness is a seeded shuffle keyed on the citizen and the week's variant,
 * so two citizens with the same profile get different movements and one
 * citizen gets the same month on every open. No Prisma, no clock — the day
 * arrives in the argument, and that is what lets all of it be tested.
 */

export type DayKind = 'strength' | 'cardio' | 'rest';
export type Phase = 'base' | 'build' | 'peak' | 'deload';

/** The muscles the catalogue is indexed by, and the words a citizen reads. */
export type Muscle =
  | 'pectorals' | 'delts' | 'triceps' | 'lats' | 'upper back' | 'biceps' | 'traps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs';

export const MUSCLE_WORDS: Record<Muscle, string> = {
  pectorals: 'chest', delts: 'shoulders', triceps: 'triceps', lats: 'lats', 'upper back': 'upper back',
  biceps: 'biceps', traps: 'traps', forearms: 'forearms', quads: 'quads', hamstrings: 'hamstrings',
  glutes: 'glutes', calves: 'calves', abs: 'core',
};

/** A slot on a day: the muscle, and whether the movement should be a big one. */
interface Slot { muscle: Muscle; compound: boolean }

/** A day of the split: what it is called, and the slots in the order they are done. */
export interface SplitDay { key: string; title: string; parts: string; slots: Slot[] }

const S = (muscle: Muscle, compound = false): Slot => ({ muscle, compound });

/**
 * THE SPLITS, BY DAYS A WEEK. What a trainer would write on the whiteboard.
 * Compound slots come first on every day — the movements that need the most
 * of you are done while you have the most to give. Core closes the day.
 */
export const SPLITS: Record<number, SplitDay[]> = {
  2: [
    { key: 'full-a', title: 'Full body A', parts: 'legs, chest, back & core', slots: [S('quads', true), S('pectorals', true), S('lats', true), S('delts'), S('hamstrings'), S('abs')] },
    { key: 'full-b', title: 'Full body B', parts: 'glutes, back, shoulders & arms', slots: [S('glutes', true), S('upper back', true), S('pectorals', true), S('hamstrings'), S('biceps'), S('triceps'), S('abs')] },
  ],
  3: [
    { key: 'push', title: 'Push', parts: 'chest, shoulders & triceps', slots: [S('pectorals', true), S('delts', true), S('pectorals'), S('delts'), S('triceps'), S('triceps'), S('abs')] },
    { key: 'pull', title: 'Pull', parts: 'back & biceps', slots: [S('lats', true), S('upper back', true), S('lats'), S('biceps'), S('upper back'), S('biceps'), S('abs')] },
    { key: 'legs', title: 'Legs', parts: 'quads, hamstrings, glutes & calves', slots: [S('quads', true), S('hamstrings', true), S('glutes', true), S('quads'), S('glutes'), S('calves'), S('abs')] },
  ],
  4: [
    { key: 'upper-a', title: 'Upper A', parts: 'chest, back & shoulders', slots: [S('pectorals', true), S('lats', true), S('delts', true), S('upper back'), S('triceps'), S('biceps'), S('abs')] },
    { key: 'lower-a', title: 'Lower A', parts: 'quads, glutes & calves', slots: [S('quads', true), S('glutes', true), S('hamstrings'), S('quads'), S('calves'), S('abs')] },
    { key: 'upper-b', title: 'Upper B', parts: 'back, chest & arms', slots: [S('upper back', true), S('pectorals', true), S('lats'), S('delts'), S('biceps'), S('triceps'), S('abs')] },
    { key: 'lower-b', title: 'Lower B', parts: 'hamstrings, glutes & calves', slots: [S('hamstrings', true), S('glutes', true), S('quads'), S('glutes'), S('calves'), S('abs')] },
  ],
  5: [
    { key: 'push', title: 'Push', parts: 'chest, shoulders & triceps', slots: [S('pectorals', true), S('delts', true), S('pectorals'), S('triceps'), S('delts'), S('triceps'), S('abs')] },
    { key: 'pull', title: 'Pull', parts: 'back & biceps', slots: [S('lats', true), S('upper back', true), S('lats'), S('biceps'), S('traps'), S('biceps'), S('abs')] },
    { key: 'legs', title: 'Legs', parts: 'quads, hamstrings, glutes & calves', slots: [S('quads', true), S('hamstrings', true), S('glutes', true), S('quads'), S('calves'), S('abs')] },
    { key: 'upper', title: 'Upper', parts: 'chest, back, shoulders & arms', slots: [S('pectorals', true), S('lats', true), S('delts'), S('upper back'), S('biceps'), S('triceps'), S('abs')] },
    { key: 'lower', title: 'Lower', parts: 'glutes, hamstrings, quads & calves', slots: [S('glutes', true), S('quads', true), S('hamstrings'), S('glutes'), S('calves'), S('abs')] },
  ],
  // Twice round in a week, so the second pass is its own day — A and B lead
  // with different muscles and never share a movement with the first pass.
  6: [
    { key: 'push-a', title: 'Push A', parts: 'chest, shoulders & triceps', slots: [S('pectorals', true), S('delts', true), S('pectorals'), S('triceps'), S('delts'), S('triceps'), S('abs')] },
    { key: 'pull-a', title: 'Pull A', parts: 'back & biceps', slots: [S('lats', true), S('upper back', true), S('lats'), S('biceps'), S('traps'), S('biceps'), S('abs')] },
    { key: 'legs-a', title: 'Legs A', parts: 'quads, hamstrings, glutes & calves', slots: [S('quads', true), S('hamstrings', true), S('glutes', true), S('quads'), S('calves'), S('abs')] },
    { key: 'push-b', title: 'Push B', parts: 'shoulders, chest & triceps', slots: [S('delts', true), S('pectorals', true), S('triceps'), S('pectorals'), S('delts'), S('triceps'), S('abs')] },
    { key: 'pull-b', title: 'Pull B', parts: 'upper back, lats & biceps', slots: [S('upper back', true), S('lats', true), S('biceps'), S('lats'), S('forearms'), S('biceps'), S('abs')] },
    { key: 'legs-b', title: 'Legs B', parts: 'glutes, hamstrings, quads & calves', slots: [S('glutes', true), S('quads', true), S('hamstrings'), S('glutes'), S('calves'), S('abs')] },
  ],
};

/** Which weekdays (Mon = 0) the training days land on, so hard days have rest
 *  between them where the week allows it. The default, used whenever the
 *  citizen has not said which days are theirs — see `placeTraining` below. */
const PLACEMENT: Record<number, number[]> = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
};

export const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

/**
 * ── WHAT A CITIZEN DOES ON A DAY OFF (owner, 9 Sep) ─────────────────────────
 *
 * "Let the user decide which two days they want a break — or if they don't
 * want a break, what they can do: maybe just a walk or a run or a swim,
 * something else."
 *
 * That last clause is the whole design. A trainer asked for seven training
 * days does not say yes and does not say no; they say *the seventh day is
 * easy*, and then ask what easy looks like for you. So an off day is never
 * nothing-or-everything: it is either genuine rest or one of these, and the
 * citizen picks which.
 *
 * `rest` is first because it is the answer a trainer gives by default.
 */
export const OFF_DAY_ACTIVITIES = ['rest', 'walk', 'run', 'swim', 'cycle', 'yoga'] as const;
export type OffDayActivity = (typeof OFF_DAY_ACTIVITIES)[number] | string;

const OFF_DAY_WORDS: Record<string, { title: string; parts: string; note: string; minutes: number }> = {
  rest: { title: 'Rest', parts: 'recovery', minutes: 20, note: 'A rest day is training too. A 20-minute walk, water, and sleep.' },
  walk: { title: 'Walk', parts: 'easy movement', minutes: 40, note: 'Easy on purpose. Brisk enough to be breathing, easy enough to talk — this is recovery, not a session.' },
  run: { title: 'Run', parts: 'easy movement', minutes: 30, note: 'Keep it conversational. If you finish this wanting to lie down, it was too fast to count as a day off.' },
  swim: { title: 'Swim', parts: 'easy movement', minutes: 30, note: 'Steady lengths, nothing timed. The water takes the load off everything you trained this week.' },
  cycle: { title: 'Cycle', parts: 'easy movement', minutes: 45, note: 'Flat and easy, spinning rather than grinding. Save the hills for a training day.' },
  yoga: { title: 'Yoga', parts: 'mobility & breath', minutes: 30, note: 'Whatever length you have. Range and breathing today — nothing that leaves you sore tomorrow.' },
};

/** A citizen's own word for it, printed as they wrote it. */
function offDay(activity: string | undefined): { title: string; parts: string; note: string; minutes: number } {
  const key = (activity ?? 'rest').trim();
  if (!key) return OFF_DAY_WORDS.rest;
  const known = OFF_DAY_WORDS[key.toLowerCase()];
  if (known) return known;
  return {
    title: key.slice(0, 24),
    parts: 'easy movement',
    minutes: 30,
    note: 'Your own choice for a day off — keep it easy. If it leaves you sore tomorrow it was a training day, and this month already has enough of those.',
  };
}

/**
 * WHERE THE TRAINING DAYS LAND, once the citizen has said which days are
 * theirs. The rest days WIN: they are somebody's Sunday lunch and somebody
 * else's night shift, and a plan that argues with a life is a plan that gets
 * abandoned in week two. What gives instead is the number of training days,
 * and the trainer says so out loud rather than quietly building a shorter week.
 *
 * The default placement is kept wherever it still fits inside the days the
 * citizen left free — so a citizen who picks Saturday and Sunday, which is
 * what the calendar assumed all along, gets exactly the week they had before.
 */
export function placeTraining(days: number, restDays: readonly number[] | undefined): number[] {
  const fallback = PLACEMENT[days] ?? PLACEMENT[3];
  if (!restDays || restDays.length === 0) return fallback;
  const off = new Set(restDays.filter((d) => d >= 0 && d <= 6));
  if (off.size === 0) return fallback;
  const free = [0, 1, 2, 3, 4, 5, 6].filter((d) => !off.has(d));
  if (free.length === 0) return [];
  if (fallback.every((d) => !off.has(d))) return fallback;
  const n = Math.min(days, free.length);
  /* Evenly spaced through the days that are left, so two hard days do not end
     up back to back when a whole free day sits between them. */
  return Array.from({ length: n }, (_, i) => free[Math.floor((i * free.length) / n)]);
}

/**
 * THE MONTH IN PHASES. Sets against the goal's prescription, reps against its
 * range, and a word for the citizen. Week three is the peak: same movements
 * as week one, more of them, and the note says to add load. Week four is the
 * deload — the week the body actually builds what the other three asked for.
 */
export const PHASES: Array<{ key: Phase; label: string; sets: number; reps: 'low' | 'full' | 'high'; restSec: number; note: string }> = [
  { key: 'base', label: 'Base', sets: -1, reps: 'full', restSec: 0, note: 'Learn the movements. Stop two reps short of failure on every set.' },
  { key: 'build', label: 'Build', sets: 0, reps: 'full', restSec: 0, note: 'New movements, one more set. Add a little load where last week felt easy.' },
  { key: 'peak', label: 'Peak', sets: 0, reps: 'low', restSec: +15, note: 'Week one’s movements again, heavier: fewer reps, a longer rest, the last set close to failure.' },
  { key: 'deload', label: 'Deload', sets: -1, reps: 'high', restSec: 0, note: 'Lighter on purpose. Fewer sets, easy reps, perfect form — this is the week the month pays out.' },
];

export interface ProgrammeExercise {
  id: string;
  name: string;
  muscle: Muscle;
  /** 'chest' · 'shoulders' — the citizen's word for it. */
  works: string;
  /** The catalogue's kit word: 'dumbbell', 'body weight', 'cable'. */
  equipment: string;
  sets: number;
  reps: [number, number];
  restSec: number;
  steps: string[];
  thumb: string;
  gif: string;
}

export interface ProgrammeDay {
  /** 0–27. */
  index: number;
  /** YYYY-MM-DD. */
  date: string;
  week: 1 | 2 | 3 | 4;
  phase: Phase;
  kind: DayKind;
  /** 'Pull' · 'Lower A' · 'Rest' · 'Cardio'. */
  title: string;
  /** 'back & biceps' — the body parts, in the citizen's words. */
  parts: string;
  /** The muscles the day works, in the catalogue's words. Empty on a rest day. */
  muscles: Muscle[];
  exercises: ProgrammeExercise[];
  /** Minutes of the day's cardio, on a cardio day; the walk to take, on a rest day. */
  cardioMinutes: number;
  /** One line from the trainer for the day. */
  note: string;
  /**
   * WHERE THIS DAY SITS IN THE SPLIT'S ROTATION, 0 … splitDays-1 — the index
   * into SPLITS[days] that produced it. Strength days only; absent on rest
   * and cardio. Carried so that moving a day (below) is arithmetic on two
   * numbers rather than a match on the printed title.
   */
  slot?: number;
}

/**
 * ── THE CITIZEN MOVES A DAY (owner, 9 Sep) ──────────────────────────────────
 *
 * "Have an 'update to today's workout plan' button, and that goes to today's
 * workout plan, and then today's plan shifts to the next day."
 *
 * Read that sentence twice, because it rules out the obvious implementation.
 * A SWAP would put legs on today and today's push on Thursday — but the owner
 * said today's plan shifts to the NEXT day, and everything behind it walks
 * forward one place. That is an INSERT, not a swap, and the difference is the
 * whole point of a split: the order is the training. Swapping puts the same
 * body part twice in three days and leaves a hole where it came from; moving
 * the day and closing the gap keeps every muscle in its turn, one session
 * later than it was.
 *
 * So a move is two day numbers — the day being brought forward, and the day
 * it lands on — and the sequence of sessions is rebuilt by lifting one out and
 * putting it back in. Both are indices into the CURRENT cycle's 28 days.
 */
export interface ProgrammeMove { from: number; to: number }

/**
 * THE SESSIONS, IN ORDER, AFTER THE CITIZEN'S MOVES. `seq[n]` is the split day
 * the nth training day of the month runs. Total by construction: a move whose
 * days are not training days any more — the citizen changed which days are
 * theirs after making it — is skipped rather than throwing, because a stale
 * move must not cost somebody their month.
 */
export function applyMoves(strengthDays: readonly number[], splitLength: number, moves: readonly ProgrammeMove[] | undefined): number[] {
  const seq = strengthDays.map((_, n) => n % splitLength);
  if (!moves || moves.length === 0) return seq;
  for (const m of moves) {
    const from = strengthDays.indexOf(m.from);
    const to = strengthDays.indexOf(m.to);
    if (from < 0 || to < 0 || from === to) continue;
    const [lifted] = seq.splice(from, 1);
    seq.splice(to, 0, lifted);
  }
  return seq;
}

/**
 * THE COLUMN IS A STRING, and this is both ends of it:
 * "<cycle>|<from>-<to>,<from>-<to>". The cycle travels with the moves because
 * day indices are cycle-relative — a month that has rolled since is a
 * different set of days, and applying last month's moves to it would be a
 * plan nobody asked for. A row from another cycle therefore reads as none.
 *
 * Both directions are total: a malformed column reads as an empty list rather
 * than throwing, because a bad string in one row must not take the whole
 * month down with it.
 */
export const MAX_MOVES = 28;

export function readMoves(value: string | null | undefined, cycle: number): ProgrammeMove[] {
  if (!value) return [];
  const [head, tail] = value.split('|');
  if (Number(head) !== cycle || !tail) return [];
  return tail.split(',').flatMap((pair) => {
    const [from, to] = pair.split('-').map(Number);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return [];
    if (from < 0 || from > 27 || to < 0 || to > 27 || from === to) return [];
    return [{ from, to }];
  }).slice(-MAX_MOVES);
}

export function writeMoves(cycle: number, moves: readonly ProgrammeMove[]): string {
  const kept = moves.filter((m) => m.from !== m.to).slice(-MAX_MOVES);
  if (kept.length === 0) return `${cycle}|`;
  return `${cycle}|${kept.map((m) => `${m.from}-${m.to}`).join(',')}`;
}

/**
 * WHAT THE CITIZEN CHOSE, AND WHAT THE TRAINER MADE OF IT. Carried on the
 * programme rather than worked out again on the web, so the words a citizen
 * reads about their own week are written once, next to the code that acted
 * on them.
 */
export interface ProgrammeRest {
  /** Weekday indices, Monday = 0, as the citizen set them. */
  days: number[];
  /** 'rest' | 'walk' | … | whatever they typed. */
  activity: string;
  /** 'Saturday and Sunday' — for printing. */
  label: string;
  /** Whether the citizen set these, or the calendar did. */
  chosen: boolean;
  /** The trainer talking: what this choice costs, and what it buys. */
  advice: string[];
}

export interface Programme {
  startDate: string;
  /** 0–27, or -1 before the start and 28 after the end (the service rolls the month). */
  todayIndex: number;
  daysPerWeek: number;
  splitName: string;
  /** How many days the split rotates through — the modulus `slot` counts in. */
  splitDays: number;
  phases: typeof PHASES;
  days: ProgrammeDay[];
  /** Why the month is shaped this way — every clause names an input. */
  why: string[];
  /** The days off, and the trainer's word on them. */
  rest: ProgrammeRest;
}

export interface ProgrammeInput {
  /** YYYY-MM-DD, day 1. */
  startDate: string;
  /** YYYY-MM-DD. */
  today: string;
  /** Owner-stated days, else the level's. */
  daysPerWeek: number;
  level: LevelKey;
  /** 'mixed' | 'strength' | 'walking' | 'running'. */
  mode: string;
  bodyGoal: BodyGoalKey;
  /** Resolved: at a gym the machines and bars are there. */
  equipment: Equipment[];
  /**
   * WHERE THE MONTH IS TRAINED (owner, 7 Sep: "at the gym the workout needs
   * to be equipment based — dumbbells, rowing, pulldown, chest bench, and
   * everything in a usual gym"). At a gym the movements are LOADED ones —
   * bars, dumbbells, cables, machines — and bodyweight is kept to the one
   * or two a trainer would still put on a gym floor: a pull-up, a dip.
   * Absent or 'home', the pool is whatever the kit list allows.
   */
  place?: 'home' | 'gym';
  conditions: Condition[];
  /** Usually the citizen's id. */
  seed: string;
  /** Which 28-day cycle this is, so a second month is not the first again. */
  cycle: number;
  /**
   * ── THE DAYS THAT ARE NOT OURS (owner, 9 Sep) ────────────────────────────
   *
   * Weekday indices, Monday = 0. Empty or absent means the citizen has not
   * said, and the calendar's own placement stands — which is what every month
   * built before today used.
   */
  restDays?: number[];
  /** What an off day IS: 'rest', or the easy thing they would rather do. */
  restActivity?: string;
  /**
   * THE DAYS THE CITIZEN MOVED (owner, 9 Sep) — see ProgrammeMove. Empty or
   * absent is the month as the calendar laid it out, which is every month
   * built before today.
   */
  moves?: readonly ProgrammeMove[];
}

// ── the pool ────────────────────────────────────────────────────────────────

/** The catalogue's kit words against the citizen's list. A word not here needs
 *  a gym (`machines`) — the sleds, ergometers and tyres of the dataset. */
const KIT: Record<string, Equipment | 'always'> = {
  'body weight': 'always', dumbbell: 'dumbbells', weighted: 'dumbbells',
  barbell: 'barbell', 'ez barbell': 'barbell', 'olympic barbell': 'barbell', 'trap bar': 'barbell',
  kettlebell: 'kettlebell', band: 'bands', 'resistance band': 'bands',
  cable: 'machines', 'leverage machine': 'machines', 'smith machine': 'machines', 'sled machine': 'machines',
  assisted: 'machines', 'stability ball': 'mat', 'bosu ball': 'machines', 'medicine ball': 'machines',
  roller: 'mat', 'wheel roller': 'mat', rope: 'machines', hammer: 'machines', tire: 'machines',
  'stationary bike': 'cardioMachine', 'elliptical machine': 'cardioMachine', 'stepmill machine': 'cardioMachine',
  'skierg machine': 'cardioMachine', 'upper body ergometer': 'cardioMachine',
};

export function kitAvailable(equipment: string, have: readonly Equipment[]): boolean {
  const need = KIT[equipment] ?? 'machines';
  return need === 'always' || have.includes(need);
}

/** Words that mark a row as a stretch or a hold rather than a working set —
 *  and, since 7 Sep, a sport drill rather than a strength movement: the
 *  dataset files a left hook under the lats, and no trainer writes "boxing"
 *  on a pull day. */
const NOT_WORK = /stretch|pose|hold\b|roll\b|foam|massage|breathing|posture|warm|\bboxing\b|\bjab\b|uppercut|punch/i;
/**
 * THE GYM'S OWN KIT. At a gym a movement is one of these or it is not on the
 * month, with one exception: the bodyweight movements a trainer still puts
 * on a gym floor — a pull-up, a chin-up, a dip — at most one a day.
 */
const LOADED = new Set([
  'barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'dumbbell', 'kettlebell', 'weighted',
  'cable', 'leverage machine', 'smith machine', 'sled machine',
]);
const GYM_BODYWEIGHT = /pull-up|pull up|chin-up|chin up|dip\b/i;
export const isLoaded = (equipment: string): boolean => LOADED.has(equipment);
/** Big movements: the first slot for a muscle reaches for one of these. */
const COMPOUND = /squat|deadlift|press|row\b|pull-up|pull up|chin-up|chin up|pulldown|lunge|dip\b|hip thrust|thruster|clean|push-up|push up|step-up|step up|split/i;
/** What a condition rules out, by the words on the movement. Blunt on purpose:
 *  a keyword that keeps a pregnant citizen off a crunch is worth a bench press
 *  it also keeps her off; the library's hand-written swaps remain for the
 *  session's own picks. */
const RULED_OUT: Record<Condition, RegExp> = {
  jointPain: /jump|plyo|burpee|sprint|box\b|hop\b|bound|explosive|pistol|depth/i,
  pregnancy: /jump|plyo|burpee|sprint|crunch|sit-up|sit up|lying|supine|prone|twist|v-up|leg raise|decline|hanging/i,
  hypertension: /handstand|inverted|decline|headstand|overhead squat|heavy/i,
  diabetes: /(?!)/,
};

/** A small deterministic generator: mulberry32 over a string hash. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Everything in the catalogue this citizen may be given, by muscle. */
export function poolFor(equipment: readonly Equipment[], conditions: readonly Condition[]): Map<Muscle, CatalogExercise[]> {
  const out = new Map<Muscle, CatalogExercise[]>();
  for (const e of EXERCISE_CATALOG) {
    if (!(e.target in MUSCLE_WORDS)) continue;
    if (NOT_WORK.test(e.name)) continue;
    if (!kitAvailable(e.equipment, equipment)) continue;
    if (conditions.some((c) => RULED_OUT[c]?.test(e.name))) continue;
    const m = e.target as Muscle;
    if (!out.has(m)) out.set(m, []);
    out.get(m)!.push(e);
  }
  return out;
}

// ── the month ───────────────────────────────────────────────────────────────

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string): number =>
  Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

const SPLIT_NAMES: Record<number, string> = {
  1: 'One full-body day', 2: 'Full body, twice a week', 3: 'Push / Pull / Legs', 4: 'Upper / Lower',
  5: 'Push / Pull / Legs + Upper / Lower', 6: 'Push / Pull / Legs, twice',
};

export function buildProgramme(input: ProgrammeInput): Programme {
  const asked = Math.min(6, Math.max(1, Math.round(input.daysPerWeek)));
  const restDays = [...new Set((input.restDays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  /**
   * THE DAYS OFF WIN, AND THE SPLIT IS REBUILT AROUND THEM (owner, 9 Sep).
   * A citizen who asks for five days and then keeps three of them for their
   * own life has four — and a trainer writes them a FOUR-day split, not a
   * five-day split crammed into four. `asked` is kept so the month can say
   * what it did and why, which is the difference between being consulted and
   * being overruled.
   */
  const free = restDays.length ? 7 - restDays.length : 7;
  const days = Math.max(1, Math.min(asked, free));
  const goal = GOAL_PRESCRIPTION[input.bodyGoal] ?? GOAL_PRESCRIPTION.athletic;
  const lvl = LEVEL_ADJUST[input.level] ?? LEVEL_ADJUST.intermediate;
  const split = SPLITS[days] ?? SPLITS[3];
  const placement = placeTraining(days, restDays);
  const off = offDay(input.restActivity);
  const pool = poolFor(input.equipment, input.conditions);

  // A walking or running month keeps two strength days and gives the rest of
  // the training days to the road; a mixed month alternates; a weights month
  // is all rotation. The rotation itself never changes — only which of the
  // week's days are on it.
  const strengthDays = input.mode === 'walking' || input.mode === 'running' ? Math.min(2, days) : input.mode === 'mixed' ? Math.ceil(days / 2) : days;
  const cardioName = input.mode === 'running' ? 'Run' : input.mode === 'walking' ? 'Walk' : 'Cardio';
  const cardioMinutes = input.level === 'basic' ? 20 : input.level === 'beginner' ? 30 : input.level === 'intermediate' ? 35 : 45;

  // How many working movements a day gets, by ability.
  const perDay = Math.max(4, Math.min(8, 6 + lvl.exercises));

  /**
   * THE SAME MOVEMENTS FOR TWO WEEKS, THEN NEW ONES. Weeks one and three are
   * variant A, weeks two and four variant B — so week three can be week one
   * heavier, and week four can be week two lighter. Chosen once per variant,
   * per split day, from a shuffle seeded on the citizen, the cycle and the
   * variant; a movement used on one day of the week is not used on another.
   */
  const gym = input.place === 'gym';
  const choose = (variant: 'a' | 'b'): Map<string, CatalogExercise[]> => {
    const rnd = seeded(`${input.seed}:${input.cycle}:${variant}`);
    const usedThisWeek = new Set<string>();
    const out = new Map<string, CatalogExercise[]>();
    for (const day of split) {
      const picks: CatalogExercise[] = [];
      let bodyweightToday = 0;
      for (const slot of day.slots) {
        if (picks.length >= perDay) break;
        let candidates = shuffle(pool.get(slot.muscle) ?? [], rnd).filter((e) => !usedThisWeek.has(e.id));
        /* AT A GYM THE MONTH IS BUILT ON THE BARS, THE DUMBBELLS AND THE
           MACHINES (owner, 7 Sep). Bodyweight rows are kept only where a
           trainer would keep them — a pull-up, a dip — one a day at most, and
           never ahead of a loaded movement for the same muscle. */
        if (gym) {
          const loaded = candidates.filter((e) => isLoaded(e.equipment));
          const floor = bodyweightToday < 1 ? candidates.filter((e) => !isLoaded(e.equipment) && GYM_BODYWEIGHT.test(e.name)) : [];
          candidates = loaded.length ? [...loaded, ...floor] : floor;
        }
        const big = candidates.filter((e) => COMPOUND.test(e.name));
        const pick = (slot.compound && big.length ? big : candidates.length ? candidates : big)[0];
        if (!pick) continue;
        if (gym && !isLoaded(pick.equipment)) bodyweightToday++;
        usedThisWeek.add(pick.id);
        picks.push(pick);
      }
      out.set(day.key, picks);
    }
    return out;
  };
  const variants = { a: choose('a'), b: choose('b') };

  /**
   * WHICH DAYS ARE TRAINING DAYS, decided before any of them is built. The
   * calendar answers this on its own — it depends on the citizen's week, not
   * on the split — and having the list up front is what lets a MOVE be an
   * ordinary lift-and-insert on the sequence of sessions rather than
   * arithmetic on a counter that only exists inside the loop.
   */
  const strengthIndices: number[] = [];
  for (let i = 0; i < 28; i++) {
    const slotInWeek = placement.indexOf(i % 7);
    if (slotInWeek >= 0 && slotInWeek < strengthDays) strengthIndices.push(i);
  }
  const sequence = applyMoves(strengthIndices, split.length, input.moves);

  const out: ProgrammeDay[] = [];
  let rotation = 0;
  for (let i = 0; i < 28; i++) {
    const week = (Math.floor(i / 7) + 1) as 1 | 2 | 3 | 4;
    const phase = PHASES[week - 1];
    const weekday = i % 7;
    const slotInWeek = placement.indexOf(weekday);
    const date = addDays(input.startDate, i);
    const base = { index: i, date, week, phase: phase.key };

    if (slotInWeek < 0) {
      /* NOT ALWAYS THE WORD "REST" (owner, 9 Sep). A citizen who said they
         would rather swim on a day off gets a day that says Swim, with the
         trainer's reason for keeping it easy. The KIND stays 'rest' because
         that is what it is to the programme — a day off the split — and
         every reader of `kind` is asking that question, not what the citizen
         does with the afternoon. */
      out.push({ ...base, kind: 'rest', title: off.title, parts: off.parts, muscles: [], exercises: [], cardioMinutes: off.minutes, note: off.note });
      continue;
    }
    if (slotInWeek >= strengthDays) {
      out.push({
        ...base, kind: 'cardio', title: cardioName, parts: 'heart & lungs', muscles: [], exercises: [],
        cardioMinutes: phase.key === 'deload' ? Math.round(cardioMinutes * 0.7) : cardioMinutes,
        note: input.mode === 'running'
          ? (input.level === 'basic' || input.level === 'beginner' ? 'Run a minute, walk two, and repeat. Build the running minute each week.' : 'Easy pace for most of it; brisk enough to be breathing, easy enough to talk.')
          : 'Brisk enough to be breathing, easy enough to talk. Hills if you have them.',
      });
      continue;
    }
    /* THE SESSION THIS TRAINING DAY RUNS. Untouched, `sequence[n]` is
       `n % split.length` — the rotation exactly as it was. Once a day has been
       moved it is that rotation with one session lifted out and put back
       earlier, everything between it walking forward one place. */
    const slot = sequence[rotation] ?? rotation % split.length;
    const day = split[slot];
    rotation += 1;
    const variant = week % 2 === 1 ? 'a' : 'b';
    const sets = Math.max(2, goal.sets + lvl.sets + phase.sets);
    const reps: [number, number] = phase.reps === 'low'
      ? [Math.max(4, goal.reps[0] - 2), goal.reps[0] + 1]
      : phase.reps === 'high' ? [goal.reps[1], goal.reps[1] + 3] : goal.reps;
    const restSec = Math.max(30, goal.restSec + lvl.restSec + phase.restSec);
    const chosen = variants[variant].get(day.key) ?? [];
    out.push({
      ...base, kind: 'strength', slot, title: day.title, parts: day.parts,
      muscles: [...new Set(day.slots.map((s) => s.muscle))].filter((m) => chosen.some((e) => e.target === m)),
      exercises: chosen.map((e) => ({
        id: e.id, name: e.name, muscle: e.target as Muscle, works: MUSCLE_WORDS[e.target as Muscle],
        equipment: e.equipment, sets, reps, restSec, steps: e.steps, thumb: exerciseThumbUrl(e), gif: exerciseGifUrl(e),
      })),
      cardioMinutes: 0,
      note: phase.note,
    });
  }

  /**
   * ── THE TRAINER ANSWERS THE CHOICE (owner, 9 Sep: "act as a trainer
   * consulting the user") ────────────────────────────────────────────────
   *
   * A trainer does not silently absorb what you ask for. They tell you what
   * it costs, what it buys, and where they had to give. Each line below fires
   * on a condition that is actually true of THIS week — a paragraph that
   * appears whatever you chose is decoration, and gets ignored as such.
   */
  const trained = placement.length;
  const restLabel = restDays.length
    ? restDays.map((d) => WEEKDAY_NAMES[d]).reduce((acc, w, i, all) => i === 0 ? w : i === all.length - 1 ? `${acc} and ${w}` : `${acc}, ${w}`, '')
    : [0, 1, 2, 3, 4, 5, 6].filter((d) => !placement.includes(d)).map((d) => WEEKDAY_NAMES[d]).reduce((acc, w, i, all) => i === 0 ? w : i === all.length - 1 ? `${acc} and ${w}` : `${acc}, ${w}`, '');
  const advice: string[] = [];
  if (!restDays.length && off.title !== 'Rest') {
    /* "IF THEY DON'T WANT A BREAK, WHAT THEY CAN DO" (owner, 9 Sep). A citizen
       who has named an easy activity without naming days has answered the
       second half of the question and not the first, and telling them they
       have said nothing would be false — and would bury the half they did
       answer under a nag about the half they did not. */
    advice.push(`You have not said which days are yours, so the month takes ${restLabel} — and on those you ${off.title.toLowerCase()} rather than stop, which is what you asked for. Name the days that actually suit your week and they move.`);
  } else if (!restDays.length) {
    advice.push(`You have not told us which days are yours, so the month takes ${restLabel} off. Say which days suit your week and it moves — a plan that argues with your life is a plan you abandon in week two.`);
  } else if (trained < asked) {
    advice.push(`You asked for ${asked} training day${asked === 1 ? '' : 's'} and kept ${restDays.length} of the week for yourself, which leaves ${trained}. The days off win — they are the ones with a reason outside this app — so this is a ${SPLIT_NAMES[trained] ?? SPLIT_NAMES[3]} month rather than a ${SPLIT_NAMES[asked] ?? SPLIT_NAMES[3]} one, and every muscle still gets its turn.`);
  } else {
    advice.push(`${restLabel} ${restDays.length === 1 ? 'is' : 'are'} yours. The ${trained} training days are spread through what is left so two hard days are not stacked back to back.`);
  }
  if (restDays.length === 0 && trained >= 7) {
    /* SEVEN HARD DAYS IS NOT A PLAN, and the honest thing is to say so once
       and then still build the week they asked for — with the seventh day
       easy, which is the trainer's actual answer. */
    advice.push('Seven hard days a week is how people stop, not how they get strong. Keep at least one easy — that is the day your body does the building the other six asked for.');
  }
  if (off.title !== 'Rest') {
    advice.push(`Your days off are a ${off.title.toLowerCase()} rather than nothing at all — good, as long as it stays easy. If it leaves you sore, it was a training day and the week is really ${trained + restDays.length} hard days, not ${trained}.`);
  }

  const why = [
    `You can give ${days} day${days === 1 ? '' : 's'} a week, so the month is ${SPLIT_NAMES[days] ?? SPLIT_NAMES[3]}: every muscle is worked, then left alone long enough to grow.`,
    `Your body goal sets the work — ${goal.sets + lvl.sets} sets of ${goal.reps[0]}–${goal.reps[1]} at your level, with ${goal.restSec + lvl.restSec}s rest — and the four weeks move through base, build, peak and deload.`,
    gym
      ? `You train at a gym, so the month is built on the bars, the dumbbells, the cables and the machines — the presses, rows and pulldowns — with a pull-up or a dip where a trainer would keep one; ${[...pool.values()].reduce((n, xs) => n + xs.length, 0)} of the ${EXERCISE_CATALOG.length} in the catalogue qualify.`
      : input.equipment.length
        ? `Every movement is one you can do with what you have; ${[...pool.values()].reduce((n, xs) => n + xs.length, 0)} of the ${EXERCISE_CATALOG.length} in the catalogue qualify.`
        : 'Nothing but bodyweight is assumed, because you have not told us what you train with — say so in your training profile and the month widens.',
    ...(input.conditions.length ? [`What you told us about your health removes the movements that would argue with it: ${input.conditions.join(', ')}.`] : []),
    'Weeks one and three share their movements so you can add load; weeks two and four share theirs so the month does not stall.',
  ];

  return {
    startDate: input.startDate,
    todayIndex: daysBetween(input.startDate, input.today),
    daysPerWeek: days,
    splitName: SPLIT_NAMES[days] ?? SPLIT_NAMES[3],
    splitDays: split.length,
    phases: PHASES,
    days: out,
    why,
    rest: {
      days: restDays.length ? restDays : [0, 1, 2, 3, 4, 5, 6].filter((d) => !placement.includes(d)),
      activity: (input.restActivity ?? 'rest').trim() || 'rest',
      label: restLabel,
      chosen: restDays.length > 0,
      advice,
    },
  };
}
