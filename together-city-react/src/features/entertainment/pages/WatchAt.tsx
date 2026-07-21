import { useState } from 'react';
import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useTitleSearch, useLiveOtt } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, type TitleSel } from './movieKit';

const CSS = KIT_CSS + `
.ent-watchat .searchbar{display:flex;gap:10px;margin:4px 0 18px}
.ent-watchat .searchbar input{flex:1;border:1.5px solid var(--line,#eee);border-radius:999px;padding:14px 22px;font-size:15px;font-family:inherit;background:var(--card,#fff);color:var(--ink);outline:none}
.ent-watchat .searchbar input:focus{border-color:var(--accent)}
.ent-watchat .how{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:30px}
.ent-watchat .how .step{border:1px solid var(--line,#eee);border-radius:14px;padding:14px 16px;background:var(--card,#fff)}
.ent-watchat .how .step b{display:block;font-size:13.5px;margin-bottom:3px}
.ent-watchat .how .step span{font-size:12px;color:var(--muted);line-height:1.5}
`;

/**
 * Watch at Together City — one search across every major streaming platform.
 * Type a title, open it, and jump straight into the app that carries it
 * (subscription, free, rent or buy) via Watchmode deep links.
 */
export function WatchAt() {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<TitleSel | null>(null);
  const search = useTitleSearch(q);
  const trending = useLiveOtt();
  const searching = q.trim().length >= 2;
  const trendingAll = trending.data?.live ? [...trending.data.streaming, ...trending.data.popular] : [];

  return (
    <EntPage className="ent-watchat">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 05" title="Watch at Together City"
        sub="Search every major streaming platform from one place — no more opening each OTT app to find where something plays." />

      <div className="searchbar rise d1">
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
          placeholder="🔍 Type any movie or show — we'll find every platform carrying it…" />
        {q && <button type="button" className="btn btn-line btn-sm" onClick={() => setQ('')}>Clear</button>}
      </div>

      {!searching && (
        <div className="how rise d1">
          <div className="step"><b>1 · Search once</b><span>One search covers Netflix, Prime Video, Hotstar, SonyLIV, ZEE5, Apple TV+ and every other major service in India.</span></div>
          <div className="step"><b>2 · See every option</b><span>Open any title to see everywhere it plays — subscription, free, rent or buy, with prices and quality.</span></div>
          <div className="step"><b>3 · Jump straight in</b><span>Tap a platform and land directly on that title in the right app. No hunting.</span></div>
        </div>
      )}

      {searching && (
        <>
          <div className="blk-head rise"><h2>🔍 Results for “{q.trim()}”</h2><span className="muted" style={{ fontSize: 12 }}>Tap a title to see every platform carrying it</span></div>
          {search.isLoading ? <Spinner label="Searching every platform…" /> : (
            (search.data?.results ?? []).length === 0
              ? <EmptyState icon="🎞" title="No titles found" hint="Try a different name." />
              : <div className="grid4 rise">{search.data!.results.map((m, i) => <TitleCard key={`${m.type}${m.id}`} m={m} i={i} badge={m.type === 'tv' ? 'Series' : 'Film'} onOpen={setSel} />)}</div>
          )}
        </>
      )}

      {!searching && (
        <>
          <div className="blk-head rise d2"><h2>🔥 Trending across platforms</h2><span className="muted" style={{ fontSize: 12 }}>This week · tap any title to see where it plays</span></div>
          {trending.isLoading && <Spinner label="Loading trending titles…" />}
          {!trending.isLoading && trendingAll.length === 0 && (
            <EmptyState icon="📡" title="Trending is unavailable right now" hint="Use the search above — it works independently." />
          )}
          <div className="grid4 rise d2">
            {trendingAll.slice(0, 12).map((m, i) => <TitleCard key={`${m.type}${m.id}`} m={m} i={i} badge={m.platform ?? undefined} onOpen={setSel} />)}
          </div>
        </>
      )}

      <p className="muted rise" style={{ fontSize: 11, marginTop: 18 }}>Titles & images: TMDB · streaming links: Watchmode. Availability and prices are set by each platform.</p>

      <TrustBar items={['Every platform, one search', 'Direct deep links', 'Prices before you click', 'India availability']} />
      {sel && <TitleSheet sel={sel} onClose={() => setSel(null)} onOpen={setSel} />}
    </EntPage>
  );
}
