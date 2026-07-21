import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useRecipe, useRecipes, useBuildCart } from '../hooks';
import { stepTimerSeconds } from '../components/CookMode';
import { useCookStore } from '../cook.store';
import { DIET_META } from './Recipes';
import { recipeImageUrl } from '../recipeImages';
import type { DietKey } from '../types';

const mmssShort = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 1 ? `${m} min` : `${s} sec`;
};

/** Serving-size presets — the backend returns ONE-plate quantities; we multiply. */
const SERVING_OPTIONS = [
  { count: 1, label: '1 plate' },
  { count: 2, label: '2 plates' },
  { count: 3, label: '3 plates' },
  { count: 4, label: 'Family of 4' },
  { count: 5, label: 'Meal prep · 5 days' },
] as const;
const round1 = (n: number) => Math.round(n * 10) / 10;
const gramLabel = (g: number) => (g > 0 && g < 1 ? '<1' : `${g % 1 === 0 ? g : g.toFixed(1)}`);

/** Recipe detail — macros, ingredients and plate economics. */
export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipe(id);
  const others = useRecipes('everything');
  const startCooking = useCookStore((s) => s.start);
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const [plates, setPlates] = useState(1);

  if (recipe.isLoading) return <Spinner label="Plating up…" />;
  if (recipe.isError || !recipe.data) return <EmptyState title="Recipe not found" hint="It may have been removed." />;

  const r = recipe.data;
  const meta = DIET_META[r.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
  const heroSrc = (r as { imageUrl?: string }).imageUrl ?? recipeImageUrl(r.recipeNo);

  // The backend already scales ingredients to ONE plate; multiply by the chosen
  // serving count. Nutrition, cost and total weight scale the same way, so the
  // list always matches the plate size shown (never full-batch quantities).
  const costPerPlate = r.ingredients.reduce((sum, i) => sum + i.priceInr, 0);
  const scaledIngredients = r.ingredients.map((i) => ({ name: i.name, grams: round1(i.grams * plates), priceInr: Math.round(i.priceInr * plates) }));
  const scaledWeight = round1((r.gramsPerServing ?? 0) * plates);
  const macros = {
    kcal: Math.round(r.kcal * plates), protein: Math.round(r.protein * plates),
    carbs: Math.round(r.carbs * plates), fat: Math.round(r.fat * plates), fiber: Math.round(r.fiber * plates),
  };
  const perPlateLabel = plates === 1 ? 'per plate' : `for ${plates} plate${plates > 1 ? 's' : ''}`;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <Link to="/nutrition/recipes" className="muted" style={{ fontSize: 13 }}>← All recipes</Link>

      {heroSrc && (
        <div style={{ marginTop: 14, aspectRatio: '16 / 9', overflow: 'hidden', borderRadius: 16, background: `linear-gradient(140deg, ${meta.color}18, ${meta.color}38)` }}>
          <img src={heroSrc} alt={r.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div className="card" style={{ marginTop: 14, borderTop: `4px solid ${meta.color}` }}>
        <span
          style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
            color: meta.color, background: meta.soft, borderRadius: 999, padding: '4px 12px',
          }}
        >
          {meta.label}
        </span>
        <h1 style={{ fontSize: 28, margin: '10px 0 4px' }}>{r.name}</h1>
        <div className="muted" style={{ fontSize: 13 }}>
          {r.recipeNo ? <>Recipe No.&nbsp;{r.recipeNo.toLocaleString('en-IN')} · </> : null}{r.country} · {r.minutes} min · {r.gramsPerServing} g per plate · ₹{costPerPlate} per plate
        </div>

        {/* Serving-size selector — rescales ingredients, nutrition, weight and cost. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          {SERVING_OPTIONS.map((o) => (
            <button key={o.count} type="button" onClick={() => setPlates(o.count)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                border: `1.5px solid ${plates === o.count ? 'var(--accent)' : 'var(--line)'}`, background: plates === o.count ? 'var(--accent)' : 'transparent', color: plates === o.count ? '#fff' : 'var(--ink-soft)' }}>
              {o.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, margin: '14px 0 6px' }}>
          {([
            ['Calories', `${macros.kcal}`, 'kcal'],
            ['Protein', `${macros.protein}`, 'g'],
            ['Carbs', `${macros.carbs}`, 'g'],
            ['Fat', `${macros.fat}`, 'g'],
            ['Fibre', `${macros.fiber}`, 'g'],
          ] as const).map(([label, value, unit]) => (
            <div key={label} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600 }}>{value}<span style={{ fontSize: 11 }}> {unit}</span></div>
              <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
            </div>
          ))}
        </div>
        <p className="muted" style={{ fontSize: 11.5, margin: '0 0 18px' }}>Nutrition {perPlateLabel}{plates > 1 ? ` · ${r.gramsPerServing} g each` : ''}.</p>

        {/* Why this is on your plate — written from the user's own blood results */}
        {r.whyForYou && (
          <div style={{ border: `1px solid ${r.whyForYou.personalised ? '#cfe6d6' : 'var(--line)'}`, background: r.whyForYou.personalised ? 'linear-gradient(180deg,#f2faf4,var(--card))' : 'var(--paper)', borderRadius: 14, padding: '16px 18px', margin: '4px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16 }}>{r.whyForYou.personalised ? '🩸' : '🌿'}</span>
              <h2 style={{ fontSize: 16, margin: 0 }}>{r.whyForYou.headline}</h2>
            </div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: '8px 0 0' }}>{r.whyForYou.summary}</p>
            {r.whyForYou.points.length > 0 && (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {r.whyForYou.points.map((p, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ flex: '0 0 auto', fontSize: 11, fontWeight: 700, background: '#e8f5e9', color: '#2e7d32', borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap' }}>{p.label}</span>
                    <span style={{ fontSize: 13, lineHeight: 1.55 }}>{p.text}</span>
                  </div>
                ))}
              </div>
            )}
            {r.whyForYou.cites.length > 0 && (
              <p className="muted" style={{ fontSize: 10.5, marginTop: 12, lineHeight: 1.5 }}>
                Evidence: {r.whyForYou.cites.map((c) => c.label).join(' · ')}
              </p>
            )}
          </div>
        )}

        {/* Complete your plate — sides sized to the individual's calorie need */}
        {r.sides && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', margin: '4px 0 20px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 16, margin: 0 }}>🍽️ Complete your plate</h2>
              {r.sides.items.length > 0 && (
                <span className="muted" style={{ fontSize: 12 }}>Plate total ≈ <strong style={{ color: 'var(--ink)' }}>{r.sides.plateKcal} kcal</strong> · target {r.sides.targetKcal}</span>
              )}
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 0', lineHeight: 1.55 }}>{r.sides.note}</p>
            {r.sides.items.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 10, padding: '8px 12px' }}>
                  {r.name} · {r.kcal} kcal
                </span>
                {r.sides.items.map((s) => (
                  <span key={s.name} style={{ fontSize: 13, fontWeight: 600, border: '1.5px solid var(--line)', borderRadius: 10, padding: '8px 12px' }}>
                    + {s.qty} {s.unit === 'piece' && s.qty > 1 ? 'rotis' : s.unit} {s.name.replace(/ \(.*\)/, '')} <span className="muted" style={{ fontWeight: 400 }}>· {s.kcal} kcal</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <h2 style={{ fontSize: 17, margin: 0 }}>Ingredients</h2>
          <span className="muted" style={{ fontSize: 12 }}>{perPlateLabel} · ≈ {scaledWeight} g total</span>
        </div>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {scaledIngredients.map((ing, i) => (
            <div
              key={ing.name}
              style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13.5,
                borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: i % 2 ? 'var(--paper)' : 'transparent',
              }}
            >
              <span>{ing.name}</span>
              <span className="muted">{gramLabel(ing.grams)} g{ing.priceInr > 0 ? ` · ₹${ing.priceInr}` : ''}</span>
            </div>
          ))}
        </div>

        {r.method && r.method.length > 0 && (
          <>
            <h2 style={{ fontSize: 17, margin: '22px 0 10px' }}>Method</h2>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
              Tap “Start cooking” below and Together City walks you through each step, reads it aloud, and runs a timer whenever a step needs one.
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
              {r.method.map((step, i) => {
                // Show the SAME duration the guided session will time (backend
                // cookSteps), falling back to parsing the text only when absent —
                // so the badge here and the in-session timer can never disagree.
                const secs = r.cookSteps?.[i]?.durationSec ?? stepTimerSeconds(step);
                return (
                  <li key={i} style={{ marginBottom: 6 }}>
                    {step}
                    {secs > 0 && (
                      <span style={{ marginLeft: 8, fontSize: 11.5, fontWeight: 700, color: meta.color, background: meta.soft, borderRadius: 999, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                        ⏱ {mmssShort(secs)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}

        <p className="muted" style={{ fontSize: 12.5, marginTop: 16 }}>
          ₹{costPerPlate} estimated grocery cost per plate{plates > 1 ? ` · ₹${costPerPlate * plates} for ${plates} plates` : ''}.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {r.method && r.method.length > 0 && <Button variant="accent" size="sm" onClick={() => startCooking({ name: r.name, ingredients: scaledIngredients, method: r.method, cookSteps: r.cookSteps })}>👨‍🍳 Start cooking</Button>}
          <Button variant="line" size="sm" disabled={buildCart.isPending}
            onClick={() => buildCart.mutate({ recipeIds: [r.id] }, { onSuccess: () => navigate('/nutrition/grocery') })}>
            {buildCart.isPending ? 'Adding…' : '🛒 Generate grocery list →'}
          </Button>
          <Link to="/nutrition/dietitian"><Button variant="line" size="sm">💬 Discuss with a nutritionist</Button></Link>
          <Link to="/nutrition/weekly"><Button variant="line" size="sm">Add via Weekly Planner</Button></Link>
        </div>
      </div>

      {/* You might also like */}
      {(() => {
        const recs = (others.data ?? []).filter((x) => x.id !== r.id).slice(0, 3);
        if (!recs.length) return null;
        return (
          <div style={{ marginTop: 22 }}>
            <h2 style={{ fontSize: 17, marginBottom: 10 }}>You might also like</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14 }}>
              {recs.map((x) => {
                const m = DIET_META[x.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
                return (
                  <Link key={x.id} to={`/nutrition/recipes/${x.id}`} className="card" style={{ display: 'block', borderTop: `4px solid ${m.color}` }}>
                    <h3 style={{ fontSize: 15, marginBottom: 4 }}>{x.name}</h3>
                    <div className="muted" style={{ fontSize: 12 }}>{x.country} · {x.kcal} kcal · {x.minutes} min</div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
