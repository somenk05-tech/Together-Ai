import { useState } from 'react';
import { Link } from 'react-router-dom';

const cal: { d: string; cls?: string }[] = [
  { d: '12' }, { d: '13' }, { d: '14' }, { d: '15', cls: 'av2' }, { d: '16', cls: 'on' }, { d: '17', cls: 'av2' }, { d: '18' },
  { d: '19', cls: 'av2' }, { d: '20', cls: 'av2' }, { d: '21' }, { d: '22', cls: 'av2' }, { d: '23', cls: 'av2' }, { d: '24' }, { d: '25' },
];
const slots = ['9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '4:00 PM', '4:30 PM', '5:00 PM'];

/** Appointment Booking — confirmed consult slot (ported from medical-booking.html). */
export function Booking() {
  const [slot, setSlot] = useState('10:00 AM');
  const [mode, setMode] = useState('Video Call');
  const [reminder, setReminder] = useState(true);

  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow">Medical Hub · Booking</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Book your appointment</h1>
        <p className="lede" style={{ marginTop: 6 }}>Dr. Ayesha Kapoor · General Physician · Online Video Call</p>
      </div>

      <div className="grid2 rise d1" style={{ alignItems: 'start', marginBottom: 40 }}>
        <div className="mincal">
          <div className="mh">July 2026 <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>Thu 16 Jul selected</span></div>
          <div className="g">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((h, i) => <span key={`h${i}`} className="h">{h}</span>)}
            {cal.map((c) => <span key={c.d} className={c.cls}>{c.d}</span>)}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>Choose a time — Thursday 16 July</p>
          <div className="pill-row" style={{ marginTop: 8 }}>
            {slots.map((s) => (
              <span key={s} className={`pill${slot === s ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setSlot(s)}>{s}</span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: 16 }}>Consult mode</p>
          <div className="pill-row" style={{ marginTop: 6 }}>
            {['Video Call', 'Clinic Visit'].map((m) => (
              <span key={m} className={`pill${mode === m ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setMode(m)}>{m}</span>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', flexShrink: 0, background: 'var(--green-soft)', color: '#2e7d4f', fontSize: 26 }}>✓</div>
            <div>
              <h4>Appointment confirmed</h4>
              <p className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Booking ID <b className="mono" style={{ color: 'var(--ink)' }}>TC-MED-70455</b></p>
            </div>
          </div>
          <table className="tc" style={{ marginBottom: 16 }}>
            <tbody>
              <tr><td>Doctor</td><td><b>Dr. Ayesha Kapoor</b></td></tr>
              <tr><td>Date &amp; Time</td><td><b>Thu, 16 Jul 2026 · {slot}</b></td></tr>
              <tr><td>Mode</td><td>{mode === 'Video Call' ? 'Online Video Call' : 'Clinic Visit'}</td></tr>
              <tr><td>Fee</td><td>₹800 · paid via UPI</td></tr>
            </tbody>
          </table>
          <h4 style={{ fontSize: 13, marginBottom: 8 }}>Before your appointment</h4>
          <div className="pill-row" style={{ marginBottom: 14 }}>
            <span className="pill">✓ Fast for 8–10 hours</span><span className="pill">✓ Carry previous prescriptions</span><span className="pill">✗ No caffeine this morning</span>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 16 }}>
            <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} /> Send reminder 1 hour before
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-accent">Add to Calendar</button>
            <Link className="btn btn-line" to="/chats">Message concierge</Link>
          </div>
        </div>
      </div>

      <div className="note rise d2">◈ View this and every upcoming appointment on the <Link to="/medical" style={{ fontWeight: 600 }}>Medical Hub</Link> landing page. Need to reschedule? <Link to="/chats" style={{ fontWeight: 600 }}>Talk to concierge</Link>.</div>

      <div className="trust">
        <span>◈ Secure Booking</span><span>◈ Easy Rescheduling</span><span>◈ Doctor Verified</span><span>◈ 24/7 Support</span>
      </div>
    </>
  );
}
