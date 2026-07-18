import { Link } from 'react-router-dom';
import { TrustBar } from '../shared';

const row2: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--ink-soft)', padding: '8px 0', borderBottom: '1px solid var(--line)' };

export function TravelConfirm() {
  return (
    <>
      <div className="rise" style={{ maxWidth: 640, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', border: '3px solid var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, color: 'var(--gold)', margin: '0 auto 22px' }}>✓</div>
        <div className="eyebrow center">Booking confirmed</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>You're going to the Maldives.</h1>
        <p className="lede center" style={{ margin: '10px auto' }}>Booking ID <b className="mono">TGCTRY-784512</b> · Confirmation sent to aarav.sharma@email.com</p>

        <div className="stepper" style={{ marginTop: 26 }}>
          <div className="step done"><span className="dot">✓</span>Booked</div>
          <div className="step done"><span className="dot">✓</span>Confirmed</div>
          <div className="step done"><span className="dot">✓</span>E-ticket issued</div>
          <div className="step on"><span className="dot">4</span>Ready to fly</div>
        </div>

        <div style={{ textAlign: 'left', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: '24px 26px', margin: '28px 0', boxShadow: 'var(--shadow)' }}>
          <h4 style={{ marginBottom: 10 }}>Itinerary</h4>
          <div style={row2}><span>Trip</span><span><b>Maldives Getaway</b> · 4N/5D</span></div>
          <div style={row2}><span>Dates</span><span>02 – 07 Aug 2026</span></div>
          <div style={row2}><span>Travellers</span><span>2 Adults</span></div>
          <div style={row2}><span>Includes</span><span>Flights · Resort · Transfers</span></div>
          <div style={{ ...row2, borderBottom: 'none' }}><span>Total paid</span><span><b>₹6,950</b></span></div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18, background: 'var(--card)', border: '1px dashed var(--accent)', borderRadius: 'var(--radius)', padding: '18px 22px', marginBottom: 28 }}>
          <div style={{ width: 64, height: 64, background: 'repeating-conic-gradient(var(--ink) 0% 25%, var(--paper) 0% 50%) 50% / 12px 12px', borderRadius: 8, flexShrink: 0 }} aria-hidden="true" />
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>E-ticket &amp; QR boarding pass</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Scan at the terminal kiosk or show on your phone.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link className="btn btn-gold" to="/travel/bookings">View in my bookings</Link>
          <Link className="btn btn-line" to="/chats">Share to chat</Link>
          <Link className="btn btn-line" to="/travel/insurance">Add insurance</Link>
        </div>
      </div>

      <div style={{ marginTop: 60 }}>
        <TrustBar items={['Secure payments', '24/7 support', 'Easy modification', 'Best price guarantee']} />
      </div>
    </>
  );
}
