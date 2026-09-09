import { Link, useParams } from 'react-router-dom';
import { Card, Fold, Spinner, EmptyState } from '@/components/ui';
import { useBusinessOrders, useMyServices, rupees } from '../api';
import { OrderCard } from '../ThreadOrder';

/**
 * THE ORDERS BOARD, AS ITS OWN ROOM (owner, 24 Aug — "a separate tab where
 * business owners can go and accept orders").
 *
 * It stands beside Invoices and Payments and follows their rule: per LISTING,
 * not per owner — somebody with a restaurant and a tuition class runs two
 * counters. My Business keeps a one-line summary that points here; this page
 * is the counter itself, and it polls while it is open because a kitchen does
 * not press refresh.
 *
 * Everything on a card is the same card the thread shows — Accept with the
 * wait in minutes, Reject with a reason the customer reads verbatim, then the
 * status walked forward one step at a time. Money is already taken when an
 * order lands here, and a no is a refund the same minute.
 */
export function BizOrders() {
  const { id } = useParams<{ id: string }>();
  const mine = useMyServices();
  const q = useBusinessOrders(id);

  const listing = (mine.data ?? []).find((l) => l.id === id);
  if (mine.isLoading || q.isLoading) return <Spinner label="Opening the board…" />;
  // Not yours, or gone — the same 404 shape the API answers with.
  if (!listing) return <EmptyState title="This business is not yours to run" hint="The orders board belongs to the listing's owner." />;
  if (q.isError) return <EmptyState title="Couldn't load the orders" hint="Nothing is lost — try again in a moment." />;

  const open = q.data?.open ?? [];
  const done = q.data?.done ?? [];
  const takings = done.filter((o) => o.status === 'completed').reduce((s, o) => s + o.totalInr, 0);

  return (
    <div>
      <div className="eyebrow">{listing.businessName}</div>
      <h1 className="svo-pagehead">Orders</h1>
      <p className="muted svo-pageblurb">
        Every order here is already paid. Accept it and say how long; reject it with a reason and
        the money goes straight back to them.
      </p>

      {open.length === 0 && done.length === 0 && (
        <EmptyState title="No orders yet"
          hint="When somebody orders from your menu, it lands here and in your messages — paid, with a bell." />
      )}

      {open.length > 0 && (
        <>
          <div className="eyebrow svo-eyebrow-gap">Waiting on you · {open.length}</div>
          <div className="svo-stack is-live">
            {open.map((o) => (
              <Card key={o.id} className="svo-gap">
                <OrderCard o={o} />
                <Link to={`/services/messages/${o.enquiryId}`} className="svo-open">
                  Open the conversation →
                </Link>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* THE FINISHED PILE FOLDS, and it folds the way every other section in
          the city folds (8 Sep disclosure audit). It was an eyebrow with a
          Show/Hide button beside it — a fourth spelling of the same gesture,
          announcing nothing, and the only one whose word for "closed" was
          "Show". The meta line is what the closed state is FOR: the takings
          are the number an owner opens this to find, so they are readable
          without opening it. `rememberAs`, because an owner who opened the
          pile and walked into one order should not have to open it again. */}
      {done.length > 0 && (
        <Fold title={`Finished · ${done.length}`} rememberAs="biz-orders-finished"
          meta={takings > 0 ? `${rupees(takings)} taken through completed orders shown here` : undefined}>
          <div className="svo-stack">
            {done.map((o) => (
              <Card key={o.id} className="svo-gap svo-dim">
                <OrderCard o={o} />
                <Link to={`/services/messages/${o.enquiryId}`} className="svo-open">
                  Open the conversation →
                </Link>
              </Card>
            ))}
          </div>
        </Fold>
      )}
    </div>
  );
}
