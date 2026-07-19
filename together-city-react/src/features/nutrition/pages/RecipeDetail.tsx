import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useRecipe, useRecipes } from '../hooks';
import { CookMode, stepTimerSeconds } from '../components/CookMode';
import { DIET_META } from './Recipes';
import type { DietKey } from '../types';

const mmssShort = (s: number) => {
  const m = Math.round(s / 60);
  return m >= 1 ? `${m} min` : `${s} sec`;
};

/** Recipe detail — macros, ingredients and plate economics. */
export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipe(id);
  const others = useRecipes('everything');
  const [cooking, setCooking] = useState(false);

  if (recipe.isLoading) return <Spinner label="Plating up…" />;
  if (recipe.isError || !recipe.data) return <EmptyState title="Recipe not found" hint="It may have been removed." />;

  const r = recipe.data;
  const meta = DIET_META[r.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
  const cost = r.ingredients.reduce((sum, i) => sum + i.priceInr, 0);

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}>
      <Link to="/nutrition/recipes" className="muted" style={{ fontSize: 13 }}>← All recipes</Link>

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
          {r.country} · {r.minutes} min · {r.gramsPerServing} g per plate · ₹{cost} per serving
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, margin: '20px 0' }}>
          {([
            ['Calories', `${r.kcal}`, 'kcal'],
            ['Protein', `${r.protein}`, 'g'],
            ['Carbs', `${r.carbs}`, 'g'],
            ['Fat', `${r.fat}`, 'g'],
            ['Fibre', `${r.fiber}`, 'g'],
          ] as const).map(([label, value, unit]) => (
            <div key={label} style={{ background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 8px', textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 600 }}>{value}<span style={{ fontSize: 11 }}> {unit}</span></div>
              <div className="muted" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: 17, marginBottom: 10 }}>Ingredients</h2>
        <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
          {r.ingredients.map((ing, i) => (
            <div
              key={ing.name}
              style={{
                display: 'flex', justifyContent: 'space-between', padding: '10px 14px', fontSize: 13.5,
                borderTop: i === 0 ? 'none' : '1px solid var(--line)', background: i % 2 ? 'var(--paper)' : 'transparent',
              }}
            >
              <span>{ing.name}</span>
              <span className="muted">{ing.grams} g · ₹{ing.priceInr}</span>
            </div>
          ))}
        </div>

        {r.method && r.method.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '22px 0 10px' }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Method</h2>
              <Button variant="accent" size="sm" onClick={() => setCooking(true)}>👨‍🍳 Cook along — guided</Button>
            </div>
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>
              Together City walks you through each step, reads it aloud, and runs a timer whenever a step needs one.
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
              {r.method.map((step, i) => {
                const secs = stepTimerSeconds(step);
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
          ₹{cost} estimated grocery cost per serving.
        </p>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          {r.method && r.method.length > 0 && <Button variant="accent" size="sm" onClick={() => setCooking(true)}>👨‍🍳 Start cooking</Button>}
          <Link to="/nutrition/grocery"><Button variant="line" size="sm">Add ingredients to basket →</Button></Link>
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

      {cooking && r.method && r.method.length > 0 && (
        <CookMode name={r.name} method={r.method} ingredients={r.ingredients} onClose={() => setCooking(false)} />
      )}
    </div>
  );
}
