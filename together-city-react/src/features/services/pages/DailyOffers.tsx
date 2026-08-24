import { Link } from 'react-router-dom';
import { Card, Button, Spinner, EmptyState } from '@/components/ui';
import { useOffersToday, useEnquire, useToggleRegular, offerWhen, rupees, humanDistance } from '../api';

/**
 * DAILY OFFERS — what is actually on today.
 *
 * An offer carries the days it runs and disappears on its own. That is the
 * whole design decision here, and it is the one that keeps this page worth
 * opening: a "today's offer" flag that a shopkeeper has to remember to switch
 * off becomes last month's discount with today's date on it, and a page of
 * stale offers is worse than a page with none — it teaches people not to look.
 *
 * An offer whose business has since closed is dropped rather than shown. The
 * discount is real; the shop is not, and sending somebody to a door that no
 * longer opens is the worst outcome this page can produce.
 */
export function DailyOffers() {
  const q = useOffersToday();
  const enquire = useEnquire();
  const toggle = useToggleRegular();

  if (q.isLoading) return <Spinner label="Looking for today's offers…" />;
  if (q.isError) return <EmptyState title="Couldn't load today's offers" hint="Try again in a moment." />;

  const rows = q.data?.items ?? [];
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div>
      <div className="eyebrow">Local Services</div>
      <h1 style={{ fontSize: 26 }}>Daily offers</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', maxWidth: '62ch' }}>
        What businesses near you are offering on {today}. Every one of these has an end
        date and goes away on its own, so nothing here is stale.
      </p>

      {rows.length === 0 ? (
        <>
          <EmptyState
            title="Nothing on today"
            hint="Businesses post their own offers, and they run for the days they choose. If you list a business, this is where yours would appear."
          />
          <Link to="/services/mine"><Button variant="line">Post an offer</Button></Link>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%, 300px), 1fr))', gap: 14 }}>
          {rows.map((o) => (
            <Card key={o.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 'var(--r-full)', padding: '2px 9px' }}>
                  {offerWhen(o)}
                </span>
                {o.startsToday && (
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase' }}>New</span>
                )}
              </div>
              <strong style={{ fontSize: 17, letterSpacing: '-.01em' }}>{o.title}</strong>
              {o.detail && <p style={{ fontSize: 13.5, margin: 0 }}>{o.detail}</p>}

              <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 2 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.business.businessName}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {o.business.categoryLabel}
                  {' · '}
                  {o.business.areas.length ? o.business.areas.join(' · ') : o.business.city}
                  {o.business.distanceKm != null && <> · {humanDistance(o.business.distanceKm)} away</>}
                  {o.business.priceFrom != null && <> · from {rupees(o.business.priceFrom)}</>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
                <Button variant="accent" size="sm" disabled={enquire.isPending}
                  onClick={() => enquire.mutate({ id: o.business.id })}>Chat</Button>
                <Button variant="line" size="sm" disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ id: o.business.id, saved: false })}>Keep</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
