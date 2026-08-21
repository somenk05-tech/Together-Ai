import { useMemo, useState } from 'react';
import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useWatchlist, useRecommended, type WatchItem } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, type TitleSel } from './movieKit';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */
const NONE: never[] = [];

const CSS = KIT_CSS + `
.ent-watch .filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.ent-watch .sorts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:26px}
.ent-watch .sorts .lbl{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:700;margin-right:2px}
`;

type Filter = 'all' | 'movies' | 'tv' | 'streaming' | 'theatres';
type Sort = 'recent' | 'alpha' | 'rating' | 'release';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'movies', label: 'Movies' },
  { key: 'tv', label: 'TV Shows' },
  { key: 'streaming', label: 'Streaming' },
  { key: 'theatres', label: 'In Theatres' },
];
const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: 'Recently Saved' },
  { key: 'alpha', label: 'Alphabetical' },
  { key: 'rating', label: 'Rating' },
  { key: 'release', label: 'Release Date' },
];

/** A movie released in the last ~90 days counts as "in theatres". */
const inTheatres = (i: WatchItem) => {
  if (i.type !== 'movie' || !i.releaseDate) return false;
  const ageDays = (Date.now() - new Date(i.releaseDate).getTime()) / 86400_000;
  return ageDays >= -30 && ageDays <= 90;
};

/** Watchlist — everything saved to watch later, plus picks learned from it. */
export function Watchlist() {
  const wl = useWatchlist();
  const [sel, setSel] = useState<TitleSel | null>(null);
  const [autoplay, setAutoplay] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const items = wl.data?.items ?? NONE;
  const rec = useRecommended(items.length > 0);

  const shown = useMemo(() => {
    let xs = [...items];
    if (filter === 'movies') xs = xs.filter((i) => i.type === 'movie');
    if (filter === 'tv') xs = xs.filter((i) => i.type === 'tv');
    if (filter === 'streaming') xs = xs.filter((i) => i.platform);
    if (filter === 'theatres') xs = xs.filter(inTheatres);
    if (sort === 'alpha') xs.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'rating') xs.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sort === 'release') xs.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''));
    return xs; // 'recent' keeps the saved order (newest first from the server)
  }, [items, filter, sort]);

  const movies = shown.filter((i) => i.type === 'movie');
  const shows = shown.filter((i) => i.type === 'tv');

  const open = (s: TitleSel, play = false) => { setAutoplay(play); setSel(s); };

  const pill = (on: boolean, label: string, onClick: () => void) => (
    <button key={label} type="button" onClick={onClick}
      style={{ cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 14px', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit',
        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
      {label}
    </button>
  );

  const grid = (xs: WatchItem[]) => (
    <div className="grid4 rise" style={{ marginBottom: 12 }}>
      {xs.map((m, i) => (
        <div key={`${m.type}${m.id}`}>
          <TitleCard m={m as never} i={i} badge={m.platform ?? undefined} onOpen={(s) => open(s)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-line btn-sm" onClick={() => open({ type: m.type, id: m.id }, true)}>▶ Trailer</button>
            {m.platform && <button type="button" className="btn btn-gold btn-sm" onClick={() => open({ type: m.type, id: m.id })}>Stream on {m.platform}</button>}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <EntPage className="ent-watch">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 04" title="Watchlist" sub="Everything you've saved to watch later." />

      {wl.isLoading && <Spinner label="Loading your Watchlist…" />}
      {!wl.isLoading && wl.isError && (
        <EmptyState
          icon="⚠️"
          title="We couldn’t load your Watchlist"
          hint="Everything you’ve bookmarked is still saved — try again in a moment."
        />
      )}
      {!wl.isLoading && !wl.isError && items.length === 0 && (
        <EmptyState icon="🔖" title="Nothing saved yet" hint="Tap the bookmark on any movie or show — in Movies Now, OTT Watch, Curated or search — and it lands here instantly." />
      )}

      {items.length > 0 && (
        <>
          <div className="filters rise d1">
            {FILTERS.map((f) => pill(filter === f.key, f.label, () => setFilter(f.key)))}
          </div>
          <div className="sorts rise d1">
            <span className="lbl">Sort</span>
            {SORTS.map((so) => pill(sort === so.key, so.label, () => setSort(so.key)))}
          </div>

          {shown.length === 0 && <EmptyState icon="🎞" title="Nothing matches that filter" hint="Try another filter." />}

          {filter === 'all' ? (
            <>
              {movies.length > 0 && (
                <>
                  <div className="blk-head rise"><h2>🎬 Movies</h2><span className="muted" style={{ fontSize: 12 }}>{movies.length} saved</span></div>
                  {grid(movies)}
                </>
              )}
              {shows.length > 0 && (
                <>
                  <div className="blk-head rise" style={{ marginTop: 26 }}><h2>📺 TV Shows</h2><span className="muted" style={{ fontSize: 12 }}>{shows.length} saved</span></div>
                  {grid(shows)}
                </>
              )}
            </>
          ) : shown.length > 0 && grid(shown)}

          {rec.data?.live && rec.data.results.length > 0 && (
            <>
              <div className="blk-head rise" style={{ marginTop: 34 }}>
                <h2>✨ Recommended for you</h2>
                {rec.data.basis && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Learned from your Watchlist{rec.data.basis.genres.length ? ` · ${rec.data.basis.genres.join(', ')}` : ''}
                  </span>
                )}
              </div>
              <div className="grid4 rise">
                {rec.data.results.map((m, i) => <TitleCard key={`${m.type}${m.id}`} m={m} i={i} badge={m.type === 'tv' ? 'Series' : undefined} onOpen={(s) => open(s)} />)}
              </div>
            </>
          )}

          <p className="muted rise" style={{ fontSize: 11, marginTop: 18 }}>Saved to your Together City account — synced on every device. Data & images: TMDB.</p>
        </>
      )}

      <TrustBar items={['One tap to save', 'Synced across devices', 'Personalised picks', 'Trailers & where to watch']} />
      {sel && <TitleSheet sel={sel} autoplay={autoplay} onClose={() => setSel(null)} onOpen={(s) => { setAutoplay(false); setSel(s); }} />}
    </EntPage>
  );
}
