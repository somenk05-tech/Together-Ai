import type { DaySummary, NutritionTargets } from '../types';

const MICRO: Array<[string, string]> = [
  ['fe', 'Iron'], ['ca', 'Calcium'], ['mg', 'Magnesium'], ['zn', 'Zinc'], ['va', 'Vit A'],
  ['vc', 'Vit C'], ['vd', 'Vit D'], ['ve', 'Vit E'], ['b12', 'B12'], ['fiber', 'Fibre'],
];

/** One nutrient row — Consumed vs Target vs Remaining, with a progress bar. */
function NutrientRow({ label, consumed, target, unit }: { label: string; consumed: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0;
  const remaining = Math.round(target - consumed);
  const over = consumed > target;
  const col = over ? '#c0392b' : pct >= 80 ? 'var(--accent)' : '#b08d3e';
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">
          <b style={{ color: 'var(--ink)' }}>{consumed.toLocaleString('en-IN')}</b> / {target.toLocaleString('en-IN')} {unit}
          <span style={{ color: over ? '#c0392b' : 'var(--muted)', marginLeft: 8 }}>
            {over ? `over ${Math.abs(remaining).toLocaleString('en-IN')}` : `${remaining.toLocaleString('en-IN')} left`}
          </span>
        </span>
      </div>
      <span style={{ display: 'block', height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: col }} />
      </span>
    </div>
  );
}

/** Daily Nutrition Overview — Target vs Consumed vs Remaining for every macro. */
export function DailySummary({ day, summary, targets }: { day: string; summary: DaySummary; targets?: NutritionTargets }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h4 style={{ marginBottom: 4 }}>Daily Nutrition Overview — {day}</h4>
        <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>Consumed vs your personalised target</p>
        {targets ? (
          <>
            <NutrientRow label="Calories" consumed={summary.kcal} target={targets.kcal} unit="kcal" />
            <NutrientRow label="Protein" consumed={summary.protein} target={targets.protein} unit="g" />
            <NutrientRow label="Carbs" consumed={summary.carbs} target={targets.carb} unit="g" />
            <NutrientRow label="Fat" consumed={summary.fat} target={targets.fat} unit="g" />
            <NutrientRow label="Fibre" consumed={summary.fiber} target={targets.fiber} unit="g" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
              <span className="muted">Food cost</span><span style={{ fontWeight: 600 }}>₹{summary.cost}</span>
            </div>
            {targets.adjustments && targets.adjustments.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--paper)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Targets adjusted for you</div>
                {targets.adjustments.map((a, i) => (
                  <p key={i} className="muted" style={{ fontSize: 11.5, margin: '2px 0', lineHeight: 1.45 }}>• {a}</p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>{summary.kcal.toLocaleString('en-IN')} kcal · P {summary.protein}g · C {summary.carbs}g · F {summary.fat}g</p>
        )}
      </div>
      <div className="card">
        <h4 style={{ marginBottom: 10 }}>Micronutrient Coverage</h4>
        {MICRO.map(([k, label]) => {
          const pct = summary.coverage[k] ?? 0;
          const col = pct >= 85 ? 'var(--accent)' : pct >= 55 ? '#b08d3e' : '#b0503e';
          return (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0', fontSize: 12 }}>
              <span style={{ width: 76, color: 'var(--ink-soft)' }}>{label}</span>
              <span style={{ flex: 1, height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: col }} />
              </span>
              <span style={{ width: 32, textAlign: 'right', fontWeight: 600 }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
