import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip } from '@/components/ui';
import { LABELS } from '@/config/labels';
import { useRecipeLibrary, type RecipeCard } from '../library.api';
import { useAddToOwnPlan, useLockOwnDay, useOwnPlan, useRemoveFromOwnPlan, useSetOwnPeople, useUnlockOwnDay } from '../composed.api';
import { OwnDayView } from '../components/OwnDayView';
import { VegMark } from '../components/VegMark';

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
              fontSize: 11, fontWeight: 800, borderRadius: 'var(--r-full)', padding: '3px 8px' }}>{r.healthScore}</span>
          )}
        </div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</div>
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
          border: `1.5px solid ${picked ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--r-full)',
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
  /**
   * The cuisine index is a page-1 facet, so paginating inside a cuisine returns
   * an empty list. Holding the last non-empty one keeps the footer index from
   * disappearing on page 2 — it is a permanent piece of furniture, not a result.
   */
  const [cuisineList, setCuisineList] = useState<Array<{ name: string; count: number }>>([]);
  const own = useOwnPlan();
  const addDish = useAddToOwnPlan();
  const removeDish = useRemoveFromOwnPlan();
  const lockDay = useLockOwnDay();
  const unlockDay = useUnlockOwnDay();
  const setPeople = useSetOwnPeople();
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
  };
  const removeIngredient = (v: string) => { setIngredients(ingredients.filter((x) => x !== v)); setPage(1); };

  /**
   * ONE SEARCH BOX ON THE PAGE.
   *
   * There were two, stacked: "Search all recipes…" and, directly beneath it,
   * "Type an ingredient and press Enter". Two text fields asking what you want
   * to eat, one above the other, and no way to tell from looking which one
   * "paneer" belonged in.
   *
   * They were never two questions. The library's search already matches a
   * recipe's NAME **or** its INGREDIENTS — `recipeLibrary()` puts both in the
   * same OR — so typing paneer here has always found dishes made with paneer,
   * not merely ones with it in the title. The second box was a second door into
   * a room you were already standing in.
   *
   * What survives of it is the chip row below: naming two ingredients is an
   * AND ("this is what is in my kitchen"), which is a genuinely different
   * question from search's OR, and a row of taps is the honest shape for it.
   */
  const universalSearch = (
    <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      placeholder="🔍 Search any dish or ingredient — palak paneer, oats, chicken…"
      aria-label="Search recipes by dish or ingredient"
      style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box' }} />
  );

  /** The chips for "what's in my kitchen" — a filter, not a search. Rendered on
   *  both the landing and inside a cuisine, because the question is the same. */
  const ingredientPicker = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Cook from what you have</div>
      {ingredients.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {ingredients.map((ing) => (
            <button key={ing} type="button" onClick={() => removeIngredient(ing)} aria-label={`Remove ${ing}`}
              style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--on-accent)', background: 'var(--accent)', borderRadius: 'var(--r-full)', padding: '5px 12px' }}>{ing} ×</button>
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
              style={{ cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 13px', fontSize: 12, fontFamily: 'inherit', fontWeight: 600,
                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--line)'}`, background: on ? 'var(--accent)' : 'transparent', color: on ? 'var(--on-accent)' : 'var(--ink-soft)' }}>
              {ing}
            </button>
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
        Every ingredient you add narrows it further — we only show dishes that use all of them.
        For anything not listed here, type it in the search above.
      </p>
    </div>
  );

  /**
   * THE PLAN, AT THE TOP OF THE PAGE THAT BUILDS IT.
   *
   * This was a sticky bar counting picks and a button that turned them into a
   * grocery list — so the page called "Create Your Own Meal Plan" produced
   * everything except a meal plan. It shows the days instead, in the same four
   * courses and the same typesetting as the Weekly Meal Planner, because a
   * citizen reading their Tuesday should not have to learn two layouts
   * depending on who chose the food.
   *
   * IT IS FIRST ON THE PAGE, on both the cuisine landing and inside a cuisine.
   * It sat under a paginated grid of two hundred recipes, which is the one
   * place somebody looking for the plan they are building will not scroll to —
   * and after locking a day, the confirmation that anything happened was three
   * screens down. What you are making comes before what you might add to it.
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
      onPeople={(n: number) => setPeople.mutate(n)}
      busy={removeDish.isPending || lockDay.isPending || unlockDay.isPending || addDish.isPending || setPeople.isPending}
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

  useEffect(() => {
    const facet = lib.data?.cuisines;
    if (facet && facet.length) setCuisineList(facet);
  }, [lib.data?.cuisines]);

  /**
   * THE CUISINE INDEX, AT THE FOOT OF THE PAGE.
   *
   * This was twenty-two cards in a grid, the first thing under the search box
   * and the tallest thing on the screen — so the page whose job is "decide what
   * you are eating" opened by asking which country you were in. Nobody arrives
   * wanting Norway's one recipe; they arrive wanting dinner, and the search box
   * above answers that in a keystroke.
   *
   * Cuisine is still a real way in, so it keeps a real link — one line of them,
   * at the bottom, where an index belongs. The counts came off: they made the
   * line wrap three deep, and the number reappears in the heading of whichever
   * cuisine you open, which is the only place it changes a decision.
   */
  const cuisineIndex = cuisineList.length > 0 && (
    <div style={{ marginTop: 30, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Browse by cuisine</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', rowGap: 2, fontSize: 13 }}>
        {cuisineList.map((c, i) => (
          <span key={c.name} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
            {i > 0 && <span aria-hidden="true" className="muted" style={{ padding: '0 7px' }}>·</span>}
            <button type="button"
              onClick={() => { setCuisine(c.name); setPage(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: cuisine === c.name ? 700 : 500,
                color: cuisine === c.name ? 'var(--accent-ink)' : 'var(--ink-soft)' }}>
              {c.name}
            </button>
          </span>
        ))}
      </div>
    </div>
  );

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
      <div>
        <div className="eyebrow">Nutrition</div>
        <h1 style={{ fontSize: 26 }}>{LABELS.createYourOwnMealPlan}</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
          Add the dishes you want and they build the day below. Lock a day and its ingredients go
          straight to your grocery list — then the next dish you add starts the day after, which is
          how you fill a month. Say how many people you are cooking for and every quantity on that
          list scales. Browse a cuisine for ideas, or add a dish you cook yourself under{' '}
          <Link to="/nutrition/saved">Saved recipes</Link>.
        </p>

        {buildBar}
        <form onSubmit={(e) => { e.preventDefault(); if (search) setCuisine(''); }} style={{ marginBottom: 18 }}>
          {universalSearch}
        </form>
        {ingredientPicker}
        {lib.isLoading && <Spinner label="Loading recipes…" />}
        {lib.isError && !lib.isLoading && errorState}
        {!lib.isError && lib.isFetching && !lib.isLoading && <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Updating…</p>}

        {cuisineIndex}
      </div>
    );
  }

  // Cuisine library view.
  return (
    <div>
      <button type="button" onClick={() => { setCuisine(null); setSearch(''); setMealType(''); setDiet(''); setIngredients([]); setPage(1); }}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← All cuisines</button>
      <h1 style={{ fontSize: 24 }}>{cuisine || (ingredients.length ? 'Matching' : 'Search')} Recipes {lib.data && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {lib.data.total.toLocaleString()}</span>}
        {lib.isFetching && !lib.isLoading && <span className="muted" style={{ fontSize: 12.5, fontWeight: 400, marginLeft: 8 }}>Updating…</span>}</h1>

      {buildBar}

      <div style={{ margin: '10px 0 12px' }}>{universalSearch}</div>

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

      {cuisineIndex}
    </div>
  );
}
