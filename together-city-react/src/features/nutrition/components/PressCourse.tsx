import { useNavigate, useLocation } from 'react-router-dom';
import {
  useRefreshMeal, useSkipMeal, useRefreshComponent, useSkipComponent,
  type ComposedMeal,
} from '../composed.api';
import { skippedRolesFor } from '../skips';
import { VegMark } from './VegMark';

/**
 * ONE COURSE OF THE PRINTED DAY.
 *
 * The same meal `ComposedMealCard` draws, set as a menu course instead of a
 * card: a serif heading, the course's energy on the right, and one ruled row
 * per dish carrying its name, its numbers and its controls.
 *
 * IT SHARES EVERY HOOK WITH THE CARD. Refresh, Replace and Skip here are
 * `useRefreshComponent` / `useSkipComponent` with the same `{ day, slot, role }`
 * the card sends, and the meal-level pair is `useRefreshMeal` / `useSkipMeal`.
 * Nothing about the plan, the composer or the personalisation engine changes;
 * this is the same data, typeset.
 *
 * NOTHING IN HERE IS A VALUE. Every name, portion, calorie and macro comes from
 * `composedPlan`, which builds a different week for every citizen from their
 * body, bloods, conditions, diet, allergies, goals and history. So the layout
 * has to survive what that produces: a one-dish breakfast and a six-dish thali,
 * a name in Persian and a name in Malayalam, a macro the corpus does not carry.
 * The `—` below is that last case — a missing number is drawn as absent, never
 * as a zero, because a zero is a claim.
 */

const round = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? String(Math.round(n)) : '—';
const grams = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}g` : '—';

export function PressCourse({ meal, dayIndex, readOnly, skips = [] }: {
  meal: ComposedMeal;
  dayIndex: number;
  readOnly?: boolean;
  skips?: string[];
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const refreshMeal = useRefreshMeal();
  const skipMeal = useSkipMeal();
  const refreshComp = useRefreshComponent();
  const skipComp = useSkipComponent();
  const busy = refreshMeal.isPending || skipMeal.isPending
    || refreshComp.isPending || skipComp.isPending;

  // Per-dish controls exist on the composite plates only — the same rule the
  // card has always used. A single-dish breakfast is refreshed as a meal.
  const lineControls = !readOnly && (meal.slot === 'l' || meal.slot === 'd');
  const skippedRoles = skippedRolesFor(skips, dayIndex, meal.slot);

  const openRecipe = (recipeId?: string | null) => {
    if (!recipeId) return;
    navigate(`/nutrition/recipes/${recipeId}`, { state: { from: location.pathname + location.search } });
  };

  // The course total is what will actually be eaten: a skipped dish stays on
  // the page and comes off the number. Showing the composer's untouched total
  // beside a struck-through row is the page disagreeing with itself.
  const eaten = meal.components.filter((c) => !skippedRoles.has(c.role));
  const courseKcal = eaten.reduce((n, c) => n + (Number(c.kcal) || 0), 0);

  return (
    <section className="press-course">
      <div className="press-course-head">
        <h2>{meal.label}</h2>
        <span className="press-kcal">
          {courseKcal.toLocaleString('en-IN')}<small>kcal</small>
        </span>
      </div>

      <div className="press-grid">
        <div className="press-colhead">
          <span>Dish</span><span>Kcal</span><span>P</span><span>C</span><span>F</span><span />
        </div>

        {meal.components.map((c) => {
          const off = skippedRoles.has(c.role);
          return (
            <div className={`press-dish${off ? ' is-off' : ''}`} key={c.recipeId + c.role}>
              <div className="press-name-cell">
                <div className="press-name">
                  {/* EVERY DISH SAYS WHAT IT IS. The mark was already on the
                      recipe library, the recipe page and the old meal card, and
                      the printed day — the surface people actually read their
                      week on — was the one place it never reached. `diet` has
                      always been on the component; nothing here asks the server
                      for anything new. */}
                  <VegMark diet={c.diet} size={14} />
                  <button type="button" className="press-link"
                    onClick={() => openRecipe(c.recipeId)}
                    disabled={!c.recipeId}>
                    {c.name}
                  </button>
                </div>
                {c.role && <div className="press-desc">{c.role}</div>}
              </div>
              <div className="press-v">{round(c.kcal)}</div>
              <div className="press-v dim">{grams(c.protein)}</div>
              <div className="press-v dim">{grams(c.carbs)}</div>
              <div className="press-v dim">{grams(c.fat)}</div>
              <div className="press-acts">
                {lineControls ? (
                  off ? (
                    <button type="button" disabled={busy}
                      onClick={() => skipComp.mutate({ day: dayIndex, slot: meal.slot, role: c.role, skipped: false })}>
                      Restore
                    </button>
                  ) : (
                    <>
                      <button type="button" disabled={busy}
                        title="Swap for another dish of the same type"
                        onClick={() => refreshComp.mutate({ day: dayIndex, slot: meal.slot, role: c.role })}>
                        Refresh
                      </button>
                      <button type="button" disabled={busy}
                        onClick={() => skipComp.mutate({ day: dayIndex, slot: meal.slot, role: c.role, skipped: true })}>
                        Skip
                      </button>
                    </>
                  )
                ) : !readOnly ? (
                  <>
                    <button type="button" disabled={busy}
                      onClick={() => refreshMeal.mutate({ day: dayIndex, slot: meal.slot })}>
                      Refresh
                    </button>
                    <button type="button" disabled={busy}
                      onClick={() => skipMeal.mutate({ day: dayIndex, slot: meal.slot, skipped: true })}>
                      Skip
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
