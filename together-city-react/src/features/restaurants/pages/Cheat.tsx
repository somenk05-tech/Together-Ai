import { useState } from 'react';
import { Link } from 'react-router-dom';

interface CheatMeal { name: string; cat: string; kcal: number; p: number; c: number; f: number; under: number }

const MEALS: CheatMeal[] = [
  { name: 'Grilled Chicken Burger', cat: 'Burger', kcal: 380, p: 24, c: 32, f: 16, under: 120 },
  { name: 'Thin Crust Veg Pizza', cat: 'Pizza', kcal: 300, p: 11, c: 38, f: 12, under: 200 },
  { name: 'Schezwan Veg Noodles', cat: 'Rice', kcal: 440, p: 9, c: 58, f: 18, under: 60 },
  { name: 'Grilled Chicken Burrito', cat: 'Rice', kcal: 420, p: 28, c: 40, f: 14, under: 80 },
  { name: 'Dark Chocolate Lava Cake', cat: 'Dessert', kcal: 470, p: 6, c: 52, f: 24, under: 30 },
  { name: '2 Pc Grilled Chicken', cat: 'Burger', kcal: 440, p: 38, c: 6, f: 26, under: 60 },
];

const CATS = [['all', 'All'], ['Burger', 'Burger'], ['Pizza', 'Pizza'], ['Rice', 'Rice & Bowls'], ['Dessert', 'Desserts']] as const;
const STATS = [['Daily Goal', '2,000', 'kcal'], ['Eaten Today', '1,350', 'kcal'], ['Remaining', '650', 'kcal'], ['Cheat Meal Buffer', '500', 'kcal max']] as const;

/** Cheat Meals Around You — indulgent dishes that fit inside today's buffer. */
export function Cheat() {
  const [cat, setCat] = useState('all');
  const shown = MEALS.filter((m) => cat === 'all' || m.cat === cat);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--find-a-meal.webp" alt="Indulgent comfort food spread" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · Meal Mode</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>Cheat Meals Around You</h1>
          <p className="sub">Enjoy. Don't feel guilty. Every dish here fits inside today's buffer.</p>
        </div>
      </div>

      <div className="grid4 rise" style={{ marginBottom: 32, marginTop: 24 }}>
        {STATS.map(([lab, val, delta], i) => (
          <div key={lab} className="stat"><div className="lab">{lab}</div><div className="val" style={i === 3 ? { color: 'var(--gold-bright)' } : undefined}>{val}</div><div className="delta">{delta}</div></div>
        ))}
      </div>

      <div className="pill-row rise" style={{ marginBottom: 24 }}>
        {CATS.map(([key, label]) => (
          <span key={key} className={`pill${cat === key ? ' on' : ''}`} style={{ cursor: 'pointer' }} onClick={() => setCat(key)}>{label}</span>
        ))}
      </div>

      <div className="grid3 rise">
        {shown.map((m) => (
          <Link key={m.name} className="card lift" to="/restaurants/final" style={{ color: 'inherit', textDecoration: 'none' }}>
            <h3>{m.name}</h3>
            <div className="macro" style={{ margin: '10px 0' }}><span className="kcal">{m.kcal} kcal</span><span><b>{m.p}g</b> P</span><span><b>{m.c}g</b> C</span><span><b>{m.f}g</b> F</span></div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: '#6fcf97', background: 'rgba(46,125,79,.16)', borderRadius: 999, padding: '4px 10px', marginTop: 8 }}>−{m.under} kcal under buffer</span>
          </Link>
        ))}
      </div>

      <p className="note rise">Portion control still matters on a cheat day — a recommended cheat buffer is <b>~120 to ~250 kcal per meal</b>, so pair richer dishes with a lighter side.</p>

      <div className="rise" style={{ textAlign: 'center', marginTop: 20 }}>
        <Link className="btn btn-line" to="/nutrition/daily">View Full Nutrition Summary →</Link>
      </div>
    </div>
  );
}
