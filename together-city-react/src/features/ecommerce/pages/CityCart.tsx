import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader, Spinner } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { ProductShot } from '@/features/beauty/components/ProductShot';
import { HUBS } from '@/config/hubs';
import { useCityCart } from '../store/useCityCart';

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
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function CityCart() {
  const cart = useCityCart();
  const [payOpen, setPayOpen] = useState(false);

  if (cart.isLoading) return <Spinner label="Reading your cart…" />;

  const empty = cart.count === 0;
  const failed = cart.outcomes.filter((o) => !o.ok);
  const paidSomething = cart.outcomes.some((o) => o.ok);

  return (
    <>
      <PageHeader
        eyebrow="E-Commerce"
        title="Your Cart"
        sub="Every shop's bag, one total."
      />

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
             rather than typed. A literal here would also be a link this app's
             nav-audit cannot resolve: it reads router.tsx for declared routes,
             and this hub's rooms are declared in the feature's own routes file
             — the shape the Pet district introduced. */
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

          <div className="st-sum">
            <span className="st-sum-label">Total</span>
            <span className="st-brand">
              {cart.count} item{cart.count === 1 ? '' : 's'} · {cart.sections.length} shop{cart.sections.length === 1 ? '' : 's'}
            </span>
            <span className="st-total">{rupees(cart.totalInr)}</span>
          </div>

          <div className="st-pay">
            <button type="button" className="st-cta st-cta-wide" disabled={cart.paying} onClick={() => setPayOpen(true)}>
              {cart.paying ? 'Paying…' : `Pay ${rupees(cart.totalInr)}`}
            </button>
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

      <PaymentSheet
        open={payOpen}
        amountInr={cart.totalInr}
        label={`${cart.count} item${cart.count === 1 ? '' : 's'} across ${cart.sections.length} shop${cart.sections.length === 1 ? '' : 's'}`}
        pending={cart.paying}
        walletOnly
        onCancel={() => setPayOpen(false)}
        onPay={(method) => { setPayOpen(false); cart.payAll(method); }}
      />
    </>
  );
}
