import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type FilterKey = 'similar' | 'balanced' | 'protein' | 'lowcarb' | 'vegan';

interface Meal {
  name: string; place: string; meta: string;
  kcal: number; p: number; c: number; f: number;
  veg: boolean; cheat: boolean; ribbon?: 'best' | 'cheat';
}

const MEALS: Meal[] = [
  { name: 'Grilled Salmon Bowl', place: 'Green Bowl Kitchen', meta: '★4.8 · 1.2 km · 25–30 min', kcal: 540, p: 32, c: 38, f: 19, veg: false, cheat: false, ribbon: 'best' },
  { name: 'Paneer Butter Masala', place: 'NutriBites Café', meta: '★4.7 · 2.0 km · 30–35 min', kcal: 560, p: 22, c: 42, f: 32, veg: true, cheat: false },
  { name: 'Chicken Caesar Wrap', place: 'The Wholesome Table', meta: '★4.6 · 1.8 km · 20–25 min', kcal: 580, p: 34, c: 44, f: 24, veg: false, cheat: false },
  { name: 'Classic Cheese Burger', place: 'Burger Barn', meta: '★4.3 · 2.4 km · 25–30 min', kcal: 530, p: 26, c: 40, f: 28, veg: false, cheat: true, ribbon: 'cheat' },
  { name: 'Margherita Pizza', place: 'Pizza Primo', meta: '★4.5 · 1.5 km · 20–30 min', kcal: 550, p: 21, c: 60, f: 20, veg: true, cheat: false },
];

const LABELS: Record<FilterKey, string> = {
  similar: 'similar to your current meal — Target: ~550 kcal',
  balanced: 'with balanced macronutrients',
  protein: 'high in protein (30g+)',
  lowcarb: 'lower in carbs (under 40g)',
  vegan: 'that are vegetarian / plant-forward',
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'similar', label: 'Similar Calories' }, { key: 'balanced', label: 'Balanced Nutrition' },
  { key: 'protein', label: 'High Protein' }, { key: 'lowcarb', label: 'Low Carb' }, { key: 'vegan', label: 'Vegan' },
];

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 26 } as const;

/** Decide What to Eat — nutrition-aware meal replacements matched to your plan. */
export function FindMeal() {
  const [filter, setFilter] = useState<FilterKey>('similar');
  const [cheat, setCheat] = useState(false);

  const shown = useMemo(() => MEALS.filter((m) => {
    if (m.cheat && !cheat) return false;
    if (filter === 'similar') return m.kcal >= 500 && m.kcal <= 600;
    if (filter === 'protein') return m.p >= 30;
    if (filter === 'lowcarb') return m.c <= 40;
    if (filter === 'vegan') return m.veg;
    return true;
  }), [filter, cheat]);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--find-a-meal.webp" alt="Healthy plated meal, softly lit" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · 01</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>Decide What to Eat 🌿</h1>
          <p className="sub">Discover meals with similar calories and nutritional value to replace your current meal.</p>
        </div>
      </div>

      <div className="card rise" style={{ marginBottom: 24, marginTop: 24 }}>
        <div className="pill-row">
          {FILTERS.map((f) => (
            <span key={f.key} className={`pill${filter === f.key ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setFilter(f.key)}>{f.label}</span>
          ))}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--ink-soft)', marginLeft: 'auto' }}>
            <input type="checkbox" checked={cheat} onChange={(e) => setCheat(e.target.checked)} /> Include Cheat Meals
          </label>
        </div>
        <div className="note rise" style={{ margin: '12px 0 0', fontSize: 12.5 }}>
          🌿 Showing all meals for your <b>Everything</b> profile. <Link to="/nutrition/preferences" style={{ color: 'var(--gold-bright)', fontWeight: 600 }}>Change →</Link>
        </div>
      </div>

      <p className="note rise">Showing {shown.length} meal{shown.length === 1 ? '' : 's'} {LABELS[filter]}{cheat ? ' · cheat meals included' : ''}</p>

      <div style={split}>
        <div>
          <div className="rows">
            {shown.map((m) => (
              <div key={m.name} className="card lift" style={{ position: 'relative' }}>
                {m.ribbon && (
                  <span style={{ position: 'absolute', top: 14, left: -6, background: m.ribbon === 'cheat' ? '#9a6b3e' : 'var(--gold)', color: '#fff', fontSize: 10, letterSpacing: '.1em', fontWeight: 700, textTransform: 'uppercase', padding: '5px 12px 5px 16px', borderRadius: '0 999px 999px 0' }}>{m.ribbon === 'cheat' ? 'Cheat Meal' : 'Best Match'}</span>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <Link to="/restaurants/discover" style={{ color: 'inherit', textDecoration: 'none' }}><h3>{m.name}</h3></Link>
                    <p className="meta" style={{ display: 'block', margin: '4px 0 10px' }}>{m.place} · {m.meta}</p>
                    <div className="macro"><span className="kcal">{m.kcal} kcal</span><span><b>{m.p}g</b> protein</span><span><b>{m.c}g</b> carbs</span><span><b>{m.f}g</b> fat</span></div>
                  </div>
                  <Link className="btn btn-gold btn-sm" to="/restaurants/checkout" style={{ alignSelf: 'center' }}>Order Now</Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Your Current Meal</h4>
            <p className="meta" style={{ display: 'block', margin: '8px 0 10px' }}>Grilled Chicken Bowl — from your Nutrition planner</p>
            <div className="macro" style={{ marginBottom: 12 }}><span className="kcal">550 kcal</span><span><b>35g</b> P</span><span><b>50g</b> C</span><span><b>18g</b> F</span></div>
            <Link className="btn btn-line btn-sm" to="/nutrition/daily" style={{ width: '100%', justifyContent: 'center' }}>View Details</Link>
          </div>
          <div className="card">
            <h4>Top Rated · Free Delivery</h4>
            <div className="rows" style={{ marginTop: 12 }}>
              {[['Green Bowl Kitchen', '★4.8 · Free delivery above ₹399'], ['NutriBites Café', '★4.7 · Free delivery above ₹449'], ['The Wholesome Table', '★4.6 · Free delivery above ₹499']].map(([t, m]) => (
                <div key={t} className="row" style={{ boxShadow: 'none', padding: '10px 12px' }}><div className="grow"><div className="t" style={{ fontSize: 13 }}>{t}</div><div className="m">{m}</div></div></div>
              ))}
            </div>
          </div>
          <div className="card">
            <h4>Quick Filters</h4>
            <div className="pill-row" style={{ marginTop: 12 }}><span className="pill">Under 30 min</span><span className="pill">Under 500 kcal</span><span className="pill">No Dairy</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
