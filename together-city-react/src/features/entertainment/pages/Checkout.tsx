import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntPage, TrustBar } from './parts';

const CSS = `
.ent-checkout .checkout-lay{display:grid;grid-template-columns:1fr 340px;gap:32px;align-items:start}
@media(max-width:960px){.ent-checkout .checkout-lay{grid-template-columns:1fr}}
.ent-checkout .formf{margin-bottom:16px}
.ent-checkout .formf label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:6px}
.ent-checkout .formf input{width:100%;border:1px solid var(--line,#eee);border-radius:10px;padding:12px 14px;font-size:14px;background:var(--card,#fff);color:var(--ink);font-family:inherit;outline:none}
.ent-checkout .addon{display:flex;justify-content:space-between;align-items:center;gap:14px;border:1px solid var(--line,#eee);border-radius:14px;padding:16px 18px;margin-bottom:12px;background:var(--card,#fff)}
.ent-checkout .summarycard{position:sticky;top:20px;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;padding:24px;box-shadow:var(--shadow-deep)}
.ent-checkout .summarycard .row2{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-soft);margin:8px 0}
.ent-checkout .summarycard .tot{display:flex;justify-content:space-between;font-weight:600;font-size:16px;border-top:1px solid var(--line,#eee);padding-top:12px;margin-top:8px}
.ent-checkout .splitchip{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px dashed var(--accent);border-radius:999px;padding:9px 16px;font-size:12px;color:var(--accent);margin-top:14px;text-decoration:none}
.ent-checkout .confirm-wrap{max-width:640px;margin:64px auto 0;text-align:center}
.ent-checkout .checkring{width:88px;height:88px;border-radius:50%;border:3px solid var(--gold,#c8a24a);display:flex;align-items:center;justify-content:center;font-size:34px;color:var(--gold,#c8a24a);margin:0 auto 20px}
.ent-checkout .qrblock{width:118px;height:118px;margin:0 auto;background:repeating-linear-gradient(90deg,var(--ink) 0 6px,transparent 6px 12px),repeating-linear-gradient(0deg,var(--ink) 0 6px,transparent 6px 12px);background-blend-mode:multiply;background-color:var(--paper,#fff);border-radius:10px;border:6px solid var(--paper,#fff);box-shadow:0 0 0 1px var(--line,#eee)}
.ent-checkout .eticket{display:flex;align-items:center;gap:20px;background:var(--card,#fff);border:1px dashed var(--accent);border-radius:14px;padding:20px 24px;margin:26px 0;text-align:left}
.ent-checkout .ticketid{font-family:var(--mono,monospace);font-size:15px;letter-spacing:.04em}
`;

const METHODS = ['Card ending 4821', 'UPI', 'Together Wallet'];

/** Checkout — contact, add-ons, payment method and an in-page booking confirmation. */
export function Checkout() {
  const [method, setMethod] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const pay = () => {
    setProcessing(true);
    setTimeout(() => { setProcessing(false); setConfirmed(true); }, 900);
  };

  return (
    <EntPage className="ent-checkout">
      <style>{CSS}</style>
      <div className="eyebrow rise">Checkout</div>
      <h1 className="rise" style={{ fontSize: 'clamp(24px,3vw,34px)', marginBottom: 20 }}>Interstellar — 10:30 AM, 2D</h1>

      <div className="stepper rise d1">
        <div className="step done"><span className="dot">✓</span>Seats</div>
        <div className="step done"><span className="dot">✓</span>Add-ons</div>
        <div className="step on"><span className="dot">3</span>Payment</div>
      </div>

      <div className="checkout-lay rise d2">
        <section>
          <h3 style={{ marginBottom: 16 }}>Contact details</h3>
          <div className="formf"><label>Full name</label><input defaultValue="Somen Chatterjee" /></div>
          <div className="formf"><label>Email</label><input defaultValue="connect@togetherai.tech" /></div>
          <div className="formf"><label>Phone</label><input defaultValue="+91 98200 12345" /></div>

          <h3 style={{ margin: '28px 0 16px' }}>Add-ons</h3>
          <div className="addon">
            <div><b>Popcorn combo — large</b><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>Popcorn + 2 regular drinks</div></div>
            <button type="button" className="btn btn-line btn-sm">Add — ₹399</button>
          </div>
          <div className="addon">
            <div><b>Together+ discount</b><div className="muted" style={{ fontSize: 12, marginTop: 3 }}>10% off this showtime</div></div>
            <Link className="btn btn-line btn-sm" to="/entertainment">Join — ₹499/mo</Link>
          </div>

          <h3 style={{ margin: '28px 0 16px' }}>Payment method</h3>
          <div className="pill-row">
            {METHODS.map((m, i) => (
              <span key={m} className={`pill ${method === i ? 'on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMethod(i)}>{m}</span>
            ))}
          </div>
          <div className="formf" style={{ marginTop: 16 }}><label>Card number</label><input defaultValue="•••• •••• •••• 4821" /></div>
          <div className="formf"><label>Name on card</label><input defaultValue="Somen Chatterjee" /></div>
        </section>

        <aside className="summarycard">
          <h4 style={{ marginBottom: 12 }}>Order summary</h4>
          <div className="row2"><span>2 tickets — Gold row</span><span>₹900</span></div>
          <div className="row2"><span>Convenience fee</span><span>₹80</span></div>
          <div className="tot"><span>Total</span><span>₹980</span></div>
          <button type="button" className="btn btn-gold" onClick={pay} disabled={processing || confirmed} style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>
            {processing ? 'Processing…' : confirmed ? 'Paid ✓' : 'Pay ₹980'}
          </button>
          <Link className="splitchip" to="/entertainment">◈ Split with friends <span>→</span></Link>
        </aside>
      </div>

      <div className="rule" style={{ marginTop: 60 }} />

      {confirmed && (
        <div className="confirm-wrap rise">
          <div className="checkring">✓</div>
          <div className="eyebrow center">Booking confirmed</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,32px)' }}>Enjoy the show, Somen.</h1>
          <p className="lede center" style={{ margin: '10px auto' }}>Ticket ID <b className="mono">TC-ENT-55901</b> · Confirmation sent to connect@togetherai.tech</p>

          <div className="eticket">
            <div className="qrblock" aria-label="QR boarding code for ticket TC-ENT-55901" role="img" />
            <div>
              <div className="ticketid">TC-ENT-55901</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>Interstellar · PVR Phoenix Marketcity · 10:30 AM · Seats A1, A2</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Show this QR code at the cinema entry gate.</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-gold">Add to calendar</button>
            <button type="button" className="btn btn-line">Share to chat</button>
            <Link className="splitchip" to="/entertainment" style={{ textDecoration: 'none' }}>◈ Split with friends <span>→</span></Link>
          </div>
        </div>
      )}

      <TrustBar items={['Secure payments', '24/7 support', 'Easy modification', 'Best price guarantee']} />
    </EntPage>
  );
}
