import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';

const CSS = `
.ent-comedy .comcard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-comedy .comcard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-comedy .comtile{aspect-ratio:16/10;background:repeating-linear-gradient(0deg,#2a2116,#2a2116 22px,#211a10 22px,#211a10 24px);display:flex;align-items:flex-end;padding:14px;position:relative}
.ent-comedy .comtile::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,4,.75),transparent 60%)}
.ent-comedy .comtile h5{position:relative;color:#fff;font-size:15px;z-index:2;margin:0}
.ent-comedy .comcard .cb{padding:14px 16px 16px}
.ent-comedy .comcard .cb .meta{font-size:12px;color:var(--muted);margin:4px 0 8px}
.ent-comedy .comcard .cb .star{color:var(--gold-bright,#d4af5e);font-weight:600}
`;

const TONIGHT = [
  { t: 'Zakir Khan — "Tathastu"', rating: '4.9', meta: 'NMACC, BKC · 8:00 PM', price: '₹299' },
  { t: 'Kenny Sebastian — Live', rating: '4.7', meta: 'The Cuckoo Club, Lower Parel · 9:00 PM', price: '₹399' },
  { t: 'Aditi Mittal — Storyteller', rating: '4.6', meta: 'Canvas Laugh Club, Andheri · 8:30 PM', price: '₹349' },
];
const MICS = [
  { t: 'Open Mic Tuesdays', m: 'The Habitat, Khar · Every Tuesday · Free entry' },
  { t: 'New Voices Night', m: 'Canvas Laugh Club, Andheri · Every Thursday · ₹99' },
];
const SPECIALS = [
  { t: 'Vir Das — Fool Volume', m: 'Netflix · Stand-up special' },
  { t: 'Biswa Kalyan Rath — Kal Main Udega', m: 'Prime Video · Stand-up special' },
  { t: 'Abhishek Upmanyu — Bhaad Mein Jao', m: 'Amazon miniTV · Stand-up special' },
];

/** Comedy Club — tonight's stand-up, open mics and stand-up specials on OTT. */
export function Comedy() {
  return (
    <EntPage className="ent-comedy">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 05" title="Comedy Club" sub="Live laughs, every night of the week." />
      <PosterHero src="/assets/img/comedy-hero.webp" alt="Stand Up for Life — a stand-up comedy special" />

      <div className="tabrow live rise d1">
        <a href="#tonight" className="on">Tonight's Shows</a><a href="#mics">Open Mics</a><a href="#specials">Specials on OTT</a>
      </div>

      <div className="blk-head rise d2" id="tonight"><h2>Tonight's Shows</h2></div>
      <div className="grid3 rise d2" style={{ marginBottom: 44 }}>
        {TONIGHT.map((c) => (
          <Link className="comcard" to="/entertainment/showtime" key={c.t}>
            <div className="comtile"><h5>{c.t}</h5></div>
            <div className="cb"><span className="star">★ {c.rating}</span><div className="meta">{c.meta}</div><p className="price">From {c.price}</p></div>
          </Link>
        ))}
      </div>

      <div className="blk-head rise d3" id="mics"><h2>Open Mics</h2></div>
      <div className="rows rise d3" style={{ marginBottom: 36 }}>
        {MICS.map((m) => (
          <div className="row" key={m.t}>
            <div className="av">◈</div>
            <div className="grow"><div className="t">{m.t}</div><div className="m">{m.m}</div></div>
            <Link className="btn btn-line btn-sm" to="/entertainment/showtime">Book seat</Link>
          </div>
        ))}
      </div>

      <div className="blk-head rise d4" id="specials"><h2>Specials on OTT</h2></div>
      <div className="grid3 rise d4">
        {SPECIALS.map((s) => (
          <Link className="comcard" to="/entertainment/ott" key={s.t}>
            <div className="comtile"><h5>{s.t}</h5></div>
            <div className="cb"><div className="meta">{s.m}</div></div>
          </Link>
        ))}
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
