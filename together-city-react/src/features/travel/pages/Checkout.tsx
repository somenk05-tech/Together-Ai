import { useState } from 'react';
import { Link } from 'react-router-dom';
import { TrustBar } from '../shared';

const METHODS = ['Credit/Debit Card', 'UPI', 'Net Banking'];
const ff: React.CSSProperties = { marginBottom: 16 };
const ffLabel: React.CSSProperties = { display: 'block', fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)', fontWeight: 600, marginBottom: 6 };
const ffInput: React.CSSProperties = { width: '100%', border: '1px solid var(--line)', borderRadius: 10, padding: '12px 14px', fontSize: 14, background: 'var(--card)', color: 'var(--ink)', fontFamily: 'inherit', outline: 'none' };

function FormF({ label, value, placeholder }: { label: string; value?: string; placeholder?: string }) {
  return <div style={ff}><label style={ffLabel}>{label}</label><input defaultValue={value} placeholder={placeholder} style={ffInput} /></div>;
}

const addon: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14, border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 12, background: 'var(--card)' };

/**
 * Said once, at the top, in the citizen's own interest (FE-11.3).
 *
 * This screen and the stay Detail page behind it are a design preview: they
 * make no API call, and the button at the bottom navigates rather than pays.
 * Until now they did not say so — they showed a traveller called Aarav Sharma
 * with his email and phone, a card ending 4821, and a ₹2,675 total, which is a
 * checkout that looks finished and takes nothing. Somebody could reasonably
 * believe they had booked a room.
 *
 * The real flows are Packages and Flights. Both charge the wallet through the
 * financial rail and write a Trip.
 */
function PreviewNotice() {
  return (
    <p className="muted" style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 20px', maxWidth: 640 }}>
      <b>This is a preview of the stay checkout, not a working one.</b> It cannot take a booking or a
      payment. To book a real trip, use{' '}
      <Link to="/travel/packages" style={{ color: 'var(--accent)', fontWeight: 600 }}>Packages</Link>{' '}or{' '}
      <Link to="/travel/flights" style={{ color: 'var(--accent)', fontWeight: 600 }}>Flights</Link>.
    </p>
  );
}

export function TravelCheckout() {
  const [method, setMethod] = useState(0);

  return (
    <>
      <div className="eyebrow rise">Checkout · preview</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 8 }}>Stay checkout</h1>
      <PreviewNotice />

      <div className="stepper rise d1">
        <div className="step on"><span className="dot">1</span>Travellers</div>
        <div className="step"><span className="dot">2</span>Add-ons</div>
        <div className="step"><span className="dot">3</span>Payment</div>
      </div>

      <div className="rise d2" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        <section>
          <h3 style={{ marginBottom: 16 }}>Traveller details</h3>
          <FormF label="Full name" placeholder="As printed on your passport" />
          <FormF label="Email" placeholder="you@example.com" />
          <FormF label="Phone" placeholder="+91 98765 43210" />
          <FormF label="Passport number" placeholder="e.g. Z1234567" />

          <h3 style={{ margin: '28px 0 16px' }}>Add-ons</h3>
          <div style={addon}>
            <div><b>Trip Secure Plus</b><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Medical ₹250K · Cancellation ₹10K</div></div>
            <Link className="btn btn-line btn-sm" to="/travel/insurance">Add — ₹89</Link>
          </div>
          <div style={addon}>
            <div><b>Seat selection</b><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Choose your preferred room floor</div></div>
            <Link className="btn btn-line btn-sm" to="/travel/checkout">Add — ₹45</Link>
          </div>
          <div style={addon}>
            <div><b>Airport transfer</b><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Private car, both ways</div></div>
            <Link className="btn btn-line btn-sm" to="/travel/checkout">Add — ₹120</Link>
          </div>

          <h3 style={{ margin: '28px 0 16px' }}>Payment method</h3>
          <div className="pill-row">
            {METHODS.map((m, i) => (
              <span key={m} className={i === method ? 'pill on' : 'pill'} style={{ cursor: 'pointer' }} onClick={() => setMethod(i)}>{m}</span>
            ))}
          </div>
          <div style={{ ...ff, marginTop: 16 }}><label style={ffLabel}>Card number</label><input placeholder="Card details are not taken here" style={ffInput} /></div>
          <div style={ff}><label style={ffLabel}>Name on card</label><input placeholder="Name as it appears on the card" style={ffInput} /></div>
        </section>

        <aside style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-deep)' }}>
          <h4 style={{ marginBottom: 12 }}>Order summary</h4>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Nothing has been selected, so there is no total to show. A stay you book from
            {' '}<Link to="/travel/packages" style={{ color: 'var(--accent)', fontWeight: 600 }}>Packages</Link>{' '}
            or a flight from{' '}
            <Link to="/travel/flights" style={{ color: 'var(--accent)', fontWeight: 600 }}>Flights</Link>{' '}
            is priced and paid for on its own page.
          </p>
          <p className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>Fare rules: free cancellation up to 48 hours before check-in.</p>
          <div style={{ fontSize: 12, color: 'var(--gold)', textAlign: 'center', marginTop: 10 }}>◷ Price locked for 09:42</div>
          <p className="muted" style={{ fontSize: 12, marginTop: 16, lineHeight: 1.6 }}>
            This preview cannot take a booking. Use Packages or Flights to book and pay for real.
          </p>
          <Link to="/financial/wallet" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px dashed var(--accent)', borderRadius: 999, padding: '9px 16px', fontSize: 12, color: 'var(--accent)', marginTop: 14 }}>◈ Split with friends <span>→</span></Link>
        </aside>
      </div>

      <TrustBar items={['Secure payments', 'Best price guarantee', 'Easy cancellation', '24/7 support']} />
    </>
  );
}
