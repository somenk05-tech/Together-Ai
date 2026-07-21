import { Link } from 'react-router-dom';
import { EntPage, PosterLead, TrustBar } from './parts';

const CSS = `
.ent-events .evtile{aspect-ratio:16/9;border-radius:14px 14px 0 0;display:flex;align-items:flex-start;justify-content:space-between;padding:14px;color:#fff;position:relative;overflow:hidden}
.ent-events .ev1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.ent-events .ev2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.ent-events .ev3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
.ent-events .livebadge{background:#c1443a;color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:999px;display:flex;align-items:center;gap:5px}
.ent-events .livebadge::before{content:"";width:6px;height:6px;border-radius:50%;background:#fff}
.ent-events .datebadge{background:rgba(0,0,0,.5);color:#fff;text-align:center;border-radius:10px;padding:6px 10px;font-size:11px;line-height:1.2;flex-shrink:0}
.ent-events .datebadge b{display:block;font-size:16px;font-family:var(--serif,Georgia)}
.ent-events .evcard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-events .evcard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-events .evcard .eb{padding:14px 16px 16px}
.ent-events .evcard .eb .venue{font-size:12px;color:var(--muted);margin:4px 0 8px}
.ent-events .split{display:grid;grid-template-columns:2fr 1fr;gap:28px}
.ent-events .g2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:860px){.ent-events .split{grid-template-columns:1fr}.ent-events .g2{grid-template-columns:1fr}}
`;

const LIVE = [
  { title: 'Arijit Singh Live', venue: 'DY Patil Stadium, Navi Mumbai', price: '₹499', tint: 'ev1' },
  { title: 'Zakir Khan Live', venue: 'NMACC, BKC', price: '₹299', tint: 'ev2' },
  { title: 'MI vs CSK', venue: 'Wankhede Stadium', price: '₹799', tint: 'ev3' },
  { title: 'Van Gogh Immersive', venue: 'Jio World Drive, BKC', price: '₹599', tint: 'ev1' },
  { title: 'The Grub Fest', venue: 'MMRDA Grounds, BKC', price: '₹199', tint: 'ev2' },
];
const NEXT = [
  { d: '24', mo: 'MAY', t: 'Coldplay — Music of the Spheres', m: 'DY Patil Stadium · From ₹2,999' },
  { d: '25', mo: 'MAY', t: 'Bangalore Comedy Festival', m: 'Phoenix Marketcity · From ₹399' },
  { d: '01', mo: 'JUN', t: 'Pune Food & Culture Walk', m: 'Koregaon Park · From ₹599' },
  { d: '08', mo: 'JUN', t: 'India Design ID', m: 'Jio World Convention Centre · From ₹299' },
  { d: '15', mo: 'JUN', t: 'Marathon Mumbai', m: 'Marine Drive · From ₹799' },
];
const TABS = ['All', 'Music', 'Comedy', 'Art & Culture', 'Food & Drinks', 'Workshops', 'Sports', 'Family'];

/** Events — live experiences happening now plus what's coming up next in the city. */
export function Events() {
  return (
    <EntPage className="ent-events">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 04" title="Experiences that connect us." sub="Concerts, comedy, art, food and sport — book together, remember longer." />

      <div className="tabrow live rise d1">
        {TABS.map((t, i) => <a key={t} href="#events" className={i === 0 ? 'on' : undefined}>{t}</a>)}
      </div>

      <div className="split rise d2" id="events">
        <div>
          <div className="blk-head"><h2>Happening Now</h2></div>
          <div className="g2" style={{ marginBottom: 36 }}>
            {LIVE.map((e) => (
              <Link className="evcard" to="/entertainment/showtime" key={e.title}>
                <div className={`evtile ${e.tint}`}><span className="livebadge">LIVE</span></div>
                <div className="eb"><h4>{e.title}</h4><div className="venue">{e.venue}</div><p className="price">From {e.price}</p></div>
              </Link>
            ))}
          </div>

          <div className="blk-head"><h2>Coming Up Next</h2></div>
          <div className="rows">
            {NEXT.map((e) => (
              <Link className="row" to="/entertainment/showtime" key={e.t}>
                <div className="datebadge"><b>{e.d}</b>{e.mo}</div>
                <div className="grow"><div className="t">{e.t}</div><div className="m">{e.m}</div></div>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Events Happening Now</h4>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>5 live experiences across the city right now — book before they sell out.</p>
          </div>
          <div className="card" style={{ background: 'linear-gradient(135deg,#241a3d,#4a3970)', color: '#fff', borderColor: 'rgba(212,175,94,.4)' }}>
            <h4 style={{ color: 'var(--gold-bright,#d4af5e)' }}>Join Together+</h4>
            <p style={{ fontSize: 12.5, opacity: .85, margin: '8px 0 14px' }}>Early access to Coldplay tickets, VIP invitations, exclusive discounts.</p>
            <Link className="btn btn-gold btn-sm" to="/entertainment" style={{ width: '100%', justifyContent: 'center' }}>Join Together+ →</Link>
          </div>
        </div>
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
