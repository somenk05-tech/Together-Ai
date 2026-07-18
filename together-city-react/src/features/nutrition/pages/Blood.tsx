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
      <div className="eyebrow">Nutrition Hub · Blood Test</div>
      <h1 style={{ fontSize: 26 }}>Connect with your blood test</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        Enter the key markers from your latest report — guidance is grounded in established clinical-nutrition science.
        Add CRP and we’ll flag markers that inflammation can distort. The <strong>Medical Hub</strong> stays the source of truth for your records.
      </p>

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
