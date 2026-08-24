/**
 * ── WHAT DOES YOUR PET NEED? ────────────────────────────────────────────────
 *
 * Ten questions and a scorecard across eight dimensions. It ends in a page of
 * ACTIONS, not a page of products — the recommendations sit underneath, after
 * the reader has seen what the score actually says.
 *
 * A LOW SCORE IS NEVER A DIAGNOSIS. "Dental 35 — nothing on file" means nothing
 * is on file. The action line says book a check, because the honest answer to
 * an empty record is to go and find out.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar } from '../components/Meters';
import { Empty } from '../components/States';
import { SectionTitle } from './PetsHome';
import { usePets } from '../store';
import { scoreTone, scorecard } from '../engine/scorecard';
import { recommendFor } from '../engine/recommend';
import { rupees } from '../engine/format';
import { fullName } from '../engine/naming';
import { PackShot } from '../components/PackShot';

export function Quiz() {
  const nav = useNavigate();
  const pets = usePets((s) => s.pets);
  const activePetId = usePets((s) => s.activePetId);
  const activity = usePets((s) => s.activity);
  const pet = pets.find((p) => p.id === activePetId) ?? null;

  const today = new Date().toISOString().slice(0, 10);
  const logged = activity.filter((a) => a.petId === pet?.id && a.date === today).reduce((n, a) => n + a.minutes, 0);

  const [answers, setAnswers] = useState({ groomedRecently: false, dentalRoutine: false, enrichment: false });
  const [done, setDone] = useState(false);

  if (!pet) {
    return <Empty glyph="🧭" title="No pet selected" line="The scorecard is built from a pet’s profile." action={<button type="button" className="btn" onClick={() => nav('/pets/profiles?new=1')}>Add a pet</button>} />;
  }

  const rows = scorecard(pet, { activityMinutes: logged, ...answers });
  const overall = Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length);

  if (!done) {
    return (
      <div style={{ display: 'grid', gap: 22, maxWidth: 720 }}>
        <SectionTitle title="What does your pet need?" line="Three questions the profile can’t answer. The rest we already know." />
        <div className="card" style={{ padding: 22, display: 'grid', gap: 18 }}>
          <Toggle label={`Has ${pet.name} been groomed in the last month?`} value={answers.groomedRecently} onChange={(v) => setAnswers({ ...answers, groomedRecently: v })} />
          <Toggle label="Do you brush their teeth or use a dental routine?" value={answers.dentalRoutine} onChange={(v) => setAnswers({ ...answers, dentalRoutine: v })} />
          <Toggle label="Any puzzle feeders, training or nosework this week?" value={answers.enrichment} onChange={(v) => setAnswers({ ...answers, enrichment: v })} />
          <button type="button" className="btn" onClick={() => setDone(true)} style={{ justifySelf: 'start', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none' }}>
            See the scorecard
          </button>
        </div>
      </div>
    );
  }

  const weakest = rows.slice().sort((a, b) => a.score - b.score)[0];
  const recs = recommendFor(pet, weakest.key === 'nutrition' ? 'food' : weakest.key === 'dental' ? 'treats' : weakest.key === 'grooming' ? 'grooming' : weakest.key === 'enrichment' ? 'toys' : 'wellness', 3);

  return (
    <div style={{ display: 'grid', gap: 24, maxWidth: 860 }}>
      <header style={{ display: 'grid', gap: 6 }}>
        <span className="muted" style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.2em', textTransform: 'uppercase' }}>{pet.name}’s scorecard</span>
        <h2 style={{ margin: 0, fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 300, letterSpacing: '-.03em' }}>{overall} / 100</h2>
        <p className="muted" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, maxWidth: 560 }}>
          Scored from your profile and today’s logs. A prompt sheet, not a diagnosis — that’s your vet’s job.
        </p>
      </header>

      <div className="card" style={{ padding: 22, display: 'grid', gap: 18 }}>
        {rows.map((r) => (
          <div key={r.key} style={{ display: 'grid', gap: 6 }}>
            <Bar value={r.score} tone={scoreTone(r.score)} label={r.label} right={`${r.score}`} />
            <p className="muted" style={{ margin: 0, fontSize: 12, lineHeight: 1.55 }}>{r.note} <strong style={{ color: 'var(--ink-soft)' }}>{r.action}</strong></p>
          </div>
        ))}
      </div>

      {recs.length > 0 && (
        <section style={{ display: 'grid', gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Where {weakest.label.toLowerCase()} could start</h3>
          <div style={{ display: 'grid', gap: 10 }}>
            {recs.map((rec) => (
              <button
                key={rec.product.id}
                type="button"
                className="card"
                onClick={() => nav(`/pets/shop/${rec.product.id}`)}
                style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'center', textAlign: 'left', cursor: 'pointer', border: '1px solid var(--line)', font: 'inherit' }}
              >
                <span style={{ width: 46, flexShrink: 0 }}>
                  <PackShot src={rec.product.imageUrl} alt={rec.product.name} category={rec.product.category} height={46} drawnSize={34} />
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
                  <strong style={{ fontSize: 13.5 }}>{fullName(rec.product)}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{rec.reasons[0] ?? 'Suits this profile'}</span>
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {rec.product.priceFrom ? rupees(rec.product.priceFrom) : 'price n/v'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button type="button" className="btn btn-line" style={{ justifySelf: 'start' }} onClick={() => setDone(false)}>Answer again</button>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.5 }}>{label}</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {[true, false].map((v) => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            style={{
              font: 'inherit', fontSize: 13, fontWeight: value === v ? 700 : 500, padding: '8px 20px', borderRadius: 'var(--r-full)', cursor: 'pointer',
              border: `1px solid ${value === v ? 'var(--accent-line)' : 'var(--line)'}`,
              background: value === v ? 'var(--accent-soft)' : 'var(--card)',
              color: value === v ? 'var(--accent-ink)' : 'var(--ink-soft)',
            }}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}
