import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { DayTabs } from '@/features/nutrition/components/DayTabs';
import { MealCard } from '@/features/nutrition/components/MealCard';
import { ProfileIncomplete } from '@/features/nutrition/components/ProfileIncomplete';
import { useNavigate } from 'react-router-dom';
import { useWeeklyPlan, useRegenerateWeek, useRecipes, useBuildFamilyCart } from '@/features/nutrition/hooks';
import { nutritionApi } from '@/features/nutrition/api';
import type { WeekPlan } from '@/features/nutrition/types';
import { useFamily, headcount, MEMBERS } from '../members';
import { FamilySnacks } from '../components/FamilySnacks';
import { FamilyPortions } from '../components/FamilyPortions';

const chipStyle: React.CSSProperties = {
  fontSize: 9.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase',
  margin: '0 0 6px', display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  background: '#e7f3ec', color: '#2e7d4f',
};

/**
 * Weekly Meal Planner — Family (family-weekly.html).
 * One shared household plan on the NestJS meal-planner (mode=family). Mains are
 * cooked together for the whole family; snacks are personalised per member.
 */
export function FamilyWeekly() {
  const [dayIndex, setDayIndex] = useState(0);
  const plan = useWeeklyPlan('family');
  const regenerate = useRegenerateWeek('family');
  const buildCart = useBuildFamilyCart();
  const navigate = useNavigate();
  const recipes = useRecipes();
  const { state } = useFamily();
  const qc = useQueryClient();
  const N = headcount(state);

  if (plan.isLoading) return <Spinner label="Building your family plan…" />;
  if (plan.isError || !plan.data) {
    return <EmptyState icon="🗓️" title="Couldn't load your plan" hint="Start the NestJS backend, then reload." />;
  }
  if (plan.data.incomplete) return <ProfileIncomplete missing={plan.data.missing} />;

  const week = plan.data;
  const day = week.days[dayIndex];
  const last = dayIndex === week.days.length - 1;
  const mains = day.meals.filter((m) => m.slot !== 's');

  const mutate = async (fn: Promise<WeekPlan>) => {
    const next = await fn;
    qc.setQueryData(['nutrition', 'weekly', 'family'], next);
  };

  return (
    <div>
      <PageHeader eyebrow="Family Nutrition · 02"
        title="Weekly Meal Planner"
        sub="Seven days, generated from our recipe database and portioned for each member of the family — refresh or skip any meal." />

      <p className="note">
        This is your <b>family meal plan</b> — the same for everyone. <b>Mains are cooked together for the whole family ({N} {N === 1 ? 'person' : 'people'})</b> and recipe quantities scale to {N}. <b>Snacks are personalised</b> per member’s health need once you add family members.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '2.3fr 1fr', gap: 28, alignItems: 'start', marginTop: 22 }} className="tc-dashgrid">
        <div>
          <DayTabs days={week.days.map((d) => d.day)} current={dayIndex} onSelect={setDayIndex} />

          <section className="card" style={{ padding: '0 20px 20px', borderRadius: 20, marginBottom: 20 }}>
            <div style={{ margin: '0 -20px 16px', padding: '13px 20px', background: 'var(--accent-soft)', borderRadius: '20px 20px 0 0', borderBottom: '1px solid var(--line)' }}>
              <h3 style={{ fontSize: 19 }}><Link to="/family/daily" style={{ color: 'var(--ink)' }}>{day.day}</Link></h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14, alignItems: 'start' }}>
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
          </section>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--shadow)' }}>
            <Button variant="line" disabled={dayIndex === 0} onClick={() => setDayIndex((i) => Math.max(0, i - 1))}>← Previous</Button>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 15 }}>{day.day} · Day {dayIndex + 1} of {week.days.length}</span>
            {last
              ? <Link to="/family/grocery"><Button variant="accent">🛒 Add to cart</Button></Link>
              : <Button variant="accent" onClick={() => setDayIndex((i) => i + 1)}>Next →</Button>}
          </div>

          <div style={{ margin: '24px 0', padding: 20, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Button variant="accent" disabled={buildCart.isPending}
              onClick={() => buildCart.mutate(undefined, { onSuccess: () => navigate("/family/grocery") })}>
              {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list'}
            </Button>
            <Button variant="line" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
              {regenerate.isPending ? 'Refreshing…' : 'Refresh Whole Week'}
            </Button>
            <Link to="/family/daily"><Button variant="line">View Member Updates →</Button></Link>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 'calc(var(--header-h) + 24px)', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <FamilyPortions dayIndex={dayIndex} />
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
    </div>
  );
}
