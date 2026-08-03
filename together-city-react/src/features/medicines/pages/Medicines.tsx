import { useState } from 'react';
import { adherenceOf } from '../adherence';
import { Button, EmptyState, Spinner } from '@/components/ui';
import {
  useAddPrescriptionItem, useConfirmPrescription, useCreateManualPrescription, useDoseLogs,
  useMedicines, usePrescriptions, useRecordDose, useRemovePrescriptionItem, useToday,
  type AddItemInput, type Prescription, type TodayDose,
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
      {add.isError && <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 8 }}>Couldn’t add that — check the fields and try again.</p>}
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

/**
 * Today's doses, with a way to answer them (FE-6.2).
 *
 * This is the half of the medicine loop that was missing, and its absence was
 * not neutral. The endpoint to record a dose was live, the model was there, and
 * `useRecordDose` sat in the client imported by nothing — while a job ran every
 * hour writing `missed` against any dose more than two hours past its time with
 * no log on it. The app reminded people to take their medicine, gave them no
 * way to say they had, and then filed a missed dose in their medical record.
 *
 * Nothing here decides a dose was missed. The API reports 'due' for an
 * unanswered dose whose time has passed, and the sweep keeps its own judgement
 * on its own grace window.
 *
 * A dose stays on the list after its time. The ones behind you are the ones
 * worth answering, and because recording upserts, a dose the sweep already
 * called missed can still be corrected while the day is yours to correct.
 *
 * No Snooze button. Snoozing means moving a real alarm, which is BE-6.2's
 * delivery work; a button that only changed this screen would be a promise the
 * app does not keep.
 */
const DOSE_STATE: Record<string, { label: string; color: string; bg: string }> = {
  taken: { label: 'Taken', color: 'var(--ok-ink)', bg: 'var(--ok-soft)' },
  skipped: { label: 'Skipped', color: 'var(--muted)', bg: 'var(--line)' },
  missed: { label: 'Not recorded', color: 'var(--danger-ink)', bg: 'var(--danger-soft)' },
};

function DoseRow({ d }: { d: TodayDose }) {
  const record = useRecordDose();
  const answered = d.status === 'taken' || d.status === 'skipped';
  const state = DOSE_STATE[d.status];
  const act = (action: 'taken' | 'skipped') =>
    record.mutate({ scheduleId: d.scheduleId, scheduledAtUtc: d.scheduledAtUtc, action });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '12px 0', borderTop: '1px solid var(--line)',
      opacity: d.status === 'upcoming' ? 0.72 : 1,
    }}>
      <strong style={{ fontSize: 15, minWidth: 52, fontVariantNumeric: 'tabular-nums' }}>{d.timeLocal}</strong>
      <div style={{ flex: '1 1 160px', minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.medicine}</div>
        <div className="muted" style={{ fontSize: 12 }}>
          {[d.dosage, d.strength, d.instructions].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>

      {answered ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: state.color, background: state.bg, borderRadius: 999, padding: '3px 10px' }}>
            {state.label}
          </span>
          {/* Answering is never final. People tap the wrong row. */}
          <button
            type="button" disabled={record.isPending}
            onClick={() => act(d.status === 'taken' ? 'skipped' : 'taken')}
            style={{ minHeight: 44, padding: '0 10px', background: 'none', border: 'none', color: 'var(--muted)', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >
            change
          </button>
        </span>
      ) : (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {d.status === 'missed' && (
            <span style={{ fontSize: 11.5, fontWeight: 700, color: state.color, background: state.bg, borderRadius: 999, padding: '3px 10px' }}>
              {state.label}
            </span>
          )}
          {/* 44px minimum, per FE-6.2 — this is tapped with one hand, often in
              a hurry, and often by somebody older than the person building it. */}
          <Button size="sm" variant="accent" disabled={record.isPending}
            style={{ minHeight: 44, minWidth: 88 }} onClick={() => act('taken')}>
            Taken
          </Button>
          <Button size="sm" variant="line" disabled={record.isPending}
            style={{ minHeight: 44, minWidth: 72 }} onClick={() => act('skipped')}>
            Skip
          </Button>
        </span>
      )}
    </div>
  );
}

function TodayDoses() {
  const today = useToday();
  const d = today.data;
  if (today.isLoading || !d) return null;

  return (
    <section className="card" style={{ padding: '16px 18px', marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Today</h2>
        {d.total > 0 && (
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 11.5 }}>
            {d.answered} of {d.total} answered
          </span>
        )}
      </div>

      {d.total === 0
        ? <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>Nothing due today.</p>
        : d.doses.map((dose) => <DoseRow key={`${dose.scheduleId}-${dose.scheduledAtUtc}`} d={dose} />)}
    </section>
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
                {/* A name they wrote down, next to a name on their prescription.
                    Deliberately not styled as an alarm: it is worth a look, and
                    the app is not in a position to say more than that. */}
                {i.allergyMatches.map((m) => (
                  <div key={m.allergyId} style={{ fontSize: 12, lineHeight: 1.5, marginTop: 4, color: 'var(--accent-ink)' }}>
                    Matches an allergy you recorded — <strong>{m.title}</strong>. Worth checking before you confirm.
                  </div>
                ))}
              </div>
              {!confirmed && (
                <Button size="sm" variant="line" disabled={removeItem.isPending}
                  onClick={() => removeItem.mutate({ id: p.id, itemId: i.id })}>Remove</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* ── Their own allergy records, put where the decision is ────────
          Medical → Records has offered an "Allergies" category, with a warning
          icon and the placeholder "Penicillin allergy", for as long as this hub
          has been reading prescriptions and setting reminders. Nothing read it.
          A category that looks like it does something is a promise. */}
      {p.recordedAllergies.length > 0 && (
        <section style={{ marginTop: 14, padding: '12px 14px', border: '1px solid var(--line)', borderRadius: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Allergies you’ve recorded</div>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
            {p.recordedAllergies.map((a) => (
              <li key={a.id}>
                {a.title}
                {a.detail ? <span className="muted"> — {a.detail}</span> : null}
              </li>
            ))}
          </ul>
          {/* The sentence that keeps this honest. It is here in every state,
              including when nothing matched, because an absent warning must
              never be read as a clearance — the app cannot give one. */}
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '10px 0 0' }}>
            These are here because you wrote them down. We compare names only — we can’t tell
            whether a medicine belongs to a family you react to, so nothing here means a
            prescription is safe. Your doctor or pharmacist is the one who can say.
          </p>
        </section>
      )}

      {!confirmed && p.recordedAllergies.length === 0 && (
        <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 12 }}>
          If you have any drug allergies, recording them under Medical → Records means
          they’ll show up here, next to what you’ve been prescribed.
        </p>
      )}

      {!confirmed && (
        <>
          <AddMedicine prescriptionId={p.id} />
          {confirm.isError && (
            <p style={{ color: 'var(--danger-ink)', fontSize: 12.5, marginTop: 10 }}>
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
          {(medicines.data ?? []).length > 0 && <TodayDoses />}

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

          {/* FE-6.2 — adherence from the same log rendered below. Shown only
              when there are real days to count; never an invented perfect run. */}
          {(() => {
            const a = adherenceOf(logs.data?.items ?? [], new Date());
            if (a.daysWithData === 0) return null;
            const dot: Record<string, { bg: string; label: string }> = {
              clear: { bg: 'var(--accent)', label: 'all taken' },
              partial: { bg: 'var(--gold-bright)', label: 'some taken' },
              missed: { bg: 'var(--danger-ink)', label: 'none taken' },
              none: { bg: 'var(--line)', label: 'nothing due' },
            };
            return (
              <div className="card" style={{ padding: '14px 16px', margin: '26px 0 10px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {a.currentStreak > 0 ? `${a.currentStreak}-day streak — every dose taken` : 'No streak right now'}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>Best: {a.bestStreak} day{a.bestStreak === 1 ? '' : 's'} · counted only on days doses were due</div>
                </div>
                <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }} aria-label="Last 7 days">
                  {a.week.map((d) => (
                    <span key={d.day} title={`${d.day} — ${dot[d.state].label}`}
                      style={{ width: 14, height: 14, borderRadius: '50%', background: dot[d.state].bg, display: 'inline-block' }} />
                  ))}
                </div>
              </div>
            );
          })()}

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

          {/* FE-6.3. At the foot of the page rather than in a dismissible
              banner, because it has to be true of the page every time it is
              read, not once. */}
          <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, marginTop: 26, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            This is a reminder tool, not medical advice. Every medicine, dose and time here is
            the one you entered from your own prescription — the app never suggests a dosage,
            changes one, or tells you to start or stop a medicine. If something looks wrong,
            the prescription is right and this is not. Talk to your doctor or pharmacist
            before changing anything.
          </p>
        </>
      )}
    </div>
  );
}
