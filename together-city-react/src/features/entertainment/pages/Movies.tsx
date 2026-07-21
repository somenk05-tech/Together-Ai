import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useEffect, useState } from 'react';
import { useLiveMovies, useTitleSearch, useBrowse } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, Pager, prettyDate, type TitleSel } from './movieKit';

const LANG_FILTERS = ['Hindi', 'English', 'Tamil', 'Telugu', 'Malayalam', 'Korean'];
const GENRE_FILTERS = ['Action', 'Drama', 'Comedy', 'Thriller', 'Romance', 'Sci-Fi', 'Horror', 'Animation'];

const CSS = KIT_CSS + `
.ent-movies .searchbar{display:flex;gap:10px;margin:4px 0 18px}
.ent-movies .searchbar input{flex:1;border:1.5px solid var(--line,#eee);border-radius:999px;padding:12px 20px;font-size:14px;font-family:inherit;background:var(--card,#fff);color:var(--ink);outline:none}
.ent-movies .searchbar input:focus{border-color:var(--accent)}
`;

/** Movies Now — live TMDB listings for India: search, filters, details, trailers. */
export function Movies() {
  const live = useLiveMovies();
  const [sel, setSel] = useState<TitleSel | null>(null);
  const [q, setQ] = useState('');
  const [lang, setLang] = useState('');
  const [genre, setGenre] = useState('');
  const search = useTitleSearch(q);
  const filtering = !!(lang || genre);
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [lang, genre]);
  const browse = useBrowse('movie', page, genre || undefined, lang || undefined, !((q.trim().length >= 2)));
  const isLive = live.data?.live === true;
  const d = live.data;
  const searching = q.trim().length >= 2;

  const pill = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );

  return (
    <EntPage className="ent-movies">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 01" title="Movies Now" sub="Decide what to watch in one place — theatres and OTT together, instead of scrolling a hundred different apps." />

      <div className="searchbar rise d1">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search any movie or series…" />
        {q && <button type="button" className="btn btn-line btn-sm" onClick={() => setQ('')}>Clear</button>}
      </div>

      {!searching && (
        <div className="rise d1" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 26 }}>
          {pill(!lang, 'All Languages', () => setLang(''))}
          {LANG_FILTERS.map((l) => pill(lang === l, l, () => setLang(lang === l ? '' : l)))}
          <span style={{ width: 10 }} />
          {pill(!genre, 'All Genres', () => setGenre(''))}
          {GENRE_FILTERS.map((g) => pill(genre === g, g, () => setGenre(genre === g ? '' : g)))}
        </div>
      )}

      {live.isLoading && <Spinner label="Loading live listings…" />}
      {!live.isLoading && !isLive && !searching && (
        <EmptyState icon="🎬" title="Live movie listings are unavailable" hint="The movie service isn't reachable right now — please check back shortly." />
      )}

      {searching && (
        <>
          <div className="blk-head rise"><h2>🔍 Results for “{q.trim()}”</h2></div>
          {search.isLoading ? <Spinner label="Searching…" /> : (
            (search.data?.results ?? []).length === 0
              ? <EmptyState icon="🎞" title="No titles found" hint="Try a different name." />
              : <div className="grid4 rise">{search.data!.results.map((m, i) => <TitleCard key={`${m.type}${m.id}`} m={m} i={i} badge={m.type === 'tv' ? 'Series' : undefined} onOpen={setSel} />)}</div>
          )}
        </>
      )}

      {!searching && !filtering && isLive && (
        <>
          <div className="blk-head rise d2" id="now"><h2>🎬 Now Playing</h2><span className="muted" style={{ fontSize: 12 }}>Live in Indian theatres · tap for trailer & details</span></div>
          <div className="grid4 rise d2" style={{ marginBottom: 44 }}>
            {d!.nowPlaying.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}
          </div>

          {d!.thisWeek.length > 0 && (
            <>
              <div className="blk-head rise d3" id="week"><h2>This Week's Releases</h2></div>
              <div className="grid4 rise d3" style={{ marginBottom: 44 }}>
                {d!.thisWeek.map((m, i) => <TitleCard key={m.id} m={m} i={i} badge="New" onOpen={setSel} />)}
              </div>
            </>
          )}

          <div className="blk-head rise d4" id="coming"><h2>📅 Coming Up</h2></div>
          <div className="grid4 rise d4">
            {d!.comingUp.map((m, i) => <TitleCard key={m.id} m={m} i={i} badge={prettyDate(m.releaseDate)} onOpen={setSel} />)}
          </div>
        </>
      )}

      {!searching && browse.data?.live && (
        <>
          <div className="blk-head rise" style={{ marginTop: filtering ? 0 : 30 }}>
            <h2>🎞 {filtering ? [lang, genre].filter(Boolean).join(' · ') + ' — all matches' : 'Browse All Movies'}</h2>
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

      {isLive && <p className="muted rise" style={{ fontSize: 11, marginTop: 18 }}>Movie data & images: TMDB · This product uses the TMDB API but is not endorsed or certified by TMDB.</p>}

      <TrustBar items={['Live theatre listings', 'Trailers & full details', 'Where to watch in India', 'Updated all day']} />
      {sel && <TitleSheet sel={sel} onClose={() => setSel(null)} onOpen={setSel} />}
    </EntPage>
  );
}
