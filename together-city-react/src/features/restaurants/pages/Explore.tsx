import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useCuisines, useTopByLocality, useCollections, useRestaurantSearch,
  inr, type DiscoverQuery, type CuratedCard,
} from '../api';

type LocState = 'idle' | 'asking' | 'granted' | 'denied' | 'unsupported';
type PriceBand = 'all' | 'budget' | 'mid' | 'gourmet';
const PRICE_MAX: Record<PriceBand, number | undefined> = { all: undefined, budget: 800, mid: 2000, gourmet: undefined };

/** Together City Score ring — a 0–100 curated quality score. */
function ScoreRing({ score }: { score: number }) {
  const hue = score >= 85 ? 145 : score >= 70 ? 90 : 45;
  return (
    <div style={{ width: 54, height: 54, borderRadius: '50%', flex: '0 0 auto', background: `conic-gradient(hsl(${hue} 60% 45%) ${score * 3.6}deg, var(--line) 0)`, display: 'grid', placeItems: 'center' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--card, #fff)', display: 'grid', placeItems: 'center', flexDirection: 'column' }}>
        <b style={{ fontSize: 15, lineHeight: 1 }}>{score}</b>
        <span style={{ fontSize: 7, color: 'var(--muted)', letterSpacing: '.04em' }}>TC</span>
      </div>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: 'center', minWidth: 54 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
}

/** Full curated card (Top 25 / search results). */
function CuratedCardView({ r }: { r: CuratedCard }) {
  return (
    <div className="card rise" style={{ overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'relative', height: 150, background: 'var(--line)' }}>
        {r.heroUrl
          ? <img src={r.heroUrl} alt={r.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 40 }}>{r.icon}</div>}
        {r.rank ? <span style={{ position: 'absolute', top: 10, left: 10, background: '#111', color: '#fff', fontWeight: 800, fontSize: 12, borderRadius: 8, padding: '3px 8px' }}>#{r.rank}</span> : null}
        <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tag" style={{ background: 'rgba(0,0,0,.66)', color: '#fff' }}>{r.category}</span>
          {r.tcChecked && <span className="tag" style={{ background: '#111', color: '#fff', fontWeight: 700 }}>✓ TC Checked</span>}
        </div>
        <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6 }}>
          <span className="tag" style={{ background: r.openNow ? '#12631f' : '#7a1f1f', color: '#fff' }}>{r.openNow ? 'Open' : 'Closed'}</span>
        </div>
      </div>

      <div style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>{r.name}</h3>
            <p className="meta" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{r.icon} {r.cuisineLabel} · {r.area || r.city || 'Nearby'}</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, fontSize: 12.5, flexWrap: 'wrap' }}>
              <b>★ {r.rating.toFixed(1)}</b>
              {r.ratingsCount ? <span className="muted">({r.ratingsCount.toLocaleString('en-IN')})</span> : null}
              <span className="muted">· {inr(r.priceForTwoInr)} for two · {r.priceCategory}</span>
            </div>
          </div>
          <ScoreRing score={r.tcScore} />
        </div>

        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between', margin: '14px 0', padding: '10px 4px', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
          <Stat label="Quality" value={`${r.qualityScore}/5`} />
          <Stat label="Hygiene" value={`${r.hygiene}/5`} />
          <Stat label="Distance" value={`${r.distanceKm} km`} />
          <Stat label="ETA" value={`${r.etaMins} min`} />
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {r.menuAvailable && <span className="tag" style={{ fontSize: 11 }}>📖 Menu</span>}
          {r.reservations && <span className="tag" style={{ fontSize: 11 }}>🍽 Reserve</span>}
          {r.ordersOnline && <span className="tag" style={{ fontSize: 11 }}>🛵 Order</span>}
          {r.pureVeg && <span className="tag" style={{ fontSize: 11, color: '#2e7d32' }}>Pure veg</span>}
        </div>

        {r.reasons.length > 0 && (
          <ul style={{ margin: '0 0 12px', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            <li style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)' }}>Recommended because</li>
            {r.reasons.slice(0, 3).map((why, i) => <li key={i} style={{ fontSize: 12.5, color: 'var(--muted)' }}>· {why}</li>)}
          </ul>
        )}

        <Link className="btn btn-gold btn-sm" to={`/restaurants/${r.id}`} style={{ width: '100%', justifyContent: 'center' }}>View profile & menu →</Link>
      </div>
    </div>
  );
}

/** Horizontal collection rail of compact cards. */
function CollectionRail({ title, subtitle, items }: { title: string; subtitle: string; items: CuratedCard[] }) {
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 26 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 19 }}>{title}</h2>
          {subtitle && <p className="muted" style={{ margin: '2px 0 0', fontSize: 12.5 }}>{subtitle}</p>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8, scrollSnapType: 'x mandatory' }}>
        {items.map((r) => (
          <Link key={r.id} to={`/restaurants/${r.id}`} className="card" style={{ flex: '0 0 220px', scrollSnapAlign: 'start', overflow: 'hidden', padding: 0, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ position: 'relative', height: 110, background: 'var(--line)' }}>
              {r.heroUrl ? <img src={r.heroUrl} alt={r.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 32 }}>{r.icon}</div>}
              <span style={{ position: 'absolute', top: 8, right: 8, background: '#111', color: '#fff', fontWeight: 800, fontSize: 11, borderRadius: 7, padding: '2px 7px' }}>{r.tcScore}</span>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.category} · ★ {r.rating.toFixed(1)} · {r.priceCategory}</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 1 }}>{r.area || r.city} · {r.distanceKm} km</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Restaurants · Explore — a curated food-discovery guide (Top 25 + collections + search). */
export function Explore() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [city, setCity] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [term, setTerm] = useState('');

  const [radiusKm, setRadiusKm] = useState(5);
  const [cuisine, setCuisine] = useState('');
  const [price, setPrice] = useState<PriceBand>('all');
  const [minRating, setMinRating] = useState(0);
  const [openNow, setOpenNow] = useState(false);
  const [pureVeg, setPureVeg] = useState(false);
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
  useEffect(() => { askLocation(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const filtersActive = !!cuisine || price !== 'all' || minRating > 0 || openNow || pureVeg;

  const query = useMemo<DiscoverQuery & { limit?: number }>(() => ({
    ...(loc ? { lat: loc.lat, lng: loc.lng } : {}),
    ...(city ? { city } : {}),
    radiusKm, limit: 25,
    ...(cuisine ? { cuisine } : {}),
    ...(PRICE_MAX[price] != null ? { maxPriceForTwo: PRICE_MAX[price] } : {}),
    ...(minRating ? { minRating } : {}),
    ...(openNow ? { openNow } : {}),
    ...(pureVeg ? { pureVeg } : {}),
  }), [loc, city, radiusKm, cuisine, price, minRating, openNow, pureVeg]);

  const enabled = !!loc || !!city;
  const searching = term.trim().length >= 2;
  const top = useTopByLocality(query, enabled && !searching);
  const collections = useCollections({ ...(loc ?? {}), ...(city ? { city } : {}), radiusKm: 8 }, enabled && !searching && !filtersActive);
  const search = useRestaurantSearch(term);

  const topList = top.data?.restaurants ?? [];

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 210 }}>
        <img className="bg" src="/assets/img/resturant--images--explore.webp" alt="Elegant restaurant dining room" />
        <div className="inner">
          <div className="eyebrow">Restaurants · Explore</div>
          <h1 style={{ fontSize: 'clamp(24px,3vw,40px)' }}>The Top 25 food destinations near you</h1>
          <p className="sub">A curated guide, not a directory — ranked on quality, hygiene, value and menus. Search reaches every restaurant.</p>
        </div>
      </div>

      {/* Search — reaches ALL restaurants */}
      <div className="card rise" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
        <span>🔍</span>
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search any restaurant, café or cuisine…"
          style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'inherit', background: 'transparent' }} />
        {term && <button className="btn btn-line btn-sm" onClick={() => setTerm('')}>Clear</button>}
      </div>

      {searching ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '18px 2px 12px' }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Search results</h2>
            <span className="muted" style={{ fontSize: 12 }}>Searching all restaurants</span>
          </div>
          {search.isLoading ? <p className="muted">Searching…</p>
            : (search.data?.results.length ?? 0) === 0 ? <p className="muted">No restaurants match “{term}”.</p>
            : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>{search.data!.results.map((r) => <CuratedCardView key={r.id} r={r} />)}</div>}
        </>
      ) : (
        <>
          {/* Location + filters */}
          <div className="card rise" style={{ marginTop: 14, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: 13.5 }}>
              {loc ? <>📍 Near you · within <b>{radiusKm} km</b></> : city ? <>📍 Showing <b>{city}</b></> : locState === 'asking' ? '📍 Getting your location…' : '📍 Location needed'}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="pill-row">
                {(['all', 'budget', 'mid', 'gourmet'] as PriceBand[]).map((b) => (
                  <button key={b} className={`pill ${price === b ? 'on' : ''}`} onClick={() => setPrice(b)}>{b === 'all' ? 'All ₹' : b === 'budget' ? '₹' : b === 'mid' ? '₹₹' : '₹₹₹'}</button>
                ))}
                <button className={`pill ${openNow ? 'on' : ''}`} onClick={() => setOpenNow(!openNow)}>Open now</button>
                <button className={`pill ${pureVeg ? 'on' : ''}`} onClick={() => setPureVeg(!pureVeg)}>Pure veg</button>
                <button className="pill" onClick={() => setShowFilters(!showFilters)}>{showFilters ? 'Fewer ▴' : 'More ▾'}</button>
              </div>
              <button className="btn btn-line btn-sm" onClick={askLocation} disabled={locState === 'asking'}>{loc ? 'Update' : 'Locate'}</button>
            </div>
          </div>

          {showFilters && (
            <div className="card rise" style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={cuisine} onChange={(e) => setCuisine(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}>
                <option value="">Any cuisine</option>
                {(cuisines ?? []).map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
              </select>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}>
                <option value={0}>Any rating</option><option value={4}>4.0+ ★</option><option value={4.3}>4.3+ ★</option><option value={4.5}>4.5+ ★</option>
              </select>
              <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }}>
                {[2, 3, 5, 8, 12, 20].map((k) => <option key={k} value={k}>{k} km</option>)}
              </select>
            </div>
          )}

          {!loc && locState !== 'asking' && (
            <div className="note rise" style={{ marginTop: 12, fontSize: 13 }}>
              Enter a city instead:
              <span style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
                <input value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') setCity(cityDraft.trim()); }} placeholder="e.g. Bengaluru" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }} />
                <button className="btn btn-gold btn-sm" onClick={() => setCity(cityDraft.trim())} disabled={!cityDraft.trim()}>Search</button>
              </span>
            </div>
          )}

          {/* Curated collection rails (hidden when a filter is active) */}
          {!filtersActive && (collections.data?.collections ?? []).slice(0, 6).map((col) => (
            <CollectionRail key={col.key} title={col.title} subtitle={col.subtitle} items={col.items} />
          ))}

          {/* Top 25 grid */}
          {!enabled ? (
            <div className="empty" style={{ textAlign: 'center', padding: '46px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)', marginTop: 20 }}>
              <div style={{ fontSize: 34, marginBottom: 8 }}>📍</div>
              <h3 style={{ marginBottom: 6 }}>Share your location to begin</h3>
              <p className="muted" style={{ fontSize: 13, maxWidth: '46ch', margin: '0 auto 16px' }}>We use it once to curate the best food around you — no constant tracking.</p>
              <button className="btn btn-gold btn-sm" onClick={askLocation}>Use my location</button>
            </div>
          ) : (
            <section style={{ marginTop: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 14px' }}>
                <h2 style={{ margin: 0, fontSize: 20 }}>{top.data?.locality ? `Top 25 in ${top.data.locality}` : `Top ${topList.length} near you`}</h2>
                <span className="muted" style={{ fontSize: 12 }}>{top.data?.live ? 'Live · Google + Together City' : 'Curated selection'}</span>
              </div>
              {top.isLoading ? <p className="muted">Curating the best spots near you…</p>
                : topList.length === 0 ? <p className="muted">No matches with these filters — widen the radius or clear a filter.</p>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 18 }}>{topList.map((r) => <CuratedCardView key={r.id} r={r} />)}</div>}
            </section>
          )}

          <div className="note rise" style={{ margin: '20px 0 0', fontSize: 12.5 }}>
            🌿 Ranked from your saved food profile. <Link to="/nutrition/preferences" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Update dietary preferences →</Link>
          </div>
        </>
      )}
    </div>
  );
}
