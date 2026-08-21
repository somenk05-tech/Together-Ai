import { useState, type FormEvent } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useFitnessLog, useAddWorkout, useEditWorkout, useRemoveWorkout,
  WORKOUT_STYLES, type Intensity, type WorkoutEntry, type WorkoutStyle,
} from '../api';

const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];
const color: Record<string, string> = { light: 'var(--ok-ink)', moderate: 'var(--warn-ink)', vigorous: 'var(--danger-ink)' };

/** The five the owner named, in the words a citizen would use for them. */
const STYLE_LABEL: Record<WorkoutStyle, string> = {
  home: 'Home', gym: 'Gym', sports: 'Sports', studio: 'Studio', outdoor: 'Outdoor',
};

/** One chip shape for the intensities and the styles both — they are the same
 *  control doing the same job, and two shapes for it would be two things to
 *  learn on one small form. */
function Chip({ on, label, onClick, tone }: { on: boolean; label: string; onClick: () => void; tone?: string }) {
  const ink = tone ?? 'var(--ink)';
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      style={{
        cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600,
        // 44, NOT THE 32 THIS SHIPPED WITH FIRST. a11y-audit caught it and was
        // right to: it flags a stated height under 44 unless the control also
        // states a width above it, "because a control in a dense row may
        // legitimately be short when it is wide". These state neither. The
        // three buttons this Chip replaced were about 29px tall with no number
        // on them at all, which is the only reason nothing had ever said so —
        // the row was already too small and this change made it legible.
        // 44 is what the hub chips and the sidebar's search button already
        // state, so it is the house answer rather than a new one.
        fontFamily: 'inherit', minHeight: 44,
        border: `1.5px solid ${on ? ink : 'var(--line)'}`,
        background: on ? ink : 'transparent',
        color: on ? 'var(--on-accent)' : 'var(--ink-soft)',
      }}>
      {label}
    </button>
  );
}

/**
 * ── ONE ROW, AND IT IS ITS OWNER'S TO CHANGE ────────────────────────────────
 *
 * The owner, 17 Aug: "let user add details of workout style home gym sports and
 * the duration". The style is the new fact; the edit and the remove are the
 * other half of the same request — before this, a mistyped 300-minute session
 * was in the week's total forever, and the only way out was the database.
 *
 * EDIT IS THE SAME FORM AS THE ONE ABOVE, in the row. A separate modal with a
 * second set of controls is a second place for the two to drift apart.
 *
 * REMOVE ASKS ONCE, IN PLACE. Not a browser dialog — those stop the page — and
 * not a one-tap delete either, because this list is the only record there is of
 * what somebody actually did.
 */
function Row({ e }: { e: WorkoutEntry }) {
  const edit = useEditWorkout();
  const remove = useRemoveWorkout();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [focus, setFocus] = useState(e.focus);
  const [minutes, setMinutes] = useState(e.minutes);
  const [intensity, setIntensity] = useState<Intensity>(e.intensity);
  const [style, setStyle] = useState<WorkoutStyle | null>(e.style);

  const cancel = () => {
    setOpen(false);
    setFocus(e.focus); setMinutes(e.minutes); setIntensity(e.intensity); setStyle(e.style);
  };
  const save = () => {
    if (!focus.trim()) return;
    edit.mutate(
      { id: e.id, focus: focus.trim(), minutes, intensity, ...(style ? { style } : {}) },
      { onSuccess: () => setOpen(false) },
    );
  };

  if (open) {
    return (
      <div style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={focus} onChange={(ev) => setFocus(ev.target.value)} aria-label="What you did"
            style={{ flex: 1, minWidth: 180, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit' }} />
          <input type="number" aria-label="Minutes" min={1} max={600} value={minutes} onChange={(ev) => setMinutes(Number(ev.target.value))}
            style={{ width: 76, padding: '10px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit' }} />
          <span className="muted" style={{ fontSize: 12.5 }}>min</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {WORKOUT_STYLES.map((s) => (
            <Chip key={s} label={STYLE_LABEL[s]} on={style === s} onClick={() => setStyle(style === s ? null : s)} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {INTENSITIES.map((i) => (
            <Chip key={i} label={i[0].toUpperCase() + i.slice(1)} on={intensity === i} onClick={() => setIntensity(i)} tone={color[i]} />
          ))}
          <Button type="button" variant="accent" size="sm" onClick={save} disabled={edit.isPending || !focus.trim()}>
            {edit.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={cancel}>Cancel</Button>
        </div>
        {edit.isError && <div style={{ color: 'var(--danger-ink)', fontSize: 12, marginTop: 8 }}>That didn’t save. Nothing was changed.</div>}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
      <div style={{ flex: 1, minWidth: 150 }}>
        <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.focus}</div>
        {e.note && <div className="muted" style={{ fontSize: 12 }}>{e.note}</div>}
      </div>
      {/* An unasked question prints as nothing at all. A row that says "Home"
          because nobody chose is a row that invented a fact. */}
      {e.style && (
        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--ink-soft)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '1px 8px' }}>
          {STYLE_LABEL[e.style]}
        </span>
      )}
      <span className="muted" style={{ fontSize: 12.5 }}>{e.minutes}m</span>
      <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: color[e.intensity], border: `1px solid ${color[e.intensity]}`, borderRadius: 'var(--r-full)', padding: '1px 8px' }}>{e.intensity}</span>
      <span className="muted" style={{ fontSize: 11.5 }}>{e.doneAt.slice(0, 10)}</span>
      <Button type="button" variant="ghost" size="sm" aria-label={`Edit ${e.focus}`} onClick={() => setOpen(true)}>Edit</Button>
      {confirming ? (
        <>
          <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${e.focus}`}
            onClick={() => remove.mutate(e.id)} disabled={remove.isPending}>
            {remove.isPending ? 'Removing…' : 'Remove it'}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>Keep</Button>
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${e.focus}`} onClick={() => setConfirming(true)}>Remove</Button>
      )}
    </div>
  );
}

/** Activity Log — what you actually did this week. */
export function Log() {
  const log = useFitnessLog();
  const add = useAddWorkout();
  const [focus, setFocus] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<Intensity>('moderate');
  const [style, setStyle] = useState<WorkoutStyle | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!focus.trim()) return;
    add.mutate(
      { focus: focus.trim(), minutes, intensity, ...(style ? { style } : {}) },
      { onSuccess: () => setFocus('') },
    );
  };

  if (log.isLoading) return <Spinner label="Loading your log…" />;
  if (log.isError || !log.data) return <EmptyState title="Couldn't load your log" hint="Every workout you’ve recorded is still there — only the reading of it failed." />;

  return (
    <div>
      <div className="eyebrow">Fitness · Activity Log</div>
      <h1 style={{ fontSize: 26 }}>This week</h1>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 24 }}>
        <div><div className="eyebrow">Minutes</div><div style={{ fontWeight: 700, fontSize: 22 }}>{log.data.weekMinutes}</div><div className="muted" style={{ fontSize: 11.5 }}>of ~150 target</div></div>
        <div><div className="eyebrow">Sessions</div><div style={{ fontWeight: 700, fontSize: 22 }}>{log.data.weekSessions}</div></div>
        <div style={{ flex: 1, alignSelf: 'center' }}>
          <div style={{ height: 8, borderRadius: 'var(--r-full)', background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (log.data.weekMinutes / 150) * 100)}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Log a workout</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="What did you do? (e.g. Tempo run)"
            style={{ flex: 1, minWidth: 180, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit' }} />
          <input type="number" aria-label="Minutes" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
            style={{ width: 76, padding: '10px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit' }} />
          <span className="muted" style={{ fontSize: 12.5 }}>min</span>
        </div>
        {/* WHERE, AND IT IS ALLOWED TO BE UNANSWERED. Pressing the chip you are
            already on clears it, so "I would rather not say" stays reachable —
            a required field here would put a place on every past-shaped entry
            somebody logs in a hurry. */}
        <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend className="eyebrow" style={{ padding: 0, marginBottom: 8 }}>Where</legend>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {WORKOUT_STYLES.map((s) => (
              <Chip key={s} label={STYLE_LABEL[s]} on={style === s} onClick={() => setStyle(style === s ? null : s)} />
            ))}
          </div>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend className="eyebrow" style={{ padding: 0, marginBottom: 8 }}>How hard</legend>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {INTENSITIES.map((i) => (
              <Chip key={i} label={i[0].toUpperCase() + i.slice(1)} on={intensity === i} onClick={() => setIntensity(i)} tone={color[i]} />
            ))}
            <Button type="submit" variant="accent" size="sm" disabled={add.isPending || !focus.trim()}>{add.isPending ? 'Adding…' : 'Add'}</Button>
          </div>
        </fieldset>
      </form>

      {log.data.entries.length === 0 ? (
        <EmptyState icon="📋" title="No workouts logged yet" hint="Log your first session above — or finish one in Workout." />
      ) : (
        <div className="card">
          {log.data.entries.map((e) => <Row key={e.id} e={e} />)}
        </div>
      )}
    </div>
  );
}
