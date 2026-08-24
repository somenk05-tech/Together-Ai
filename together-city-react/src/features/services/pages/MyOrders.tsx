import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState } from '@/components/ui';
import { useMyOrders } from '../api';
import { OrderCard } from '../ThreadOrder';

/**
 * EVERY ORDER THE CITIZEN HAS PLACED, newest first — live ones on top with the
 * same card the thread shows (cancel included, while it is still allowed), and
 * the finished ones as the record they are. Each links to its conversation,
 * because the thread is where the kitchen answers.
 */
export function MyOrders() {
  const q = useMyOrders();
  if (q.isLoading) return <Spinner label="Loading your orders…" />;
  if (q.isError) return <EmptyState title="Couldn't load your orders" hint="Nothing is lost — try again in a moment." />;

  const orders = q.data?.orders ?? [];
  const live = orders.filter((o) => ['submitted', 'accepted', 'preparing', 'ready'].includes(o.status));
  const done = orders.filter((o) => !['submitted', 'accepted', 'preparing', 'ready'].includes(o.status));

  return (
    <div>
      <div className="eyebrow">Local Services</div>
      <h1 className="svo-pagehead">My orders</h1>
      <p className="muted svo-pageblurb">
        Paid from your wallet when you placed them. If a business rejects one, or you cancel
        before they accept, every rupee comes straight back.
      </p>

      {orders.length === 0 && (
        <EmptyState title="No orders yet"
          hint="Find a restaurant under Find a service — its menu takes orders right on the page." />
      )}

      {live.length > 0 && (
        <>
          <div className="eyebrow svo-eyebrow-gap">Right now</div>
          <div className="svo-stack is-live">
            {live.map((o) => (
              <Card key={o.id} className="svo-gap">
                {o.businessName && <strong className="svo-cardname">{o.businessName}</strong>}
                <OrderCard o={o} />
                <Link to={`/services/messages/${o.enquiryId}`} className="svo-open">
                  Open the conversation →
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}

      {done.length > 0 && (
        <>
          <div className="eyebrow">Earlier</div>
          <div className="svo-stack">
            {done.map((o) => (
              <Card key={o.id} className="svo-gap svo-dim">
                {o.businessName && <strong className="svo-cardname">{o.businessName}</strong>}
                <OrderCard o={o} />
                <Link to={`/services/messages/${o.enquiryId}`} className="svo-open">
                  Open the conversation →
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
