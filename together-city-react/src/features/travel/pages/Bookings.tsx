import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { inr, useMyTrips, type Trip } from '../api';
import { IMG, TabRow, TravelHero, TrustBar } from '../shared';

const TABS = ['All', 'Upcoming', 'Completed', 'Cancelled'];

function statusTag(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('cancel')) return 'tag red';
  if (s.includes('complete')) return 'tag green';
  return 'tag gold';
}

export function TravelBookings() {
  const q = useMyTrips();
  const [tab, setTab] = useState(0);
  const [cancelled, setCancelled] = useState<Set<string>>(new Set());

  const statusOf = (t: Trip) => (cancelled.has(t.id) ? 'Cancelled' : t.status);

  const rows = useMemo(() => {
    const list = q.data ?? [];
    const key = TABS[tab].toLowerCase();
    if (tab === 0) return list;
    return list.filter((t) => {
      const s = statusOf(t).toLowerCase();
      if (key === 'upcoming') return s.includes('upcoming') || s.includes('confirm');
      if (key === 'completed') return s.includes('complete');
      return s.includes('cancel');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data, tab, cancelled]);

  return (
    <>
      <TravelHero eyebrow="Travel Hub · 05" title="My Bookings" sub="View and manage all your travel bookings in one place." bg={`${IMG}mybookings-image.webp`} />

      <TabRow tabs={TABS} onChange={setTab} />

      <section className="blk rise d2">
        {q.isLoading ? <Spinner label="Loading your bookings…" />
          : q.isError ? <EmptyState title="Couldn't load bookings" hint="Start the backend and reload." />
          : rows.length === 0 ? <EmptyState icon="🧳" title="No bookings here yet" hint="Book a flight or a package to see it here." />
          : (
            <table className="tc">
              <tbody>
                <tr><th>Booking details</th><th>Date</th><th>Travellers</th><th>Amount</th><th>Status</th><th>Actions</th></tr>
                {rows.map((t) => {
                  const st = statusOf(t);
                  const isCancelled = st === 'Cancelled';
                  const d = t.detail as { date?: string; startDate?: string | null };
                  return (
                    <tr key={t.id}>
                      <td><b>{t.title}</b><br /><span className="muted">{t.subtitle}</span><br /><span className="mono muted">ID {t.code}</span></td>
                      <td>{d.date ?? d.startDate ?? t.bookedOn}</td>
                      <td>{t.pax} {t.pax > 1 ? 'Adults' : 'Adult'}</td>
                      <td><b>{inr(t.totalInr)}</b><br /><span className="muted">Paid</span></td>
                      <td><span className={statusTag(st)}>{st}</span></td>
                      <td>
                        <Link className="btn btn-sm btn-line" to="/travel/confirm">View details</Link>{' '}
                        {!isCancelled && st.toLowerCase().includes('complete') === false && (
                          <button type="button" className="btn btn-sm btn-line" onClick={() => setCancelled((prev) => new Set(prev).add(t.id))}>Cancel</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </section>

      <section className="blk rise d3" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ marginBottom: 18 }}>Need help? Easy modification · Best price guarantee · Secure payments</p>
        <Link className="btn btn-gold" to="/travel/packages">Explore more packages</Link>
      </section>

      <TrustBar items={['Best price guarantee', '24/7 support', 'Secure booking', 'Easy cancellation', 'Loyalty rewards']} />
    </>
  );
}
