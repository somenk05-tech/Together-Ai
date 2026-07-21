import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useLiveTitle, usePerson, type LiveMovie, type TitleRef } from '../api';

/**
 * Shared TMDB UI kit for the Entertainment hub — poster cards, the full
 * title sheet (movie & TV: trailer, cast, seasons, certification, where to
 * watch, recommendations) and the person sheet. All data flows through the
 * backend proxy; nothing here is hardcoded.
 */

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const prettyDate = (d: string | null) => {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
};
export type TitleSel = { type: 'movie' | 'tv'; id: number };
const TINTS = ['mvk1', 'mvk2', 'mvk3', 'mvk4'];

export const KIT_CSS = `
.mvk-card{display:block;text-decoration:none;color:inherit;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:16px;overflow:hidden;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s;cursor:pointer;text-align:left;font-family:inherit;padding:0;width:100%}
.mvk-card:hover{transform:translateY(-4px);box-shadow:var(--shadow-deep)}
.mvk-poster{aspect-ratio:2/3;display:flex;align-items:flex-end;padding:14px;color:#fff;position:relative;overflow:hidden}
.mvk-poster img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.mvk-poster .scrim{position:absolute;inset:auto 0 0 0;height:55%;background:linear-gradient(180deg,transparent,rgba(0,0,0,.72));z-index:1}
.mvk-poster h5{color:#fff;font-size:15px;line-height:1.2;margin:0;position:relative;z-index:2;text-shadow:0 1px 8px rgba(0,0,0,.65)}
.mvk-poster .badge{position:absolute;top:10px;left:10px;background:var(--gold,#c8a24a);color:#fff;font-size:10px;font-weight:700;letter-spacing:.08em;padding:3px 9px;border-radius:999px;z-index:2}
.mvk1{background:linear-gradient(150deg,#241a3d,#5b4b8a 60%,#8a6a2f)}
.mvk2{background:linear-gradient(150deg,#1b1430,#3c2f66 60%,#b76e79)}
.mvk3{background:linear-gradient(150deg,#150f26,#453a72 55%,#d4af5e)}
.mvk4{background:linear-gradient(150deg,#20182f,#63507f 60%,#6a8ab0)}
.mvk-mb{padding:14px 16px 16px}
.mvk-mb .star{color:var(--gold-bright,#d4af5e);font-weight:600;font-size:13px}
.mvk-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.mvk-pills span{font-size:10.5px;font-weight:600;padding:4px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent)}
.mvk-modal{position:fixed;inset:0;z-index:9000;background:rgba(10,8,20,.72);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:18px}
.mvk-sheet{width:min(760px,100%);max-height:88vh;overflow-y:auto;background:var(--card,#fff);border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.5)}
.mvk-hero{position:relative;aspect-ratio:16/7;background:linear-gradient(150deg,#241a3d,#5b4b8a)}
.mvk-hero img{width:100%;height:100%;object-fit:cover}
.mvk-hero iframe{width:100%;height:100%;border:none}
.mvk-hero .x{position:absolute;top:12px;right:12px;border:none;border-radius:999px;width:34px;height:34px;background:rgba(0,0,0,.55);color:#fff;font-size:15px;cursor:pointer;z-index:3}
.mvk-hero .play{position:absolute;inset:0;margin:auto;width:64px;height:64px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:22px;cursor:pointer;z-index:2}
.mvk-hero .play:hover{background:var(--gold,#c8a24a)}
.mvk-castrow{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}
.mvk-castrow .c{flex:0 0 86px;text-align:center;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;color:inherit}
.mvk-castrow .c img,.mvk-castrow .c .ph{width:64px;height:64px;border-radius:50%;object-fit:cover;margin:0 auto 6px;display:block;background:var(--accent-soft)}
.mvk-recrow{display:flex;gap:10px;overflow-x:auto;padding-bottom:6px}
.mvk-recrow .r{flex:0 0 108px;background:none;border:none;cursor:pointer;font-family:inherit;padding:0;color:inherit;text-align:left}
.mvk-recrow .r img{width:108px;aspect-ratio:2/3;object-fit:cover;border-radius:10px;display:block;margin-bottom:6px}
.mvk-seasons{display:flex;flex-direction:column;gap:6px}
.mvk-seasons .s{display:flex;justify-content:space-between;gap:10px;font-size:13px;border:1px solid var(--line,#eee);border-radius:10px;padding:9px 12px}
`;

export function TitleCard({ m, i, badge, sub, onOpen }: { m: TitleRef | (LiveMovie & { type?: 'movie' | 'tv' }); i: number; badge?: string; sub?: string; onOpen: (sel: TitleSel) => void }) {
  return (
    <button type="button" className="mvk-card" onClick={() => onOpen({ type: m.type ?? 'movie', id: m.id })}>
      <div className={`mvk-poster ${TINTS[i % 4]}`}>
        {m.posterUrl && <img src={m.posterUrl} alt={m.title} loading="lazy" />}
        <span className="scrim" />
        {badge && <span className="badge">{badge}</span>}
        <h5>{m.title}</h5>
      </div>
      <div className="mvk-mb">
        {m.rating != null ? <span className="star">★ {m.rating.toFixed(1)}</span> : <span className="muted" style={{ fontSize: 12 }}>{prettyDate(m.releaseDate)}</span>}
        {sub && <span className="muted" style={{ fontSize: 11.5, marginLeft: 8 }}>{sub}</span>}
        <div className="mvk-pills">
          <span>{m.language}</span>
          {m.genres.slice(0, 2).map((g) => <span key={g}>{g}</span>)}
        </div>
      </div>
    </button>
  );
}

/** Person sheet — bio + best-known titles (opens on top of the title sheet). */
function PersonSheet({ id, onClose, onOpenTitle }: { id: number; onClose: () => void; onOpenTitle: (sel: TitleSel) => void }) {
  const q = usePerson(id);
  const p = q.data;
  return (
    <div className="mvk-modal" style={{ zIndex: 9100 }} onClick={onClose}>
      <div className="mvk-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ padding: '22px 24px 24px' }}>
          {q.isLoading && <p className="muted" style={{ fontSize: 13 }}>Loading profile…</p>}
          {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load this profile.</p>}
          {p && (
            <>
              <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {p.photoUrl && <img src={p.photoUrl} alt={p.name} style={{ width: 110, borderRadius: 14 }} />}
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <h2 style={{ margin: 0, fontSize: 22 }}>{p.name}</h2>
                    <button type="button" onClick={onClose} style={{ border: 'none', background: 'var(--paper)', borderRadius: 999, width: 30, height: 30, cursor: 'pointer' }}>✕</button>
                  </div>
                  <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
                    {[p.department, p.birthday ? `b. ${prettyDate(p.birthday)}` : null, p.placeOfBirth].filter(Boolean).join(' · ')}
                  </p>
                  {p.biography && <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>{p.biography}{p.biography.length >= 700 ? '…' : ''}</p>}
                </div>
              </div>
              {p.knownFor.length > 0 && (
                <>
                  <h4 style={{ margin: '18px 0 10px' }}>Known for</h4>
                  <div className="mvk-recrow">
                    {p.knownFor.map((k) => (
                      <button type="button" className="r" key={`${k.type}${k.id}`} onClick={() => { onOpenTitle({ type: k.type, id: k.id }); onClose(); }}>
                        {k.posterUrl && <img src={k.posterUrl} alt={k.title} loading="lazy" />}
                        <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{k.title}</div>
                        <div className="muted" style={{ fontSize: 10.5 }}>{k.type === 'tv' ? 'Series' : 'Film'}{k.rating != null ? ` · ★ ${k.rating.toFixed(1)}` : ''}</div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="muted" style={{ fontSize: 10.5, marginTop: 14 }}>{p.attribution}</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Full title sheet — movie or series. Trailer, cast, seasons, providers, recommendations. */
export function TitleSheet({ sel, onClose, onOpen }: { sel: TitleSel; onClose: () => void; onOpen: (sel: TitleSel) => void }) {
  const q = useLiveTitle(sel);
  const [playing, setPlaying] = useState(false);
  const [personId, setPersonId] = useState<number | null>(null);
  useEffect(() => { setPlaying(false); }, [sel.id, sel.type]);
  const m = q.data;
  return (
    <>
      <div className="mvk-modal" onClick={onClose}>
        <div className="mvk-sheet" onClick={(e) => e.stopPropagation()}>
          <div className="mvk-hero">
            {playing && m?.trailerKey
              ? <iframe src={`https://www.youtube-nocookie.com/embed/${m.trailerKey}?autoplay=1`} title="Trailer" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
              : (
                <>
                  {m?.backdropUrl ? <img src={m.backdropUrl} alt="" /> : null}
                  {m?.trailerKey && <button type="button" className="play" onClick={() => setPlaying(true)} title="Watch trailer">▶</button>}
                </>
              )}
            <button type="button" className="x" onClick={onClose}>✕</button>
          </div>
          <div style={{ padding: '20px 24px 24px' }}>
            {q.isLoading && <p className="muted" style={{ fontSize: 13 }}>Loading details…</p>}
            {q.isError && <p className="muted" style={{ fontSize: 13 }}>Couldn't load this title right now.</p>}
            {m && (
              <>
                <h2 style={{ margin: '0 0 2px', fontSize: 24 }}>{m.title}</h2>
                {m.tagline && <p className="muted" style={{ fontSize: 13, fontStyle: 'italic', margin: '0 0 10px' }}>{m.tagline}</p>}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0 14px', alignItems: 'center' }}>
                  {m.rating != null && <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--gold-bright,#c8a24a)' }}>★ {m.rating.toFixed(1)}<span className="muted" style={{ fontWeight: 400 }}> ({m.votes.toLocaleString('en-IN')})</span></span>}
                  {m.certification && <span style={{ fontSize: 11, fontWeight: 700, border: '1.5px solid var(--line)', borderRadius: 6, padding: '2px 7px' }}>{m.certification}</span>}
                  {m.runtime ? <span className="muted" style={{ fontSize: 12.5 }}>{m.type === 'tv' ? `~${m.runtime}m/ep` : `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`}</span> : null}
                  {m.releaseDate && <span className="muted" style={{ fontSize: 12.5 }}>{prettyDate(m.releaseDate)}</span>}
                  <span className="muted" style={{ fontSize: 12.5 }}>{m.language}</span>
                  {m.type === 'tv' && m.seasons.length > 0 && <span className="muted" style={{ fontSize: 12.5 }}>{m.seasons.length} season{m.seasons.length > 1 ? 's' : ''}</span>}
                </div>
                <div className="mvk-pills" style={{ marginBottom: 14 }}>{m.genres.map((g) => <span key={g}>{g}</span>)}</div>
                <p style={{ fontSize: 14, lineHeight: 1.65, margin: '0 0 16px' }}>{m.overview}</p>
                {(m.directors.length > 0 || m.creators.length > 0) && (
                  <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
                    {m.type === 'tv' ? 'Created by' : 'Directed by'} <strong style={{ color: 'var(--ink)' }}>{(m.type === 'tv' ? m.creators : m.directors).join(', ')}</strong>
                  </p>
                )}
                {m.nextEpisode && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13 }}>
                    📅 Next episode — <strong>S{m.nextEpisode.season}E{m.nextEpisode.episode} · {m.nextEpisode.name}</strong> on {prettyDate(m.nextEpisode.airDate)}
                  </div>
                )}
                {m.cast.length > 0 && (
                  <>
                    <h4 style={{ margin: '0 0 10px' }}>Cast <span className="muted" style={{ fontSize: 11, fontWeight: 400 }}>· tap for bio & filmography</span></h4>
                    <div className="mvk-castrow" style={{ marginBottom: 16 }}>
                      {m.cast.map((c) => (
                        <button type="button" className="c" key={c.id} onClick={() => setPersonId(c.id)}>
                          {c.photoUrl ? <img src={c.photoUrl} alt={c.name} loading="lazy" /> : <span className="ph" />}
                          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{c.name}</div>
                          <div className="muted" style={{ fontSize: 10.5 }}>{c.character}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {m.type === 'tv' && m.seasons.length > 0 && (
                  <>
                    <h4 style={{ margin: '0 0 10px' }}>Seasons</h4>
                    <div className="mvk-seasons" style={{ marginBottom: 16 }}>
                      {m.seasons.map((s) => (
                        <div className="s" key={s.number}>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span className="muted">{s.episodes} episodes{s.airDate ? ` · ${prettyDate(s.airDate)}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {(m.watch.stream.length > 0 || m.watch.rent.length > 0 || m.watch.buy.length > 0) && (
                  <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
                    <h4 style={{ margin: '0 0 8px' }}>Where to watch 🇮🇳</h4>
                    {m.watch.stream.length > 0 && <p style={{ fontSize: 13, margin: '0 0 4px' }}><strong>Stream:</strong> {m.watch.stream.join(' · ')}</p>}
                    {m.watch.rent.length > 0 && <p style={{ fontSize: 13, margin: '0 0 4px' }}><strong>Rent:</strong> {m.watch.rent.join(' · ')}</p>}
                    {m.watch.buy.length > 0 && <p style={{ fontSize: 13, margin: 0 }}><strong>Buy:</strong> {m.watch.buy.join(' · ')}</p>}
                  </div>
                )}
                {m.recommendations.length > 0 && (
                  <>
                    <h4 style={{ margin: '0 0 10px' }}>More like this</h4>
                    <div className="mvk-recrow" style={{ marginBottom: 16 }}>
                      {m.recommendations.map((r) => (
                        <button type="button" className="r" key={`${r.type}${r.id}`} onClick={() => onOpen({ type: r.type, id: r.id })}>
                          {r.posterUrl && <img src={r.posterUrl} alt={r.title} loading="lazy" />}
                          <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{r.title}</div>
                          <div className="muted" style={{ fontSize: 10.5 }}>{r.rating != null ? `★ ${r.rating.toFixed(1)}` : prettyDate(r.releaseDate)}</div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {m.type === 'movie' && <Link className="btn btn-gold btn-sm" to="/entertainment/showtime">🎟 Book tickets</Link>}
                  <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Close</button>
                </div>
                <p className="muted" style={{ fontSize: 10.5, marginTop: 14 }}>{m.attribution} · This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
              </>
            )}
          </div>
        </div>
      </div>
      {personId != null && <PersonSheet id={personId} onClose={() => setPersonId(null)} onOpenTitle={onOpen} />}
    </>
  );
}
