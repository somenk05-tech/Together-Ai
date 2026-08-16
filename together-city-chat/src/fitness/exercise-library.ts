/**
 * ── THE EXERCISE LIBRARY ────────────────────────────────────────────────────
 *
 * What the Workout page used instead of this: three tables inside a 505-line
 * .tsx — `HOME_PLANS` (three levels × six fixed blocks), `GYM` (six splits ×
 * six names) and two gender splices — where an exercise was `{ n: string; t?:
 * number; reps?: number }`. A NAME AND A NUMBER. Nothing said what a movement
 * needs to perform it, what it works, or who should not be doing it, so
 * nothing could: a citizen who had declared joint pain was handed Jump squats
 * and Burpees, because there was no field on the row that could have said no.
 *
 * Every field here exists because a decision needs it:
 *   · `equipment` — decides whether "at home" means bodyweight or dumbbells.
 *     The old page asked home-or-gym and then assumed the answer.
 *   · `pattern` and `muscles` — let a session be BUILT rather than looked up,
 *     and are what a later adaptive pass will use to notice that upper-body
 *     work has been skipped twice.
 *   · `avoidWith` and `swapFor` — the safety rule, expressed as data. A
 *     movement that is wrong for somebody names its own stand-in, so the
 *     engine substitutes rather than silently dropping a block and leaving a
 *     session short.
 *   · `impact` — the single most common reason a movement is wrong for the
 *     person doing it, and the one the old page could not see.
 *
 * WHAT THIS IS NOT. It is not medical advice and it is not exhaustive: it is a
 * starting stimulus that a physiotherapist's instruction should override, and
 * the session says so. The contraindications below are the conservative
 * reading of general guidance (ACSM's exercise-preparticipation and pregnancy
 * positions, and standard joint-loading advice) — where the reading is
 * arguable this file takes the cautious side, because the cost of a movement
 * withheld is a slightly duller session and the cost of one offered wrongly is
 * an injury.
 */

/** The four the citizen can declare today, from DECLARED_CONDITIONS. */
export type Condition = 'hypertension' | 'diabetes' | 'pregnancy' | 'jointPain';

export const EQUIPMENT_KEYS = [
  'none', 'dumbbells', 'barbell', 'kettlebell', 'bands', 'pullupBar', 'bench', 'machines', 'cardioMachine', 'mat',
] as const;
export type Equipment = (typeof EQUIPMENT_KEYS)[number];

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'Nothing — bodyweight only',
  dumbbells: 'Dumbbells',
  barbell: 'Barbell',
  kettlebell: 'Kettlebell',
  bands: 'Resistance bands',
  pullupBar: 'Pull-up bar',
  bench: 'A bench or sturdy chair',
  machines: 'Gym machines',
  cardioMachine: 'Treadmill / bike / rower',
  mat: 'A mat',
};

export type Pattern = 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'carry' | 'cardio' | 'mobility';

export interface Exercise {
  id: string;
  name: string;
  pattern: Pattern;
  /** Plain words, because they are printed. Also what a later pass will use to
   *  notice a muscle group has been missed twice running. */
  muscles: string[];
  /** Everything needed. An empty list means bodyweight and always available. */
  equipment: Equipment[];
  impact: 'low' | 'high';
  /** Conditions under which this movement is not offered. */
  avoidWith?: Condition[];
  /** The stand-in when it is ruled out — same pattern, gentler. A movement
   *  without one is simply dropped, which is why the staples all have one. */
  swapFor?: string;
  /** Held rather than counted. */
  seconds?: number;
  /** Per side, so the printed rep count means what it says. */
  unilateral?: boolean;
}

/**
 * WHY THE CONTRAINDICATIONS ARE WHAT THEY ARE, in one place rather than
 * scattered as fields nobody can audit:
 *
 * · `jointPain` rules out IMPACT — landing forces, not effort. Squats stay;
 *   jump squats, burpees and running go, and each names a low-impact stand-in.
 * · `pregnancy` rules out impact, supine work after the first trimester (we do
 *   not ask the trimester, so it is ruled out throughout) and prone work, and
 *   nothing here asks for a maximal effort.
 * · `hypertension` rules out sustained maximal isometrics and heavy overhead
 *   pressing, where the breath-holding pressure response is largest. Aerobic
 *   work is the opposite of contraindicated and stays.
 * · `diabetes` rules out NOTHING here. It is a scheduling rule — spread the
 *   aerobic work, walk after meals — and it lives in the weekly plan engine
 *   where scheduling lives. A condition that changes the calendar should not
 *   quietly shorten a movement list.
 */
export const LIBRARY: Exercise[] = [
  // ── squat ────────────────────────────────────────────────────────────────
  { id: 'bw-squat', name: 'Bodyweight squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'low' },
  { id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', muscles: ['quads', 'glutes', 'core'], equipment: ['dumbbells'], impact: 'low' },
  { id: 'kb-goblet-squat', name: 'Kettlebell goblet squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['kettlebell'], impact: 'low' },
  { id: 'back-squat', name: 'Back squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['barbell'], impact: 'low' },
  { id: 'leg-press', name: 'Leg press', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['machines'], impact: 'low' },
  { id: 'split-squat', name: 'Split squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'low', unilateral: true },
  { id: 'jump-squat', name: 'Jump squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'high', avoidWith: ['jointPain', 'pregnancy'], swapFor: 'bw-squat' },
  { id: 'wall-sit', name: 'Wall sit', pattern: 'squat', muscles: ['quads'], equipment: [], impact: 'low', seconds: 40, avoidWith: ['hypertension'], swapFor: 'bw-squat' },

  // ── hinge ────────────────────────────────────────────────────────────────
  { id: 'glute-bridge', name: 'Glute bridge', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: ['mat'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'hip-hinge' },
  { id: 'hip-hinge', name: 'Standing hip hinge', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: [], impact: 'low' },
  { id: 'rdl-db', name: 'Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: ['dumbbells'], impact: 'low' },
  { id: 'rdl-bb', name: 'Barbell Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: ['barbell'], impact: 'low' },
  { id: 'kb-swing', name: 'Kettlebell swing', pattern: 'hinge', muscles: ['glutes', 'hamstrings', 'back'], equipment: ['kettlebell'], impact: 'low' },
  { id: 'good-morning-band', name: 'Banded good morning', pattern: 'hinge', muscles: ['hamstrings', 'back'], equipment: ['bands'], impact: 'low' },

  // ── push ─────────────────────────────────────────────────────────────────
  { id: 'push-up', name: 'Push-up', pattern: 'push', muscles: ['chest', 'shoulders', 'triceps'], equipment: [], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'incline-push-up' },
  { id: 'incline-push-up', name: 'Incline push-up', pattern: 'push', muscles: ['chest', 'shoulders', 'triceps'], equipment: [], impact: 'low' },
  { id: 'db-bench', name: 'Dumbbell bench press', pattern: 'push', muscles: ['chest', 'triceps'], equipment: ['dumbbells', 'bench'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'incline-push-up' },
  { id: 'db-shoulder-press', name: 'Shoulder press', pattern: 'push', muscles: ['shoulders', 'triceps'], equipment: ['dumbbells'], impact: 'low', avoidWith: ['hypertension'], swapFor: 'band-front-raise' },
  { id: 'band-front-raise', name: 'Band front raise', pattern: 'push', muscles: ['shoulders'], equipment: ['bands'], impact: 'low' },
  { id: 'chest-press-machine', name: 'Chest press machine', pattern: 'push', muscles: ['chest', 'triceps'], equipment: ['machines'], impact: 'low' },
  { id: 'dips-bench', name: 'Bench dip', pattern: 'push', muscles: ['triceps', 'chest'], equipment: ['bench'], impact: 'low' },

  // ── pull ─────────────────────────────────────────────────────────────────
  { id: 'db-row', name: 'Dumbbell row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['dumbbells'], impact: 'low', unilateral: true },
  { id: 'band-row', name: 'Band row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['bands'], impact: 'low' },
  { id: 'inverted-row', name: 'Inverted row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['pullupBar'], impact: 'low' },
  { id: 'pull-up', name: 'Pull-up', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['pullupBar'], impact: 'low' },
  { id: 'lat-pulldown', name: 'Lat pulldown', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['machines'], impact: 'low' },
  { id: 'face-pull-band', name: 'Band face pull', pattern: 'pull', muscles: ['upper back', 'shoulders'], equipment: ['bands'], impact: 'low' },
  { id: 'superman', name: 'Superman hold', pattern: 'pull', muscles: ['back'], equipment: ['mat'], impact: 'low', seconds: 30, avoidWith: ['pregnancy'], swapFor: 'band-row' },

  // ── core ─────────────────────────────────────────────────────────────────
  { id: 'plank', name: 'Plank', pattern: 'core', muscles: ['core'], equipment: ['mat'], impact: 'low', seconds: 40, avoidWith: ['pregnancy', 'hypertension'], swapFor: 'standing-march' },
  { id: 'dead-bug', name: 'Dead bug', pattern: 'core', muscles: ['core'], equipment: ['mat'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'standing-march' },
  { id: 'standing-march', name: 'Standing march', pattern: 'core', muscles: ['core', 'hip flexors'], equipment: [], impact: 'low' },
  { id: 'side-plank', name: 'Side plank', pattern: 'core', muscles: ['obliques', 'core'], equipment: ['mat'], impact: 'low', seconds: 25, unilateral: true, avoidWith: ['hypertension'], swapFor: 'standing-march' },
  { id: 'pallof-band', name: 'Band Pallof press', pattern: 'core', muscles: ['core', 'obliques'], equipment: ['bands'], impact: 'low' },

  // ── carry ────────────────────────────────────────────────────────────────
  { id: 'farmer-carry', name: 'Farmer carry', pattern: 'carry', muscles: ['grip', 'core', 'shoulders'], equipment: ['dumbbells'], impact: 'low', seconds: 40 },
  { id: 'suitcase-carry', name: 'Suitcase carry', pattern: 'carry', muscles: ['obliques', 'grip'], equipment: ['kettlebell'], impact: 'low', seconds: 30, unilateral: true },

  // ── cardio ───────────────────────────────────────────────────────────────
  { id: 'brisk-walk', name: 'Brisk walk', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'low', seconds: 600 },
  { id: 'march-in-place', name: 'March in place', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'low', seconds: 60 },
  { id: 'burpee', name: 'Burpee', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'high', seconds: 40, avoidWith: ['jointPain', 'pregnancy', 'hypertension'], swapFor: 'march-in-place' },
  { id: 'jumping-jacks', name: 'Jumping jacks', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'high', seconds: 45, avoidWith: ['jointPain', 'pregnancy'], swapFor: 'march-in-place' },
  { id: 'mountain-climber', name: 'Mountain climbers', pattern: 'cardio', muscles: ['core', 'whole body'], equipment: ['mat'], impact: 'high', seconds: 40, avoidWith: ['jointPain', 'pregnancy'], swapFor: 'march-in-place' },
  { id: 'cycle-erg', name: 'Stationary bike', pattern: 'cardio', muscles: ['legs'], equipment: ['cardioMachine'], impact: 'low', seconds: 600 },
  { id: 'row-erg', name: 'Rowing machine', pattern: 'cardio', muscles: ['whole body'], equipment: ['cardioMachine'], impact: 'low', seconds: 600 },

  // ── mobility ─────────────────────────────────────────────────────────────
  { id: 'cat-cow', name: 'Cat–cow', pattern: 'mobility', muscles: ['spine'], equipment: ['mat'], impact: 'low', seconds: 40 },
  { id: 'hip-opener', name: 'Standing hip opener', pattern: 'mobility', muscles: ['hips'], equipment: [], impact: 'low', seconds: 40 },
  { id: 'shoulder-circles', name: 'Shoulder circles', pattern: 'mobility', muscles: ['shoulders'], equipment: [], impact: 'low', seconds: 30 },
  { id: 'calf-stretch', name: 'Calf stretch', pattern: 'mobility', muscles: ['calves'], equipment: [], impact: 'low', seconds: 30, unilateral: true },
  { id: 'chest-opener', name: 'Doorway chest opener', pattern: 'mobility', muscles: ['chest', 'shoulders'], equipment: [], impact: 'low', seconds: 30 },
];

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));
export const exerciseById = (id: string): Exercise | undefined => BY_ID.get(id);

/** Is every piece this movement needs on the citizen's list?
 *  Bodyweight (no equipment) is always available — that is the floor a session
 *  can always be built down to, and the reason the library carries a
 *  bodyweight option in every pattern. */
export function isAvailable(e: Exercise, have: readonly Equipment[]): boolean {
  return e.equipment.every((k) => have.includes(k));
}

/** The conditions that rule this movement out for this citizen, if any. */
export function ruledOutBy(e: Exercise, conditions: readonly Condition[]): Condition[] {
  return (e.avoidWith ?? []).filter((c) => conditions.includes(c));
}
