import { Link } from 'react-router-dom';

const ROWS: [string, string][] = [
  ['Items', 'Grilled Salmon Bowl · Greek Yogurt Berry Parfait'],
  ['Total kcal', '820 kcal'],
  ['Delivering to', 'Home — Bandra West, Mumbai'],
  ['ETA', '25–30 min'],
  ['Total paid', '₹693'],
];

/** Order Confirmed — receipt & live status after checkout. */
export function Confirm() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 40px' }}>
      <div className="rise" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', border: '3px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'var(--gold)', margin: '0 auto 22px' }}>✓</div>
        <div className="eyebrow center">Order confirmed</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Your order from Green Bowl Kitchen is on its way.</h1>
        <p className="lede center" style={{ margin: '10px auto' }}>Order ID <b style={{ fontFamily: 'monospace' }}>TC-RST-30217</b> · Confirmation sent to your Together City app</p>

        <div className="stepper" style={{ marginTop: 26 }}>
          <div className="step done"><span className="dot">✓</span>Placed</div>
          <div className="step on"><span className="dot">2</span>Preparing</div>
          <div className="step"><span className="dot">3</span>On the way</div>
          <div className="step"><span className="dot">4</span>Delivered</div>
        </div>

        <div style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '24px 26px', margin: '28px 0', boxShadow: 'var(--shadow)' }}>
          <h4 style={{ marginBottom: 10 }}>Order Details</h4>
          {ROWS.map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--ink-soft)', padding: '8px 0', borderBottom: '1px solid var(--line)' }}><span>{l}</span><span><b>{v}</b></span></div>
          ))}
        </div>

        <p className="note">We'll ask you to rate this meal once it's delivered — your feedback keeps every listing on Together City honest.</p>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
          <Link className="btn btn-gold" to="/restaurants">Back to Restaurants Hub</Link>
          <Link className="btn btn-line" to="/nutrition/daily">View in Daily Planner</Link>
          <Link className="btn btn-line" to="/restaurants/orders">My Orders</Link>
        </div>
      </div>

      <div className="trust" style={{ marginTop: 60 }}>
        <span>◈ Live tracking</span><span>◈ Secure payments</span><span>◈ 24/7 support</span><span>◈ Hygiene verified</span>
      </div>
    </div>
  );
}
