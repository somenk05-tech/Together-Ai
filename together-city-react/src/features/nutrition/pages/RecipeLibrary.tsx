import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip } from '@/components/ui';
import { LABELS } from '@/config/labels';
import { useDayRecipes, useBuildYourDay, nowHHMM, type DayRecipe, type ProteinFix } from '../day.api';
import { useAddFoodToOwnPlan, useAddToOwnPlan, useLockOwnDay, useOwnPlan, useRemoveFromOwnPlan, useSetOwnPeople, useUnlockOwnDay, type OwnFoodInput } from '../composed.api';
import { OwnDayView } from '../components/OwnDayView';
import { VegMark } from '../components/VegMark';
import { AdviceList, DayLines, DayTargetHead, EatNow } from '../components/DayLoop';
import { AddFoodSheet, type FoodMode } from '../components/AddFoodSheet';

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

/** The clock, once a minute — the loop's "now" for today. */
function useNow(): string {
  const [now, setNow] = useState(() => nowHHMM());
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const MEAL_TYPES: Array<[string, string]> = [['', 'Any course'], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['snack', 'Snack'], ['dinner', 'Dinner']];
const INGREDIENT_CHIPS = ['Eggs', 'Chicken', 'Rice', 'Spinach', 'Paneer', 'Oats', 'Chickpeas', 'Yogurt', 'Mushroom'];
const FOOD_MODES: Array<{ mode: FoodMode; label: string; sub: string }> = [
  { mode: 'cooked', label: 'Food I cooked', sub: 'Say what it was — we estimate' },
  { mode: 'restaurant', label: 'Restaurant / outside food', sub: 'Name the dish and the place' },
  { mode: 'packaged', label: 'Packaged food', sub: 'The pack and how much' },
  { mode: 'quick', label: 'Quick add', sub: 'Just the numbers' },
];

function RecipeTile({ r, picked, onPick, busy }: { r: DayRecipe; picked: boolean; onPick: () => void; busy: boolean }) {
  const scaled = r.fit.portionPct < 100;
  return (
    <Card className="lift byd-tile" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', outline: picked ? '2px solid var(--accent)' : undefined }}>
      <Link to={`/nutrition/recipes/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--accent-soft), var(--accent))',
          display: 'grid', placeItems: 'center' }}>
          {r.imageUrl
            ? <img src={r.imageUrl} alt={r.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ color: 'var(--on-accent)', fontWeight: 700, fontSize: 14, textAlign: 'center', padding: '0 12px', textShadow: '0 1px 6px rgba(0,0,0,.35)' }}>{r.name}</span>}
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.22)' }}><VegMark diet={r.diet} size={15} /></span>
          {!r.fit.fits && (
            <span className="byd-tile-flag">Over what's left today</span>
          )}
        </div>
        <div style={{ padding: '12px 14px 54px' }}>
          <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, marginBottom: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>{r.cuisine} · {r.minutes} min</div>
          {/* THE PORTION THAT FITS, NOT THE STANDARD SERVING. A database recipe
              is a serving; what the tile prints is the amount of it that fits
              what is left of the day, and the numbers are at that amount. */}
          <div style={{ display: 'flex', gap: 10, fontSize: 12, marginBottom: 4, flexWrap: 'wrap' }}>
            <span><strong>{r.fit.kcal}</strong> kcal</span><span className="muted">P {r.fit.protein}g</span><span className="muted">Fibre {r.fit.fiber}g</span>
          </div>
          <div className="byd-tile-portion">
            Your portion · <b>{r.fit.grams} g</b>{scaled ? <span> · {r.fit.portionPct}% of a serving ({r.kcal} kcal)</span> : null}
          </div>
        </div>
      </Link>
      {/* Picking a recipe must not open it. */}
      <button
        type="button"
        aria-pressed={picked}
        disabled={busy}
        aria-label={picked ? `Remove ${r.name} from your day` : `Add ${r.name} to your day at ${r.fit.grams} g`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onPick(); }}
        style={{
          position: 'absolute', left: 8, bottom: 8, minHeight: 44, minWidth: 44, cursor: 'pointer',
          border: `1.5px solid ${picked ? 'var(--accent)' : 'var(--line)'}`, borderRadius: 'var(--r-full)',
          background: picked ? 'var(--accent)' : 'var(--card)', color: picked ? 'var(--on-accent)' : 'var(--ink-soft)',
          fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '0 14px',
        }}
      >
        {picked ? '✓ On your day' : '+ Add to today'}
      </button>
    </Card>
  );
}

/**
 * BUILD YOUR DAY — Step 03 of the Private Nutritionist.
 *
 * Owner, 18 Sep: the saved Food Preference Profile is the source of truth; the
 * citizen enters this page and immediately sees a database already filtered
 * for them; the day's food decides what is still needed; what is still needed
 * decides what is recommended next. Nothing is asked twice.
 *
 * The page, top to bottom: the target (what the day is measured against),
 * the day being built (the printed sheet, unchanged), the reading and the
 * advice (what the numbers mean, with fixes computed), what to eat now (three
 * plates, at the portion that fits), + Add food (anything eaten that is not a
 * recipe), then the database — searchable, but already filtered and already
 * ranked by what the day still needs.
 */
export function RecipeLibrary() {
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mealType, setMealType] = useState('');
  const [sort, setSort] = useState('fit');
  const [page, setPage] = useState(1);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [cuisineList, setCuisineList] = useState<Array<{ name: string; count: number }>>([]);
  const [food, setFood] = useState<{ mode: FoodMode; prefill?: Partial<Record<'name' | 'qty' | 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber', string>> } | null>(null);
  const now = useNow();

  const own = useOwnPlan();
  const read = useBuildYourDay(now);
  const addDish = useAddToOwnPlan();
  const addFood = useAddFoodToOwnPlan();
  const removeDish = useRemoveFromOwnPlan();
  const lockDay = useLockOwnDay();
  const unlockDay = useUnlockOwnDay();
  const setPeople = useSetOwnPeople();
  const busy = removeDish.isPending || lockDay.isPending || unlockDay.isPending || addDish.isPending || setPeople.isPending || addFood.isPending;

  // What is already on the day being built — the tiles read this so "on your
  // day" is the plan's own answer rather than a second list that can drift.
  const target = own.data?.days.find((d) => d.dayIndex === own.data?.targetDay);
  const picked: Record<string, string> = Object.fromEntries(
    (target?.meals ?? []).flatMap((m) => m.components.map((c) => [c.recipeId, c.name])),
  );

  const togglePick = (r: DayRecipe) => {
    if (picked[r.id]) {
      if (target) removeDish.mutate({ day: target.dayIndex, recipeId: r.id });
    } else {
      addDish.mutate({ recipeId: r.id, ...(r.fit.portionPct < 100 ? { portionPct: r.fit.portionPct } : {}) });
    }
  };
  const addRecommended = useCallback((recipeId: string, portionPct: number) => {
    addDish.mutate({ recipeId, ...(portionPct < 100 ? { portionPct } : {}) });
  }, [addDish]);
  const quickAddFix = useCallback((fix: ProteinFix) => {
    // A quick fix is a food, added at the amount that closes the gap. The
    // numbers are the same reference values the advice printed.
    setFood({ mode: 'quick', prefill: { name: fix.name, qty: fix.amount, kcal: String(fix.kcal), protein: String(fix.proteinG), carbs: '0', fat: '0', fiber: '0' } });
  }, []);
  const submitFood = (f: OwnFoodInput) => {
    addFood.mutate(f, { onSuccess: () => setFood(null) });
  };

  const addIngredient = (raw: string) => {
    const v = raw.trim().toLowerCase();
    if (v && !ingredients.includes(v)) { setIngredients([...ingredients, v]); setPage(1); }
  };
  const removeIngredient = (v: string) => { setIngredients(ingredients.filter((x) => x !== v)); setPage(1); };

  /**
   * ONE SEARCH BOX ON THE PAGE. It matches a recipe's NAME or its INGREDIENTS,
   * so typing paneer finds dishes made with paneer. The chip row beneath is a
   * different question — "this is what is in my kitchen", an AND — and a row
   * of taps is the honest shape for it.
   */
  const universalSearch = (
    <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      id="byd-search"
      placeholder="🔍 Search any dish or ingredient — palak paneer, oats, chicken…"
      aria-label="Search recipes by dish or ingredient"
      style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card)', boxSizing: 'border-box' }} />
  );

  /** The chips for "what do you have" — a filter, not a search. */
  const ingredientPicker = (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>What do you have? · Cook from what you have</div>
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
              + {ing}
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
   * THE PLAN, AT THE TOP OF THE PAGE THAT BUILDS IT — the printed day sheet,
   * first on both views, in the same four courses as the Weekly Meal Planner.
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
      busy={busy}
    />
  );

  /**
   * THE LOOP, UNDER THE SHEET: the target, the reading, the advice, what to
   * eat now, and the four doors of + Add food. All from one read.
   */
  const loop = read.data ? (
    <>
      <DayTargetHead t={read.data.target} />
      <DayLines lines={read.data.lines} next={read.data.next} priorities={read.data.priorities} />
      <AdviceList advice={read.data.advice} onQuickAdd={quickAddFix} busy={busy} />
      <EatNow read={read.data} onAdd={addRecommended} busy={busy} />
      <section className="byd-addfood" aria-labelledby="byd-add-h">
        <div className="byd-eyebrow" id="byd-add-h">+ Add food</div>
        <p className="byd-muted">Anything you actually eat counts — the day cannot balance itself if it only knows about recipes.</p>
        <div className="byd-doors">
          <button type="button" className="byd-door" onClick={() => document.getElementById('byd-search')?.focus()}>
            <b>Recipe from Together City</b><span>Search the database below — already filtered for you</span>
          </button>
          {FOOD_MODES.map((m) => (
            <button type="button" className="byd-door" key={m.mode} onClick={() => setFood({ mode: m.mode })}>
              <b>{m.label}</b><span>{m.sub}</span>
            </button>
          ))}
        </div>
      </section>
    </>
  ) : read.isError ? (
    <div className="card" style={{ marginBottom: 22 }}>
      <h3 style={{ margin: 0, fontSize: 16 }}>We couldn’t read your day</h3>
      <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>The target and the recommendations come from the same read — try again.</p>
      <Button variant="line" size="sm" onClick={() => void read.refetch()}>Try again</Button>
    </div>
  ) : <Spinner label="Reading your profile…" />;

  // Debounce only the value that feeds the query key.
  const debouncedSearch = useDebouncedValue(search, 350);
  const q = useMemo(() => ({
    cuisine: cuisine ?? undefined, search: debouncedSearch || undefined, mealType: mealType || undefined,
    sort, page, now,
    ingredients: ingredients.length ? ingredients.join(',') : undefined,
  }), [cuisine, debouncedSearch, mealType, sort, page, now, ingredients]);
  const lib = useDayRecipes(q, true);

  useEffect(() => {
    const facet = lib.data?.cuisines;
    if (facet && facet.length) setCuisineList(facet);
  }, [lib.data?.cuisines]);

  /** The cuisine index, at the foot — over the ELIGIBLE list, so it says what this citizen can open. */
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
      <EmptyState title="Couldn't load recipes" hint="Something went wrong reaching the recipe database. Check your connection and try again." />
      <Button variant="line" size="sm" onClick={() => void lib.refetch()}>Try again</Button>
    </div>
  );

  const poolNote = lib.data && (
    <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
      {lib.data.pool.eligible.toLocaleString('en-IN')} recipes fit your profile
      {lib.data.pool.hidden > 0 ? ` · ${lib.data.pool.hidden.toLocaleString('en-IN')} held back by your allergies, diet and exclusions` : ''}
      {sort === 'fit' ? ` · ranked for your ${lib.data.slot === 'b' ? 'breakfast' : lib.data.slot === 'l' ? 'lunch' : lib.data.slot === 'es' ? 'evening' : 'dinner'} and what you still need` : ''}
      {lib.isFetching && !lib.isLoading ? ' · updating…' : ''}
    </p>
  );

  const pager = !lib.isError && lib.data && lib.data.pages > 1 && (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 22 }}>
      <Button variant="line" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Button>
      <span className="muted" style={{ fontSize: 13 }}>Page {lib.data.page} of {lib.data.pages}</span>
      <Button variant="line" size="sm" disabled={page >= lib.data.pages} onClick={() => setPage((p) => p + 1)}>Next →</Button>
    </div>
  );

  const filters = (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {MEAL_TYPES.map(([v, label]) => <Chip key={v || 'all'} selected={mealType === v} onClick={() => { setMealType(v); setPage(1); }}>{label}</Chip>)}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chip selected={sort === 'fit'} onClick={() => { setSort('fit'); setPage(1); }}>Best for you now</Chip>
        <Chip selected={sort === 'name'} onClick={() => { setSort('name'); setPage(1); }}>A–Z</Chip>
      </div>
    </>
  );

  const sheet = (
    <AddFoodSheet open={food !== null} mode={food?.mode ?? 'quick'} prefill={food?.prefill ?? null}
      defaultSlot={read.data?.nextSlot.slot ?? 'd'} onClose={() => setFood(null)} onSubmit={submitFood} busy={addFood.isPending} />
  );

  // Landing: the loop, then the database for you. Naming an ingredient or a
  // cuisine goes straight to results.
  if (cuisine === null && ingredients.length === 0) {
    return (
      <div className="byd">
        <div className="eyebrow">Nutrition · Build your day</div>
        <h1 style={{ fontSize: 26 }}>{LABELS.createYourOwnMealPlan}</h1>
        <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px' }}>
          Your saved profile decides what you see; what you eat decides what comes next. Lock the day — the ingredients go to your grocery list.
          Your own dishes live under <Link to="/nutrition/saved">Saved recipes</Link>.
        </p>

        {buildBar}
        {loop}

        <div className="wall-rule" style={{ marginTop: 26 }}><span>Recipes for you</span><span>{lib.data ? `${lib.data.total.toLocaleString('en-IN')} eligible` : ''}</span></div>
        <form onSubmit={(e) => { e.preventDefault(); if (search) setCuisine(''); }} style={{ margin: '12px 0 12px' }}>
          {universalSearch}
        </form>
        {ingredientPicker}
        {filters}
        {poolNote}
        {lib.isLoading && <Spinner label="Filtering the database for you…" />}
        {lib.isError && !lib.isLoading && errorState}
        {!lib.isError && lib.data && lib.data.items.length === 0 && (
          <EmptyState title="No recipes match" hint="Try clearing a filter or searching a different term." />
        )}
        {!lib.isError && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
            {lib.data?.items.map((r) => <RecipeTile key={r.id} r={r} picked={Boolean(picked[r.id])} onPick={() => togglePick(r)} busy={busy} />)}
          </div>
        )}
        {pager}
        {cuisineIndex}
        {sheet}
      </div>
    );
  }

  // Cuisine / search / ingredient view.
  return (
    <div className="byd">
      <button type="button" onClick={() => { setCuisine(null); setSearch(''); setMealType(''); setIngredients([]); setPage(1); }}
        style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '4px 12px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', marginBottom: 12 }}>← Build your day</button>
      <h1 style={{ fontSize: 24 }}>{cuisine || (ingredients.length ? 'Matching' : 'Search')} Recipes {lib.data && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {lib.data.total.toLocaleString()}</span>}
        {lib.isFetching && !lib.isLoading && <span className="muted" style={{ fontSize: 12.5, fontWeight: 400, marginLeft: 8 }}>Updating…</span>}</h1>

      {buildBar}
      {read.data && <DayLines lines={read.data.lines} next={read.data.next} priorities={read.data.priorities} />}

      <div style={{ margin: '10px 0 12px' }}>{universalSearch}</div>
      {filters}
      {ingredientPicker}
      {poolNote}

      {lib.isLoading && <Spinner label="Loading recipes…" />}
      {lib.isError && !lib.isLoading && errorState}
      {!lib.isError && lib.data && lib.data.items.length === 0 && (
        <EmptyState
          title="No recipes match"
          hint={ingredients.length > 1
            ? 'Nothing that fits your profile uses all of those together — try removing one ingredient.'
            : 'Nothing that fits your profile matches — try clearing a filter or searching a different term.'}
        />
      )}
      {!lib.isError && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
          {lib.data?.items.map((r) => <RecipeTile key={r.id} r={r} picked={Boolean(picked[r.id])} onPick={() => togglePick(r)} busy={busy} />)}
        </div>
      )}
      {pager}
      {cuisineIndex}
      {sheet}
    </div>
  );
}
