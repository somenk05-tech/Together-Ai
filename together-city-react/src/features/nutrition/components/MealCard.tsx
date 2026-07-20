import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Meal } from '../types';
import { Button } from '@/components/ui';

const LABEL: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };
const DIET_COLOR: Record<string, string> = { veg: '#1e8449', nonveg: '#c0392b', pesc: '#2f8fce', egg: '#b9770e', vegan: '#0f5132', jain: '#7cb342', everything: '#8a8a80' };
const GRADE_COLOR: Record<string, string> = { A: '#2e7d4f', B: '#5a9e3f', C: '#b0803a', D: '#c0733a', E: '#b0503e' };

/** Recipe meal card — 16:9 dish photo banner (falls back to a diet-tinted panel
 *  until the image exists), health grade, per-serving portion, and the plate. */
export function MealCard({ meal, onSwap, onSkip, people = 1 }: { meal: Meal; onSwap: () => void; onSkip: () => void; people?: number }) {
  const { recipe: r, slot, skipped, plate } = meal;
  const [imgOk, setImgOk] = useState(true);
  const color = DIET_COLOR[r.diet] ?? DIET_COLOR.everything;
  const n = Math.max(1, people);
  const grams = r.gramsPerServing * n;
  const portionLabel = n > 1 ? `${grams} g · serves ${n}` : `${grams} g/plate`;
  const mealKcal = (plate ? plate.totals.kcal : r.kcal) * n;
  const hasImg = Boolean(r.imageUrl) && imgOk;
  const grade = r.healthGrade ? r.healthGrade.toUpperCase() : null;

  return (
    <div className="card lift" style={{ padding: 0, overflow: 'hidden', borderRadius: 16, opacity: skipped ? 0.55 : 1 }}>
      {/* 16:9 photo banner */}
      <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: `linear-gradient(140deg,${color}22,${color}44)` }}>
        {hasImg && (
          <img src={r.imageUrl} alt={r.name} loading="lazy" onError={() => setImgOk(false)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
        {/* legibility scrim (stronger over a photo) */}
        <div style={{ position: 'absolute', inset: 0, background: hasImg
          ? 'linear-gradient(to top, rgba(18,16,12,.82) 0%, rgba(18,16,12,.25) 42%, rgba(18,16,12,.05) 70%)'
          : 'linear-gradient(to top, rgba(18,16,12,.10), transparent 55%)' }} />

        <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(20,20,18,.72)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>
          🍽️ {plate ? `Full thali${n > 1 ? ` · serves ${n}` : ''}` : portionLabel}
        </span>
        {grade && (
          <span title={r.healthPercent ? `Health score ${r.healthPercent}%` : 'Health grade'}
            style={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%', background: GRADE_COLOR[grade] ?? '#8a8a80', color: '#fff', fontSize: 12.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.3)' }}>
            {grade}
          </span>
        )}
        <span style={{ position: 'absolute', left: 12, right: 12, bottom: 10, color: hasImg ? '#fff' : 'var(--ink)', fontFamily: 'var(--serif)', fontSize: 15.5, lineHeight: 1.25, textShadow: hasImg ? '0 1px 8px rgba(0,0,0,.55)' : 'none' }}>
          {r.name}
        </span>
      </div>

      <div style={{ padding: '13px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="tag" style={{ background: `${color}1a`, color }}>{r.diet === 'nonveg' ? 'NON-VEG' : r.diet.toUpperCase()}</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{mealKcal} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>kcal</span></span>
        </div>
        <p className="muted" style={{ margin: '7px 0 0', fontSize: 12 }}>
          {LABEL[slot]} · {r.country} · {r.minutes} min{r.recipeNo ? ` · No. ${r.recipeNo.toLocaleString('en-IN')}` : ''}
        </p>

        {plate && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Your plate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {plate.components.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span>{c.icon} {c.name}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.portion}{c.kcal ? ` · ${c.kcal} kcal` : ''}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Protein {plate.totals.protein} g · Carbs {plate.totals.carbs} g · Fat {plate.totals.fat} g · Fibre {plate.totals.fiber} g
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap' }}>
          <Link to={`/nutrition/recipes/${r.id}`} className="btn btn-accent btn-sm">Recipe</Link>
          <Button size="sm" variant="line" onClick={onSwap}>Refresh</Button>
          <Button size="sm" variant="line" onClick={onSkip}>{skipped ? 'Add back' : 'Skip'}</Button>
        </div>
      </div>
    </div>
  );
}
