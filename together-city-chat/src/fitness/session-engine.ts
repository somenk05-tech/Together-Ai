import {
  LIBRARY, howTo, isAvailable, mediaFor, ruledOutBy, exerciseById,
  type Condition, type Equipment, type Exercise, type Pattern,
} from './exercise-library';

/**
 * ── TODAY'S SESSION ─────────────────────────────────────────────────────────
 *
 * The owner, 16 Aug: "Together City doesn't give everyone the same workout — it
 * acts like a personal trainer that continuously recalculates the appropriate
 * training stimulus from the user's profile, goal, nutrition, activity and
 * recovery."
 *
 * WHAT THIS REPLACES, and the replacing is the point. The session was built in
 * the browser from three hardcoded tables and SEVEN inputs, five of which were
 * `useState` that reset on reload: location, gym split, a three-value level
 * that was not the saved five-value one, a duration, a walk flag, a gender and
 * the NUTRITION goal. It never read the saved training profile, the body goal,
 * a single lab, a declared condition, the calorie or protein target, or one
 * minute of the citizen's own history — all of which the server already holds.
 * A citizen who had declared joint pain was handed Jump squats and Burpees.
 *
 * FOUR RULES, and each of them is a way the old page was wrong.
 *
 * 1. THE BODY GOAL SETS THE CHARACTER OF THE WORK. Not the nutrition goal —
 *    that decides what is eaten. shared/energy.ts settled this in August for
 *    calories, in the sentence that survives above GOAL_DELTA: "a goal's
 *    character lives in its protein, macros and TRAINING EMPHASIS, not in a
 *    rival calorie policy." This is the training-emphasis half of it, and the
 *    old page had it backwards: `FoodPref.goal` chose the rep ranges.
 *
 * 2. SAFETY IS A FILTER, NOT A CAPTION. A condition removes movements from the
 *    pool before anything is chosen, and the movement names its own stand-in so
 *    the session does not simply come up short. Every substitution is reported,
 *    because a citizen who is quietly given an easier movement has been managed
 *    rather than trained.
 *
 * 3. NEVER COMPENSATE WITH MORE EXERCISE. The owner's own line, and the one
 *    with real teeth: when the intensity ceiling is down, or the week is
 *    already heavy, or the labs say so, the session gets SHORTER and says why.
 *    A deficit is a kitchen decision. Adding minutes to a body that has been
 *    told to take it easy is how an app hurts somebody while congratulating
 *    them.
 *
 * 4. IT SAYS WHAT IT DID NOT KNOW. `why.missing` lists the inputs that were
 *    absent, so "personalised" is a claim the page can back rather than a word
 *    it uses. Equipment is the one that changes a session most: without it, the
 *    only honest home session is bodyweight.
 *
 * THE ENGINE IS PURE. No Prisma, no clock, no random. Everything it needs
 * arrives in the argument, which is what lets the whole of it be tested with
 * fixtures — and what stops a second copy of any of these rules appearing on a
 * page later.
 */

export type LevelKey = 'basic' | 'beginner' | 'intermediate' | 'advanced' | 'athlete';
export type BodyGoalKey = 'buildMuscle' | 'leanDefine' | 'athletic' | 'fatLoss';
export type Intensity = 'light' | 'moderate' | 'vigorous';

/** Sets, reps and rest, by body goal. The character of the work. */
const GOAL_PRESCRIPTION: Record<BodyGoalKey, { sets: number; reps: [number, number]; restSec: number; emphasis: Pattern[] }> = {
  // Hypertrophy: moderate reps, longer rest, pushing and pulling lead.
  buildMuscle: { sets: 4, reps: [8, 12], restSec: 75, emphasis: ['push', 'pull', 'squat', 'hinge'] },
  // Definition on a mild deficit: the volume that protects muscle, less rest.
  leanDefine: { sets: 3, reps: [10, 14], restSec: 50, emphasis: ['push', 'pull', 'squat', 'core'] },
  // Performance: balanced, with carries and core for the trunk that carries it.
  athletic: { sets: 3, reps: [8, 12], restSec: 60, emphasis: ['squat', 'hinge', 'push', 'pull', 'carry'] },
  // Fat loss: keep the resistance work that protects lean mass, shorter rest,
  // and the aerobic minutes go in the WALK rather than in a harder session.
  fatLoss: { sets: 3, reps: [12, 15], restSec: 45, emphasis: ['squat', 'hinge', 'push', 'pull', 'core'] },
};

/** How much a body at this ability is asked to do. Sets adjust, and the ceiling
 *  is a floor under the ceiling — a lab can lower it, nothing raises it. */
const LEVEL_ADJUST: Record<LevelKey, { sets: number; restSec: number; cap: Intensity; exercises: number }> = {
  basic: { sets: -1, restSec: +20, cap: 'light', exercises: -2 },
  beginner: { sets: -1, restSec: +10, cap: 'moderate', exercises: -1 },
  intermediate: { sets: 0, restSec: 0, cap: 'vigorous', exercises: 0 },
  advanced: { sets: +1, restSec: -5, cap: 'vigorous', exercises: +1 },
  athlete: { sets: +1, restSec: -10, cap: 'vigorous', exercises: +2 },
};

const INTENSITY_ORDER: Intensity[] = ['light', 'moderate', 'vigorous'];
const lowerOf = (a: Intensity, b: Intensity): Intensity =>
  (INTENSITY_ORDER.indexOf(a) <= INTENSITY_ORDER.indexOf(b) ? a : b);

/** Roughly how many working exercises fit, before the level adjustment. Warm-up
 *  and cool-down are on top and are why this is not minutes ÷ set time. */
const exerciseBudget = (minutes: number): number =>
  minutes <= 20 ? 3 : minutes <= 30 ? 4 : minutes <= 45 ? 5 : minutes <= 60 ? 6 : 8;

export interface SessionInput {
  minutes: number;
  location: 'home' | 'gym';
  equipment: Equipment[];
  level: LevelKey;
  bodyGoal: BodyGoalKey;
  conditions: Condition[];
  /** The ceiling the weekly plan engine already derives from labs and age.
   *  Passed in rather than recomputed: two readings of a lab result is two
   *  answers to "how hard may this person work". */
  intensityCap: Intensity;
  /** Nutrition's day, for the explanation and for the walk arithmetic. Null
   *  when Nutrition cannot answer, and the explanation says so. */
  kcalTarget: number | null;
  proteinG: number | null;
  /** How the citizen's own nutrition goal reads — 'lose' | 'maintain' | 'gain'.
   *  It explains the day; it does not choose the exercises. */
  nutritionGoal: string | null;
  weightKg: number | null;
  /** What they have actually done lately, from WorkoutLog. */
  recent: { sessionsLast7: number; minutesLast7: number; daysSinceLast: number | null };
  /** Free text, in the citizen's own words. Never parsed — printed, at the top
   *  of the session, because a machine guessing at "bad left shoulder" is worse
   *  than a human reading it. */
  limitations: string | null;
  /** Inputs nobody has given us yet. Named, not guessed. */
  missing: string[];
  /**
   * WHICH DAY OF THE WEEK'S PLAN THIS IS.
   *
   * Until 21 Aug the two engines did not speak. The weekly plan said "Push" and
   * this one built a full-body session, every day, for everybody — so the page
   * that told you Tuesday was pull day opened a workout with squats in it, and
   * nothing in the application could have told you they disagreed. A citizen
   * following the plan was following two plans.
   *
   * OPTIONAL, AND ABSENT MEANS EXACTLY WHAT IT MEANT BEFORE. Every caller that
   * does not pass a day gets the byte-for-byte session it got yesterday, which
   * is what lets a 232-line spec stay green through this change rather than
   * being rewritten alongside the thing it guards.
   *
   * It orders the patterns; it does not choose the exercises, set the volume or
   * touch the ceiling. A day cannot ask for more than the labs allow — that
   * rule is older than this field and this field does not get an exception.
   */
  day?: {
    title: string;
    trains: string[];
    /** In the order they should be reached for. Empty = not a resistance day. */
    patterns: Pattern[];
    kind: 'aerobic' | 'strength' | 'balance' | 'mobility' | 'recovery';
  };
}

export interface SessionExercise {
  id: string;
  name: string;
  pattern: Pattern;
  sets: number;
  reps?: [number, number];
  seconds?: number;
  restSec: number;
  unilateral?: boolean;
  /** Present when this movement stands in for one that was ruled out. */
  insteadOf?: { name: string; because: Condition };
  /**
   * ── HOW TO DO IT, ON THE SESSION ITSELF ─────────────────────────────────
   *
   * Not fetched per exercise from the page, and that is the decision worth
   * writing down: the runner is a full-screen timer somebody is looking at
   * mid-movement, often on a phone with the screen at arm's length, and a
   * second round trip to find out what to do with their hands is a round trip
   * that lands after they have already guessed. The whole session — eighteen
   * steps, five or six lines each — is about four kilobytes of text. It
   * travels with the plan.
   */
  steps: string[];
  /** What it works, in the words the library prints them in. */
  muscles: string[];
  /** The still and the animation, or '' where the movement is one of the
   *  hand-written ones the dataset does not describe. © Gym visual. */
  thumb: string;
  gif: string;
  /** The city's own film of the movement, with sound, or '' — see Exercise.video. */
  video: string;
}

export interface SessionBlock {
  title: string;
  note?: string;
  exercises: SessionExercise[];
}

export interface TodaySession {
  headline: string;
  minutes: number;
  walkMinutes: number;
  intensity: Intensity;
  blocks: SessionBlock[];
  /** The explanation, in named parts rather than one sentence, so the page can
   *  lay it out and a test can read it. */
  why: {
    goal: string;
    energy: string | null;
    activity: string;
    ceiling: string | null;
    /** Which day of the week's plan this is, and what it trains. Null when the
     *  caller did not say — the two engines were strangers until 21 Aug and a
     *  session built without a day says so rather than inventing one. */
    day: string | null;
    /** Inputs we did not have. The page turns each into a way to give it. */
    missing: string[];
  };
  /** Movements swapped for a declared condition — every one, always shown. */
  substitutions: { from: string; to: string; because: Condition }[];
  /** Things the citizen should read before starting. */
  cautions: string[];
  /** True when the session was made SHORTER or gentler on purpose. Rule 3. */
  eased: boolean;
}

const GOAL_WORDS: Record<BodyGoalKey, string> = {
  buildMuscle: 'building muscle',
  leanDefine: 'getting lean while holding muscle',
  athletic: 'performing and looking athletic',
  fatLoss: 'losing fat while keeping muscle',
};

/**
 * Pick one movement per pattern, preferring the equipment the citizen has and
 * skipping anything already chosen. Ruled-out movements are replaced by their
 * own stand-in — never dropped, or a jointPain session comes out two exercises
 * short and nothing on screen explains the gap.
 */
function pick(
  pattern: Pattern,
  input: SessionInput,
  used: Set<string>,
): { exercise: Exercise; insteadOf?: { name: string; because: Condition } } | null {
  const pool = LIBRARY.filter((e) => e.pattern === pattern && !used.has(e.id) && isAvailable(e, input.equipment));
  // Richer first: a movement that uses the equipment they told us about beats
  // the bodyweight floor, which is what makes answering the question worth it.
  const ordered = [...pool].sort((a, b) => b.equipment.length - a.equipment.length);
  for (const e of ordered) {
    const out = ruledOutBy(e, input.conditions);
    if (out.length === 0) return { exercise: e };
    const alt = e.swapFor ? exerciseById(e.swapFor) : undefined;
    if (alt && !used.has(alt.id) && isAvailable(alt, input.equipment) && ruledOutBy(alt, input.conditions).length === 0) {
      return { exercise: alt, insteadOf: { name: e.name, because: out[0] } };
    }
  }
  return null;
}

/**
 * The four fields that turn a name into an instruction, attached in ONE place.
 *
 * Every exercise on a session goes through here — warm-up, working set,
 * cool-down and the walk alike — so there is no block a citizen can reach that
 * knows what to do and no block that doesn't.
 */
const describe = (e: Exercise): Pick<SessionExercise, 'steps' | 'muscles' | 'thumb' | 'gif' | 'video'> => {
  const { thumb, gif } = mediaFor(e);
  return { steps: howTo(e), muscles: e.muscles, thumb, gif, video: e.video ?? '' };
};

export function buildSession(input: SessionInput): TodaySession {
  const goal = GOAL_PRESCRIPTION[input.bodyGoal] ?? GOAL_PRESCRIPTION.athletic;
  const lvl = LEVEL_ADJUST[input.level] ?? LEVEL_ADJUST.intermediate;

  /**
   * RULE 3, AND IT RUNS BEFORE ANYTHING IS CHOSEN.
   *
   * Three things ease a session, and none of them is allowed to lengthen one:
   * a ceiling the labs or the ability tier put on it, a week that is already
   * heavy, and a body that has trained on each of the last several days. The
   * result is fewer working sets and a shorter session, said out loud.
   */
  const cap = lowerOf(input.intensityCap, lvl.cap);
  const heavyWeek = input.recent.minutesLast7 >= 300 || input.recent.sessionsLast7 >= 5;
  const backToBack = input.recent.daysSinceLast === 0;
  const eased = cap === 'light' || heavyWeek || backToBack;

  const budget = Math.max(3, exerciseBudget(input.minutes) + lvl.exercises - (eased ? 1 : 0));
  const sets = Math.max(2, goal.sets + lvl.sets - (eased ? 1 : 0));
  const restSec = Math.max(30, goal.restSec + lvl.restSec + (eased ? 15 : 0));

  /**
   * The order the body wants: THE DAY'S OWN PATTERNS FIRST, then the goal's
   * emphasis, then whatever is left to fill the budget.
   *
   * The tail is why this is an ORDER and not a filter. A pull day reaches for
   * pulling first and gets as much of it as the budget allows; what it does not
   * do is refuse to put a single leg movement in a 60-minute session because
   * the label said "Pull". A day's name is what it emphasises, not a fence —
   * and a fence is what would have made this change break the rule that a
   * session never answers a constraint by removing work.
   */
  const wanted: Pattern[] = [];
  for (const p of input.day?.patterns ?? []) if (!wanted.includes(p)) wanted.push(p);
  for (const p of goal.emphasis) if (!wanted.includes(p)) wanted.push(p);
  for (const p of ['squat', 'hinge', 'push', 'pull', 'core', 'carry'] as Pattern[]) {
    if (!wanted.includes(p)) wanted.push(p);
  }

  const used = new Set<string>();
  const substitutions: TodaySession['substitutions'] = [];
  const working: SessionExercise[] = [];
  for (const pattern of wanted) {
    if (working.length >= budget) break;
    const got = pick(pattern, input, used);
    if (!got) continue;
    used.add(got.exercise.id);
    if (got.insteadOf) substitutions.push({ from: got.insteadOf.name, to: got.exercise.name, because: got.insteadOf.because });
    working.push({
      id: got.exercise.id,
      name: got.exercise.name,
      pattern: got.exercise.pattern,
      sets,
      ...(got.exercise.seconds ? { seconds: got.exercise.seconds } : { reps: goal.reps }),
      restSec,
      ...(got.exercise.unilateral ? { unilateral: true } : {}),
      ...(got.insteadOf ? { insteadOf: got.insteadOf } : {}),
      ...describe(got.exercise),
    });
  }

  // Warm-up and cool-down are mobility, one set, and are never the thing that
  // gets cut — a shortened session is fewer working sets, not a body going
  // straight into load.
  const mobility = (n: number, from: 'start' | 'end'): SessionExercise[] =>
    LIBRARY.filter((e) => e.pattern === 'mobility' && isAvailable(e, input.equipment) && ruledOutBy(e, input.conditions).length === 0)
      .slice(from === 'start' ? 0 : -n, from === 'start' ? n : undefined)
      .map((e) => ({ id: e.id, name: e.name, pattern: e.pattern, sets: 1, seconds: e.seconds ?? 30, restSec: 0, ...(e.unilateral ? { unilateral: true } : {}), ...describe(e) }));

  /**
   * THE WALK IS WHERE AEROBIC MINUTES GO, and it is the one thing that grows
   * on a fat-loss goal — because walking is the stimulus that adds activity
   * without adding recovery cost. This is rule 3 stated positively: when
   * somebody wants to lose weight and has not been moving, the answer is more
   * walking, not a harder session.
   */
  const lowActivity = input.recent.minutesLast7 < 90;
  const walkMinutes = eased && cap === 'light'
    ? 15
    : input.bodyGoal === 'fatLoss' && lowActivity ? 30
      : input.bodyGoal === 'fatLoss' ? 25
        : lowActivity ? 20 : 15;

  const cautions: string[] = [];
  if (input.limitations) cautions.push(`You told us: “${input.limitations}”. Skip anything that touches it, and swap in the movement beside it.`);
  if (input.conditions.includes('pregnancy')) cautions.push('Nothing here is on your back or your front, and nothing jumps. Your midwife or doctor’s instruction comes before this page.');
  if (input.conditions.includes('hypertension')) cautions.push('Breathe out through the effort rather than holding your breath — that is the part of lifting that raises pressure.');
  if (cap === 'light') cautions.push('Today is a light day on purpose. If it feels easy, that is the point.');
  cautions.push('If something hurts — not burns, hurts — stop. This is a starting stimulus, not a prescription, and a physiotherapist’s instruction overrides it.');

  const strengthMinutes = Math.max(15, input.minutes - (eased ? 10 : 0));
  /* THE HEADLINE NAMES THE DAY WHEN THERE IS ONE. It said "full-body strength"
     unconditionally, which was true while every session was full-body and
     became a lie the moment Tuesday started leading with pulling. */
  const dayName = input.day && input.day.kind === 'strength' ? input.day.title.toLowerCase() : null;
  const headline = `${strengthMinutes} min ${dayName ?? (input.bodyGoal === 'fatLoss' ? 'strength' : 'full-body strength')} + ${walkMinutes} min walk`;

  const energy = input.kcalTarget != null
    ? `Nutrition has you at ${input.kcalTarget.toLocaleString('en-IN')} kcal today${input.proteinG ? ` and ${input.proteinG} g of protein` : ''}${input.nutritionGoal === 'lose' ? ', on a deficit' : ''}.`
    : null;

  const activity = input.recent.sessionsLast7 === 0
    ? 'You have not logged a session in the last week, so this starts where it is comfortable to start.'
    : heavyWeek
      ? `You have already done ${input.recent.minutesLast7} minutes across ${input.recent.sessionsLast7} sessions this week — this one is lighter on purpose.`
      : `${input.recent.sessionsLast7} session${input.recent.sessionsLast7 === 1 ? '' : 's'} and ${input.recent.minutesLast7} minutes so far this week.`;

  const dayWhy = input.day
    ? `Your plan has today as ${input.day.title} — ${input.day.trains.join(', ')} — so that is what leads.`
    : null;

  const ceiling = cap !== 'vigorous'
    ? cap === 'light'
      ? 'Your intensity ceiling is light today, so this is shorter and slower rather than harder.'
      : 'Your intensity ceiling is moderate, so nothing here asks for a maximal effort.'
    : null;

  return {
    headline,
    minutes: strengthMinutes,
    walkMinutes,
    intensity: cap,
    blocks: [
      { title: 'Warm-up', note: 'Two minutes. Not optional on a cold body.', exercises: mobility(3, 'start') },
      {
        title: 'The work',
        note: `${sets} sets each, ${restSec}s rest.`,
        exercises: working,
      },
      { title: 'Cool-down', exercises: mobility(2, 'end') },
      {
        title: 'Then walk',
        note: 'Brisk enough to be breathing, easy enough to talk.',
        exercises: [{
          id: 'brisk-walk', name: 'Brisk walk', pattern: 'cardio', sets: 1, seconds: walkMinutes * 60, restSec: 0,
          // The walk is the one exercise not chosen out of the library — it is
          // the block — so it reads its own row rather than being built by hand
          // with three empty fields.
          ...describe(exerciseById('brisk-walk')!),
        }],
      },
    ],
    why: {
      goal: `Your body goal is ${GOAL_WORDS[input.bodyGoal] ?? 'general fitness'}, so the work is ${sets} sets of ${goal.reps[0]}–${goal.reps[1]} with ${restSec}s rest.`,
      energy,
      activity,
      ceiling,
      day: dayWhy,
      missing: input.missing,
    },
    substitutions,
    cautions,
    eased,
  };
}
