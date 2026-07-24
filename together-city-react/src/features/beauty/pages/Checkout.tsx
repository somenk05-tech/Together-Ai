import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const PAY_METHODS = ['UPI — Together Wallet', 'Card ending 4471', 'Pay on Delivery'];

const GROUPS = [
  { group: 'Skin Care Routine (AM + PM)', items: '8 items', amount: '₹5,946' },
  { group: 'Hair Care Routine', items: '2 items · monthly', amount: '₹898' },
  { group: 'Supplements & Masks', items: '5 items · monthly', amount: '₹2,401' },
];

/** Checkout — review & confirm the curated routine. Static totals like the original. */
export function Checkout() {
  const navigate = useNavigate();
  const [method, setMethod] = useState(0);
  const [placing, setPlacing] = useState(false);

  const placeOrder = () => {
    setPlacing(true);
    setTimeout(() => navigate('/beauty/confirm'), 900);
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ marginBottom: 28 }}>
        <div className="eyebrow">Beauty Market · Checkout</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Review &amp; confirm your routine</h1>
        <p className="lede" style={{ marginTop: 6 }}>15 items · your first 60-day routine, built from your Beauty Profile.</p>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div>
          <section className="blk">
            <div className="blk-head"><h2>Delivery address</h2><span className="muted" style={{ fontSize: 12 }}>Change →</span></div>
            <div className="card">
              <h4>Somen</h4>
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Home · 400001, Bandra West, Mumbai</p>
              <p className="muted" style={{ fontSize: 13 }}>+91 98xxxxxx91</p>
            </div>
          </section>

          <section className="blk">
            <div className="blk-head"><h2>Payment method</h2></div>
            <div className="pill-row">
              {PAY_METHODS.map((m, i) => (
                <button key={m} type="button" onClick={() => setMethod(i)}
                  className={`pill${method === i ? ' on' : ''}`}
                  style={{ cursor: 'pointer', font: 'inherit' }}>{m}</button>
              ))}
            </div>
          </section>

          <section className="blk">
            <div className="blk-head"><h2>Order groups</h2></div>
            <table className="tc">
              <tbody>
                <tr><th>Group</th><th>Items</th><th>Amount</th></tr>
                {GROUPS.map((g) => (
                  <tr key={g.group}><td>{g.group}</td><td>{g.items}</td><td><b>{g.amount}</b></td></tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>

        <aside className="card" style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)' }}>
          <h4 style={{ marginBottom: 14 }}>Order summary</h4>
          <div style={{ fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}><span className="muted">Subtotal (15 items)</span><span>₹9,245</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, color: '#2e7d4f' }}><span>You Save</span><span>−₹550</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span className="muted">Shipping</span><span>Free</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 19, fontFamily: 'var(--serif)', borderTop: '1px solid var(--line)', paddingTop: 10 }}><span>Total</span><span>₹8,695</span></div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Inclusive of all taxes · paid via {PAY_METHODS[method].split(' — ')[0]}</p>
          </div>
          <button type="button" className="btn btn-accent" onClick={placeOrder} disabled={placing}
            style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
            {placing ? 'Processing…' : 'Place Order — ₹8,695 →'}
          </button>
          <p className="muted" style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}>◈ Secure checkout · Easy returns within 7 days</p>
          <p style={{ fontSize: 12, marginTop: 8, textAlign: 'center' }}><Link to="/beauty/market" style={{ color: 'var(--accent)', fontWeight: 600 }}>← Back to the market</Link></p>
        </aside>
      </div>
    </div>
  );
}
