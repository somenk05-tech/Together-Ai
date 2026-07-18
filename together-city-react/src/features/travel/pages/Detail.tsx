import { useState } from 'react';
import { Link } from 'react-router-dom';
import { IMG, TrustBar } from '../shared';

interface Room { name: string; meta: string; price: number }
const ROOMS: Room[] = [
  { name: 'Deluxe Room', meta: '32 m² · King bed · Burj Khalifa view', price: 1250 },
  { name: 'Executive Suite', meta: '54 m² · Separate lounge · Club access', price: 1850 },
  { name: 'Two-Bedroom Suite', meta: '88 m² · Ideal for families · Fountain view', price: 2650 },
];
const NIGHTS = 2;
const TAXES = 175;
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');

const acc: React.CSSProperties = { borderBottom: '1px solid var(--line)', padding: '14px 0' };
const accSum: React.CSSProperties = { cursor: 'pointer', fontWeight: 600, fontSize: 14 };

export function TravelDetail() {
  const [sel, setSel] = useState(0);
  const room = ROOMS[sel];
  const subtotal = room.price * NIGHTS;

  return (
    <>
      <div className="rise" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginBottom: 28 }}>
        <img loading="lazy" decoding="async" src={`${IMG}hotel-imahe.webp`} alt="Address Downtown — lobby and pool overlooking Burj Khalifa" style={{ width: '100%', height: '100%', objectFit: 'cover', maxHeight: 420 }} />
        <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
          <img loading="lazy" decoding="async" src={`${IMG}hotels.webp`} alt="Address Downtown — suite interior" style={{ width: '100%', height: '100%', objectFit: 'cover', maxHeight: 205 }} />
          <img loading="lazy" decoding="async" src={`${IMG}packages-image.webp`} alt="Address Downtown — rooftop view at dusk" style={{ width: '100%', height: '100%', objectFit: 'cover', maxHeight: 205 }} />
        </div>
      </div>

      <div className="rise d1" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 32, alignItems: 'start' }}>
        <section>
          <div className="eyebrow">Hotel · Downtown Dubai</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,36px)' }}>Address Downtown</h1>
          <p className="lede" style={{ margin: '6px 0 4px' }}>★ 4.8 · 1,245 reviews · Sheikh Mohammed bin Rashid Blvd, Downtown Dubai</p>

          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', margin: '18px 0 30px', fontSize: 13, color: 'var(--ink-soft)' }}>
            <span>◈ Free WiFi</span><span>◈ Infinity pool</span><span>◈ Spa &amp; wellness</span><span>◈ Gym</span><span>◈ Breakfast included</span><span>◈ Airport transfer</span>
          </div>

          <h3 style={{ marginBottom: 14 }}>Choose your room</h3>
          {ROOMS.map((r, i) => (
            <button key={r.name} type="button" onClick={() => setSel(i)}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderRadius: 'var(--radius)', padding: '16px 20px', marginBottom: 12, background: 'var(--card)', border: i === sel ? '1px solid var(--accent)' : '1px solid var(--line)', boxShadow: i === sel ? '0 0 0 2px var(--accent-soft)' : undefined }}>
              <span><b>{r.name}</b><span className="meta muted" style={{ display: 'block', fontSize: 12, marginTop: 3 }}>{r.meta}</span></span>
              <span style={{ textAlign: 'right' }}><b>{inr(r.price)}</b><span className="muted" style={{ display: 'block', fontSize: 11 }}>/ night</span></span>
            </button>
          ))}

          <h3 style={{ margin: '26px 0 4px' }}>Good to know</h3>
          <details style={acc} open>
            <summary style={accSum}>Cancellation policy</summary>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-soft)' }}>Free cancellation up to 48 hours before check-in. After that, the first night is charged.</p>
          </details>
          <details style={acc}>
            <summary style={accSum}>Check-in / check-out</summary>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-soft)' }}>Check-in from 3:00 PM · Check-out until 12:00 PM. Early check-in subject to availability.</p>
          </details>
          <details style={acc}>
            <summary style={accSum}>House rules</summary>
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-soft)' }}>No smoking in rooms · Pets not allowed · Quiet hours 11:00 PM – 7:00 AM.</p>
          </details>
        </section>

        <aside style={{ position: 'sticky', top: 'calc(var(--header-h) + 20px)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', padding: 24, boxShadow: 'var(--shadow-deep)' }}>
          <div className="f" style={{ padding: '0 0 12px' }}><label>Check-in</label><input defaultValue="Sun, 13 Jul 2026" /></div>
          <div className="f" style={{ padding: '0 0 12px', borderTop: '1px solid var(--line)' }}><label>Check-out</label><input defaultValue="Tue, 15 Jul 2026" /></div>
          <div className="f" style={{ padding: '0 0 12px', borderTop: '1px solid var(--line)' }}><label>Guests</label><input defaultValue="1 Room, 2 Adults" /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}><span>{room.name} × {NIGHTS} nights</span><span>{inr(subtotal)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', margin: '8px 0' }}><span>Taxes &amp; fees</span><span>{inr(TAXES)}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, fontSize: 16, borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 8 }}><span>Total</span><span>{inr(subtotal + TAXES)}</span></div>
          <Link className="btn btn-gold" to="/travel/checkout" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Continue to checkout</Link>
          <Link className="btn-discuss" to="/chats" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>◈ Plan together — share in chat</Link>
        </aside>
      </div>

      <TrustBar items={['Best price guarantee', 'Free cancellation', 'Secure booking', '24/7 support']} />
    </>
  );
}
