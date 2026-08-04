import { Button, Spinner } from '@/components/ui';
import { VegMark } from './VegMark';
import type { OwnDay, OwnPlan } from '../composed.api';

/**
 * THE DAYS A CITIZEN BUILT, PRINTED ON THE SAME PRESS AS THE ONE THE ENGINE
 * BUILDS.
 *
 * "Create Your Own Meal Plan" used to end in a sticky bar counting picks and a
 * button that turned them into a grocery list — so the page named for building
 * a meal plan produced everything except one. This is the plan: the dishes they
 * chose, in their courses, set with the Weekly Meal Planner's own markup —
 * `press-sheet`, `press-hero`, `press-stats`, `press-course`, `press-grid`,
 * `press-aside`, `press-foot`. Not a lookalike built out of inline styles: the
 * same classes, so the two days cannot drift apart when the press is retouched.
 *
 * IT KEEPS EVERY DAY THEY SETTLED. Locking used to make a day disappear from
 * the page — the plan moved to tomorrow and yesterday's work was somewhere
 * else, or nowhere. A locked day stays here, on its date, exactly as it was
 * printed, because a plan you cannot look at afterwards is a receipt for a
 * decision rather than a plan.
 *
 * IT DOES NOT TOP THE DAY UP. The totals are the honest sum of what they put on
 * it, and the figures say how that compares to their prescription. A hand-built
 * day that quietly gets corrected is not hand-built, and a number that has been
 * helped is worse than one that is short and says so. Where the engine's page
 * prints a percentage of target, this one prints it only if a target exists —
 * a citizen with no prescription on file gets the number and no verdict.
 */

const round = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—';
const grams = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}g` : '—';

const dateOf = (iso: string) => new Date(`${iso}T00:00:00`);
const weekday = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', { weekday: 'long' });
const longDate = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'long', year: 'numeric',
});

type Targets = OwnPlan['targets'];

/** One built day, set as a printed page. */
function DaySheet({ day, targets, busy, onRemove, onLock, onUnlock }: {
  day: OwnDay;
  targets: Targets;
  busy: boolean;
  onRemove: (day: number, recipeId: string) => void;
  onLock: (day: number) => void;
  onUnlock: (day: number) => void;
}) {
  const t = day.totals;
  const target = targets ?? undefined;
  // A percentage against a target we do not have is a made-up number, so the
  // whole `press-pc` line is absent rather than showing 0% or 100%.
  const pc = (v: number, of?: number | null) =>
    typeof of === 'number' && of > 0 ? `${Math.min(999, Math.round((v / of) * 100))}%` : null;
  const kcalPc = pc(t.kcal, target?.kcal);
  const share = (g: number, perGram: number) =>
    t.kcal > 0 ? `${Math.round((g * perGram / t.kcal) * 100)}%` : null;
  const capped = (v: string | null) => (v ? `${Math.min(100, parseInt(v, 10))}%` : null);

  const dishes = day.meals.reduce((n, m) => n + m.components.length, 0);
  const note = day.locked
    ? 'Locked. Its ingredients are on your grocery list, and anything you add now starts the next day.'
    : `${dishes} dish${dishes === 1 ? '' : 'es'}, chosen by you.`;

  const bar = (label: string, value: string, width: string | null) => (
    <div className="press-bar">
      <span className="press-lab">{label}</span>
      <span className="press-track">{width ? <i style={{ width }} /> : null}</span>
      <span className="press-val">{value}</span>
    </div>
  );

  return (
    <div data-press style={{ padding: '26px 0 8px' }}>
      <div className="press-sheet">

        <header className="press-hero">
          <div className="press-hero-row">
            <div>
              <h1 className="press-day">{weekday(day.dayISO)}</h1>
              {/* THE DATE IS THE RECORD. A settled day is filed under the day it
                  is for, not "day 3" — which is the only label that still means
                  something a week later. */}
              <div className="press-date">{day.locked ? `Locked · ${longDate(day.dayISO)}` : longDate(day.dayISO)}</div>
            </div>
            <p className="press-quote">{note}</p>
          </div>
          <dl className="press-stats">
            <div>
              <dt>Daily calories</dt><dd>{round(t.kcal)}<small>kcal</small></dd>
              {kcalPc && <span className="press-pc">{kcalPc} of target</span>}
            </div>
            <div>
              <dt>Protein</dt><dd>{round(t.protein)}<small>g</small></dd>
              {share(t.protein, 4) && <span className="press-pc">{share(t.protein, 4)}</span>}
            </div>
            <div>
              <dt>Carbohydrate</dt><dd>{round(t.carbs)}<small>g</small></dd>
              {share(t.carbs, 4) && <span className="press-pc">{share(t.carbs, 4)}</span>}
            </div>
            <div>
              <dt>Fat</dt><dd>{round(t.fat)}<small>g</small></dd>
              {share(t.fat, 9) && <span className="press-pc">{share(t.fat, 9)}</span>}
            </div>
            <div>
              <dt>Fibre</dt><dd>{round(t.fiber)}<small>g</small></dd>
              {pc(t.fiber, target?.fiber) && <span className="press-pc">{pc(t.fiber, target?.fiber)}</span>}
            </div>
          </dl>
        </header>

        <main>
          {day.meals.map((m) => (
            <section className="press-course" key={m.slot}>
              <div className="press-course-head">
                <h2>{m.label}</h2>
                <span className="press-kcal">{round(m.totals.kcal)}<small>kcal</small></span>
              </div>
              <div className="press-grid">
                <div className="press-colhead">
                  <span>Dish</span><span>Kcal</span><span>P</span><span>C</span><span>F</span><span />
                </div>
                {m.components.map((c) => (
                  <div className="press-dish" key={c.recipeId + c.role}>
                    <div className="press-name-cell">
                      <div className="press-name">
                        <VegMark diet={c.diet} size={14} />
                        <span>{c.name}</span>
                      </div>
                      {c.role && <div className="press-desc">{c.role}</div>}
                    </div>
                    <div className="press-v">{round(c.kcal)}</div>
                    <div className="press-v dim">{grams(c.protein)}</div>
                    <div className="press-v dim">{grams(c.carbs)}</div>
                    <div className="press-v dim">{grams(c.fat)}</div>
                    <div className="press-acts">
                      {/* A locked day has no controls at all — the grocery list
                          has already been written from it, and a dish that can
                          leave the day but not the basket is a lie either way. */}
                      {!day.locked && (
                        <button type="button" disabled={busy}
                          aria-label={`Remove ${c.name} from this day`}
                          onClick={() => onRemove(day.dayIndex, c.recipeId)}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </main>

        <aside className="press-aside">
          <section>
            <h3>Nutrition summary</h3>
            {bar('Calories', round(t.kcal), capped(kcalPc))}
            {bar('Protein', grams(t.protein), capped(share(t.protein, 4)))}
            {bar('Carbs', grams(t.carbs), capped(share(t.carbs, 4)))}
            {bar('Fat', grams(t.fat), capped(share(t.fat, 9)))}
            {bar('Fibre', grams(t.fiber), capped(pc(t.fiber, target?.fiber)))}
            {!kcalPc && (
              <p className="press-desc" style={{ marginTop: 14 }}>
                No daily target on file yet, so these are your totals and nothing else. Fill in
                Meal settings and this column starts comparing.
              </p>
            )}
          </section>

          <section>
            <h3>This day</h3>
            {day.locked ? (
              <>
                <p className="press-note">Locked.</p>
                <p className="press-desc" style={{ marginTop: 10 }}>
                  Its ingredients are on your grocery list, and the next dish you add starts the
                  following day. Unlocking leaves the grocery list as it is.
                </p>
                <div style={{ marginTop: 14 }}>
                  <Button variant="line" size="sm" disabled={busy} onClick={() => onUnlock(day.dayIndex)}>
                    {busy ? 'Working…' : 'Unlock this day'}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="press-desc" style={{ margin: 0 }}>
                  Locking fixes the day, adds its ingredients to your grocery list, and moves the
                  next dish you add to tomorrow.
                </p>
                <div style={{ marginTop: 14 }}>
                  <Button variant="accent" size="sm" disabled={busy} onClick={() => onLock(day.dayIndex)}>
                    {busy ? 'Working…' : 'Lock this day & add to grocery list'}
                  </Button>
                </div>
              </>
            )}
          </section>
        </aside>

        <footer className="press-foot">
          <div><dt>Total calories</dt><dd>{round(t.kcal)}</dd></div>
          <div><dt>Protein</dt><dd>{grams(t.protein)}</dd></div>
          <div><dt>Carbs</dt><dd>{grams(t.carbs)}</dd></div>
          <div><dt>Fat</dt><dd>{grams(t.fat)}</dd></div>
          <div><dt>Fibre</dt><dd>{grams(t.fiber)}</dd></div>
        </footer>
      </div>
    </div>
  );
}

export function OwnDayView({ plan, loading, failed, onRetry, onRemove, onLock, onUnlock, busy }: {
  plan?: OwnPlan;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onRemove: (day: number, recipeId: string) => void;
  onLock: (day: number) => void;
  onUnlock: (day: number) => void;
  busy: boolean;
}) {
  if (loading) return <div style={{ padding: 24 }}><Spinner label="Opening your plan…" /></div>;

  // A plan that cannot be read must not render as a plan with nothing in it —
  // "you have added nothing" and "we could not look" are different sentences.
  if (failed || !plan) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>We couldn’t open your plan</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px', lineHeight: 1.6 }}>
          Nothing has been lost — anything you added is still there. This is only the reading of it.
        </p>
        <Button variant="line" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    );
  }

  const open = plan.days.find((d) => d.dayIndex === plan.targetDay);
  // Every day they have settled, oldest first — a plan reads forward.
  const settled = plan.days
    .filter((d) => d.locked && d.dayIndex !== plan.targetDay)
    .sort((a, b) => a.dayIndex - b.dayIndex);

  const sheet = (day: OwnDay) => (
    <DaySheet key={day.dayIndex} day={day} targets={plan.targets} busy={busy}
      onRemove={onRemove} onLock={onLock} onUnlock={onUnlock} />
  );

  return (
    <div style={{ marginBottom: 26 }}>
      {open && open.meals.length ? sheet(open) : (
        <div data-press style={{ padding: '26px 0 8px' }}>
          <header className="press-hero" style={{ marginBottom: 0 }}>
            <div className="press-hero-row">
              <div>
                <h1 className="press-day">{open ? weekday(open.dayISO) : 'Today'}</h1>
                <div className="press-date">{open ? longDate(open.dayISO) : 'Nothing on it yet'}</div>
              </div>
              <p className="press-quote">
                Nothing on it yet. Add a dish below and it lands here, in the course it belongs to.
              </p>
            </div>
            <p className="press-desc" style={{ marginTop: 22 }}>
              When the day looks right, lock it — its ingredients join your grocery list and the
              next dish you add starts the following day.
            </p>
          </header>
        </div>
      )}

      {settled.length > 0 && (
        <section style={{ marginTop: 30 }}>
          <div className="wall-rule" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <span>Days you have locked</span>
            <span>{settled.length} saved</span>
          </div>
          {settled.map(sheet)}
        </section>
      )}
    </div>
  );
}
