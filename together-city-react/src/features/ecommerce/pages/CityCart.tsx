import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { ProductShot } from '@/features/beauty/components/ProductShot';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { FloorPage } from '../store/Floor';
import { DeliveryAddress } from '../store/DeliveryAddress';
import { useCityCart } from '../store/useCityCart';
import type { AddressLabel } from '@/features/profile/api';

/**
 * ── YOUR CART — EVERY SHOP IN THE CITY, ONE LIST ────────────────────────────
 *
 * The third tab of the district, and a VIEW rather than a fourth bag: the
 * Beauty bag, the Fitness store's bag and the gem bench's locked commissions,
 * each still owned and still editable in its own hub. Something added anywhere
 * is here because it is the same bag — see `useCityCart` for why that matters
 * and what it refuses to show.
 *
 * IT IS SECTIONED BY SHOP AND SAYS SO. One flat list of everything would hide
 * the only thing a citizen needs to understand before pressing Pay: this is one
 * authorisation and three orders, and they can disagree. So each shop is named,
 * carries its own subtotal, and — afterwards — its own result.
 *
 * THE TOTAL IS THE SUM OF WHAT WILL BE CHARGED and nothing else. No delivery,
 * no fee, no saving, no "you save ₹1,225" — there is no MRP anywhere in this
 * city's catalogues, so any of those figures could only have been invented.
 *
 * AND IT IS THE STORE'S ONE CHECKOUT (owner, 7 Sep: "the checkout needs to be
 * common for all sectors"). Every tab of both sections points here — the Cart
 * on the bar, the bar at the foot — so this page wears the same floor as the
 * store: white, no rail, the two sections on the bar, and no second checkout
 * bar under its own Pay button.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const ROOM = HUBS.ecommerce.items[2];

export function CityCart() {
  useHubTheme(null);
  const cart = useCityCart();
  const [payOpen, setPayOpen] = useState(false);
  /* THE DOOR THE ORDERS GO TO (7 Sep) — the label of a page in the citizen's
     address book, chosen on this page and sent with every till's order. Null
     until one is chosen, and Pay waits for it: a parcel with no door is not
     an order anybody can fulfil. */
  const [door, setDoor] = useState<AddressLabel | null>(null);
  const floor = { path: ROOM.path, tabs: null, cart };

  if (cart.isLoading) {
    return (
      <FloorPage floor={floor} baglet={false}>
        <div className="st-wait"><Spinner label="Reading your cart…" /></div>
      </FloorPage>
    );
  }

  const empty = cart.count === 0;
  const failed = cart.outcomes.filter((o) => !o.ok);
  const paidSomething = cart.outcomes.some((o) => o.ok);

  return (
    <FloorPage floor={floor} baglet={false}>
      <header className="st-head sf-head">
        <div className="st-eyebrow">{HUBS.ecommerce.name}</div>
        <h1 className="st-title">{ROOM.label}</h1>
        <p className="st-line">{ROOM.sub}</p>
      </header>
      <div className="st-bag">

      {cart.outcomes.length > 0 && (
        <div className="st-outcomes">
          {cart.outcomes.map((o) => (
            <p key={o.key} className={o.ok ? 'st-paid' : 'st-error'}>
              {o.ok ? '✓' : '✕'} {o.title} — {o.message}
            </p>
          ))}
          {failed.length > 0 && paidSomething && (
            <p className="st-blocked">
              The orders that went through are paid for and are in their own hub’s order
              history. Whatever failed is still in its bag here, exactly as it was — nothing
              was charged for it.
            </p>
          )}
        </div>
      )}

      {empty ? (
        <EmptyState
          title="Your cart is empty"
          hint="Add something from any shop in the city and it will be waiting here."
          /* THE FIRST ROOM OF THIS DISTRICT, read from the hub's own rail
             rather than typed. */
          action={(
            <Link to={HUBS.ecommerce.items[0].path} className="st-cta st-cta-wide">
              Open the {HUBS.ecommerce.items[0].label}
            </Link>
          )}
        />
      ) : (
        <>
          {cart.sections.map((s) => (
            <section key={s.key} className="st-section">
              <div className="st-section-head">
                <span className="st-sum-label">{s.title}</span>
                <span className="st-brand">{s.hubName}</span>
                <span className="st-row-sum">{rupees(s.totalInr)}</span>
              </div>
              <div className="st-lines">
                {s.lines.map((l) => (
                  <div key={`${s.key}-${l.id}`} className="st-row">
                    <span className="st-row-shot">
                      <ProductShot image={l.image} imageAlt={l.imageAlt} category={l.category} size={56} />
                    </span>
                    <span className="st-row-name">
                      <span className="st-name">{l.name}</span>
                      <span className="st-brand">{rupees(l.priceInr)} each</span>
                    </span>
                    {s.fixedQty ? (
                      <button type="button" className="st-quiet st-row-qty" disabled={s.isSaving} onClick={() => s.remove(l.id)}>Remove</button>
                    ) : (
                      <span className="st-qty st-row-qty">
                        <button type="button" disabled={s.isSaving} onClick={() => s.remove(l.id)} aria-label={`One fewer ${l.name}`}>–</button>
                        <span>{l.qty}</span>
                        <button type="button" disabled={s.isSaving} onClick={() => s.add(l.id)} aria-label={`One more ${l.name}`}>+</button>
                      </span>
                    )}
                    <span className="st-row-sum">{rupees(l.priceInr * l.qty)}</span>
                  </div>
                ))}
              </div>
              <p className="st-section-foot">
                <Link to={s.shelfPath}>Back to {s.title}</Link>
              </p>
            </section>
          ))}

          <DeliveryAddress chosen={door} onChoose={setDoor} />

          <div className="st-sum">
            <span className="st-sum-label">Total</span>
            <span className="st-brand">
              {cart.count} item{cart.count === 1 ? '' : 's'} · {cart.sections.length} shop{cart.sections.length === 1 ? '' : 's'}
            </span>
            <span className="st-total">{rupees(cart.totalInr)}</span>
          </div>

          <div className="st-pay">
            <button type="button" className="st-cta st-cta-wide" disabled={cart.paying || door === null} onClick={() => setPayOpen(true)}>
              {cart.paying ? 'Paying…' : `Pay ${rupees(cart.totalInr)}`}
            </button>
            {door === null && <p className="st-blocked">Save a delivery address above first.</p>}
          </div>

          {/* SAID BEFORE THE BUTTON, NOT AFTER IT. One press, one amount, and
              one order per shop — which is what happens, and what makes a
              partial failure comprehensible when it happens. */}
          <p className="st-blocked">
            One payment from your city wallet, and one order per shop —
            {' '}{cart.sections.map((s) => s.title).join(', ')}. Each shop confirms separately.
            Nothing is charged until you press Pay.
          </p>
        </>
      )}
      </div>

      <PaymentSheet
        open={payOpen}
        amountInr={cart.totalInr}
        label={`${cart.count} item${cart.count === 1 ? '' : 's'} across ${cart.sections.length} shop${cart.sections.length === 1 ? '' : 's'}`}
        pending={cart.paying}
        walletOnly
        onCancel={() => setPayOpen(false)}
        onPay={(method) => { setPayOpen(false); cart.payAll(method, door ?? undefined); }}
      />
    </FloorPage>
  );
}
