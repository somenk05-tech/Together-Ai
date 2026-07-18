import { Link } from 'react-router-dom';

const STEPS = [
  { label: 'Confirmed', state: 'done' },
  { label: 'Preparing', state: 'on' },
  { label: 'Shipped', state: '' },
  { label: 'Delivered', state: '' },
];

const LOOP = [
  { h: '1. Share Feedback', p: 'Tell us how your skin & hair respond after 4 weeks.' },
  { h: '2. AI Analyzes', p: 'Combined with your next skin scan & lab results.' },
  { h: '3. Personalized Update', p: 'Your next routine adjusts automatically.' },
];

/** Order Confirmed — the beauty routine confirmation + AI feedback loop. Static like the original. */
export function Confirm() {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="card center" style={{ maxWidth: 640, margin: '20px auto 32px', padding: '44px 36px' }}>
        <div className="ring" data-pct="100" style={{ margin: '0 auto' }}>
          <svg width="120" height="120"><circle className="bgc" cx="60" cy="60" r="54" /><circle className="fgc" cx="60" cy="60" r="54" /></svg>
          <div className="cent" style={{ color: '#2e7d4f' }}><b>✓</b><span>Confirmed</span></div>
        </div>
        <h1 style={{ fontSize: 28, marginTop: 16 }}>Your routine is confirmed!</h1>
        <p className="muted" style={{ marginTop: 6 }}>Order <b className="mono" style={{ color: 'var(--ink)' }}>TC-BEA-11203</b> · ₹8,695 paid via UPI</p>
      </div>

      <div className="grid2" style={{ maxWidth: 900, margin: '0 auto 32px' }}>
        <div className="card">
          <h4 style={{ marginBottom: 10 }}>What happens next</h4>
          <div className="stepper" style={{ marginTop: 6 }}>
            {STEPS.map((s, i) => (
              <div key={s.label} className={`step${s.state ? ` ${s.state}` : ''}`}>
                <div className="dot">{s.state === 'done' ? '✓' : i + 1}</div>{s.label}
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Estimated delivery: 3–4 days · free delivery, easy replacement.</p>
        </div>
        <div className="note">◈ Next buying cycles — Hair Care after 27 days (11 Aug 2026), Skin &amp; Supplements after 57 days (10 Sep 2026). We'll remind you before each one.</div>
      </div>

      <section className="blk" style={{ maxWidth: 900, margin: '0 auto' }}>
        <div className="blk-head"><h2>Your AI feedback loop</h2></div>
        <div className="grid3">
          {LOOP.map((l) => (
            <div key={l.h} className="card center">
              <h4>{l.h}</h4>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{l.p}</p>
            </div>
          ))}
        </div>
      </section>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center', marginTop: 32 }}>
        <Link className="btn btn-accent" to="/beauty/orders">View my orders</Link>
        <Link className="btn btn-line" to="/beauty/market">Continue shopping</Link>
        <Link className="btn btn-line" to="/beauty/profile">Refresh analysis in 60 days</Link>
      </div>

      <div className="trust">
        <span>◈ Free Delivery</span><span>◈ Easy Replacement</span><span>◈ Dermatologist Approved</span><span>◈ 100% Authentic</span>
      </div>
    </div>
  );
}
