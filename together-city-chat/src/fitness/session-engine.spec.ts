import { buildSession, type SessionInput } from './session-engine';
import { LIBRARY, ruledOutBy, type Condition, type Equipment } from './exercise-library';

/**
 * ── THE SESSION IS BUILT, NOT LOOKED UP ─────────────────────────────────────
 *
 * The owner's brief, 16 Aug: the workout should be recalculated from the
 * citizen's profile, goal, nutrition, activity and recovery, and it should say
 * WHY it looks like this.
 *
 * The defect that came before the brief and matters more than it: the Workout
 * page built the session in the browser from three hardcoded tables and seven
 * inputs, five of them `useState`. It read no saved profile, no body goal, no
 * lab, and NO DECLARED CONDITION — so a citizen who had told us about joint
 * pain was handed Jump squats and Burpees, while the weekly-plan engine three
 * screens away swapped their cardio for something low-impact.
 *
 * So the first four tests here are safety tests, and they are the reason this
 * file exists. The rest pin the two rules that are easy to erode: the body goal
 * sets the character of the work, and nothing may EVER answer a constraint by
 * asking for more exercise.
 */

const BASE: SessionInput = {
  minutes: 45,
  location: 'home',
  equipment: ['dumbbells', 'mat', 'bands'],
  level: 'intermediate',
  bodyGoal: 'athletic',
  conditions: [],
  intensityCap: 'vigorous',
  kcalTarget: 2455,
  proteinG: 74,
  nutritionGoal: 'lose',
  weightKg: 100,
  recent: { sessionsLast7: 2, minutesLast7: 90, daysSinceLast: 2 },
  limitations: null,
  missing: [],
};
const at = (over: Partial<SessionInput>): SessionInput => ({ ...BASE, ...over });
const namesOf = (s: ReturnType<typeof buildSession>) => s.blocks.flatMap((b) => b.exercises.map((e) => e.name));

describe('the session is built, not looked up', () => {
  describe('a declared condition removes a movement from the pool', () => {
    it('never offers an impact movement to somebody with joint pain', () => {
      const s = buildSession(at({ conditions: ['jointPain'], equipment: [] }));
      const offered = namesOf(s);
      for (const bad of ['Jump squat', 'Burpee', 'Jumping jacks', 'Mountain climbers']) {
        expect({ bad, offered: offered.includes(bad) }).toEqual({ bad, offered: false });
      }
    });

    it('substitutes rather than dropping, so the session is not quietly short', () => {
      const withOut = buildSession(at({ conditions: [], equipment: [] }));
      const withIt = buildSession(at({ conditions: ['jointPain'], equipment: [] }));
      // A ruled-out movement names its own stand-in; the work block keeps its
      // count. Dropping instead would leave a gap nothing on screen explains.
      const work = (s: typeof withIt) => s.blocks.find((b) => b.title === 'The work')!.exercises.length;
      expect(work(withIt)).toBe(work(withOut));
    });

    it('says every substitution out loud', () => {
      // A citizen quietly given an easier movement has been managed, not
      // trained. If the engine swapped something, the session carries the pair
      // and the reason.
      const s = buildSession(at({ conditions: ['pregnancy'], equipment: ['mat'] }));
      for (const sub of s.substitutions) {
        expect(sub.from).not.toBe(sub.to);
        expect(['hypertension', 'diabetes', 'pregnancy', 'jointPain']).toContain(sub.because);
      }
      // …and nothing ruled out survives into the printed session.
      const ids = s.blocks.flatMap((b) => b.exercises.map((e) => e.id));
      for (const id of ids) {
        const e = LIBRARY.find((x) => x.id === id);
        if (!e) continue; // the walk is synthesised, not a library row
        expect({ id, ruledOut: ruledOutBy(e, ['pregnancy']) }).toEqual({ id, ruledOut: [] });
      }
    });

    it('holds for every condition and every combination of them', () => {
      // The sweep, because a rule that is right for one condition and wrong for
      // a pair is the kind of hole a single example never finds.
      const all: Condition[] = ['hypertension', 'diabetes', 'pregnancy', 'jointPain'];
      const combos: Condition[][] = [];
      for (let m = 1; m < 1 << all.length; m++) combos.push(all.filter((_, i) => m & (1 << i)));
      for (const conditions of combos) {
        const s = buildSession(at({ conditions, equipment: ['dumbbells', 'mat', 'bands'] }));
        for (const b of s.blocks) {
          for (const ex of b.exercises) {
            const e = LIBRARY.find((x) => x.id === ex.id);
            if (!e) continue;
            expect({ conditions, ex: ex.name, ruledOut: ruledOutBy(e, conditions) }).toEqual({ conditions, ex: ex.name, ruledOut: [] });
          }
        }
        // …and it is never left with nothing to do.
        expect(s.blocks.find((b) => b.title === 'The work')!.exercises.length).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('it never answers a constraint with more exercise', () => {
    it('gets SHORTER when the intensity ceiling is light, not harder', () => {
      const normal = buildSession(at({}));
      const capped = buildSession(at({ intensityCap: 'light' }));
      expect(capped.minutes).toBeLessThan(normal.minutes);
      expect(capped.eased).toBe(true);
      expect(capped.intensity).toBe('light');
      // Fewer working sets, longer rest — the two levers that lower a dose.
      const sets = (s: typeof normal) => s.blocks.find((b) => b.title === 'The work')!.exercises[0].sets;
      const rest = (s: typeof normal) => s.blocks.find((b) => b.title === 'The work')!.exercises[0].restSec;
      expect(sets(capped)).toBeLessThan(sets(normal));
      expect(rest(capped)).toBeGreaterThan(rest(normal));
      // And it says so rather than just doing it.
      expect(capped.why.ceiling).toMatch(/shorter and slower rather than harder/);
    });

    it('eases a week that is already heavy', () => {
      const heavy = buildSession(at({ recent: { sessionsLast7: 6, minutesLast7: 380, daysSinceLast: 0 } }));
      expect(heavy.eased).toBe(true);
      expect(heavy.why.activity).toMatch(/lighter on purpose/);
    });

    it('answers a fat-loss goal and low movement with WALKING', () => {
      // The owner's own line: do not blindly increase exercise because somebody
      // wants faster weight loss. More walking is activity without recovery
      // cost; a harder session is not.
      const still = buildSession(at({ bodyGoal: 'fatLoss', recent: { sessionsLast7: 0, minutesLast7: 0, daysSinceLast: null } }));
      const moving = buildSession(at({ bodyGoal: 'fatLoss', recent: { sessionsLast7: 3, minutesLast7: 150, daysSinceLast: 1 } }));
      expect(still.walkMinutes).toBeGreaterThan(moving.walkMinutes);
      // …and the strength work did not get longer to compensate.
      expect(still.minutes).toBe(moving.minutes);
    });

    it('never lets an ability tier raise a lab-set ceiling', () => {
      // An athlete whose labs say light is on a light day. The ceiling is a
      // ceiling; a tier can only lower it further.
      const s = buildSession(at({ level: 'athlete', intensityCap: 'light' }));
      expect(s.intensity).toBe('light');
      const basic = buildSession(at({ level: 'basic', intensityCap: 'vigorous' }));
      expect(basic.intensity).toBe('light');
    });
  });

  describe('the body goal sets the character of the work', () => {
    it('gives each goal its own sets, reps and rest', () => {
      const build = buildSession(at({ bodyGoal: 'buildMuscle' }));
      const fat = buildSession(at({ bodyGoal: 'fatLoss' }));
      const w = (s: typeof build) => s.blocks.find((b) => b.title === 'The work')!.exercises[0];
      expect(w(build).sets).toBeGreaterThan(w(fat).sets);
      expect(w(build).restSec).toBeGreaterThan(w(fat).restSec);
      expect(w(fat).reps![1]).toBeGreaterThan(w(build).reps![1]);
    });

    it('takes its character from the BODY goal, not the nutrition goal', () => {
      // The old page had this backwards: FoodPref.goal chose the rep ranges.
      // shared/energy.ts settled it for calories in August — "a goal's
      // character lives in its protein, macros and training emphasis, not in a
      // rival calorie policy". This is the training-emphasis half.
      const a = buildSession(at({ nutritionGoal: 'lose' }));
      const b = buildSession(at({ nutritionGoal: 'gain' }));
      const w = (s: typeof a) => s.blocks.find((b2) => b2.title === 'The work')!.exercises[0];
      expect(w(a).sets).toBe(w(b).sets);
      expect(w(a).reps).toEqual(w(b).reps);
    });
  });

  describe('it uses what they have, and says what it did not know', () => {
    it('builds a bodyweight session when there is no equipment', () => {
      const s = buildSession(at({ equipment: [] }));
      const ids = s.blocks.flatMap((b) => b.exercises.map((e) => e.id));
      for (const id of ids) {
        const e = LIBRARY.find((x) => x.id === id);
        if (e) expect({ id, needs: e.equipment }).toEqual({ id, needs: [] });
      }
      expect(s.blocks.find((b) => b.title === 'The work')!.exercises.length).toBeGreaterThanOrEqual(3);
    });

    it('reaches for the equipment it was told about', () => {
      const bare = buildSession(at({ equipment: [] }));
      const kitted = buildSession(at({ equipment: ['dumbbells', 'bench', 'pullupBar', 'mat'] as Equipment[] }));
      expect(namesOf(kitted)).not.toEqual(namesOf(bare));
      // Answering the question has to be worth it: a loaded movement beats the
      // bodyweight floor when the load exists.
      expect(namesOf(kitted).some((n) => /Dumbbell|Romanian|Pull-up|bench/i.test(n))).toBe(true);
    });

    it('names what it was missing rather than inventing it', () => {
      const s = buildSession(at({ missing: ['what you have to train with — without it a home session can only be bodyweight'] }));
      expect(s.why.missing).toHaveLength(1);
      expect(s.why.missing[0]).toMatch(/what you have to train with/);
    });

    it('prints a limitation in the citizen’s own words, unparsed', () => {
      // A machine guessing at "bad left shoulder, no overhead" is worse than a
      // human reading it.
      const s = buildSession(at({ limitations: 'bad left shoulder, no overhead' }));
      expect(s.cautions.join(' ')).toContain('bad left shoulder, no overhead');
    });
  });

  describe('the explanation is made of the inputs', () => {
    it('names the goal, the day’s energy and the week’s activity', () => {
      const s = buildSession(at({}));
      expect(s.why.goal).toMatch(/body goal/);
      expect(s.why.energy).toMatch(/2,455 kcal/);
      expect(s.why.energy).toMatch(/74 g of protein/);
      expect(s.why.activity).toMatch(/2 sessions and 90 minutes/);
    });

    it('says nothing about energy when Nutrition could not answer', () => {
      // Better a missing sentence than a plausible number nobody computed.
      const s = buildSession(at({ kcalTarget: null, proteinG: null }));
      expect(s.why.energy).toBeNull();
    });
  });

  it('always warms up and always cools down, however short the day', () => {
    // A shortened session is fewer WORKING sets, never a cold body going
    // straight into load.
    for (const minutes of [15, 20, 30, 45, 60, 90, 120]) {
      const s = buildSession(at({ minutes, intensityCap: 'light', level: 'basic' }));
      expect({ minutes, warm: s.blocks[0].exercises.length > 0 }).toEqual({ minutes, warm: true });
      expect({ minutes, cool: s.blocks[2].exercises.length > 0 }).toEqual({ minutes, cool: true });
    }
  });

  it('is pure — the same body twice is the same session twice', () => {
    // No clock, no random, no I/O. It is what lets the whole of this file
    // exist, and what stops a second copy of any rule appearing on a page.
    expect(buildSession(at({}))).toEqual(buildSession(at({})));
  });
});

/**
 * THE WEEK AND THE DAY ARE THE SAME DAY.
 *
 * Until 21 Aug the two engines did not speak: the weekly plan said "Tuesday —
 * Pull" and this one built a full-body session for everybody, every day. A
 * citizen following the plan was following two plans, and no screen in the
 * application could have shown them disagreeing.
 *
 * The rule this adds is narrow on purpose. A day ORDERS the patterns. It does
 * not choose the exercises, set the volume, or touch the ceiling — those were
 * decided by rules older than this field, and a day gets no exception to any
 * of them.
 */
describe('today follows the week it belongs to', () => {
  const day = (title: string, patterns: string[]) =>
    ({ title, trains: ['back', 'arms'], patterns, kind: 'strength' }) as NonNullable<SessionInput['day']>;
  const work = (s: ReturnType<typeof buildSession>) =>
    s.blocks.find((b) => b.title === 'The work')!.exercises;
  const built = (over: Partial<SessionInput>) => buildSession(at(over));

  it('leads with the day\u2019s own patterns', () => {
    expect(work(built({ minutes: 45, day: day('Pull', ['pull', 'carry']) }))[0].pattern).toBe('pull');
  });

  it('gives two different days two different sessions', () => {
    const pull = work(built({ minutes: 45, day: day('Pull', ['pull', 'carry']) }));
    const legs = work(built({ minutes: 45, day: day('Legs', ['squat', 'hinge']) }));
    expect(pull.map((e) => e.id)).not.toEqual(legs.map((e) => e.id));
    expect(legs[0].pattern === 'squat' || legs[0].pattern === 'hinge').toBe(true);
  });

  it('emphasises rather than fences \u2014 a long day still fills its budget', () => {
    // The failure this rules out is a "Pull day" answering a 60-minute session
    // with two exercises because only two were on the label. Removing work to
    // satisfy a constraint is the one thing this engine never does.
    const long = work(built({ minutes: 60, day: day('Pull', ['pull']) }));
    expect(long.length).toBeGreaterThan(2);
    expect(new Set(long.map((e) => e.pattern)).size).toBeGreaterThan(1);
  });

  it('names the day in the headline and in the explanation', () => {
    const s = built({ minutes: 45, day: day('Pull', ['pull']) });
    expect(s.headline).toContain('pull');
    expect(s.why.day).toContain('Pull');
    expect(s.why.day).toContain('back');
  });

  it('says nothing about a day it was not given', () => {
    // A session built without a week must not invent one \u2014 which is also what
    // keeps every test above this block describing the same engine.
    expect(built({ minutes: 45 }).why.day).toBeNull();
  });

  it('changes nothing else about the session', () => {
    const without = built({ minutes: 45 });
    const withDay = built({ minutes: 45, day: day('Pull', ['pull']) });
    expect(withDay.minutes).toBe(without.minutes);
    expect(withDay.intensity).toBe(without.intensity);
    expect(work(withDay).length).toBe(work(without).length);
    expect(work(withDay)[0].sets).toBe(work(without)[0].sets);
  });

  it('never lets a day raise the ceiling', () => {
    const capped = built({ minutes: 45, intensityCap: 'light', day: day('Legs', ['squat', 'hinge']) });
    expect(capped.intensity).toBe('light');
    expect(capped.eased).toBe(true);
  });
});
