import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader, Button, Spinner, EmptyState, Chip } from '@/components/ui';
import { ComposedMealCard } from '@/features/nutrition/components/ComposedMealCard';
import { GroceryPlanner } from '@/features/nutrition/components/GroceryPlanner';
import { ProfileIncomplete } from '@/features/nutrition/components/ProfileIncomplete';
import { PlanModeToggle } from '@/features/nutrition/components/PlanModeToggle';
import { useComposedPlan, type PlanMode } from '@/features/nutrition/composed.api';
import { useRecipes } from '@/features/nutrition/hooks';
import { planDates, planDayOffset, weekdayFull } from '@/features/nutrition/planDates';
import { useFamily, headcount } from '../members';
import { FamilySnacks } from '../components/FamilySnacks';
import { FamilyPortions } from '../components/FamilyPortions';

const chipStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
  margin: '0 0 6px', display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  background: '#e7f3ec', color: '#2e7d4f',
};

/**
 * Daily Meal Planner — Family. Today's plate, sliced from the household's
 * composed plan.
 *
 * "Today" is derived from the plan's own anchor date rather than the weekday.
 * The composed plan runs three weeks from the day it was started, so day 0 is
 * planStartDate — the Monday-indexed assumption the older engine relied on
 * would land on the wrong meals here.
 */
export function FamilyDaily() {
  const [tab, setTab] = useState<'plan' | 'grocery'>('plan');
  const [mode, setMode] = useState<PlanMode>('preferred');
  const plan = useComposedPlan(mode, 'household');
  const recipes = useRecipes();
  const navigate = useNavigate();
  const { state } = useFamily();
  const N = headcount(state);

  if (plan.isLoading) return <Spinner label="Plating today…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🍽️" title="Couldn't load today's plate" hint="Reload the page to try again." />;
  }
  if (plan.data.needsProfile) return <ProfileIncomplete missing={[{ key: 'profile', label: 'Food Preference Profile' }]} />;

  const week = plan.data;
  const days = week.days ?? [];
  if (!days.length) {
    return (
      <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 40 }}>🗓️</div>
        <h2 style={{ fontSize: 22, margin: '10px 0 6px' }}>No household plan yet</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Save your Nutrition preferences and the household plan appears here.
        </p>
        <Link to="/family/weekly"><Button variant="accent">Open the weekly planner →</Button></Link>
      </div>
    );
  }

  // Which day of the plan today is — clamped so a plan that has run past its
  // window still shows its last day rather than nothing.
  const dayIndex = Math.max(0, Math.min(days.length - 1, planDayOffset(week.planStartDate)));
  const day = days[dayIndex];
  const date = planDates(week.planStartDate, days.length)[dayIndex];
  const mains = day.meals.filter((m) => m.slot !== 's');

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 03"
        title="Daily Meal Planner"
        sub="Today's plate, dish by dish — shared mains, personal snacks." />

      <PlanModeToggle mode={mode} onChange={setMode} busy={plan.isFetching} />

      <div style={{ display: 'flex', gap: 6, margin: '14px 0 16px' }}>
        {(['plan', 'grocery'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === 'plan' ? 'Meal Plan' : 'Grocery List'}</Chip>
        ))}
      </div>

      {tab === 'grocery' && <GroceryPlanner mode="family" />}

      {tab === 'plan' && (<>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h2>Today's Family Plan · {weekdayFull(date)}</h2>
        <span className="meta">Cooking for {N} {N === 1 ? 'person' : 'people'} · shared mains + personal snacks</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14, alignItems: 'start', marginBottom: 32 }} className="tc-mealgrid">
        {mains.map((m) => (
          <div key={m.slot}>
            <span style={chipStyle}>Family · cook together</span>
            <ComposedMealCard meal={m} dayIndex={dayIndex} people={N} readOnly={week.readOnly} />
          </div>
        ))}
        <FamilySnacks recipes={recipes.data ?? []} family={state} dayIndex={dayIndex} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div className="card">
          <h4>Why this plan works</h4>
          <p className="meta" style={{ display: 'block', margin: '10px 0' }}>
            One household plan for today. The mains are cooked together, and every member's allergies and avoided
            foods are applied to the shared dishes — so nothing on the table is unsafe for anyone at it. Snacks stay
            personal to each member's health need.
          </p>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Day {dayIndex + 1} of {days.length} · {Math.round(day.totals.kcal)} kcal per plate
            {day.totals.protein ? ` · ${Math.round(day.totals.protein)} g protein` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FamilyPortions dayIndex={dayIndex} />
          <Link to="/family/weekly"><Button variant="line" style={{ width: '100%', justifyContent: 'center' }}>Open the full week</Button></Link>
          <Button variant="gold" style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => navigate('/family/grocery')}>
            🛒 Grocery list →
          </Button>
        </div>
      </div>
      </>)}
    </div>
  );
}
