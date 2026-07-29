import { useState } from 'react';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useAddPrescriptionItem, useConfirmPrescription, useCreateManualPrescription, useDoseLogs,
  useMedicines, usePrescriptions, useRemovePrescriptionItem,
  type AddItemInput, type Prescription,
} from '../api';

const fmtTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Add a medicine line. Typed by a person, so it needs no further review. */
function AddMedicine({ prescriptionId }: { prescriptionId: string }) {
  const add = useAddPrescriptionItem();
  const [f, setF] = useState<AddItemInput>({ medicineName: '', dosage: '', frequency: '' });
  const ready = f.medicineName.trim() && f.dosage.trim() && f.frequency.trim();

  const field = (key: keyof AddItemInput, placeholder: string, flex = '1 1 140px') => (
    <input
      value={(f[key] as string) ?? ''}
      onChange={(e) => setF({ ...f, [key]: e.target.value })}
      placeholder={placeholder}
      style={{ flex, border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', background: 'var(--card)', outline: 'none' }}
    />
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {field('medicineName', 'Medicine name')}
        {field('dosage', 'Dosage, e.g. 500mg', '0 1 150px')}
        {field('frequency', 'Frequency, e.g. 1-0-1', '0 1 150px')}
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
        Frequency sets the times: 1-0-1 becomes 09:00 and 21:00, 1-1-1 becomes 08:00, 14:00 and 21:00.
      </p>
      {add.isError && <p style={{ color: '#c62828', fontSize: 12.5, marginTop: 8 }}>Couldn’t add that — check the fields and try again.</p>}
      <Button
        variant="accent" size="sm" style={{ marginTop: 10 }}
        disabled={!ready || add.isPending}
        onClick={() => add.mutate(
          { id: prescriptionId, input: { ...f, medicineName: f.medicineName.trim(), dosage: f.dosage.trim(), frequency: f.frequency.trim() } },
          { onSuccess: () => setF({ medicineName: '', dosage: '', frequency: '' }) },
        )}
      >
        {add.isPending ? 'Adding…' : 'Add medicine'}
      </Button>
    </div>
  );
}

function PrescriptionCard({ p }: { p: Prescription }) {
  const confirm = useConfirmPrescription();
  const removeItem = useRemovePrescriptionItem();
  const confirmed = p.status === 'confirmed';

  return (
    <article className="card" style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 15, margin: 0 }}>Prescription</h2>
        <span className="tag" style={{ fontSize: 10.5, background: confirmed ? 'var(--accent-soft)' : undefined, color: confirmed ? 'var(--accent)' : undefined, fontWeight: 700 }}>
          {confirmed ? '✓ Confirmed' : p.status === 'failed' ? 'Couldn’t be read' : 'Needs your confirmation'}
        </span>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{fmtTime(p.createdAt)}</span>
      </div>

      {p.items.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>
          Nothing was read from this prescription — add each medicine below exactly as written.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
          {p.items.map((i) => (
            <li key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                  {i.medicineName}
                  {i.needsReview && <span className="tag" style={{ fontSize: 10, marginLeft: 8 }}>confirm this</span>}
                </div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {[i.dosage, i.frequency, i.timesLocal.join(', ')].filter(Boolean).join(' · ')}
                  {i.durationDays ? ` · ${i.durationDays} days` : ''}
                </div>
              </div>
              {!confirmed && (
                <Button size="sm" variant="line" disabled={removeItem.isPending}
                  onClick={() => removeItem.mutate({ id: p.id, itemId: i.id })}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!confirmed && (
        <>
          <AddMedicine prescriptionId={p.id} />
          {confirm.isError && (
            <p style={{ color: '#c62828', fontSize: 12.5, marginTop: 10 }}>
              {(confirm.error as { response?: { data?: { message?: string } } })?.response?.data?.message
                ?? 'Couldn’t confirm — check every medicine has a dosage and a frequency.'}
            </p>
          )}
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="accent" size="sm" disabled={confirm.isPending || p.items.length === 0}
              onClick={() => confirm.mutate(p.id)}>
              {confirm.isPending ? 'Setting reminders…' : 'Confirm & set reminders'}
            </Button>
            <span className="muted" style={{ fontSize: 11.5 }}>You’ll be reminded 5 minutes before each dose.</span>
          </div>
        </>
      )}
    </article>
  );
}

/** Prescriptions, medicines and the dose log — the whole medicine loop. */
export function Medicines() {
  const prescriptions = usePrescriptions();
  const medicines = useMedicines();
  const logs = useDoseLogs();
  const create = useCreateManualPrescription();

  const list = prescriptions.data ?? [];
  const pending = list.filter((p) => p.status !== 'confirmed');

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Medicines</div>
      <h1 style={{ fontSize: 26 }}>Medicines & reminders</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
        Add what you’ve been prescribed and we’ll remind you 5 minutes before every dose, in your own timezone.
        Nothing becomes a reminder until you’ve confirmed it.
      </p>

      {pending.length === 0 && (
        <Button variant="accent" disabled={create.isPending} onClick={() => create.mutate()} style={{ marginBottom: 18 }}>
          {create.isPending ? 'Starting…' : 'Add a prescription'}
        </Button>
      )}

      {prescriptions.isLoading ? <Spinner label="Loading your medicines…" /> : (
        <>
          {pending.map((p) => <PrescriptionCard key={p.id} p={p} />)}

          <h2 style={{ fontSize: 18, margin: '26px 0 10px' }}>Your medicines</h2>
          {(medicines.data ?? []).length === 0 ? (
            <EmptyState icon="💊" title="No medicines yet" hint="Add a prescription above and confirm it to start reminders." />
          ) : (
            (medicines.data ?? []).map((m) => (
              <div key={m.id} className="card" style={{ padding: '14px 16px', marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                {m.schedules.map((s) => (
                  <div key={s.id} className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {s.timesLocal.join(', ')} · {s.dosage ?? '—'} · from {s.startDate}{s.endDate ? ` to ${s.endDate}` : ''}
                  </div>
                ))}
              </div>
            ))
          )}

          <h2 style={{ fontSize: 18, margin: '26px 0 10px' }}>Dose log</h2>
          {(logs.data?.items ?? []).length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>Every dose you take, skip or miss will be recorded here.</p>
          ) : (
            <div className="card" style={{ padding: '6px 16px' }}>
              {(logs.data?.items ?? []).map((d) => (
                <div key={d.id} style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{d.medicine}</span>
                  <span className="muted" style={{ fontSize: 12 }}>{d.dosage ?? ''}</span>
                  <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>{fmtTime(d.scheduledAtUtc)}</span>
                  <span className="tag" style={{ fontSize: 10.5 }}>{d.action}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
