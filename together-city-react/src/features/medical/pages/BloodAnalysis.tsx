import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@/components/ui';
import { mediaApi } from '@/api/media.api';
import { useBloodHistory, useLatestPanel, useSaveBloodTest, medicalApi, type Citation } from '../api';

const FIELDS: { key: string; label: string; unit: string; ph: string }[] = [
  { key: 'hb', label: 'Hemoglobin', unit: 'g/dL', ph: '14.2' },
  { key: 'ferritin', label: 'Ferritin', unit: 'ng/mL', ph: '85' },
  { key: 'vitd', label: 'Vitamin D (25-OH)', unit: 'ng/mL', ph: '38' },
  { key: 'b12', label: 'Vitamin B12', unit: 'pg/mL', ph: '420' },
  { key: 'folate', label: 'Folate', unit: 'ng/mL', ph: '9' },
  { key: 'hba1c', label: 'HbA1c', unit: '%', ph: '5.3' },
  { key: 'ldl', label: 'LDL cholesterol', unit: 'mg/dL', ph: '92' },
  { key: 'trig', label: 'Triglycerides', unit: 'mg/dL', ph: '120' },
  { key: 'crp', label: 'CRP (inflammation)', unit: 'mg/L', ph: '2' },
];
const STATUS = {
  low: { color: '#c62828', bg: '#ffebee', label: 'LOW' },
  high: { color: '#e65100', bg: '#fff3e0', label: 'HIGH' },
  normal: { color: '#2e7d32', bg: '#e8f5e9', label: 'NORMAL' },
} as const;
const TREND = { up: '▲', down: '▼', flat: '▬' } as const;

function Cites({ citations }: { citations: Citation[] }) {
  return null; // guideline citations are backend-only, hidden from the user view
  if (!citations?.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {citations.map((c) => (
        <span key={c.id} title={c.ref} style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 9px' }}>{c.label}</span>
      ))}
    </div>
  );
}

/** Blood Test Analysis — Medical Hub owns the record; the cited engine reads it. */
export function BloodAnalysis() {
  const latest = useLatestPanel();
  const history = useBloodHistory();
  const save = useSaveBloodTest();
  const qc = useQueryClient();
  const [form, setForm] = useState<Record<string, string>>({});
  const [lab, setLab] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractNote, setExtractNote] = useState<string | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const [savedFile, setSavedFile] = useState<{ id: string; name: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const onFile = async (file: File | null) => {
    if (!file) return;
    setUploadErr(null); setExtractNote(null);
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(file.type)) { setUploadErr('Upload a JPG, PNG or PDF of your report.'); return; }
    if (file.size > 25 * 1024 * 1024) { setUploadErr('That file is over 25 MB — please upload a smaller scan.'); return; }
    setExtracting(true);
    try {
      const up = await mediaApi.uploadPrivate(file);
      const res = await medicalApi.extractBlood({ fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes, title: file.name });
      const next: Record<string, string> = { ...form };
      for (const [k, v] of Object.entries(res.extracted)) next[k] = String(v);
      setForm(next);
      if (res.lab) setLab(res.lab);
      setExtractNote(res.note);
      setSavedFile({ id: res.recordId, name: file.name });
      void qc.invalidateQueries({ queryKey: ['medical', 'storage'] });
      void qc.invalidateQueries({ queryKey: ['medical', 'records'] });
    } catch {
      setUploadErr('Could not upload the report. Please check your connection and try again.');
    } finally {
      setExtracting(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) values[k] = n; }
    if (Object.keys(values).length) save.mutate({ lab: lab || undefined, values }, {
      onSuccess: () => { setForm({}); setLab(''); setSavedFile(null); setExtractNote(null); setExpanded(false); },
    });
  };

  if (latest.isLoading) return <Spinner label="Opening your records…" />;
  const data = latest.data;
  const hasPanel = Boolean(data && data.markers.length);
  const showForm = !hasPanel || expanded; // collapse the upload + form once a panel is saved

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Blood Test Analysis</div>
      <h1 style={{ fontSize: 26 }}>Your blood work, decoded</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        The Medical Hub is your <strong>source of truth</strong> — panels are stored with dates so you see trends.
        Interpretation is grounded in established clinical-nutrition guidance; add CRP
        and we flag markers inflammation can distort. Not a diagnosis.
      </p>

      {data && data.alerts.length > 0 && (
        <div style={{ marginTop: 16 }}>
          {data.alerts.map((a) => (
            <div key={a.key + a.value} style={{ display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 14, marginBottom: 10, background: a.urgent ? '#fdecea' : '#fff3e0', border: `1.5px solid ${a.urgent ? '#c62828' : '#e65100'}` }}>
              <span style={{ fontSize: 20 }}>{a.urgent ? '🚑' : '⚠️'}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: a.urgent ? '#c62828' : '#e65100' }}>{a.urgent ? 'Seek medical care' : 'Please see a doctor'} · {a.label} {a.value}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{a.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
      <>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Upload your report — we read it for you</div>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
          Upload a photo or PDF of your blood report. The AI reads the values and fills the form below for you to check before saving — it extracts numbers only, never diagnoses.
        </p>
        <label style={{ display: 'block', border: '1.5px dashed var(--line)', borderRadius: 14, padding: '22px', textAlign: 'center', cursor: extracting ? 'default' : 'pointer', marginTop: 12 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} disabled={extracting}
            onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <div style={{ fontSize: 26 }}>{extracting ? '⏳' : '📄'}</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>{extracting ? 'Reading your report…' : 'Tap to upload a JPG, PNG or PDF'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Stored securely in your 10 GB health vault</div>
        </label>
        {extractNote && <p style={{ fontSize: 12.5, marginTop: 10, padding: '8px 10px', background: '#e8f5e9', borderRadius: 8 }}>✓ {extractNote}</p>}
        {uploadErr && <p style={{ fontSize: 12.5, marginTop: 10, color: '#c62828' }}>{uploadErr}</p>}
        {savedFile && (
          <p style={{ fontSize: 12.5, marginTop: 10, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
            📎 <b>{savedFile.name}</b> is saved in your <Link to="/medical/records" style={{ color: 'var(--accent)', fontWeight: 600 }}>Health Records</Link> — you can delete it there anytime.
          </p>
        )}
      </div>

      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Review &amp; save</div>
        <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Lab name (optional)"
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 4 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 14px' }}>
          {FIELDS.map((f) => (
            <div key={f.key}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '10px 0 4px' }}>{f.label} <span style={{ fontWeight: 400 }}>({f.unit})</span></span>
              <input type="number" step="0.1" min="0" placeholder={f.ph} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="submit" variant="accent" disabled={save.isPending}>{save.isPending ? 'Saving to your records…' : 'Save & analyse'}</Button>
        </div>
      </form>
      </>
      ) : (
        <div className="card" style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ margin: 0 }}>Panel saved &amp; analysed</div>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              Your latest panel is saved{data?.takenOn ? ` · ${data.takenOn}` : ''}. Your analysis is below — upload a new report anytime.
            </p>
          </div>
          <Button variant="line" size="sm" onClick={() => setExpanded(true)}>Upload a new report</Button>
        </div>
      )}

      {hasPanel && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <div className="eyebrow" style={{ margin: 0 }}>Latest panel</div>
            <span className="muted" style={{ fontSize: 12 }}>{data?.takenOn}{data?.lab ? ` · ${data.lab}` : ''}</span>
          </div>
          {data?.markers.map((m) => {
            const s = STATUS[m.status];
            return (
              <div key={m.key} style={{ padding: '12px 0', borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 14 }}>{m.label}</strong>
                  <span className="muted" style={{ fontSize: 12 }}>{m.value} {m.unit} · ref {m.range}</span>
                  {m.trend && m.previous != null && (
                    <span title={`was ${m.previous}`} style={{ fontSize: 11, color: m.trend === 'flat' ? 'var(--muted)' : (m.status === 'normal' ? '#2e7d32' : 'var(--accent)') }}>
                      {TREND[m.trend]} from {m.previous}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', borderRadius: 999, padding: '3px 12px', background: s.bg, color: s.color }}>{s.label}</span>
                </div>
                {m.advice && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '6px 0 0' }}>{m.advice}</p>}
                {m.caveat && <p style={{ fontSize: 12.5, margin: '6px 0 0', padding: '8px 10px', background: '#fff8e1', borderLeft: '3px solid #f9a825', borderRadius: 6 }}>ⓘ {m.caveat}</p>}
                <Cites citations={m.citations} />
              </div>
            );
          })}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <Link to="/medical/supplements"><Button variant="accent" size="sm">My supplement plan</Button></Link>
            <Link to="/nutrition/weekly"><Button variant="line" size="sm">Personalise my meals</Button></Link>
          </div>
          {data?.sharesWith && <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>🔒 {data.sharesWith}</p>}
        </div>
      )}

      {data && data.conditions.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="eyebrow" style={{ marginBottom: 8 }}>Nutrition guidance from this panel</div>
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

      {history.data && history.data.length > 1 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">History · {history.data.length} panels</div>
          {history.data.map((t) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
              <strong style={{ minWidth: 92 }}>{t.takenOn}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{t.lab ?? '—'} · {t.markerCount} markers</span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {t.flagged.length === 0
                  ? <span style={{ fontSize: 11, color: '#2e7d32' }}>all in range</span>
                  : t.flagged.map((f) => <span key={f.key} style={{ fontSize: 10.5, fontWeight: 600, color: '#c62828', background: '#ffebee', borderRadius: 999, padding: '1px 8px' }}>{f.label} {f.status}</span>)}
              </span>
            </div>
          ))}
        </div>
      )}

      {data?.disclaimer && <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>{data.disclaimer}</p>}
    </div>
  );
}
