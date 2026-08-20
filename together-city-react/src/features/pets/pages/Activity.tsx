/**
 * ── ACTIVITY ────────────────────────────────────────────────────────────────
 *
 * Rings, not charts — the brief's instruction and the right one. What is
 * charted is minutes, because minutes are what an owner can log honestly from
 * memory at the end of the day. Calories burned by a dog on a walk is a number
 * this hub does not have a source for, so it is not shown; the daily goal is a
 * species-level guide, and it says so.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { Ring } from '../components/Meters';
import { SectionTitle } from './PetsHome';
import { newEntryId, usePets } from '../store';
import type { ActivityEntry } from '../types';

const KINDS: { key: ActivityEntry['kind']; label: string; glyph: string }[] = [
  { key: 'walk', label: 'Walk', glyph: '🦮' },
  { key: 'play', label: 'Play', glyph: '🎾' },
  { key: 'training', label: 'Training', glyph: '🎓' },
  { key: 'run', label: 'Run', glyph: '🏃' },
];

export function Activity() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const activity = usePets((s) => s.activity);
  const addActivity = usePets((s) => s.addActivity);
  const [kind, setKind] = useState<ActivityEntry['kind']>('walk');
  const [minutes, setMinutes] = useState(20);

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  if (!pet) {
    return <Empty glyph="🐕" title="No pet selected" line="Activity is logged per pet." action={<button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')}>Add a pet</button>} />;
  }

  const today = new Date().toISOString().slice(0, 10);
  const mine = activity.filter((a) => a.petId === pet.id);
  const todays = mine.filter((a) => a.date === today);
  const todayMinutes = todays.reduce((n, a) => n + a.minutes, 0);
  const goal = pet.species === 'dog' ? (pet.activity === 'high' ? 90 : pet.activity === 'low' ? 30 : 60) : 30;

  const week = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const iso = d.toISOString().slice(0, 10);
    return { iso, day: d.toLocaleDateString('en-IN', { weekday: 'narrow' }), minutes: mine.filter((a) => a.date === iso).reduce((n, a) => n + a.minutes, 0) };
  });
  const weekTotal = week.reduce((n, d) => n + d.minutes, 0);
  const peak = Math.max(goal, ...week.map((d) => d.minutes));

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle title={`${pet.name}’s activity`} line={`A ${goal}-minute daily guide for a ${pet.activity}-activity ${pet.species}. Guides, not prescriptions — your vet knows the joints.`} />

      <div style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', alignItems: 'center' }}>
        <div className="card" style={{ padding: 22, display: 'grid', placeItems: 'center', gap: 12 }}>
          <Ring value={todayMinutes} max={goal} label="min" caption={todayMinutes >= goal ? 'Goal met — nice one' : `${goal - todayMinutes} minutes to go`} size={140} />
        </div>

        <div className="card" style={{ padding: 22, display: 'grid', gap: 14 }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>This week · {weekTotal} minutes</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
            {week.map((d) => (
              <div key={d.iso} style={{ flex: 1, display: 'grid', gap: 6, justifyItems: 'center' }}>
                <div
                  style={{
                    width: '100%', borderRadius: 'var(--r-1)',
                    height: `${Math.max(4, (d.minutes / peak) * 92)}px`,
                    background: d.minutes >= goal ? 'var(--ok-ink)' : d.minutes > 0 ? 'var(--accent)' : 'var(--line)',
                    transition: 'height var(--dur-slow) var(--ease)',
                  }}
                  title={`${d.minutes} minutes`}
                />
                <span className="muted" style={{ fontSize: 10.5 }}>{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: 22, display: 'grid', gap: 10, alignContent: 'start' }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Today’s sessions</span>
          {todays.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Nothing logged yet today.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
              {todays.map((a) => (
                <li key={a.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{KINDS.find((k) => k.key === a.kind)?.glyph} {KINDS.find((k) => k.key === a.kind)?.label}</span>
                  <strong>{a.minutes} min</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <form
        className="card"
        style={{ padding: 18, display: 'grid', gap: 14 }}
        onSubmit={(e) => { e.preventDefault(); addActivity({ id: newEntryId('a'), petId: pet.id, date: today, kind, minutes }); }}
      >
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Log a session</span>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              style={{
                font: 'inherit', fontSize: 13, padding: '9px 16px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${kind === k.key ? 'var(--accent-line)' : 'var(--line)'}`,
                background: kind === k.key ? 'var(--accent-soft)' : 'var(--card)',
                color: kind === k.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
              }}
            >
              {k.glyph} {k.label}
            </button>
          ))}
        </div>
        <label style={{ display: 'grid', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>{minutes} minutes</span>
          <input type="range" min={5} max={120} step={5} value={minutes} onChange={(e) => setMinutes(parseInt(e.target.value, 10))} style={{ accentColor: 'var(--accent)' }} />
        </label>
        <button type="submit" className="btn btn-sm" style={{ justifySelf: 'start', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>Add session</button>
      </form>
    </div>
  );
}
