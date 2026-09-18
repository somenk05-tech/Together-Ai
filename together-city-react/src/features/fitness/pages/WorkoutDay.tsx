import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Fold, Spinner } from '@/components/ui';
import { EXERCISE_MEDIA_ATTRIBUTION, WEEKDAY_NAMES, useMoveWorkoutDay, useProgramme, type ProgrammeDay, type ProgrammeExercise } from '../api';
import { monthOf } from '../division.api';
import { useAddToDay, useRemoveFromDay, type MobilityStep } from '../day.api';
import { useWorkoutLibrary, type LibraryMovement } from '../library.api';

/**
 * ── A DAY IS A PAGE (owner, 18 Sep) ─────────────────────────────────────────
 *
 * "When someone clicks on the day it should open the day on a new page with
 * that day's complete workout, and below each workout day page add search
 * and add workout to the day."
 *
 * One day of the month, whole: what it is, when it is, how long, every
 * movement with its picture, sets, reps, rest and how it is done — and
 * under it the library, searched, with Add. What the citizen adds is theirs
 * (fitness/programme/day/:index/add) and comes back on the day marked as
 * theirs, with Remove. Start sends the citizen to the runner on the Workout
 * page with ?start=, because the runner lives there and a day is run, not
 * copied.
 */
const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const longDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${WEEKDAY_NAMES[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
type DayExercise = ProgrammeExercise & { additionId?: string };

/**
 * ── THE WAY IN AND THE WAY OUT (owner, 18 Sep) ──────────────────────────────
 *
 * "Add the warm up and rest workouts too each day, and make it detailed."
 * The warm-up before the work and the stretches after it, each held for
 * its time, with its steps, its picture and the city's film where one has
 * been shot. On a day off the cool-down is the whole workout — the
 * owner's "rest workout". Nothing here is a set; the runner counts it
 * down (see stepsFromDay on the Workout page).
 */
function MobilityList({ id, title, line, steps }: { id: string; title: string; line: string; steps: MobilityStep[] }) {
  const total = steps.reduce((s, x) => s + x.seconds, 0);
  return (
    <section className="card wd-card" aria-labelledby={id}>
      <h2 id={id} className="wd-h2">{title} <span className="wd-parts">— about {Math.max(1, Math.round(total / 60))} min</span></h2>
      <p className="muted wd-line">{line}</p>
      <ol className="wd-list">
        {steps.map((s, i) => (
          <li key={`${s.id}-${i}`}>
            <Fold face="wl-lid" panel="wl-how-panel"
              title={<>{s.thumb ? <img className="wl-thumb" src={s.thumb} alt="" width={44} height={44} loading="lazy" /> : <span className="wl-thumb wl-thumb-none" aria-hidden />}<span className="wl-nm">{i + 1}. {s.name}</span></>}
              meta={<><span className="wl-mu">{s.works} · hold or move, easy breathing</span><span className="wd-tg">{s.seconds}s</span></>}>
              <div className="wl-how">
                <div className="wl-how-media">
                  {s.video && (
                    <div className="wl-film">
                      <video className="wl-film-v" src={s.video} controls playsInline preload="metadata" aria-label={`${s.name} — the city's film`} />
                    </div>
                  )}
                  {s.gif && (
                    <figure className="wl-gif">
                      <img src={s.gif} alt={`${s.name}, animated`} width={180} height={180} loading="lazy" />
                      <figcaption className="muted">{EXERCISE_MEDIA_ATTRIBUTION}</figcaption>
                    </figure>
                  )}
                </div>
                <div className="wl-how-words">
                  <div className="eyebrow">How it is done · {s.seconds} seconds</div>
                  {s.steps.length > 0
                    ? <ol className="wl-steps">{s.steps.map((w, k) => <li key={k}>{w}</li>)}</ol>
                    : <p className="muted">Ease into it, breathe slowly, and stop short of pain.</p>}
                </div>
              </div>
            </Fold>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Remove, asked twice, in the words the log uses. */
function RemoveKey({ id, name, dayIndex, confirming, setConfirming }: { id: string; name: string; dayIndex: number; confirming: string | null; setConfirming: (v: string | null) => void }) {
  const remove = useRemoveFromDay();
  if (confirming === id) {
    return (
      <span className="wl-acts">
        <Button type="button" variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ dayIndex, id }, { onSuccess: () => setConfirming(null) })}>
          {remove.isPending ? 'Removing…' : 'Remove it'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
        {remove.isError && <span role="alert" className="wd-alert">That didn&rsquo;t reach us.</span>}
      </span>
    );
  }
  return <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${name} from this day`} onClick={() => setConfirming(id)}>Remove</Button>;
}

/** Workout day — one day of your month, whole, and yours to add to. */
export function WorkoutDay() {
  const { index } = useParams();
  const navigate = useNavigate();
  const n = Number(index);
  const programme = useProgramme();
  const lib = useWorkoutLibrary();
  const add = useAddToDay();
  const moveDay = useMoveWorkoutDay();
  const [q, setQ] = useState('');
  const [sets, setSets] = useState(3);
  const [reps, setReps] = useState(10);
  const [confirming, setConfirming] = useState<string | null>(null);

  const month = programme.data;
  const day: (ProgrammeDay & { minutes?: number; warmup?: MobilityStep[]; cooldown?: MobilityStep[] }) | undefined = month && Number.isInteger(n) && n >= 0 ? month.days[n] : undefined;
  const inDay = useMemo(() => new Set((day?.exercises ?? []).map((e) => e.id)), [day]);
  const results = useMemo(() => {
    const all = lib.data?.movements ?? [];
    const word = q.trim().toLowerCase();
    if (!word) return [];
    return all.filter((m) => m.name.includes(word) || m.target.includes(word) || m.partLabel.toLowerCase().includes(word)).slice(0, 24);
  }, [lib.data, q]);

  if (programme.isLoading) return <Spinner label="Opening your day…" />;
  if (programme.isError || !month) return <EmptyState title="Couldn't open your month" hint="Your month is still there — only the reading of it failed. Try again in a moment." />;
  if (!day) return <EmptyState title="No such day in your month" hint="A month is twenty-eight days, counted from the day you first opened it." />;

  const m = monthOf(month);
  const week = m.weeks.find((w) => w.week === day.week);
  const todayIndex = month.todayIndex;
  const when = day.index === todayIndex ? 'today' : day.index < todayIndex ? `${todayIndex - day.index} day${todayIndex - day.index === 1 ? '' : 's'} ago` : `in ${day.index - todayIndex} day${day.index - todayIndex === 1 ? '' : 's'}`;
  const anchor = month.days.find((d) => d.index >= todayIndex && d.kind === 'strength');
  const canMove = day.kind === 'strength' && anchor != null && day.index !== anchor.index && day.slot !== anchor.slot;
  const work = day.exercises as DayExercise[];
  const warmup = day.warmup ?? [];
  const cooldown = day.cooldown ?? [];
  const added = work.filter((e) => e.additionId).length;
  const cap = 10;
  const addOne = (mv: LibraryMovement) => add.mutate({ dayIndex: day.index, exerciseId: mv.id, sets, reps });

  return (
    <div className="wd">
      <div className="eyebrow">Personal trainer · Day {day.index + 1} of {month.days.length} · week {day.week}{week ? ` · ${week.label}` : ''}</div>
      <h1 className="wd-h1">{day.kind === 'strength' ? <>{day.title} <span className="wd-parts">— {day.parts}</span></> : day.title}</h1>
      <p className="wd-when muted">
        {longDate(day.date)} · {day.minutes ?? day.cardioMinutes} min · {when}{day.done ? ' · done' : ''}
      </p>
      <p className="lede wd-note">{day.note}</p>
      <div className="wd-acts">
        {(day.exercises.length > 0 || cooldown.length > 0) && (
          <Link to={`/fitness/workout?start=${day.index}`} className="btn btn-accent">
            ▶ {day.kind === 'rest' ? 'Start the rest workout' : day.index === todayIndex ? 'Start this day' : day.index < todayIndex ? 'Do it again' : 'Do it early'}
          </Link>
        )}
        {canMove && anchor && (
          <Button type="button" variant="line" disabled={moveDay.isPending}
            onClick={() => moveDay.mutate(day.index, { onSuccess: () => navigate('/fitness/workout') })}>
            {moveDay.isPending ? 'Moving…' : anchor.index === todayIndex ? 'Update today’s workout plan' : 'Make this your next session'}
          </Button>
        )}
        <Link to="/fitness/workout" className="btn btn-ghost">Back to your month</Link>
      </div>
      {moveDay.isError && <p role="alert" className="wd-alert">That didn&rsquo;t reach us — your month is unchanged. Try again in a moment.</p>}

      {/* ── THE WAY IN ──────────────────────────────────────────────────── */}
      {warmup.length > 0 && (
        <MobilityList id="wd-warm-h" title="Warm-up" steps={warmup}
          line={day.kind === 'strength' ? 'Before the first set: raise the pulse and move the joints you are about to load. None of this counts as a set.' : 'Before you start: raise the pulse and open the hips and shoulders, so the easy minutes stay easy.'} />
      )}

      {/* ── THE DAY, WHOLE ──────────────────────────────────────────────── */}
      <section className="card wd-card" aria-labelledby="wd-work-h">
        <h2 id="wd-work-h" className="wd-h2">{day.kind === 'strength' ? 'The work' : day.kind === 'rest' ? 'A day off' : 'Easy on purpose'}</h2>
        {day.kind !== 'strength' && (
          <p className="muted wd-line">
            {day.kind === 'rest' ? 'Nothing is lifted; the rest workout is under this. ' : `${day.cardioMinutes} minutes, conversational. `}
            {day.exercises.length > 0 ? 'What is below is yours — you put it here.' : 'Anything you add below is yours.'}
          </p>
        )}
        {day.exercises.length > 0 && (
          <ol className="wd-list">
            {work.map((e, i) => (
              <li key={`${e.id}-${e.additionId ?? i}`}>
                <Fold face="wl-lid" panel="wl-how-panel"
                  title={<>{e.thumb ? <img className="wl-thumb" src={e.thumb} alt="" width={44} height={44} loading="lazy" /> : <span className="wl-thumb wl-thumb-none" aria-hidden />}<span className="wl-nm">{i + 1}. {e.name}</span></>}
                  meta={<><span className="wl-mu">{e.works} · {e.equipment} · rest {e.restSec}s</span><span className="wd-tg">{e.sets} × {e.reps[0] === e.reps[1] ? e.reps[0] : `${e.reps[0]}–${e.reps[1]}`}</span>{e.additionId && <span className="wl-lv is-beginner">Yours</span>}</>}
                  action={e.additionId ? <RemoveKey id={e.additionId} name={e.name} dayIndex={day.index} confirming={confirming} setConfirming={setConfirming} /> : undefined}>
                  <div className="wl-how">
                    <div className="wl-how-media">
                      {e.gif && (
                        <figure className="wl-gif">
                          <img src={e.gif} alt={`${e.name}, animated`} width={180} height={180} loading="lazy" />
                          <figcaption className="muted">{EXERCISE_MEDIA_ATTRIBUTION}</figcaption>
                        </figure>
                      )}
                    </div>
                    <div className="wl-how-words">
                      <div className="eyebrow">How it is done</div>
                      {e.steps.length > 0
                        ? <ol className="wl-steps">{e.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                        : <p className="muted">The catalogue carries no steps for this one.</p>}
                    </div>
                  </div>
                </Fold>
              </li>
            ))}
          </ol>
        )}
        <p className="muted wd-credit">{EXERCISE_MEDIA_ATTRIBUTION}</p>
      </section>

      {/* ── THE WAY OUT ─────────────────────────────────────────────────── */}
      {cooldown.length > 0 && (
        <MobilityList id="wd-cool-h" title={day.kind === 'rest' ? 'The rest workout' : 'Cool-down'} steps={cooldown}
          line={day.kind === 'rest'
            ? 'A day off is not a day still. Stretch the big muscles, thirty seconds each, breathing slowly — the week ahead is easier for it. Start it from the button above.'
            : day.kind === 'strength'
              ? 'Stretch what you just worked, thirty seconds each, easy breathing. This is where the range comes from.'
              : 'Bring the heart rate down and open what tightened on the way.'} />
      )}

      {/* ── SEARCH, AND ADD TO THE DAY ──────────────────────────────────── */}
      <section className="card wd-card" aria-labelledby="wd-add-h">
        <h2 id="wd-add-h" className="wd-h2">Add a movement to this day</h2>
        <p className="muted wd-line">
          From the whole library{lib.data ? ` — ${lib.data.trackLabel.toLowerCase()}` : ''}. {added} of {cap} of yours on this day.
        </p>
        <div className="wd-search">
          <label className="wl-field wl-grow">
            <span className="wl-label">Find</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A movement, a muscle or a body part" />
          </label>
          <label className="wl-num"><span className="wl-label">Sets</span><input type="number" min={1} max={10} value={sets} onChange={(e) => setSets(Math.max(1, Math.min(10, Number(e.target.value) || 1)))} /></label>
          <label className="wl-num"><span className="wl-label">Reps</span><input type="number" min={1} max={100} value={reps} onChange={(e) => setReps(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label>
        </div>
        {lib.isLoading && <Spinner label="Opening the library…" />}
        {lib.isError && <p className="muted">The library didn&rsquo;t load. Try again in a moment.</p>}
        {lib.data && q.trim() && results.length === 0 && <p className="muted wd-line">Nothing by that name. Try a muscle — chest, glutes, abs.</p>}
        {results.length > 0 && (
          <ul className="wd-results">
            {results.map((mv) => (
              <li key={mv.id} className="wd-result">
                {mv.thumb ? <img className="wl-thumb" src={mv.thumb} alt="" width={44} height={44} loading="lazy" /> : <span className="wl-thumb wl-thumb-none" aria-hidden />}
                <span className="wl-w">
                  <span className="wl-nm">{mv.name}</span>
                  <span className="wl-mu">{mv.partLabel} · {mv.target} · {mv.equipment}</span>
                </span>
                <span className={`wl-lv is-${mv.level}`}>{LEVEL_LABEL[mv.level]}</span>
                <Button type="button" variant={inDay.has(mv.id) ? 'ghost' : 'line'} size="sm" disabled={inDay.has(mv.id) || added >= cap || add.isPending}
                  aria-label={inDay.has(mv.id) ? `${mv.name} is on this day` : `Add ${mv.name} to this day`} onClick={() => addOne(mv)}>
                  {inDay.has(mv.id) ? 'On this day' : '+ Add'}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {add.isError && <p role="alert" className="wd-alert">That didn&rsquo;t save — the day is unchanged. {(add.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Try again in a moment.'}</p>}
        <p className="muted wd-line">Every movement in the city is in the <Link to="/fitness/library">Workout Library</Link>, with its level and how it is done.</p>
      </section>
    </div>
  );
}
