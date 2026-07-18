import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';

const CSS = `
.ent-sports .scorestrip{display:flex;gap:16px;overflow-x:auto;padding:14px 0;margin-bottom:8px}
.ent-sports .scorecard{flex-shrink:0;min-width:220px;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow)}
.ent-sports .scorecard .live{background:#c1443a;color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:999px}
.ent-sports .scorecard .vs{display:flex;justify-content:space-between;font-weight:600;font-size:14px;margin:8px 0}
.ent-sports .spcard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-sports .spcard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-sports .sptile{aspect-ratio:16/9;background:linear-gradient(150deg,#0e2a1e,#1d5c4d 55%,#8a6a2f);display:flex;align-items:flex-start;justify-content:space-between;padding:14px}
.ent-sports .sptile h5{color:#fff;font-size:15px;margin:0}
`;

const LIVE = [
  { rows: [['MI', '142/4 (16.2)'], ['CSK', 'Yet to bat']] },
  { rows: [['Mumbai City FC', '1'], ['Bengaluru FC', '1']] },
];
const FIXTURES = [
  { t: 'MI vs CSK', m: 'IPL · Wankhede Stadium · 26 May, 7:30 PM', price: '₹799' },
  { t: 'Mumbai City FC vs Kerala Blasters', m: 'ISL · Mumbai Football Arena · 02 Jun, 8:00 PM', price: '₹499' },
  { t: 'Mumbai Marathon', m: 'Marathon · Marine Drive · 15 Jun, 5:00 AM', price: '₹799' },
];
const PARTIES = [
  { t: 'MI vs CSK — Rooftop Watch Party', m: 'Bastian Sky Lounge, Bandra · 26 May · ₹599 incl. food & drinks' },
  { t: 'ISL Finals — Big Screen Night', m: 'The Habitat, Khar · Free entry, cash bar' },
];

/** Sports — live scores, upcoming fixtures and city watch parties. */
export function Sports() {
  return (
    <EntPage className="ent-sports">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 06" title="Sports" sub="Matchday, every day — live scores, tickets and watch parties." />
      <PosterHero src="/assets/img/sports-hero.webp" alt="The Rivalry Rewritten — India vs Pakistan" />

      <div className="blk-head rise d1"><h2>Live Matches</h2></div>
      <div className="scorestrip rise d1">
        {LIVE.map((c, i) => (
          <div className="scorecard" key={i}>
            <div className="eyebrow" style={{ marginBottom: 4 }}><span className="live">● LIVE</span></div>
            {c.rows.map(([a, b]) => <div className="vs" key={a}><span>{a}</span><span>{b}</span></div>)}
          </div>
        ))}
      </div>

      <div className="blk-head rise d2"><h2>Upcoming Fixtures</h2></div>
      <div className="grid3 rise d2" style={{ marginBottom: 44 }}>
        {FIXTURES.map((f) => (
          <Link className="spcard" to="/entertainment/showtime" key={f.t}>
            <div className="sptile"><h5>{f.t}</h5></div>
            <div style={{ padding: '14px 16px' }}>
              <div className="meta muted" style={{ fontSize: 12 }}>{f.m}</div>
              <p className="price" style={{ marginTop: 6 }}>From {f.price}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="blk-head rise d3"><h2>Watch Parties</h2></div>
      <div className="rows rise d3">
        {PARTIES.map((p) => (
          <div className="row" key={p.t}>
            <div className="av">◈</div>
            <div className="grow"><div className="t">{p.t}</div><div className="m">{p.m}</div></div>
            <Link className="btn btn-line btn-sm" to="/entertainment/showtime">Join</Link>
          </div>
        ))}
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
