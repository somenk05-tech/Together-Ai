import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import {
  EXERCISE_MEDIA_ATTRIBUTION, OFF_DAY_ACTIVITIES, WEEKDAY_NAMES, WEEKDAY_SHORT,
  useAddWorkout, useMoveWorkoutDay, useProgramme, useSaveTrainingWeek, useTodaySession,
  type ProgrammeDay,
} from '../api';
import { BodyGoalPanel } from '../components/BodyGoalPanel';
import { dateSpan, monthOf, useChoosePlace } from '../division.api';
import type { MobilityStep } from '../day.api';
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

/* ---------- the session comes from the server ---------- */
/**
 * WHAT WAS HERE, AND WHY IT IS NOT ANY MORE.
 *
 * Three hardcoded tables — HOME_PLANS (three levels × six fixed blocks), GYM
 * (six splits × six names) and two gender splices — plus buildHomeSeq,
 * buildGymSeq, repScheme and buildSeq. Roughly a hundred and twenty lines that
 * chose a workout from SEVEN inputs, five of them `useState` that reset on
 * reload: a location, a gym split picked by day-of-week, a three-value level
 * that was not the saved five-value one, a duration, a walk flag, a gender and
 * the NUTRITION goal.
 *
 * It never read the saved training profile, the body goal, a lab, a declared
 * condition, the calorie or protein target, or one minute of the citizen's own
 * history — every one of which the server already held. So a citizen who had
 * declared joint pain was handed Jump squats and Burpees, while the weekly-plan
 * engine three screens away was correctly swapping their cardio for something
 * low-impact.
 *
 * The session is built in fitness/session-engine.ts now, where those facts
 * live, and this file's job is to draw it and run the timer over it. The only
 * thing left here is the translation from the server's blocks into the timer's
 * flat step list.
 */
type Loc = 'home' | 'gym';

const mmss = (s: number) => { s = Math.max(0, Math.round(s)); const m = Math.floor(s / 60), ss = s % 60; return `${m}:${ss < 10 ? '0' : ''}${ss}`; };

interface Step {
  name: string; block: string; dur: number; reps: number | null;
  rest?: boolean; walk?: boolean; note?: string; round?: number;
  /**
   * ── WHAT TO ACTUALLY DO, ON THE TIMER ITSELF ────────────────────────────
   *
   * The runner was a name, a clock and four buttons. "Standing hip opener" over
   * a countdown is a stopwatch on a phrase: somebody who has never done one is
   * left guessing at a movement while the clock runs, which is how people hurt
   * themselves, and the honest fix is not a link to a page they would have to
   * leave the timer to read.
   *
   * All three travel with the session — see SessionExercise on the server — so
   * nothing is fetched mid-set.
   */
  steps?: string[];
  muscles?: string[];
  gif?: string;
  /** The city's own film of the movement (owner, 6 Sep) — played full-screen,
   *  on a loop, with its sound, for as long as this step's clock runs. */
  video?: string;
}

/** A reasonable clock for one working set, so the timer has something to count
 *  down on a movement measured in reps. The set itself is the target on the
 *  screen; this is only how long the page waits before saying "rest". */
const REP_SECONDS = 3;

/**
 * ── ANY DAY OF THE MONTH, NOT ONLY TODAY (owner, 9 Sep: "let user see past
 * and future workouts") ─────────────────────────────────────────────────────
 *
 * The runner already walked a session's blocks; a programme day is the same
 * material one level flatter — movements with sets, reps, a rest and their own
 * steps — so it gets its own flattener rather than a fake TodaySession, which
 * would have had to invent a headline, an intensity and a walk it does not
 * have.
 *
 * NO WALK ON THE END. Today's session earns one from the citizen's activity
 * goal; a Thursday opened on a Tuesday has not.
 */
function stepsFromDay(day: ProgrammeDay & { warmup?: MobilityStep[]; cooldown?: MobilityStep[] }): Step[] {
  const out: Step[] = [];
  /* THE WAY IN (18 Sep): the day's warm-up, held for the time, with the
     film where one has been shot. */
  for (const w of day.warmup ?? []) out.push({ name: w.name, block: 'Warm-up', dur: w.seconds, reps: null, steps: w.steps, muscles: [w.works], gif: w.gif, video: w.video || undefined });
  for (const ex of day.exercises) {
    const perSet = Math.round((ex.reps?.[1] ?? 10) * REP_SECONDS);
    for (let i = 1; i <= ex.sets; i++) {
      out.push({
        name: ex.name, block: day.title, dur: perSet, reps: ex.reps ? ex.reps[1] : null,
        note: ex.reps ? `${ex.reps[0]}–${ex.reps[1]} reps` : undefined,
        ...(ex.sets > 1 ? { round: i } : {}),
        steps: ex.steps, muscles: [ex.works], gif: ex.gif,
      });
      if (i < ex.sets && ex.restSec > 0) out.push({ name: 'Rest', block: day.title, dur: ex.restSec, reps: null, rest: true });
    }
  }
  /* AND THE WAY OUT: the stretches for what was just worked. */
  for (const c of day.cooldown ?? []) out.push({ name: c.name, block: 'Cool-down', dur: c.seconds, reps: null, steps: c.steps, muscles: [c.works], gif: c.gif, video: c.video || undefined });
  return out;
}

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
const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
interface DayLog { status: Status; kcal: number }

function speak(txt: string) { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(txt); speechSynthesis.cancel(); speechSynthesis.speak(u); } } catch { /* ignore */ } }

export function Workout() {
  const addWorkout = useAddWorkout();
  const foodPref = useFoodPref();
  const nutritionTargets = useNutritionTargets();
  /**
   * TODAY'S TWO OVERRIDES, and they are the only two left.
   *
   * `undefined` means "whatever my profile says" — the server falls back to the
   * saved place and session length, so an untouched page is the citizen's own
   * usual answer rather than this file's opinion of it. The level, the split,
   * the gender emphasis and the rep scheme are gone from here entirely: they
   * are the server's, from the profile they saved.
   */
  const dur: number | undefined = undefined;
  const loc: Loc | undefined = undefined;
  const [log, setLog] = useState<Record<string, DayLog>>({});
  const todays = useTodaySession(dur, loc);
  const session = todays.data;
  const programme = useProgramme();
  const month = programme.data;
  const monthDay = month && month.todayIndex >= 0 && month.todayIndex < month.days.length ? month.days[month.todayIndex] : null;
  const monthNext = month && monthDay ? month.days.slice(monthDay.index + 1).find((d) => d.kind !== 'rest') : undefined;
  const dayWord = (d: { kind: string; title: string; parts: string; cardioMinutes: number }) =>
    d.kind === 'strength' ? `${d.title} — ${d.parts}` : d.kind === 'rest' ? d.title : `${d.title} · ${d.cardioMinutes} min`;

  /* ── THE DAY THE CITIZEN OPENED (owner, 9 Sep) ──────────────────────────
     Null is today, not "nothing": the card has always opened on today and
     should keep doing so, and a citizen who reads Thursday and comes back
     tomorrow should find their own day again rather than Thursday. */
  const [openDay, setOpenDay] = useState<number | null>(null);
  /* SENT BACK FROM A DAY'S PAGE (18 Sep): /fitness/workout?day=11 opens that
     day's panel under the month, and ?start=11 runs it. Either is read
     once and taken off the address, so a refresh is today again. */
  const [params, setParams] = useSearchParams();
  const startAsked = params.has('start') ? Number(params.get('start')) : null;
  useEffect(() => {
    const d = Number(params.get('day'));
    if (params.has('day') && Number.isInteger(d) && d >= 0 && d < 28) {
      setOpenDay(d);
      setParams((p) => { p.delete('day'); return p; }, { replace: true });
    }
  }, [params, setParams]);
  const shown = month && openDay != null ? month.days[openDay] ?? null : null;
  const saveWeek = useSaveTrainingWeek();
  /**
   * ── THE DAY YOU MOVE TO TODAY (owner, 9 Sep) ──────────────────────────────
   *
   * The anchor is today when today is a training day and the next training day
   * when it is not: a rest day is the citizen's, and pressing a workout button
   * is not a reason to take it away from them. Everything the button offers is
   * read off it — whether there is anything to move, and what to call it.
   */
  const moveDay = useMoveWorkoutDay();
  /* GYM OR HOME (owner, 18 Sep) — the tab that picks the division. */
  const choosePlace = useChoosePlace();
  const anchor = month ? month.days.find((d) => d.index >= month.todayIndex && d.kind === 'strength') : undefined;
  const canMove = !!(shown && anchor && shown.kind === 'strength' && shown.index !== anchor.index && shown.slot !== anchor.slot);
  /* THE KEYS ARE PRESSED LOCALLY AND SAVED ON RELEASE. A save per tap would
     rebuild the month three times while somebody chose two days, and the grid
     would jump under their finger between the taps. */
  const chosenRest = month ? (saveWeek.variables?.restDays ?? month.rest.days) : [];
  const chosenActivity = month ? (saveWeek.variables?.restActivity ?? month.rest.activity) : 'rest';
  const toggleRest = (d: number) => {
    const next = chosenRest.includes(d) ? chosenRest.filter((x) => x !== d) : [...chosenRest, d].sort((a, b) => a - b);
    /* SEVEN OFF IS NOT A WEEK — it is having left, and the schema will not
       hold it either. The key simply does not turn. */
    if (next.length >= 7) return;
    saveWeek.mutate({ restDays: next, restActivity: chosenActivity });
  };

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
  /**
   * THE BURN FOLLOWS THE SESSION THAT WAS ACTUALLY BUILT.
   *
   * It used to be kcalWorkout(WORKOUT_MIN) — the constant 60 — so choosing 45
   * or 90 minutes changed the routine and left the goal, the three tiles and
   * the heading all saying sixty. The 743 never moved. It moves now, because
   * both figures are the session's own minutes.
   */
  const sessionMin = session?.minutes ?? 0, walkMin = session?.walkMinutes ?? 0;
  const burnWorkout = kcalWorkout(sessionMin, WEIGHT), burnWalk = kcalWalk(walkMin, WEIGHT), burnTotal = burnWorkout + burnWalk;


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

  /**
   * ── ANY DAY OF THE MONTH, RUN (owner, 9 Sep) ─────────────────────────────
   *
   * The same runner, from the programme day rather than from today's session.
   * What it does NOT do is pretend about the calendar: `finish` logs against
   * `dayKey()`, which is the real date, so doing Saturday's legs on Thursday
   * is recorded as a workout on Thursday. Backdating a log to make a grid look
   * tidier would be the history lying to the engine that reads it back.
   */
  const startDay = (day: ProgrammeDay) => {
    const seq = stepsFromDay(day);
    if (!seq.length) return;
    setOpenDay(null);
    rt.current = { seq, idx: 0, remain: seq[0].dur, paused: false, running: true, workoutSec: 0, walkSec: 0, mode: 'full' };
    force();
    speak(seq[0].name);
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    if (startAsked == null || !month) return;
    const day = Number.isInteger(startAsked) ? month.days[startAsked] : undefined;
    setParams((p) => { p.delete('start'); return p; }, { replace: true });
    if (day) startDay(day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAsked, month]);

  const finish = (early: boolean) => {
    const t = rt.current; t.running = false;
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    const wMin = t.workoutSec / 60, kMin = t.walkSec / 60;
    const status: Status = (wMin >= 30 && kMin >= 15) ? 'complete' : wMin >= 15 ? 'workout' : kMin >= 10 ? 'walk' : (wMin > 0 || kMin > 0) ? 'light' : 'none';
    const kcal = kcalWorkout(wMin, WEIGHT) + kcalWalk(kMin, WEIGHT);
    setLog((l) => ({ ...l, [dayKey()]: { status, kcal } }));
    if (status !== 'none') {
      // The intensity is the session's own, not the literal 'moderate' this
      // always sent — a light day logged as moderate is the history lying to
      // the engine that will read it back.
      addWorkout.mutate({
        focus: session ? session.headline : 'Workout + walk',
        minutes: Math.round(wMin + kMin),
        intensity: session?.intensity ?? 'moderate',
      });
    }
    void early;
    force();
  };
  const skipToWalk = () => { const wi = rt.current.seq.findIndex((s) => s.walk); if (wi >= 0) goStep(wi); else finish(true); };

  const today = log[dayKey()]; const tStatus: Status = today ? today.status : 'rest';
  const running = rt.current.running; const s = rt.current.seq[rt.current.idx];
  const next = rt.current.seq[rt.current.idx + 1];

  /* ── THE FILM RUNS WITH THE CLOCK (owner, 6 Sep) ──────────────────────────
     Where a movement has been filmed, the runner plays the city's own clip
     behind the countdown: full-screen, looping, with its sound, for as long as
     the step runs — paused when the clock is paused, from the top on the next
     step that has one. Browsers let sound play because the session began
     with a tap on Start; where one still refuses (an older Safari), the chip
     under the clock asks for the tap and plays from it. */
  const film = useRef<HTMLVideoElement>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const paused = rt.current.paused;
  const filmSrc = running && s && !s.rest ? s.video : undefined;
  /* ONE ELEMENT FOR THE WHOLE SESSION (owner, 6 Sep: "if a workout is shown
     in 3 sets, play the video for all the sets"). The element used to be
     mounted per filmed step and unmounted on the rest between sets — so set
     two and set three each arrived with a NEW element that had never been
     played from the citizen's tap, and Safari will not start sound on one
     of those by itself. The element lives for the whole session now: the
     tap on Start played it once, the same element carries every film after,
     its source swapped when the film changes and left alone when the next
     set is the same clip, and it is hidden and paused on a step with none. */
  useEffect(() => {
    const el = film.current;
    if (!el) return;
    if (!filmSrc) { el.pause(); return; }
    if (paused) { el.pause(); return; }
    const want = new URL(filmSrc, window.location.origin).href;
    if (el.src !== want) { el.src = filmSrc; el.load(); }
    setNeedsTap(false);
    el.play().catch(() => setNeedsTap(true));
  }, [filmSrc, paused, rt.current.idx]);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow">Together City · Hub 012</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Your Workout</h1>
        <p className="lede" style={{ marginTop: 6 }}>Your body goal, the targets behind it, and today's session — with a live timer.</p>
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 13, padding: '6px 14px', borderRadius: 'var(--r-full)', background: STATUS_STYLE[tStatus].bg, color: STATUS_STYLE[tStatus].c }}>
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

      {/* The body goal — room 02 until 8 Sep, now the first section here. */}
      <BodyGoalPanel />

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

      {/* ── A MONTH WITH A TRAINER (owner, 6 Sep) ──────────────────────────
          "Imagine a personal trainer telling you which body part you are
          working on that day, showing you the workout, and moving you to the
          next body part the next day." The month is built on the server from
          the profile, the kit, the conditions and the whole catalogue; this
          is the whiteboard: today's day and body part, the note for the
          phase, what comes next, and the 28 days with the ones done ticked. */}
      {month && monthDay && (
        <section className="blk wk-month">
          {/* ── TWO DIVISIONS, ONE MONTH (owner, 18 Sep) ─────────────────────
              "Create two sets of workout divisions … and rechange the layout
              accordingly." The month is drawn as four rows — the week's name
              and line on the left, seven day cards across — and the citizen
              chooses which division to follow: gym or home, both built every
              day. The choice is the profile's place, so today's session
              follows it too. */}
          <div className="wm-head">
            <div>
              <div className="eyebrow">Personal trainer</div>
              <h2 className="wm-h2">{monthOf(month).division?.name ?? 'Your month'}</h2>
              <p className="wm-tag muted">{monthOf(month).division?.tag ?? `${month.splitName} · ${month.daysPerWeek} days a week`}</p>
            </div>
            <div className="wm-tools">
              <div className="wm-kinds" role="group" aria-label="Which plan to follow">
                {(['gym', 'home'] as const).map((k) => (
                  <button key={k} type="button" className="wm-kind" aria-pressed={(choosePlace.variables?.place ?? monthOf(month).division?.key ?? 'home') === k}
                    disabled={choosePlace.isPending} onClick={() => choosePlace.mutate({ place: k })}>
                    {k === 'gym' ? 'Gym plan' : 'Home plan'}
                  </button>
                ))}
              </div>
              <Link to="/fitness/profile" className="btn btn-line btn-sm wm-adjust">Adjust plan</Link>
            </div>
          </div>
          {choosePlace.isError && (
            <p role="alert" className="wm-alert">That didn&rsquo;t reach us — your plan is unchanged. Try again in a moment.</p>
          )}
          <div className="card wm-card">
            <div className="wm-today">
              <div className="eyebrow">Day {monthDay.index + 1} of {month.days.length} · week {monthDay.week} · {month.phases.find((p) => p.key === monthDay.phase)?.label ?? monthDay.phase}</div>
              <h3 className="wk-month-title">{dayWord(monthDay)}</h3>
              <p className="wk-month-note">{monthDay.note}</p>
              {monthNext && <p className="muted wk-month-next">Next: {dayWord(monthNext)}{monthNext.index === monthDay.index + 1 ? ', tomorrow' : ` on day ${monthNext.index + 1}`}.</p>}
            </div>
            {/* FOUR ROWS, ONE A WEEK (owner, 18 Sep). Every day is still a door
                — the key is the same button it has been since 9 Sep, wearing
                the card's picture: the day's first movement from the catalogue,
                and the walk or stretch mark on a day off. */}
            <ol className="wm-weeks" aria-label="The four weeks">
              {monthOf(month).weeks.map((w) => (
                <li key={w.week} className="wm-week">
                  <div className="wm-week-l">
                    <div className="eyebrow">Week {w.week}</div>
                    <div className="wm-week-name">{w.label}</div>
                    <div className="wm-week-dates muted">{dateSpan(w.from, w.to)}</div>
                    {w.line && <p className="wm-week-line muted">{w.line}</p>}
                  </div>
                  <ol className="wk-month-grid wm-days" aria-label={`Week ${w.week}, the seven days`}>
                    {month.days.filter((d) => d.week === w.week).map((d) => (
                      <li key={d.index}>
                        {/* A DAY IS A PAGE (owner, 18 Sep: "when someone clicks
                            on the day it should open the day on a new page").
                            The key is a link now; the panel below still opens
                            for the day the page was sent back to (?day=). */}
                        <Link to={`/fitness/workout/day/${d.index}`}
                          aria-label={`Day ${d.index + 1}, ${dayWord(d)}${d.done ? ', done' : ''}`}
                          aria-current={d.index === openDay ? 'true' : undefined}
                          className={['wk-month-key', d.index === monthDay.index ? 'is-today' : '', d.done ? 'is-done' : '', d.index < monthDay.index ? 'is-past' : '', `is-${d.kind}`].filter(Boolean).join(' ')}>
                          <span className="n">{WEEKDAY_SHORT[d.index % 7]} {d.index + 1}</span>
                          {d.kind === 'strength' && d.exercises[0]?.thumb
                            ? <img className="wm-pic" src={d.exercises[0].thumb} alt="" loading="lazy" />
                            : <span className={`wm-pic wm-mark is-${d.kind}`} aria-hidden>{d.kind === 'rest' ? '⌂' : '↗'}</span>}
                          <span className="t">{d.title}</span>
                          <span className="wm-s">{d.kind === 'strength' ? `${d.exercises.length} exercises` : d.parts}</span>
                          <span className="wm-m">{monthOf(month).days[d.index]?.minutes ?? d.cardioMinutes} min</span>
                          {d.done && <span className="d" aria-hidden>✓</span>}
                        </Link>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ol>
            <p className="muted wm-credit">{EXERCISE_MEDIA_ATTRIBUTION} · {month.days.filter((d) => d.done).length} of {month.days.filter((d) => d.kind !== 'rest').length} days done</p>
            {shown && (
              <div className="wk-day">
                <div className="wk-day-head">
                  <h4 className="wk-day-t">{dayWord(shown)}</h4>
                  <span className="wk-day-when">
                    Day {shown.index + 1}
                    {shown.index === monthDay.index ? ' · today' : shown.index < monthDay.index ? ` · ${monthDay.index - shown.index} day${monthDay.index - shown.index === 1 ? '' : 's'} ago` : ` · in ${shown.index - monthDay.index} day${shown.index - monthDay.index === 1 ? '' : 's'}`}
                    {shown.done ? ' · done' : ''}
                  </span>
                </div>
                <p className="wk-day-note">{shown.note}</p>
                {shown.exercises.length > 0 && (
                  <ul className="wk-day-list">
                    {shown.exercises.map((ex) => (
                      <li key={ex.id}>
                        <span className="w">
                          <span className="nm">{ex.name}</span>
                          <span className="mu" style={{ display: 'block' }}>{ex.works} · {ex.equipment} · rest {ex.restSec}s</span>
                        </span>
                        <span className="tg">{ex.sets} × {ex.reps[0]}–{ex.reps[1]}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="wk-day-acts">
                  {shown.exercises.length > 0 && (
                    <Button variant="accent" onClick={() => startDay(shown)}>
                      ▶ {shown.index === monthDay.index ? 'Start this day' : shown.index < monthDay.index ? 'Do it again' : 'Do it early'}
                    </Button>
                  )}
                  {/* ── UPDATE TODAY'S WORKOUT PLAN (owner, 9 Sep) ──────────
                      "Have an 'update to today's workout plan' button, and
                      that goes to today's workout plan, and then today's plan
                      shifts to the next day." Beside 'Do it early' and not
                      instead of it, because they are different questions: that
                      one runs a session now and leaves the month alone, this
                      one moves the month. The word is what it does to the
                      PLAN, so a citizen can tell them apart before pressing. */}
                  {canMove && anchor && (
                    <Button variant="ghost" disabled={moveDay.isPending}
                      onClick={() => moveDay.mutate(shown.index, { onSuccess: () => setOpenDay(anchor.index) })}>
                      {moveDay.isPending ? 'Moving…' : anchor.index === monthDay.index ? 'Update today\u2019s workout plan' : 'Make this your next session'}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setOpenDay(null)}>Close</Button>
                </div>
                {canMove && anchor && (
                  /* WHAT THE PRESS WILL DO, before it is pressed. The month
                     redraws underneath the citizen and a grid that changes
                     without warning reads as a bug, so the consequence is
                     written out first — in the trainer's terms, which are body
                     parts and days rather than indices. */
                  <p className="muted wk-day-move">
                    {anchor.index === monthDay.index
                      ? `${shown.title.toLowerCase()} moves to today, ${anchor.title.toLowerCase()} shifts to your next training day, and the rest of the month follows one session behind.`
                      : `${shown.title.toLowerCase()} becomes your next session on day ${anchor.index + 1}; the days you kept for yourself stay yours.`}
                  </p>
                )}
                {moveDay.isError && (
                  <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '8px 0 0' }}>
                    That didn&rsquo;t reach us — your month is unchanged. Try again in a moment.
                  </p>
                )}
              </div>
            )}

            <details className="wk-month-why">
              <summary>Why this month<span className="fold-state" aria-hidden /></summary>
              <ul>{month.why.map((w) => <li key={w}>{w}</li>)}</ul>
            </details>

            {/* ── THE WEEK IS THE CITIZEN'S (owner, 9 Sep) ────────────────
                "Let the user decide which two days they want a break — or if
                they don't want a break, what they can do." Directly under the
                grid, because the consequence of the choice is the thing above
                it: press Wednesday and the month redraws while you watch. */}
            <div className="wk-week">
              <div className="wk-week-l">Which days are yours?</div>
              <div className="wk-week-keys" role="group" aria-label="The days you keep for yourself">
                {WEEKDAY_SHORT.map((w, i) => (
                  <button key={w} type="button" className="wk-week-k" aria-pressed={chosenRest.includes(i)}
                    aria-label={`${WEEKDAY_NAMES[i]} off`} disabled={saveWeek.isPending}
                    onClick={() => toggleRest(i)}>{w}</button>
                ))}
              </div>
              <div className="wk-week-own">
                <span className="wk-week-l">And on a day off?</span>
                {OFF_DAY_ACTIVITIES.map((a) => (
                  <button key={a} type="button" className="wk-week-k" aria-pressed={chosenActivity.toLowerCase() === a}
                    disabled={saveWeek.isPending}
                    onClick={() => saveWeek.mutate({ restDays: chosenRest, restActivity: a })}>
                    {a === 'rest' ? 'Nothing' : a[0].toUpperCase() + a.slice(1)}
                  </button>
                ))}
                {/* THE BOX TAKES ANYTHING. The trainer asked what you would
                    rather do; "cricket" is a better answer than the nearest of
                    six, and a list that cannot hold it makes the question
                    dishonest. It is printed back, never parsed. */}
                <input type="text" maxLength={24} placeholder="or something else…"
                  aria-label="Your own word for a day off" disabled={saveWeek.isPending}
                  defaultValue={(OFF_DAY_ACTIVITIES as readonly string[]).includes(chosenActivity.toLowerCase()) ? '' : chosenActivity}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v.toLowerCase() !== chosenActivity.toLowerCase()) saveWeek.mutate({ restDays: chosenRest, restActivity: v }); }} />
              </div>
              {/* THE TRAINER TALKING. Written on the server beside the code
                  that acted on the choice, so the words a citizen reads about
                  their own week are not composed twice. */}
              <ul className="wk-week-say muted">{month.rest.advice.map((a) => <li key={a}>{a}</li>)}</ul>
              {saveWeek.isError && (
                <p role="alert" style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600, margin: '8px 0 0' }}>
                  That didn&rsquo;t reach us — your week is unchanged. Try again in a moment.
                </p>
              )}
            </div>

          </div>
        </section>
      )}

      {/* THE PAGE ENDS WITH THE WEEK (owner, 18 Sep: "the workout page should
          end with 'Which days are yours?' and nothing else"). Today's plan,
          the controls, the week log and the trust line came off here; a day
          is run from its own page (/fitness/workout/day/:index), which sends
          ?start= back to the runner below. */}

      {/* ── THE RUNNER IS A TELEVISION (owner, 6 Sep: "use the Together City
          TV format for this section", then "no white zone, everything below
          the full-screen video, uniform, with a timer"). The set's own room,
          PORTALLED TO THE BODY the way the set is — the shell's column is a
          containing block, and a fixed room inside it was a television in a
          box with the header above it and a white gutter beside it. The film
          fills the screen; the block, the name, the target, the clock, what
          is next and the steps sit in the caption band at the foot, the way
          the set's captions do; the keys are the remote. A movement with no
          film shows its animation on the screen, or its name. */}
      {running && s && createPortal(
        <div className="tv-room wk-run">
          <div className="tv-screen">
            {/* Decorative to a screen reader — the steps in the caption are
                the instructions — so it carries no track. Always mounted
                while the session runs (see the effect above); hidden on a
                step with no film. */}
            <video ref={film} className="tv-media" loop playsInline preload="auto" aria-hidden hidden={!filmSrc} />
            {filmSrc && needsTap && (
              <button type="button" className="tv-sound" onClick={() => { setNeedsTap(false); void film.current?.play().catch(() => setNeedsTap(true)); }}>▶ Tap to play</button>
            )}
            {filmSrc ? null : s.gif && !s.rest ? (
              <figure className="wk-screen-shot">
                {/* 180×180 is the size this media is licensed at. */}
                <img src={s.gif} alt="" width={180} height={180} />
                <figcaption>{EXERCISE_MEDIA_ATTRIBUTION}</figcaption>
              </figure>
            ) : (
              <div className="wk-screen-name">{s.rest ? 'Rest' : s.name}</div>
            )}
            <div className="tv-progress" aria-hidden><span style={{ width: `${s.dur ? Math.round((1 - rt.current.remain / s.dur) * 100) : 0}%` }} /></div>
          </div>

          <div className="tv-room-top">
            <span className="wk-top-step">Step {rt.current.idx + 1} of {rt.current.seq.length} · {s.block}{s.round ? ` · round ${s.round}` : ''}</span>
            <button type="button" className="tv-key" aria-label="End the workout" onClick={() => finish(true)}>✕</button>
          </div>

          <div className="tv-caption wk-cap" aria-live="off">
            <div className="wk-cap-row">
              <div className="wk-cap-words">
                <h2 className="wk-cap-name">{s.rest ? 'Rest' : s.name}</h2>
                <p className="wk-cap-target">{s.walk ? s.note : s.note ? `Target ${s.note}` : s.reps ? `Target ${s.reps} reps` : s.rest ? 'Recover' : `Hold / go for ${mmss(s.dur)}`}</p>
                <p className="wk-cap-next">{next ? `Up next: ${next.rest ? 'Rest' : next.name}` : 'Last one!'}</p>
              </div>
              <div className="wk-cap-clock">{mmss(rt.current.remain)}</div>
            </div>
            {/* NOT ON A REST STEP: "Rest" needs no instructions, and the last
                movement's over it would start the next set early. */}
            {!s.rest && (s.steps?.length ?? 0) > 0 && (
              <ol className="wk-cap-steps">{s.steps!.map((t) => <li key={t}>{t}</li>)}</ol>
            )}
            {!s.rest && (s.muscles?.length ?? 0) > 0 && (
              <p className="wk-cap-muscles">Works {s.muscles!.join(' · ')}</p>
            )}
          </div>

          <div className="tv-bar wk-bar">
            <div className="tv-bar-row wk-keys">
              <button type="button" onClick={() => { rt.current.paused = !rt.current.paused; force(); }}>{rt.current.paused ? '▶ Resume' : '⏸ Pause'}</button>
              <button type="button" onClick={advance}>⏭ Skip</button>
              <button type="button" onClick={skipToWalk}>🚶 To the walk</button>
              <button type="button" className="is-done" onClick={() => { creditCurrent(); advance(); }}>Done ▸</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

