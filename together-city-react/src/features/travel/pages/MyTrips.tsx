import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useMyTrips, inr, type Trip } from '../api';

function TripPass({ t }: { t: Trip }) {
  const d = t.detail as { airline?: string; flightNo?: string; departTime?: string; arriveTime?: string; durationLabel?: string; stopLabel?: string; date?: string; destination?: string; startDate?: string | null };
  return (
    <article className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, display: 'flex' }}>
      <div style={{ width: 8, background: t.kind === 'flight' ? 'var(--info-ink)' : 'var(--accent)' }} />
      <div style={{ flex: 1, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          <strong style={{ fontSize: 16 }}>{t.title}</strong>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--ok-ink)', background: 'var(--ok-soft)', borderRadius: 999, padding: '2px 10px' }}>{t.status}</span>
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{t.subtitle}</div>
        {t.kind === 'flight' && d.departTime && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>🛫 {d.departTime} → 🛬 {d.arriveTime} · {d.durationLabel} · {d.stopLabel}</div>
        )}
        <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><div className="eyebrow" style={{ margin: 0 }}>{t.kind === 'flight' ? 'Cabin' : 'Package'}</div><div style={{ fontWeight: 700, fontSize: 14, textTransform: 'capitalize' }}>{t.tier}</div></div>
          <div><div className="eyebrow" style={{ margin: 0 }}>{t.kind === 'flight' ? 'Pax' : 'Travellers'}</div><div style={{ fontWeight: 700, fontSize: 14 }}>{t.pax}</div></div>
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

/** My Trips — booked packages and flights, together. */
export function MyTrips() {
  const q = useMyTrips();
  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div><div className="eyebrow">Travel · My Trips</div><h1 style={{ fontSize: 26, margin: 0 }}>Your trips</h1></div>
        <Link to="/travel/explore" style={{ marginLeft: 'auto' }}><Button variant="line" size="sm">← Explore</Button></Link>
      </div>
      {q.isLoading ? <Spinner label="Loading your trips…" />
        : q.isError ? <EmptyState title="Couldn't load your trips" hint="Your trips are unaffected — nothing has been cancelled. We couldn’t read them just now." />
        : (q.data ?? []).length === 0 ? <EmptyState icon="🧳" title="No trips yet" hint="Book a package or a flight." />
        : <div style={{ marginTop: 16 }}>{q.data?.map((t) => <TripPass key={t.id} t={t} />)}</div>}
    </div>
  );
}
