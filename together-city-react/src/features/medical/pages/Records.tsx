import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mediaApi } from '@/api/media.api';
import { useAddRecord, useRecords, useStorageUsage, useDeleteRecord, useLatestPanel, useBloodHistory, medicalApi } from '../api';

const MSTATUS: Record<string, { color: string; bg: string; label: string }> = {
  low: { color: '#c62828', bg: '#ffebee', label: 'LOW' },
  high: { color: '#e65100', bg: '#fff3e0', label: 'HIGH' },
  normal: { color: '#2e7d32', bg: '#e8f5e9', label: 'OK' },
};

const KINDS: { key: string; label: string; icon: string }[] = [
  { key: 'condition', label: 'Condition', icon: '🩺' },
  { key: 'prescription', label: 'Prescription', icon: '💊' },
  { key: 'report', label: 'Report', icon: '📄' },
  { key: 'allergy', label: 'Allergy', icon: '⚠️' },
  { key: 'vaccination', label: 'Vaccination', icon: '💉' },
  { key: 'note', label: 'Note', icon: '📝' },
];
const iconFor = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? '📁';
const fmtBytes = (n: number) => {
  if (!n) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB']; const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};

/** Medical Records — the secure record store + unified 10 GB document vault. */
export function Records() {
  const records = useRecords();
  const storage = useStorageUsage();
  const latest = useLatestPanel();
  const history = useBloodHistory();
  const add = useAddRecord();
  const del = useDeleteRecord();
  const qc = useQueryClient();
  const [kind, setKind] = useState('condition');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setTitle(''); setDetail(''); setFile(null); };

  // Open a private health document via a fresh short-lived signed link. The tab is
  // opened synchronously (within the click) then redirected, to avoid popup blocks.
  const openFile = async (id: string) => {
    const w = window.open('', '_blank');
    try {
      const { url } = await medicalApi.recordFile(id);
      if (url && w) w.location.href = url; else if (w) w.close();
    } catch { if (w) w.close(); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setErr('Add a title for this record first.'); return; }
    setErr(null);
    if (file) {
      if (file.size > 25 * 1024 * 1024) { setErr('That file is over 25 MB.'); return; }
      setBusy(true);
      try {
        const up = await mediaApi.uploadPrivate(file);
        const recs = await medicalApi.uploadDocument({
          kind, title: title.trim(), detail: detail.trim() || undefined,
          fileKey: up.fileKey, mimeType: up.mimeType, sizeBytes: up.sizeBytes,
        });
        qc.setQueryData(['medical', 'records'], recs);
        void qc.invalidateQueries({ queryKey: ['medical', 'storage'] });
        reset();
      } catch (e2) {
        const msg = (e2 as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setErr(msg ?? 'Upload failed. Please try again.');
      } finally { setBusy(false); }
    } else {
      add.mutate({ kind, title: title.trim(), detail: detail.trim() || undefined }, { onSuccess: reset });
    }
  };

  if (records.isLoading) return <Spinner label="Opening your records…" />;
  const s = storage.data;
  const panel = latest.data;
  const hasPanel = Boolean(panel && panel.markers.length);
  const flagged = (panel?.markers ?? []).filter((m) => m.status !== 'normal');
  const reportDocs = (records.data ?? []).filter((r) => r.kind === 'report').length;
  const panelCount = history.data?.length ?? (hasPanel ? 1 : 0);
  const tile = (value: string | number, label: string, alert = false) => (
    <div style={{ textAlign: 'center', padding: '10px 6px', border: '1px solid var(--line)', borderRadius: 12 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: alert ? '#c0392b' : 'var(--ink)' }}>{value}</div>
      <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Records</div>
      <h1 style={{ fontSize: 26 }}>Your health record</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        One secure place for conditions, prescriptions, reports, allergies and vaccinations —
        your <strong>source of truth</strong>, shared with other hubs only with your consent.
      </p>

      {/* Health highlights — analysis across your reports/panels */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="eyebrow" style={{ margin: 0 }}>Health highlights</div>
          {hasPanel && <Link to="/medical/blood" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--accent)' }}>Full analysis →</Link>}
        </div>

        {hasPanel && panel ? (
          <>
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 12px' }}>
              Latest panel · {panel.takenOn}{panel.lab ? ` · ${panel.lab}` : ''}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {tile(panel.markers.length, 'Markers')}
              {tile(flagged.length, 'Out of range', flagged.length > 0)}
              {tile(panel.alerts.length, 'Alerts', panel.alerts.length > 0)}
              {tile(panelCount, panelCount === 1 ? 'Panel' : 'Panels')}
            </div>

            {panel.alerts.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {panel.alerts.map((a) => (
                  <div key={a.key + a.value} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12, marginBottom: 8, background: a.urgent ? '#fdecea' : '#fff3e0', border: `1.5px solid ${a.urgent ? '#c62828' : '#e65100'}` }}>
                    <span style={{ fontSize: 17 }}>{a.urgent ? '🚑' : '⚠️'}</span>
                    <div style={{ fontSize: 12.5 }}><b style={{ color: a.urgent ? '#c62828' : '#e65100' }}>{a.label} {a.value}</b> — {a.message}</div>
                  </div>
                ))}
              </div>
            )}

            {flagged.length > 0 ? (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                {flagged.map((m) => {
                  const st = MSTATUS[m.status] ?? MSTATUS.normal;
                  return (
                    <span key={m.key} title={m.advice} style={{ fontSize: 11.5, fontWeight: 600, borderRadius: 999, padding: '4px 11px', background: st.bg, color: st.color }}>
                      {m.label} {m.value}{m.unit} · {st.label}{m.trend && m.trend !== 'flat' ? (m.trend === 'up' ? ' ▲' : ' ▼') : ''}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: 12.5, marginTop: 12, color: '#2e7d32' }}>✓ All measured markers are within range.</p>
            )}

            {panel.conditions.length > 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                Guidance from this panel: {panel.conditions.map((c) => c.name).join(', ')}.
              </p>
            )}
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              {reportDocs} report{reportDocs === 1 ? '' : 's'} on file · Educational, not a diagnosis.
            </p>
          </>
        ) : (
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>
            No blood panels analysed yet. Upload a report on <Link to="/medical/blood" style={{ color: 'var(--accent)', fontWeight: 600 }}>Blood Test Analysis</Link> and save it — your key markers, flags and trends will appear here.
          </p>
        )}
      </div>

      {/* Unified 10 GB vault meter (mail + health documents) */}
      {s && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Storage vault</div>
            <span className="muted" style={{ fontSize: 12 }}>{fmtBytes(s.usedBytes)} of {fmtBytes(s.quotaBytes)} used</span>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(1, s.usedPct)}%`, height: '100%', background: s.usedPct > 90 ? '#c62828' : 'var(--accent)' }} />
          </div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
            Shared with your city mailbox · Mail {fmtBytes(s.mailBytes)} · Health documents {fmtBytes(s.healthBytes)}
          </p>
        </div>
      )}

      <form onSubmit={submit} className="card" style={{ marginTop: 18 }}>
        <div className="eyebrow">Add to your record</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                border: '1.5px solid var(--line)', background: kind === k.key ? 'var(--accent)' : 'transparent', color: kind === k.key ? '#fff' : 'var(--ink-soft)' }}>
              {k.icon} {k.label}
            </button>
          ))}
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Type 2 diabetes, Vitamin D 60k, Penicillin allergy)"
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Details (optional)" rows={2}
          style={{ width: '100%', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 13 }}>
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 12.5 }} />
          {file && <span className="muted" style={{ fontSize: 12 }}>{fmtBytes(file.size)}</span>}
        </label>
        <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>Attach a report, prescription or scan (JPG, PNG, PDF) — it's stored in your vault.</p>
        {err && <p style={{ fontSize: 12.5, color: '#c62828', marginTop: 8 }}>{err}</p>}
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="accent" disabled={busy || add.isPending}>
            {busy ? 'Uploading…' : add.isPending ? 'Saving…' : file ? 'Upload & save' : 'Add record'}
          </Button>
        </div>
      </form>

      <div style={{ marginTop: 18 }}>
        {(records.data ?? []).length === 0 ? (
          <EmptyState icon="🗂️" title="No records yet" hint="Add your first condition, prescription or report above." />
        ) : (
          records.data?.map((r) => (
            <article key={r.id} className="card" style={{ marginBottom: 12, display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 22 }}>{iconFor(r.kind)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <strong style={{ fontSize: 14.5 }}>{r.title}</strong>
                  <span className="pill" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '1px 9px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>{r.kind}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{r.recordedOn}</span>
                </div>
                {r.detail && <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '4px 0 0' }}>{r.detail}</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                  {r.hasFile && (
                    <button type="button" onClick={() => void openFile(r.id)}
                      style={{ cursor: 'pointer', background: 'none', border: 'none', padding: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--accent)', fontFamily: 'inherit' }}>
                      View file{r.sizeBytes ? ` · ${fmtBytes(r.sizeBytes)}` : ''} ↗
                    </button>
                  )}
                  <button type="button" onClick={() => del.mutate(r.id)} disabled={del.isPending}
                    style={{ marginLeft: 'auto', cursor: 'pointer', background: 'none', border: 'none', color: '#c62828', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit' }}>
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
