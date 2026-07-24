import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip } from '@/components/ui';
import { useRecipeLibrary, type RecipeCard } from '../library.api';

const FLAG: Record<string, string> = {
  India: '🇮🇳', Indian: '🇮🇳', Thai: '🇹🇭', Thailand: '🇹🇭', China: '🇨🇳', Chinese: '🇨🇳',
  Italy: '🇮🇹', Italian: '🇮🇹', Mexico: '🇲🇽', Mexican: '🇲🇽', Japan: '🇯🇵', Japanese: '🇯🇵',
  Greece: '🇬🇷', Mediterranean: '🇬🇷', Korea: '🇰🇷', Korean: '🇰🇷', American: '🇺🇸', USA: '🇺🇸',
  French: '🇫🇷', France: '🇫🇷', Spanish: '🇪🇸', Spain: '🇪🇸', Continental: '🌍', Global: '🌍',
};
const MEAL_TYPES = ['', 'breakfast', 'lunch', 'dinner', 'snack'];
const DIETS = ['', 'vegetarian', 'vegan', 'eggetarian'];
const SORTS: Array<[string, string]> = [['recent', 'Recently Added'], ['health', 'AI Health Score'], ['rated', 'Highest Rated'], ['name', 'A–Z']];

function healthColor(s: number | null) { return s == null ? 'var(--muted)' : s >= 80 ? '#2e7d32' : s >= 60 ? '#8a6a1f' : '#c0392b'; }

function RecipeTile({ r }: { r: RecipeCard }) {
  return (
    <Card className="lift" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/nutrition/recipes/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9',
          background: r.imageUrl ? `center/cover url(${r.imageUrl})` : 'linear-gradient(135deg, var(--accent-soft), var(--accent))',
          display: 'grid', placeItems: 'center' }}>
          {!r.imageUrl && <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, textAlign: 'center', padding: '0 12px', textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>{r.name}</span>}
          {r.healthScore != null && (
            <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,.92)', color: healthColor(r.healthScore),
              fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 8px' }}>{r.healthScore}</span>
          )}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{FLAG[r.cuisine] ?? '🌍'} {r.cuisine} · {r.minutes} min · {r.difficulty}</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 8 }}>
            <span><strong>{r.kcal}</strong> kcal</span><span className="muted">P {r.protein}g</span><span className="muted">C {r.carbs}g</span><span className="muted">F {r.fat}g</span>
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {r.badges.vegan ? <Chip tone="green">Vegan</Chip> : r.badges.vegetarian ? <Chip tone="green">Veg</Chip> : null}
            {r.badges.diabetes && <Chip tone="accent">Diabetes-friendly</Chip>}
            {r.badges.kidney && <Chip tone="accent">Kidney-friendly</Chip>}
            {r.badges.heart && <Chip tone="accent">Heart-friendly</Chip>}
          </div>
        </div>
      </Link>
    </Card>
  );
}

/**
 * Recipe Library — the complete recipe database as a browsable, searchable
 * library: pick a cuisine, then every recipe in it with filters, rich cards
 * and pagination (server-side search over the full dataset).
 */
export function RecipeLibrary() {
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState('');
  const [diet, setDiet] = useState('');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(1);

  const q = { cuisine: cuisine ?? undefined, search: search || undefined, mealType: mealType || undefined, diet: diet || undefined, sort, page };
  const lib = useRecipeLibrary(q, true);

  // Cuisine grid (landing) — from the page-1 facet.
  if (!cuisine) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div className="eyebrow">Nutrition · Recipes</div>
        <h1 style={{ fontSize: 26 }}>Recipe Library</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>Pick a cuisine to browse every recipe in it — searchable, filterable, thousands deep.</p>
        <form onSubmit={(e) => { e.preventDefault(); if (search) setCuisine(''); }} style={{ marginBottom: 18 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search all recipes…"
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box' }} />
        </form>
        {lib.isLoading && <Spinner label="Loading cuisines…" />}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
          {(lib.data?.cuisines ?? []).map((c) => (
            <button key={c.name} type="button" onClick={() => { setCuisine(c.name); setPage(1); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '16px 16px', border: '1px solid var(--line)',
                borderRadius: 14, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 26 }}>{FLAG[c.name] ?? '🌍'}</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{c.count.toLocaleString()} recipes</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Cuisine library view.
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 60px' }}>
      <button type="button" onClick={() => { setCuisine(null); setSearch(''); setMealType(''); setDiet(''); setPage(1); }}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← All cuisines</button>
      <h1 style={{ fontSize: 24 }}>{FLAG[cuisine] ?? '🌍'} {cuisine || 'Search'} Recipes {lib.data && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {lib.data.total.toLocaleString()}</span>}</h1>

      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 Search recipes…"
        style={{ width: '100%', padding: '11px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box', margin: '10px 0 12px' }} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {MEAL_TYPES.map((m) => <Chip key={m || 'all'} selected={mealType === m} onClick={() => { setMealType(m); setPage(1); }}>{m ? m[0].toUpperCase() + m.slice(1) : 'All meals'}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {DIETS.map((d) => <Chip key={d || 'any'} selected={diet === d} onClick={() => { setDiet(d); setPage(1); }}>{d ? d[0].toUpperCase() + d.slice(1) : 'Any diet'}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {SORTS.map(([v, label]) => <Chip key={v} selected={sort === v} onClick={() => { setSort(v); setPage(1); }}>{label}</Chip>)}
      </div>

      {lib.isLoading && <Spinner label="Loading recipes…" />}
      {lib.data && lib.data.items.length === 0 && <EmptyState title="No recipes match" hint="Try clearing a filter or searching a different term." />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
        {lib.data?.items.map((r) => <RecipeTile key={r.id} r={r} />)}
      </div>

      {lib.data && lib.data.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 22 }}>
          <Button variant="line" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Button>
          <span className="muted" style={{ fontSize: 13 }}>Page {lib.data.page} of {lib.data.pages}</span>
          <Button variant="line" size="sm" disabled={page >= lib.data.pages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      )}
    </div>
  );
}
