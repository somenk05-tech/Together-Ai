import { useState } from 'react';
import { Link } from 'react-router-dom';

const split = { display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)', gap: 28, marginTop: 24 } as const;

/** Your Final Meal — review, calorie impact and a smart swap suggestion. */
export function Final() {
  const [swapped, setSwapped] = useState(false);
  const circ = 2 * Math.PI * 45;
  const offset = circ * (1 - 90 / 100);

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '24px 16px 60px' }}>
      <div className="eyebrow rise">Restaurants Hub · Meal Mode</div>
      <h1 className="rise" style={{ marginBottom: 6 }}>Your Final Meal — Review, Impact &amp; Smart Swap</h1>
      <p className="lede rise" style={{ marginBottom: 26 }}>La Pino'z ★4.3 · 25–35 min · until Together City's own delivery fleet launches, order through your preferred delivery app — calories and macros stay synced here either way.</p>

      <div className="rise" style={split}>
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
              <h3>Your Chosen Combo</h3>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', color: 'var(--gold-bright)', border: '1px dashed var(--gold)', borderRadius: 999, padding: '5px 12px' }}>✓ AI NUTRITION VERIFIED</span>
            </div>
            <p className="meta" style={{ display: 'block', margin: '10px 0' }}>Pizza 1 Medium 1,080 kcal + Fries 420 kcal + Diet Coke 0 kcal</p>
            <div className="macro" style={{ marginBottom: 10 }}><span className="kcal" style={{ fontSize: 20 }}>1,500 kcal total</span></div>
            <table className="tc">
              <thead><tr><th>Carbs</th><th>Protein</th><th>Fat</th><th>Fibre</th><th>Sodium</th></tr></thead>
              <tbody><tr><td>182g</td><td>52g</td><td>68g</td><td>8g</td><td>2,150mg</td></tr></tbody>
            </table>
          </div>

          <div className="card">
            <h3>Today's Calorie Summary</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 14 }}>
              <div className="ring" style={{ width: 104, height: 104 }}>
                <svg width="104" height="104"><circle className="bgc" cx="52" cy="52" r="45" style={{ strokeWidth: 8 }} /><circle className="fgc" cx="52" cy="52" r="45" style={{ strokeWidth: 8, strokeDasharray: circ, strokeDashoffset: offset }} /></svg>
                <div className="cent"><b style={{ fontSize: 18 }}>+1,250</b><span>kcal over</span></div>
              </div>
              <div>
                <p style={{ fontWeight: 600 }}>You will be over by 1,250 kcal — 62% over your 2,000 kcal goal.</p>
                <p className="meta" style={{ display: 'block', marginTop: 6 }}>What this means: tomorrow's plan will trim ~180 kcal per meal to rebalance the week, and today's activity target rises to 75 minutes.</p>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ border: '1px solid var(--gold)' }}>
            <div className="tag gold">Smart Swap Suggestion</div>
            <h4 style={{ marginTop: 10 }}>Replace Fries with a Garden Salad</h4>
            {[['Calories', '−320 kcal'], ['Fibre', '+5g'], ['Fat', '−18g']].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-soft)', padding: '8px 0', borderBottom: '1px solid var(--line)' }}><span>{l}</span><span style={{ color: '#6fcf97' }}>{v}</span></div>
            ))}
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>New total after swap: <b>{swapped ? '1,180 kcal' : '1,500 kcal'}</b></p>
            {swapped && <span style={{ display: 'inline-block', background: 'rgba(46,125,79,.16)', color: '#6fcf97', fontWeight: 700, fontSize: 13, padding: '8px 16px', borderRadius: 999, marginTop: 10 }}>You'll save 320 kcal</span>}
            <button className="btn btn-accent btn-sm" type="button" disabled={swapped} onClick={() => setSwapped(true)} style={{ width: '100%', justifyContent: 'center', marginTop: 14 }}>{swapped ? 'Swap Applied ✓' : 'Apply Swap'}</button>
          </div>
          <div className="card">
            <h4>Post-Meal</h4>
            <p className="meta" style={{ display: 'block', margin: '8px 0 12px' }}>Upload a photo after you eat — AI re-estimates the portion and updates today's totals automatically.</p>
            <Link className="btn btn-line btn-sm" to="/restaurants/scanner" style={{ width: '100%', justifyContent: 'center' }}>Upload Meal Photo →</Link>
          </div>
          <Link className="btn btn-gold" to="/restaurants/checkout" style={{ width: '100%', justifyContent: 'center' }}>Confirm Order →</Link>
        </div>
      </div>
    </div>
  );
}
