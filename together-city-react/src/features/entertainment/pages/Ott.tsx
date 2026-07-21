import { useState } from 'react';
import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useEffect } from 'react';
import { useLiveOtt, useTitleSearch, useBrowse, type OttTitle } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, Pager, type TitleSel } from './movieKit';

const CSS = KIT_CSS + `
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
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [genre]);
  const browse = useBrowse('tv', page, genre || undefined, undefined, !searching);
  const isLive = live.data?.live === true;
  const d = live.data;

  const all = isLive ? [...d!.streaming, ...d!.popular] : [];
  const platforms = [...new Set(all.map((t) => t.platform).filter(Boolean))] as string[];
  const match = (t: OttTitle) =>
    (!platform || t.platform === platform) &&
    (!mood || t.genres.some((g) => MOODS[mood]?.includes(g)));
  const streaming = isLive ? d!.streaming.filter(match) : [];
  const popular = isLive ? d!.popular.filter(match) : [];

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

          <div className="blk-head rise d2"><h2>📺 Trending Series</h2><span className="muted" style={{ fontSize: 12 }}>This week · live · tap for seasons & where to watch</span></div>
          {streaming.length === 0
            ? <p className="muted rise d2" style={{ fontSize: 13, marginBottom: 44 }}>Nothing matches those filters this week.</p>
            : (
              <div className="grid4 rise d2" style={{ marginBottom: 44 }}>
                {streaming.map((t, i) => <TitleCard key={`tv${t.id}`} m={t} i={i} badge={t.platform ?? undefined} onOpen={setSel} />)}
              </div>
            )}

          <div className="blk-head rise d3"><h2>🎬 Trending Movies on OTT</h2></div>
          {popular.length === 0
            ? <p className="muted rise d3" style={{ fontSize: 13 }}>Nothing matches those filters this week.</p>
            : (
              <div className="grid4 rise d3">
                {popular.map((t, i) => <TitleCard key={`mv${t.id}`} m={t} i={i} badge={t.platform ?? undefined} onOpen={setSel} />)}
              </div>
            )}
        </>
      )}

      {!searching && browse.data?.live && (
        <>
          <div className="blk-head rise" style={{ marginTop: genre ? 0 : 30 }}>
            <h2>📺 {genre ? `All ${genre} series` : 'Browse All Series'}</h2>
            <span className="muted" style={{ fontSize: 12 }}>
              {browse.data.totalResults.toLocaleString('en-IN')} titles · 100 per page{browse.isFetching ? ' · loading…' : ''}
            </span>
          </div>
          <div className="grid4 rise" style={{ opacity: browse.isFetching ? 0.55 : 1, transition: 'opacity .2s' }}>
            {browse.data.results.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}
          </div>
          <Pager page={browse.data.page} totalPages={browse.data.totalPages} onPage={setPage} />
        </>
      )}
      {!searching && browse.isLoading && <Spinner label="Loading the catalogue…" />}

      <p className="muted rise" style={{ fontSize: 11, marginTop: 18 }}>Data & images: TMDB · streaming availability via JustWatch. Not endorsed or certified by TMDB.</p>

      <TrustBar items={['All platforms, one place', 'Live trending data', 'Series & film details', 'Trailers included']} />
      {sel && <TitleSheet sel={sel} onClose={() => setSel(null)} onOpen={setSel} />}
    </EntPage>
  );
}
