import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { DayTabs } from '../components/DayTabs';
import { MealCard } from '../components/MealCard';
import { DailySummary } from '../components/DailySummary';
import { PlanGuidanceBanner } from '../components/PlanGuidanceBanner';
import { MedicalAdvisories } from '../components/MedicalAdvisories';
import { ProfileIncomplete } from '../components/ProfileIncomplete';
import { useWeeklyPlan, useNutritionTargets, useDaySummary, useRegenerateWeek, useBuildCart, syncPlanCaches } from '../hooks';
import { nutritionApi } from '../api';
import { useMealSwapHistory } from '../mealHistory';
import type { WeekPlan } from '../types';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Weekly Meal Planner — reference vertical.
 * Paginated single-day view + Daily Nutrition Overview, driven by TanStack Query
 * against the NestJS meal-planner endpoints. Mirrors the vanilla UX 1:1.
 */
export function WeeklyPlanner() {
  const [dayIndex, setDayIndex] = useState(0);
  const plan = useWeeklyPlan('individual');
  const targets = useNutritionTargets();
  const summary = useDaySummary(plan.data?.key, dayIndex);
  const regenerate = useRegenerateWeek('individual');
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mutate = async (fn: Promise<WeekPlan>) => {
    try {
      const next = await fn;
      // Keep the Daily view in lockstep too — one saved plan, edited in place.
      syncPlanCaches(qc, 'individual', next);
    } catch { /* surfaced by the query error boundary; keep the UI responsive */ }
  };
  const swaps = useMealSwapHistory(plan.data?.key ?? '', dayIndex, mutate);

  if (plan.isLoading) return <Spinner label="Building your week…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🗓️" title="Couldn't load your plan" hint="Start the NestJS backend, then reload." />;
  }
  if (plan.data.incomplete) return <ProfileIncomplete missing={plan.data.missing} />;

  const week = plan.data;
  const day = week.days[dayIndex];
  const last = dayIndex === week.days.length - 1;

  return (
    <div>
      <PageHeader eyebrow="Nutrition Hub · 03"
        title="Weekly Meal Planner 🌿"
        sub={week.weekLabel ? `Week ${week.weekNumber} · ${week.weekLabel} — saved to your Health Profile` : 'Personalised meals from the Together City world database — 11,254 curated recipes with full macro and micronutrient data.'} />
      <PlanGuidanceBanner guidance={(plan.data as unknown as { guidance?: import('../types').PlanGuidance }).guidance} />
      <MedicalAdvisories advisories={week.advisories} healthScore={week.healthScore} />

      {/* Saved plans never regenerate on their own — offer an explicit refresh when
          preferences have changed since this week was generated. */}
      {week.stale && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', margin: '0 0 16px', background: '#fff8e1', border: '1px solid #f0d68a', borderRadius: 12 }}>
          <span style={{ fontSize: 18 }}>✳️</span>
          <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>Your food preferences changed since this week was generated. Your saved plan is unchanged — refresh it to apply your new preferences.</span>
          <Button variant="accent" size="sm" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
            {regenerate.isPending ? 'Refreshing…' : 'Regenerate to apply'}
          </Button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div>
          <DayTabs days={week.days.map((d) => d.day)} current={dayIndex} onSelect={setDayIndex} />

          <section className="card" style={{ padding: '0 20px 20px', borderRadius: 20, marginBottom: 20 }}>
            <div style={{ margin: '0 -20px 16px', padding: '13px 20px', background: 'var(--accent-soft)', borderRadius: '20px 20px 0 0', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 19 }}>{day.dateLabel ?? day.day}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14, alignItems: 'start' }}>
              {day.meals.map((m) => (
                <MealCard key={m.slot} meal={m}
                  onSwap={() => swaps.onSwap(m.slot, m.recipe.id)}
                  onSkip={() => void mutate(nutritionApi.skipMeal(week.key, dayIndex, m.slot, !m.skipped))}
                  canGoBack={swaps.canGoBack(m.slot)}
                  onBack={() => swaps.onBack(m.slot)} />
              ))}
            </div>
          </section>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)' }}>
            <Button variant="line" disabled={dayIndex === 0} onClick={() => setDayIndex((i) => Math.max(0, i - 1))}>← Previous</Button>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>{day.dateLabel ?? day.day} · Day {dayIndex + 1} of {week.days.length}</span>
            {last
              ? <Button variant="accent">🛒 Add to cart</Button>
              : <Button variant="accent" onClick={() => setDayIndex((i) => i + 1)}>Next →</Button>}
          </div>

          <div style={{ margin: '24px 0', padding: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="line" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
              {regenerate.isPending ? 'Refreshing…' : 'Refresh Week'}
            </Button>
            <Button variant="accent" disabled={buildCart.isPending}
              onClick={() => buildCart.mutate({ planKey: week.key }, { onSuccess: () => navigate('/nutrition/grocery') })}>
              {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list'}
            </Button>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 'calc(var(--header-h) + 24px)' }}>
          {summary.data
            ? <DailySummary day={day.dateLabel ?? day.day} summary={summary.data} targets={targets.data} />
            : <Spinner label="Totalling the day…" />}
        </div>
      </div>
    </div>
  );
}
