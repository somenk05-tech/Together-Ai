import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { AiSuggestions } from '@/components/AiSuggestions';
import { useRecipes } from '../hooks';
import type { DietKey } from '../types';

/** Diet colour identity — ported from the vanilla site (TCPLAN.dietOf). */
export const DIET_META: Record<Exclude<DietKey, 'everything'>, { label: string; color: string; soft: string }> = {
  veg: { label: 'Veg', color: '#2e7d32', soft: '#e8f5e9' },
  nonveg: { label: 'Non-veg', color: '#c62828', soft: '#ffebee' },
  pesc: { label: 'Fish', color: '#0277bd', soft: '#e1f5fe' },
  egg: { label: 'Egg', color: '#f9a825', soft: '#fff8e1' },
  vegan: { label: 'Vegan', color: '#1b5e20', soft: '#e0f2e9' },
  jain: { label: 'Jain', color: '#66bb6a', soft: '#f1f8e9' },
};

const TABS: { key: DietKey; label: string }[] = [
  { key: 'everything', label: 'All' },
  { key: 'veg', label: 'Veg' },
  { key: 'nonveg', label: 'Non-veg' },
  { key: 'pesc', label: 'Fish' },
  { key: 'egg', label: 'Egg' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'jain', label: 'Jain' },
];

const INGREDIENT_CHIPS = ['Paneer', 'Spinach', 'Chicken', 'Oats', 'Chickpeas', 'Rice', 'Yogurt', 'Mushroom'];

/** Recipes — the world database, diet-colour-coded like the vanilla planners. */
export function Recipes() {
  const [diet, setDiet] = useState<DietKey>('everything');
  const [query, setQuery] = useState('');
  const recipes = useRecipes(diet);

  const q = query.trim().toLowerCase();
  const shown = (recipes.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.country.toLowerCase().includes(q));

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 10</div>
      <h1 style={{ fontSize: 26 }}>Recipes 🍲</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Search by the ingredients you have, or browse the entire Together City world database —
        <strong> 12,976 recipes across 42 countries</strong>. Every recipe carries ingredients, steps and full nutrition.
      </p>

      <AiSuggestions kind="recipes" />

      {/* Search by ingredient / name */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>By ingredients</div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by ingredient, dish or cuisine…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INGREDIENT_CHIPS.map((ing) => (
            <button key={ing} type="button" onClick={() => setQuery(ing)}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                border: `1.5px solid ${query === ing ? 'var(--accent)' : 'var(--line)'}`, background: query === ing ? 'var(--accent)' : 'transparent', color: query === ing ? '#fff' : 'var(--ink-soft)' }}>
              {ing}
            </button>
          ))}
          {query && <button type="button" onClick={() => setQuery('')} style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>Clear</button>}
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Tip: the more you list, the more precisely we can rank close matches — partial matches still show, just lower down.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => {
          const meta = t.key !== 'everything' ? DIET_META[t.key as Exclude<DietKey, 'everything'>] : null;
          const active = diet === t.key;
          return (
            <button
              key={t.key} type="button" onClick={() => setDiet(t.key)}
              style={{
                cursor: 'pointer', borderRadius: 999, padding: '7px 16px', fontSize: 12.5, fontFamily: 'inherit', fontWeight: 600,
                border: `1.5px solid ${meta ? meta.color : 'var(--line)'}`,
                background: active ? (meta ? meta.color : 'var(--accent)') : (meta ? meta.soft : 'transparent'),
                color: active ? '#fff' : meta ? meta.color : 'var(--ink-soft)',
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {recipes.isLoading && <Spinner label="Opening the cookbook…" />}
      {recipes.isError && <EmptyState title="Couldn't load recipes" hint="Start the backend and reload." />}
      {recipes.data && recipes.data.length === 0 && (
        <EmptyState icon="🍽️" title="No recipes for this diet yet" />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {shown.map((r) => {
          const meta = DIET_META[r.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
          return (
            <Link key={r.id} to={`/nutrition/recipes/${r.id}`} style={{ display: 'block' }}>
              <article
                className="card"
                style={{ borderTop: `4px solid ${meta.color}`, height: '100%', transition: 'transform .12s', position: 'relative' }}
              >
                <span
                  style={{
                    position: 'absolute', top: 12, right: 12, fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em',
                    textTransform: 'uppercase', color: meta.color, background: meta.soft, borderRadius: 999, padding: '3px 10px',
                  }}
                >
                  {meta.label}
                </span>
                <h3 style={{ fontSize: 16.5, marginBottom: 4, paddingRight: 64 }}>{r.name}</h3>
                <div className="muted" style={{ fontSize: 12 }}>{r.country} · {r.minutes} min · {r.gramsPerServing} g/plate</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 12, fontSize: 12.5 }}>
                  <span><strong>{r.kcal}</strong> kcal</span>
                  <span><strong>{r.protein}g</strong> protein</span>
                  <span><strong>{r.carbs}g</strong> carbs</span>
                  <span><strong>{r.fiber}g</strong> fibre</span>
                </div>
              </article>
            </Link>
          );
        })}
      </div>

      <div style={{ textAlign: 'center', marginTop: 22 }}>
        <Link to="/nutrition/daily" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>Go to Today’s Meal Plan →</Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 14, textAlign: 'center' }}>
        Personalised for you · Expert guidance · Quality you can trust · Better every day
      </p>
    </div>
  );
}
