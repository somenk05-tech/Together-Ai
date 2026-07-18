import { StatCard } from '@/components/ui';
import type { DaySummary, NutritionTargets } from '../types';

const MICRO: Array<[string, string]> = [
  ['fe', 'Iron'], ['ca', 'Calcium'], ['mg', 'Magnesium'], ['zn', 'Zinc'], ['va', 'Vit A'],
  ['vc', 'Vit C'], ['vd', 'Vit D'], ['ve', 'Vit E'], ['b12', 'B12'], ['fiber', 'Fibre'],
];

/** Daily Nutrition Overview — consuming vs optimal, red when over. Ported design. */
export function DailySummary({ day, summary, targets }: { day: string; summary: DaySummary; targets?: NutritionTargets }) {
  const over = targets ? summary.kcal > targets.kcal : false;
  const calColor = over ? '#c0392b' : '#2e7d4f';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h4 style={{ marginBottom: 12 }}>Daily Nutrition Overview — {day}</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="stat" style={{ gridColumn: '1 / -1' }}>
            <div className="lab">Calories · consuming vs optimal</div>
            <div className="val" style={{ fontSize: 22, color: calColor }}>{summary.kcal.toLocaleString('en-IN')} kcal</div>
            {targets && <div className="delta" style={{ color: over ? '#c0392b' : 'var(--muted)' }}>optimal ~{targets.kcal.toLocaleString('en-IN')} kcal · {over ? `over by ${(summary.kcal - targets.kcal).toLocaleString('en-IN')}` : 'on track ✓'}</div>}
          </div>
          <StatCard label="Protein" value={`${summary.protein}g`} />
          <StatCard label="Carbs" value={`${summary.carbs}g`} />
          <StatCard label="Fats" value={`${summary.fat}g`} />
          <StatCard label="Fibre" value={`${summary.fiber}g`} />
          <StatCard label="Food cost" value={`₹${summary.cost}`} />
          {targets && <StatCard label="Daily protein target" value={`${targets.protein}g`} />}
        </div>
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
