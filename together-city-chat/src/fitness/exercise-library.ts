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

import { catalogById, exerciseGifUrl, exerciseThumbUrl } from './exercise-catalog';

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
  /**
   * ── HOW IT IS ACTUALLY DONE ─────────────────────────────────────────────
   *
   * Exactly one of these, never neither — the spec fails if any row here can
   * only say its own name. A live timer counting down over the words "Standing
   * hip opener" tells somebody who has never done one precisely nothing, and
   * this hub shipped 46 of those.
   *
   * `datasetId` points into exercise-catalog.ts — the 1,324 movements from
   * hasaneyldrm/exercises-dataset. It is used only where the dataset describes
   * THIS movement rather than one like it: a barbell good morning's
   * instructions printed on a banded good morning would have somebody reaching
   * for a bar that is not in the room, which is worse than saying nothing.
   *
   * `steps` is the hand-written fallback for the twenty-four the dataset has no
   * honest equivalent of — a plain bodyweight squat and a plain plank among
   * them, neither of which it ever names without a variation attached.
   */
  datasetId?: string;
  steps?: string[];
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
  { id: 'bw-squat', name: 'Bodyweight squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'low', steps: ['Stand with your feet a little wider than your hips, toes turned slightly out.', 'Send your hips back and down as though sitting into a low chair, keeping your chest up.', 'Go as low as you can with your heels flat and your knees tracking over your toes.', 'Drive through the whole foot to stand tall again.'] },
  { id: 'goblet-squat', name: 'Goblet squat', pattern: 'squat', muscles: ['quads', 'glutes', 'core'], equipment: ['dumbbells'], impact: 'low', datasetId: '1760' },
  { id: 'kb-goblet-squat', name: 'Kettlebell goblet squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['kettlebell'], impact: 'low', datasetId: '0534' },
  { id: 'back-squat', name: 'Back squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['barbell'], impact: 'low', datasetId: '0043' },
  { id: 'leg-press', name: 'Leg press', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: ['machines'], impact: 'low', steps: ['Sit into the machine with your back and head against the pad, feet flat on the platform about hip-width apart.', 'Release the safety catches and lower the platform until your knees are near ninety degrees.', 'Press through your heels until your legs are almost straight — do not lock the knees out hard.', 'Lower under control; do not let the weight drop onto the stack.'] },
  { id: 'split-squat', name: 'Split squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'low', unilateral: true, steps: ['Stand in a long stride, one foot forward and one behind, weight mostly on the front leg.', 'Lower straight down until the back knee is just above the floor.', 'Keep the front shin close to vertical and your torso upright.', 'Push through the front heel to stand, and finish all the reps before you swap legs.'] },
  { id: 'jump-squat', name: 'Jump squat', pattern: 'squat', muscles: ['quads', 'glutes'], equipment: [], impact: 'high', avoidWith: ['jointPain', 'pregnancy'], swapFor: 'bw-squat', datasetId: '0514' },
  { id: 'wall-sit', name: 'Wall sit', pattern: 'squat', muscles: ['quads'], equipment: [], impact: 'low', seconds: 40, avoidWith: ['hypertension'], swapFor: 'bw-squat', steps: ['Stand with your back flat against a wall and walk your feet out about two steps.', 'Slide down until your thighs are roughly parallel to the floor and your knees are over your ankles.', 'Hold, breathing normally — do not hold your breath.', 'Push through your heels and slide back up to finish.'] },

  // ── hinge ────────────────────────────────────────────────────────────────
  { id: 'glute-bridge', name: 'Glute bridge', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: ['mat'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'hip-hinge', datasetId: '3013' },
  { id: 'hip-hinge', name: 'Standing hip hinge', pattern: 'hinge', muscles: ['glutes', 'hamstrings'], equipment: [], impact: 'low', steps: ['Stand with your feet hip-width apart and a soft bend in the knees.', 'Push your hips straight back and let your chest travel forward, keeping your back flat.', 'Go until you feel a stretch down the back of your thighs, not until your back rounds.', 'Squeeze your glutes to stand tall again.'] },
  { id: 'rdl-db', name: 'Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: ['dumbbells'], impact: 'low', datasetId: '1459' },
  { id: 'rdl-bb', name: 'Barbell Romanian deadlift', pattern: 'hinge', muscles: ['hamstrings', 'glutes', 'back'], equipment: ['barbell'], impact: 'low', datasetId: '0085' },
  { id: 'kb-swing', name: 'Kettlebell swing', pattern: 'hinge', muscles: ['glutes', 'hamstrings', 'back'], equipment: ['kettlebell'], impact: 'low', datasetId: '0549' },
  { id: 'good-morning-band', name: 'Banded good morning', pattern: 'hinge', muscles: ['hamstrings', 'back'], equipment: ['bands'], impact: 'low', steps: ['Stand on the middle of the band with feet hip-width apart and loop the other end behind your neck and shoulders.', 'Soften the knees, then push your hips back and hinge your chest toward the floor with a flat back.', 'Stop when you feel the hamstrings load — the band should be tight, not choking.', 'Drive the hips forward to stand up.'] },

  // ── push ─────────────────────────────────────────────────────────────────
  { id: 'push-up', name: 'Push-up', pattern: 'push', muscles: ['chest', 'shoulders', 'triceps'], equipment: [], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'incline-push-up', datasetId: '0662' },
  { id: 'incline-push-up', name: 'Incline push-up', pattern: 'push', muscles: ['chest', 'shoulders', 'triceps'], equipment: [], impact: 'low', datasetId: '0493' },
  { id: 'db-bench', name: 'Dumbbell bench press', pattern: 'push', muscles: ['chest', 'triceps'], equipment: ['dumbbells', 'bench'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'incline-push-up', datasetId: '0289' },
  { id: 'db-shoulder-press', name: 'Shoulder press', pattern: 'push', muscles: ['shoulders', 'triceps'], equipment: ['dumbbells'], impact: 'low', avoidWith: ['hypertension'], swapFor: 'band-front-raise', datasetId: '0405' },
  { id: 'band-front-raise', name: 'Band front raise', pattern: 'push', muscles: ['shoulders'], equipment: ['bands'], impact: 'low', datasetId: '0978' },
  { id: 'chest-press-machine', name: 'Chest press machine', pattern: 'push', muscles: ['chest', 'triceps'], equipment: ['machines'], impact: 'low', datasetId: '0576' },
  { id: 'dips-bench', name: 'Bench dip', pattern: 'push', muscles: ['triceps', 'chest'], equipment: ['bench'], impact: 'low', datasetId: '0129' },

  // ── pull ─────────────────────────────────────────────────────────────────
  { id: 'db-row', name: 'Dumbbell row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['dumbbells'], impact: 'low', unilateral: true, datasetId: '0293' },
  { id: 'band-row', name: 'Band row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['bands'], impact: 'low', datasetId: '0988' },
  { id: 'inverted-row', name: 'Inverted row', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['pullupBar'], impact: 'low', datasetId: '0499' },
  { id: 'pull-up', name: 'Pull-up', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['pullupBar'], impact: 'low', datasetId: '0652' },
  { id: 'lat-pulldown', name: 'Lat pulldown', pattern: 'pull', muscles: ['back', 'biceps'], equipment: ['machines'], impact: 'low', datasetId: '0150' },
  { id: 'face-pull-band', name: 'Band face pull', pattern: 'pull', muscles: ['upper back', 'shoulders'], equipment: ['bands'], impact: 'low', steps: ['Anchor a band at about chest height and hold one end in each hand, arms straight, palms down.', 'Step back until the band is tight, then pull the ends toward your forehead, elbows high and wide.', 'Finish with your hands beside your ears and your shoulder blades pulled together.', 'Return slowly with the arms straight.'] },
  { id: 'superman', name: 'Superman hold', pattern: 'pull', muscles: ['back'], equipment: ['mat'], impact: 'low', seconds: 30, avoidWith: ['pregnancy'], swapFor: 'band-row', steps: ['Lie face down with your arms stretched out in front of you and your legs straight.', 'Lift your arms, chest and legs a few inches off the floor at the same time.', 'Look at the floor rather than forward, and hold without arching hard through the lower back.', 'Lower everything under control.'] },

  // ── core ─────────────────────────────────────────────────────────────────
  { id: 'plank', name: 'Plank', pattern: 'core', muscles: ['core'], equipment: ['mat'], impact: 'low', seconds: 40, avoidWith: ['pregnancy', 'hypertension'], swapFor: 'standing-march', steps: ['Set your forearms on the floor under your shoulders and stretch your legs back onto your toes.', 'Squeeze your glutes and brace your stomach so your body makes one straight line.', 'Do not let your hips sag or lift; breathe normally throughout.', 'Hold for the time, then lower your knees to finish.'] },
  { id: 'dead-bug', name: 'Dead bug', pattern: 'core', muscles: ['core'], equipment: ['mat'], impact: 'low', avoidWith: ['pregnancy'], swapFor: 'standing-march', datasetId: '0276' },
  { id: 'standing-march', name: 'Standing march', pattern: 'core', muscles: ['core', 'hip flexors'], equipment: [], impact: 'low', steps: ['Stand tall with your feet hip-width apart and your stomach braced.', 'Lift one knee to hip height without letting your torso lean back.', 'Lower it under control and lift the other — slowly, this is not a jog.', 'Keep the count even on both sides.'] },
  { id: 'side-plank', name: 'Side plank', pattern: 'core', muscles: ['obliques', 'core'], equipment: ['mat'], impact: 'low', seconds: 25, unilateral: true, avoidWith: ['hypertension'], swapFor: 'standing-march', steps: ['Lie on one side with your forearm under your shoulder and your legs stacked.', 'Lift your hips until your body makes a straight line from ear to ankle.', 'Keep the top shoulder stacked over the bottom one, and do not let your hips drop.', 'Hold for the time, then swap sides.'] },
  { id: 'pallof-band', name: 'Band Pallof press', pattern: 'core', muscles: ['core', 'obliques'], equipment: ['bands'], impact: 'low', datasetId: '0979' },

  // ── carry ────────────────────────────────────────────────────────────────
  { id: 'farmer-carry', name: 'Farmer carry', pattern: 'carry', muscles: ['grip', 'core', 'shoulders'], equipment: ['dumbbells'], impact: 'low', seconds: 40, datasetId: '2133' },
  { id: 'suitcase-carry', name: 'Suitcase carry', pattern: 'carry', muscles: ['obliques', 'grip'], equipment: ['kettlebell'], impact: 'low', seconds: 30, unilateral: true, steps: ['Hold one weight at your side, arm straight, as though carrying a suitcase.', 'Stand tall and brace your stomach so you do not lean away from the load.', 'Walk slowly with even steps for the time, then swap hands.', 'Set the weight down under control rather than dropping it.'] },

  // ── cardio ───────────────────────────────────────────────────────────────
  { id: 'brisk-walk', name: 'Brisk walk', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'low', seconds: 600, steps: ['Walk at a pace where you are breathing harder but could still hold a conversation.', 'Keep your steps quick rather than long, and let your arms swing.', 'Stay on flat ground if your knees or hips complain about hills.', 'Ease off for the last minute rather than stopping dead.'] },
  { id: 'march-in-place', name: 'March in place', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'low', seconds: 60, steps: ['Stand tall and march on the spot, lifting each knee toward hip height.', 'Swing your arms in time with your legs.', 'Stay light on your feet — this is a warm-up pace, not a run.', 'Slow down for the last few seconds rather than stopping suddenly.'] },
  { id: 'burpee', name: 'Burpee', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'high', seconds: 40, avoidWith: ['jointPain', 'pregnancy', 'hypertension'], swapFor: 'march-in-place', datasetId: '1160' },
  { id: 'jumping-jacks', name: 'Jumping jacks', pattern: 'cardio', muscles: ['whole body'], equipment: [], impact: 'high', seconds: 45, avoidWith: ['jointPain', 'pregnancy'], swapFor: 'march-in-place', datasetId: '3224' },
  { id: 'mountain-climber', name: 'Mountain climbers', pattern: 'cardio', muscles: ['core', 'whole body'], equipment: ['mat'], impact: 'high', seconds: 40, avoidWith: ['jointPain', 'pregnancy'], swapFor: 'march-in-place', datasetId: '0630' },
  { id: 'cycle-erg', name: 'Stationary bike', pattern: 'cardio', muscles: ['legs'], equipment: ['cardioMachine'], impact: 'low', seconds: 600, steps: ['Set the saddle so your leg is almost straight at the bottom of the pedal stroke.', 'Start with two easy minutes before you settle into the working pace.', 'Keep the pedals turning smoothly rather than stamping on them.', 'Finish with a minute of easy spinning.'] },
  { id: 'row-erg', name: 'Rowing machine', pattern: 'cardio', muscles: ['whole body'], equipment: ['cardioMachine'], impact: 'low', seconds: 600, steps: ['Sit with the strap over the widest part of your feet and take hold of the handle.', 'Push with the legs first, then swing the body back, then pull the handle to the bottom of your ribs.', 'Reverse the order coming forward: arms, body, legs.', 'Keep the stroke long and unhurried rather than fast and short.'] },

  // ── mobility ─────────────────────────────────────────────────────────────
  { id: 'cat-cow', name: 'Cat–cow', pattern: 'mobility', muscles: ['spine'], equipment: ['mat'], impact: 'low', seconds: 40, steps: ['Kneel on all fours with your hands under your shoulders and knees under your hips.', 'Breathe out and round your back toward the ceiling, dropping your head.', 'Breathe in and let your stomach sink as your chest and tailbone lift.', 'Move slowly between the two for the time.'] },
  { id: 'hip-opener', name: 'Standing hip opener', pattern: 'mobility', muscles: ['hips'], equipment: [], impact: 'low', seconds: 40, steps: ['Stand tall and hold something steady with one hand.', 'Lift one knee to hip height, then open it out to the side and circle it back down.', 'Move through as much range as you have without twisting your lower back.', 'Do half the time on one leg and half on the other.'] },
  { id: 'shoulder-circles', name: 'Shoulder circles', pattern: 'mobility', muscles: ['shoulders'], equipment: [], impact: 'low', seconds: 30, steps: ['Stand tall with your arms relaxed at your sides.', 'Roll both shoulders forward in big slow circles for half the time.', 'Reverse and roll them backwards for the rest.', 'Keep your neck long and your jaw loose.'] },
  { id: 'calf-stretch', name: 'Calf stretch', pattern: 'mobility', muscles: ['calves'], equipment: [], impact: 'low', seconds: 30, unilateral: true, datasetId: '1377' },
  { id: 'chest-opener', name: 'Doorway chest opener', pattern: 'mobility', muscles: ['chest', 'shoulders'], equipment: [], impact: 'low', seconds: 30, steps: ['Stand in a doorway and place a forearm flat on the frame, elbow at shoulder height.', 'Step gently forward with the same-side foot until you feel a stretch across the chest.', 'Hold without bouncing, breathing normally.', 'Swap sides for the second half of the time.'] },
];

const BY_ID = new Map(LIBRARY.map((e) => [e.id, e]));
export const exerciseById = (id: string): Exercise | undefined => BY_ID.get(id);

/**
 * ── WHAT TO DO, IN ORDER ────────────────────────────────────────────────────
 *
 * The one place either source of instructions is read, so no surface has to
 * know that there are two. A movement with a `datasetId` is described by the
 * catalogue; the rest carry their own words.
 *
 * IT RETURNS AN EMPTY LIST RATHER THAN THROWING when a dataset id has gone
 * stale — a regenerated catalogue is a data change, and a data change should
 * cost a paragraph on one card, not a 500 on the whole session.
 */
export function howTo(e: Exercise): string[] {
  if (e.steps?.length) return e.steps;
  if (!e.datasetId) return [];
  return catalogById(e.datasetId)?.steps ?? [];
}

/**
 * The picture, where there is one — and there is one only for the movements the
 * dataset describes. Hand-written steps have no media and must not borrow any:
 * an animation of a barbell good morning over the words "banded good morning"
 * is the same lie as the instructions would have been.
 *
 * Both URLs are the catalogue's, built against a pinned commit, at the 180×180
 * the media terms allow. `EXERCISE_MEDIA_ATTRIBUTION` travels with them.
 */
export function mediaFor(e: Exercise): { thumb: string; gif: string } {
  const c = e.datasetId ? catalogById(e.datasetId) : undefined;
  return c ? { thumb: exerciseThumbUrl(c), gif: exerciseGifUrl(c) } : { thumb: '', gif: '' };
}

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
