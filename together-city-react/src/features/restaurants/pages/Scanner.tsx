import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

interface Recipe { name: string; cui: string; veg: boolean; kcal: number; p: number; c: number; f: number }

const DB: Recipe[] = [
  { name: 'Paneer Tikka Whole-Wheat Wrap', cui: 'North Indian', veg: true, kcal: 520, p: 24, c: 58, f: 20 },
  { name: 'Masala Omelette & Multigrain Toast', cui: 'Indian', veg: false, kcal: 430, p: 22, c: 38, f: 21 },
  { name: 'Grilled Chicken Quinoa Bowl', cui: 'Continental', veg: false, kcal: 560, p: 42, c: 48, f: 20 },
  { name: 'Rajma with Brown Rice', cui: 'North Indian', veg: true, kcal: 490, p: 18, c: 78, f: 9 },
  { name: 'Palak Paneer with Phulka', cui: 'North Indian', veg: true, kcal: 470, p: 21, c: 34, f: 27 },
  { name: 'Thai Green Curry with Jasmine Rice', cui: 'Thai', veg: true, kcal: 610, p: 14, c: 82, f: 24 },
  { name: 'Seasonal Fruit & Nut Bowl', cui: 'Healthy', veg: true, kcal: 320, p: 9, c: 46, f: 12 },
];

const CHIPS = [
  ['Masala Omelette & Multigrain Toast', 'Masala Omelette'], ['Grilled Chicken Quinoa Bowl', 'Grilled Chicken Bowl'],
  ['Rajma with Brown Rice', 'Rajma Chawal'], ['Palak Paneer with Phulka', 'Palak Paneer'],
  ['Thai Green Curry with Jasmine Rice', 'Thai Green Curry'], ['Seasonal Fruit & Nut Bowl', 'Fruit & Nut Bowl'],
] as const;

const DAILY_GOAL = 2000, CONSUMED_BEFORE = 1150, REMAINING = DAILY_GOAL - CONSUMED_BEFORE;

function findRecipe(q: string): Recipe {
  const s = q.toLowerCase().trim();
  const exact = DB.find((r) => s.includes(r.name.toLowerCase()) || r.name.toLowerCase().includes(s));
  if (exact) return exact;
  const words = s.split(/[^a-z]+/).filter(Boolean);
  const scored = DB.map((r) => {
    const pool = [r.name.toLowerCase(), r.cui.toLowerCase()];
    const score = pool.reduce((acc, i) => acc + (words.some((w) => w.length > 2 && i.includes(w)) ? 1 : 0), 0);
    return { r, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0].score > 0 ? scored[0].r : DB[0];
}

const rating = (r: Recipe) => Math.round(Math.max(3, Math.min(9.6, 5 + r.p / 12 - r.f / 22 + (r.veg ? 0.4 : 0))) * 10) / 10;

const inputStyle = { flex: 1, minWidth: 220, border: '1px solid var(--line)', borderRadius: 999, padding: '13px 20px', fontSize: 14, background: 'var(--paper)', color: 'var(--ink)', outline: 'none', fontFamily: 'inherit' } as const;
const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

/** Food Scanner / Meal Calculator — kcal & macro estimate from a photo or a sentence. */
export function Scanner() {
  const [text, setText] = useState('Paneer Tikka Whole-Wheat Wrap, extra roti');
  const [query, setQuery] = useState('Paneer Tikka Whole-Wheat Wrap, extra roti');
  const r = useMemo(() => findRecipe(query), [query]);

  const over = r.kcal - REMAINING;
  const rat = rating(r);
  const circ = 2 * Math.PI * 38;
  const offset = circ * (1 - (rat * 10) / 100);

  const portions: [string, number][] = [['Small', 0.6], ['Regular', 1], ['Large', 1.4], ['Extra Large', 1.8]];
  const dv: [string, number][] = [['Protein', Math.round((r.p / 50) * 100)], ['Carbs', Math.round((r.c / 275) * 100)], ['Fat', Math.round((r.f / 78) * 100)]];
  const budgetThis = Math.min(100 - 57.5, (r.kcal / DAILY_GOAL) * 100);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="hero rise" style={{ minHeight: 260 }}>
        <img className="bg" src="/assets/img/resturant--images--option-card---bowl.webp" alt="Close-up of a plated dish ready to be scanned" />
        <div className="inner">
          <div className="eyebrow">Restaurants Hub · Meal Mode</div>
          <h1 style={{ fontSize: 'clamp(28px,3vw,44px)' }}>Food Scanner / Meal Calculator</h1>
          <p className="sub">Tell us what you're eating — by photo or by sentence — and we calculate kcal and macros instantly, matched against our recipe database.</p>
        </div>
      </div>

      <div style={split}>
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 12 }}>Scan Your Food</h4>
            <p className="meta" style={{ display: 'block', marginBottom: 12 }}>Good lighting, full dish in frame, one dish at a time — or just type it below.</p>
            <div className="pill-row" style={{ marginBottom: 16 }}><span className="pill">📷 Use Camera</span><span className="pill">🖼 Choose from Gallery</span></div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Describe the dish you are eating" style={inputStyle} />
              <button className="btn btn-gold btn-sm" type="button" onClick={() => setQuery(text)}>Scan Dish</button>
            </div>
            <div className="pill-row" style={{ marginTop: 14 }}>
              {CHIPS.map(([name, label]) => (
                <span key={name} className="pill" style={{ cursor: 'pointer' }} onClick={() => { setText(name); setQuery(name); }}>{label}</span>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <h3>{r.name}</h3>
                <p className="meta" style={{ display: 'block', margin: '4px 0 10px' }}>{r.cui} · {r.veg ? 'Veg' : 'Non-veg'} · matched from Together City recipe database</p>
                <div className="macro"><span className="kcal">{r.kcal} kcal</span><span><b>{r.p}g</b> protein</span><span><b>{r.c}g</b> carbs</span><span><b>{r.f}g</b> fat</span></div>
                <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 700, padding: '5px 12px', borderRadius: 999, marginTop: 6, background: over > 0 ? '#3a2016' : 'rgba(46,125,79,.16)', color: over > 0 ? '#e8a37c' : '#6fcf97' }}>
                  {over > 0 ? `Over daily limit by ${over} kcal` : `Fits your day — ${Math.abs(over)} kcal to spare`}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div className="ring" style={{ width: 88, height: 88 }}>
                  <svg width="88" height="88"><circle className="bgc" cx="44" cy="44" r="38" style={{ strokeWidth: 7 }} /><circle className="fgc" cx="44" cy="44" r="38" style={{ strokeWidth: 7, strokeDasharray: circ, strokeDashoffset: offset }} /></svg>
                  <div className="cent"><b style={{ fontSize: 17 }}>{rat}</b><span>/ 10</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <h4>Portion-Wise Analysis</h4>
            <table className="tc" style={{ marginTop: 12 }}>
              <thead><tr><th>Portion</th><th>Est. Weight</th><th>kcal</th><th>vs Remaining Budget</th></tr></thead>
              <tbody>
                {portions.map(([label, mult]) => {
                  const kc = Math.round((r.kcal * mult) / 10) * 10;
                  const d = kc - REMAINING;
                  return <tr key={label}><td><b>{label}</b></td><td>{Math.round(220 * mult)}g</td><td>{kc} kcal</td><td style={{ color: d > 0 ? '#e8a37c' : '#6fcf97' }}>{d > 0 ? `+${d} Over` : `${d} Under`}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <h4>Daily Budget</h4>
            <div className="stat" style={{ marginTop: 12 }}><div className="lab">Daily Goal</div><div className="val">2,000 <span style={{ fontSize: 13, fontWeight: 400 }}>kcal</span></div></div>
            <div style={{ height: 14, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', display: 'flex', margin: '10px 0' }}>
              <div style={{ background: 'var(--ink-soft)', width: '57.5%' }} /><div style={{ background: 'var(--gold)', width: `${budgetThis}%` }} />
            </div>
            <p className="meta" style={{ display: 'block' }}>Consumed so far today: <b>1,150 kcal</b> · This dish: <b>{r.kcal} kcal</b> · Remaining after: <b>{REMAINING - r.kcal} kcal</b></p>
          </div>
          <div className="card">
            <h4>Nutrient Summary · %DV</h4>
            <div style={{ marginTop: 12 }}>
              {dv.map(([label, pct]) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '9px 0', fontSize: 12.5 }}>
                  <span style={{ width: 66, flexShrink: 0, color: 'var(--ink-soft)' }}>{label}</span>
                  <div style={{ flex: 1, height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: 'var(--accent)', borderRadius: 4, width: `${Math.min(100, pct)}%` }} /></div>
                  <span style={{ width: 40, textAlign: 'right', flexShrink: 0, color: 'var(--muted)' }}>{pct}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <h4>Tips to Balance</h4>
            <p className="meta" style={{ display: 'block', margin: '8px 0' }}>Add a side salad · drink a glass of water · a 20-minute walk after eating · choose grilled over fried next time.</p>
            <Link className="btn btn-gold btn-sm" to="/nutrition/daily" style={{ width: '100%', justifyContent: 'center' }}>Save to Meal Plan →</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
