import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyTickets, inr, eventDate, type Ticket } from '../api';

/** A boarding-pass style ticket with a booking code. */
function TicketPass({ t }: { t: Ticket }) {
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
      <div style={{ width: 8, background: 'var(--accent)' }} />
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          <strong style={{ fontSize: 16 }}>{t.title}</strong>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#2e7d32', background: '#e8f5e9', borderRadius: 999, padding: '2px 10px' }}>{t.status}</span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>📅 {eventDate(t.date)} · {t.time} · 📍 {t.venue}, {t.city}</div>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div className="eyebrow" style={{ margin: 0 }}>Tier</div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.tier}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>Qty</div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.qty}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>Paid</div><div style={{ fontWeight: 700, fontSize: 14 }}>{inr(t.totalInr)}</div></div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Booking code</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, letterSpacing: '.06em' }}>{t.code}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** My Tickets — your booked passes. */
export function MyTickets() {
  const q = useMyTickets();
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <div className="eyebrow">Entertainment · My Tickets</div>
          <h1 style={{ fontSize: 26, margin: 0 }}>Your passes</h1>
        </div>
        <Link to="/entertainment/discover" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Discover</Button></Link>
      </div>

      {q.isLoading ? <Spinner label="Loading your tickets…" />
        : q.isError ? <EmptyState title="Couldn't load your tickets" hint="Please check your connection and try again." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🎟" title="No tickets yet" hint="Book an event from Discover." />
        : <div style={{ marginTop: 16 }}>{q.data?.map((t) => <TicketPass key={t.id} t={t} />)}</div>}
    </div>
  );
}
