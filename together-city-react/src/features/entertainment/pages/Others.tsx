import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';

const CSS = `
.ent-others .othcard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-others .othcard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-others .othtile{aspect-ratio:16/10;display:flex;align-items:flex-end;padding:14px}
.ent-others .othtile h5{color:#fff;font-size:15px;margin:0}
.ent-others .ot1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.ent-others .ot2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.ent-others .ot3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
`;

const NIGHTLIFE = [
  { t: 'Bastian Sky Lounge — Ladies Night', m: 'Bandra · Wed, 9:00 PM · Free entry for ladies', p: 'From ₹999 (couples)', tint: 'ot1' },
  { t: 'Trilogy — House Music Night', m: 'Khar · Fri, 10:00 PM', p: 'From ₹1,499', tint: 'ot2' },
  { t: 'Toit Brewpub — Live DJ Set', m: 'Andheri · Sat, 9:30 PM', p: 'From ₹699', tint: 'ot3' },
];
const GAMING = [
  { t: 'BGMI Together City Cup', m: 'Online · Registrations open · Prize pool ₹2,00,000', tint: 'ot1' },
  { t: 'FIFA 26 LAN Night', m: 'Smaaash, Powai · Sun, 4:00 PM · ₹299 entry', tint: 'ot2' },
];
const WORKSHOPS = [
  { t: 'Beyond Reality — VR Experience', m: 'Jio World Drive · Book any slot · From ₹599' },
  { t: 'Escape Room — The Vault', m: 'Lower Parel · 60 min · From ₹499 per person' },
];

/** Others — nightlife, gaming tournaments, workshops and experiences that don't fit a box. */
export function Others() {
  return (
    <EntPage className="ent-others">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 07" title="Others — Music, Gaming & More" sub="Nightlife, gaming tournaments and workshops that don't fit a box." />
      <PosterHero src="/assets/img/others-hero.webp" alt="Game On: The City — esports grand finals" />

      <div className="blk-head rise d1"><h2>Nightlife</h2></div>
      <div className="grid3 rise d1" style={{ marginBottom: 44 }}>
        {NIGHTLIFE.map((n) => (
          <Link className="othcard" to="/entertainment/showtime" key={n.t}>
            <div className={`othtile ${n.tint}`}><h5>{n.t}</h5></div>
            <div style={{ padding: '14px 16px' }}><div className="meta muted" style={{ fontSize: 12 }}>{n.m}</div><p className="price" style={{ marginTop: 6 }}>{n.p}</p></div>
          </Link>
        ))}
      </div>

      <div className="blk-head rise d2"><h2>Gaming Tournaments</h2></div>
      <div className="grid3 rise d2" style={{ marginBottom: 44 }}>
        {GAMING.map((g) => (
          <Link className="othcard" to="/entertainment/showtime" key={g.t}>
            <div className={`othtile ${g.tint}`}><h5>{g.t}</h5></div>
            <div style={{ padding: '14px 16px' }}><div className="meta muted" style={{ fontSize: 12 }}>{g.m}</div></div>
          </Link>
        ))}
      </div>

      <div className="blk-head rise d3"><h2>Workshops & Experiences</h2></div>
      <div className="rows rise d3">
        {WORKSHOPS.map((w) => (
          <div className="row" key={w.t}>
            <div className="av">◈</div>
            <div className="grow"><div className="t">{w.t}</div><div className="m">{w.m}</div></div>
            <Link className="btn btn-line btn-sm" to="/entertainment/showtime">Book now</Link>
          </div>
        ))}
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
