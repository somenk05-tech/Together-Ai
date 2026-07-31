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

/**
 * The Cancel button is gone, and that is the fix rather than a loss.
 *
 * It added the booking's id to a Set in React state and nothing else. The row
 * turned red, the status read "Cancelled", the Cancelled tab found it — and the
 * server never heard. Reload the page and the trip was confirmed again. There
 * is no cancellation endpoint on the travel controller to call: /travel has
 * categories, packages, book, airports, flight search, flight book and trips,
 * and that is all of it. So this was not a wiring mistake. It was a control
 * that could never have worked, on a page listing journeys the citizen has
 * already paid for.
 *
 * A booking someone believes they cancelled is worse than one they know they
 * cannot. Until there is an endpoint, the page says how to cancel instead of
 * pretending to.
 */
export function TravelBookings() {
  const q = useMyTrips();
  const [tab, setTab] = useState(0);

  const statusOf = (t: Trip) => t.status;

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
  }, [q.data, tab]);

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
                <tr><th>Booking details</th><th>Date</th><th>Travellers</th><th>Amount</th><th>Status</th></tr>
                {rows.map((t) => {
                  const st = statusOf(t);
                  const d = t.detail as { date?: string; startDate?: string | null };
                  return (
                    <tr key={t.id}>
                      <td><b>{t.title}</b><br /><span className="muted">{t.subtitle}</span><br /><span className="mono muted">ID {t.code}</span></td>
                      <td>{d.date ?? d.startDate ?? t.bookedOn}</td>
                      <td>{t.pax} {t.pax > 1 ? 'Adults' : 'Adult'}</td>
                      <td><b>{inr(t.totalInr)}</b><br /><span className="muted">Paid</span></td>
                      <td><span className={statusTag(st)}>{st}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
      </section>

      <section className="blk rise d3" style={{ textAlign: 'center' }}>
        <p className="muted" style={{ fontSize: 12.5, maxWidth: '62ch', margin: '0 auto 18px', lineHeight: 1.65 }}>
          Changing or cancelling a booking isn’t something we can do for you inside Together City yet.
          Your booking reference is on each row above — the airline or the trip operator will need it,
          and they can act on it today. We’d rather point you somewhere that works than put a button
          here that doesn’t.
        </p>
        <Link className="btn btn-gold" to="/travel/packages">Explore more packages</Link>
      </section>

      <TrustBar items={['Secure booking', 'Paid from your city wallet', 'Every booking kept here']} />
    </>
  );
}
