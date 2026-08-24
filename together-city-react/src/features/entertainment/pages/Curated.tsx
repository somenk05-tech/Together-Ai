import { useState } from 'react';
import { EntPage, PosterLead, TrustBar } from './parts';
import { Spinner, EmptyState } from '@/components/ui';
import { useCuratedMovies } from '../api';
import { KIT_CSS, TitleCard, TitleSheet, type TitleSel } from './movieKit';

const CSS = KIT_CSS + `
.ent-curated .split{display:grid;grid-template-columns:2fr 1fr;gap:28px}
@media(max-width:860px){.ent-curated .split{grid-template-columns:1fr}}
`;

/** Curated Movies — critics' picks, hidden gems and Indian indie cinema (live TMDB). */
export function Curated() {
  const curated = useCuratedMovies();
  const [sel, setSel] = useState<TitleSel | null>(null);
  const isLive = curated.data?.live === true;
  const d = curated.data;

  return (
    <EntPage className="ent-curated">
      <style>{CSS}</style>
      <PosterLead eyebrow="Entertainment · 03" title="Curated Movies" sub="Critics' picks, hidden gems and Indian indie cinema — chosen by ratings, not ads." />

      {curated.isLoading && <Spinner label="Curating the shelf…" />}
      {!curated.isLoading && (curated.isError || !isLive) && (
        <EmptyState icon="🎞" title="Curated picks are unavailable"
          hint={curated.isError
            ? 'We couldn’t reach the shelf just now — that’s on our side, and nothing about your watchlist has changed. Check back shortly.'
            : "The movie service isn't reachable right now — please check back shortly."} />
      )}

      {isLive && (
        <div className="split rise d1">
          <div>
            <div className="blk-head"><h2>🏆 Critics' Picks</h2><span className="muted" style={{ fontSize: 12 }}>The highest-rated films of all time</span></div>
            <div className="grid4" style={{ marginBottom: 36 }}>
              {d!.topRated.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}
            </div>

            <div className="blk-head"><h2>💎 Hidden Gems</h2><span className="muted" style={{ fontSize: 12 }}>Brilliant films most people missed</span></div>
            <div className="grid4" style={{ marginBottom: 36 }}>
              {d!.hiddenGems.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}
            </div>

            <div className="blk-head"><h2>🇮🇳 India's Indie Spotlight</h2><span className="muted" style={{ fontSize: 12 }}>Top-rated Indian-language cinema</span></div>
            <div className="grid4">
              {d!.indianIndie.map((m, i) => <TitleCard key={m.id} m={m} i={i} onOpen={setSel} />)}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 18 }}>Movie data & images: TMDB · This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
          </div>

        </div>
      )}

      <TrustBar items={['Rated by real audiences', 'Hidden gems surfaced', 'Indian cinema first-class', 'Trailers & where to watch']} />
      {sel && <TitleSheet sel={sel} onClose={() => setSel(null)} onOpen={setSel} />}
    </EntPage>
  );
}
