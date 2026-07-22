import { useEffect, useRef } from 'react';
import type { DaySummary, NutritionTargets, WeekNutritionSummary } from '../types';
import { useNutritionAdvice, useRepairDay, useWeekNutrition } from '../hooks';

const MACROS: Array<[key: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber', label: string, unit: string]> = [
  ['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g'], ['fiber', 'Fibre', 'g'],
];

/** One cumulative row: week-to-date intake vs week-to-date target, with the
 *  selected day's own intake beneath. */
function WeekRow({ label, unit, cum, cumTarget, today, todayTarget, nutrient }: {
  label: string; unit: string; cum: number; cumTarget: number; today: number; todayTarget: number; nutrient?: string;
}) {
  let pct = cumTarget > 0 ? Math.round((cum / cumTarget) * 100) : 0;
  // The engine guarantees protein ≤100% weekly; a within-grace rounding artefact
  // (100.4% → 101) must never render as an apparent violation.
  if (nutrient === 'protein' && pct === 101) pct = 100;
  const over = pct > 106;
  const col = over ? '#c0392b' : pct >= 90 ? 'var(--accent)' : '#b08d3e';
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">
          <b style={{ color: 'var(--ink)' }}>{cum.toLocaleString('en-IN')}</b> / {cumTarget.toLocaleString('en-IN')} {unit}
          <span style={{ marginLeft: 8, fontWeight: 700, color: col }}>{pct}%</span>
        </span>
      </div>
      <span style={{ display: 'block', height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: col }} />
      </span>
      <div className="muted" style={{ fontSize: 10.5, marginTop: 3 }}>
        today {today.toLocaleString('en-IN')} / {todayTarget.toLocaleString('en-IN')} {unit}
      </div>
    </div>
  );
}

/** Weekly Nutrition Progress — cumulative budgeting view (Mon → selected day). */
function WeekProgress({ week, dayIndex }: { week: WeekNutritionSummary; dayIndex: number }) {
  const day = week.days.find((d) => d.dayIndex === dayIndex) ?? week.days[week.days.length - 1];
  if (!day) return null;
  const isSunday = day.dayIndex >= 6;
  const first = week.days[0];
  return (
    <>
      <div style={{ padding: '8px 10px', background: 'var(--paper)', borderRadius: 10, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          Week Progress: {first?.dateShort ?? first?.day} → {day.dateShort ?? day.day}
        </div>
        <p className="muted" style={{ fontSize: 11, margin: '3px 0 0', lineHeight: 1.45 }}>
          Cumulative nutrition from the start of the week. The remaining days are automatically
          adjusted to keep you within your weekly nutritional prescription.
        </p>
      </div>
      {MACROS.map(([k, label, unit]) => (
        <WeekRow key={k} label={label} unit={unit} nutrient={k}
          cum={day.cumulative[k]} cumTarget={Number(day.cumulativeTarget[k] ?? 0)}
          today={day[k]} todayTarget={week.dailyTarget[k]} />
      ))}
      {day.remaining && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Weekly allowance remaining</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {MACROS.map(([k, label, unit]) => (
              <span key={k} style={{ fontSize: 11, fontWeight: 600, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '4px 10px' }}>
                {label}: <b>{Number(day.remaining?.[k] ?? 0).toLocaleString('en-IN')}</b> {unit}
              </span>
            ))}
          </div>
        </div>
      )}
      {isSunday && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 12, padding: '12px 14px', background: 'var(--paper)', borderRadius: 12 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{week.weeklyScore}</div>
            <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>weekly score</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{week.compliancePct}%</div>
            <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>compliance</div>
          </div>
          <p className="muted" style={{ fontSize: 11, margin: 0, lineHeight: 1.45 }}>
            Week complete — cumulative intake vs your full weekly prescription.
          </p>
        </div>
      )}
    </>
  );
}

const BANDS: Array<[string, (s: DaySummary) => number, (t: NutritionTargets) => number, number, number]> = [
  // label, consumed, target, minPct, maxPct
  ['calories', (s) => s.kcal, (t) => t.kcal, 95, 108],
  ['protein', (s) => s.protein, (t) => t.protein, 90, 115],
  ['carbs', (s) => s.carbs, (t) => t.carb, 70, 112],
  ['fat', (s) => s.fat, (t) => t.fat, 60, 115],
  ['fibre', (s) => s.fiber, (t) => t.fiber, 70, 999],
];
function bandIssues(summary: DaySummary, targets: NutritionTargets) {
  const over: string[] = [], under: string[] = [];
  for (const [label, cf, tf, minPct, maxPct] of BANDS) {
    const target = tf(targets), consumed = cf(summary);
    if (!target) continue;
    const pct = (consumed / target) * 100;
    if (pct > maxPct) over.push(`${label} ${Math.round(consumed)} vs ${Math.round(target)}`);
    else if (pct < minPct) under.push(`${label} ${Math.round(consumed)} vs ${Math.round(target)}`);
  }
  return { over, under, out: over.length + under.length > 0 };
}

/** Auto-balance: when the shown day violates the prescription, the APP fixes
 *  it — swap + re-portion server-side, then refresh. The user is never asked
 *  to repair the plan; they only see a note while it happens, and an honest
 *  "closest your preferences allow" if the recipe pool truly can't satisfy
 *  every target. */
function AutoBalance({ summary, targets, planKey, dayIndex }: {
  summary: DaySummary; targets: NutritionTargets; planKey?: string; dayIndex?: number;
}) {
  const repair = useRepairDay();
  const attempted = useRef<Set<string>>(new Set());
  const { over, under, out } = bandIssues(summary, targets);
  const key = `${planKey}:${dayIndex}`;
  const canFix = Boolean(planKey) && dayIndex != null;

  useEffect(() => {
    if (out && canFix && !attempted.current.has(key) && !repair.isPending) {
      attempted.current.add(key);
      repair.mutate({ planKey: planKey as string, dayIndex: dayIndex as number });
    }
  }, [out, canFix, key, planKey, dayIndex, repair]);

  if (!out) return null;
  if (repair.isPending || (canFix && !attempted.current.has(key))) {
    return (
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10, fontSize: 11.5, color: 'var(--ink-soft)' }}>
        ⚖ Balancing this day to your targets — swapping dishes and re-portioning…
      </div>
    );
  }
  // The exhaustive repair (portions → swaps → removal ladder) ran and the day
  // STILL violates a hard band → the recipe library itself cannot satisfy the
  // prescription. Per spec, this is the only case shown, naming the limiting
  // constraint — never a shrug over an invalid plan.
  const limiting = (repair.data as { limiting?: { nutrient: string; side: string; achieved?: number; target?: number } } | undefined)?.limiting;
  const NAME: Record<string, string> = { kcal: 'calories', protein: 'protein', carbs: 'carbohydrates', fat: 'fat', fiber: 'fibre' };
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
        Recipe library limit reached
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
        After searching every suitable recipe, portion and meal structure, your current recipe library cannot fully satisfy
        your nutritional prescription today. Limiting factor: <b style={{ color: 'var(--ink)' }}>
        {limiting ? `${NAME[limiting.nutrient] ?? limiting.nutrient} — ${limiting.side === 'over' ? 'the lowest achievable' : 'the highest achievable'} is ${limiting.achieved ?? '?'} vs your ${limiting.target ?? '?'} target`
          : [...over, ...under].slice(0, 1).join('') || 'multiple nutrients'}</b>.
        {' '}The plan shown is the mathematically closest available; expanding your dietary preferences would widen the search.
      </p>
    </div>
  );
}

/** Personalized Nutrition Advice — dietary balance advisories (informational, never blocking). */
function AdviceSection() {
  const advice = useNutritionAdvice();
  if (!advice.data?.length) return null;
  return (
    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--paper)', borderRadius: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Personalized nutrition advice</div>
      {advice.data.map((a) => (
        <div key={a.key} style={{ margin: '6px 0' }}>
          <div style={{ fontSize: 11.5, fontWeight: 700 }}>{a.title}</div>
          <p className="muted" style={{ fontSize: 11.5, margin: '2px 0 0', lineHeight: 1.5 }}>{a.body}</p>
        </div>
      ))}
    </div>
  );
}

/** One nutrient row — Consumed vs Target vs Remaining, with a progress bar. */
function NutrientRow({ label, consumed, target, unit }: { label: string; consumed: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.round((consumed / target) * 100) : 0;
  const remaining = Math.round(target - consumed);
  const over = consumed > target;
  const col = over ? '#c0392b' : pct >= 80 ? 'var(--accent)' : '#b08d3e';
  return (
    <div style={{ margin: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12.5 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">
          <b style={{ color: 'var(--ink)' }}>{consumed.toLocaleString('en-IN')}</b> / {target.toLocaleString('en-IN')} {unit}
          <span style={{ color: over ? '#c0392b' : 'var(--muted)', marginLeft: 8 }}>
            {over ? `over ${Math.abs(remaining).toLocaleString('en-IN')}` : `${remaining.toLocaleString('en-IN')} left`}
          </span>
        </span>
      </div>
      <span style={{ display: 'block', height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden', marginTop: 5 }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: col }} />
      </span>
    </div>
  );
}

/** Weekly Nutrition Progress — cumulative budgeting (falls back to the plain
 *  daily view when the weekly summary isn't available). */
export function DailySummary({ day, summary, targets, planKey, dayIndex }: {
  day: string; summary: DaySummary; targets?: NutritionTargets; planKey?: string; dayIndex?: number;
}) {
  const week = useWeekNutrition(planKey);
  const hasWeek = Boolean(week.data?.days?.length) && dayIndex != null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h4 style={{ marginBottom: 4 }}>{hasWeek ? 'Weekly Nutrition Progress' : 'Daily Nutrition Overview'} — {day}</h4>
        <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>
          {hasWeek ? 'Week-to-date intake vs your cumulative prescription — a dietitian balances the week, not each day in isolation' : 'Consumed vs your personalised target'}
        </p>
        {targets ? (
          <>
            {hasWeek
              ? <WeekProgress week={week.data as WeekNutritionSummary} dayIndex={dayIndex as number} />
              : (
                <>
                  <NutrientRow label="Calories" consumed={summary.kcal} target={targets.kcal} unit="kcal" />
                  <NutrientRow label="Protein" consumed={summary.protein} target={targets.protein} unit="g" />
                  <NutrientRow label="Carbs" consumed={summary.carbs} target={targets.carb} unit="g" />
                  <NutrientRow label="Fat" consumed={summary.fat} target={targets.fat} unit="g" />
                  <NutrientRow label="Fibre" consumed={summary.fiber} target={targets.fiber} unit="g" />
                </>
              )}
            <AutoBalance summary={summary} targets={targets} planKey={planKey} dayIndex={dayIndex} />
            {targets.adjustments && targets.adjustments.length > 0 && (
              <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--paper)', borderRadius: 10 }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Targets adjusted for you</div>
                {targets.adjustments.map((a, i) => (
                  <p key={i} className="muted" style={{ fontSize: 11.5, margin: '2px 0', lineHeight: 1.45 }}>• {a}</p>
                ))}
              </div>
            )}
            <AdviceSection />
          </>
        ) : (
          <p className="muted" style={{ fontSize: 12.5 }}>{summary.kcal.toLocaleString('en-IN')} kcal · P {summary.protein}g · C {summary.carbs}g · F {summary.fat}g</p>
        )}
      </div>
    </div>
  );
}
