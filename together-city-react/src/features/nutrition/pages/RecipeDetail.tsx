import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { useRecipe } from '../hooks';
import { DIET_META } from './Recipes';
import type { DietKey } from '../types';

/** Recipe detail — macros, ingredients and plate economics. */
export function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const recipe = useRecipe(id);

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

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <Link to="/nutrition/weekly"><Button variant="accent" size="sm">Add via Weekly Planner</Button></Link>
          <Link to="/nutrition/grocery"><Button variant="line" size="sm">Grocery Store</Button></Link>
        </div>
      </div>
    </div>
  );
}
