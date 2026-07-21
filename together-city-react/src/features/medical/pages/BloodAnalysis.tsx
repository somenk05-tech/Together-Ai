import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useBloodHistory, useLatestPanel, useSaveBloodTest, useIngestBlood, useHealthSummary, useBloodTrends, type Citation, type TrendKind, type TrendPick } from '../api';

/** Deterministic 0–100 wellness score ring. */
function ScoreRing({ score, band }: { score: number; band: string }) {
  const hue = score >= 85 ? 145 : score >= 70 ? 90 : score >= 55 ? 45 : 8;
  return (
    <div style={{ width: 82, height: 82, borderRadius: '50%', flex: '0 0 auto', background: `conic-gradient(hsl(${hue} 60% 45%) ${score * 3.6}deg, var(--line) 0)`, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--card, #fff)', display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <b style={{ fontSize: 21, lineHeight: 1 }}>{score}</b>
          <div className="muted" style={{ fontSize: 9, letterSpacing: '.02em' }}>{band}</div>
        </div>
      </div>
    </div>
  );
}

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

const trendColor = (k: TrendKind) =>
  k === 'improving' || k === 'returned-normal' ? '#1b7a3a'
  : k === 'worsening' || k === 'newly-abnormal' ? '#c0392b' : 'var(--muted)';
const pointColor = (s: string) => (s === 'high' ? '#e65100' : s === 'low' ? '#c62828' : '#2e7d32');

/** Longitudinal trends — auto-shown once the user has 2+ saved panels. */
function TrendsSection() {
  const trends = useBloodTrends();
  const d = trends.data;
  if (!d || !d.hasTrends || !d.summary) return null;
  const s = d.summary;
  const chipRow = (title: string, items: TrendPick[], color: string) => items.length > 0 && (
    <div style={{ marginTop: 10 }}>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
        {items.map((m) => (
          <span key={m.key} style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '3px 10px', color, background: `${color}14` }}>
            {m.label} · {m.deltaLabel}
          </span>
        ))}
      </div>
    </div>
  );
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <div className="eyebrow">Your health over time · {d.testCount} panels</div>

      {/* Timeline of dated panels */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0 2px' }}>
        {d.timeline.map((t, i) => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: t.isLatest ? 700 : 500, padding: '4px 10px', borderRadius: 999, background: t.isLatest ? 'var(--accent-soft)' : 'var(--paper)', border: '1px solid var(--line)' }}>
              {t.takenOn}{t.isLatest ? ' · Latest' : ''}
            </span>
            {i < d.timeline.length - 1 && <span className="muted">→</span>}
          </span>
        ))}
      </div>

      {/* Executive summary */}
      <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '14px 0 0' }}>{s.narrative}</p>
      {chipRow('Biggest improvements', s.improvements, '#1b7a3a')}
      {chipRow('Needs focus', s.declines, '#c0392b')}
      {chipRow('Returned to normal', s.returnedToNormal, '#1b7a3a')}
      {chipRow('Newly out of range', s.newlyAbnormal, '#e65100')}
      {chipRow('Holding steady', s.stable, '#6b6b6b')}

      {/* Per-biomarker trend rows */}
      <div style={{ marginTop: 16 }}>
        <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Biomarker trends</div>
        {d.markers.map((m) => (
          <div key={m.key} style={{ padding: '11px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 13.5 }}>{m.label}</strong>
              <span className="muted" style={{ fontSize: 11.5 }}>ref {m.range} {m.unit}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: trendColor(m.trend) }}>
                {m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '▬'} {m.trendLabel} · {m.deltaLabel}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6, fontSize: 12 }}>
              {m.points.map((p, i) => (
                <span key={i}>
                  <span className="muted">{p.date.slice(5)}</span> <b style={{ color: pointColor(p.status) }}>{p.value}</b>{i < m.points.length - 1 ? <span className="muted"> →</span> : null}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>{d.disclaimer}</p>
    </div>
  );
}

/** Blood Test Analysis — Medical Hub owns the record; the cited engine reads it. */
export function BloodAnalysis() {
  const latest = useLatestPanel();
  const history = useBloodHistory();
  const summary = useHealthSummary();
  const save = useSaveBloodTest();
  const ingest = useIngestBlood();
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
    const okType = file.type.startsWith('image/') || file.type === 'application/pdf' || !file.type
      || /\.(jpe?g|png|webp|heic|heif|tiff?|pdf)$/i.test(file.name);
    if (!okType) { setUploadErr('Upload a photo (JPG, PNG, HEIC) or a PDF of your report.'); return; }
    if (file.size > 25 * 1024 * 1024) { setUploadErr('That file is over 25 MB — please upload a smaller scan.'); return; }
    setExtracting(true);
    // Step 1: send the file to the private vault (presign on our API → PUT to R2).
    let up: Awaited<ReturnType<typeof mediaApi.uploadPrivate>>;
    try {
      up = await mediaApi.uploadPrivate(file);
    } catch (e) {
      setUploadErr(uploadErrorMessage(e));
      setExtracting(false);
      return;
    }
    // Step 2: upload → auto-analyse in one call. The file is already safely filed,
    // so a read failure isn't fatal — the user just types the values in manually
    // (and the manual panel links back to this same record via recordId).
    try {
      const res = await ingest.mutateAsync({ fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes, title: file.name });
      const next: Record<string, string> = { ...form };
      for (const [k, v] of Object.entries(res.extracted)) next[k] = String(v);
      setForm(next);
      if (res.lab) setLab(res.lab);
      setExtractNote(res.note);
      setSavedFile({ id: res.recordId, name: file.name });
      // If it analysed automatically, collapse the manual form — the analysis is now shown above.
      if (res.bloodTestId) setExpanded(false);
    } catch {
      setExtractNote('Saved to your vault, but we couldn’t read the values automatically — please enter them from your report below.');
    } finally {
      setExtracting(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const values: Record<string, number> = {};
    for (const [k, v] of Object.entries(form)) { const n = parseFloat(v); if (!Number.isNaN(n) && n >= 0) values[k] = n; }
    // Pass recordId so a manual entry / correction updates the SAME uploaded
    // report's panel instead of creating a duplicate.
    if (Object.keys(values).length) save.mutate({ lab: lab || undefined, values, recordId: savedFile?.id }, {
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

      {summary.data?.hasPanel && (() => {
        const sum = summary.data;
        return (
          <div className="card" style={{ marginTop: 18 }}>
            <div className="eyebrow">Your health summary</div>
            {sum.greeting && <p style={{ fontSize: 15.5, fontWeight: 600, margin: '6px 0 0' }}>{sum.greeting}</p>}
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              {sum.score != null && sum.band && <ScoreRing score={sum.score} band={sum.band} />}
              <div style={{ flex: 1, minWidth: 220 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em' }}>Priority areas</div>
                {sum.priorities.length ? (
                  <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                    {sum.priorities.map((p, i) => <li key={i}>{p}</li>)}
                  </ol>
                ) : <p style={{ fontSize: 13, color: '#2e7d32', marginTop: 6 }}>No priority flags — every measured marker is in range.</p>}
              </div>
            </div>

            {sum.interpretation.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>What your results may mean</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>{sum.interpretation.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}</ul>
              </div>
            )}
            {sum.relationships.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>How they connect</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>{sum.relationships.map((t, i) => <li key={i} style={{ marginBottom: 4 }}>{t}</li>)}</ul>
              </div>
            )}
            {sum.discuss.length > 0 && (
              <p style={{ marginTop: 12, padding: '10px 12px', background: '#fff8e1', borderLeft: '3px solid #f9a825', borderRadius: 6, fontSize: 13 }}>
                <b>Worth discussing with your doctor:</b> {sum.discuss.join('; ')}.
              </p>
            )}
            {sum.encouragement && (
              <p style={{ marginTop: 14, padding: '12px 14px', background: 'var(--accent-soft)', borderRadius: 12, fontSize: 13.5, lineHeight: 1.6 }}>💛 {sum.encouragement}</p>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <Link to="/nutrition/weekly"><Button variant="accent" size="sm">Nutrition plan →</Button></Link>
              <Link to="/fitness"><Button variant="line" size="sm">Fitness plan →</Button></Link>
              <Link to="/beauty"><Button variant="line" size="sm">Skin plan →</Button></Link>
              <Link to="/medical/supplements"><Button variant="line" size="sm">Supplements →</Button></Link>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>{sum.disclaimer}{!sum.aiEnabled ? ' · AI interpretation off — showing rule-based guidance.' : ''}</p>
          </div>
        );
      })()}

      {/* Longitudinal trends — automatic once 2+ panels exist */}
      <TrendsSection />

      {showForm ? (
      <>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Upload your report — we read &amp; analyse it for you</div>
        <p className="muted" style={{ fontSize: 13, margin: '4px 0 0' }}>
          Upload a photo or PDF of your blood report. We read the values and analyse it automatically — no extra steps. The same report also appears in your <Link to="/medical/records" style={{ color: 'var(--accent)', fontWeight: 600 }}>Health Records</Link>. It extracts numbers only, never diagnoses; you can edit any reading below and re-analyse.
        </p>
        <label style={{ display: 'block', border: '1.5px dashed var(--line)', borderRadius: 14, padding: '22px', textAlign: 'center', cursor: extracting ? 'default' : 'pointer', marginTop: 12 }}>
          <input type="file" accept="image/*,.heic,.heif,.tiff,application/pdf" style={{ display: 'none' }} disabled={extracting}
            onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <div style={{ fontSize: 26 }}>{extracting ? '⏳' : '📄'}</div>
          <div style={{ fontWeight: 600, marginTop: 6 }}>{extracting ? 'Reading &amp; analysing your report…' : 'Tap to upload a photo or PDF'}</div>
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
