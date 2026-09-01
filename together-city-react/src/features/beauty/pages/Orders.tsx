import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useBagActions, useBeautyOrders, usePlaceBeautyOrder } from '../api';
import { payError, type PayMethod } from '@/features/financial/api';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { NextOrder } from '../components/NextOrder';
import { ProductShot } from '../components/ProductShot';

/**
 * My Orders — and, above them, the bag.
 *
 * CHECKOUT USED TO BE A PAYMENT SHEET OVER WHATEVER PAGE YOU WERE ON. It asked
 * somebody to authorise a charge against a list summarised in one grey line of
 * running text at the foot of a shop — ten products, comma-separated, wrapped
 * over three lines, no prices. That is not a checkout, it is a confirmation
 * dialog with a total on it.
 *
 * So the bar is a link now and this is where it goes: every line with its
 * photograph, its own price and its quantity, the total at the foot, and the
 * wallet under that. Nothing is charged before this page, and the quantities
 * are still editable here — the last place somebody looks at a list is exactly
 * where they change their mind about it.
 *
 * THE BAG SITS ABOVE THE HISTORY because it is the live thing. Once it is paid
 * for it becomes the first row underneath, the bag empties itself, and this
 * page goes back to being what it was called.
 */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function Orders() {
  const orders = useBeautyOrders();
  const bagged = useBagActions();
  const place = usePlaceBeautyOrder();
  const [payOpen, setPayOpen] = useState(false);
  const [placed, setPlaced] = useState(false);

  const bag = bagged.bag;
  const hasBag = Boolean(bag && bag.count > 0);

  if (orders.isLoading || bagged.isLoading) return <Spinner label="Loading your orders…" />;
  if (orders.isError) {
    return (
      <EmptyState
        title="Couldn't load your orders"
        hint="Anything you’ve ordered is unaffected — we just couldn’t read the list. Try again in a moment."
      />
    );
  }

  const list = orders.data ?? [];

  return (
    /* Same sheet as the Market, for the same reason — see the note there. */
    <div className="beauty-sheet">
      <div className="eyebrow">Beauty Market · Orders</div>
      <h1 style={{ fontSize: 26 }}>{hasBag ? 'Your bag' : 'Your orders'}</h1>

      {hasBag && bag && (
        <>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 14px', maxWidth: 560 }}>
            Nothing is charged until you pay.
          </p>

          <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            {bag.lines.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderTop: '1px solid var(--line)' }}>
                <ProductShot image={l.image} imageAlt={l.imageAlt} category={l.category} size={48} />
                <div className="flex-min">
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{l.name}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {rupees(l.priceInr)} each
                  </div>
                </div>
                {/* EDITABLE HERE, deliberately. The last place somebody reads a
                    list is exactly where they change their mind about it, and
                    sending them back to the shop to drop one item is how a bag
                    gets abandoned instead of trimmed. */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Button variant="line" size="sm" disabled={bagged.isSaving} onClick={() => bagged.remove(l.id)}>–</Button>
                  <span style={{ fontWeight: 700, fontSize: 13.5, minWidth: 16, textAlign: 'center' }}>{l.qty}</span>
                  <Button variant="line" size="sm" disabled={bagged.isSaving} onClick={() => bagged.add(l.id)}>+</Button>
                </div>
                <div style={{ minWidth: 88, textAlign: 'right', fontWeight: 700, fontSize: 14 }}>
                  {rupees(l.priceInr * l.qty)}
                </div>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderTop: '1px solid var(--line)', background: 'var(--paper)' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase' }}>Total</span>
              <span className="muted" style={{ fontSize: 12 }}>{bag.count} item{bag.count === 1 ? '' : 's'}</span>
              <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 800, letterSpacing: '-.01em' }}>{rupees(bag.totalInr)}</span>
            </div>
          </div>

          {bag.removed > 0 && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 14px' }}>
              {bag.removed} item{bag.removed === 1 ? '' : 's'} left your bag because {bag.removed === 1 ? 'it is' : 'they are'} no
              longer sold. Nothing was charged for {bag.removed === 1 ? 'it' : 'them'}.
            </p>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            <Button variant="accent" onClick={() => setPayOpen(true)}>
              Pay {rupees(bag.totalInr)} from your city wallet
            </Button>
            <Link to="/beauty/market"><Button variant="line" size="sm">Keep shopping</Button></Link>
            <Button variant="line" size="sm" disabled={bagged.isSaving} onClick={() => bagged.clear()}>Empty the bag</Button>
            {place.isError && (
              <span style={{ fontSize: 12.5, color: 'var(--danger-ink)', fontWeight: 600 }}>{payError(place.error)}</span>
            )}
          </div>
        </>
      )}

      {placed && !hasBag && (
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--accent-ink)', margin: '0 0 16px' }}>
          ✓ Paid. It’s the first order below.
        </p>
      )}

      {hasBag && list.length > 0 && <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Earlier orders</h2>}

      {list.length === 0 && !hasBag ? (
        <div>
          <EmptyState icon="🧴" title="No orders yet" hint="Find your matched products in the market." />
          <div style={{ textAlign: 'center' }}>
            <Link to="/beauty/market"><Button variant="accent" size="sm">Go to the market</Button></Link>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: hasBag ? 0 : 16 }}>
          {list.map((o, at) => (
            <article key={o.id} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 15 }}>{rupees(o.totalInr)}</strong>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'var(--accent-soft)', borderRadius: 'var(--r-full)', padding: '2px 10px' }}>{o.status}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{o.createdAt.slice(0, 10)}</span>
              </div>
              <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                {o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(' · ')}
              </div>
              {/* THE COUNTDOWN GOES ON THE NEWEST ORDER AND NOWHERE ELSE.
                  The server dates every order in the history, because an order
                  IS a supply with a life and one that only the top row knew
                  about could not answer "how long did that last me". But only
                  one of them is a live instruction: an order from March ran out
                  in April, and "Time to reorder" printed against every row a
                  citizen has ever placed is a page of alarms rather than an
                  answer. `at === 0` because the service returns newest first. */}
              {at === 0 && o.reorder && <NextOrder due={o.reorder} variant="row" />}
            </article>
          ))}
        </div>
      )}

      <PaymentSheet
        open={payOpen}
        amountInr={bag?.totalInr ?? 0}
        label={`Beauty order · ${bag?.count ?? 0} item${bag?.count === 1 ? '' : 's'}`}
        pending={place.isPending}
        error={place.isError ? payError(place.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={(method: PayMethod) => place.mutate(
          { items: (bag?.lines ?? []).map((l) => ({ id: l.id, name: l.name, priceInr: l.priceInr, qty: l.qty })), method },
          { onSuccess: () => { setPlaced(true); setPayOpen(false); } },
        )}
      />
    </div>
  );
}
