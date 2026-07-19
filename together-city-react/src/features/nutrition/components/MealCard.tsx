import { Link } from 'react-router-dom';
import type { Meal } from '../types';
import { Button } from '@/components/ui';

const LABEL: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };
const DIET_COLOR: Record<string, string> = { veg: '#1e8449', nonveg: '#c0392b', pesc: '#2f8fce', egg: '#b9770e', vegan: '#0f5132', jain: '#7cb342', everything: '#8a8a80' };

/** Ported recipe meal card — diet colour, per-serving g/plate, recipe/refresh/skip. */
export function MealCard({ meal, onSwap, onSkip }: { meal: Meal; onSwap: () => void; onSkip: () => void }) {
  const { recipe: r, slot, skipped } = meal;
  const color = DIET_COLOR[r.diet] ?? DIET_COLOR.everything;
  return (
    <div className="card lift" style={{ padding: 0, overflow: 'hidden', borderRadius: 16, opacity: skipped ? 0.55 : 1 }}>
      <div style={{ position: 'relative', aspectRatio: '16 / 10', display: 'flex', alignItems: 'flex-end', background: `linear-gradient(140deg,${color}22,${color}44)` }}>
        <span style={{ position: 'absolute', top: 10, left: 12, background: 'rgba(20,20,18,.72)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999 }}>🍽️ {r.gramsPerServing} g/plate</span>
        <span style={{ fontFamily: 'var(--serif)', fontSize: 15, padding: '12px 16px', lineHeight: 1.25 }}>{r.name}</span>
      </div>
      <div style={{ padding: '14px 16px 16px' }}>
        <span className="tag" style={{ background: `${color}1a`, color }}>{r.diet === 'nonveg' ? 'NON-VEG' : r.diet.toUpperCase()}</span>
        <p className="muted" style={{ margin: '8px 0 4px', fontSize: 12 }}>{LABEL[slot]} · {r.country} · {r.minutes} min{r.recipeNo ? ` · No. ${r.recipeNo.toLocaleString('en-IN')}` : ''}</p>
        <span style={{ fontWeight: 700 }}>{r.kcal} kcal</span>
        <span className="muted" style={{ fontSize: 11.5 }}> · {r.gramsPerServing} g/plate</span>
        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          <Link to={`/nutrition/recipes/${r.id}`} className="btn btn-accent btn-sm">Recipe</Link>
          <Button size="sm" variant="line" onClick={onSwap}>Refresh</Button>
          <Button size="sm" variant="line" onClick={onSkip}>{skipped ? 'Add back' : 'Skip'}</Button>
        </div>
      </div>
    </div>
  );
}
