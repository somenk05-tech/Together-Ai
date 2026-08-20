/**
 * ── HEALTH & WELLNESS ───────────────────────────────────────────────────────
 *
 * Friendly, not clinical — which in practice means it is a diary and a set of
 * reminders, not a chart of vitals. Nine strands from the brief, one timeline,
 * and a weight trace that reads against the goal on the profile rather than
 * against a population curve.
 *
 * NOTHING HERE INTERPRETS. A weight going up prints as a weight going up. The
 * hub does not tell an owner their dog is obese; it tells them what they logged
 * and what their vet asked them to hit.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Empty } from '../components/States';
import { Bar } from '../components/Meters';
import { SectionTitle } from './PetsHome';
import { newEntryId, usePets } from '../store';
import { bodyConditionRead, energyFor, readAge } from '../engine/nutrition';
import type { WellnessEntry } from '../types';

const KINDS: { key: WellnessEntry['kind']; label: string; glyph: string }[] = [
  { key: 'weight', label: 'Weight', glyph: '⚖️' },
  { key: 'vaccination', label: 'Vaccination', glyph: '💉' },
  { key: 'grooming', label: 'Grooming', glyph: '✂️' },
  { key: 'dental', label: 'Dental', glyph: '🦷' },
  { key: 'parasite', label: 'Tick & flea', glyph: '🐛' },
  { key: 'medication', label: 'Medication', glyph: '💊' },
  { key: 'vet-visit', label: 'Vet visit', glyph: '🩺' },
];

export function Wellness() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const wellness = usePets((s) => s.wellness);
  const addWellness = usePets((s) => s.addWellness);
  const toggleWellness = usePets((s) => s.toggleWellness);
  const [kind, setKind] = useState<WellnessEntry['kind']>('vaccination');
  const [label, setLabel] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const pet = pets.find((p) => p.id === activePetId) ?? null;
  if (!pet) {
    return <Empty glyph="❤️" title="No pet selected" line="Wellness tracking follows the selected pet." action={<button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')}>Add a pet</button>} />;
  }

  const entries = wellness.filter((w) => w.petId === pet.id).sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = entries.filter((e) => !e.done && e.date >= new Date().toISOString().slice(0, 10));
  const bcs = bodyConditionRead(pet);
  const energy = energyFor(pet);
  const age = readAge(pet);

  const toGoal = pet.targetWeightKg && pet.weightKg
    ? Math.max(0, Math.min(100, 100 - (Math.abs(pet.weightKg - pet.targetWeightKg) / pet.weightKg) * 100 * 4))
    : 100;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <SectionTitle title={`${pet.name}’s wellbeing`} line={`${pet.breed} · ${age.label} · ${pet.weightKg} kg${pet.targetWeightKg ? ` · goal ${pet.targetWeightKg} kg` : ''}`} />

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))' }}>
        <section className="card" style={{ padding: 18, display: 'grid', gap: 12 }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Weight</span>
          <strong style={{ fontSize: 30, fontWeight: 300, letterSpacing: '-.02em' }}>{pet.weightKg} kg</strong>
          <Bar value={toGoal} tone={bcs.tone} label="Distance from goal weight" right={pet.targetWeightKg ? `${pet.targetWeightKg} kg goal` : 'no goal set'} />
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>{bcs.note}</p>
        </section>

        <section className="card" style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start' }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Feeding schedule</span>
          <strong style={{ fontSize: 22, fontWeight: 700 }}>{energy.merKcal} kcal a day</strong>
          <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.6 }}>
            {pet.dietStyle === 'commercial' ? 'Complete and balanced food' : pet.dietStyle === 'mixed' ? 'Complete food with home-cooked meals' : 'Home-cooked, complementary'}
            {pet.currentFood ? ` · ${pet.currentFood}` : ''}
          </p>
          <button type="button" className="btn btn-sm btn-line" style={{ justifySelf: 'start' }} onClick={() => nav('/pets/today')}>Today’s meals →</button>
        </section>

        <section className="card" style={{ padding: 18, display: 'grid', gap: 8, alignContent: 'start' }}>
          <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Coming up</span>
          {upcoming.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Nothing scheduled. Add a reminder below.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 7 }}>
              {upcoming.slice(0, 4).map((e) => (
                <li key={e.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span>{KINDS.find((k) => k.key === e.kind)?.glyph} {e.label}</span>
                  <span className="muted">{new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section style={{ display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>The record</h3>
        {entries.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Nothing logged yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
            {entries.map((e) => (
              <li key={e.id} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--line)' }}>
                <input type="checkbox" checked={e.done} onChange={() => toggleWellness(e.id)} aria-label={`Mark ${e.label} done`} style={{ width: 17, height: 17, accentColor: 'var(--accent)' }} />
                <span aria-hidden style={{ fontSize: 15 }}>{KINDS.find((k) => k.key === e.kind)?.glyph}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, opacity: e.done ? 0.55 : 1 }}>{e.label}</span>
                <span className="muted" style={{ fontSize: 12 }}>{e.value}</span>
                <span className="muted" style={{ fontSize: 12, minWidth: 74, textAlign: 'right' }}>
                  {new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form
        className="card"
        style={{ padding: 16, display: 'grid', gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          addWellness({ id: newEntryId('w'), petId: pet.id, kind, date, label: label.trim(), value: 'Scheduled', done: false });
          setLabel('');
        }}
      >
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase' }}>Add a reminder</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              aria-pressed={kind === k.key}
              style={{
                font: 'inherit', fontSize: 12, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                border: `1px solid ${kind === k.key ? 'var(--accent-line)' : 'var(--line)'}`,
                background: kind === k.key ? 'var(--accent-soft)' : 'var(--card)',
                color: kind === k.key ? 'var(--accent-ink)' : 'var(--ink-soft)',
              }}
            >
              {k.glyph} {k.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What is it?" style={{ font: 'inherit', fontSize: 13.5, padding: '9px 12px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--card)', flex: '1 1 200px' }} />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ font: 'inherit', fontSize: 13.5, padding: '9px 12px', borderRadius: 'var(--r-2)', border: '1px solid var(--line)', background: 'var(--card)' }} />
          <button type="submit" className="btn btn-sm btn-line">Add</button>
        </div>
      </form>
    </div>
  );
}
