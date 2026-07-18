import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Hero } from '@/components/ui';

interface Derm {
  name: string; rating: string; speciality: string; consults: number; slot: string; priceInr: number;
}
const DERMS: Derm[] = [
  { name: 'Dr. Ananya Sharma', rating: '4.9', speciality: 'Cosmetic Dermatology', consults: 612, slot: 'Today, 6:00 PM', priceInr: 2500 },
  { name: 'Dr. Rohan Mehta', rating: '4.8', speciality: 'Acne & Scarring Specialist', consults: 498, slot: 'Tomorrow, 10:30 AM', priceInr: 2200 },
  { name: 'Dr. Kabir Malhotra', rating: '4.9', speciality: 'Pigmentation & Anti-Ageing', consults: 701, slot: 'Tomorrow, 2:00 PM', priceInr: 2800 },
];

const inr = (n: number) => n.toLocaleString('en-IN');

/** Consult a Dermatologist — certified derm directory + booking. Static like the original (no endpoint). */
export function Dermatologist() {
  const [mode, setMode] = useState<'Video' | 'Clinic Visit'>('Video');

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 16px' }}>
      <Hero
        image="/assets/img/dermatologist-hero.webp"
        eyebrow="Beauty Market · 02"
        title="Consult a Dermatologist"
        sub="Expert care, personalised for you. Certified dermatologists, video consults up to 30 minutes, 100% confidential."
      />

      <div className="pill-row" style={{ marginBottom: 36 }}>
        <span className="pill on">Certified Dermatologists</span>
        <span className="pill on">Private &amp; Secure</span>
        <span className="pill on">Personalized Advice</span>
        <span className="pill on">Convenient Scheduling</span>
      </div>

      <section className="blk">
        <div className="blk-head">
          <h2>Choose your dermatologist</h2>
          <span className="muted" style={{ fontSize: 12 }}>
            Consult mode: <b style={{ color: 'var(--ink)' }}>{mode}</b> ·{' '}
            <button
              type="button"
              onClick={() => setMode((m) => (m === 'Video' ? 'Clinic Visit' : 'Video'))}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontWeight: 600, font: 'inherit' }}
            >
              {mode === 'Video' ? 'Switch to Clinic Visit' : 'Switch to Video'}
            </button>
          </span>
        </div>
        <div className="grid3">
          {DERMS.map((d) => (
            <div key={d.name} className="card lift">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <h4>{d.name} <span style={{ color: '#2e7d4f', fontSize: 11 }}>✓ Verified</span></h4>
                <span className="mono">★ {d.rating}</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: '6px 0' }}>{d.speciality} · {d.consults} consults</p>
              <p style={{ fontSize: 13, marginBottom: 10 }}>Next slot: <b>{d.slot}</b></p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600 }}>₹{inr(d.priceInr)}</span>
                <Link className="btn btn-sm btn-accent" to="/beauty/market">Book →</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="blk">
        <div className="blk-head"><h2>Book Dr. Ananya Sharma</h2></div>
        <div className="grid2">
          <div className="card">
            <h4 style={{ marginBottom: 12 }}>July 2026 <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>· Wed 15 Jul selected</span></h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, textAlign: 'center', fontSize: 13 }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((h, i) => (
                <span key={`h${i}`} className="muted" style={{ fontWeight: 700, fontSize: 11 }}>{h}</span>
              ))}
              {[
                { d: 12 }, { d: 13 }, { d: 14 }, { d: 15, on: true }, { d: 16, av: true }, { d: 17, av: true }, { d: 18 },
                { d: 19, av: true }, { d: 20, av: true }, { d: 21 }, { d: 22, av: true }, { d: 23, av: true }, { d: 24 }, { d: 25 },
              ].map((c) => (
                <span key={c.d} style={{
                  padding: '6px 0', borderRadius: 8, fontWeight: c.on ? 700 : 400,
                  background: c.on ? 'var(--accent)' : c.av ? 'var(--accent-soft)' : 'transparent',
                  color: c.on ? '#fff' : c.av ? 'var(--accent)' : 'var(--ink-soft)',
                }}>{c.d}</span>
              ))}
            </div>
          </div>
          <div className="card">
            <h4 style={{ marginBottom: 12 }}>Consultation details</h4>
            <table className="tc" style={{ marginBottom: 16 }}>
              <tbody>
                <tr><td>Consultation Type</td><td><b>{mode === 'Video' ? 'Online Video Call' : 'In-Clinic Visit'}</b></td></tr>
                <tr><td>Duration</td><td><b>Up to 30 minutes</b></td></tr>
                <tr><td>What You Get</td><td>Expert advice, personalised routine &amp; follow-up guidance</td></tr>
                <tr><td>Privacy</td><td>100% confidential</td></tr>
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span className="muted" style={{ fontSize: 12 }}>Consultation charge</span>
              <span style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>₹2,500</span>
            </div>
            <Link className="btn btn-accent" style={{ width: '100%', justifyContent: 'center' }} to="/beauty/market">Book Appointment ₹2,500 ›</Link>
            <p className="muted" style={{ fontSize: 11, marginTop: 10, textAlign: 'center' }}>Secure Booking · Easy Cancellation</p>
          </div>
        </div>
      </section>

      <div className="trust">
        <span>◈ Certified Dermatologists</span><span>◈ Private &amp; Secure</span><span>◈ Personalized Advice</span><span>◈ Convenient Scheduling</span>
      </div>
    </div>
  );
}
