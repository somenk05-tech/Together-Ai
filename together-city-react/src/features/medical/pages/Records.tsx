import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { mediaApi } from '@/api/media.api';
import { useAddRecord, useRecords, useStorageUsage, useDeleteRecord, medicalApi } from '../api';

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

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Records</div>
      <h1 style={{ fontSize: 26 }}>Your health record</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        One secure place for conditions, prescriptions, reports, allergies and vaccinations —
        your <strong>source of truth</strong>, shared with other hubs only with your consent.
      </p>

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
