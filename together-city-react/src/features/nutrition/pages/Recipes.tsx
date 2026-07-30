import { useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { AiSuggestions } from '@/components/AiSuggestions';
import { useRecipes, useSearchRecipes, useBuildCart } from '../hooks';
import { recipeImageUrl } from '../recipeImages';
import { ShareToChat } from '@/features/chat/share';
import type { ShareCard } from '@/types';
import type { DietKey, Recipe } from '../types';

/** Diet colour identity — ported from the vanilla site (TCPLAN.dietOf). */
export const DIET_META: Record<Exclude<DietKey, 'everything'>, { label: string; color: string; soft: string; icon: string }> = {
  veg: { label: 'Veg', color: '#2e7d32', soft: '#e8f5e9', icon: '🥗' },
  nonveg: { label: 'Non-veg', color: '#c62828', soft: '#ffebee', icon: '🍖' },
  pesc: { label: 'Fish', color: '#0277bd', soft: '#e1f5fe', icon: '🐟' },
  egg: { label: 'Egg', color: '#f9a825', soft: '#fff8e1', icon: '🍳' },
  vegan: { label: 'Vegan', color: '#1b5e20', soft: '#e0f2e9', icon: '🌱' },
  jain: { label: 'Jain', color: '#66bb6a', soft: '#f1f8e9', icon: '🍲' },
};

const GRADE_COLOR: Record<string, string> = { A: '#2e7d4f', B: '#5a9e3f', C: '#b0803a', D: '#c0733a', E: '#b0503e' };

/** Recipe browse card — leads with a 16:9 dish photo. Until the photo exists it
 *  shows a diet-tinted placeholder (food icon + "photo coming soon") so the card
 *  is already laid out for the images that are on the way. */
function RecipeCard({ r }: { r: Recipe }) {
  const [imgOk, setImgOk] = useState(true);
  const meta = DIET_META[r.diet as Exclude<DietKey, 'everything'>] ?? DIET_META.veg;
  const imgSrc = r.imageUrl ?? recipeImageUrl(r.recipeNo);
  const hasImg = Boolean(imgSrc) && imgOk;
  const grade = r.healthGrade ? r.healthGrade.toUpperCase() : null;

  return (
    <Link to={`/nutrition/recipes/${r.id}`} style={{ display: 'block', height: '100%' }}>
      <article className="card lift" style={{ padding: 0, overflow: 'hidden', borderRadius: 16, height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* 16:9 photo banner / placeholder */}
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden', background: `linear-gradient(140deg, ${meta.color}18, ${meta.color}38)` }}>
          {hasImg ? (
            <img src={imgSrc} alt={r.name} loading="lazy" onError={() => setImgOk(false)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <span style={{ fontSize: 34, opacity: 0.5, filter: 'grayscale(15%)' }}>{meta.icon}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: meta.color, opacity: 0.65 }}>Photo coming soon</span>
            </div>
          )}
          {/* scrim only over a real photo, for legibility of the name */}
          <div style={{ position: 'absolute', inset: 0, background: hasImg
            ? 'linear-gradient(to top, rgba(18,16,12,.80) 0%, rgba(18,16,12,.20) 44%, rgba(18,16,12,0) 72%)'
            : 'none' }} />

          <span style={{ position: 'absolute', top: 10, left: 10, fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: hasImg ? '#fff' : meta.color, background: hasImg ? 'rgba(20,20,18,.55)' : meta.soft, borderRadius: 999, padding: '3px 10px' }}>
            {meta.label}
          </span>
          {grade && (
            <span title={r.healthPercent ? `Health score ${r.healthPercent}%` : 'Health grade'}
              style={{ position: 'absolute', top: 10, right: 10, width: 23, height: 23, borderRadius: '50%', background: GRADE_COLOR[grade] ?? '#8a8a80', color: '#fff', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.28)' }}>
              {grade}
            </span>
          )}
          {hasImg && (
            <span style={{ position: 'absolute', left: 12, right: 12, bottom: 10, color: '#fff', fontFamily: 'var(--serif)', fontSize: 15.5, lineHeight: 1.22, textShadow: '0 1px 8px rgba(0,0,0,.55)' }}>
              {r.name}
            </span>
          )}
        </div>

        <div style={{ padding: '13px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!hasImg && <h3 style={{ fontSize: 16, marginBottom: 4, lineHeight: 1.25 }}>{r.name}</h3>}
          <div className="muted" style={{ fontSize: 12 }}>
            {r.recipeNo ? <>No.&nbsp;{r.recipeNo.toLocaleString('en-IN')} · </> : null}{r.country} · {r.minutes} min · {r.gramsPerServing} g/plate
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 'auto', paddingTop: 12, fontSize: 12.5 }}>
            <span><strong>{r.kcal}</strong> kcal</span>
            <span><strong>{r.protein}g</strong> protein</span>
            <span><strong>{r.carbs}g</strong> carbs</span>
            <span><strong>{r.fiber}g</strong> fibre</span>
          </div>
          {/* 💬 Send to Chat — don't navigate when sharing. */}
          <div style={{ marginTop: 10 }} onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
            <ShareToChat item={recipeShareCard(r)} label="Send" />
          </div>
        </div>
      </article>
    </Link>
  );
}

/** Rich chat share-card for a recipe. */
function recipeShareCard(r: Recipe): ShareCard {
  return {
    kind: 'recipe', hub: 'Nutrition', title: r.name,
    subtitle: [r.country, `${r.minutes} min`].filter(Boolean).join(' • '),
    image: r.imageUrl ?? recipeImageUrl(r.recipeNo) ?? null,
    meta: [`${r.kcal} kcal`, `${r.protein}g protein`, r.healthGrade ? `Grade ${r.healthGrade.toUpperCase()}` : ''].filter(Boolean),
    deepLink: `/nutrition/recipes/${r.id}`,
  };
}

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

/** Recipes — the world database, with real ingredient search + diet filters. */
export function Recipes() {
  const [diet, setDiet] = useState<DietKey>('everything');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const recipes = useRecipes(diet);
  const search = useSearchRecipes(ingredients, diet);
  const buildCart = useBuildCart();
  const navigate = useNavigate();

  const searching = ingredients.length > 0;
  const shown = searching ? (search.data ?? []) : (recipes.data ?? []);
  const busy = searching ? search.isLoading : recipes.isLoading;

  const addIngredient = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (v && !ingredients.includes(v)) setIngredients([...ingredients, v]);
    setTyped('');
  };
  const removeIngredient = (v: string) => setIngredients(ingredients.filter((x) => x !== v));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addIngredient(typed); }
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="eyebrow">Nutrition Hub · 10</div>
      <h1 style={{ fontSize: 26 }}>Recipes 🍲</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 16px' }}>
        Search by the ingredients you have, or browse the entire Together City world database —
        <strong> 11,254 curated recipes across 40+ cuisines</strong>. Every recipe carries ingredients, steps and full nutrition.
      </p>

      <AiSuggestions kind="recipes" />

      {/* Real ingredient search — matches recipes by the ingredients they contain */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>By ingredients</div>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onKey} placeholder="Type an ingredient and press Enter (e.g. paneer)"
          style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 10 }} />
        {ingredients.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {ingredients.map((ing) => (
              <span key={ing} onClick={() => removeIngredient(ing)} style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '4px 12px' }}>{ing} ×</span>
            ))}
            <button type="button" onClick={() => setIngredients([])} style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 600, fontSize: 12 }}>Clear all</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INGREDIENT_CHIPS.map((ing) => {
            const on = ingredients.includes(ing.toLowerCase());
            return (
              <button key={ing} type="button" onClick={() => (on ? removeIngredient(ing.toLowerCase()) : addIngredient(ing))}
                style={{ cursor: 'pointer', borderRadius: 999, padding: '5px 13px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? '#fff' : 'var(--ink-soft)' }}>
                {ing}
              </button>
            );
          })}
        </div>
        <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
          Tip: the more you list, the more precisely we rank close matches — recipes using more of your ingredients come first.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {TABS.map((t) => {
          const meta = t.key !== 'everything' ? DIET_META[t.key] : null;
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

      {busy && <Spinner label={searching ? 'Matching your ingredients…' : 'Opening the cookbook…'} />}
      {!busy && shown.length === 0 && (
        <EmptyState icon="🍽️" title={searching ? 'No recipes use those ingredients' : 'No recipes for this diet yet'}
          hint={searching ? 'Try fewer or different ingredients.' : undefined} />
      )}
      {searching && shown.length > 0 && (
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>{shown.length} recipes use your ingredients — best matches first.</p>
      )}
      {shown.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <Button variant="accent" size="sm" disabled={buildCart.isPending}
            onClick={() => buildCart.mutate(
              { recipeIds: shown.slice(0, 40).map((r) => r.id) },
              { onSuccess: () => navigate('/nutrition/grocery') },
            )}>
            {buildCart.isPending ? 'Building…' : `🛒 Generate grocery list (${Math.min(shown.length, 40)})`}
          </Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {shown.map((r) => <RecipeCard key={r.id} r={r} />)}
      </div>

      <div style={{ textAlign: 'center', marginTop: 22 }}>
        <Link to="/nutrition/weekly" style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 14 }}>Go to Your Meal Plan →</Link>
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 14, textAlign: 'center' }}>
        Personalised for you · Expert guidance · Quality you can trust · Better every day
      </p>
    </div>
  );
}
