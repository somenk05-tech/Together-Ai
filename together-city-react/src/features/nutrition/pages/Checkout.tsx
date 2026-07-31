import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { useGroceryCart, useLastDeliveryAddress, usePlaceOrder } from '../hooks';

interface Line { name: string; qty: number; price: number }
interface CheckoutState { items?: Line[]; subtotal?: number }

/**
 * There is no FALLBACK basket any more.
 *
 * An empty cart used to render six invented groceries — spinach, dal, rice,
 * paneer, milk, almonds — with prices, a total, and a live Pay button beneath
 * them. A citizen could be charged for a basket they never assembled, and the
 * confirmation screen would then list it back to them as a receipt. An empty
 * cart is now an empty cart.
 *
 * The delivery slots went with it. They were never sent anywhere: placeOrder
 * took a payment method and nothing else, so the choice was recorded in React
 * state and thrown away when the page unmounted.
 *
 * The address is now real. It is typed by the citizen, saved to their Master
 * Profile — the one record every hub reads — and copied onto the order, so
 * editing where they live later does not rewrite where an old order went. The
 * API refuses an order without one.
 *
 * And the screen says plainly that delivery has not started. Collecting an
 * address while implying a van is coming would be a worse lie than the invented
 * one this replaced: it would be true data supporting a false promise. What the
 * citizen gets today is the list, with the quantities worked out, to use on
 * whichever service already delivers to them.
 */
const addressStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: 10,
  background: 'var(--paper)', color: 'var(--ink)', fontFamily: 'inherit', fontSize: 13.5,
  minHeight: 76, resize: 'vertical',
};

/** Checkout — review the list, choose delivery, pay from wallet or card. */
export function Checkout() {
  const { state } = useLocation() as { state: CheckoutState | null };
  const cart = useGroceryCart();
  const placeOrder = usePlaceOrder();
  const lastAddress = useLastDeliveryAddress();
  const [address, setAddress] = useState('');
  const [addressTouched, setAddressTouched] = useState(false);
  // Prefill with the address the last order went to, once, and only if the
  // citizen has not started typing. Their own previous answer, never invented.
  useEffect(() => {
    const previous = lastAddress.data?.deliveryAddress;
    if (previous && !addressTouched && !address) setAddress(previous);
  }, [lastAddress.data, addressTouched, address]);
  const navigate = useNavigate();
  const [payOpen, setPayOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const lines: Line[] = useMemo(() => {
    if (state?.items?.length) return state.items;
    const items = cart.data?.items;
    if (items?.length) return items.map((it) => ({ name: it.name, qty: it.qty, price: it.priceInr }));
    return [];
  }, [state, cart.data]);

  if (cart.isLoading && !state?.items?.length) return <Spinner label="Loading your order…" />;

  if (!lines.length) {
    return (
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '48px 16px' }}>
        <div className="eyebrow">Checkout</div>
        <h1 style={{ marginBottom: 10 }}>Your basket is empty</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          Nothing has been added yet, so there is nothing to pay for. Your grocery list is built from
          the meals in your plan — open it and add what you need.
        </p>
        <Link className="btn btn-accent" to="/nutrition/grocery" style={{ marginTop: 18 }}>Open the grocery list</Link>
      </div>
    );
  }

  // The API refuses an order with no address; say so here rather than letting
  // the refusal be the first they hear of it, after choosing a payment method.
  const addressReady = address.trim().length >= 10;
  const isOn = (i: number) => checked[i] ?? true;
  const subtotal = lines.reduce((a, l, i) => a + (isOn(i) ? l.price * l.qty : 0), 0);
  const savings = Math.round(subtotal * 0.05);
  const total = subtotal - savings;

  const pay = (method: PayMethod) => {
    placeOrder.mutate({ method, deliveryAddress: address.trim() }, {
      onSuccess: () => {
        setPayOpen(false);
        const kept = lines.filter((_, i) => isOn(i));
        navigate('/nutrition/confirm', { state: { type: 'order', items: kept, total } });
      },
    });
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Checkout</div>
      <h1 style={{ marginBottom: 20 }}>Review, deliver &amp; pay</h1>

      <div className="stepper" style={{ marginBottom: 34 }}>
        <div className="step done"><span className="dot">✓</span>Review list</div>
        <div className="step done"><span className="dot">✓</span>Delivery</div>
        <div className="step on"><span className="dot">3</span>Payment</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)', gap: 32, alignItems: 'start' }}>
        <div>
          <div className="blk-head"><h2>1 · Review your list</h2></div>
          <div className="card" style={{ marginBottom: 30 }}>
            {lines.map((it, i) => (
              <label key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)', fontSize: 13, textTransform: 'capitalize' }}>
                <span>
                  <input type="checkbox" checked={isOn(i)} onChange={(e) => setChecked((p) => ({ ...p, [i]: e.target.checked }))} style={{ marginRight: 10 }} />
                  {it.name} × {it.qty}
                </span>
                <b>₹{it.price * it.qty}</b>
              </label>
            ))}
          </div>

          <div className="blk-head"><h2>2 · Delivery</h2></div>
          <div className="card" style={{ marginBottom: 30 }}>
            <label className="muted" style={{ fontSize: 11, display: 'block', marginBottom: 4 }} htmlFor="delivery-address">
              Delivery address
            </label>
            <textarea
              id="delivery-address"
              value={address}
              onChange={(e) => { setAddress(e.target.value); setAddressTouched(true); }}
              placeholder="Flat, building, street, area, city and PIN"
              maxLength={300}
              style={addressStyle}
            />
            <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0', lineHeight: 1.5 }}>
              {lastAddress.data?.deliveryAddress && !addressTouched
                ? 'From your profile. Edit it here if it has changed — the change is saved.'
                : 'Saved to your profile, so no other part of Together City has to ask you again.'}
            </p>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
              <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>
                <b>We are not delivering yet.</b> Your address is saved and you will be told the day
                delivery starts in your area — nothing to sign up for.
              </p>
              <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0', lineHeight: 1.6 }}>
                In the meantime your{' '}
                <Link to="/nutrition/grocery" style={{ color: 'var(--accent)', fontWeight: 600 }}>grocery list</Link>{' '}
                is yours to use anywhere — it has the quantities worked out from your plan, so you can
                order it from whichever service already delivers to you.
              </p>
            </div>
          </div>

          <div className="blk-head"><h2>3 · Payment</h2></div>
          <div className="card">
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Nothing is charged until you confirm. Choose wallet or card on the next step.
            </p>
            <Button variant="accent" disabled={!addressReady} onClick={() => setPayOpen(true)}>Choose payment method →</Button>
            {!addressReady && (
              <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                Add a delivery address above and this opens.
              </p>
            )}
          </div>
        </div>

        <div style={{ position: 'sticky', top: 96 }}>
          <div className="card">
            <h4 style={{ marginBottom: 14 }}>Order Summary</h4>
            {([['Subtotal', `₹${subtotal.toLocaleString('en-IN')}`], ['Savings', `−₹${savings.toLocaleString('en-IN')}`], ['Delivery', 'FREE']] as const).map(([lab, val], i) => (
              <div key={lab} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--line)', color: i === 1 ? '#2e7d4f' : undefined }}>
                <span style={{ color: 'var(--ink)' }}>{lab}</span><span>{val}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, padding: '8px 0' }}>
              <span>Total</span><span>₹{total.toLocaleString('en-IN')}</span>
            </div>
            <Button variant="accent" disabled={!addressReady} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={() => setPayOpen(true)}>
              PAY ₹{total.toLocaleString('en-IN')}
            </Button>
          </div>
        </div>
      </div>

      <PaymentSheet
        open={payOpen}
        amountInr={total}
        label={`Grocery order · ${lines.filter((_, i) => isOn(i)).length} items`}
        pending={placeOrder.isPending}
        error={placeOrder.isError ? payError(placeOrder.error) : null}
        onCancel={() => setPayOpen(false)}
        onPay={pay}
      />
    </div>
  );
}
