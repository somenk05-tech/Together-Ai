import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Fold, SavedMark, Spinner } from '@/components/ui';
import { EXERCISE_MEDIA_ATTRIBUTION, WEEKDAY_NAMES, WEEKDAY_SHORT } from '../api';
import {
  useMovementHowTo, useRemoveWorkoutPlan, useSaveWorkoutPlan, useWorkoutLibrary, useWorkoutPlans,
  type Grade, type LibraryMovement, type PlanDay, type PlanExercise, type PlanKind, type WorkoutPlan,
} from '../library.api';

/**
 * ── EVERY MOVEMENT IN THE CITY (owner, 18 Sep) ──────────────────────────────
 *
 * "A separate page where all workouts in the database are mentioned with body
 * parts, and also which level they are with instructions; the user can add
 * the workouts to create his own plan for the day or week and save those
 * plans on the page; each workout should have space for workout videos;
 * sort men and women workouts separately."
 *
 * Three things on one page. THE SHELF: every movement the catalogue has, in
 * the citizen's own library (women's or men's — the profile decides, and the
 * page says which it opened), filtered by body part, level, kit and a word,
 * each card opening on how it is done, the animation and the space for the
 * city's film. THE PLAN: a day or a week the citizen builds by pressing Add,
 * sets and reps theirs to change, kept in this tab until it is saved. THE
 * SHELF OF PLANS: what they have saved, opened back into the builder or
 * removed.
 *
 * NOTHING IS RANKED and nothing is prescribed here. The Workout room next
 * door builds a session from the profile; this room is the whole catalogue
 * and the citizen's own hand. The level on a card is the city's grading of
 * the movement (fitness/library/exercise-grade.ts) and the page says so.
 */
const LEVEL_LABEL: Record<Grade, string> = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
const PAGE = 60;
const DRAFT_KEY = 'tc.wl.draft';

interface Draft { id?: string; name: string; kind: PlanKind; days: Record<number, PlanExercise[]>; activeDay: number }
const EMPTY: Draft = { name: '', kind: 'day', days: {}, activeDay: 0 };

/** The plan being built survives a walk to the Workout room and back — for
 *  the tab, not the account, the same posture a fold keeps. */
function readDraft(): Draft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Partial<Draft>;
    return { ...EMPTY, ...d, days: d.days ?? {} };
  } catch { return EMPTY; }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const count = (d: Draft) => Object.values(d.days).reduce((n, l) => n + l.length, 0);

/** Workout Library — every movement in the city, and your own plan from it. */
export function Library() {
  const lib = useWorkoutLibrary();
  const plans = useWorkoutPlans();
  const save = useSaveWorkoutPlan();
  const remove = useRemoveWorkoutPlan();

  const [part, setPart] = useState<string>('all');
  const [level, setLevel] = useState<'all' | Grade>('all');
  const [kit, setKit] = useState<string>('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [openPlan, setOpenPlan] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
  }, [draft]);
  useEffect(() => { setShown(PAGE); }, [part, level, kit, q]);

  const byId = useMemo(() => new Map((lib.data?.movements ?? []).map((m) => [m.id, m])), [lib.data]);

  const list = useMemo(() => {
    const all = lib.data?.movements ?? [];
    const word = q.trim().toLowerCase();
    return all.filter((m) =>
      (part === 'all' || m.part === part)
      && (level === 'all' || m.level === level)
      && (kit === 'all' || m.equipment === kit)
      && (!word || m.name.includes(word) || m.target.includes(word)));
  }, [lib.data, part, level, kit, q]);

  if (lib.isLoading) return <Spinner label="Opening the library…" />;
  if (lib.isError || !lib.data) return <EmptyState title="Couldn't open the library" hint="Every movement is still there — only the reading of it failed. Try again in a moment." />;
  const data = lib.data;

  // ── the plan the citizen is building ─────────────────────────────────────
  const slot = draft.kind === 'day' ? 0 : draft.activeDay;
  const current = draft.days[slot] ?? [];
  const inPlan = new Set(current.map((e) => e.id));

  const add = (m: LibraryMovement) => setDraft((d) => {
    const s = d.kind === 'day' ? 0 : d.activeDay;
    const list = d.days[s] ?? [];
    if (list.some((e) => e.id === m.id)) return d;
    return { ...d, days: { ...d.days, [s]: [...list, { id: m.id, sets: 3, reps: 10 }] } };
  });
  const drop = (id: string) => setDraft((d) => ({ ...d, days: { ...d.days, [slot]: (d.days[slot] ?? []).filter((e) => e.id !== id) } }));
  const tune = (id: string, key: 'sets' | 'reps', v: number) => setDraft((d) => ({
    ...d, days: { ...d.days, [slot]: (d.days[slot] ?? []).map((e) => (e.id === id ? { ...e, [key]: v } : e)) },
  }));
  const setKind = (kind: PlanKind) => setDraft((d) => (d.kind === kind ? d : {
    ...d, kind,
    /* A day plan built so far becomes Monday of the week; a week collapses
       to whichever day the citizen was on. Nothing added is lost. */
    days: kind === 'week' ? { 0: d.days[0] ?? [], ...d.days } : { 0: d.days[d.activeDay] ?? d.days[0] ?? [] },
    activeDay: 0,
  }));
  const daysOut = (): PlanDay[] => (draft.kind === 'day'
    ? [{ day: 0, exercises: draft.days[0] ?? [] }]
    : Object.entries(draft.days).map(([k, ex]) => ({ day: Number(k), exercises: ex })).filter((d) => d.exercises.length > 0).sort((a, b) => a.day - b.day));
  const canSave = draft.name.trim().length > 0 && count(draft) > 0 && !save.isPending;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    save.mutate({ id: draft.id, name: draft.name.trim(), kind: draft.kind, days: daysOut() }, {
      onSuccess: (saved) => { setDraft(EMPTY); setOpenPlan(saved.id); },
    });
  };
  const edit = (p: WorkoutPlan) => {
    const days: Record<number, PlanExercise[]> = {};
    for (const d of p.days) days[d.day] = d.exercises;
    setDraft({ id: p.id, name: p.name, kind: p.kind, days, activeDay: p.days[0]?.day ?? 0 });
    setOpenPlan(p.id);
    document.getElementById('wl-builder')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="wl">
      <div className="eyebrow">Fitness · Workout Library</div>
      <h1 className="wl-h1">Every movement</h1>
      <p className="lede wl-lede">
        {data.trackLabel} · {data.movements.length.toLocaleString('en-IN')} movements, every body part, graded by level.
        {' '}{data.level
          ? <>Your shelf is <strong>{LEVEL_LABEL[data.level]}</strong>, from your Training Profile.</>
          : <>Set your <Link to="/fitness/profile">Training Profile</Link> and the library opens on your own shelf.</>}
      </p>
      <p className="muted wl-note">
        Which library you read follows the gender on your profile — every movement is in both; the films and the order differ.
        The level on a card is the city&rsquo;s grading of the movement, a rule of thumb rather than a prescription.
      </p>

      <div className="wl-cols">
        {/* ── THE SHELF ─────────────────────────────────────────────────── */}
        <section className="wl-shelf" aria-label="The library">
          <div className="wl-filters">
            <div className="wl-chips" role="group" aria-label="Body part">
              <button type="button" className="wl-chip" aria-pressed={part === 'all'} onClick={() => setPart('all')}>All <span className="wl-n">{data.movements.length}</span></button>
              {data.parts.map((p) => (
                <button key={p.key} type="button" className="wl-chip" aria-pressed={part === p.key} onClick={() => setPart(p.key)} title={p.line}>
                  {p.label} <span className="wl-n">{p.count}</span>
                </button>
              ))}
            </div>
            <div className="wl-chips" role="group" aria-label="Level">
              <button type="button" className="wl-chip" aria-pressed={level === 'all'} onClick={() => setLevel('all')}>All levels</button>
              {data.levels.map((l) => (
                <button key={l.key} type="button" className="wl-chip" aria-pressed={level === l.key} onClick={() => setLevel(l.key)}>
                  {l.label} <span className="wl-n">{l.count}</span>{data.level === l.key && <span className="wl-you">· yours</span>}
                </button>
              ))}
            </div>
            <div className="wl-row-fields">
              <label className="wl-field">
                <span className="wl-label">Kit</span>
                <select value={kit} onChange={(e) => setKit(e.target.value)}>
                  <option value="all">Anything</option>
                  {data.equipment.map((k) => <option key={k} value={k}>{cap(k)}</option>)}
                </select>
              </label>
              <label className="wl-field wl-grow">
                <span className="wl-label">Find</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="A movement or a muscle" />
              </label>
            </div>
            <p className="muted wl-count" role="status">
              {list.length.toLocaleString('en-IN')} {list.length === 1 ? 'movement' : 'movements'}
              {draft.kind === 'week' ? ` · adding to ${WEEKDAY_NAMES[slot]}` : ''}
            </p>
          </div>

          {list.length === 0 ? (
            <EmptyState title="Nothing on this shelf" hint="Widen a filter or try another word." />
          ) : (
            <ul className="wl-list">
              {list.slice(0, shown).map((m) => (
                <li key={m.id}>
                  {/* THE CITY'S ONE DISCLOSURE (owner, 8 Sep): a row with a name on
                      it is a titled section, so it is a Fold — "Open + / Close −"
                      — with Add beside the face rather than inside it. */}
                  <Fold face="wl-lid" panel="wl-how-panel"
                    title={<>{m.thumb ? <img className="wl-thumb" src={m.thumb} alt="" width={44} height={44} loading="lazy" /> : <span className="wl-thumb wl-thumb-none" aria-hidden />}<span className="wl-nm">{m.name}</span></>}
                    meta={<><span className="wl-mu">{m.partLabel} · {m.target} · {m.equipment}</span><span className={`wl-lv is-${m.level}`}>{LEVEL_LABEL[m.level]}</span></>}
                    action={
                      <Button type="button" variant={inPlan.has(m.id) ? 'ghost' : 'line'} size="sm" disabled={inPlan.has(m.id)} onClick={() => add(m)} aria-label={inPlan.has(m.id) ? `${m.name} is in your plan` : `Add ${m.name} to your plan`}>
                        {inPlan.has(m.id) ? 'Added' : '+ Add'}
                      </Button>
                    }>
                    <HowTo id={m.id} />
                  </Fold>
                </li>
              ))}
            </ul>
          )}
          {list.length > shown && (
            <div className="wl-more">
              <Button type="button" variant="line" onClick={() => setShown((n) => n + PAGE)}>Show {Math.min(PAGE, list.length - shown)} more</Button>
            </div>
          )}
          <p className="muted wl-credit">{data.attribution}</p>
        </section>

        {/* ── YOUR PLAN, AND YOUR PLANS ─────────────────────────────────── */}
        <aside className="wl-side">
          <form className="card wl-builder" id="wl-builder" onSubmit={submit} aria-labelledby="wl-builder-h">
            <div className="wl-builder-head">
              <h2 id="wl-builder-h" className="wl-h2">{draft.id ? 'Editing your plan' : 'Your plan'}</h2>
              <div className="wl-kinds" role="group" aria-label="Plan for">
                <button type="button" className="wl-chip" aria-pressed={draft.kind === 'day'} onClick={() => setKind('day')}>A day</button>
                <button type="button" className="wl-chip" aria-pressed={draft.kind === 'week'} onClick={() => setKind('week')}>A week</button>
              </div>
            </div>
            <label className="wl-field">
              <span className="wl-label">Name</span>
              <input type="text" value={draft.name} maxLength={60} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={draft.kind === 'day' ? 'Push day' : 'My week'} />
            </label>
            {draft.kind === 'week' && (
              <div className="wl-days" role="tablist" aria-label="Day of the week">
                {WEEKDAY_SHORT.map((w, i) => (
                  <button key={w} type="button" role="tab" aria-selected={draft.activeDay === i} className="wl-day" onClick={() => setDraft((d) => ({ ...d, activeDay: i }))}>
                    <span>{w}</span>
                    <span className="wl-n">{(draft.days[i] ?? []).length || ''}</span>
                  </button>
                ))}
              </div>
            )}
            {current.length === 0 ? (
              <p className="muted wl-empty">
                {draft.kind === 'week' ? `Nothing on ${WEEKDAY_NAMES[slot]} yet.` : 'Nothing in it yet.'} Press <strong>+ Add</strong> on a movement.
              </p>
            ) : (
              <ol className="wl-plan-list" aria-label={draft.kind === 'week' ? WEEKDAY_NAMES[slot] : 'Your day'}>
                {current.map((e) => {
                  const m = byId.get(e.id);
                  return (
                    <li key={e.id}>
                      <span className="wl-w">
                        <span className="wl-nm">{m?.name ?? e.id}</span>
                        {m && <span className="wl-mu">{m.partLabel} · {m.equipment}</span>}
                      </span>
                      <span className="wl-nums">
                        <label className="wl-num"><span className="wl-label">Sets</span><input type="number" min={1} max={10} value={e.sets} onChange={(ev) => tune(e.id, 'sets', Math.max(1, Math.min(10, Number(ev.target.value) || 1)))} /></label>
                        <span className="wl-x" aria-hidden>×</span>
                        <label className="wl-num"><span className="wl-label">Reps</span><input type="number" min={1} max={100} value={e.reps} onChange={(ev) => tune(e.id, 'reps', Math.max(1, Math.min(100, Number(ev.target.value) || 1)))} /></label>
                      </span>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${m?.name ?? e.id} from your plan`} onClick={() => drop(e.id)}>Remove</Button>
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="wl-builder-acts">
              <Button type="submit" variant="accent" disabled={!canSave} state={save.isPending ? 'loading' : undefined} loadingLabel="Saving…">
                {draft.id ? 'Save changes' : 'Save plan'}
              </Button>
              {save.isSuccess && !save.isPending && <SavedMark />}
              {(count(draft) > 0 || draft.id || draft.name) && (
                <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY); save.reset(); }}>{draft.id ? 'Cancel' : 'Clear'}</Button>
              )}
            </div>
            <p className="muted wl-hint">
              {count(draft)} {count(draft) === 1 ? 'movement' : 'movements'}
              {draft.kind === 'week' ? ` over ${daysOut().length} ${daysOut().length === 1 ? 'day' : 'days'}` : ''}
              {' · '}up to {data.plansCap} plans saved
            </p>
            {save.isError && <p role="alert" className="wl-alert">That didn&rsquo;t save — your plan is still here. {(save.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Try again in a moment.'}</p>}
          </form>

          <section className="card wl-plans" aria-labelledby="wl-plans-h">
            <h2 id="wl-plans-h" className="wl-h2">Saved plans</h2>
            {plans.isLoading && <Spinner label="Reading your plans…" />}
            {plans.isError && <p className="muted">Your plans didn&rsquo;t load. They are still there.</p>}
            {plans.data && plans.data.plans.length === 0 && <p className="muted wl-empty">Nothing saved yet. Your first plan appears here the moment you save it.</p>}
            {plans.data && plans.data.plans.length > 0 && (
              <ul className="wl-plan-shelf">
                {plans.data.plans.map((p) => {
                  const n = p.days.reduce((s, d) => s + d.exercises.length, 0);
                  const isOpen = openPlan === p.id;
                  return (
                    <li key={p.id}>
                      <Fold face="wl-lid" panel="wl-plan-open" open={isOpen} onOpenChange={(o) => setOpenPlan(o ? p.id : null)}
                        title={<span className="wl-nm">{p.name}</span>}
                        meta={<span className="wl-mu">{p.kind === 'day' ? 'A day' : `A week · ${p.days.length} ${p.days.length === 1 ? 'day' : 'days'}`} · {n} {n === 1 ? 'movement' : 'movements'} · {p.updatedAt.slice(0, 10)}</span>}
                        action={
                          <span className="wl-acts">
                            <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${p.name}`} onClick={() => edit(p)}>Edit</Button>
                            {confirming === p.id ? (
                              <>
                                <Button type="button" variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(p.id, { onSuccess: () => { setConfirming(null); if (draft.id === p.id) setDraft(EMPTY); } })}>
                                  {remove.isPending ? 'Removing…' : 'Remove it'}
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(null)}>Keep</Button>
                              </>
                            ) : (
                              <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${p.name}`} onClick={() => setConfirming(p.id)}>Remove</Button>
                            )}
                          </span>
                        }>
                        {p.days.map((d) => (
                          <div key={d.day} className="wl-plan-day">
                            {p.kind === 'week' && <div className="eyebrow">{WEEKDAY_NAMES[d.day]}</div>}
                            <ul className="wl-plan-list wl-plan-read">
                              {d.exercises.map((e) => {
                                const m = byId.get(e.id);
                                return (
                                  <li key={e.id}>
                                    <span className="wl-w">
                                      <span className="wl-nm">{m?.name ?? e.id}</span>
                                      {m && <span className="wl-mu">{m.partLabel} · {m.equipment}</span>}
                                    </span>
                                    <span className="wl-tg">{e.sets} × {e.reps}</span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </Fold>
                    </li>
                  );
                })}
              </ul>
            )}
            {remove.isError && <p role="alert" className="wl-alert">That didn&rsquo;t reach us — the plan is still saved.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

/**
 * HOW IT IS DONE, AND THE SPACE FOR THE FILM. Read when the card opens. The
 * animation is the dataset's (© Gym visual, at the 180×180 its terms allow);
 * the film is the city's own where one has been shot, and an empty slot
 * where it has not — never a borrowed clip of a different movement.
 */
function HowTo({ id }: { id: string }) {
  const how = useMovementHowTo(id);
  if (how.isLoading) return <div className="wl-how"><Spinner label="Reading how it is done…" /></div>;
  if (how.isError || !how.data) return <div className="wl-how"><p className="muted">The instructions didn&rsquo;t load. Try again in a moment.</p></div>;
  const m = how.data;
  return (
    <div className="wl-how">
      <div className="wl-how-media">
        <div className="wl-film">
          {m.film ? (
            <video className="wl-film-v" src={m.film} controls playsInline preload="metadata" aria-label={`${m.name} — the city's film`} />
          ) : (
            <div className="wl-film-wait">
              <span className="eyebrow">Film</span>
              <span>The city&rsquo;s film of this movement is on its way.</span>
            </div>
          )}
        </div>
        {m.gif && (
          <figure className="wl-gif">
            <img src={m.gif} alt={`${m.name}, animated`} width={180} height={180} loading="lazy" />
            <figcaption className="muted">{EXERCISE_MEDIA_ATTRIBUTION}</figcaption>
          </figure>
        )}
      </div>
      <div className="wl-how-words">
        <div className="eyebrow">How it is done</div>
        {m.steps.length > 0 ? (
          <ol className="wl-steps">{m.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        ) : (
          <p className="muted">The catalogue carries no steps for this one.</p>
        )}
        <p className="muted wl-works">
          Works <strong>{m.target}</strong>{m.secondary.length > 0 ? ` with ${m.secondary.join(', ')}` : ''} · {m.equipment} · {LEVEL_LABEL[m.level]}
        </p>
      </div>
    </div>
  );
}
