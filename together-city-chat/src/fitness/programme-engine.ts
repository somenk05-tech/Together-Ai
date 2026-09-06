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
 *  between them where the week allows it. */
const PLACEMENT: Record<number, number[]> = {
  1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5],
};

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
}

export interface Programme {
  startDate: string;
  /** 0–27, or -1 before the start and 28 after the end (the service rolls the month). */
  todayIndex: number;
  daysPerWeek: number;
  splitName: string;
  phases: typeof PHASES;
  days: ProgrammeDay[];
  /** Why the month is shaped this way — every clause names an input. */
  why: string[];
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
  conditions: Condition[];
  /** Usually the citizen's id. */
  seed: string;
  /** Which 28-day cycle this is, so a second month is not the first again. */
  cycle: number;
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

/** Words that mark a row as a stretch or a hold rather than a working set. */
const NOT_WORK = /stretch|pose|hold\b|roll\b|foam|massage|breathing|posture|warm/i;
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
  const days = Math.min(6, Math.max(1, Math.round(input.daysPerWeek)));
  const goal = GOAL_PRESCRIPTION[input.bodyGoal] ?? GOAL_PRESCRIPTION.athletic;
  const lvl = LEVEL_ADJUST[input.level] ?? LEVEL_ADJUST.intermediate;
  const split = SPLITS[days] ?? SPLITS[3];
  const placement = PLACEMENT[days] ?? PLACEMENT[3];
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
  const choose = (variant: 'a' | 'b'): Map<string, CatalogExercise[]> => {
    const rnd = seeded(`${input.seed}:${input.cycle}:${variant}`);
    const usedThisWeek = new Set<string>();
    const out = new Map<string, CatalogExercise[]>();
    for (const day of split) {
      const picks: CatalogExercise[] = [];
      for (const slot of day.slots) {
        if (picks.length >= perDay) break;
        const candidates = shuffle(pool.get(slot.muscle) ?? [], rnd).filter((e) => !usedThisWeek.has(e.id));
        const big = candidates.filter((e) => COMPOUND.test(e.name));
        const pick = (slot.compound && big.length ? big : candidates.length ? candidates : big)[0];
        if (!pick) continue;
        usedThisWeek.add(pick.id);
        picks.push(pick);
      }
      out.set(day.key, picks);
    }
    return out;
  };
  const variants = { a: choose('a'), b: choose('b') };

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
      out.push({ ...base, kind: 'rest', title: 'Rest', parts: 'recovery', muscles: [], exercises: [], cardioMinutes: 20, note: 'A rest day is training too. A 20-minute walk, water, and sleep.' });
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
    const day = split[rotation % split.length];
    rotation += 1;
    const variant = week % 2 === 1 ? 'a' : 'b';
    const sets = Math.max(2, goal.sets + lvl.sets + phase.sets);
    const reps: [number, number] = phase.reps === 'low'
      ? [Math.max(4, goal.reps[0] - 2), goal.reps[0] + 1]
      : phase.reps === 'high' ? [goal.reps[1], goal.reps[1] + 3] : goal.reps;
    const restSec = Math.max(30, goal.restSec + lvl.restSec + phase.restSec);
    const chosen = variants[variant].get(day.key) ?? [];
    out.push({
      ...base, kind: 'strength', title: day.title, parts: day.parts,
      muscles: [...new Set(day.slots.map((s) => s.muscle))].filter((m) => chosen.some((e) => e.target === m)),
      exercises: chosen.map((e) => ({
        id: e.id, name: e.name, muscle: e.target as Muscle, works: MUSCLE_WORDS[e.target as Muscle],
        equipment: e.equipment, sets, reps, restSec, steps: e.steps, thumb: exerciseThumbUrl(e), gif: exerciseGifUrl(e),
      })),
      cardioMinutes: 0,
      note: phase.note,
    });
  }

  const why = [
    `You can give ${days} day${days === 1 ? '' : 's'} a week, so the month is ${SPLIT_NAMES[days] ?? SPLIT_NAMES[3]}: every muscle is worked, then left alone long enough to grow.`,
    `Your body goal sets the work — ${goal.sets + lvl.sets} sets of ${goal.reps[0]}–${goal.reps[1]} at your level, with ${goal.restSec + lvl.restSec}s rest — and the four weeks move through base, build, peak and deload.`,
    input.equipment.length
      ? `Every movement is one you can do with what you have${input.equipment.includes('machines') ? ' and what a gym has' : ''}; ${[...pool.values()].reduce((n, xs) => n + xs.length, 0)} of the ${EXERCISE_CATALOG.length} in the catalogue qualify.`
      : 'Nothing but bodyweight is assumed, because you have not told us what you train with — say so in your training profile and the month widens.',
    ...(input.conditions.length ? [`What you told us about your health removes the movements that would argue with it: ${input.conditions.join(', ')}.`] : []),
    'Weeks one and three share their movements so you can add load; weeks two and four share theirs so the month does not stall.',
  ];

  return {
    startDate: input.startDate,
    todayIndex: daysBetween(input.startDate, input.today),
    daysPerWeek: days,
    splitName: SPLIT_NAMES[days] ?? SPLIT_NAMES[3],
    phases: PHASES,
    days: out,
    why,
  };
}
