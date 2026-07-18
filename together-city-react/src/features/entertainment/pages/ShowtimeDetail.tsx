import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntPage, TrustBar } from './parts';

const CSS = `
.ent-detail .hero{min-height:260px;position:relative;border-radius:18px;overflow:hidden;display:flex;align-items:flex-end}
.ent-detail .hero .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ent-detail .hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(6,4,14,.9),rgba(6,4,14,.15) 60%)}
.ent-detail .hero .inner{position:relative;z-index:2;padding:24px 28px;color:#fff}
.ent-detail .hero .inner h1{color:#fff;margin:2px 0}
.ent-detail .hero .inner .eyebrow{color:var(--gold-bright,#d4af5e)}
.ent-detail .hero .inner .sub{color:rgba(255,255,255,.85)}
.ent-detail .playbtn{position:absolute;left:28px;bottom:26px;z-index:3;display:flex;align-items:center;gap:10px;color:#fff;font-size:12px;letter-spacing:.1em;font-weight:600;text-transform:uppercase;cursor:pointer}
.ent-detail .playbtn .ic{width:52px;height:52px;border-radius:50%;border:1.5px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;font-size:16px}
.ent-detail .detail-lay{display:grid;grid-template-columns:1fr 340px;gap:32px;align-items:start;margin-top:24px}
@media(max-width:860px){.ent-detail .detail-lay{grid-template-columns:1fr}}
.ent-detail .caststrip{display:flex;gap:16px;overflow-x:auto;padding:6px 0 12px}
.ent-detail .castcard{flex-shrink:0;width:96px;text-align:center}
.ent-detail .castcard .av{width:72px;height:72px;margin:0 auto 8px;font-size:18px}
.ent-detail .castcard .role{font-size:11px;color:var(--muted)}
.ent-detail .showtimebox{border:1px solid var(--line,#eee);border-radius:14px;padding:14px 16px;margin-bottom:10px}
.ent-detail .showtimebox .cinema{font-weight:600;font-size:13.5px;margin-bottom:8px}
.ent-detail .timepill{display:inline-block;font-size:12px;font-weight:600;padding:7px 14px;border-radius:8px;border:1px solid var(--line,#eee);margin:3px 6px 3px 0;cursor:pointer;background:transparent}
.ent-detail .timepill.sel{background:var(--accent);border-color:var(--accent);color:#fff}
.ent-detail .venuecard{background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:14px;padding:16px;font-size:12.5px;color:var(--ink-soft)}
`;

const CAST = [
  { i: 'MM', n: 'Matthew M.', r: 'Cooper' },
  { i: 'AH', n: 'Anne H.', r: 'Brand' },
  { i: 'JC', n: 'Jessica C.', r: 'Murph' },
  { i: 'MC', n: 'Michael C.', r: 'Professor Brand' },
];
const CINEMAS = [
  { name: 'PVR Phoenix Marketcity, Kurla', times: ['10:30 AM', '2:15 PM', '6:00 PM', '9:45 PM'] },
  { name: 'INOX Nariman Point — IMAX', times: ['11:00 AM', '3:30 PM', '7:15 PM'] },
];

/** Showtime detail — synopsis, cast and showtimes for a title, leading into seat selection. */
export function ShowtimeDetail() {
  const [sel, setSel] = useState('PVR Phoenix Marketcity, Kurla|10:30 AM');

  return (
    <EntPage className="ent-detail">
      <style>{CSS}</style>

      <div className="hero rise">
        <img className="bg" src="/assets/img/entertainment.webp" alt="Now playing" style={{ objectPosition: '20% 45%' }} />
        <span className="playbtn"><span className="ic">▶</span>Watch trailer</span>
        <div className="inner">
          <div className="eyebrow">Movie · Sci-Fi · IMAX re-release</div>
          <h1 style={{ fontSize: 'clamp(28px,3.4vw,44px)' }}>Interstellar</h1>
          <p className="sub">★ 4.8 · 2h 49m · Hindi, English · U/A</p>
        </div>
      </div>

      <div className="detail-lay rise d1">
        <section>
          <h3 style={{ marginBottom: 10 }}>Synopsis</h3>
          <p className="lede" style={{ marginBottom: 20 }}>A team of explorers travel through a wormhole in search of a new home for humanity, racing against time and a dying Earth.</p>

          <div className="pill-row" style={{ marginBottom: 24 }}>
            <span className="tag">2D</span><span className="tag">IMAX</span><span className="tag">Hindi</span><span className="tag">English</span>
          </div>

          <h3 style={{ marginBottom: 12 }}>Cast</h3>
          <div className="caststrip" style={{ marginBottom: 26 }}>
            {CAST.map((c) => (
              <div className="castcard" key={c.i}>
                <div className="av" style={{ margin: '0 auto 8px' }}>{c.i}</div>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{c.n}</div>
                <div className="role">{c.r}</div>
              </div>
            ))}
          </div>

          <h3 style={{ marginBottom: 12 }}>Showtimes — Sun, 13 Jul 2026</h3>
          {CINEMAS.map((cin) => (
            <div className="showtimebox" key={cin.name}>
              <div className="cinema">{cin.name}</div>
              {cin.times.map((t) => {
                const key = `${cin.name}|${t}`;
                return <span key={t} className={`timepill ${sel === key ? 'sel' : ''}`} onClick={() => setSel(key)}>{t}</span>;
              })}
            </div>
          ))}

          <h3 style={{ margin: '24px 0 10px' }}>Venue</h3>
          <div className="venuecard">PVR Phoenix Marketcity, LBS Marg, Kurla West, Mumbai · Parking available · Wheelchair accessible</div>
        </section>

        <aside>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4 style={{ marginBottom: 10 }}>Selected showtime</h4>
            <p className="muted" style={{ fontSize: 13 }}>{sel.split('|')[0]} · {sel.split('|')[1]} · 2D</p>
            <Link className="btn btn-gold" to="/entertainment/seats" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}>Book tickets</Link>
            <button type="button" className="btn btn-line btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>◈ Discuss with friends</button>
          </div>
          <div className="card">
            <h4>Together+ member perk</h4>
            <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>10% off this showtime and early access to premiere seats.</p>
            <Link className="btn btn-line btn-sm" to="/entertainment" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>Join Together+</Link>
          </div>
        </aside>
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
