import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';
import { useLiveMovies, useLiveMovie, type LiveMovie } from '../api';

const CSS = `
.ent-movies .poster{aspect-ratio:2/3;border-radius:14px 14px 0 0;display:flex;align-items:flex-end;padding:14px;color:#fff;position:relative;overflow:hidden}
.ent-movies .poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.ent-movies .poster .badge2{position:absolute;top:10px;left:10px;background:var(--gold,#c8a24a);color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:999px;z-index:2}
.ent-movies .poster h5{color:#fff;font-size:15px;line-height:1.2;margin:0;position:relative;z-index:2;text-shadow:0 1px 8px rgba(0,0,0,.65)}
.ent-movies .poster .scrim{position:absolute;inset:auto 0 0 0;height:55%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72));z-index:1}
.ent-movies .mv1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.ent-movies .mv2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.ent-movies .mv3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
.ent-movies .mv4{background:linear-gradient(150deg,#20182f,#63507f 60%,#6a8ab0)}
.ent-movies .moviecard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s;cursor:pointer;text-align:left;font-family:inherit;padding:0;width:100%}
.ent-movies .moviecard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-movies .moviecard .mb{padding:14px 16px 16px}
.ent-movies .moviecard .mb .star{color:var(--gold-bright,#d4af5e);font-weight:600;font-size:13px}
.ent-movies .showpills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ent-movies .showpills span{font-size:10.5px;font-weight:600;padding:4px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
.ent-movies .mv-modal{position:fixed;inset:0;z-index:9000;background:rgba(10,8,20,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}
.ent-movies .mv-sheet{width:min(720px,100%);max-height:88vh;overflow-y:auto;background:var(--card,#fff);border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
.ent-movies .mv-hero{position:relative;aspect-ratio:16/7;background:linear-gradient(150deg,#241a3d,#5b4b8a)}
.ent-movies .mv-hero img{width:100%;height:100%;object-fit:cover}
.ent-movies .mv-hero .x{position:absolute;top:12px;right:12px;border:none;border-radius:999px;width:34px;height:34px;background:rgba(0,0,0,.55);color:#fff;font-size:15px;cursor:pointer}
.ent-movies .castrow{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
.ent-movies .castrow .c{flex:0 0 86px;text-align:center}
.ent-movies .castrow .c img,.ent-movies .castrow .c .ph{width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 6px;display:block;background:var(--accent-soft)}
`;

/* ── curated fallback (shown until a TMDB key is configured on the backend) ── */
interface FallbackMovie { title: string; rating?: string; date?: string; badge?: string; tint: string; pills?: string[] }
const NOW_FALLBACK: FallbackMovie[] = [
  { title: 'Mission: Impossible — Dead Reckoning', rating: '4.6', badge: 'IMAX', tint: 'mv1', pills: ['2D', 'IMAX'] },
  { title: 'Kingdom of the Planet of the Apes', rating: '4.4', tint: 'mv2', pills: ['2D', '3D'] },
  { title: 'IF', rating: '4.2', tint: 'mv3', pills: ['2D'] },
  { title: 'The Garfield Movie', rating: '4.1', tint: 'mv4', pills: ['2D'] },
  { title: 'Furiosa: A Mad Max Saga', rating: '4.5', badge: '4DX', tint: 'mv2', pills: ['2D', '4DX'] },
  { title: 'The Watchers', rating: '3.8', tint: 'mv1', pills: ['2D'] },
  { title: 'Interstellar — re-release', rating: '4.8', tint: 'mv3', pills: ['IMAX'] },
  { title: 'Dune: Part Two', rating: '4.7', tint: 'mv4', pills: ['2D', 'IMAX'] },
];
const WEEK_FALLBACK: FallbackMovie[] = [
  { title: 'Bad Boys: Ride or Die', rating: '4.3', badge: 'New', tint: 'mv2', pills: ['2D'] },
  { title: 'The Strangers: Chapter 1', rating: '3.9', badge: 'New', tint: 'mv1', pills: ['2D'] },
  { title: 'Haikyu!! The Dumpster Battle', rating: '4.5', badge: 'New', tint: 'mv3', pills: ['2D'] },
  { title: 'The Fall Guy', rating: '4.2', badge: 'New', tint: 'mv4', pills: ['2D'] },
];
const COMING_FALLBACK: FallbackMovie[] = [
  { title: 'Inside Out 2', date: '14 Aug 2026', tint: 'mv1' },
  { title: 'A Quiet Place: Day One', date: '21 Aug 2026', tint: 'mv2' },
  { title: 'Despicable Me 4', date: '28 Aug 2026', tint: 'mv3' },
  { title: 'Deadpool & Wolverine', date: '04 Sep 2026', tint: 'mv4' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const prettyDate = (d: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
};
const TINTS = ['mv1', 'mv2', 'mv3', 'mv4'];

function FallbackCard({ m }: { m: FallbackMovie }) {
  return (
    <Link className="moviecard" to="/entertainment/showtime">
      <div className={`poster ${m.tint}`}>{m.badge && <span className="badge2">{m.badge}</span>}<h5>{m.title}</h5></div>
      <div className="mb"><span className="star">★ {m.rating}</span><div className="showpills">{m.pills?.map((p) => <span key={p}>{p}</span>)}</div></div>
    </Link>
  );
}

function LiveCard({ m, i, badge, onOpen }: { m: LiveMovie; i: number; badge?: string; onOpen: (id: number) => void }) {
  return (
    <button type="button" className="moviecard" onClick={() => onOpen(m.id)}>
      <div className={`poster ${TINTS[i % 4]}`}>
        {m.posterUrl && <img src={m.posterUrl} alt={m.title} loading="lazy" />}
        <span className="scrim" />
        {badge && <span className="badge2">{badge}</span>}
        <h5>{m.title}</h5>
      </div>
      <div className="mb">
        {m.rating != null ? <span className="star">★ {m.rating.toFixed(1)}</span> : <span className="muted" style={{ fontSize: 12 }}>{prettyDate(m.releaseDate)}</span>}
        <div className="showpills">
          <span>{m.language}</span>
          {m.genres.slice(0, 2).map((g) => <span key={g}>{g}</span>)}
        </div>
      </div>
    </button>
  );
}

/** Full movie sheet — overview, cast, runtime and where to watch in India. */
function MovieSheet({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useLiveMovie(id);
  const m = q.data;
  return (
    <div className="mv-modal" onClick={onClose}>
      <div className="mv-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mv-hero">
          {m?.backdropUrl ? <img src={m.backdropUrl} alt="" /> : null}
          <button type="button" className="x" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '20px 24px 24px' }}>
          {q.isLoading && <p className="muted" style={{ fontSize: 13 }}>Loading movie details…</p>}
          {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load this movie right now.</p>}
          {m && (
            <>
              <h2 style={{ margin: '0 0 2px', fontSize: 24 }}>{m.title}</h2>
              {m.tagline && <p className="muted" style={{ fontSize: 13, fontStyle: 'italic', margin: '0 0 10px' }}>{m.tagline}</p>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 14px' }}>
                {m.rating != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold-bright,#c8a24a)' }}>★ {m.rating.toFixed(1)}<span className="muted" style={{ fontWeight: 400 }}> ({m.votes.toLocaleString('en-IN')} votes)</span></span>}
                {m.runtime ? <span className="muted" style={{ fontSize: 12.5 }}>· {Math.floor(m.runtime / 60)}h {m.runtime % 60}m</span> : null}
                {m.releaseDate && <span className="muted" style={{ fontSize: 12.5 }}>· {prettyDate(m.releaseDate)}</span>}
                <span className="muted" style={{ fontSize: 12.5 }}>· {m.language}</span>
              </div>
              <div className="showpills" style={{ marginBottom: 14 }}>{m.genres.map((g) => <span key={g}>{g}</span>)}</div>
              <p style={{ fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' }}>{m.overview}</p>
              {m.directors.length > 0 && <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>Directed by <strong style={{ color: 'var(--ink)' }}>{m.directors.join(', ')}</strong></p>}
              {m.cast.length > 0 && (
                <>
                  <h4 style={{ margin: '0 0 10px' }}>Cast</h4>
                  <div className="castrow" style={{ marginBottom: 16 }}>
                    {m.cast.map((c) => (
                      <div className="c" key={c.name}>
                        {c.photoUrl ? <img src={c.photoUrl} alt={c.name} loading="lazy" /> : <span className="ph" />}
                        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{c.name}</div>
                        <div className="muted" style={{ fontSize: 10.5 }}>{c.character}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {(m.watch.stream.length > 0 || m.watch.rent.length > 0) && (
                <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px' }}>Where to watch 🇮🇳</h4>
                  {m.watch.stream.length > 0 && <p style={{ fontSize: 13, margin: '0 0 4px' }}><strong>Stream:</strong> {m.watch.stream.join(' · ')}</p>}
                  {m.watch.rent.length > 0 && <p style={{ fontSize: 13, margin: 0 }}><strong>Rent:</strong> {m.watch.rent.join(' · ')}</p>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="btn btn-gold btn-sm" to="/entertainment/showtime">🎟 Book tickets</Link>
                <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Close</button>
              </div>
              <p className="muted" style={{ fontSize: 10.5, marginTop: 14 }}>{m.attribution}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Movies Now — in-theatre listings, weekly releases and coming-up reminders. */
export function Movies() {
  const live = useLiveMovies();
  const [openId, setOpenId] = useState<number | null>(null);
  const isLive = live.data?.live === true;
  const d = live.data;

  return (
    <EntPage className="ent-movies">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 01" title="Movies Now" sub="In theatres this week — book tickets in seconds." />
      <PosterHero src="/assets/img/movies-now-hero.webp" alt="Soulmate — a film in cinemas this week" />

      <div className="tabrow live rise d1">
        <a href="#now" className="on">Now Playing</a><a href="#week">This Week Releases</a><a href="#coming">Coming Up</a>
      </div>

      <div className="blk-head rise d2" id="now"><h2>🎬 Now Playing</h2>{isLive && <span className="muted" style={{ fontSize: 12 }}>Live in Indian theatres · tap a movie for details</span>}</div>
      <div className="grid4 rise d2" style={{ marginBottom: 44 }}>
        {isLive
          ? d!.nowPlaying.map((m, i) => <LiveCard key={m.id} m={m} i={i} onOpen={setOpenId} />)
          : NOW_FALLBACK.map((m) => <FallbackCard key={m.title} m={m} />)}
      </div>

      <div className="blk-head rise d3" id="week"><h2>This Week's Releases</h2></div>
      <div className="grid4 rise d3" style={{ marginBottom: 44 }}>
        {isLive
          ? (d!.thisWeek.length ? d!.thisWeek : d!.nowPlaying.slice(0, 4)).map((m, i) => <LiveCard key={m.id} m={m} i={i} badge="New" onOpen={setOpenId} />)
          : WEEK_FALLBACK.map((m) => <FallbackCard key={m.title} m={m} />)}
      </div>

      <div className="blk-head rise d4" id="coming"><h2>📅 Coming Up</h2></div>
      <div className="grid4 rise d4">
        {isLive
          ? d!.comingUp.map((m, i) => <LiveCard key={m.id} m={m} i={i} badge={prettyDate(m.releaseDate)} onOpen={setOpenId} />)
          : COMING_FALLBACK.map((m) => (
            <div className="moviecard" key={m.title}>
              <div className={`poster ${m.tint}`}><h5>{m.title}</h5></div>
              <div className="mb">
                <span className="muted" style={{ fontSize: 12 }}>{m.date}</span>
                <button type="button" className="btn btn-line btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>+ Remind me</button>
              </div>
            </div>
          ))}
      </div>

      {isLive && <p className="muted rise d4" style={{ fontSize: 11, marginTop: 18 }}>Movie data & images: TMDB · This product uses the TMDB API but is not endorsed or certified by TMDB.</p>}

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
      {openId != null && <MovieSheet id={openId} onClose={() => setOpenId(null)} />}
    </EntPage>
  );
}
