import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { MealCard } from '../components/MealCard';
import { DailySummary } from '../components/DailySummary';
import { MedicalRecs } from '../components/MedicalRecs';
import { PlanGuidanceBanner } from '../components/PlanGuidanceBanner';
import { ProfileIncomplete } from '../components/ProfileIncomplete';
import { useDailyPlan, useNutritionTargets, useDaySummary, useBuildCart, syncPlanCaches } from '../hooks';
import { usePlannerMode } from '../plannerMode';
import { PlannerModeToggle } from '../components/PlannerModeToggle';
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
  const planner = usePlannerMode();
  const mode = planner.mode;
  const plan = useDailyPlan(mode);
  const targets = useNutritionTargets();
  const summary = useDaySummary(plan.data?.key, dayIndex);
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // An edit here writes to the DB (via the mutating call) AND updates BOTH the
  // daily and weekly caches, so the Weekly planner reflects it immediately —
  // one plan, never two versions.
  const mutate = async (fn: Promise<WeekPlan>) => {
    try {
      const next = await fn;
      syncPlanCaches(qc, mode, next);
    } catch { /* e.g. a member editing the read-only family plan — ignore, keep UI responsive */ }
  };
  const swaps = useMealSwapHistory(plan.data?.key ?? '', dayIndex, (fn) => void mutate(fn));

  if (plan.isLoading) return <Spinner label="Plating today…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🍽️" title="Couldn't load today's plate" hint="Start the backend, then reload." />;
  }
  if (plan.data.incomplete) return <ProfileIncomplete missing={plan.data.missing} />;
  // Daily never generates — if no week is saved yet, point to the Weekly planner.
  if (plan.data.needsPlan || !plan.data.days?.length) {
    return (
      <div style={{ maxWidth: 520, margin: '40px auto', textAlign: 'center', padding: '0 16px' }}>
        <div style={{ fontSize: 40 }}>🗓️</div>
        <h2 style={{ fontSize: 22, margin: '10px 0 6px' }}>No weekly plan yet</h2>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          The Daily planner shows one day from your saved weekly plan — it never makes its own.
          Generate your week first, then today's plate appears here automatically.
        </p>
        <Link to="/nutrition/weekly"><Button variant="accent">Go to Weekly Meal Planner →</Button></Link>
      </div>
    );
  }

  const week = plan.data;
  const day = week.days[dayIndex];

  return (
    <div>
      <PageHeader eyebrow="Nutrition Hub · 04"
        title={`Today's plate — ${day.day} 🍽️`}
        sub="Your day, sliced live from the weekly plan. Swap anything; the groceries and macros follow." />

      {planner.canUseFamily && (
        <PlannerModeToggle mode={mode} onChange={planner.setMode}
          ownerName={mode === 'family' ? week.basedOnFamily?.ownerName : null}
          busy={plan.isFetching} />
      )}

      <MedicalRecs />
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
            ? <DailySummary day={day.day} summary={summary.data} targets={targets.data} planKey={plan.data?.key} dayIndex={dayIndex} />
            : summary.isLoading
              ? <Spinner />
              : <EmptyState icon="🧮" title="Day totals unavailable" hint="They'll appear once today's plan finishes loading." />}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginTop: 20, textAlign: 'center' }}>
        Personalised for you · Expert guidance · Quality you can trust · Better every day
      </p>
    </div>
  );
}
