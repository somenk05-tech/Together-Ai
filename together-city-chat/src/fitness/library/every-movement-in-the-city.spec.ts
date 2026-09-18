import { existsSync } from 'fs';
import { join } from 'path';
import { EXERCISE_CATALOG, catalogById } from '../exercise-catalog';
import { BODY_PARTS, GRADES, TRACK_ORDER, gradeForLevel, gradeOf, trackFor } from './exercise-grade';
import { EXERCISE_FILMS, filmFor } from './exercise-films';
import { SaveWorkoutPlanSchema } from './library.dto';

/**
 * ── EVERY MOVEMENT IN THE CITY (owner, 18 Sep) ──────────────────────────────
 *
 * "A separate page where all workouts in the database are mentioned with body
 * parts, and also which level they are with instructions … each workout
 * should have space for workout videos … sort men and women workouts
 * separately."
 *
 * What has to stay true of the library, held here: every movement is graded
 * and the grading is a rule a trainer would recognise; every body part the
 * catalogue names has a shelf in both libraries; a film named is a film that
 * ships; and a plan is checked before it is saved.
 */
const WEB_PUBLIC = join(__dirname, '..', '..', '..', '..', 'together-city-react', 'public');

describe('every movement is graded', () => {
  it('reads the whole catalogue', () => {
    expect(EXERCISE_CATALOG.length).toBeGreaterThan(1300);
  });

  it('puts every movement on one of three shelves, and none of the shelves is empty or everything', () => {
    const counts = { beginner: 0, intermediate: 0, advanced: 0 };
    for (const e of EXERCISE_CATALOG) counts[gradeOf(e)] += 1;
    for (const g of GRADES) {
      expect(counts[g]).toBeGreaterThan(50);
      expect(counts[g]).toBeLessThan(EXERCISE_CATALOG.length - 100);
    }
  });

  it('grades the movements a trainer would name first the way a trainer would', () => {
    const named = (n: string) => EXERCISE_CATALOG.find((e) => e.name === n)!;
    expect(gradeOf(named('full planche'))).toBe('advanced');
    expect(gradeOf(named('handstand'))).toBe('advanced');
    expect(gradeOf(named('barbell overhead squat'))).toBe('advanced');
    expect(gradeOf(named('burpee'))).toBe('advanced');
    expect(gradeOf(named('barbell full squat'))).toBe('intermediate');
    expect(gradeOf(named('barbell deadlift'))).toBe('intermediate');
    expect(gradeOf(named('push-up'))).toBe('intermediate');
    expect(gradeOf(named('dumbbell biceps curl'))).toBe('beginner');
    expect(gradeOf(named('assisted pull-up'))).toBe('beginner');
    expect(gradeOf(named('hamstring stretch'))).toBe('beginner');
    /* A stretch is a stretch whatever it is called. */
    expect(gradeOf(named('iron cross stretch'))).toBe('beginner');
  });

  it('folds the five profile tiers onto the three shelves, and says nothing for an unanswered profile', () => {
    expect(gradeForLevel('basic')).toBe('beginner');
    expect(gradeForLevel('beginner')).toBe('beginner');
    expect(gradeForLevel('intermediate')).toBe('intermediate');
    expect(gradeForLevel('advanced')).toBe('advanced');
    expect(gradeForLevel('athlete')).toBe('advanced');
    expect(gradeForLevel(null)).toBeNull();
    expect(gradeForLevel('anything else')).toBeNull();
  });
});

describe('two libraries, one catalogue', () => {
  it('gives every body part the catalogue names a shelf, in both libraries, and no shelf the catalogue lacks', () => {
    const parts = [...new Set(EXERCISE_CATALOG.map((e) => e.bodyPart))].sort();
    expect([...BODY_PARTS.map((p) => p.key)].sort()).toEqual(parts);
    expect([...TRACK_ORDER.women].sort()).toEqual(parts);
    expect([...TRACK_ORDER.men].sort()).toEqual(parts);
  });

  it('opens the two libraries on different shelves', () => {
    expect(TRACK_ORDER.women[0]).not.toBe(TRACK_ORDER.men[0]);
  });

  it('reads the identity answer, with the men’s library on an explicit Male and the women’s for everyone else', () => {
    /* The same reading the Personalize hall makes for its photograph:
       resolvedGender, never the clinical sex. */
    expect(trackFor('Male')).toBe('men');
    expect(trackFor('Female')).toBe('women');
    expect(trackFor('Non-binary')).toBe('women');
    expect(trackFor(null)).toBe('women');
    expect(trackFor(undefined)).toBe('women');
    /* And until the identity question is answered, the Training Profile's
       own sex decides (18 Sep) — it never overrides an answer. */
    expect(trackFor(null, 'male')).toBe('men');
    expect(trackFor(undefined, 'female')).toBe('women');
    expect(trackFor(null, 'other')).toBe('women');
    expect(trackFor('Non-binary', 'male')).toBe('women');
    expect(trackFor('Female', 'male')).toBe('women');
  });
});

describe('a space for the film', () => {
  it('names only movements the catalogue has', () => {
    for (const id of Object.keys(EXERCISE_FILMS)) expect({ id, known: Boolean(catalogById(id)) }).toEqual({ id, known: true });
  });

  it('ships every film it names under /assets/workout/', () => {
    for (const [id, f] of Object.entries(EXERCISE_FILMS)) {
      for (const path of [f.women, f.men, f.any].filter((p): p is string => Boolean(p))) {
        if (path.startsWith('http')) continue;
        expect(path).toMatch(/^\/assets\/workout\/[a-z0-9-]+\.mp4$/);
        expect({ id, path, exists: existsSync(join(WEB_PUBLIC, path)) }).toEqual({ id, path, exists: true });
      }
    }
  });

  it('shows a library its own film first, the shared one after, and an empty slot as empty', () => {
    expect(filmFor('1377', 'women')).toBe('/assets/workout/calf-stretch.mp4');
    expect(filmFor('1377', 'men')).toBe('/assets/workout/calf-stretch.mp4');
    expect(filmFor('0001', 'women')).toBeNull();
  });
});

describe('a plan is checked before it is saved', () => {
  const day = { day: 0, exercises: [{ id: '0001', sets: 3, reps: 12 }] };

  it('takes a day plan of one day and a week plan of several', () => {
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'Monday', kind: 'day', days: [day] }).success).toBe(true);
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'My week', kind: 'week', days: [day, { ...day, day: 2 }] }).success).toBe(true);
  });

  it('refuses a day plan of two days, a weekday twice, an empty day and a nameless plan', () => {
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'Two', kind: 'day', days: [day, { ...day, day: 1 }] }).success).toBe(false);
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'Twice', kind: 'week', days: [day, day] }).success).toBe(false);
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'Empty', kind: 'day', days: [{ day: 0, exercises: [] }] }).success).toBe(false);
    expect(SaveWorkoutPlanSchema.safeParse({ name: '  ', kind: 'day', days: [day] }).success).toBe(false);
  });

  it('takes only catalogue-shaped ids and sane numbers', () => {
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'x', kind: 'day', days: [{ day: 0, exercises: [{ id: 'bw-squat', sets: 3, reps: 12 }] }] }).success).toBe(false);
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'x', kind: 'day', days: [{ day: 0, exercises: [{ id: '0001', sets: 0, reps: 12 }] }] }).success).toBe(false);
    expect(SaveWorkoutPlanSchema.safeParse({ name: 'x', kind: 'day', days: [{ day: 0, exercises: [{ id: '0001', sets: 3, reps: 500 }] }] }).success).toBe(false);
  });
});
