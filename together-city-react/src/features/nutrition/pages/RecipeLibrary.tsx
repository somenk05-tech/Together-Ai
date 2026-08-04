import { useEffect, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip } from '@/components/ui';
import { LABELS } from '@/config/labels';
import { useRecipeLibrary, type RecipeCard } from '../library.api';
import { useAddToOwnPlan, useLockOwnDay, useOwnPlan, useRemoveFromOwnPlan, useUnlockOwnDay } from '../composed.api';
import { OwnDayView } from '../components/OwnDayView';
import { VegMark } from '../components/VegMark';
import { OwnRecipes } from '../components/OwnRecipes';

/** Debounce a fast-changing value (e.g. a search box) so it only settles after
 *  the user pauses — keeps the input responsive while throttling query-key churn. */
function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const MEAL_TYPES = ['', 'breakfast', 'lunch', 'dinner', 'snack'];
const DIETS = ['', 'vegetarian', 'vegan', 'eggetarian'];
const SORTS: Array<[string, string]> = [['recent', 'Recently Added'], ['health', 'AI Health Score'], ['name', 'A–Z']];
const INGREDIENT_CHIPS = ['Paneer', 'Spinach', 'Chicken', 'Oats', 'Chickpeas', 'Rice', 'Yogurt', 'Mushroom'];

function healthColor(s: number | null) { return s == null ? 'var(--muted)' : s >= 80 ? 'var(--ok-ink)' : s >= 60 ? 'var(--warn-ink)' : 'var(--danger-ink)'; }

function RecipeTile({ r, picked, onPick }: { r: RecipeCard; picked: boolean; onPick: () => void }) {
  return (
    <Card className="lift" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', outline: picked ? '2px solid var(--accent)' : undefined }}>
      <Link to={`/nutrition/recipes/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--accent-soft), var(--accent))',
          display: 'grid', placeItems: 'center' }}>
          {r.imageUrl
            ? <img src={r.imageUrl} alt={r.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, textAlign: 'center', padding: '0 12px', textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>{r.name}</span>}
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.22)' }}><VegMark diet={r.diet} size={15} /></span>
          {r.healthScore != null && (
            <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(255,255,255,.92)', color: healthColor(r.healthScore),
              fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '3px 8px' }}>{r.healthScore}</span>
          )}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{r.cuisine} · {r.minutes} min · {r.difficulty}</div>
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
      {/* Picking a recipe must not open it. */}
      <button
        type="button"
        aria-pressed={picked}
        aria-label={picked ? `Remove ${r.name} from your list` : `Add ${r.name} to your list`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(); }}
        style={{
          position: 'absolute', left: 8, bottom: 8, minHeight: 44, minWidth: 44, cursor: 'pointer',
          border: `1.5px solid ${picked ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 999,
          background: picked ? 'var(--accent)' : 'var(--card)', color: picked ? 'var(--on-accent)' : 'var(--ink-soft)',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '0 14px',
        }}
      >
        {picked ? '✓ Added' : '+ Add'}
      </button>
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
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const own = useOwnPlan();
  const addDish = useAddToOwnPlan();
  const removeDish = useRemoveFromOwnPlan();
  const lockDay = useLockOwnDay();
  const unlockDay = useUnlockOwnDay();
  // What is already on the day being built — the tiles read this so "Added" is
  // the plan's own answer rather than a second list that can drift from it.
  const target = own.data?.days.find((d) => d.dayIndex === own.data?.targetDay);
  const picked: Record<string, string> = Object.fromEntries(
    (target?.meals ?? []).flatMap((m) => m.components.map((c) => [c.recipeId, c.name])),
  );

  /**
   * Add, or take back. There is no local "picked" list any more — the plan on
   * the server is the state, so a tile reading "Added" and a day that does not
   * contain the dish cannot happen. The cost is a round trip per tap; the thing
   * it buys is that the two can never disagree.
   */
  const togglePick = (r: RecipeCard) => {
    if (picked[r.id]) {
      if (target) removeDish.mutate({ day: target.dayIndex, recipeId: r.id });
    } else {
      addDish.mutate({ recipeId: r.id });
    }
  };
  const addIngredient = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (v && !ingredients.includes(v)) { setIngredients([...ingredients, v]); setPage(1); }
    setTyped('');
  };
  const removeIngredient = (v: string) => { setIngredients(ingredients.filter((x) => x !== v)); setPage(1); };
  const onIngredientKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); addIngredient(typed); }
  };

  /** The chips + free-text box for "what's in my kitchen". Rendered on both the
   *  cuisine landing and inside a cuisine, because the question is the same. */
  const ingredientPicker = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Cook from what you have</div>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={onIngredientKey}
        aria-label="Add an ingredient you have"
        placeholder="Type an ingredient and press Enter (e.g. paneer)"
        style={{ width: '100%', boxSizing: 'border-box', padding: '11px 13px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 10 }} />
      {ingredients.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {ingredients.map((ing) => (
            <button key={ing} type="button" onClick={() => removeIngredient(ing)} aria-label={`Remove ${ing}`}
              style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 999, padding: '5px 12px' }}>{ing} ×</button>
          ))}
          <button type="button" onClick={() => { setIngredients([]); setPage(1); }}
            style={{ cursor: 'pointer', border: 'none', background: 'none', color: 'var(--accent-ink)', fontWeight: 600, fontSize: 12, fontFamily: 'inherit' }}>Clear all</button>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {INGREDIENT_CHIPS.map((ing) => {
          const on = ingredients.includes(ing.toLowerCase());
          return (
            <button key={ing} type="button" onClick={() => (on ? removeIngredient(ing.toLowerCase()) : addIngredient(ing))}
              style={{ cursor: 'pointer', borderRadius: 999, padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {ing}
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        Every ingredient you add narrows it further — we only show dishes that use all of them.
      </p>
    </div>
  );

  /**
   * TODAY'S PLAN, ON THE PAGE THAT BUILDS IT.
   *
   * This was a sticky bar counting picks and a button that turned them into a
   * grocery list — so the page called "Create Your Own Meal Plan" produced
   * everything except a meal plan. It shows the day instead, in the same four
   * courses and the same typesetting as the Weekly Meal Planner, because a
   * citizen reading their Tuesday should not have to learn two layouts
   * depending on who chose the food.
   */
  const buildBar = (
    <OwnDayView
      plan={own.data}
      loading={own.isLoading}
      failed={own.isError}
      onRetry={() => void own.refetch()}
      onRemove={(day: number, recipeId: string) => removeDish.mutate({ day, recipeId })}
      onLock={(day: number) => lockDay.mutate({ day })}
      onUnlock={(day: number) => unlockDay.mutate({ day })}
      busy={removeDish.isPending || lockDay.isPending || unlockDay.isPending || addDish.isPending}
    />
  );

  // Debounce only the value that feeds the query key — the input stays fully
  // controlled/responsive, but we fire one request per typing pause, not per key.
  const debouncedSearch = useDebouncedValue(search, 350);
  const q = {
    cuisine: cuisine ?? undefined, search: debouncedSearch || undefined, mealType: mealType || undefined,
    diet: diet || undefined, sort, page,
    ingredients: ingredients.length ? ingredients.join(',') : undefined,
  };
  const lib = useRecipeLibrary(q, true);

  const errorState = (
    <div style={{ textAlign: 'center' }}>
      <EmptyState title="Couldn't load recipes" hint="Something went wrong reaching the recipe library. Check your connection and try again." />
      <Button variant="line" size="sm" onClick={() => void lib.refetch()}>Try again</Button>
    </div>
  );

  // Cuisine grid (landing) — from the page-1 facet. Naming an ingredient is a
  // search, so it goes straight to results rather than making you pick a
  // cuisine first.
  if (cuisine === null && ingredients.length === 0) {
    return (
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '20px 16px 60px' }}>
        <div className="eyebrow">Nutrition</div>
        <h1 style={{ fontSize: 26 }}>{LABELS.createYourOwnMealPlan}</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
          Search by name or by what is in your kitchen, add the dishes you like, and turn them into
          one grocery list. Browse a cuisine for ideas — or add a dish you cook yourself, further
          down this page.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); if (search) setCuisine(''); }} style={{ marginBottom: 18 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search all recipes…" aria-label="Search recipes"
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box' }} />
        </form>
        {ingredientPicker}
        {lib.isLoading && <Spinner label="Loading cuisines…" />}
        {lib.isError && !lib.isLoading && errorState}
        {!lib.isError && lib.isFetching && !lib.isLoading && <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Updating…</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
          {(lib.data?.cuisines ?? []).map((c) => (
            <button key={c.name} type="button" onClick={() => { setCuisine(c.name); setPage(1); }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: '16px 16px', border: '1px solid var(--line)',
                borderRadius: 14, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 12 }}>{c.count.toLocaleString()} recipes</span>
            </button>
          ))}
        </div>

        {/* Adding your own dish used to be a second page. It is the same job as
            everything above it — deciding what you are going to eat — so it now
            happens here, and /nutrition/recipes/own redirects. */}
        <OwnRecipes />
      </div>
    );
  }

  // Cuisine library view.
  return (
    <div style={{ maxWidth: 1120, margin: '0 auto', padding: '20px 16px 60px' }}>
      <button type="button" onClick={() => { setCuisine(null); setSearch(''); setMealType(''); setDiet(''); setIngredients([]); setPage(1); }}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← All cuisines</button>
      <h1 style={{ fontSize: 24 }}>{cuisine || (ingredients.length ? 'Matching' : 'Search')} Recipes {lib.data && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {lib.data.total.toLocaleString()}</span>}
        {lib.isFetching && !lib.isLoading && <span className="muted" style={{ fontSize: 12.5, fontWeight: 400, marginLeft: 8 }}>Updating…</span>}</h1>

      <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="🔍 Search recipes…" aria-label="Search recipes"
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

      {ingredientPicker}

      {lib.isLoading && <Spinner label="Loading recipes…" />}
      {lib.isError && !lib.isLoading && errorState}
      {!lib.isError && lib.data && lib.data.items.length === 0 && (
        <EmptyState
          title="No recipes match"
          hint={ingredients.length > 1
            ? 'Nothing uses all of those together — try removing one ingredient.'
            : 'Try clearing a filter or searching a different term.'}
        />
      )}
      {!lib.isError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
          {lib.data?.items.map((r) => <RecipeTile key={r.id} r={r} picked={Boolean(picked[r.id])} onPick={() => togglePick(r)} />)}
        </div>
      )}

      {!lib.isError && lib.data && lib.data.pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 22 }}>
          <Button variant="line" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Button>
          <span className="muted" style={{ fontSize: 13 }}>Page {lib.data.page} of {lib.data.pages}</span>
          <Button variant="line" size="sm" disabled={page >= lib.data.pages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
        </div>
      )}

      {buildBar}
    </div>
  );
}
