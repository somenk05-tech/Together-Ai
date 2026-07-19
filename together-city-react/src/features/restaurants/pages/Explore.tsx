import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCuisines, useDiscover, inr, type DiscoverQuery, type DiscoverCard } from '../api';

type LocState = 'idle' | 'asking' | 'granted' | 'denied' | 'unsupported';
type PriceBand = 'all' | 'budget' | 'mid' | 'gourmet';

const PRICE_MAX: Record<PriceBand, number | undefined> = { all: undefined, budget: 800, mid: 2000, gourmet: undefined };

/** Match-score ring — a compact 0–100 personalised score. */
function ScoreRing({ score }: { score: number }) {
  const hue = score >= 85 ? 145 : score >= 70 ? 90 : 45;
  return (
    <div style={{
      width: 54, height: 54, borderRadius: '50%', flex: '0 0 auto',
      background: `conic-gradient(hsl(${hue} 60% 45%) ${score * 3.6}deg, var(--line) 0)`,
      display: 'grid', placeItems: 'center',
    }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--card, #fff)', display: 'grid', placeItems: 'center' }}>
        <b style={{ fontSize: 15, lineHeight: 1 }}>{score}</b>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 58 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

function RestaurantCardView({ r }: { r: DiscoverCard }) {
  return (
    <div className="card rise" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'relative', height: 150, background: 'var(--line)' }}>
        {r.heroUrl
          ? <img src={r.heroUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 40 }}>{r.icon}</div>}
        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', gap: 6 }}>
          {r.tcChecked && <span className="tag" style={{ background: '#111', color: '#fff', fontWeight: 700 }}>✓ TC Checked</span>}
          <span className="tag dark">{r.priceCategory}</span>
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          <span className="tag" style={{ background: r.openNow ? '#12631f' : '#7a1f1f', color: '#fff' }}>{r.openNow ? 'Open now' : 'Closed'}</span>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{r.name}</h3>
            <p className="meta" style={{ margin: '2px 0 0', fontSize: 12.5 }}>
              {r.icon} {r.cuisineLabel} · {r.area || r.city || 'Nearby'}
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12.5 }}>
              <b>★ {r.rating.toFixed(1)}</b>
              {r.ratingsCount ? <span className="muted">({r.ratingsCount.toLocaleString('en-IN')})</span> : null}
              <span className="muted">· ₹{inr(r.priceForTwoInr).slice(1)} for two</span>
            </div>
          </div>
          <ScoreRing score={r.matchScore} />
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', margin: '14px 0', padding: '10px 4px', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <Stat label="Quality" value={`${r.qualityScore}/5`} />
          <Stat label="Hygiene" value={`${r.hygiene}/5`} />
          <Stat label="Distance" value={`${r.distanceKm} km`} />
          <Stat label="ETA" value={`${r.etaMins} min`} />
        </div>

        {r.reasons.length > 0 && (
          <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {r.reasons.slice(0, 3).map((why, i) => (
              <li key={i} style={{ fontSize: 12.5, color: 'var(--muted)' }}>· {why}</li>
            ))}
          </ul>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          {r.source === 'seed'
            ? <Link className="btn btn-gold btn-sm" to={`/restaurants/${r.id}`} style={{ flex: 1, justifyContent: 'center' }}>View menu →</Link>
            : <Link className="btn btn-gold btn-sm" to="/restaurants/discover" style={{ flex: 1, justifyContent: 'center' }}>Similar on TC →</Link>}
          {r.mapsUrl && <a className="btn btn-line btn-sm" href={r.mapsUrl} target="_blank" rel="noreferrer">Directions</a>}
        </div>
      </div>
    </div>
  );
}

/** AI Restaurant Discovery — a single full-width Explore screen (no sidebar).
 *  Gets one GPS fix, then shows the Top-7 restaurants ranked from the diner's
 *  food profile. Manual city entry is the fallback when location is unavailable. */
export function Explore() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [city, setCity] = useState('');
  const [cityDraft, setCityDraft] = useState('');

  const [radiusKm, setRadiusKm] = useState(5);
  const [cuisine, setCuisine] = useState('');
  const [price, setPrice] = useState<PriceBand>('all');
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [pureVeg, setPureVeg] = useState(false);
  const [outdoor, setOutdoor] = useState(false);
  const [family, setFamily] = useState(false);
  const [pet, setPet] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const { data: cuisines } = useCuisines();

  const askLocation = () => {
    if (!('geolocation' in navigator)) { setLocState('unsupported'); return; }
    setLocState('asking');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocState('granted'); },
      () => setLocState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };

  // Ask once on first open.
  useEffect(() => { askLocation(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const query = useMemo<DiscoverQuery>(() => ({
    ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
    ...(city ? { city } : {}),
    radiusKm,
    ...(cuisine ? { cuisine } : {}),
    ...(PRICE_MAX[price] != null ? { maxPriceForTwo: PRICE_MAX[price] } : {}),
    ...(minRating ? { minRating } : {}),
    ...(openNow ? { openNow } : {}),
    ...(pureVeg ? { pureVeg } : {}),
    ...(outdoor ? { outdoor } : {}),
    ...(family ? { family } : {}),
    ...(pet ? { pet } : {}),
  }), [loc, city, radiusKm, cuisine, price, minRating, openNow, pureVeg, outdoor, family, pet]);

  const enabled = !!loc || !!city;
  const { data, isLoading, isFetching, refetch } = useDiscover(query, enabled);

  const list = data?.restaurants ?? [];

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 220 }}>
        <img className="bg" src="/assets/img/resturant--images--explore.webp" alt="Elegant restaurant dining room" />
        <div className="inner">
          <div className="eyebrow">Restaurants · Explore</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>Restaurants near you, ranked for you</h1>
          <p className="sub">The AI picks the Top 7 from your food profile — quality, hygiene, distance and value all weighed in.</p>
          <div className="pill-row" style={{ marginTop: 12 }}>
            <span className="tag dark">✓ TC Checked</span><span className="tag dark">Hygiene verified</span><span className="tag dark">Personalised</span>
          </div>
        </div>
      </div>

      {/* Location bar */}
      <div className="card rise" style={{ marginTop: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13.5 }}>
          {loc ? <>📍 Using your location · within <b>{radiusKm} km</b></>
            : city ? <>📍 Showing <b>{city}</b></>
            : locState === 'asking' ? '📍 Getting your location…'
            : '📍 Location needed to find nearby restaurants'}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-line btn-sm" onClick={askLocation} disabled={locState === 'asking'}>
            {loc ? 'Update location' : 'Use my location'}
          </button>
          <button className="btn btn-line btn-sm" onClick={() => refetch()} disabled={!enabled || isFetching}>
            {isFetching ? 'Refreshing…' : '↻ AI refresh'}
          </button>
        </div>
      </div>

      {/* Manual city fallback */}
      {!loc && locState !== 'asking' && (
        <div className="note rise" style={{ marginTop: 12, fontSize: 13 }}>
          {locState === 'denied' ? 'Location is off or blocked. ' : locState === 'unsupported' ? "Your browser can't share location. " : ''}
          Enter a city instead:
          <span style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
            <input
              value={cityDraft} onChange={(e) => setCityDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') setCity(cityDraft.trim()); }}
              placeholder="e.g. Bengaluru"
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}
            />
            <button className="btn btn-gold btn-sm" onClick={() => setCity(cityDraft.trim())} disabled={!cityDraft.trim()}>Search</button>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="card rise" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div className="pill-row">
            {(['all', 'budget', 'mid', 'gourmet'] as PriceBand[]).map((b) => (
              <button key={b} className={`pill ${price === b ? 'on' : ''}`} onClick={() => setPrice(b)}>
                {b === 'all' ? 'All prices' : b === 'budget' ? 'Budget ₹' : b === 'mid' ? 'Mid ₹₹' : 'Gourmet ₹₹₹'}
              </button>
            ))}
            <button className={`pill ${openNow ? 'on' : ''}`} onClick={() => setOpenNow(!openNow)}>Open now</button>
            <button className={`pill ${pureVeg ? 'on' : ''}`} onClick={() => setPureVeg(!pureVeg)}>Pure veg</button>
            <button className="pill" onClick={() => setShowFilters(!showFilters)}>{showFilters ? 'Fewer filters ▴' : 'More filters ▾'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: 'var(--muted)' }}>
            Radius
            <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--line)' }}>
              {[2, 3, 5, 8, 12, 20].map((k) => <option key={k} value={k}>{k} km</option>)}
            </select>
          </div>
        </div>

        {showFilters && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}>
              <option value="">Any cuisine</option>
              {(cuisines ?? []).map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
            </select>
            <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}>
              <option value={0}>Any rating</option>
              <option value={4}>4.0+ ★</option>
              <option value={4.3}>4.3+ ★</option>
              <option value={4.5}>4.5+ ★</option>
            </select>
            <button className={`pill ${outdoor ? 'on' : ''}`} onClick={() => setOutdoor(!outdoor)}>Outdoor seating</button>
            <button className={`pill ${family ? 'on' : ''}`} onClick={() => setFamily(!family)}>Family friendly</button>
            <button className={`pill ${pet ? 'on' : ''}`} onClick={() => setPet(!pet)}>Pet friendly</button>
          </div>
        )}
      </div>

      <div className="note rise" style={{ margin: '14px 0', fontSize: 12.5 }}>
        🌿 Ranked from your saved food profile. <Link to="/nutrition/preferences" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Update dietary preferences →</Link>
      </div>

      {/* Results */}
      {!enabled ? (
        <div className="empty" style={{ textAlign: 'center', padding: '46px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📍</div>
          <h3 style={{ marginBottom: 6 }}>Share your location to begin</h3>
          <p className="muted" style={{ fontSize: 13, maxWidth: '46ch', margin: '0 auto 16px' }}>We use it once to find the best restaurants around you, then keep the results cached — no constant tracking.</p>
          <button className="btn btn-gold btn-sm" onClick={askLocation}>Use my location</button>
        </div>
      ) : isLoading ? (
        <div className="empty" style={{ textAlign: 'center', padding: '46px 24px' }}><p className="muted">Finding the best spots near you…</p></div>
      ) : list.length === 0 ? (
        <div className="empty" style={{ textAlign: 'center', padding: '46px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>🍽</div>
          <h3 style={{ marginBottom: 6 }}>No matches with these filters</h3>
          <p className="muted" style={{ fontSize: 13 }}>Try widening the radius or clearing a filter.</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '4px 2px 14px' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Top {list.length} for you</h2>
            <span className="muted" style={{ fontSize: 12 }}>{data?.live ? 'Live nearby results' : 'Curated selection'}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>
            {list.map((r) => <RestaurantCardView key={r.id} r={r} />)}
          </div>
        </>
      )}
    </div>
  );
}
