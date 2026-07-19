import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBookConsult, useConsults, useDoctors, type DoctorCard } from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';

const SLOTS = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '4:00 PM', '4:30 PM', '5:00 PM'];
const MODES = ['Video call', 'Clinic visit'] as const;

function DoctorRow({ doc }: { doc: DoctorCard }) {
  const book = useBookConsult();
  const [reason, setReason] = useState('');
  const [slot, setSlot] = useState('10:00 AM');
  const [mode, setMode] = useState<string>('Video call');
  const [open, setOpen] = useState(false);
  const [booked, setBooked] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const bookingReason = `[${mode} · ${slot}]${reason ? ` ${reason}` : ''}`;

  return (
    <article className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--accent-soft)', color: 'var(--accent)', fontWeight: 700, fontSize: 16 }}>
          {doc.name.replace('Dr. ', '').split(' ').map((w) => w[0]).slice(0, 2).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>{doc.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>★ {doc.rating}</span></div>
          <div className="muted" style={{ fontSize: 12.5 }}>{doc.specialty}{doc.hospital ? ` · ${doc.hospital}` : ''}</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{doc.languages.join(' · ')}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>₹{doc.priceInr}</div>
          <div className="muted" style={{ fontSize: 11 }}>per consult</div>
        </div>
      </div>
      {booked ? (
        <div style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent)' }}>✓ Booked — they’ve messaged you</span>
          <Link to="/chats"><Button variant="accent" size="sm">Open chat</Button></Link>
        </div>
      ) : open ? (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Consult mode</div>
          <div className="pill-row" style={{ marginBottom: 10 }}>
            {MODES.map((m) => (
              <span key={m} className={`pill${mode === m ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode(m)}>{m}</span>
            ))}
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Preferred time</div>
          <div className="pill-row" style={{ marginBottom: 10 }}>
            {SLOTS.map((s) => (
              <span key={s} className={`pill${slot === s ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSlot(s)}>{s}</span>
            ))}
          </div>
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for consult (optional)"
            style={{ width: '100%', padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 13.5, fontFamily: 'inherit', outline: 'none', marginBottom: 8 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="accent" size="sm" onClick={() => setPayOpen(true)}>
              Book · ₹{doc.priceInr}
            </Button>
            <Button variant="line" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          </div>
          <PaymentSheet
            open={payOpen}
            amountInr={doc.priceInr}
            label={`${mode} with ${doc.name} · ${slot}`}
            pending={book.isPending}
            error={book.isError ? payError(book.error) : null}
            onCancel={() => setPayOpen(false)}
            onPay={(method: PayMethod) => book.mutate({ doctorId: doc.id, reason: bookingReason, method }, { onSuccess: () => { setBooked(true); setPayOpen(false); } })}
          />
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <Button variant="line" size="sm" onClick={() => setOpen(true)}>Book appointment</Button>
        </div>
      )}
    </article>
  );
}

/** Consults — book a doctor; booking opens a real, connection-gated chat. */
export function Consults() {
  const doctors = useDoctors();
  const consults = useConsults();

  if (doctors.isLoading) return <Spinner label="Finding doctors…" />;
  if (doctors.isError) return <EmptyState title="Couldn't load doctors" hint="Start the backend and reload." />;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Medical Hub · Consults</div>
      <h1 style={{ fontSize: 26 }}>Talk to a doctor</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Pick a doctor, choose your mode and preferred time, and book — it opens a private,
        connection-gated chat where you share the reports and blood panel you choose to.
      </p>

      {(consults.data ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="eyebrow">Your consults</div>
          {consults.data?.map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: '1px solid var(--line)', fontSize: 13.5 }}>
              <strong>{c.doctorName}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{c.reason ?? c.specialty}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 10px' }}>{c.status}</span>
              <Link to="/chats"><Button variant="line" size="sm">Chat</Button></Link>
            </div>
          ))}
        </div>
      )}

      {doctors.data?.map((d) => <DoctorRow key={d.id} doc={d} />)}
    </div>
  );
}
