import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { ProductShot } from '@/features/beauty/components/ProductShot';
import { StoreBar } from './StoreFront';
import type { Shop } from './types';

/**
 * ── THE BAG, AND THE TILL, INSIDE THE STORE ─────────────────────────────────
 *
 * The owner's call, 22 Aug: you do not leave the shop to pay. The beauty hub
 * already had a checkout page and it is a good one — every line with its
 * photograph, quantities still editable, the total at the foot — but arriving
 * at it means arriving in the Beauty Market's chrome, which is the one thing
 * this store was built not to do.
 *
 * SO THE MONEY PATH IS SHARED AND ONLY THE ROOM IS NEW. The bag is the same
 * server bag, the sheet is the city's own `PaymentSheet` (wallet or card, one
 * implementation, one place where a charge is authorised), and the order goes
 * through the same mutation the hub uses. Nothing about paying is reimplemented
 * here — if it were, there would be two answers to "what did this cost" the
 * first time either changed.
 *
 * QUANTITIES ARE EDITABLE ON THIS PAGE, for the reason the hub's own checkout
 * gives: the last place somebody reads a list is exactly where they change
 * their mind about it, and sending them back to the shelf to drop one item is
 * how a bag gets abandoned instead of trimmed.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function StoreBagPage({ shop }: { shop: Shop }) {
  const [payOpen, setPayOpen] = useState(false);
  const [paid, setPaid] = useState(false);
  const back = shop.screens.shelf;

  if (shop.isLoading) {
    return (
      <div className="st-page">
        <StoreBar shop={shop} back={back} backLabel={shop.title} name="Bag" />
        <div className="st-wait"><Spinner label="Reading your bag…" /></div>
      </div>
    );
  }

  const bag = shop.bag;
  const empty = !bag || bag.count === 0;

  return (
    <div className="st-page">
      <StoreBar shop={shop} back={back} backLabel={shop.title} name="Bag" />

      <header className="st-head">
        <div className="st-eyebrow">{shop.title}</div>
        <h1 className="st-title">{empty ? 'Your bag is empty' : 'Your bag'}</h1>
        {!empty && (
          <p className="st-line">
            Nothing is charged until you pay. Same bag as in {shop.hubName} — wherever you filled it.
          </p>
        )}
      </header>

      {paid && empty && (
        <div className="st-paid">✓ {shop.quoteOnly ? shop.quoteOnly.done : `Paid. Your order is in ${shop.hubName}, with the rest of your orders.`}</div>
      )}

      {empty ? (
        <div className="st-wait">
          <EmptyState
            title="Nothing in it yet"
            hint="Add something from the shelf and it will wait for you here."
            action={<Link to={back} className="st-cta">Back to the shelf</Link>}
          />
        </div>
      ) : (
        <div className="st-bag">
          <div className="st-lines">
            {bag.lines.map((l) => (
              <div key={l.id} className="st-row">
                <span className="st-row-shot">
                  <ProductShot image={l.image} imageAlt={l.imageAlt} category={l.category} size={56} />
                </span>
                <span className="st-row-name">
                  <span className="st-name">{l.name}</span>
                  <span className="st-brand">{rupees(l.priceInr)} each</span>
                </span>
                {/* A COMMISSION IS ONE OF A KIND. A ± control on a stone cut
                    to one body weight and set in one metal offers an action
                    that cannot be honoured — two of it is a second
                    commission, at a second price, made from a second
                    decision. So that shelf gets Remove instead. */}
                {shop.fixedQty ? (
                  <button type="button" className="st-quiet st-row-qty" disabled={shop.isSaving} onClick={() => shop.remove(l.id)}>Remove</button>
                ) : (
                  <span className="st-qty st-row-qty">
                    <button type="button" disabled={shop.isSaving} onClick={() => shop.remove(l.id)} aria-label={`One fewer ${l.name}`}>–</button>
                    <span>{l.qty}</span>
                    <button type="button" disabled={shop.isSaving} onClick={() => shop.add(l.id)} aria-label={`One more ${l.name}`}>+</button>
                  </span>
                )}
                <span className="st-row-sum">{rupees(l.priceInr * l.qty)}</span>
              </div>
            ))}
          </div>

          {bag.removed > 0 && (
            <p className="st-blocked">
              {bag.removed} item{bag.removed === 1 ? '' : 's'} left your bag because {bag.removed === 1 ? 'it is' : 'they are'} no
              longer sold. Nothing was charged for {bag.removed === 1 ? 'it' : 'them'}.
            </p>
          )}

          <div className="st-sum">
            <span className="st-sum-label">Total</span>
            <span className="st-brand">{bag.count} item{bag.count === 1 ? '' : 's'}</span>
            <span className="st-total">{rupees(bag.totalInr)}</span>
          </div>

          <div className="st-pay">
            <button type="button" className="st-cta st-cta-wide" disabled={shop.payPending}
              onClick={() => (shop.quoteOnly ? shop.pay('wallet', () => setPaid(true)) : setPayOpen(true))}>
              {shop.quoteOnly ? `${shop.quoteOnly.cta} · about ${rupees(bag.totalInr)}` : `Pay ${rupees(bag.totalInr)}`}
            </button>
            <Link to={back} className="st-quiet">Keep shopping</Link>
            <button type="button" className="st-quiet" disabled={shop.isSaving} onClick={() => shop.clear()}>Empty the bag</button>
          </div>
          {shop.payError && <p className="st-error">{shop.payError}</p>}
        </div>
      )}

      <PaymentSheet
        open={payOpen}
        amountInr={bag?.totalInr ?? 0}
        label={`${shop.title} · ${bag?.count ?? 0} item${bag?.count === 1 ? '' : 's'}`}
        pending={shop.payPending}
        error={shop.payError}
        onCancel={() => setPayOpen(false)}
        onPay={(method) => shop.pay(method, () => { setPaid(true); setPayOpen(false); })}
      />
    </div>
  );
}
