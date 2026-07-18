import { Link } from 'react-router-dom';

const contacts = [
  { in: 'A', name: 'Ananya — Spouse', phone: '+91 98xxxxxx10', tel: '+919800000010' },
  { in: 'P', name: 'Papa — Father', phone: '+91 98xxxxxx22', tel: '+919800000022' },
];
const hospitals = [
  { name: 'Holy Family Hospital, Bandra', meta: '0.8 km · 24/7 emergency' },
  { name: 'Apollo Hospitals, Bandra', meta: '1.2 km · cashless network' },
  { name: 'Lilavati Hospital', meta: '2.1 km · trauma centre' },
  { name: 'Kokilaben Dhirubhai Ambani Hospital', meta: '3.4 km · multi-speciality' },
];

/** Emergency — one-tap SOS, medical ID, contacts & nearest hospitals (ported from medical-emergency.html). */
export function Emergency() {
  return (
    <>
      <div className="rise" style={{ marginBottom: 26 }}>
        <div className="eyebrow" style={{ color: '#b0503e' }}>Medical Hub · Emergency</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Emergency</h1>
        <p className="lede" style={{ marginTop: 6 }}>One tap, maximum contrast, no scrolling needed to get help.</p>
      </div>

      <div className="grid2 rise d1" style={{ alignItems: 'start', marginBottom: 36 }}>
        <div style={{ background: 'linear-gradient(135deg,#b0503e,#8a3a2c)', color: '#fff', borderRadius: 'var(--radius-lg)', padding: 36, textAlign: 'center', boxShadow: '0 16px 44px rgba(176,80,62,.35)' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 96, height: 96, borderRadius: '50%', background: 'rgba(255,255,255,.16)', border: '2px solid rgba(255,255,255,.5)', fontSize: 34, marginBottom: 14 }}>☎</div>
          <h2 style={{ color: '#fff', fontSize: 26 }}>Hold to call 112</h2>
          <p style={{ opacity: 0.9, marginTop: 6 }}>Press and hold for 3 seconds to call India's national emergency number.</p>
          <small style={{ display: 'block', opacity: 0.85, fontSize: 12.5, marginTop: 10 }}>Your live location is shared automatically with emergency services when you call.</small>
        </div>
        <div style={{ background: 'var(--card)', border: '2px solid #e3b6ab', borderRadius: 'var(--radius-lg)', padding: '24px 26px', boxShadow: 'var(--shadow-deep)' }}>
          <h4 style={{ marginBottom: 12 }}>Medical ID — readable without login</h4>
          <table className="tc">
            <tbody>
              <tr><td>Name</td><td><b>Somen</b> · TC-00024891</td></tr>
              <tr><td>Blood Group</td><td><b>O+</b></td></tr>
              <tr><td>Allergies</td><td>None known</td></tr>
              <tr><td>Conditions</td><td>None</td></tr>
              <tr><td>Medications</td><td>None</td></tr>
              <tr><td>Insurance</td><td>Together Shield Family Floater · #TS-FF-88213</td></tr>
            </tbody>
          </table>
          <Link className="btn btn-sm btn-line" style={{ marginTop: 12 }} to="/medical/insurance">View policy →</Link>
        </div>
      </div>

      <section className="blk rise d2">
        <div className="blk-head"><h2>Emergency contacts</h2></div>
        <div className="rows">
          {contacts.map((c) => (
            <div className="row" key={c.tel}>
              <div className="av">{c.in}</div>
              <div className="grow"><div className="t">{c.name}</div><div className="m">{c.phone}</div></div>
              <a className="btn btn-sm btn-accent" href={`tel:${c.tel}`}>Call</a>
            </div>
          ))}
        </div>
        <Link className="btn btn-line" style={{ marginTop: 12 }} to="/chats">Share Live Location with contacts</Link>
      </section>

      <section className="blk rise d3">
        <div className="blk-head"><h2>Nearest hospitals</h2></div>
        <div className="rows">
          {hospitals.map((h) => (
            <div className="row" key={h.name}>
              <div className="grow"><div className="t">{h.name}</div><div className="m">{h.meta}</div></div>
              <Link className="btn btn-sm btn-line" to="/medical/connections">Directions</Link>
            </div>
          ))}
        </div>
      </section>

      <div className="trust">
        <span>◈ Works Without Login</span><span>◈ Live Location Sharing</span><span>◈ One-Tap Calling</span><span>◈ Always Reachable</span>
      </div>
    </>
  );
}
