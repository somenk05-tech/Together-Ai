import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, Button, Spinner, EmptyState } from '@/components/ui';
import { DayTabs } from '../components/DayTabs';
import { MealCard } from '../components/MealCard';
import { DailySummary } from '../components/DailySummary';
import { MedicalRecs } from '../components/MedicalRecs';
import { PlanGuidanceBanner } from '../components/PlanGuidanceBanner';
import { MedicalAdvisories } from '../components/MedicalAdvisories';
import { ProfileIncomplete } from '../components/ProfileIncomplete';
import {
  useWeeklyPlan, useNutritionTargets, useDaySummary, useRegenerateWeek, useBuildCart,
  useWeeks, useWeekByKey, useNewWeek, useDuplicateWeek, syncPlanCaches,
} from '../hooks';
import { usePlannerMode } from '../plannerMode';
import { PlannerModeToggle } from '../components/PlannerModeToggle';
import { nutritionApi } from '../api';
import { useMealSwapHistory } from '../mealHistory';
import type { WeekPlan, WeekSummary } from '../types';
import { useQueryClient } from '@tanstack/react-query';

/** Monday-indexed weekday (Mon=0 … Sun=6) — matches the plan's day order. */
const todayIndex = (): number => (new Date().getDay() + 6) % 7;

/** The week calendar — current week highlighted, previous weeks collapsible.
 *  Selecting a week loads it into the planner for viewing/editing. */
function WeekTimeline({ weeks, activeKey, onSelect, onNewWeek, newBusy }: {
  weeks: WeekSummary[]; activeKey: string | undefined;
  onSelect: (key: string) => void; onNewWeek: () => void; newBusy: boolean;
}) {
  const [showPrev, setShowPrev] = useState(false);
  const current = weeks.find((w) => w.isCurrent);
  const previous = weeks.filter((w) => !w.isCurrent);
  const chip = (w: WeekSummary, active: boolean) => (
    <button key={w.key} type="button" onClick={() => onSelect(w.key)}
      style={{ cursor: 'pointer', textAlign: 'left', borderRadius: 12, padding: '9px 13px', fontFamily: 'inherit',
        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--line)'}`, background: active ? 'var(--accent-soft)' : 'var(--card)' }}>
      <div style={{ fontSize: 12.5, fontWeight: 700 }}>{w.weekLabel}{w.isCurrent ? ' · This week' : ''}</div>
      <div className="muted" style={{ fontSize: 11 }}>Week {w.weekNumber} · {w.meals} meals{active ? ' · viewing' : ''}</div>
    </button>
  );
  return (
    <div className="card" style={{ marginBottom: 16, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow" style={{ margin: 0 }}>Your weeks</div>
        <Button variant="line" size="sm" disabled={newBusy} onClick={onNewWeek}>{newBusy ? 'Generating…' : '+ New week'}</Button>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {current && chip(current, current.key === activeKey)}
        {previous.length > 0 && !showPrev && (
          <button type="button" onClick={() => setShowPrev(true)}
            style={{ cursor: 'pointer', borderRadius: 12, padding: '9px 13px', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, border: '1.5px dashed var(--line)', background: 'transparent', color: 'var(--accent)' }}>
            ▸ {previous.length} previous week{previous.length > 1 ? 's' : ''}
          </button>
        )}
        {showPrev && previous.map((w) => chip(w, w.key === activeKey))}
      </div>
    </div>
  );
}

/** Weekly Meal Planner — a calendar of saved weeks. The current week is the
 *  default; previous weeks are permanent, revisitable and editable in place. */
export function WeeklyPlanner() {
  // Open on TODAY (like a calendar), not the first day of the week.
  const [dayIndex, setDayIndex] = useState(todayIndex);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Planner mode — Family (shared) vs Individual (own). Switching is instant.
  const planner = usePlannerMode();
  const mode = planner.mode;

  const current = useWeeklyPlan(mode);
  const weeksQ = useWeeks(mode);
  const targets = useNutritionTargets();
  const regenerate = useRegenerateWeek(mode);
  const newWeek = useNewWeek(mode);
  const duplicate = useDuplicateWeek(mode);
  const buildCart = useBuildCart();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const currentKey = current.data?.key;
  const viewingPast = Boolean(selectedKey && selectedKey !== currentKey);
  const picked = useWeekByKey(viewingPast ? selectedKey : null);
  const planQ = viewingPast ? picked : current;

  const activeKey = planQ.data?.key;
  const summary = useDaySummary(activeKey, dayIndex);

  // Edits write to the DB (the mutating call) and update the RIGHT cache: the
  // current week syncs weekly+daily; a past week updates just its own cache.
  const mutate = async (fn: Promise<WeekPlan>) => {
    try {
      const next = await fn;
      if (viewingPast && selectedKey) {
        qc.setQueryData(['nutrition', 'week', selectedKey], (prev: WeekPlan | undefined) => ({ ...((prev ?? {}) as WeekPlan), ...next }));
        void qc.invalidateQueries({ queryKey: ['nutrition', 'summary'] });
        void qc.invalidateQueries({ queryKey: ['nutrition', 'weeks', mode] });
      } else {
        syncPlanCaches(qc, mode, next);
      }
    } catch { /* surfaced by the query error boundary; keep the UI responsive */ }
  };
  const swaps = useMealSwapHistory(activeKey ?? '', dayIndex, mutate);

  if (planQ.isLoading) return <Spinner label="Building your week…" />;
  if (planQ.isError || !planQ.data) {
    return <EmptyState icon="🗓️" title="Couldn't load your plan" hint="Start the NestJS backend, then reload." />;
  }
  if (planQ.data.incomplete) return <ProfileIncomplete missing={planQ.data.missing} />;

  const week = planQ.data;
  const day = week.days[dayIndex] ?? week.days[0];
  const last = dayIndex === week.days.length - 1;
  const onCurrentWeek = !viewingPast;

  return (
    <div>
      <PageHeader eyebrow="Nutrition Hub · 03"
        title="Weekly Meal Planner 🌿"
        sub={week.weekLabel ? `${onCurrentWeek ? 'This week' : 'Saved week'} · Week ${week.weekNumber} · ${week.weekLabel}` : 'Personalised meals from the Together City world database.'} />

      {/* Planner mode — one shared Family Plan or your own Individual Plan.
          Shown only when the household actually offers a shared plan. */}
      {planner.canUseFamily && (
        <PlannerModeToggle mode={mode} onChange={planner.setMode}
          ownerName={mode === 'family' ? week.basedOnFamily?.ownerName : null}
          busy={planQ.isFetching} />
      )}

      <PlanGuidanceBanner guidance={(week as unknown as { guidance?: import('../types').PlanGuidance }).guidance} />
      <MedicalRecs />
      <MedicalAdvisories advisories={week.advisories} healthScore={week.healthScore} />

      {!week.familyMode && weeksQ.data && weeksQ.data.length > 0 && (
        <WeekTimeline
          weeks={weeksQ.data} activeKey={activeKey}
          onSelect={(key) => { setSelectedKey(key); setDayIndex(todayIndex()); }}
          onNewWeek={() => newWeek.mutate(undefined, { onSuccess: (p) => setSelectedKey(p.key) })}
          newBusy={newWeek.isPending} />
      )}

      {/* Viewing a saved past week — edits are kept for THAT week; it never
          overwrites the current week. Offer a duplicate into a new week. */}
      {viewingPast && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', margin: '0 0 16px', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 12 }}>
          <span style={{ fontSize: 16 }}>📅</span>
          <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>You're viewing a saved week. Edits here stay with this week. Jump back to <button type="button" onClick={() => setSelectedKey(null)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>this week</button>.</span>
          <Button variant="line" size="sm" disabled={duplicate.isPending}
            onClick={() => duplicate.mutate(week.key, { onSuccess: (p) => setSelectedKey(p.key) })}>
            {duplicate.isPending ? 'Duplicating…' : 'Duplicate to a new week'}
          </Button>
        </div>
      )}

      {/* Saved plans never regenerate on their own — offer an explicit refresh when
          preferences changed (current week only). If the citizen has edited this
          plan, regenerating discards their work, so say so and make them confirm
          rather than handing them a one-tap button that quietly undoes it. */}
      {!week.readOnly && onCurrentWeek && week.stale && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 16px', margin: '0 0 16px', background: '#fff8e1', border: '1px solid #f0d68a', borderRadius: 12 }}>
          <span style={{ fontSize: 18 }}>✳️</span>
          <span style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
            {week.locked
              ? 'Your food preferences changed since this week was generated. This plan has your own changes in it, so it stays exactly as you left it — regenerating would replace your edits with a fresh plan.'
              : 'Your food preferences changed since this week was generated. Your saved plan is unchanged — regenerate it to apply your new preferences.'}
          </span>
          <Button
            variant="accent"
            size="sm"
            disabled={regenerate.isPending}
            onClick={() => {
              if (week.locked && !window.confirm('Regenerating builds a new week from your current preferences and discards the changes you made to this plan. Continue?')) return;
              regenerate.mutate();
            }}
          >
            {regenerate.isPending ? 'Refreshing…' : week.locked ? 'Replace my edits' : 'Regenerate to apply'}
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
            {onCurrentWeek && (
              <Button variant="line" disabled={regenerate.isPending} onClick={() => regenerate.mutate()}>
                {regenerate.isPending ? 'Refreshing…' : 'Start fresh this week'}
              </Button>
            )}
            <Button variant="accent" disabled={buildCart.isPending}
              onClick={() => buildCart.mutate({ planKey: week.key }, { onSuccess: () => navigate('/nutrition/grocery') })}>
              {buildCart.isPending ? 'Building…' : '🛒 Generate grocery list'}
            </Button>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 'calc(var(--header-h) + 24px)' }}>
          {summary.data
            ? <DailySummary day={day.dateLabel ?? day.day} summary={summary.data} targets={targets.data} planKey={activeKey} dayIndex={dayIndex} />
            : summary.isLoading
              ? <Spinner label="Totalling the day…" />
              : <EmptyState icon="🧮" title="Day totals unavailable" hint="They'll appear once this day's plan finishes loading." />}
        </div>
      </div>
    </div>
  );
}
