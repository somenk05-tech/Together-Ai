import { Link } from 'react-router-dom';
import { EntPage, PosterLead, PosterHero, TrustBar } from './parts';

const CSS = `
.ent-movies .poster{aspect-ratio:2/3;border-radius:14px 14px 0 0;display:flex;align-items:flex-end;padding:14px;color:#fff;position:relative;overflow:hidden}
.ent-movies .poster .badge2{position:absolute;top:10px;left:10px;background:var(--gold,#c8a24a);color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:999px}
.ent-movies .poster h5{color:#fff;font-size:15px;line-height:1.2;margin:0}
.ent-movies .mv1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.ent-movies .mv2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.ent-movies .mv3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
.ent-movies .mv4{background:linear-gradient(150deg,#20182f,#63507f 60%,#6a8ab0)}
.ent-movies .moviecard{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s}
.ent-movies .moviecard:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.ent-movies .moviecard .mb{padding:14px 16px 16px}
.ent-movies .moviecard .mb .star{color:var(--gold-bright,#d4af5e);font-weight:600;font-size:13px}
.ent-movies .showpills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.ent-movies .showpills span{font-size:10.5px;font-weight:600;padding:4px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
`;

interface Movie { title: string; rating?: string; date?: string; badge?: string; tint: string; pills?: string[] }

const NOW: Movie[] = [
  { title: 'Mission: Impossible — Dead Reckoning', rating: '4.6', badge: 'IMAX', tint: 'mv1', pills: ['2D', 'IMAX'] },
  { title: 'Kingdom of the Planet of the Apes', rating: '4.4', tint: 'mv2', pills: ['2D', '3D'] },
  { title: 'IF', rating: '4.2', tint: 'mv3', pills: ['2D'] },
  { title: 'The Garfield Movie', rating: '4.1', tint: 'mv4', pills: ['2D'] },
  { title: 'Furiosa: A Mad Max Saga', rating: '4.5', badge: '4DX', tint: 'mv2', pills: ['2D', '4DX'] },
  { title: 'The Watchers', rating: '3.8', tint: 'mv1', pills: ['2D'] },
  { title: 'Interstellar — re-release', rating: '4.8', tint: 'mv3', pills: ['IMAX'] },
  { title: 'Dune: Part Two', rating: '4.7', tint: 'mv4', pills: ['2D', 'IMAX'] },
];

const WEEK: Movie[] = [
  { title: 'Bad Boys: Ride or Die', rating: '4.3', badge: 'New', tint: 'mv2', pills: ['2D'] },
  { title: 'The Strangers: Chapter 1', rating: '3.9', badge: 'New', tint: 'mv1', pills: ['2D'] },
  { title: 'Haikyu!! The Dumpster Battle', rating: '4.5', badge: 'New', tint: 'mv3', pills: ['2D'] },
  { title: 'The Fall Guy', rating: '4.2', badge: 'New', tint: 'mv4', pills: ['2D'] },
];

const COMING: Movie[] = [
  { title: 'Inside Out 2', date: '14 Aug 2026', tint: 'mv1' },
  { title: 'A Quiet Place: Day One', date: '21 Aug 2026', tint: 'mv2' },
  { title: 'Despicable Me 4', date: '28 Aug 2026', tint: 'mv3' },
  { title: 'Deadpool & Wolverine', date: '04 Sep 2026', tint: 'mv4' },
];

function MovieCard({ m }: { m: Movie }) {
  return (
    <Link className="moviecard" to="/entertainment/showtime">
      <div className={`poster ${m.tint}`}>{m.badge && <span className="badge2">{m.badge}</span>}<h5>{m.title}</h5></div>
      <div className="mb"><span className="star">★ {m.rating}</span><div className="showpills">{m.pills?.map((p) => <span key={p}>{p}</span>)}</div></div>
    </Link>
  );
}

/** Movies Now — in-theatre listings, weekly releases and coming-up reminders. */
export function Movies() {
  return (
    <EntPage className="ent-movies">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 01" title="Movies Now" sub="In theatres this week — book tickets in seconds." />
      <PosterHero src="/assets/img/movies-now-hero.webp" alt="Soulmate — a film in cinemas this week" />

      <div className="tabrow live rise d1">
        <a href="#now" className="on">Now Playing</a><a href="#week">This Week Releases</a><a href="#coming">Coming Up</a>
      </div>
      <div className="pill-row rise d1" style={{ marginBottom: 30 }}>
        <span className="pill on">All Languages</span><span className="pill">Hindi</span><span className="pill">English</span><span className="pill">Tamil</span>
        <span className="pill on">All Genres</span><span className="pill">Action</span><span className="pill">Drama</span>
        <span className="pill on">Format · All</span><span className="pill">2D</span><span className="pill">IMAX</span><span className="pill">4DX</span>
      </div>

      <div className="blk-head rise d2" id="now"><h2>🎬 Now Playing</h2></div>
      <div className="grid4 rise d2" style={{ marginBottom: 44 }}>{NOW.map((m) => <MovieCard key={m.title} m={m} />)}</div>

      <div className="blk-head rise d3" id="week"><h2>This Week's Releases</h2></div>
      <div className="grid4 rise d3" style={{ marginBottom: 44 }}>{WEEK.map((m) => <MovieCard key={m.title} m={m} />)}</div>

      <div className="blk-head rise d4" id="coming"><h2>📅 Coming Up</h2></div>
      <div className="grid4 rise d4">
        {COMING.map((m) => (
          <div className="moviecard" key={m.title}>
            <div className={`poster ${m.tint}`}><h5>{m.title}</h5></div>
            <div className="mb">
              <span className="muted" style={{ fontSize: 12 }}>{m.date}</span>
              <button type="button" className="btn btn-line btn-sm" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}>+ Remind me</button>
            </div>
          </div>
        ))}
      </div>

      <TrustBar items={['Best prices', 'Instant booking', 'Secure payments', '24/7 support']} />
    </EntPage>
  );
}
