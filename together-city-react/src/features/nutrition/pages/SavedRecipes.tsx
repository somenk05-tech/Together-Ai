import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button } from '@/components/ui';
import { useSavedRecipes, useToggleSave } from '../hooks';
import { VegMark } from '../components/VegMark';
import { OwnRecipes } from '../components/OwnRecipes';
import { recipeImageUrl } from '../recipeImages';
import type { Recipe } from '../types';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */
const NONE: never[] = [];

/**
 * THE OTHER HALF OF A BUTTON THAT ALREADY WORKED.
 *
 * Every recipe page has had a Save control since it was built, and
 * `GET /nutrition/saved` has been returning `{ ids, recipes }` the whole time.
 * Only `ids` was ever used — to decide whether the bookmark on the page you
 * were already looking at should be filled in. The `recipes` array was fetched
 * and thrown away on every recipe page, because there was nowhere to show it.
 *
 * So saving worked, and looking at what you had saved did not, and nothing
 * said so. This is the missing page, not a new feature.
 *
 * IT SORTS BY NOTHING CLEVER. The API returns them in the order it returns
 * them; this shows that order and does not invent a "recently saved" it cannot
 * prove — the payload carries no save timestamp, and a list that claims to be
 * chronological while being arbitrary is worse than one that claims nothing.
 * A search box is enough for a list somebody built by hand.
 */

function Tile({ r, onRemove, removing }: { r: Recipe; onRemove: () => void; removing: boolean }) {
  const src = r.imageUrl ?? (r.recipeNo != null ? recipeImageUrl(r.recipeNo) : null);
  return (
    <Card className="lift" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Link to={`/nutrition/recipes/${r.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden',
          background: 'linear-gradient(135deg, var(--accent-soft), var(--accent))' }}>
          {src && <img src={src} alt={r.name} loading="lazy"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)',
            borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.22)' }}>
            <VegMark diet={r.diet} size={15} />
          </span>
        </div>
        <div style={{ padding: '12px 14px 6px' }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, marginBottom: 4,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.name}</div>
          <div className="muted" style={{ fontSize: 12 }}>{r.country} · {r.minutes} min</div>
          <div style={{ display: 'flex', gap: 10, fontSize: 12, marginTop: 6 }}>
            <span><strong>{r.kcal}</strong> kcal</span>
            <span className="muted">P {r.protein}g</span>
            <span className="muted">C {r.carbs}g</span>
            <span className="muted">F {r.fat}g</span>
          </div>
        </div>
      </Link>
      <div style={{ padding: '4px 14px 12px', marginTop: 'auto' }}>
        {/* Unsaving lives on the tile rather than behind the recipe page: a
            list you can only prune by opening each item is a list that grows
            until somebody stops using it. */}
        <Button variant="line" size="sm" disabled={removing} onClick={onRemove}>
          {removing ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </Card>
  );
}

export function SavedRecipes() {
  const saved = useSavedRecipes();
  const toggle = useToggleSave();
  const [q, setQ] = useState('');
  const [pending, setPending] = useState<string | null>(null);

  const recipes = saved.data?.recipes ?? NONE;
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return recipes;
    return recipes.filter((r) =>
      r.name.toLowerCase().includes(term) || (r.country ?? '').toLowerCase().includes(term));
  }, [recipes, q]);

  if (saved.isLoading) return <Spinner label="Fetching what you kept…" />;
  if (saved.isError) {
    return <EmptyState title="Couldn't load your saved recipes"
      hint="Nothing has been lost — this didn't reach us. Try again in a moment." />;
  }

  if (recipes.length === 0) {
    return (
      <div>
        <div className="eyebrow">Nutrition</div>
        <h1 style={{ fontSize: 26, margin: '2px 0 6px' }}>Saved recipes</h1>
        <EmptyState icon="🔖" title="Nothing saved yet"
          hint="Open any recipe and press Save — it lands here, and it is the same list the recipe page reads to decide whether its bookmark is filled in." />
        <div style={{ textAlign: 'center' }}>
          <Link to="/nutrition/recipes"><Button variant="line" size="sm">Browse recipes →</Button></Link>
        </div>
        {/* ALSO ON THE EMPTY PAGE, and that is the whole reason it is written
            twice rather than once below the grid. Adding a dish you cook is now
            only reachable from here, and somebody who has saved nothing yet is
            exactly the person most likely to be adding one. An empty state that
            hides the only way in is a dead end. */}
        <OwnRecipes />
      </div>
    );
  }

  return (
    <div>
      <div className="eyebrow">Nutrition</div>
      <h1 style={{ fontSize: 26, margin: '2px 0 4px' }}>Saved recipes</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '0 0 16px' }}>
        {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} you kept. Open one to cook it,
        add it to a day, or send it to your grocery list.
      </p>

      {/* A search box only once the list is long enough to need one. Below that
          it is a control that costs a row and saves nobody anything. */}
      {recipes.length >= 8 && (
        <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80}
          aria-label="Search your saved recipes" placeholder="Search what you saved"
          style={{ width: '100%', maxWidth: 380, boxSizing: 'border-box', minHeight: 44,
            padding: '10px 12px', border: '1.5px solid var(--line)', borderRadius: 10,
            fontSize: 13.5, fontFamily: 'inherit', background: 'var(--card)', marginBottom: 16 }} />
      )}

      {shown.length === 0 ? (
        <p className="muted" style={{ fontSize: 13.5 }}>Nothing in your saved list matches that.</p>
      ) : (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {shown.map((r) => (
            <Tile key={r.id} r={r}
              removing={pending === r.id}
              onRemove={() => {
                setPending(r.id);
                toggle.mutate({ id: r.id, saved: false }, {
                  // The list is invalidated by the hook; clearing the pending
                  // id here rather than optimistically dropping the tile means
                  // a failed removal leaves the recipe visibly still saved,
                  // which is the truth.
                  onSettled: () => setPending(null),
                });
              }} />
          ))}
        </div>
      )}

      {/* YOUR OWN DISHES ARE ON THE SAME SHELF AS THE ONES YOU KEPT.
          This was a section at the foot of Create Your Own Meal Plan, a page
          whose job is deciding what you will eat this week — and a form for
          entering ingredient weights is not that job. It is the same shelf as
          "the ones you kept": a list of recipes that are yours. */}
      <OwnRecipes />
    </div>
  );
}
