import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useCuisines, useRestaurants, inr, type RestaurantCard } from '../api';

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: '#1b7a3a', background: '#e8f5e9', borderRadius: 8, padding: '2px 7px' }}>
      ★ {rating.toFixed(1)}
    </span>
  );
}

function Card({ r }: { r: RestaurantCard }) {
  const fitPct = r.dietTotal ? Math.round(((r.dietFitCount ?? 0) / r.dietTotal) * 100) : null;
  return (
    <Link to={`/restaurants/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <article className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 10', background: 'var(--line)' }}>
          <img src={r.heroUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,.5)', borderRadius: 999, padding: '3px 10px' }}>{r.icon} {r.cuisineLabel}</span>
          {r.vegFriendly && <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 10.5, fontWeight: 700, color: '#fff', background: 'rgba(27,122,58,.9)', borderRadius: 999, padding: '3px 9px' }}>Veg-friendly</span>}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>{r.name}</div>
            <span style={{ marginLeft: 'auto' }}><Stars rating={r.rating} /></span>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>{r.tagline}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{r.area} · {inr(r.priceForTwoInr)} for two · {r.openHours}</div>
          {fitPct !== null && (
            <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: fitPct >= 60 ? '#1b7a3a' : '#8a6d00', background: fitPct >= 60 ? '#e8f5e9' : '#fff7e0', borderRadius: 8, padding: '4px 9px', display: 'inline-block' }}>
              🥗 {r.dietFitCount}/{r.dietTotal} dishes fit your {r.dietLabel} plan
            </div>
          )}
        </div>
      </article>
    </Link>
  );
}

/** Discover — browse restaurants by cuisine, with a veg-only toggle and diet-fit hints from Nutrition. */
export function Discover() {
  const cuisines = useCuisines();
  const [cuisine, setCuisine] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const list = useRestaurants({ cuisine: cuisine || undefined, vegOnly: vegOnly || undefined });

  const chip = (active: boolean) => ({ cursor: 'pointer', borderRadius: 999, padding: '7px 15px', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? '#fff' : 'var(--ink-soft)' } as const);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div><div className="eyebrow">Restaurants · Discover</div><h1 style={{ fontSize: 26, margin: 0 }}>Where are we eating?</h1></div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <Link to="/restaurants/reservations"><Button variant="line" size="sm">📅 Reservations</Button></Link>
          <Link to="/restaurants/orders"><Button variant="accent" size="sm">🧾 My orders</Button></Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
        <button type="button" onClick={() => setCuisine('')} style={chip(cuisine === '')}>All</button>
        {(cuisines.data ?? []).map((c) => (
          <button key={c.key} type="button" onClick={() => setCuisine(c.key)} style={chip(cuisine === c.key)}>{c.icon} {c.label}</button>
        ))}
        <button type="button" onClick={() => setVegOnly((v) => !v)} style={{ ...chip(vegOnly), marginLeft: 'auto' }}>🟢 Veg-friendly only</button>
      </div>

      {list.isLoading ? <Spinner label="Loading restaurants…" />
        : list.isError ? <EmptyState title="Couldn't load restaurants" hint="Start the backend and reload." />
        : (list.data ?? []).length === 0 ? <EmptyState icon="🍽" title="No restaurants match" hint="Try another cuisine." />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
            {list.data?.map((r) => <Card key={r.id} r={r} />)}
          </div>
        )}
    </div>
  );
}
