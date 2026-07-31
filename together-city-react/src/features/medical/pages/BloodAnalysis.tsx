import { useState, useEffect, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { mediaApi, uploadErrorMessage } from '@/api/media.api';
import { useBloodHistory, useLatestPanel, useSaveBloodTest, useIngestBlood, useHealthSummary, useBloodTrends, useBiomarkerCatalog, useDeleteBloodTest, type BloodTestSummary, type Citation, type TrendKind, type TrendPick, type BiomarkerSection, type UnitChoice } from '../api';
import { PrivacyNote } from '@/features/privacy/PrivacyNote';
import { TrendSparkline } from '../components/TrendSparkline';

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
            <div style={{ marginTop: 8 }}>
              <TrendSparkline points={m.points} min={m.min} max={m.max} label={m.label} unit={m.unit} />
            </div>
            {/* The values stay. The chart carries shape and distance from the
                range; the numbers are what somebody reads out to a doctor. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4, fontSize: 12 }}>
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

const FIELD_STATUS = {
  low: { c: '#c62828', bg: '#ffebee', label: 'LOW' },
  high: { c: '#e65100', bg: '#fff3e0', label: 'HIGH' },
  normal: { c: '#2e7d32', bg: '#e8f5e9', label: 'OK' },
} as const;
/**
 * The typed value put into the unit the reference range is stated in.
 *
 * Without this the badge beside the field and the flag the server stores
 * disagree the moment somebody picks their lab's unit: 30 nmol/L of vitamin D
 * would show OK here (it clears a 20–100 ng/mL range as a bare 30) and save as
 * LOW (it is 12 ng/mL). The factor is the API's, not ours — see UnitChoice.
 */
function inRangeUnits(raw: string | undefined, u?: UnitChoice): number | null {
  if (raw == null || raw === '') return null;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return null;
  return u ? Math.round((n * u.factor + (u.offset ?? 0)) * 10000) / 10000 : n;
}
function fieldStatus(def: { min: number; max: number }, raw: string | undefined, u?: UnitChoice): keyof typeof FIELD_STATUS | null {
  const n = inRangeUnits(raw, u);
  if (n == null) return null;
  return n < def.min ? 'low' : n > def.max ? 'high' : 'normal';
}

/** Comprehensive manual entry — collapsible sections from the biomarker catalog,
 *  each field showing its reference range + live colour status. Supports
 *  high-precision decimals (step="any"); values display exactly as typed. */
function BiomarkerFields({ sections, form, setForm, units, setUnits }: {
  sections: BiomarkerSection[]; form: Record<string, string>; setForm: (f: Record<string, string>) => void;
  units: Record<string, string>; setUnits: (u: Record<string, string>) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    sections.reduce((a, s, i) => ({ ...a, [s.key]: i === 0 }), {}));
  // Open any section that has a value (e.g. after an upload pre-fills it) — never auto-closes.
  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const s of sections) if (s.markers.some((m) => form[m.key])) next[s.key] = true;
      return next;
    });
  }, [form, sections]);

  return (
    <div>
      {sections.map((sec) => {
        const filled = sec.markers.filter((m) => form[m.key]).length;
        const isOpen = open[sec.key] ?? false;
        return (
          <div key={sec.key} style={{ border: '1px solid var(--line)', borderRadius: 12, marginBottom: 10, overflow: 'hidden' }}>
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [sec.key]: !isOpen }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: 'var(--paper)', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{isOpen ? '▾' : '▸'} {sec.label}</span>
              {filled > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '1px 8px' }}>{filled}</span>}
              {sec.hint && <span className="muted" style={{ marginLeft: 'auto', fontSize: 10.5 }}>{sec.hint}</span>}
            </button>
            {isOpen && (
              <div style={{ padding: '2px 14px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: '4px 14px' }}>
                {sec.markers.map((m) => {
                  const choices = m.units ?? [];
                  const picked = units[m.key] ?? m.unit;
                  const choice = choices.find((c) => c.unit === picked);
                  const st = fieldStatus(m, form[m.key], choice);
                  const sc = st ? FIELD_STATUS[st] : null;
                  const inRange = choice && !choice.canonical ? inRangeUnits(form[m.key], choice) : null;
                  return (
                    <div key={m.key} style={{ margin: '10px 0 0' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.03em', color: 'var(--muted)' }}>{m.label}</span>
                        {sc && <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: sc.c, background: sc.bg, borderRadius: 999, padding: '1px 7px' }}>{sc.label}</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 5, marginTop: 3 }}>
                        <input type="number" step="any" min="0" inputMode="decimal" placeholder={m.optional ? 'optional' : ''}
                          value={form[m.key] ?? ''} onChange={(e) => setForm({ ...form, [m.key]: e.target.value })}
                          style={{ flex: 1, minWidth: 0, padding: '9px 11px', border: `1.5px solid ${sc ? sc.c + '88' : 'var(--line)'}`, borderRadius: 10, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
                        {choices.length > 1 && (
                          <select value={picked} onChange={(e) => setUnits({ ...units, [m.key]: e.target.value })}
                            aria-label={`Unit for ${m.label}`}
                            style={{ padding: '9px 6px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 12, fontFamily: 'inherit', background: 'var(--paper)', outline: 'none', maxWidth: 118 }}>
                            {choices.map((c) => <option key={c.unit} value={c.unit}>{c.unit || '—'}</option>)}
                          </select>
                        )}
                      </div>
                      <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                        Ref {m.min}–{m.max} {m.unit}
                        {/* Show the arithmetic. A number quietly changed on the
                            way to the database is not the citizen's record. */}
                        {inRange != null && <> · your {form[m.key]} {picked} = <strong>{inRange}</strong> {m.unit}</>}
                      </div>
                      {choice?.note && <div className="muted" style={{ fontSize: 9.5, marginTop: 1 }}>{choice.note}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Blood Test Analysis — Medical Hub owns the record; the cited engine reads it. */
export function BloodAnalysis() {
  const catalog = useBiomarkerCatalog();
  // The unit each field is being entered in. Only markers the person actually
  // changed appear here; everything else means "the unit the form is labelled
  // with", which is what the API assumes when a marker is absent.
  const [units, setUnits] = useState<Record<string, string>>({});
  const latest = useLatestPanel();
  const history = useBloodHistory();
  const summary = useHealthSummary();
  const save = useSaveBloodTest();
  const ingest = useIngestBlood();
  const [form, setForm] = useState<Record<string, string>>({});
  const [lab, setLab] = useState('');
  const [testDate, setTestDate] = useState('');
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
    // Send the raw number and the unit it was printed in; the server converts.
    // Sending our converted value instead would make the client the authority
    // on a clinical number, and a stale tab the authority on an old factor.
    const sent: Record<string, string> = {};
    for (const k of Object.keys(values)) if (units[k]) sent[k] = units[k];
    // Pass recordId so a manual entry / correction updates the SAME uploaded
    // report's panel instead of creating a duplicate.
    if (Object.keys(values).length) save.mutate(
      {
        lab: lab || undefined, takenOn: testDate ? new Date(testDate).toISOString() : undefined,
        values, ...(Object.keys(sent).length ? { units: sent } : {}), recordId: savedFile?.id,
      },
      { onSuccess: () => { setForm({}); setUnits({}); setLab(''); setTestDate(''); setSavedFile(null); setExtractNote(null); setExpanded(false); } },
    );
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

      <PrivacyNote hub="medical" style={{ margin: '16px 0 0' }} />

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

            {/* A score with no stated basis is a claim. This says what the number
                counts, so nobody reads it as a clinical index. */}
            {sum.score != null && sum.scoreBasis && (
              <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, marginTop: 10 }}>
                <b style={{ fontWeight: 700 }}>What this number is:</b> {sum.scoreBasis}
              </p>
            )}

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
        <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
          Enter any values from your report — the more you add, the more precise your Nutrition, Beauty and Fitness personalisation. Each field shows its reference range and flags out-of-range values. Decimals are kept exactly as entered.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
          <input value={lab} onChange={(e) => setLab(e.target.value)} placeholder="Lab name (optional)"
            style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          {/* max = today. A sample cannot have been drawn in the future, and a
              future-dated panel sorts to the top and becomes "your latest" —
              which drives the health summary and the blood flags behind the
              nutrition targets. The server refuses it too; this stops the
              mistake being made rather than reporting it afterwards. */}
          <input type="date" value={testDate} max={todayISO()} onChange={(e) => setTestDate(e.target.value)} aria-label="Test date"
            style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
        </div>
        {catalog.data?.sections
          ? <BiomarkerFields sections={catalog.data.sections} form={form} setForm={setForm} units={units} setUnits={setUnits} />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '4px 14px' }}>
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', display: 'block', margin: '10px 0 4px' }}>{f.label} <span style={{ fontWeight: 400 }}>({f.unit})</span></span>
                  <input type="number" step="any" min="0" placeholder={f.ph} value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                </div>
              ))}
            </div>
          )}
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
                    <span title={m.previousDate ? `was ${m.previous} on ${m.previousDate}` : `was ${m.previous}`} style={{ fontSize: 11, color: m.trend === 'flat' ? 'var(--muted)' : (m.status === 'normal' ? '#2e7d32' : 'var(--accent)') }}>
                      {TREND[m.trend]} from {m.previous}{m.previousDate ? ` (${m.previousDate})` : ''}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', borderRadius: 999, padding: '3px 12px', background: s.bg, color: s.color }}>{s.label}</span>
                </div>
                {m.lastTested && <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>Last tested {m.lastTested}</div>}
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

      {history.data && history.data.total > 1 && (
        <div className="card" style={{ marginTop: 18 }}>
          <div className="eyebrow">History · {history.data.total} panels</div>
          {history.data.items.map((t) => <PanelRow key={t.id} panel={t} />)}
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
            Removing a panel deletes the readings it contributed — your trends, flags and any plan built on
            them are recalculated without it. A report you uploaded stays in your records; it is the numbers
            that go.
          </p>
        </div>
      )}

      {data?.disclaimer && <p className="muted" style={{ fontSize: 11.5, marginTop: 16 }}>{data.disclaimer}</p>}
    </div>
  );
}

/**
 * One panel in the history, and the way to remove it (FE-13.6).
 *
 * The Medical Hub could delete an uploaded REPORT, and deleting one takes its
 * extracted panel with it — the API does both in a transaction, on the grounds
 * that a document without its panel and a panel without its document are each
 * worse than neither deletion happening. But a panel typed in by hand never had
 * a document, so there was nothing to delete it from. useDeleteBloodTest was
 * written for exactly this and no screen ever called it: a citizen could enter
 * their own blood work and then not take it back, while it went on shaping
 * their targets, their supplement plan and their meal plan.
 *
 * The confirm is deliberate and not a dialog. These are medical readings, the
 * delete is real, and an accidental tap costs someone a lab visit to recover
 * from — but a browser confirm() blocks the page and reads as a browser
 * problem rather than a considered question, so the row asks in place.
 */
function PanelRow({ panel }: { panel: BloodTestSummary }) {
  const del = useDeleteBloodTest();
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13 }}>
      <strong style={{ minWidth: 92 }}>{panel.takenOn}</strong>
      <span className="muted" style={{ fontSize: 12 }}>{panel.lab ?? '—'} · {panel.markerCount} markers</span>

      {confirming ? (
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="muted" style={{ fontSize: 12 }}>Remove this panel?</span>
          <button
            type="button"
            onClick={() => del.mutate(panel.id)}
            disabled={del.isPending}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#c62828', padding: '6px 4px' }}
          >
            {del.isPending ? 'Removing…' : 'Remove'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 4px' }}
          >
            Keep
          </button>
        </span>
      ) : (
        <>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {panel.flagged.length === 0
              ? <span style={{ fontSize: 11, color: '#2e7d32' }}>all in range</span>
              : panel.flagged.map((f) => <span key={f.key} style={{ fontSize: 10.5, fontWeight: 600, color: '#c62828', background: '#ffebee', borderRadius: 999, padding: '1px 8px' }}>{f.label} {f.status}</span>)}
          </span>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Remove the panel from ${panel.takenOn}`}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-soft)', padding: '6px 4px', flexShrink: 0 }}
          >
            Remove
          </button>
        </>
      )}

      {del.isError && (
        <span className="muted" style={{ fontSize: 11.5, color: '#c62828' }}>Could not remove it just now.</span>
      )}
    </div>
  );
}

/** Today where the citizen is, formatted for <input type="date">. */
function todayISO(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
