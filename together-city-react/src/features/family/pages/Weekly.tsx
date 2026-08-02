import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Button, Spinner, EmptyState, Chip } from '@/components/ui';
import { DayTabs } from '@/features/nutrition/components/DayTabs';
import { GroceryPlanner } from '@/features/nutrition/components/GroceryPlanner';
import { ComposedMealCard } from '@/features/nutrition/components/ComposedMealCard';
import { ProfileIncomplete } from '@/features/nutrition/components/ProfileIncomplete';
import { PlanModeToggle } from '@/features/nutrition/components/PlanModeToggle';
import { useComposedPlan, useRenewPlan, type PlanMode } from '@/features/nutrition/composed.api';
import { useRecipes, useBuildCart } from '@/features/nutrition/hooks';
import { useFamily, headcount, MEMBERS } from '../members';
import { FamilySnacks } from '../components/FamilySnacks';
import { HouseholdPlanNotice } from '../components/HouseholdPlanNotice';
import { FamilyPortions } from '../components/FamilyPortions';
import { planDates, weekdayFull } from '@/features/nutrition/planDates';

const chipStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
  margin: '0 0 6px', display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  background: '#e7f3ec', color: '#2e7d4f',
};

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
  const [dayIndex, setDayIndex] = useState(0);
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
  const navigate = useNavigate();
  const recipes = useRecipes();
  const { state } = useFamily();
  const N = headcount(state);

  if (plan.isLoading) return <Spinner label="Building your family plan…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🗓️" title="Couldn't load your plan" hint="Reload the page to try again." />;
  }
  if (plan.data.needsProfile) return <ProfileIncomplete missing={[{ key: 'profile', label: 'Food Preference Profile' }]} />;

  const week = plan.data;
  const days = week.days ?? [];
  if (!days.length) return <EmptyState icon="🗓️" title="No plan yet" hint="Save your Nutrition preferences and the household plan appears here." />;

  const clamped = Math.min(dayIndex, days.length - 1);
  const day = days[clamped];
  const dates = planDates(week.planStartDate, days.length);
  const last = clamped === days.length - 1;
  // Snacks are personalised per member, so they're rendered by FamilySnacks
  // rather than as part of the shared plate.
  const mains = day.meals.filter((m) => m.slot !== 's');

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 02"
        title="Weekly Meal Planner"
        sub="The household's plan, composed from every member's needs — refresh or skip any meal." />

      <HouseholdPlanNotice people={N} />

      <PlanModeToggle mode={mode} onChange={setMode} busy={plan.isFetching} />

      <div style={{ display: 'flex', gap: 6, margin: '18px 0 4px' }}>
        {(['plan', 'grocery'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === 'plan' ? 'Meal Plan' : 'Grocery List'}</Chip>
        ))}
      </div>

      {tab === 'grocery' && <GroceryPlanner mode="family" />}

      {tab === 'plan' && (
      <div style={{ display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: 28, alignItems: 'start', marginTop: 22 }} className="tc-dashgrid">
        <div>
          <DayTabs days={dates.map(weekdayFull)} current={clamped} onSelect={setDayIndex} />

          <section className="card" style={{ padding: '0 20px 20px', borderRadius: 20, marginBottom: 20 }}>
            <div style={{ margin: '0 -20px 16px', padding: '13px 20px', background: 'var(--accent-soft)', borderRadius: '20px 20px 0 0', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 19 }}>
                <Link to="/family/daily" style={{ color: 'var(--ink)' }}>{weekdayFull(dates[clamped])}</Link>
              </h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14, alignItems: 'start' }}>
              {mains.map((m) => (
                <div key={m.slot}>
                  <span style={chipStyle}>Family · cook together</span>
                  <ComposedMealCard meal={m} dayIndex={clamped} people={N} readOnly={week.readOnly} />
                </div>
              ))}
              <FamilySnacks recipes={recipes.data ?? []} family={state} dayIndex={clamped} />
            </div>
          </section>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)' }}>
            <Button variant="line" disabled={clamped === 0} onClick={() => setDayIndex((i) => Math.max(0, i - 1))}>← Previous</Button>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>{weekdayFull(dates[clamped])} · Day {clamped + 1} of {days.length}</span>
            {last
              ? <Link to="/family/grocery"><Button variant="accent">🛒 Add to cart</Button></Link>
              : <Button variant="accent" onClick={() => setDayIndex((i) => i + 1)}>Next →</Button>}
          </div>

          <div style={{ margin: '24px 0', padding: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="accent" disabled={buildCart.isPending}
              onClick={() => buildCart.mutate({ mode: 'family', people: N }, { onSuccess: () => navigate('/family/grocery') })}>
              {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list'}
            </Button>
            {!week.readOnly && (
              <Button variant="line" disabled={renew.isPending} onClick={() => renew.mutate({})}>
                {renew.isPending ? 'Refreshing…' : 'Start a fresh plan'}
              </Button>
            )}
            <Link to="/family/daily"><Button variant="line">View Member Updates →</Button></Link>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 'calc(var(--header-h) + 24px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <FamilyPortions dayIndex={clamped} />
          <div className="card">
            <h4>Family</h4>
            <div className="av-strip" style={{ marginTop: 12 }}>
              {MEMBERS.map((m) => <div key={m.id} className="av">{m.initial}</div>)}
            </div>
            <p className="meta" style={{ display: 'block', marginTop: 10 }}>Cooking for {N} · shared mains + personal snacks</p>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 10, lineHeight: 1.5 }}>
              Per-member nutrition targets and daily summaries live on each member's individual plan — the family plan is the shared cooking view.
            </p>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
