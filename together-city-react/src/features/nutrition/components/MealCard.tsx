import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Meal } from '../types';
import { recipeImageUrl } from '../recipeImages';
import { Button } from '@/components/ui';

const LABEL: Record<string, string> = { b: 'Breakfast', l: 'Lunch', s: 'Snack', d: 'Dinner' };
const DIET_COLOR: Record<string, string> = { veg: '#1e8449', nonveg: '#c0392b', pesc: '#2f8fce', egg: '#b9770e', vegan: '#0f5132', jain: '#7cb342', everything: '#8a8a80' };
const GRADE_COLOR: Record<string, string> = { A: '#2e7d4f', B: '#5a9e3f', C: '#b0803a', D: '#c0733a', E: '#b0503e' };

/** Recipe meal card — 16:9 dish photo banner (falls back to a diet-tinted panel
 *  until the image exists), health grade, per-serving portion, and the plate. */
export function MealCard({ meal, onSwap, onSkip, people = 1, onBack, canGoBack = false }: { meal: Meal; onSwap: () => void; onSkip: () => void; people?: number; onBack?: () => void; canGoBack?: boolean }) {
  const { recipe: r, slot, skipped, plate, portionPct, addons = [] } = meal;
  // Dietitian portion control: the card shows the PORTIONED values (what you
  // actually eat) with the serving size named in plate language. The recipe
  // page keeps per-full-plate values; the base is shown here for reference.
  const tuned = portionPct != null && portionPct !== 100 && !plate;
  const pf = tuned ? portionPct / 100 : 1;
  const PORTION_TEXT: Record<number, string> = {
    50: 'Half plate', 75: '¾ plate', 125: '1¼ plates', 150: '1½ plates',
  };
  const portionText = tuned ? PORTION_TEXT[portionPct] ?? `${Math.round(pf * 100)}% of a plate` : null;
  const baseKcal = tuned ? Math.round(r.kcal / pf) : r.kcal;
  const addonsKcal = addons.reduce((s, a) => s + a.kcal, 0);
  const [imgOk, setImgOk] = useState(true);
  const color = DIET_COLOR[r.diet] ?? DIET_COLOR.everything;
  const n = Math.max(1, people);
  const grams = r.gramsPerServing * n;
  const portionLabel = n > 1 ? `${grams} g · serves ${n}` : `${grams} g/plate`;
  const mealKcal = (plate ? plate.totals.kcal : r.kcal) * n;
  const imgSrc = r.imageUrl ?? recipeImageUrl(r.recipeNo);
  const hasImg = Boolean(imgSrc) && imgOk;
  const grade = r.healthGrade ? r.healthGrade.toUpperCase() : null;

  return (
    <div className="card lift" style={{ padding: 0, overflow: 'hidden', borderRadius: 16, opacity: skipped ? 0.55 : 1 }}>
      {/* 16:9 photo banner */}
      <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: `linear-gradient(140deg,${color}22,${color}44)` }}>
        {hasImg && (
          <img src={imgSrc} alt={r.name} loading="lazy" onError={() => setImgOk(false)}
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
          {portionText && (
            <span title={`Serving size prescribed by the planner. Full plate = ${baseKcal} kcal (recipe page).`}
              style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 8px', whiteSpace: 'nowrap' }}>
              🍽 {portionText}
            </span>
          )}
        </div>
        {tuned && (
          <p className="muted" style={{ margin: '5px 0 0', fontSize: 11 }}>
            Serving: {portionText?.toLowerCase()} · full plate = {baseKcal} kcal (recipe page)
          </p>
        )}
        <p className="muted" style={{ margin: '7px 0 0', fontSize: 12 }}>
          {LABEL[slot]} · {r.country} · {r.minutes} min{r.recipeNo ? ` · No. ${r.recipeNo.toLocaleString('en-IN')}` : ''}
        </p>

        {addons.length > 0 && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Also on your plate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {addons.map((a) => (
                <div key={a.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span>＋ {a.label}</span>
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{a.kcal} kcal</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Meal total: <b style={{ color: 'var(--ink)' }}>{mealKcal + addonsKcal} kcal</b>
            </p>
          </div>
        )}

        {plate && (
          <div style={{ marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Your plate</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {plate.components.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  {c.recipeId ? (
                    <Link to={`/nutrition/recipes/${c.recipeId}`} title="View recipe"
                      style={{ color: 'var(--ink)', textDecoration: 'none', borderBottom: '1px dotted var(--muted)' }}>
                      {c.icon} {c.name}
                    </Link>
                  ) : (
                    <span>{c.icon} {c.name}</span>
                  )}
                  <span className="muted" style={{ whiteSpace: 'nowrap' }}>{c.portion}{c.kcal ? ` · ${c.kcal} kcal` : ''}</span>
                </div>
              ))}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Protein {plate.totals.protein} g · Carbs {plate.totals.carbs} g · Fat {plate.totals.fat} g · Fibre {plate.totals.fiber} g
            </p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 7, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {canGoBack && onBack && (
            <button type="button" onClick={onBack} title="Back to the previous recipe" aria-label="Back to the previous recipe"
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 999, border: '1.5px solid var(--line)', background: 'var(--card)', color: 'var(--ink)', cursor: 'pointer', fontSize: 15, lineHeight: 1, flex: '0 0 auto' }}>
              ↩
            </button>
          )}
          <Link to={`/nutrition/recipes/${r.id}`} className="btn btn-accent btn-sm">Recipe</Link>
          <Button size="sm" variant="line" onClick={onSwap}>Refresh</Button>
          <Button size="sm" variant="line" onClick={onSkip}>{skipped ? 'Add back' : 'Skip'}</Button>
        </div>
      </div>
    </div>
  );
}
