import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { useBloodPanel, useSaveBlood } from '../hooks';
import type { Citation } from '../api';

const FIELDS: { key: string; label: string; unit: string; placeholder: string }[] = [
  { key: 'hb', label: 'Hemoglobin', unit: 'g/dL', placeholder: '14.2' },
  { key: 'ferritin', label: 'Ferritin', unit: 'ng/mL', placeholder: '85' },
  { key: 'vitd', label: 'Vitamin D (25-OH)', unit: 'ng/mL', placeholder: '38' },
  { key: 'b12', label: 'Vitamin B12', unit: 'pg/mL', placeholder: '420' },
  { key: 'folate', label: 'Folate', unit: 'ng/mL', placeholder: '9' },
  { key: 'hba1c', label: 'HbA1c', unit: '%', placeholder: '5.3' },
  { key: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', placeholder: '92' },
  { key: 'trig', label: 'Triglycerides', unit: 'mg/dL', placeholder: '120' },
  { key: 'crp', label: 'CRP (inflammation)', unit: 'mg/L', placeholder: '2' },
];

const STATUS_STYLE = {
  low: { color: '#c62828', bg: '#ffebee', label: 'LOW' },
  high: { color: '#e65100', bg: '#fff3e0', label: 'HIGH' },
  normal: { color: '#2e7d32', bg: '#e8f5e9', label: 'NORMAL' },
} as const;

function Cites({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  if (!citations?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref}
          style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.03em', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 9px' }}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

/** Connect with Blood Test — evidence-based Nutrition↔Medical bridge (ESPEN + Krause). */
export function Blood() {
  const panel = useBloodPanel();
  const save = useSaveBlood();
  const [form, setForm] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) {
      const n = parseFloat(v);
      if (!Number.isNaN(n) && n >= 0) payload[k] = n;
    }
    if (Object.keys(payload).length) save.mutate(payload);
  };

  if (panel.isLoading) return <Spinner label="Reading your panel…" />;
  const data = panel.data;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 01</div>
      <h1 style={{ fontSize: 26 }}>Connect with Blood Test</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Personalise every plan by your real biology — not guesses. Synced automatically with your <strong>Medical Hub</strong>.
      </p>

      <div className="card" style={{ marginTop: 14 }}>
        <p style={{ fontSize: 13.5, margin: 0, lineHeight: 1.6 }}>
          All medical records live in your <strong>Medical Hub</strong> — the single source of truth. Nutrition links a
          report <strong>by reference</strong> (never a duplicate) and reads your biomarkers to personalise every plan.
        </p>
      </div>

      {/* Three ways to bring a blood test in — all handled by the Medical Hub */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 14 }}>
        {[
          { icon: '🔗', title: 'Connect existing blood test', desc: 'Pick a report already stored in your Medical Hub — we link it, no re-upload.', cta: 'Connect existing →', to: '/medical/records' },
          { icon: '⬆️', title: 'Upload new blood test', desc: 'Uploads happen in the Medical Hub. We’ll bring you straight back here.', cta: 'Upload in Medical Hub →', to: '/medical/records' },
          { icon: '🧪', title: 'Book a blood test', desc: 'Booking, payment, scheduling & results all live in the Medical Hub.', cta: 'Book in Medical Hub →', to: '/medical/booking' },
        ].map((c) => (
          <div key={c.title} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 22 }}>{c.icon}</div>
            <strong style={{ fontSize: 14.5 }}>{c.title}</strong>
            <p className="muted" style={{ fontSize: 12.5, margin: 0, flex: 1, lineHeight: 1.5 }}>{c.desc}</p>
            <Link to={c.to} style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>{c.cta}</Link>
          </div>
        ))}
      </div>

      {/* Getting ready — Do's & Don'ts */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Getting ready — Do’s &amp; Don’ts</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#2e7d32', marginBottom: 6 }}>✓ Do</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li>Fast 10–12 hours before collection</li>
              <li>Drink plenty of water</li>
              <li>Avoid heavy exercise the day before</li>
            </ul>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, color: '#c62828', marginBottom: 6 }}>✕ Don’t</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
              <li>No smoking on collection morning</li>
              <li>No alcohol for 24 hours prior</li>
              <li>No unsupervised supplements before the draw</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Supported labs */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Supported labs — home collection network</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
          {['Dr Lal PathLabs', 'Metropolis', 'Thyrocare', 'SRL Diagnostics'].map((lab) => (
            <span key={lab} style={{ fontSize: 13, fontWeight: 600, border: '1.5px solid var(--line)', borderRadius: 999, padding: '5px 14px' }}>{lab}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {['NABL Accredited', 'Home Collection', '24–48h Results', 'Synced with Medical Hub'].map((b) => (
            <span key={b} className="muted" style={{ fontSize: 12 }}>◈ {b}</span>
          ))}
        </div>
      </div>

      {/* Critical "seek medical care" alerts */}
      {data && data.alerts.length > 0 && (
        <div style={{ marginTop: 18 }}>
          {data.alerts.map((a) => (
            <div key={a.key + a.value}
              style={{
                display: 'flex', gap: 12, alignItems: 'flex-start', padding: '14px 16px', borderRadius: 14, marginBottom: 10,
                background: a.urgent ? '#fdecea' : '#fff3e0',
                border: `1.5px solid ${a.urgent ? '#c62828' : '#e65100'}`,
              }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{a.urgent ? '🚑' : '⚠️'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: a.urgent ? '#c62828' : '#e65100' }}>
                  {a.urgent ? 'Seek medical care' : 'Please see a doctor'} · {a.label} {a.value}
                </div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Enter your markers</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 14px' }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <span style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '12px 0 5px' }}>
                {f.label} <span style={{ fontWeight: 400 }}>({f.unit})</span>
              </span>
              <input
                type="number" step="0.1" min="0" placeholder={f.placeholder}
                value={form[f.key] ?? ''}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 16 }}>
          <Button type="submit" variant="accent" disabled={save.isPending}>
            {save.isPending ? 'Analysing…' : 'Save & analyse'}
          </Button>
        </div>
      </form>

      {(data?.markers.length ?? 0) > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">Your panel</div>
          {data?.markers.map((m) => {
            const s = STATUS_STYLE[m.status];
            return (
              <div key={m.key} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 14 }}>{m.label}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{m.value} {m.unit} · ref {m.range}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', borderRadius: 999, padding: '3px 12px', background: s.bg, color: s.color }}>
                    {s.label}
                  </span>
                </div>
                {m.advice && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 0' }}>{m.advice}</p>}
                {m.caveat && (
                  <p style={{ fontSize: 12.5, margin: '6px 0 0', padding: '8px 10px', background: '#fff8e1', borderLeft: '3px solid #f9a825', borderRadius: 6 }}>
                    ⓘ {m.caveat}
                  </p>
                )}
                <Cites citations={m.citations} />
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Link to="/nutrition/supplements"><Button variant="accent" size="sm">See matched supplements</Button></Link>
            <Link to="/nutrition/weekly"><Button variant="line" size="sm">Regenerate meal plan</Button></Link>
          </div>
        </div>
      )}

      {/* Condition-level guidance */}
      {data && data.conditions.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Personalised nutrition guidance</div>
          {data.conditions.map((c) => (
            <div key={c.key} className="card" style={{ marginBottom: 12 }}>
              <h3 style={{ fontSize: 15.5 }}>{c.name}</h3>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.55 }}>
                {c.principles.map((p, i) => <li key={i} style={{ marginBottom: 4 }}>{p}</li>)}
              </ul>
              <Cites citations={c.citations} />
            </div>
          ))}
        </div>
      )}

      {data && (
        <p className="muted" style={{ fontSize: 11.5, marginTop: 16, lineHeight: 1.5 }}>
          {data.disclaimer}
        </p>
      )}
    </div>
  );
}
