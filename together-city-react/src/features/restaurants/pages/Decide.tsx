import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMealMatch, useCollections, inr, type DishMatch, type CuratedCard } from '../api';

/** Match medal + label for a 0–100 dish match. */
function medal(score: number): { icon: string; label: string; color: string } {
  if (score >= 90) return { icon: '🥇', label: 'Perfect match', color: '#1b7a3a' };
  if (score >= 80) return { icon: '🥈', label: 'Great match', color: '#2e7d4f' };
  if (score >= 68) return { icon: '🥉', label: 'Good match', color: '#8a6d00' };
  return { icon: '•', label: 'Fair match', color: 'var(--muted)' };
}

function TargetCard({ t }: { t: NonNullable<ReturnType<typeof useMealMatch>['data']>['target'] }) {
  if (!t) return null;
  const macro = (label: string, value: string) => (
    <div style={{ textAlign: 'center', minWidth: 60 }}>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 10.5, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</div>
    </div>
  );
  return (
    <div className="card" style={{ background: 'linear-gradient(135deg, #eef7f0, var(--card,#fff))' }}>
      <div className="eyebrow" style={{ marginTop: 0 }}>🥗 Today's {t.slotLabel} target · from your meal plan</div>
      <div style={{ fontSize: 14, margin: '2px 0 12px' }}>Planned: <strong>{t.recipeName}</strong></div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {macro('Calories', `${t.kcal}`)}{macro('Protein', `${t.protein}g`)}{macro('Carbs', `${t.carbs}g`)}{macro('Fat', `${t.fat}g`)}
      </div>
    </div>
  );
}

function MatchRow({ m, rank }: { m: DishMatch; rank: number }) {
  const md = medal(m.matchScore);
  return (
    <div className="card" style={{ display: 'flex', gap: 14, padding: 14 }}>
      <div style={{ width: 84, height: 84, borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: 'var(--line)' }}>
        {m.heroUrl ? <img src={m.heroUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 30 }}>{m.icon}</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 800, color: md.color }}>{rank <= 3 ? md.icon : ''} {m.matchScore}% {md.label}</span>
          {m.bestseller && <span style={{ fontSize: 10, fontWeight: 700, color: '#8a6d00', background: '#fff3cf', borderRadius: 6, padding: '1px 6px' }}>★ Bestseller</span>}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{m.dishName}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{m.restaurantName} · {m.area} · {m.distanceKm} km</div>
        <div style={{ fontSize: 12.5, marginTop: 5, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span><b>{m.kcal}</b> kcal</span><span><b>{m.protein}g</b> protein</span><span>{inr(m.priceInr)}</span>
          <span className="muted" title="Nutrition is estimated from the dish, not lab-measured">~est.</span>
        </div>
        <ul style={{ margin: '7px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
          {m.why.map((w, i) => <li key={i} style={{ fontSize: 12, color: '#1b7a3a' }}>✓ {w}</li>)}
        </ul>
        <Link className="btn btn-line btn-sm" to={`/restaurants/${m.restaurantId}`} style={{ marginTop: 8 }}>View menu →</Link>
      </div>
    </div>
  );
}

function CheatRail({ title, subtitle, items }: { title: string; subtitle: string; items: CuratedCard[] }) {
  if (!items.length) return null;
  return (
    <section style={{ marginTop: 22 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>{title}</h3>
      {subtitle && <p className="muted" style={{ margin: '0 0 10px', fontSize: 12.5 }}>{subtitle}</p>}
      <div style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 8 }}>
        {items.map((r) => (
          <Link key={r.id} to={`/restaurants/${r.id}`} className="card" style={{ flex: '0 0 210px', overflow: 'hidden', padding: 0, textDecoration: 'none', color: 'inherit' }}>
            <div style={{ position: 'relative', height: 110, background: 'var(--line)' }}>
              {r.heroUrl ? <img src={r.heroUrl} alt={r.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 30 }}>{r.icon}</div>}
              <span style={{ position: 'absolute', top: 8, right: 8, background: '#111', color: '#fff', fontWeight: 800, fontSize: 11, borderRadius: 7, padding: '2px 7px' }}>{r.tcScore}</span>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.category} · ★ {r.rating.toFixed(1)} · {r.priceCategory}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/** Decision-first food engine: decide HOW you want to eat, then get matched. */
export function Decide() {
  const [mode, setMode] = useState<null | 'plan' | 'cheat'>(null);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (mode !== 'cheat' || loc) return;
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined, { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  }, [mode, loc]);

  const meal = useMealMatch({}, mode === 'plan');
  const cheat = useCollections({ ...(loc ?? {}), radiusKm: 8 }, mode === 'cheat');

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px 60px' }}>
      <div className="eyebrow">Restaurants · Decide</div>
      <h1 style={{ fontSize: 'clamp(26px,3vw,38px)', margin: '2px 0 6px' }}>How do you want to eat today?</h1>
      <p className="muted" style={{ fontSize: 14, marginTop: 0 }}>Decide first — then we find the meal, not just a restaurant.</p>

      {/* Two-option decision */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginTop: 16 }}>
        <button type="button" onClick={() => setMode('plan')} className="card lift"
          style={{ cursor: 'pointer', textAlign: 'left', border: mode === 'plan' ? '2px solid var(--accent)' : undefined, fontFamily: 'inherit' }}>
          <div style={{ fontSize: 30 }}>🥗</div>
          <h3 style={{ margin: '6px 0 4px', fontSize: 18 }}>Follow My Meal Plan</h3>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Eat to today's nutrition target — we rank nearby dishes by how well they match.</p>
        </button>
        <button type="button" onClick={() => setMode('cheat')} className="card lift"
          style={{ cursor: 'pointer', textAlign: 'left', border: mode === 'cheat' ? '2px solid var(--accent)' : undefined, fontFamily: 'inherit' }}>
          <div style={{ fontSize: 30 }}>🍔</div>
          <h3 style={{ margin: '6px 0 4px', fontSize: 18 }}>Cheat Meal</h3>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>Eating for enjoyment today — trending dishes, best desserts, cafés & more.</p>
        </button>
      </div>

      {/* Follow My Meal Plan */}
      {mode === 'plan' && (
        <div style={{ marginTop: 22 }}>
          {meal.isLoading ? <p className="muted">Matching dishes to your plan…</p>
            : !meal.data?.hasPlan ? (
              <div className="empty" style={{ textAlign: 'center', padding: '40px 24px', border: '1px dashed var(--line)', borderRadius: 'var(--radius-lg)' }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>🥗</div>
                <h3 style={{ marginBottom: 6 }}>No meal plan yet</h3>
                <p className="muted" style={{ fontSize: 13, marginBottom: 14 }}>Build your weekly plan and we'll match restaurant dishes to each meal's target.</p>
                <Link className="btn btn-gold btn-sm" to="/nutrition/weekly">Set up my meal plan →</Link>
              </div>
            ) : !meal.data.target ? (
              <p className="muted">No planned meal for right now — check your <Link to="/nutrition/weekly">weekly plan</Link>.</p>
            ) : (
              <>
                <TargetCard t={meal.data.target} />
                <h2 style={{ fontSize: 20, margin: '20px 0 12px' }}>Today's best matches</h2>
                {meal.data.matches.length === 0 ? <p className="muted">No close dish matches nearby yet.</p>
                  : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{meal.data.matches.map((m, i) => <MatchRow key={`${m.restaurantId}-${m.dishId}`} m={m} rank={i + 1} />)}</div>}
                <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>Dish nutrition is estimated from each dish (menus rarely publish macros) and improves as restaurants add nutrition data.</p>
              </>
            )}
        </div>
      )}

      {/* Cheat Meal */}
      {mode === 'cheat' && (
        <div style={{ marginTop: 22 }}>
          <div className="card" style={{ background: 'linear-gradient(135deg, #fff3e6, var(--card,#fff))' }}>
            <div className="eyebrow" style={{ marginTop: 0 }}>🍰 Treat yourself today</div>
            <p style={{ fontSize: 13.5, margin: '4px 0 0' }}>We're ignoring today's targets — here's what people are loving nearby. Nutrition still shows on each dish so you stay in control.</p>
          </div>
          {cheat.isLoading ? <p className="muted" style={{ marginTop: 16 }}>Finding the good stuff…</p>
            : (cheat.data?.collections.length ?? 0) === 0 ? <p className="muted" style={{ marginTop: 16 }}>Nothing nearby yet — try <Link to="/restaurants/explore">Explore</Link>.</p>
            : (cheat.data!.collections
                .filter((c) => ['trending', 'desserts', 'top25', 'cafes', 'street', 'coffee', 'finedining'].includes(c.key))
                .slice(0, 6)
                .map((c) => <CheatRail key={c.key} title={c.title} subtitle={c.subtitle} items={c.items} />))}
        </div>
      )}

      {!mode && <p className="muted" style={{ fontSize: 12.5, marginTop: 18, textAlign: 'center' }}>Prefer to just browse? <Link to="/restaurants/explore" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Explore the Top 25 →</Link></p>}
    </div>
  );
}
