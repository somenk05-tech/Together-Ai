/**
 * ── EVERY MOVEMENT IN THE CITY, GRADED (owner, 18 Sep) ──────────────────────
 *
 * "A separate page where all workouts in the database are mentioned with body
 * parts, and also which level they are."
 *
 * The catalogue (exercise-catalog.ts, 1,324 movements) says what a movement
 * works and what it needs. It does NOT say how hard it is — the dataset has no
 * level column — so the level printed on the library page is THE CITY'S OWN
 * GRADING, decided here by one rule that can be read and argued with, rather
 * than 1,324 opinions typed by hand:
 *
 *   · ADVANCED is a SKILL list — planche, lever, muscle-up, pistol, the
 *     Olympic lifts, jumps and loaded overhead squats. Movements where the
 *     usual way to get them wrong is to get hurt.
 *   · BEGINNER is whatever the equipment steadies (assisted, machine, band,
 *     cardio machines), every stretch, and ISOLATION work — curls, raises,
 *     extensions, rows, crunches — where the load is small and the movement
 *     is one joint.
 *   · INTERMEDIATE is the rest: free-weight and bodyweight compound work —
 *     squats, lunges, presses, deadlifts, push-ups, dips, planks.
 *
 * A rule of thumb, not a prescription, and the page says so. It is here
 * rather than in the generated catalogue so the catalogue can be regenerated
 * without losing it, and so a spec can hold the grading of the movements a
 * trainer would name first.
 *
 * The three grades map onto the Training Profile's five tiers (basic and
 * beginner → beginner; intermediate; advanced and athlete → advanced) so the
 * page can open on the citizen's own shelf.
 */
import type { CatalogExercise } from '../exercise-catalog';

export type Grade = 'beginner' | 'intermediate' | 'advanced';
export const GRADES: readonly Grade[] = ['beginner', 'intermediate', 'advanced'];

export const GRADE_LABEL: Record<Grade, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

/** A stretch is a stretch whatever it is called — the iron cross STRETCH is
 *  not the iron cross. Checked before anything else. */
const STRETCH = /stretch/i;

const ADVANCED_NAME = /planche|muscle.?up|pistol|front lever|back lever|handstand|human flag|dragon flag|\bl-sit\b|v-sit|snatch|\bclean\b|jerk|deficit|nordic|glute.?ham|sissy|rollerout|rollout|wheel|plyo|clap|drop jump|box jump|depth jump|overhead squat|zercher|one arm (?:push|pull|chin)[- ]?up|single arm (?:push|pull|chin)[- ]?up|archer|typewriter|skin the cat|rope climb|turkish|windmill|bent press|iron cross|superman push|weighted (?:pull|chin|dip|muscle)|impossible|90 degree|\bflag\b|shrimp|split jump|jump squat|jumping lunge|burpee|kipping|one leg squat|single leg squat|hanging (?:straight )?leg raise|toes to bar|around the world|full body|manmaker|man maker|thruster|swing/i;
const ADVANCED_EQUIPMENT = /^(?:tire|hammer|olympic barbell)$/;

const BEGINNER_EQUIPMENT = /^(?:assisted|leverage machine|sled machine|band|resistance band|elliptical machine|stepmill machine|stationary bike|skierg machine|upper body ergometer)$/;
const BEGINNER_NAME = /mobility|\bwalk|march|\bwall\b|incline push|knee push|bird dog|dead bug|\bcat\b|cobra|child|pelvic tilt|neck|ankle|wrist|circles?\b|seated (?:leg|calf)|step[- ]up|glute bridge|bridge/i;
const ISOLATION = /curl|extension|raise|\bfly\b|flyes|kickback|shrug|crunch|sit-up|sit up|twist|side bend|pulldown|pull-down|pushdown|push-down|\brow\b|hyperextension|pullover|calf|face pull|reverse fly|rotation|lateral|front raise|good morning|leg curl|leg extension|skullcrusher|triceps|biceps|wrist|forearm|abduction|adduction|hip thrust|kick|knee raise|leg raise|heel|toe touch/i;

export function gradeOf(e: Pick<CatalogExercise, 'name' | 'equipment'>): Grade {
  if (STRETCH.test(e.name)) return 'beginner';
  if (ADVANCED_NAME.test(e.name) || ADVANCED_EQUIPMENT.test(e.equipment)) return 'advanced';
  if (BEGINNER_EQUIPMENT.test(e.equipment) || BEGINNER_NAME.test(e.name)) return 'beginner';
  if (ISOLATION.test(e.name)) return 'beginner';
  return 'intermediate';
}

/** The Training Profile's five tiers, folded onto the three shelves. */
export function gradeForLevel(level: string | null | undefined): Grade | null {
  switch (level) {
    case 'basic':
    case 'beginner': return 'beginner';
    case 'intermediate': return 'intermediate';
    case 'advanced':
    case 'athlete': return 'advanced';
    default: return null;
  }
}

/**
 * ── THE BODY, IN THE CITY'S WORDS ───────────────────────────────────────────
 *
 * The dataset says 'waist' and 'upper legs'. The page says Core and Legs. The
 * translation happens once, here, and the key stays the dataset's so a filter
 * survives a regeneration.
 */
export const BODY_PARTS: { key: string; label: string; line: string }[] = [
  { key: 'chest', label: 'Chest', line: 'Pectorals — pressing and flying.' },
  { key: 'back', label: 'Back', line: 'Lats, upper back and spine — pulling.' },
  { key: 'shoulders', label: 'Shoulders', line: 'Delts — pressing and raising.' },
  { key: 'upper arms', label: 'Arms', line: 'Biceps and triceps.' },
  { key: 'upper legs', label: 'Legs & glutes', line: 'Quads, hamstrings, glutes and adductors.' },
  { key: 'waist', label: 'Core', line: 'Abs and obliques.' },
  { key: 'lower legs', label: 'Calves', line: 'Calves and ankles.' },
  { key: 'lower arms', label: 'Forearms', line: 'Grip and wrists.' },
  { key: 'cardio', label: 'Cardio', line: 'Heart and lungs — machines and conditioning.' },
  { key: 'neck', label: 'Neck', line: 'The two movements the catalogue has for it.' },
];
export const bodyPartLabel = (key: string): string => BODY_PARTS.find((p) => p.key === key)?.label ?? key;

/**
 * ── TWO LIBRARIES, ONE CATALOGUE (owner, 18 Sep) ────────────────────────────
 *
 * "Sort men and women workouts separately."
 *
 * A muscle is a muscle, so every movement is in both libraries; what differs
 * is THE FILM and THE ORDER. Every movement is being filmed twice — once by
 * the woman trainer and once by the man (The-Workout-Films-9-Sep.md) — and
 * the women's library carries her film, the men's his. The shelves open in
 * the order each library's readers reach for first, which is the only
 * "sorting" a catalogue of anatomy can honestly do. Neither library hides a
 * movement from anybody.
 *
 * Which library a citizen reads is decided by the Master Profile's
 * `resolvedGender` — the identity answer, never the clinical sex — with the
 * men's library on an explicit Male and the women's for everyone else, the
 * same reading the Personalize hall uses for its photograph.
 */
export type Track = 'women' | 'men';
export const TRACK_LABEL: Record<Track, string> = { women: 'Women’s library', men: 'Men’s library' };
export const TRACK_ORDER: Record<Track, string[]> = {
  women: ['upper legs', 'waist', 'back', 'shoulders', 'upper arms', 'chest', 'lower legs', 'lower arms', 'cardio', 'neck'],
  men: ['chest', 'back', 'shoulders', 'upper arms', 'upper legs', 'waist', 'lower legs', 'lower arms', 'cardio', 'neck'],
};
export const trackFor = (resolvedGender: string | null | undefined, sex?: string | null): Track => {
  if (resolvedGender === 'Male') return 'men';
  if (resolvedGender) return 'women';
  /* NO IDENTITY ANSWER YET (owner, 18 Sep: "show only men's workouts for
     men"). A citizen who filled in the Training Profile and never the
     gender question was being handed the women's library by default. The
     profile's own sex decides until the identity answer arrives; once it
     does, it wins, as above. */
  return sex === 'male' ? 'men' : 'women';
};
