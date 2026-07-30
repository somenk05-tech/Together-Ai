import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui';

interface ConfirmLine { name: string; qty: number; price: number }
interface ConfirmState {
  type?: 'order' | 'consultation';
  id?: string;
  items?: ConfirmLine[];
  total?: number;
}

const DEMO: Required<Pick<ConfirmState, 'items' | 'total'>> = {
  items: [
    { name: 'Spinach 250g', qty: 2, price: 25 },
    { name: 'Toor Dal 1kg', qty: 1, price: 120 },
  ],
  total: 1746,
};

const TRACK: { label: string; time: string; state: 'done' | 'on' | '' }[] = [
  { label: 'Confirmed', time: '11:45 AM', state: 'done' },
  { label: 'Packed', time: '5:45 PM', state: 'done' },
  { label: 'On the way', time: '5:55 PM', state: 'on' },
  { label: 'Delivered', time: '6:30–7:00 PM', state: '' },
];

/** Order Confirmed — success card, live ETA (optional geolocation) and delivery tracking. */
export function Confirm() {
  const { state } = useLocation() as { state: ConfirmState | null };
  const items = state?.items ?? DEMO.items;
  const total = state?.total ?? DEMO.total;
  const orderId = state?.id ?? '#TC-GRO-88412';

  const [eta, setEta] = useState('Arriving in ~35–45 min');
  const [where, setWhere] = useState('To your saved address. Tap below for a precise ETA to where you are now.');
  const [locating, setLocating] = useState(false);
  const [locBtn, setLocBtn] = useState('📍 Use my location');

  const useLocate = () => {
    if (!navigator.geolocation) { setWhere("Location isn't available in this browser."); return; }
    setLocating(true); setLocBtn('Locating…');
    const HUB = { lat: 19.07, lng: 72.87 };
    const hav = (a: number, b: number, c: number, d: number) => {
      const R = 6371;
      const x = Math.sin(((c - a) * Math.PI) / 360) ** 2 +
        Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(((d - b) * Math.PI) / 360) ** 2;
      return 2 * R * Math.asin(Math.sqrt(x));
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const km = hav(HUB.lat, HUB.lng, pos.coords.latitude, pos.coords.longitude);
        const travel = Math.max(6, Math.round((km / 22) * 60));
        const lo = 15 + travel;
        setEta(`Arriving in ~${lo}–${lo + 10} min`);
        setWhere(`${km.toFixed(1)} km from your nearest store`);
        setLocBtn('✓ ETA updated'); setLocating(false);
      },
      (err) => {
        setWhere(`⚠ ${err.message || 'Location denied'} — showing the default ETA.`);
        setLocBtn('📍 Use my location'); setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
    );
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <div className="card center" style={{ padding: '44px 30px' }}>
        <div style={{
          width: 88, height: 88, borderRadius: '50%', background: 'var(--accent-soft)', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38, margin: '0 auto 18px',
        }}>✓</div>
        <h1 style={{ marginBottom: 8 }}>Order Confirmed!</h1>
        <p className="muted">Order <b>{orderId}</b> · {items.length} items · ₹{total.toLocaleString('en-IN')}</p>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--line)', textTransform: 'capitalize' }}>
            <span>{it.name} × {it.qty}</span><b>₹{it.price * it.qty}</b>
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '7px 0', fontWeight: 700 }}>
          <span>Total</span><span>₹{total.toLocaleString('en-IN')}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24, border: '1px solid var(--accent)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>Delivery ETA</div>
            <h3 style={{ fontSize: 26, margin: '2px 0 4px' }}>{eta}</h3>
            <p className="muted" style={{ fontSize: 12.5 }}>{where}</p>
          </div>
          <Button variant="line" size="sm" disabled={locating} onClick={useLocate}>{locBtn}</Button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h4 style={{ marginBottom: 16 }}>Delivery Tracking</h4>
        <div className="stepper">
          {TRACK.map((s) => (
            <div key={s.label} className={`step${s.state ? ` ${s.state}` : ''}`}>
              <span className="dot">{s.state === 'done' ? '✓' : s.state === 'on' ? '●' : TRACK.indexOf(s) + 1}</span>
              {s.label}<br /><span className="muted" style={{ fontSize: 10.5 }}>{s.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 28, justifyContent: 'center' }}>
        <Link to="/nutrition/grocery"><Button variant="line">Back to Grocery Lists</Button></Link>
        <Link to="/nutrition/weekly"><Button variant="accent">Continue to Meal Planner →</Button></Link>
      </div>

      <div className="trust">
        <span>◈ Personalised for You</span><span>◈ Expert Guidance</span>
        <span>◈ Quality You Can Trust</span><span>◈ Better Every Day</span>
      </div>
    </div>
  );
}
