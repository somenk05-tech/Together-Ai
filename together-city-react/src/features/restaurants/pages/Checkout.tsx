import { useState } from 'react';
import { Link } from 'react-router-dom';

const lay = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 32, alignItems: 'start' } as const;
const fieldInput = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' } as const;
const itemRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 12, background: 'var(--card)' } as const;

const SLOTS = ['As soon as possible · 25–30 min', 'Schedule for 1:00 PM', 'Schedule for 8:00 PM'];
const PAYS = ['Together Wallet', 'UPI', 'Card •••• 4821', 'Cash on Delivery'];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block' }}>
        <span style={{ display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>{label}</span>
        <input defaultValue={value} style={fieldInput} />
      </label>
    </div>
  );
}

/** Order Checkout — cart review, address, slot and payment. */
export function Checkout() {
  const [slot, setSlot] = useState(0);
  const [pay, setPay] = useState(0);

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div className="eyebrow rise">Checkout</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 20 }}>Green Bowl Kitchen — Order Review</h1>

      <div className="stepper rise">
        <div className="step on"><span className="dot">1</span>Cart</div>
        <div className="step"><span className="dot">2</span>Address &amp; Slot</div>
        <div className="step"><span className="dot">3</span>Payment</div>
      </div>

      <div className="rise" style={lay}>
        <section>
          <h3 style={{ marginBottom: 16 }}>Your Order</h3>
          <div style={itemRow}>
            <div><b>Grilled Salmon Bowl</b> × 1<div className="macro" style={{ marginTop: 4 }}><span className="kcal">540 kcal</span><span><b>32g</b> P</span></div></div>
            <span>₹450</span>
          </div>
          <div style={itemRow}>
            <div><b>Greek Yogurt Berry Parfait</b> × 1<div className="macro" style={{ marginTop: 4 }}><span className="kcal">280 kcal</span><span><b>18g</b> P</span></div></div>
            <span>₹210</span>
          </div>

          <h3 style={{ margin: '28px 0 16px' }}>Delivery Address</h3>
          <Field label="Address" value="Home — 400001, Bandra West, Mumbai" />
          <Field label="Contact number" value="+91 98765 43210" />

          <h3 style={{ margin: '28px 0 16px' }}>Delivery Slot</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {SLOTS.map((s, i) => <span key={s} className={`pill${slot === i ? ' on' : ''}`} style={{ cursor: 'pointer', padding: '9px 14px', fontSize: 12 }} onClick={() => setSlot(i)}>{s}</span>)}
          </div>

          <h3 style={{ margin: '28px 0 16px' }}>Payment Method</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {PAYS.map((p, i) => <span key={p} className={`pill${pay === i ? ' on' : ''}`} style={{ cursor: 'pointer', padding: '9px 14px', fontSize: 12 }} onClick={() => setPay(i)}>{p}</span>)}
          </div>
        </section>

        <aside style={{ position: 'sticky', top: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-deep)' }}>
          <h4 style={{ marginBottom: 12 }}>Order summary</h4>
          {[['Subtotal (2 items)', '₹660'], ['Delivery fee', 'Free — above ₹399'], ['Taxes', '₹33']].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}><span>{l}</span><span>{v}</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 8 }}><span>Total</span><span>₹693</span></div>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Calories and macros for this order sync automatically to your Nutrition daily planner.</p>
          <Link className="btn btn-gold" to="/restaurants/confirm" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Place Order — ₹693</Link>
          <Link to="/financial" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px dashed var(--accent)', borderRadius: 999, padding: '9px 16px', fontSize: 12, color: 'var(--accent)', marginTop: 14, textDecoration: 'none' }}>◈ Split with friends <span>→</span></Link>
        </aside>
      </div>

      <div className="trust">
        <span>◈ Secure payments</span><span>◈ Hygiene verified</span><span>◈ Live tracking</span><span>◈ 24/7 support</span>
      </div>
    </div>
  );
}
