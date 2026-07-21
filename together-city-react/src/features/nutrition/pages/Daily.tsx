import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { MealCard } from '../components/MealCard';
import { DailySummary } from '../components/DailySummary';
import { PlanGuidanceBanner } from '../components/PlanGuidanceBanner';
import { ProfileIncomplete } from '../components/ProfileIncomplete';
import { useWeeklyPlan, useNutritionTargets, useDaySummary, useBuildCart } from '../hooks';
import { nutritionApi } from '../api';
import { useMealSwapHistory } from '../mealHistory';
import type { WeekPlan } from '../types';

/** Monday-indexed weekday (Mon=0 … Sun=6) — matches the plan's day order. */
const todayIndex = (): number => (new Date().getDay() + 6) % 7;

/**
 * Daily Meal Planner — today's plate, sliced live from the weekly plan.
 * Same engine, zero duplication: swap/skip mutate the shared weekly plan.
 */
export function Daily() {
  const dayIndex = todayIndex();
  const plan = useWeeklyPlan('individual');
  const targets = useNutritionTargets();
  const summary = useDaySummary(plan.data?.key, dayIndex);
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mutate = async (fn: Promise<WeekPlan>) => {
    const next = await fn;
    qc.setQueryData(['nutrition', 'weekly', 'individual'], next);
  };
  const swaps = useMealSwapHistory(plan.data?.key ?? '', dayIndex, mutate);

  if (plan.isLoading) return <Spinner label="Plating today…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🍽️" title="Couldn't load today's plate" hint="Start the backend, then reload." />;
  }
  if (plan.data.incomplete) return <ProfileIncomplete missing={plan.data.missing} />;

  const week = plan.data;
  const day = week.days[dayIndex];

  return (
    <div>
      <PageHeader eyebrow="Nutrition Hub · 04"
        title={`Today's plate — ${day.day} 🍽️`}
        sub="Your day, sliced live from the weekly plan. Swap anything; the groceries and macros follow." />
      <PlanGuidanceBanner guidance={(plan.data as unknown as { guidance?: import('../types').PlanGuidance }).guidance} />

      <div style={{ display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div>
          <section className="card" style={{ padding: '0 20px 20px', borderRadius: 20, marginBottom: 20 }}>
            <div style={{ margin: '0 -20px 16px', padding: '13px 20px', background: 'var(--accent-soft)', borderRadius: '20px 20px 0 0', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 19 }}>{day.day} · Day {dayIndex + 1} of 7</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }} className="tc-mealgrid">
              {day.meals.map((m) => (
                <MealCard key={m.slot} meal={m}
                  onSwap={() => swaps.onSwap(m.slot, m.recipe.id)}
                  onSkip={() => void mutate(nutritionApi.skipMeal(week.key, dayIndex, m.slot, !m.skipped))}
                  canGoBack={swaps.canGoBack(m.slot)}
                  onBack={() => swaps.onBack(m.slot)} />
              ))}
            </div>
          </section>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/nutrition/weekly"><Button variant="line">Open the full week</Button></Link>
            <Button variant="accent" disabled={buildCart.isPending}
              onClick={() => buildCart.mutate(
                { recipeIds: day.meals.filter((m) => !m.skipped).map((m) => m.recipe.id) },
                { onSuccess: () => navigate('/nutrition/grocery') },
              )}>
              {buildCart.isPending ? 'Building…' : "🛒 Grocery list for today"}
            </Button>
          </div>
        </div>

        <div>
          {summary.data
            ? <DailySummary day={day.day} summary={summary.data} targets={targets.data} />
            : <Spinner />}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 20, textAlign: 'center' }}>
        Personalised for you · Expert guidance · Quality you can trust · Better every day
      </p>
    </div>
  );
}
