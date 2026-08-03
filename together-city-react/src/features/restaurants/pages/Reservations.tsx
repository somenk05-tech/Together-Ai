import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyReservations, type Reservation } from '../api';

const fmtDate = (d: string) => { const [y, m, day] = d.split('-'); const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; return `${day} ${months[Number(m) - 1]} ${y}`; };

function ResCard({ v }: { v: Reservation }) {
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
      <div style={{ width: 8, background: 'var(--warn-ink)' }} />
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18 }}>📅</span>
          <strong style={{ fontSize: 16 }}>{v.restaurantName}</strong>
          <span className="muted" style={{ fontSize: 12.5 }}>{v.area}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 999, padding: '2px 10px' }}>{v.status}</span>
        </div>
        <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div className="eyebrow" style={{ margin: 0 }}>Date</div><div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(v.date)}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>Time</div><div style={{ fontWeight: 700, fontSize: 14 }}>{v.time}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>Guests</div><div style={{ fontWeight: 700, fontSize: 14 }}>{v.partySize}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>Under</div><div style={{ fontWeight: 700, fontSize: 14 }}>{v.guestName}</div></div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div className="eyebrow" style={{ margin: 0 }}>Reservation code</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 18, letterSpacing: '.06em' }}>{v.code}</div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** My Reservations — table bookings (pay at the restaurant). */
export function Reservations() {
  const q = useMyReservations();
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div><div className="eyebrow">Restaurants · Reservations</div><h1 style={{ fontSize: 26, margin: 0 }}>Your table bookings</h1></div>
        <Link to="/restaurants" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Discover</Button></Link>
      </div>
      {q.isLoading ? <Spinner label="Loading reservations…" />
        : q.isError ? <EmptyState title="Couldn't load reservations" hint="Any table you’ve booked is still booked — this is only the list failing to load." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="📅" title="No reservations yet" hint="Book a table from a restaurant." />
        : <div style={{ marginTop: 16 }}>{q.data?.map((v) => <ResCard key={v.id} v={v} />)}</div>}
    </div>
  );
}
