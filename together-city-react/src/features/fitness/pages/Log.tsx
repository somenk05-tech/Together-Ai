import { useState, type FormEvent } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useFitnessLog, useAddWorkout, type Intensity } from '../api';

const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];
const color: Record<string, string> = { light: 'var(--ok-ink)', moderate: 'var(--warn-ink)', vigorous: 'var(--danger-ink)' };

/** Activity Log — what you actually did this week. */
export function Log() {
  const log = useFitnessLog();
  const add = useAddWorkout();
  const [focus, setFocus] = useState('');
  const [minutes, setMinutes] = useState(30);
  const [intensity, setIntensity] = useState<Intensity>('moderate');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!focus.trim()) return;
    add.mutate({ focus: focus.trim(), minutes, intensity }, { onSuccess: () => setFocus('') });
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
          <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, (log.data.weekMinutes / 150) * 100)}%`, background: 'var(--accent)' }} />
          </div>
        </div>
      </div>

      <form onSubmit={submit} className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow">Log a workout</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
          <input value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="What did you do? (e.g. Tempo run)"
            style={{ flex: 1, minWidth: 180, padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          <input type="number" aria-label="Minutes" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}
            style={{ width: 76, padding: '10px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 14, fontFamily: 'inherit' }} />
          <span className="muted" style={{ fontSize: 12.5 }}>min</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
          {INTENSITIES.map((i) => (
            <button key={i} type="button" onClick={() => setIntensity(i)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', textTransform: 'capitalize',
                border: `1.5px solid ${intensity === i ? color[i] : 'var(--line)'}`, background: intensity === i ? color[i] : 'transparent', color: intensity === i ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {i}
            </button>
          ))}
          <Button type="submit" variant="accent" size="sm" disabled={add.isPending || !focus.trim()} >{add.isPending ? 'Adding…' : 'Add'}</Button>
        </div>
      </form>

      {log.data.entries.length === 0 ? (
        <EmptyState icon="📋" title="No workouts logged yet" hint="Log your first session above — or finish one in Trainer Mode." />
      ) : (
        <div className="card">
          {log.data.entries.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.focus}</div>
                {e.note && <div className="muted" style={{ fontSize: 12 }}>{e.note}</div>}
              </div>
              <span className="muted" style={{ fontSize: 12.5 }}>{e.minutes}m</span>
              <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', color: color[e.intensity], border: `1px solid ${color[e.intensity]}`, borderRadius: 999, padding: '1px 8px' }}>{e.intensity}</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{e.doneAt.slice(0, 10)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
