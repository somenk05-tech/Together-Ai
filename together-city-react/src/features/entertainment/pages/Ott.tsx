import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';
import { useLiveOtt, type OttTitle } from '../api';

const CSS = `
.ent-ott .showrow{display:flex;align-items:center;gap:16px;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:14px;padding:14px 18px;margin-bottom:10px;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-ott .showrow:hover{transform:translateY(-2px);box-shadow:var(--shadow-deep)}
.ent-ott .showrow .tile{width:52px;height:52px;border-radius:10px;flex-shrink:0;background:linear-gradient(150deg,#241a3d,#5b4b8a);display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--serif,Georgia);font-size:16px;overflow:hidden}
.ent-ott .showrow .tile img{width:100%;height:100%;object-fit:cover}
.ent-ott .showrow .grow{flex:1;min-width:0}
.ent-ott .showrow .plat{font-size:11px;color:var(--muted)}
.ent-ott .split{display:grid;grid-template-columns:2fr 1fr;gap:28px}
@media(max-width:860px){.ent-ott .split{grid-template-columns:1fr}}
`;

interface Show { i: string; t: string; plat: string; primary?: boolean }

const NOW: Show[] = [
  { i: 'A', t: 'Atlas', plat: 'Netflix · Sci-Fi Action', primary: true },
  { i: 'K', t: 'Kingdom of the Planet of the Apes', plat: 'Disney+ Hotstar · Sci-Fi', primary: true },
  { i: 'I', t: 'The Idea of You', plat: 'Prime Video · Romance', primary: true },
  { i: 'B', t: 'Bheema', plat: 'ZEE5 · Action Drama', primary: true },
  { i: 'I', t: 'I.S.S.', plat: 'JioCinema · Thriller', primary: true },
  { i: 'M', t: 'MasterChef India S8', plat: 'SonyLIV · Reality', primary: true },
];
const POPULAR: Show[] = [
  { i: 'P', t: 'Panchayat S3', plat: 'Prime Video · ★ 4.8' },
  { i: 'M', t: 'Mirzapur S3', plat: 'Prime Video · ★ 4.7' },
  { i: 'B', t: 'The Boys S4', plat: 'Prime Video · ★ 4.6' },
  { i: 'H', t: 'House of the Dragon S2', plat: 'JioCinema · ★ 4.7' },
  { i: 'S', t: 'Shogun', plat: 'JioCinema · ★ 4.8' },
  { i: 'S', t: 'Scoop', plat: 'Netflix · ★ 4.2' },
];
const COMING = [
  { t: 'The Umbrella Academy S4', m: 'Netflix · 08 Aug' },
  { t: 'Monarch', m: 'Apple TV+ · 15 Aug' },
  { t: 'Daryl Dixon S2', m: 'Hotstar · 22 Aug' },
];

function Row({ s }: { s: Show }) {
  return (
    <div className="showrow">
      <div className="tile">{s.i}</div>
      <div className="grow"><div style={{ fontWeight: 600 }}>{s.t}</div><div className="plat">{s.plat}</div></div>
      <button type="button" className={`btn btn-sm ${s.primary ? 'btn-gold' : 'btn-line'}`}>Watch now</button>
    </div>
  );
}

function LiveRow({ t, primary }: { t: OttTitle; primary?: boolean }) {
  const sub = [t.platform ?? 'In theatres / on demand', t.genres[0], t.rating != null ? `★ ${t.rating.toFixed(1)}` : null].filter(Boolean).join(' · ');
  return (
    <div className="showrow">
      <div className="tile">{t.posterUrl ? <img src={t.posterUrl} alt={t.title} loading="lazy" /> : t.title[0]}</div>
      <div className="grow"><div style={{ fontWeight: 600 }}>{t.title}</div><div className="plat">{sub}</div></div>
      <button type="button" className={`btn btn-sm ${primary ? 'btn-gold' : 'btn-line'}`}>Watch now</button>
    </div>
  );
}

/** OTT Watch — mood- and platform-filtered streaming picks across every service. */
export function Ott() {
  const live = useLiveOtt();
  const isLive = live.data?.live === true;
  const d = live.data;
  const topPick = isLive ? d!.streaming.find((t) => t.platform) ?? d!.streaming[0] : null;
  return (
    <EntPage className="ent-ott">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 02" title="OTT Watch" sub="What to stream tonight — curated across every platform you already pay for." />
      <PosterHero src="/assets/img/ott-watch-hero.webp" alt="Control X — an OTT original series, only on Together OTT" />

      <div className="blk-head rise d1"><h2>Curated by mood</h2></div>
      <div className="pill-row rise d1" style={{ marginBottom: 16 }}>
        <span className="pill on">All Moods</span><span className="pill">Feel Good</span><span className="pill">Edge of Seat</span><span className="pill">Weekend Binge</span><span className="pill">Something Light</span>
      </div>
      <div className="blk-head rise d1"><h2>Filter by platform</h2></div>
      <div className="pill-row rise d1" style={{ marginBottom: 36 }}>
        <span className="pill on">Netflix</span><span className="pill">Prime Video</span><span className="pill">Disney+ Hotstar</span><span className="pill">Apple TV+</span>
        <span className="pill">SonyLIV</span><span className="pill">ZEE5</span><span className="pill">JioCinema</span><span className="pill">Voot Select</span>
      </div>

      <div className="split rise d2">
        <div>
          <div className="blk-head"><h2>Now Streaming</h2>{isLive && <span className="muted" style={{ fontSize: 12 }}>Trending this week · live</span>}</div>
          <div className="rows" style={{ marginBottom: 32 }}>
            {isLive ? d!.streaming.map((t) => <LiveRow key={`tv${t.id}`} t={t} primary />) : NOW.map((s, i) => <Row key={s.t + i} s={s} />)}
          </div>
          <div className="blk-head"><h2>Popular {isLive ? 'Movies on OTT' : 'Shows'}</h2></div>
          <div className="rows">
            {isLive ? d!.popular.map((t) => <LiveRow key={`mv${t.id}`} t={t} />) : POPULAR.map((s, i) => <Row key={s.t + i} s={s} />)}
          </div>
          {isLive && <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>Data & images: TMDB · JustWatch. Not endorsed or certified by TMDB.</p>}
        </div>
        <div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Today's Top Picks</h4>
            <p className="muted" style={{ fontSize: 12.5, margin: '8px 0' }}>{topPick ? `${topPick.title}${topPick.platform ? ` — ${topPick.platform}` : ''}` : 'Atlas — Netflix'}</p>
            <button type="button" className="btn btn-gold btn-sm" style={{ width: '100%', justifyContent: 'center' }}>Watch now</button>
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <h4>Coming Up on OTT</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {COMING.map((c) => (
                <div className="row" key={c.t} style={{ boxShadow: 'none', padding: '10px 12px' }}>
                  <div className="grow"><div className="t" style={{ fontSize: 13 }}>{c.t}</div><div className="m">{c.m}</div></div>
                  <button type="button" className="btn btn-line btn-sm">+ Remind</button>
                </div>
              ))}
            </div>
          </div>
          <Link className="btn btn-line" to="/entertainment/tickets" style={{ width: '100%', justifyContent: 'center' }}>My Watchlist →</Link>
        </div>
      </div>

      <TrustBar items={['All platforms, one place', 'Mood-based picks', 'Smart reminders', 'Watchlist sync']} />
    </EntPage>
  );
}
