import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useAddWorkout } from '../api';
import { useFoodPref, useNutritionTargets } from '@/features/nutrition/hooks';

/* ---------- shared body profile (from the Nutrition food-preference profile) ---------- */
type Gender = 'male' | 'female';
type Goal = 'lose' | 'maintain' | 'gain';
interface Health { age: number; gender: Gender; heightCm: number; weightKg: number; goal: Goal }
/**
 * Stand-ins, used to draw a page when the citizen has told us nothing.
 *
 * They are not a profile and must never be shown as one. `healthFromPref`
 * returns `assumed[]` naming every field that fell back to one of these, and
 * the panel says so — the same shape target-readiness.ts uses in Nutrition,
 * for the same reason: a number built from an average is a real answer to a
 * different question.
 */
const DEFAULT_HEALTH: Health = { age: 30, gender: 'female', heightCm: 165, weightKg: 65, goal: 'maintain' };

const WORKOUT_MIN = 60, WALK_MIN = 20, STEPS_PER_MIN = 130;
const WALK_STEPS = WALK_MIN * STEPS_PER_MIN;
const inr = (n: number) => Math.round(n).toLocaleString('en-IN');
const kcalWorkout = (min: number, weight: number) => Math.round(6.0 * weight * (min / 60));
const kcalWalk = (min: number, weight: number) => Math.round(4.3 * weight * (min / 60));

/*
 * There is no calorieTarget() here any more, and that is the point.
 *
 * This was the app's fourth Mifflin-St Jeor — thoughtfully written (it carried
 * assumed[] and sexKnown and said when the figure was an average), and still a
 * different number for the same person. The daily target is computed once, in
 * the API's shared/energy.ts; this page renders the one /nutrition/targets
 * returns, or renders no number at all. src/app/one-energy.test.ts keeps this
 * from growing back.
 */
const goalTagOf = (g: Goal) => ({ gain: 'Hypertrophy', lose: 'Fat loss', maintain: 'Strength' }[g]);

/* ---------- routine data ---------- */
type Item = { n: string; t?: number; reps?: number; rest?: boolean };
type Block = { block: string; rounds: number; items: Item[] };
type Level = 'beginner' | 'intermediate' | 'advanced';
type Loc = 'home' | 'gym';

const mmss = (s: number) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), ss = s % 60; return `${m}:${ss < 10 ? '0' : ''}${ss}`; };

const HOME_PLANS: Record<Level, Block[]> = {
  beginner: [
    { block: 'Warm-up', rounds: 1, items: [{ n: 'March in place', t: 60 }, { n: 'Arm circles', t: 30 }, { n: 'Bodyweight squats', t: 40 }, { n: 'Step jacks', t: 40 }, { n: 'Rest', t: 30, rest: true }] },
    { block: 'Legs & glutes', rounds: 3, items: [{ n: 'Box / chair squats', reps: 12 }, { n: 'Glute bridges', reps: 15 }, { n: 'Standing calf raises', reps: 15 }, { n: 'Rest', t: 50, rest: true }] },
    { block: 'Push', rounds: 3, items: [{ n: 'Wall / knee push-ups', reps: 10 }, { n: 'Shoulder press (bottles)', reps: 12 }, { n: 'Rest', t: 50, rest: true }] },
    { block: 'Core', rounds: 3, items: [{ n: 'Dead bug', reps: 12 }, { n: 'Modified plank', t: 25 }, { n: 'Knee raises', reps: 12 }, { n: 'Rest', t: 50, rest: true }] },
    { block: 'Low-impact cardio', rounds: 2, items: [{ n: 'Marching high knees', t: 40 }, { n: 'Side steps', t: 40 }, { n: 'Rest', t: 40, rest: true }] },
    { block: 'Cool-down', rounds: 1, items: [{ n: 'Hamstring stretch', t: 40 }, { n: 'Quad stretch', t: 40 }, { n: "Child's pose", t: 60 }] },
  ],
  intermediate: [
    { block: 'Warm-up', rounds: 1, items: [{ n: 'Jumping jacks', t: 60 }, { n: 'Arm circles', t: 30 }, { n: 'Bodyweight squats', t: 45 }, { n: 'High knees', t: 45 }, { n: 'Rest', t: 30, rest: true }] },
    { block: 'Lower body', rounds: 4, items: [{ n: 'Squats', reps: 15 }, { n: 'Alternating lunges', reps: 24 }, { n: 'Glute bridges', reps: 20 }, { n: 'Rest', t: 45, rest: true }] },
    { block: 'Upper body', rounds: 4, items: [{ n: 'Push-ups', reps: 12 }, { n: 'Bent-over rows', reps: 15 }, { n: 'Shoulder taps', t: 40 }, { n: 'Rest', t: 45, rest: true }] },
    { block: 'Core', rounds: 4, items: [{ n: 'Plank', t: 45 }, { n: 'Bicycle crunches', t: 40 }, { n: 'Russian twists', t: 40 }, { n: 'Rest', t: 45, rest: true }] },
    { block: 'Cardio finisher', rounds: 3, items: [{ n: 'Burpees', t: 40 }, { n: 'Mountain climbers', t: 40 }, { n: 'Rest', t: 40, rest: true }] },
    { block: 'Cool-down', rounds: 1, items: [{ n: 'Hamstring stretch', t: 40 }, { n: 'Quad stretch', t: 40 }, { n: 'Chest stretch', t: 40 }, { n: "Child's pose", t: 60 }] },
  ],
  advanced: [
    { block: 'Warm-up', rounds: 1, items: [{ n: 'Jumping jacks', t: 60 }, { n: "World's greatest stretch", t: 40 }, { n: 'Jump squats', t: 30 }, { n: 'High knees', t: 45 }, { n: 'Rest', t: 20, rest: true }] },
    { block: 'Lower power', rounds: 4, items: [{ n: 'Jump squats', reps: 18 }, { n: 'Bulgarian split squats', reps: 20 }, { n: 'Single-leg glute bridge', reps: 20 }, { n: 'Rest', t: 40, rest: true }] },
    { block: 'Push power', rounds: 4, items: [{ n: 'Push-ups', reps: 20 }, { n: 'Pike push-ups', reps: 14 }, { n: 'Explosive push-ups', reps: 10 }, { n: 'Rest', t: 40, rest: true }] },
    { block: 'Core', rounds: 4, items: [{ n: 'Hollow hold', t: 45 }, { n: 'V-ups', reps: 18 }, { n: 'Plank to push-up', t: 40 }, { n: 'Rest', t: 40, rest: true }] },
    { block: 'Conditioning', rounds: 3, items: [{ n: 'Burpees', t: 45 }, { n: 'Mountain climbers', t: 45 }, { n: 'Tuck jumps', t: 30 }, { n: 'Rest', t: 30, rest: true }] },
    { block: 'Cool-down', rounds: 1, items: [{ n: 'Pigeon stretch', t: 45 }, { n: 'Hamstring stretch', t: 40 }, { n: "Child's pose", t: 60 }] },
  ],
};
const GENDER_HOME: Record<'male' | 'female', Block> = {
  female: { block: 'Glutes & core (for you)', rounds: 3, items: [{ n: 'Hip thrusts', reps: 18 }, { n: 'Fire hydrants', reps: 14 }, { n: 'Side plank', t: 30 }, { n: 'Bicycle crunches', t: 40 }, { n: 'Rest', t: 40, rest: true }] },
  male: { block: 'Upper-body burnout (for you)', rounds: 3, items: [{ n: 'Push-ups', reps: 15 }, { n: 'Pike push-ups', reps: 12 }, { n: 'Chair dips', reps: 14 }, { n: 'Plank shoulder taps', t: 40 }, { n: 'Rest', t: 40, rest: true }] },
};

const FOCUSES = ['Chest & Triceps', 'Back & Biceps', 'Legs', 'Shoulders & Abs', 'Arms', 'Full Body'];
const GYM: Record<string, { n: string; t?: number }[]> = {
  'Chest & Triceps': [{ n: 'Barbell bench press' }, { n: 'Incline dumbbell press' }, { n: 'Cable chest fly' }, { n: 'Dips' }, { n: 'Triceps rope pushdown' }, { n: 'Overhead triceps extension' }],
  'Back & Biceps': [{ n: 'Deadlift' }, { n: 'Lat pulldown' }, { n: 'Seated cable row' }, { n: 'Barbell biceps curl' }, { n: 'Hammer curl' }, { n: 'Face pull' }],
  Legs: [{ n: 'Barbell back squat' }, { n: 'Leg press' }, { n: 'Romanian deadlift' }, { n: 'Leg extension' }, { n: 'Lying leg curl' }, { n: 'Standing calf raise' }],
  'Shoulders & Abs': [{ n: 'Overhead barbell press' }, { n: 'Dumbbell lateral raise' }, { n: 'Rear-delt fly' }, { n: 'Barbell shrugs' }, { n: 'Hanging leg raise' }, { n: 'Cable crunch' }],
  Arms: [{ n: 'Barbell curl' }, { n: 'Incline dumbbell curl' }, { n: 'Preacher curl' }, { n: 'Close-grip bench press' }, { n: 'Triceps pushdown' }, { n: 'Overhead extension' }],
  'Full Body': [{ n: 'Barbell back squat' }, { n: 'Barbell bench press' }, { n: 'Bent-over row' }, { n: 'Overhead press' }, { n: 'Romanian deadlift' }, { n: 'Plank', t: 60 }],
};
const GENDER_GYM: Record<'male' | 'female', Record<string, string[]>> = {
  female: { Legs: ['Barbell hip thrust', 'Glute kickback'], 'Full Body': ['Barbell hip thrust'], 'Shoulders & Abs': ['Cable glute kickback'], 'Back & Biceps': ['Hip thrust'] },
  male: { 'Chest & Triceps': ['Weighted dips'], Arms: ['Cable curl 21s'], 'Full Body': ['Weighted push-up'], 'Shoulders & Abs': ['Barbell push press'] },
};

const LEVELS: [Level, string][] = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];
const DURS = [45, 60, 90];
const levelCfg = (level: Level) => ({
  beginner: { restAdd: 15, setsAdj: -1, tag: 'Beginner' },
  intermediate: { restAdd: 0, setsAdj: 0, tag: 'Intermediate' },
  advanced: { restAdd: -15, setsAdj: 1, tag: 'Advanced' },
}[level]);
const durFactor = (dur: number) => ({ 45: 0.82, 60: 1.18, 90: 1.85 } as Record<number, number>)[dur] ?? 1.18;

function repScheme(level: Level, goalKey: Goal) {
  const base = goalKey === 'gain' ? { sets: 4, reps: '8–10', restSec: 75, repN: 9 }
    : goalKey === 'lose' ? { sets: 3, reps: '12–15', restSec: 45, repN: 13 }
    : { sets: 3, reps: '10–12', restSec: 60, repN: 11 };
  const lc = levelCfg(level);
  return { ...base, sets: Math.max(2, Math.min(6, base.sets + lc.setsAdj)), restSec: Math.max(30, base.restSec + lc.restAdd) };
}
const defaultFocus = () => FOCUSES[[5, 0, 1, 2, 3, 4, 5][new Date().getDay()]];

interface Step { name: string; block: string; round?: string; dur: number; reps: number | null; rest: boolean; walk?: boolean; note?: string }
const walkStep = (): Step => ({ name: 'Brisk walk', block: 'Walk', dur: WALK_MIN * 60, reps: null, rest: false, walk: true, note: `~${WALK_STEPS.toLocaleString('en-IN')} steps` });

function currentHomePlan(level: Level, gender: Gender): Block[] {
  const plan = HOME_PLANS[level].slice();
  const gb = GENDER_HOME[gender];
  let ci = plan.findIndex((b) => /Cool-down/.test(b.block));
  if (ci < 0) ci = plan.length - 1;
  plan.splice(ci, 0, gb);
  return plan;
}
const homeRounds = (dur: number, baseRounds: number) => baseRounds <= 1 ? 1 : Math.max(2, Math.min(8, Math.round(baseRounds * durFactor(dur))));

function focusBase(focus: string, gender: Gender): { n: string; t?: number; gender?: boolean }[] {
  const base: { n: string; t?: number; gender?: boolean }[] = (GYM[focus] || GYM['Full Body']).map((e) => ({ ...e }));
  const extra = (GENDER_GYM[gender] || {})[focus] || [];
  extra.forEach((nm) => base.splice(Math.min(3, base.length), 0, { n: nm, gender: true }));
  return base;
}
const gymExCount = (dur: number) => dur === 45 ? 5 : dur === 90 ? 7 : 6;
function gymExercises(focus: string, dur: number, gender: Gender) {
  const base = focusBase(focus, gender);
  const num = Math.min(base.length, gymExCount(dur));
  return base.slice(0, num);
}

function buildHomeSeq(level: Level, dur: number, gender: Gender): Step[] {
  const seq: Step[] = []; const lc = levelCfg(level);
  currentHomePlan(level, gender).forEach((b) => {
    const rounds = homeRounds(dur, b.rounds);
    for (let r = 1; r <= rounds; r++) b.items.forEach((it) => {
      const d = it.rest ? Math.max(20, (it.t ?? 40) + lc.restAdd) : (it.t ?? Math.max(20, Math.round((it.reps ?? 10) * 3)));
      seq.push({ name: it.n, block: b.block, round: rounds > 1 ? `${r}/${rounds}` : '', dur: d, reps: it.reps ?? null, rest: !!it.rest });
    });
  });
  return seq;
}
function buildGymSeq(focus: string, level: Level, dur: number, gender: Gender, goalKey: Goal): Step[] {
  const sc = repScheme(level, goalKey); const seq: Step[] = [];
  gymExercises(focus, dur, gender).forEach((e) => {
    const sets = e.t ? 3 : sc.sets;
    for (let i = 1; i <= sets; i++) {
      if (e.t) seq.push({ name: e.n, block: focus, round: `${i}/${sets}`, dur: e.t, reps: null, rest: false });
      else seq.push({ name: e.n, block: focus, round: `${i}/${sets}`, dur: Math.max(25, Math.round(sc.repN * 3)), reps: null, rest: false, note: sc.reps });
      if (i < sets) seq.push({ name: 'Rest', block: focus, dur: sc.restSec, reps: null, rest: true });
    }
    seq.push({ name: 'Rest', block: focus, dur: sc.restSec + 20, reps: null, rest: true });
  });
  return seq;
}
const buildSeq = (loc: Loc, focus: string, level: Level, dur: number, includeWalk: boolean, gender: Gender, goalKey: Goal): Step[] => {
  const seq = loc === 'gym' ? buildGymSeq(focus, level, dur, gender, goalKey) : buildHomeSeq(level, dur, gender);
  return includeWalk ? [...seq, walkStep()] : seq;
};

/** Map the Nutrition food-preference profile onto the fitness body profile. */
function healthFromPref(
  p: { age: number | null; sex: 'male' | 'female' | null; heightCm: number | null; weightKg: number | null; activity: number; goal: Goal } | undefined,
): Health & { assumed: string[]; sexKnown: boolean } {
  if (!p) return { ...DEFAULT_HEALTH, assumed: ['weight', 'height', 'age', 'sex at birth'], sexKnown: false };
  const assumed: string[] = [];
  if (p.weightKg == null) assumed.push('weight');
  if (p.heightCm == null) assumed.push('height');
  if (p.age == null) assumed.push('age');
  // Sex was NOT in the old check for whether this profile counted as filled in,
  // so somebody who had given their weight, height and age but never answered
  // this was told the page was "personalised from your Nutrition profile",
  // labelled Women, and handed a calorie target built on the female term.
  //
  // It is also the field a non-binary citizen legitimately has empty:
  // clinicalSex() refuses to invent a coefficient, so FoodPref.sex stays null,
  // and the old code read that silence as "female".
  if (p.sex == null) assumed.push('sex at birth');
  return {
    age: p.age ?? DEFAULT_HEALTH.age,
    gender: p.sex ?? DEFAULT_HEALTH.gender,
    heightCm: p.heightCm ?? DEFAULT_HEALTH.heightCm,
    weightKg: p.weightKg ?? DEFAULT_HEALTH.weightKg,
    goal: p.goal ?? DEFAULT_HEALTH.goal,
    assumed,
    sexKnown: p.sex != null,
  };
}

/* ---------- component ---------- */
type Status = 'complete' | 'workout' | 'walk' | 'light' | 'none' | 'rest';
const STATUS_LABEL: Record<Status, string> = { complete: 'Completed · workout + walk', workout: 'Workout done', walk: 'Walk done', light: 'Light activity', none: 'No physical activity today', rest: 'No activity logged yet' };
const STATUS_STYLE: Record<Status, { bg: string; c: string }> = {
  complete: { bg: 'var(--ok-soft)', c: 'var(--ok-ink)' }, workout: { bg: 'var(--accent-soft)', c: 'var(--accent)' }, walk: { bg: 'var(--warn-soft)', c: 'var(--warn-ink)' },
  light: { bg: 'var(--accent-soft)', c: 'var(--accent)' }, none: { bg: 'var(--danger-soft)', c: 'var(--danger-ink)' }, rest: { bg: 'var(--line)', c: 'var(--ink-soft)' },
};
const DAYNAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT_COLOR: Record<string, string> = { complete: 'var(--ok-ink)', workout: 'var(--accent)', walk: 'var(--accent-ink)', light: 'var(--info-line)', none: 'var(--danger-ink)', '': 'var(--line)' };
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
interface DayLog { status: Status; kcal: number }

function speak(txt: string) { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(txt); speechSynthesis.cancel(); speechSynthesis.speak(u); } } catch { /* ignore */ } }

export function Workout() {
  const addWorkout = useAddWorkout();
  const foodPref = useFoodPref();
  const nutritionTargets = useNutritionTargets();
  const [level, setLevel] = useState<Level>('intermediate');
  const [dur, setDur] = useState(60);
  const [loc, setLoc] = useState<Loc>('home');
  const [focus, setFocus] = useState(defaultFocus());
  const [log, setLog] = useState<Record<string, DayLog>>({});

  // Body profile is shared with the Nutrition food-preference profile — no re-typing.
  const health = useMemo(() => healthFromPref(foodPref.data), [foodPref.data]);
  const hasProfile = health.assumed.length < 4;
  const gender = health.gender, goalKey = health.goal, WEIGHT = health.weightKg;
  // The server's one daily target. Null while it loads, when the request
  // fails, or when readiness carries a refusal — three states this page keeps
  // apart below, because they license different sentences.
  const KCAL = nutritionTargets.data && !(nutritionTargets.data.readiness && !nutritionTargets.data.readiness.ok)
    ? nutritionTargets.data.kcal
    : null;
  const goalTag = goalTagOf(goalKey);
  // Null when we have not been told. `gender` still carries a value so the
  // routine builder has something to pick exercises with — that is a product
  // choice about which session to show. Printing "Women" on somebody's page is
  // a claim about them, and we only make it when they have said so.
  const genderTag = health.sexKnown ? (gender === 'male' ? 'Men' : 'Women') : null;
  /** Header segments, with anything we do not know left out rather than shown
   *  as a gap or, worse, as the word "null". */
  const seg = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
  const genderEmph = health.sexKnown
    ? (gender === 'male' ? 'upper-body strength & push' : 'glutes, lower-body & core')
    : 'full-body strength & conditioning';
  const burnWorkout = kcalWorkout(WORKOUT_MIN, WEIGHT), burnWalk = kcalWalk(WALK_MIN, WEIGHT), burnTotal = burnWorkout + burnWalk;

  const workoutSeconds = useMemo(() => buildSeq(loc, focus, level, dur, false, gender, goalKey).reduce((a, s) => a + s.dur, 0), [loc, focus, level, dur, gender, goalKey]);

  /* live timer runtime kept in a ref to avoid stale closures */
  const rt = useRef({ seq: [] as Step[], idx: 0, remain: 0, paused: false, running: false, workoutSec: 0, walkSec: 0, mode: 'full' as 'full' | 'walk' });
  const [, force] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    if (!rt.current.running) return;
    const iv = window.setInterval(() => {
      const t = rt.current;
      if (!t.running || t.paused) return;
      t.remain -= 1;
      if (t.remain <= 0) { creditCurrent(); advance(); } else force();
    }, 1000);
    return () => window.clearInterval(iv);
    // interval body is ref-driven on purpose; only (re)bind when the session starts/stops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rt.current.running]);

  const creditCurrent = () => {
    const t = rt.current; const s = t.seq[t.idx];
    if (!s || s.rest) return;
    if (s.walk) t.walkSec += s.dur; else t.workoutSec += s.dur;
  };
  const goStep = (i: number) => {
    const t = rt.current;
    if (i >= t.seq.length) { finish(false); return; }
    t.idx = i; t.remain = t.seq[i].dur;
    const s = t.seq[i];
    speak(s.rest ? 'Rest' : s.walk ? 'Twenty minute walk' : s.name);
    force();
  };
  const advance = () => goStep(rt.current.idx + 1);

  const start = (mode: 'full' | 'walk') => {
    const seq = mode === 'walk' ? [walkStep()] : buildSeq(loc, focus, level, dur, true, gender, goalKey);
    rt.current = { seq, idx: 0, remain: seq[0]?.dur ?? 0, paused: false, running: true, workoutSec: 0, walkSec: 0, mode };
    force();
    speak(seq[0] ? seq[0].name : 'Start');
  };
  const finish = (early: boolean) => {
    const t = rt.current; t.running = false;
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    const wMin = t.workoutSec / 60, kMin = t.walkSec / 60;
    const status: Status = (wMin >= 30 && kMin >= 15) ? 'complete' : wMin >= 15 ? 'workout' : kMin >= 10 ? 'walk' : (wMin > 0 || kMin > 0) ? 'light' : 'none';
    const kcal = kcalWorkout(wMin, WEIGHT) + kcalWalk(kMin, WEIGHT);
    setLog((l) => ({ ...l, [dayKey()]: { status, kcal } }));
    if (status !== 'none') {
      addWorkout.mutate({ focus: loc === 'gym' ? `${focus} (${goalTag})` : 'Home workout + walk', minutes: Math.round(wMin + kMin), intensity: 'moderate' });
    }
    void early;
    force();
  };
  const skipToWalk = () => { const wi = rt.current.seq.findIndex((s) => s.walk); if (wi >= 0) goStep(wi); else finish(true); };
  const markSkipAll = () => { if (window.confirm('Skip all activity today? You will be marked as no physical activity.')) setLog((l) => ({ ...l, [dayKey()]: { status: 'none', kcal: 0 } })); };

  const today = log[dayKey()]; const tStatus: Status = today ? today.status : 'rest';
  const running = rt.current.running; const s = rt.current.seq[rt.current.idx];
  const next = rt.current.seq[rt.current.idx + 1];

  const sc = repScheme(level, goalKey);
  const weekCells = useMemo(() => {
    const out: { day: string; status: string; kcal: string }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const e = log[dayKey(d)]; out.push({ day: DAYNAMES[d.getDay()], status: e ? e.status : '', kcal: e ? inr(e.kcal) : '—' }); }
    return out;
  }, [log]);

  const Seg = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--on-accent)' : 'var(--ink)', borderRadius: 999, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
  );
  const exRow = (i: number, name: string, meta: string, tgt: string) => (
    <div key={`${name}-${i}`} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--line)' }}>
      <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent-soft)', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flex: '0 0 auto' }}>{i}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{name}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{meta}</div></div>
      <span style={{ fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--accent-ink)' }}>{tgt}</span>
    </div>
  );
  const blkHead = (txt: string) => <div style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 700, margin: '14px 0 2px' }}>{txt}</div>;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow">Together City · Hub 012</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Your Workout</h1>
        <p className="lede" style={{ marginTop: 6 }}>Your personalised home &amp; gym plan for today — level &amp; goal matched, with a live guided timer.</p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, padding: '6px 14px', borderRadius: 999, background: STATUS_STYLE[tStatus].bg, color: STATUS_STYLE[tStatus].c }}>
          {tStatus === 'rest' ? '○' : tStatus === 'none' ? '✕' : '✓'} {STATUS_LABEL[tStatus]}{today && today.kcal ? ` · ${inr(today.kcal)} kcal` : ''}
        </span>
      </div>

      {/* shared body profile from Nutrition */}
      <div className="card" style={{ marginBottom: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', background: 'var(--accent-soft)', border: 'none' }}>
        <div style={{ fontSize: 12.5 }}>
          {hasProfile ? (
            <>
              🔗 From your Nutrition profile — <b>{[
                health.assumed.includes('weight') ? null : `${health.weightKg}kg`,
                health.assumed.includes('height') ? null : `${health.heightCm}cm`,
                genderTag, goalTag,
              ].filter(Boolean).join(' · ')}</b>
              {health.assumed.length > 0 && (
                <span className="muted" style={{ display: 'block', marginTop: 4 }}>
                  {health.assumed.join(', ')} {health.assumed.length === 1 ? 'is a stand-in' : 'are stand-ins'} —
                  used only to pick today’s routine, never to compute your calories.
                </span>
              )}
            </>
          ) : (
            <>🔗 Using default body stats — nothing here is yours yet. Set them once to personalise every workout.</>
          )}
        </div>
        <Link to="/nutrition/preferences" style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)', whiteSpace: 'nowrap' }}>
          {hasProfile ? 'Edit profile →' : 'Set up profile →'}
        </Link>
      </div>

      {/* activity goal */}
      <section className="blk">
        <div className="blk-head"><h2>Today's activity goal</h2><span className="muted" style={{ fontSize: 12 }}>From your Nutrition plan</span></div>
        <div className="card">
          {KCAL != null ? (
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 2 }}>To maintain your <b style={{ color: 'var(--ink)' }}>{inr(KCAL)} kcal</b> Nutrition plan, aim to burn about <b style={{ color: 'var(--ink)' }}>{inr(burnTotal)} kcal</b> today through activity:</p>
          ) : (
            <>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 2 }}>Aim to burn about <b style={{ color: 'var(--ink)' }}>{inr(burnTotal)} kcal</b> today through activity:</p>
              {nutritionTargets.isError ? (
                <p className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Your Nutrition plan couldn't be loaded just now — the burn goal above still stands.</p>
              ) : nutritionTargets.data ? (
                <p className="muted" style={{ fontSize: 11.5, marginBottom: 2 }}>Your daily calorie plan will appear here once your <Link to="/nutrition/preferences" style={{ color: 'var(--accent-ink)' }}>Nutrition profile</Link> is complete.</p>
              ) : null}
            </>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 14, marginTop: 6 }}>
            {[
              { l: 'Work out', v: `${WORKOUT_MIN} min`, s: `circuit & strength · ≈ ${inr(burnWorkout)} kcal` },
              { l: 'Walk', v: `${WALK_MIN} min`, s: `brisk · ≈ ${WALK_STEPS.toLocaleString('en-IN')} steps · ≈ ${inr(burnWalk)} kcal` },
              { l: 'Total burn', v: inr(burnTotal), s: 'kcal today' },
            ].map((g) => (
              <div key={g.l} style={{ background: 'var(--accent-soft)', borderRadius: 12, padding: '14px 16px' }}>
                <div style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--accent-ink)', fontWeight: 700 }}>{g.l}</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 22, marginTop: 3 }}>{g.v}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 2 }}>{g.s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* plan + controls */}
      <section className="blk">
        <div className="blk-head"><h2>Today's plan · 60-min workout + 20-min walk</h2><span className="muted" style={{ fontSize: 12 }}>≈ {Math.round(workoutSeconds / 60)} min {levelCfg(level).tag} {loc === 'gym' ? `${focus} (${goalTag})` : 'home'} workout + {WALK_MIN} min walk</span></div>
        <div className="card">
          <p className="muted" style={{ fontSize: 11.5, margin: '0 0 10px' }}>
            {genderTag
              ? <>Tailored for <b style={{ color: 'var(--ink)' }}>{genderTag}</b> · emphasis on {genderEmph}.</>
              : <>Emphasis on {genderEmph}. Set your sex at birth in Nutrition and this session adapts to it.</>}
          </p>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '0 0 6px' }}>Your experience level</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{LEVELS.map(([k, l]) => <Seg key={k} on={level === k} onClick={() => setLevel(k)}>{l}</Seg>)}</div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '12px 0 6px' }}>Session length</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DURS.map((m) => <Seg key={m} on={dur === m} onClick={() => setDur(m)}>{m} min</Seg>)}</div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '12px 0 6px' }}>Where are you training?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Seg on={loc === 'home'} onClick={() => setLoc('home')}>🏠 At home</Seg>
            <Seg on={loc === 'gym'} onClick={() => setLoc('gym')}>🏋 At the gym</Seg>
          </div>
          {loc === 'gym' && (
            <>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '12px 0 6px' }}>Today's focus · {goalTag} split</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{FOCUSES.map((fc) => <Seg key={fc} on={focus === fc} onClick={() => setFocus(fc)}>{fc}</Seg>)}</div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0 14px' }}>
            <Button variant="accent" onClick={() => start('full')}>▶ Start workout + walk</Button>
            <Button variant="line" onClick={() => start('walk')}>🚶 Skip workout — just walk (20 min)</Button>
            <Button variant="ghost" onClick={markSkipAll}>Skip today</Button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>Start the timer and Together City guides you exercise-by-exercise. You can pause, skip an exercise, jump to the walk, or end anytime.</p>

          {/* routine preview */}
          {loc === 'home' ? (
            <div>
              {blkHead(seg(levelCfg(level).tag, genderTag, `emphasis on ${genderEmph}`))}
              {currentHomePlan(level, gender).map((b) => {
                const rounds = homeRounds(dur, b.rounds);
                return (
                  <div key={b.block}>
                    {blkHead(`${b.block}${rounds > 1 ? ` · ${rounds} rounds` : ''}`)}
                    {b.items.filter((it) => !it.rest).map((it, i) => exRow(i + 1, it.n, it.reps ? `target ${it.reps} reps` : `hold / go for ${mmss(it.t ?? 0)}`, it.reps ? `${it.reps} reps` : mmss(it.t ?? 0)))}
                  </div>
                );
              })}
              {blkHead('Finish · Walk')}
              {exRow(1, 'Brisk walk', `outdoors or treadmill · ~${WALK_STEPS.toLocaleString('en-IN')} steps`, `${WALK_MIN}:00`)}
            </div>
          ) : (
            <div>
              {blkHead(seg(focus, levelCfg(level).tag, genderTag, goalTag, `${sc.sets} sets`, `${sc.restSec}s rest`))}
              {gymExercises(focus, dur, gender).map((e, i) => exRow(i + 1, e.n, e.t ? 'hold each set' : `rest ${sc.restSec}s between sets`, e.t ? `3 × ${mmss(e.t)}` : `${sc.sets} × ${sc.reps}`))}
              {blkHead('Finish · Walk')}
              {exRow(1, 'Brisk walk', `outdoors or treadmill · ~${WALK_STEPS.toLocaleString('en-IN')} steps`, `${WALK_MIN}:00`)}
            </div>
          )}
        </div>
      </section>

      {/* week */}
      <section className="blk">
        <div className="blk-head"><h2>This week</h2><span className="muted" style={{ fontSize: 12 }}>Physical activity log</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {weekCells.map((c, i) => (
              <div key={i} style={{ flex: 1, minWidth: 52, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 4px' }}>
                <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.day}</div>
                <div style={{ width: 14, height: 14, borderRadius: '50%', margin: '6px auto 3px', background: DOT_COLOR[c.status] ?? 'var(--line)' }} />
                <div style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{c.kcal}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="trust">
        {/* "Smartwatch Synced" was here too. There is no wearable integration
            anywhere in this codebase — FE-18.6 said so on the Sleep page and
            missed this one. */}
        <span>◈ Nutrition-linked Goals</span><span>◈ Guided Live Timer</span><span>◈ Private by Default</span>
      </div>

      {/* live timer overlay */}
      {running && s && (
        <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(160deg,var(--ink),var(--ink))', color: 'var(--on-accent)', display: 'flex', flexDirection: 'column', zIndex: 9999, padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: 'rgba(255,255,255,.7)' }}>
            <span>Step {rt.current.idx + 1} of {rt.current.seq.length}</span>
            <button type="button" onClick={() => finish(true)} className="btn btn-sm" style={{ background: 'rgba(255,255,255,.14)', color: 'var(--on-accent)', border: '1px solid rgba(255,255,255,.3)' }}>✕ End</button>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6 }}>
            <div style={{ fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--accent-ink)', fontWeight: 700 }}>{s.block}{s.round ? ` · round ${s.round}` : ''}</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(30px,7vw,54px)', lineHeight: 1.1 }}>{s.rest ? 'Rest' : s.name}</div>
            <div style={{ fontSize: 20, color: 'var(--ok-line)', fontWeight: 700 }}>{s.walk ? s.note : s.note ? `Target ${s.note}` : s.reps ? `Target ${s.reps} reps` : s.rest ? 'Recover' : `Hold / go for ${mmss(s.dur)}`}</div>
            <div style={{ fontSize: 'clamp(52px,16vw,120px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.02em' }}>{mmss(rt.current.remain)}</div>
            <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,.15)', overflow: 'hidden', marginTop: 8, width: 240 }}>
              <div style={{ height: '100%', background: 'var(--ok-line)', width: `${s.dur ? Math.round((1 - rt.current.remain / s.dur) * 100) : 0}%` }} />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{next ? `Up next: ${next.rest ? 'Rest' : next.name}` : 'Last one!'}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 16 }}>
            <button type="button" style={ctrl} onClick={() => { rt.current.paused = !rt.current.paused; force(); }}>{rt.current.paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button type="button" style={ctrl} onClick={advance}>⏭ Skip exercise</button>
            <button type="button" style={ctrl} onClick={skipToWalk}>🚶 Skip to walk</button>
            <button type="button" style={{ ...ctrl, background: 'var(--ok-line)', color: 'var(--ok-ink)', borderColor: 'var(--ok-line)' }} onClick={() => { creditCurrent(); advance(); }}>Done ▸</button>
          </div>
        </div>
      )}
    </div>
  );
}

const ctrl: React.CSSProperties = { borderRadius: 999, padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: 'var(--on-accent)' };
