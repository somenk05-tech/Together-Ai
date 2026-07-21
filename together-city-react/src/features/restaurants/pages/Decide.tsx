import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCuisines, useTopByLocality, inr, type DiscoverQuery, type CuratedCard } from '../api';

type LocState = 'idle' | 'asking' | 'granted' | 'denied' | 'unsupported';

const MOODS: { key: string; label: string; cuisine?: string; max?: number }[] = [
  { key: 'any', label: '🍽️ Surprise me' },
  { key: 'northindian', label: '🍛 North Indian', cuisine: 'north-indian' },
  { key: 'southindian', label: '🥘 South Indian', cuisine: 'south-indian' },
  { key: 'chinese', label: '🥡 Chinese', cuisine: 'chinese' },
  { key: 'cafe', label: '☕ Café', cuisine: 'cafe' },
  { key: 'biryani', label: '🍚 Biryani', cuisine: 'biryani' },
  { key: 'budget', label: '💸 Under ₹500', max: 500 },
];

function PickCard({ r, big }: { r: CuratedCard; big?: boolean }) {
  return (
    <Link to={`/restaurants/${r.id}`} className="card lift" style={{ display: 'block', textDecoration: 'none', color: 'inherit', overflow: 'hidden', padding: 0 }}>
      <div style={{ position: 'relative', height: big ? 220 : 130, background: 'var(--line)' }}>
        {r.heroUrl ? <img src={r.heroUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 44 }}>{r.icon}</div>}
        <span style={{ position: 'absolute', top: 10, right: 10, background: '#111', color: '#fff', fontWeight: 800, fontSize: 13, borderRadius: 8, padding: '3px 9px' }}>{r.tcScore} TC</span>
        <span style={{ position: 'absolute', top: 10, left: 10 }} className="tag" >{r.category}</span>
      </div>
      <div style={{ padding: big ? 18 : 12 }}>
        <h3 style={{ margin: 0, fontSize: big ? 22 : 16 }}>{r.name}</h3>
        <p className="muted" style={{ margin: '3px 0 0', fontSize: 12.5 }}>{r.icon} {r.cuisineLabel} · {r.area || r.city} · ★ {r.rating.toFixed(1)} · {inr(r.priceForTwoInr)} for two</p>
        {big && r.reasons[0] && <p style={{ margin: '10px 0 0', fontSize: 13.5 }}>💡 {r.reasons[0]}</p>}
      </div>
    </Link>
  );
}

/** Decide What to Eat — the ranking engine picks a spot for you, with a shuffle. */
export function Decide() {
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locState, setLocState] = useState<LocState>('idle');
  const [city, setCity] = useState('');
  const [cityDraft, setCityDraft] = useState('');
  const [mood, setMood] = useState(MOODS[0]);
  const [seed, setSeed] = useState(0);
  const { data: cuisines } = useCuisines();

  const ask = () => {
    if (!('geolocation' in navigator)) { setLocState('unsupported'); return; }
    setLocState('asking');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocState('granted'); },
      () => setLocState('denied'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  };
  useEffect(() => { ask(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const query = useMemo<DiscoverQuery & { limit?: number }>(() => ({
    ...(loc ? { lat: loc.lat, lng: loc.lng } : {}), ...(city ? { city } : {}),
    radiusKm: 6, limit: 25, openNow: true,
    ...(mood.cuisine ? { cuisine: mood.cuisine } : {}),
    ...(mood.max ? { maxPriceForTwo: mood.max } : {}),
  }), [loc, city, mood]);

  const enabled = !!loc || !!city;
  const { data, isLoading } = useTopByLocality(query, enabled);
  const list = data?.restaurants ?? [];

  // Pick from the strong top of the list, reshuffled by `seed`.
  const { pick, alternates } = useMemo(() => {
    if (!list.length) return { pick: null as CuratedCard | null, alternates: [] as CuratedCard[] };
    const pool = list.slice(0, Math.min(8, list.length));
    const idx = (seed % pool.length + pool.length) % pool.length;
    const chosen = pool[idx];
    const alts = list.filter((r) => r.id !== chosen.id).slice(0, 3);
    return { pick: chosen, alternates: alts };
  }, [list, seed]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '28px 16px 60px' }}>
      <div className="eyebrow">Restaurants · Decide</div>
      <h1 style={{ fontSize: 'clamp(26px,3vw,38px)', margin: '2px 0 6px' }}>Can't decide what to eat?</h1>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Pick a craving and we'll choose a great spot near you — ranked by our quality engine, open now.</p>

      <div className="pill-row" style={{ marginTop: 14, flexWrap: 'wrap' }}>
        {MOODS.filter((m) => !m.cuisine || (cuisines ?? []).some((c) => c.key === m.cuisine) || m.key === 'any' || m.max)
          .map((m) => (
          <button key={m.key} className={`pill ${mood.key === m.key ? 'on' : ''}`} onClick={() => { setMood(m); setSeed(0); }}>{m.label}</button>
        ))}
      </div>

      {!enabled ? (
        <div className="empty" style={{ textAlign: 'center', padding: '40px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)', marginTop: 20 }}>
          <div style={{ fontSize: 34, marginBottom: 8 }}>📍</div>
          <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Share your location so we can pick something great nearby.</p>
          <button className="btn btn-gold btn-sm" onClick={ask} disabled={locState === 'asking'}>Use my location</button>
          {locState === 'denied' && (
            <div style={{ marginTop: 14, fontSize: 13 }}>
              or enter a city:
              <span style={{ display: 'inline-flex', gap: 8, marginLeft: 8 }}>
                <input value={cityDraft} onChange={(e) => setCityDraft(e.target.value)} placeholder="e.g. Bengaluru" style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--line)', fontSize: 13 }} />
                <button className="btn btn-line btn-sm" onClick={() => setCity(cityDraft.trim())} disabled={!cityDraft.trim()}>Go</button>
              </span>
            </div>
          )}
        </div>
      ) : isLoading ? (
        <p className="muted" style={{ marginTop: 24 }}>Choosing something delicious…</p>
      ) : !pick ? (
        <p className="muted" style={{ marginTop: 24 }}>Nothing open matches that craving nearby — try another mood or widen your search on Explore.</p>
      ) : (
        <>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>🎯 Tonight, go for…</h2>
              <button className="btn btn-line btn-sm" onClick={() => setSeed((s) => s + 1)}>🎲 Decide again</button>
            </div>
            <PickCard r={pick} big />
          </div>

          {alternates.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <h3 style={{ fontSize: 15, margin: '0 0 10px' }}>Or one of these</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {alternates.map((r) => <PickCard key={r.id} r={r} />)}
              </div>
            </div>
          )}
          <p className="muted" style={{ fontSize: 12.5, marginTop: 20, textAlign: 'center' }}>
            Want the full list? <Link to="/restaurants/explore" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Explore the Top 25 near you →</Link>
          </p>
        </>
      )}
    </div>
  );
}
