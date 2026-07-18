import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
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

/** Recipes — the world database, diet-colour-coded like the vanilla planners. */
export function Recipes() {
  const [diet, setDiet] = useState<DietKey>('everything');
  const recipes = useRecipes(diet);

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · Recipes</div>
      <h1 style={{ fontSize: 26 }}>The world recipe database</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Every recipe carries a diet colour identity, full macros and per-plate portions.
      </p>

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
        {recipes.data?.map((r) => {
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
    </div>
  );
}
