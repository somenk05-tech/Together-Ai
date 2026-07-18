import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { PaymentSheet } from '@/features/financial/PaymentSheet';
import { payError, type PayMethod } from '@/features/financial/api';
import { useGroceryCart, usePlaceOrder } from '../hooks';

interface Line { name: string; qty: number; price: number }
interface CheckoutState { items?: Line[]; subtotal?: number }

const FALLBACK: Line[] = [
  { name: 'Spinach 250g', qty: 2, price: 25 },
  { name: 'Toor Dal 1kg', qty: 1, price: 120 },
  { name: 'Brown Rice 1kg', qty: 1, price: 95 },
  { name: 'Paneer 200g', qty: 2, price: 80 },
  { name: 'Milk 1L', qty: 3, price: 60 },
  { name: 'Almonds 200g', qty: 1, price: 110 },
];

const DELIVERY_SLOTS = [
  'Perishables — Tomorrow, 7–9 AM',
  'Non-perishables — Express 45–60 min',
  'Reschedule',
];

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: 10,
  background: 'var(--paper)', color: 'var(--ink)',
};

/** Checkout — review the list, choose delivery, pay from wallet or card. */
export function Checkout() {
  const { state } = useLocation() as { state: CheckoutState | null };
  const cart = useGroceryCart();
  const placeOrder = usePlaceOrder();
  const navigate = useNavigate();
  const [slot, setSlot] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  const lines: Line[] = useMemo(() => {
    if (state?.items?.length) return state.items;
    const items = cart.data?.items;
    if (items?.length) return items.map((it) => ({ name: it.name, qty: it.qty, price: it.priceInr }));
    return FALLBACK;
  }, [state, cart.data]);

  if (cart.isLoading && !state?.items?.length) return <Spinner label="Loading your order…" />;

  const isOn = (i: number) => checked[i] ?? true;
  const subtotal = lines.reduce((a, l, i) => a + (isOn(i) ? l.price * l.qty : 0), 0);
  const savings = Math.round(subtotal * 0.05);
  const total = subtotal - savings;

  const pay = (method: PayMethod) => {
    placeOrder.mutate(method, {
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
            <label className="muted" style={{ fontSize: 11 }}>Delivery address</label>
            <input defaultValue="Home – 402, Willow Residency, Bandra West, Mumbai 400050" style={{ ...inputStyle, margin: '4px 0 16px' }} />
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Choose a slot</p>
            <div className="pill-row">
              {DELIVERY_SLOTS.map((s, i) => (
                <span key={s} className={`pill${slot === i ? ' on' : ''}`} onClick={() => setSlot(i)} style={{ cursor: 'pointer' }}>{s}</span>
              ))}
            </div>
          </div>

          <div className="blk-head"><h2>3 · Payment</h2></div>
          <div className="card">
            <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
              Nothing is charged until you confirm. Choose wallet or card on the next step.
            </p>
            <Button variant="accent" onClick={() => setPayOpen(true)}>Choose payment method →</Button>
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
            <Button variant="accent" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={() => setPayOpen(true)}>
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
