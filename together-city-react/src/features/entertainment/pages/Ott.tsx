import { useState } from 'react';
import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useLiveOtt, useTitleSearch, useDiscover, type OttTitle } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, type TitleSel } from './movieKit';

const CSS = KIT_CSS + `
.ent-ott .showrow{display:flex;align-items:center;gap:16px;background:var(--card,#fff);border:1px solid var(--line,#eee);border-radius:14px;padding:14px 18px;margin-bottom:10px;box-shadow:var(--shadow);transition:transform .2s,box-shadow .2s;cursor:pointer;width:100%;text-align:left;font-family:inherit}
.ent-ott .showrow:hover{transform:translateY(-2px);box-shadow:var(--shadow-deep)}
.ent-ott .showrow .tile{width:52px;height:52px;border-radius:10px;flex-shrink:0;background:linear-gradient(150deg,#241a3d,#5b4b8a);display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--serif,Georgia);font-size:16px;overflow:hidden}
.ent-ott .showrow .tile img{width:100%;height:100%;object-fit:cover}
.ent-ott .showrow .grow{flex:1;min-width:0}
.ent-ott .showrow .plat{font-size:11px;color:var(--muted)}
.ent-ott .split{display:grid;grid-template-columns:2fr 1fr;gap:28px}
@media(max-width:860px){.ent-ott .split{grid-template-columns:1fr}}
.ent-ott .searchbar{display:flex;gap:10px;margin:4px 0 18px}
.ent-ott .searchbar input{flex:1;border:1.5px solid var(--line,#eee);border-radius:999px;padding:12px 20px;font-size:14px;font-family:inherit;background:var(--card,#fff);color:var(--ink);outline:none}
.ent-ott .searchbar input:focus{border-color:var(--accent)}
`;

/** Series genres (TMDB TV genre names — the backend resolves them to ids). */
const TV_GENRES = ['Drama', 'Comedy', 'Crime', 'Mystery', 'Action & Adventure', 'Sci-Fi & Fantasy', 'Animation', 'Documentary', 'Reality', 'Romance'];

/** Mood → genre mapping so the mood pills genuinely filter the live lists. */
const MOODS: Record<string, string[]> = {
  'Feel Good': ['Comedy', 'Family', 'Romance', 'Music', 'Animation'],
  'Edge of Seat': ['Thriller', 'Crime', 'Mystery', 'Horror', 'Action & Adventure', 'Action'],
  'Weekend Binge': ['Drama', 'Sci-Fi', 'Sci-Fi & Fantasy', 'Fantasy', 'War & Politics'],
  'Something Light': ['Comedy', 'Reality', 'Talk', 'Documentary', 'Kids'],
};

function Row({ t, primary, onOpen }: { t: OttTitle; primary?: boolean; onOpen: (sel: TitleSel) => void }) {
  const sub = [t.platform ?? 'In theatres / on demand', t.genres[0], t.rating != null ? `★ ${t.rating.toFixed(1)}` : null].filter(Boolean).join(' · ');
  return (
    <button type="button" className="showrow" onClick={() => onOpen({ type: t.type, id: t.id })}>
      <div className="tile">{t.posterUrl ? <img src={t.posterUrl} alt={t.title} loading="lazy" /> : t.title[0]}</div>
      <div className="grow"><div style={{ fontWeight: 600 }}>{t.title}</div><div className="plat">{sub}</div></div>
      <span className={`btn btn-sm ${primary ? 'btn-gold' : 'btn-line'}`}>Details</span>
    </button>
  );
}

/** OTT Watch — this week's trending series & films with real platform availability. */
export function Ott() {
  const live = useLiveOtt();
  const [sel, setSel] = useState<TitleSel | null>(null);
  const [mood, setMood] = useState('');
  const [platform, setPlatform] = useState('');
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState('');
  const search = useTitleSearch(q);
  const searching = q.trim().length >= 2;
  const genreShows = useDiscover(genre || undefined, undefined, undefined, 'tv', !!genre && !searching);
  const isLive = live.data?.live === true;
  const d = live.data;

  const all = isLive ? [...d!.streaming, ...d!.popular] : [];
  const platforms = [...new Set(all.map((t) => t.platform).filter(Boolean))] as string[];
  const match = (t: OttTitle) =>
    (!platform || t.platform === platform) &&
    (!mood || t.genres.some((g) => MOODS[mood]?.includes(g)));
  const streaming = isLive ? d!.streaming.filter(match) : [];
  const popular = isLive ? d!.popular.filter(match) : [];
  const topPick = streaming.find((t) => t.platform) ?? streaming[0] ?? popular[0];

  const pill = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );

  return (
    <EntPage className="ent-ott">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 02" title="OTT Watch" sub="Lock tonight's show in one place — search everything, browse by genre, see where it streams." />

      <div className="searchbar rise d1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search any show or movie across all platforms…" />
        {q && <button type="button" className="btn btn-line btn-sm" onClick={() => setQ('')}>Clear</button>}
      </div>

      {searching && (
        <>
          <div className="blk-head rise"><h2>🔍 Results for “{q.trim()}”</h2></div>
          {search.isLoading ? <Spinner label="Searching…" /> : (
            (search.data?.results ?? []).length === 0
              ? <EmptyState icon="🎞" title="No titles found" hint="Try a different name." />
              : <div className="grid4 rise" style={{ marginBottom: 30 }}>{search.data!.results.map((m, i) => <TitleCard key={`${m.type}${m.id}`} m={m} i={i} badge={m.type === 'tv' ? 'Series' : 'Film'} onOpen={setSel} />)}</div>
          )}
        </>
      )}

      {!searching && (
        <>
          <div className="blk-head rise d1"><h2>Browse series by genre</h2></div>
          <div className="rise d1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <button type="button" onClick={() => setGenre('')}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                border: `1.5px solid ${!genre ? 'var(--accent)' : 'var(--line)'}`, background: !genre ? 'var(--accent)' : 'transparent', color: !genre ? '#fff' : 'var(--ink-soft)' }}>
              Trending
            </button>
            {TV_GENRES.map((g) => (
              <button key={g} type="button" onClick={() => setGenre(genre === g ? '' : g)}
                style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
                  border: `1.5px solid ${genre === g ? 'var(--accent)' : 'var(--line)'}`, background: genre === g ? 'var(--accent)' : 'transparent', color: genre === g ? '#fff' : 'var(--ink-soft)' }}>
                {g}
              </button>
            ))}
          </div>
        </>
      )}

      {!searching && genre && (
        <>
          <div className="blk-head rise"><h2>📺 {genre} series</h2><span className="muted" style={{ fontSize: 12 }}>Most popular right now · tap for seasons & where to watch</span></div>
          {genreShows.isLoading ? <Spinner label={`Finding ${genre.toLowerCase()} series…`} /> : (
            (genreShows.data?.results ?? []).length === 0
              ? <EmptyState icon="📺" title="Nothing found in that genre" hint="Try another genre." />
              : <div className="grid4 rise" style={{ marginBottom: 30 }}>{genreShows.data!.results.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}</div>
          )}
        </>
      )}

      {!searching && !genre && live.isLoading && <Spinner label="Loading what's trending…" />}
      {!searching && !genre && !live.isLoading && !isLive && (
        <EmptyState icon="📺" title="Live streaming data is unavailable" hint="The streaming service isn't reachable right now — please check back shortly." />
      )}

      {!searching && !genre && isLive && (
        <>
          <div className="blk-head rise d1"><h2>Curated by mood</h2></div>
          <div className="rise d1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {pill(!mood, 'All Moods', () => setMood(''))}
            {Object.keys(MOODS).map((mo) => pill(mood === mo, mo, () => setMood(mood === mo ? '' : mo)))}
          </div>
          {platforms.length > 0 && (
            <>
              <div className="blk-head rise d1"><h2>Filter by platform</h2></div>
              <div className="rise d1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 36 }}>
                {pill(!platform, 'All Platforms', () => setPlatform(''))}
                {platforms.map((p) => pill(platform === p, p, () => setPlatform(platform === p ? '' : p)))}
              </div>
            </>
          )}

          <div className="split rise d2">
            <div>
              <div className="blk-head"><h2>Trending Series</h2><span className="muted" style={{ fontSize: 12 }}>This week · live</span></div>
              <div className="rows" style={{ marginBottom: 32 }}>
                {streaming.length === 0
                  ? <p className="muted" style={{ fontSize: 13 }}>Nothing matches those filters this week.</p>
                  : streaming.map((t) => <Row key={`tv${t.id}`} t={t} primary onOpen={setSel} />)}
              </div>
              <div className="blk-head"><h2>Trending Movies on OTT</h2></div>
              <div className="rows">
                {popular.length === 0
                  ? <p className="muted" style={{ fontSize: 13 }}>Nothing matches those filters this week.</p>
                  : popular.map((t) => <Row key={`mv${t.id}`} t={t} onOpen={setSel} />)}
              </div>
              <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>Data & images: TMDB · streaming availability via JustWatch. Not endorsed or certified by TMDB.</p>
            </div>
            <div>
              {topPick && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h4>Today's Top Pick</h4>
                  {topPick.posterUrl && <img src={topPick.posterUrl} alt={topPick.title} style={{ width: '100%', borderRadius: 12, margin: '10px 0' }} loading="lazy" />}
                  <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 10px' }}>{topPick.title}{topPick.platform ? ` — ${topPick.platform}` : ''}{topPick.rating != null ? ` · ★ ${topPick.rating.toFixed(1)}` : ''}</p>
                  <button type="button" className="btn btn-gold btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setSel({ type: topPick.type, id: topPick.id })}>View details</button>
                </div>
              )}
              <div className="card">
                <h4>How this works</h4>
                <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>Trending is refreshed from live viewing data every few hours. The platform tag shows where each title streams in India right now.</p>
              </div>
            </div>
          </div>
        </>
      )}

      <TrustBar items={['All platforms, one place', 'Live trending data', 'Series & film details', 'Trailers included']} />
      {sel && <TitleSheet sel={sel} onClose={() => setSel(null)} onOpen={setSel} />}
    </EntPage>
  );
}
