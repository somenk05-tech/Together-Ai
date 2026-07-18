import { useState, type FormEvent } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useAddRecord, useRecords } from '../api';

const KINDS: { key: string; label: string; icon: string }[] = [
  { key: 'condition', label: 'Condition', icon: '🩺' },
  { key: 'prescription', label: 'Prescription', icon: '💊' },
  { key: 'report', label: 'Report', icon: '📄' },
  { key: 'allergy', label: 'Allergy', icon: '⚠️' },
  { key: 'vaccination', label: 'Vaccination', icon: '💉' },
  { key: 'note', label: 'Note', icon: '📝' },
];
const iconFor = (k: string) => KINDS.find((x) => x.key === k)?.icon ?? '📁';

/** Medical Records — the secure record store (source of truth for health data). */
export function Records() {
  const records = useRecords();
  const add = useAddRecord();
  const [kind, setKind] = useState('condition');
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    add.mutate({ kind, title: title.trim(), detail: detail.trim() || undefined },
      { onSuccess: () => { setTitle(''); setDetail(''); } });
  };

  if (records.isLoading) return <Spinner label="Opening your records…" />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Records</div>
      <h1 style={{ fontSize: 26 }}>Your health record</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 0' }}>
        One secure place for conditions, prescriptions, reports, allergies and vaccinations —
        your <strong>source of truth</strong>, shared with other hubs only with your consent.
      </p>

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
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="accent" disabled={add.isPending || !title.trim()}>{add.isPending ? 'Saving…' : 'Add record'}</Button>
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
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
