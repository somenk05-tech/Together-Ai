import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Button, Spinner, EmptyState, Chip } from '@/components/ui';
import { GroceryPlanner } from '@/features/nutrition/components/GroceryPlanner';
import { ProfileIncomplete } from '@/features/nutrition/components/ProfileIncomplete';
import { PlanModeToggle } from '@/features/nutrition/components/PlanModeToggle';
import { PressDay, AboutThisMenu } from '@/features/nutrition/components/PressDay';
import { useComposedPlan, useRenewPlan, type PlanMode } from '@/features/nutrition/composed.api';
import { useRecipes, useBuildCart, useFamilyPortions } from '@/features/nutrition/hooks';
import { useFamily, headcount, MEMBERS } from '../members';
import { FamilySnacks } from '../components/FamilySnacks';
import { HouseholdPlanNotice } from '../components/HouseholdPlanNotice';
import { FamilyPortions } from '../components/FamilyPortions';
import { planDates, planDayOffset, weekdayFull, shortDate } from '@/features/nutrition/planDates';

/**
 * Weekly Meal Planner — Family.
 *
 * Runs on the COMPOSED engine, scoped to the household: the same dishes the
 * individual planner composes, but with every member's allergies, exclusions
 * and conditions applied. That is the same plan the family grocery list shops
 * from, so the food on this page and the ingredients in the basket are now
 * guaranteed to be the same meals — before this, the page read the older stored
 * engine while the basket read the composed one, and the two could disagree.
 *
 * Mains are cooked together; snacks stay personal per member.
 */
export function FamilyWeekly() {
  // null until the citizen picks — the rail then defaults to TODAY, exactly
  // like the individual planner. An index of 0 is the 1st of the month, which
  // by the second week is a morning nobody can cook again.
  const [picked, setPicked] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'plan' | 'grocery'>('plan');
  // The My Preferences / Optimal Health toggle now does something here: both
  // modes are real compositions, which is exactly what the older engine on this
  // page could not offer.
  const [mode, setMode] = useState<PlanMode>('preferred');
  const plan = useComposedPlan(mode, 'household');
  const renew = useRenewPlan();
  // buildCart(mode:'family') routes through the household COMPOSED plan — the
  // same meals this page shows. The older family-cart hook read the stored
  // family plan first, so on a household that still had one it would save a
  // cart for meals nobody was looking at; it was deleted on 2 Aug along with
  // the endpoint call behind it. Its per-member protein-swap merge is the one
  // thing lost, and that belongs on the composed path anyway.
  const buildCart = useBuildCart();
  const portions = useFamilyPortions(0);
  const navigate = useNavigate();
  const recipes = useRecipes();
  const { state } = useFamily();
  const N = headcount(state);
  const people = portions.data?.members.length ?? N;
  const n = (v: number) => Math.round(v).toLocaleString('en-IN');

  // Keep the selected day centred in the rail, the individual planner's touch.
  useEffect(() => {
    const el = railRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [picked, plan.data]);

  if (plan.isLoading) return <Spinner label="Building your family plan…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🗓️" title="Couldn't load your plan" hint="Reload the page to try again." />;
  }
  if (plan.data.needsProfile) return <ProfileIncomplete missing={[{ key: 'profile', label: 'Food Preference Profile' }]} />;

  const week = plan.data;
  const days = week.days ?? [];
  if (!days.length) return <EmptyState icon="🗓️" title="No plan yet" hint="Save your Nutrition preferences and the household plan appears here." />;

  const dates = planDates(week.planStartDate, days.length);
  const todayIdx = Math.min(days.length - 1, planDayOffset(week.planStartDate));
  const clamped = Math.max(todayIdx, Math.min(picked ?? todayIdx, days.length - 1));
  const day = days[clamped];
  const last = clamped === days.length - 1;
  // Snacks are personalised per member, so they're rendered by FamilySnacks
  // rather than as part of the shared plate.
  const mains = day.meals.filter((m) => m.slot !== 's');

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 02"
        title="Weekly Meal Planner"
        sub="The household's plan, composed from every member's needs — refresh or skip any meal." />

      {/* ONE ANSWER TO "WHO IS EATING", because the page was giving two. The
          notice counted `headcount(state)` — the LOCAL family state, which
          tracks members you have disabled on this device — while the portions
          panel a few hundred pixels to its right listed whoever the server
          portioned the day for. On a household with a locally-disabled member
          that reads "cooked together for the whole family (1 person)" directly
          beside a table of two people's plates, and both are printed as fact.

          The sentence now counts what the table counts, because the table is
          the thing on screen next to it. `headcount` remains the fallback for
          the moment before the query settles, and remains what the grocery
          cart is portioned by — if a local disable is meant to change what you
          BUY as well as what you read, that is a separate decision and not one
          a caption should make quietly. */}
      <HouseholdPlanNotice people={portions.data?.members.length ?? N} />

      <PlanModeToggle mode={mode} onChange={setMode} busy={plan.isFetching} />

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 4px' }}>
        {(['plan', 'grocery'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === 'plan' ? 'Meal Plan' : 'Grocery List'}</Chip>
        ))}
      </div>

      {tab === 'grocery' && <GroceryPlanner mode="family" />}

      {tab === 'plan' && (
      <div style={{ marginTop: 22 }}>
          {/* THE RAIL IS THE INDIVIDUAL PLANNER'S: today first, real dates,
              TODAY named, one scrollable row with chevrons, the month as its
              horizon. The weekday-only wrapped tabs said "Sat" thirty-one
              times and never a date — a calendar with no calendar in it. */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 14 }}>
            <button type="button" className="wkrail-key" aria-label="Previous day" disabled={clamped <= todayIdx} onClick={() => setPicked(Math.max(todayIdx, clamped - 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: clamped <= todayIdx ? 'default' : 'pointer', opacity: clamped <= todayIdx ? 0.4 : 1, fontSize: 17 }}>‹</button>
            <div ref={railRef} style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 5, scrollbarWidth: 'none' }}>
              {days.map((_, i) => i).filter((i) => i >= todayIdx).map((i) => {
                const on = i === clamped;
                return (
                  <button key={i} type="button" onClick={() => setPicked(i)} aria-current={on} data-active={on ? 'true' : undefined}
                    style={{ flex: '1 0 auto', minWidth: 84, border: 'none', background: on ? 'var(--accent-soft)' : 'transparent', borderRadius: 11, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: on ? 800 : 700, letterSpacing: '.03em', color: on ? 'var(--accent)' : 'var(--ink-soft)' }}>
                      {i === todayIdx ? 'TODAY' : weekdayFull(dates[i]).toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10.5, marginTop: 2, color: on ? 'var(--accent)' : 'var(--muted)' }}>{shortDate(dates[i])}</div>
                  </button>
                );
              })}
            </div>
            <button type="button" className="wkrail-key" aria-label="Next day" disabled={last} onClick={() => setPicked(Math.min(days.length - 1, clamped + 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: last ? 'default' : 'pointer', opacity: last ? 0.4 : 1, fontSize: 17 }}>›</button>
          </div>

          {/* THE PRINTED DAY — the same sheet the individual planner prints.
              PressDay was extracted FOR this page; "One sheet, two planners"
              deferred the wiring and this is that commit. What differs rides
              the slots: no target percentages (a household has none), the
              action builds the list instead of locking, and under the menu
              sit the per-member portions, because "cooked once, plated to
              each" is what a family day IS. Snacks are per member, so the
              sheet prints the SHARED courses and the snacks follow it. */}
          <PressDay
            d={{ ...day, meals: mains }} date={dates[clamped]} dayIndex={clamped} dayCount={days.length}
            note={`One kitchen for ${people} — every dish below is cooked once and plated to each member's own target, with everyone's allergies, exclusions and conditions already applied to the shared dishes.`}
            head="Cooked once, plated to each."
            readOnly={week.readOnly}
            household={people}
            sign="family nutrition // one kitchen"
            summary={<>
              <div><dt>Calories</dt><dd>{n(day.totals.kcal)}<small>kcal</small></dd></div>
              <div><dt>Protein</dt><dd>{n(day.totals.protein)}<small>g</small></dd></div>
              <div><dt>Carbohydrate</dt><dd>{n(day.totals.carbs)}<small>g</small></dd></div>
              <div><dt>Fat</dt><dd>{n(day.totals.fat)}<small>g</small></dd></div>
              <div><dt>Fibre</dt><dd>{n(day.totals.fiber)}<small>g</small></dd></div>
            </>}
            action={!week.readOnly ? (
              <Button variant="accent" size="sm" disabled={buildCart.isPending}
                onClick={() => buildCart.mutate({ mode: 'family', people: N }, { onSuccess: () => navigate('/family/grocery') })}>
                {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list'}
              </Button>
            ) : undefined}
            aboutLeft={<AboutThisMenu d={day} />}
            aboutRight={
              <div>
                <p className="press-lab">The household</p>
                <div className="av-strip" style={{ marginTop: 10 }}>
                  {MEMBERS.map((m) => <div key={m.id} className="av">{m.initial}</div>)}
                </div>
                <p className="press-desc" style={{ marginTop: 10 }}>
                  Cooking for {people} — shared mains, personal snacks. Per-member targets live on
                  each member's own plan; the plates below are portioned to them.
                </p>
              </div>
            }
            totals={<>
              <div><dt>Calories</dt><dd>{n(day.totals.kcal)}</dd></div>
              <div><dt>Protein</dt><dd>{n(day.totals.protein)}g</dd></div>
              <div><dt>Carbs</dt><dd>{n(day.totals.carbs)}g</dd></div>
              <div><dt>Fat</dt><dd>{n(day.totals.fat)}g</dd></div>
              <div><dt>Fibre</dt><dd>{n(day.totals.fiber)}g</dd></div>
            </>}
            under={
              <div style={{ gridColumn: '1 / -1' }}>
                <p className="press-lab">Personalised portions — cook once, each plate scaled</p>
                <FamilyPortions dayIndex={clamped} bare />
              </div>
            }
          />

          {/* Snacks are one per member, tuned to their health need — they are
              not the shared sheet's courses, so they follow the sheet. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14, margin: '20px 0' }}>
            <FamilySnacks recipes={recipes.data ?? []} family={state} dayIndex={clamped} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)' }}>
            <Button variant="line" disabled={clamped <= todayIdx} onClick={() => setPicked(Math.max(todayIdx, clamped - 1))}>← Previous</Button>
            {/* The date, not "Day 14 of 31" — an index into the month is a
                number nobody's kitchen runs on. */}
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>{weekdayFull(dates[clamped])} · {shortDate(dates[clamped])}</span>
            {last
              ? <Link to="/family/grocery"><Button variant="accent">🛒 Add to cart</Button></Link>
              : <Button variant="accent" onClick={() => setPicked(clamped + 1)}>Next →</Button>}
          </div>

          <div style={{ margin: '24px 0', padding: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {/* The grocery action moved ONTO the sheet — it is the sheet's one
                control, the individual planner's own rule for the lock. */}
            {!week.readOnly && (
              <Button variant="line" disabled={renew.isPending} onClick={() => renew.mutate({})}>
                {renew.isPending ? 'Refreshing…' : 'Start a fresh plan'}
              </Button>
            )}
            <Link to="/family/daily"><Button variant="line">View Member Updates →</Button></Link>
          </div>
      </div>
      )}
    </div>
  );
}
