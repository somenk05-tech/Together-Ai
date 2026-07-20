import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Hero, Button, Spinner, EmptyState } from '@/components/ui';
import { MealCard } from '@/features/nutrition/components/MealCard';
import { ProfileIncomplete } from '@/features/nutrition/components/ProfileIncomplete';
import { DailySummary } from '@/features/nutrition/components/DailySummary';
import { useWeeklyPlan, useNutritionTargets, useDaySummary, useRecipes, useBuildCart } from '@/features/nutrition/hooks';
import { nutritionApi } from '@/features/nutrition/api';
import type { WeekPlan } from '@/features/nutrition/types';
import { useFamily, headcount } from '../members';
import { FamilySnacks } from '../components/FamilySnacks';

/** Monday-indexed weekday (Mon=0 … Sun=6). */
const todayIndex = (): number => (new Date().getDay() + 6) % 7;

const chipStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
  margin: '0 0 6px', display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  background: '#e7f3ec', color: '#2e7d4f',
};

/**
 * Daily Meal Planner — Family (family-daily.html).
 * Today's plate sliced live from the shared family weekly plan.
 */
export function FamilyDaily() {
  const dayIndex = todayIndex();
  const plan = useWeeklyPlan('family');
  const targets = useNutritionTargets();
  const summary = useDaySummary(plan.data?.key, dayIndex);
  const recipes = useRecipes();
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const { state } = useFamily();
  const qc = useQueryClient();
  const N = headcount(state);

  if (plan.isLoading) return <Spinner label="Plating today…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🍽️" title="Couldn't load today's plate" hint="Start the backend, then reload." />;
  }
  if (plan.data.incomplete) return <ProfileIncomplete missing={plan.data.missing} />;

  const week = plan.data;
  const day = week.days[dayIndex];
  const mains = day.meals.filter((m) => m.slot !== 's');

  const mutate = async (fn: Promise<WeekPlan>) => {
    const next = await fn;
    qc.setQueryData(['nutrition', 'weekly', 'family'], next);
  };

  return (
    <div>
      <Hero image="/assets/img/daily-planner-hero.webp" eyebrow="Family Nutrition · 03"
        title="Daily Meal Planner"
        sub="Today's plate, dish by dish, personalised per member."
        objectPosition="center 55%" />

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2>Today's Family Plan</h2>
        <span className="meta">Cooking for {N} {N === 1 ? 'person' : 'people'} · shared mains + personal snacks</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 14, alignItems: 'start', marginBottom: 32 }} className="tc-mealgrid">
        {mains.map((m) => (
          <div key={m.slot}>
            <span style={chipStyle}>Family · cook together</span>
            <MealCard meal={m} people={N}
              onSwap={() => void mutate(nutritionApi.swapMeal(week.key, dayIndex, m.slot))}
              onSkip={() => void mutate(nutritionApi.skipMeal(week.key, dayIndex, m.slot, !m.skipped))} />
          </div>
        ))}
        <FamilySnacks recipes={recipes.data ?? []} family={state} dayIndex={dayIndex} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 28, alignItems: 'start' }} className="tc-dashgrid">
        <div className="card">
          <h4>Why this plan works</h4>
          <p className="meta" style={{ display: 'block', margin: '10px 0' }}>
            One family plan for today — the mains are cooked together for the whole family and recipe quantities scale to the number of connected members. Snacks are personalised to each member's health need.
          </p>
          {summary.data
            ? <DailySummary day={day.day} summary={summary.data} targets={targets.data} />
            : <Spinner />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="stat"><div className="lab">Today · shared mains</div><div className="val">{day.day}</div><div className="delta">Day {dayIndex + 1} of 7</div></div>
          <Link to="/family/weekly"><Button variant="line" style={{ width: '100%', justifyContent: 'center' }}>Open the full week</Button></Link>
          <Button variant="gold" disabled={buildCart.isPending} style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => buildCart.mutate(
              { recipeIds: day.meals.filter((m) => !m.skipped).map((m) => m.recipe.id), people: N },
              { onSuccess: () => navigate('/family/grocery') },
            )}>
            {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
