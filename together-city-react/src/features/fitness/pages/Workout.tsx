import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { EXERCISE_MEDIA_ATTRIBUTION, useAddWorkout, useTodaySession, type TodaySession } from '../api';
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
}

/** A reasonable clock for one working set, so the timer has something to count
 *  down on a movement measured in reps. The set itself is the target on the
 *  screen; this is only how long the page waits before saying "rest". */
const REP_SECONDS = 3;

/**
 * The server's blocks, flattened into the steps the live timer walks.
 *
 * Sets become repeated steps with a rest between them — that is what makes the
 * timer able to say "set 2 of 3" without the engine knowing a timer exists.
 */
function stepsFrom(session: TodaySession | undefined, includeWalk: boolean): Step[] {
  if (!session) return [];
  const out: Step[] = [];
  for (const block of session.blocks) {
    if (block.title === 'Then walk') continue;
    for (const ex of block.exercises) {
      const perSet = ex.seconds ?? Math.round(((ex.reps?.[1] ?? 10)) * REP_SECONDS);
      for (let i = 1; i <= ex.sets; i++) {
        out.push({
          name: ex.name, block: block.title, dur: perSet,
          reps: ex.reps ? ex.reps[1] : null,
          note: ex.reps ? `${ex.reps[0]}–${ex.reps[1]} reps${ex.unilateral ? ' each side' : ''}` : undefined,
          ...(ex.sets > 1 ? { round: i } : {}),
          steps: ex.steps, muscles: ex.muscles, gif: ex.gif,
        });
        if (i < ex.sets && ex.restSec > 0) out.push({ name: 'Rest', block: block.title, dur: ex.restSec, reps: null, rest: true });
      }
    }
  }
  // The walk is a block the timer draws itself, so its own instructions have to
  // be fetched out of the block it replaces rather than written again here.
  if (includeWalk) out.push(walkStepOf(session.walkMinutes, session.blocks.find((b) => b.title === 'Then walk')?.exercises[0]));
  return out;
}
const walkStepOf = (minutes: number, from?: { steps?: string[]; muscles?: string[] }): Step => ({
  name: 'Brisk walk', block: 'Finish', dur: minutes * 60, reps: null, walk: true,
  note: `${minutes} minutes · brisk enough to be breathing, easy enough to talk`,
  steps: from?.steps, muscles: from?.muscles,
});

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
  /**
   * TODAY'S TWO OVERRIDES, and they are the only two left.
   *
   * `undefined` means "whatever my profile says" — the server falls back to the
   * saved place and session length, so an untouched page is the citizen's own
   * usual answer rather than this file's opinion of it. The level, the split,
   * the gender emphasis and the rep scheme are gone from here entirely: they
   * are the server's, from the profile they saved.
   */
  const [dur, setDur] = useState<number | undefined>(undefined);
  const [loc, setLoc] = useState<Loc | undefined>(undefined);
  const [log, setLog] = useState<Record<string, DayLog>>({});
  const todays = useTodaySession(dur, loc);
  const session = todays.data;

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

  const workoutSeconds = useMemo(() => stepsFrom(session, false).reduce((a, st) => a + st.dur, 0), [session]);

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
    const seq = mode === 'walk' ? [walkStepOf(walkMin || 20)] : stepsFrom(session, true);
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
  const markSkipAll = () => { if (window.confirm('Skip today? It logs as no activity.')) setLog((l) => ({ ...l, [dayKey()]: { status: 'none', kcal: 0 } })); };

  const today = log[dayKey()]; const tStatus: Status = today ? today.status : 'rest';
  const running = rt.current.running; const s = rt.current.seq[rt.current.idx];
  const next = rt.current.seq[rt.current.idx + 1];

  const weekCells = useMemo(() => {
    const out: { day: string; status: string; kcal: string }[] = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const e = log[dayKey(d)]; out.push({ day: DAYNAMES[d.getDay()], status: e ? e.status : '', kcal: e ? inr(e.kcal) : '—' }); }
    return out;
  }, [log]);

  const Seg = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} style={{ border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'var(--card)', color: on ? 'var(--on-accent)' : 'var(--ink)', borderRadius: 'var(--r-full)', padding: '8px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{children}</button>
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
        <p className="lede" style={{ marginTop: 6 }}>Today's session, matched to your level and goal — with a live timer.</p>
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
        <div className="blk-head">
          <h2>Today&rsquo;s plan{session ? ` · ${session.headline}` : ''}</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            {todays.isLoading ? 'building your session…' : session ? `≈ ${Math.round(workoutSeconds / 60)} min of work${session.eased ? ' · eased on purpose' : ''}` : ''}
          </span>
        </div>

        {/* WHY THIS WORKOUT — the owner's first ask, and the reason the engine
            moved to the server at all: every clause is made of a named input,
            so "personalised" is a claim the page can back. */}
        {session && (
          <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--accent)' }}>
            <div className="eyebrow">Why this workout</div>
            {/* WHICH DAY OF THE WEEK THIS IS, FIRST. The plan said "Tuesday —
                Pull" and this page opened a full-body session; the two engines
                did not speak until 21 Aug. This line is the join, and it is at
                the top of the explanation because it is the thing a citizen
                following a plan checks first. */}
            {session.why.day && (
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0', fontWeight: 600 }}>{session.why.day}</p>
            )}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0' }}>{session.why.goal}</p>
            {session.why.energy && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0' }}>{session.why.energy}</p>}
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0' }}>{session.why.activity}</p>
            {session.why.ceiling && <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '6px 0 0', color: 'var(--accent-ink)', fontWeight: 600 }}>{session.why.ceiling}</p>}
            {/* WHAT IT DID NOT KNOW. Named, with the way to tell us beside it —
                an input we never asked for is not personalisation we can claim. */}
            {session.why.missing.length > 0 && (
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '10px 0 0' }}>
                Not in this yet: {session.why.missing.join('; ')}.{' '}
                <Link to="/fitness/profile" style={{ fontWeight: 700 }}>Fill it in →</Link>
              </p>
            )}
          </div>
        )}

        {/* WHAT WAS SWAPPED, AND WHY. Never silent: a citizen quietly handed an
            easier movement has been managed rather than trained. */}
        {session && session.substitutions.length > 0 && (
          <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--ok-ink)' }}>
            <div className="eyebrow">Changed for you</div>
            {session.substitutions.map((sub) => (
              <p key={`${sub.from}-${sub.to}`} style={{ fontSize: 13, lineHeight: 1.6, margin: '6px 0 0' }}>
                <b>{sub.to}</b> instead of {sub.from} — you told us about {sub.because === 'jointPain' ? 'joint pain' : sub.because}.
              </p>
            ))}
          </div>
        )}

        <div className="card">
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '0 0 6px' }}>How long today?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[30, 45, 60, 90].map((m) => <Seg key={m} on={(dur ?? session?.minutes) === m} onClick={() => setDur(m)}>{m} min</Seg>)}
          </div>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', margin: '12px 0 6px' }}>Where are you training?</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Seg on={(loc ?? session?.place) === 'home'} onClick={() => setLoc('home')}>🏠 At home</Seg>
            <Seg on={(loc ?? session?.place) === 'gym'} onClick={() => setLoc('gym')}>🏋 At the gym</Seg>
          </div>
          {/* The level, the split and the rep scheme are NOT here any more. They
              are the saved training profile's, which is the only copy of them. */}
          <p className="muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>
            Your level, goal and what you train with come from your{' '}
            <Link to="/fitness/profile" style={{ fontWeight: 700 }}>training profile</Link>. Today&rsquo;s length and place are just for today.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '16px 0 14px' }}>
            <Button variant="accent" disabled={!session} onClick={() => start('full')}>▶ Start workout + walk</Button>
            <Button variant="line" onClick={() => start('walk')}>🚶 Just walk ({walkMin || 20} min)</Button>
            <Button variant="ghost" onClick={markSkipAll}>Skip today</Button>
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>The timer guides you exercise-by-exercise.</p>

          {todays.isLoading && <p className="muted" style={{ fontSize: 12.5 }}>Building today&rsquo;s session from your profile…</p>}
          {todays.isError && (
            <p style={{ fontSize: 12.5, color: 'var(--danger-ink)' }}>
              We couldn&rsquo;t build today&rsquo;s session. This didn&rsquo;t reach us — nothing about your profile has changed. Try again in a moment.
            </p>
          )}

          {session?.blocks.map((block) => (
            <div key={block.title}>
              {blkHead(block.note ? `${block.title} · ${block.note}` : block.title)}
              {block.exercises.map((ex, i) => exRow(
                i + 1,
                ex.name,
                ex.insteadOf ? `instead of ${ex.insteadOf.name}` : ex.seconds ? 'hold / go for the time' : `rest ${ex.restSec}s between sets`,
                ex.seconds ? (ex.sets > 1 ? `${ex.sets} × ${mmss(ex.seconds)}` : mmss(ex.seconds)) : `${ex.sets} × ${ex.reps?.[0]}–${ex.reps?.[1]}${ex.unilateral ? ' /side' : ''}`,
              ))}
            </div>
          ))}

          {/* READ BEFORE YOU START. The citizen's own words first, then the
              rules that follow from what they have told us. */}
          {session && session.cautions.length > 0 && (
            <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {session.cautions.map((c) => (
                <li key={c} style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--warn-ink)', background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 8, padding: '7px 11px' }}>{c}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* week */}
      <section className="blk">
        <div className="blk-head"><h2>This week</h2><span className="muted" style={{ fontSize: 12 }}>Physical activity log</span></div>
        <div className="card">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {weekCells.map((c, i) => (
              <div key={i} style={{ flex: 1, minWidth: 52, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 'var(--r-1)', padding: '9px 4px' }}>
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
            <div style={{ height: 6, borderRadius: 'var(--r-full)', background: 'rgba(255,255,255,.15)', overflow: 'hidden', marginTop: 8, width: 240 }}>
              <div style={{ height: '100%', background: 'var(--ok-line)', width: `${s.dur ? Math.round((1 - rt.current.remain / s.dur) * 100) : 0}%` }} />
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>{next ? `Up next: ${next.rest ? 'Rest' : next.name}` : 'Last one!'}</div>

            {/* ── HOW IT IS DONE, WHILE IT IS BEING DONE ───────────────
                UNDER THE CLOCK, NOT BESIDE IT. The countdown is what somebody
                glances at from two metres away mid-set; the instructions are
                what they read in the first seconds and during the rest before
                it. One column keeps one reading order on a phone, and costs
                nothing on a laptop — measured on the live page, this screen was
                two thirds empty below the progress bar.

                NOT ON A REST STEP. "Rest" needs no instructions, and printing
                the last movement's over it would have somebody starting the
                next set during their recovery. */}
            {!s.rest && (s.gif || (s.steps?.length ?? 0) > 0) && (
              <div className="wk-how">
                {s.gif && (
                  <figure className="wk-how-shot">
                    {/* 180×180 is the size this media is licensed at — not a
                        layout choice, and not one to "improve" later. */}
                    <img src={s.gif} alt="" width={180} height={180} loading="lazy" />
                    <figcaption>{EXERCISE_MEDIA_ATTRIBUTION}</figcaption>
                  </figure>
                )}
                <div className="wk-how-words">
                  {(s.steps?.length ?? 0) > 0 && (
                    <ol className="wk-how-steps">{s.steps!.map((t) => <li key={t}>{t}</li>)}</ol>
                  )}
                  {(s.muscles?.length ?? 0) > 0 && (
                    <div className="wk-how-muscles">Works {s.muscles!.join(' · ')}</div>
                  )}
                </div>
              </div>
            )}
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

const ctrl: React.CSSProperties = { borderRadius: 'var(--r-full)', padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(255,255,255,.35)', background: 'transparent', color: 'var(--on-accent)' };
