import { useEffect, useRef, useState } from 'react';
import type { DaySummary, NutritionTargets, MicroIntake } from '../types';
import { useNutritionAdvice, useRepairDay } from '../hooks';

/* Legacy fallback labels when the backend hasn't sent rich micros yet. */
const MICRO_LABELS: Array<[string, string]> = [
  ['fe', 'Iron'], ['ca', 'Calcium'], ['mg', 'Magnesium'], ['zn', 'Zinc'], ['va', 'Vit A'],
  ['vc', 'Vit C'], ['vd', 'Vit D'], ['ve', 'Vit E'], ['b12', 'B12'], ['fiber', 'Fibre'],
];

/* ── status model ──
   needs   <80%   (critical <50%)   → red, ⬆ Increase
   almost  80–99%                   → amber, ⬆ Nearly there
   optimal 100–120%                 → green, ✅ Optimal
   above   >120%                    → orange, ⬇ Reduce (⚠ Excess >160%) */
type Status = 'critical' | 'needs' | 'almost' | 'optimal' | 'above' | 'excess';
const statusOf = (pct: number): Status =>
  pct < 50 ? 'critical' : pct < 80 ? 'needs' : pct < 100 ? 'almost' : pct <= 120 ? 'optimal' : pct <= 160 ? 'above' : 'excess';

const STATUS_META: Record<Status, { color: string; badge: string; label: string; rank: number }> = {
  critical: { color: '#b0503e', badge: '⬆ Increase', label: 'Needs attention', rank: 0 },
  needs:    { color: '#c0673e', badge: '⬆ Increase', label: 'Needs attention', rank: 1 },
  almost:   { color: '#b08d3e', badge: '⬆ Almost there', label: 'Almost there', rank: 2 },
  optimal:  { color: '#2e5e40', badge: '✅ Optimal', label: 'Optimal', rank: 3 },
  above:    { color: '#c07a3e', badge: '⬇ Reduce', label: 'Above recommended', rank: 4 },
  excess:   { color: '#8e3326', badge: '⚠ Excess', label: 'Excessive', rank: 5 },
};

const GROUPS: Array<{ title: string; emoji: string; match: Status[] }> = [
  { title: 'Needs attention', emoji: '🟥', match: ['critical', 'needs'] },
  { title: 'Almost there', emoji: '🟨', match: ['almost'] },
  { title: 'Optimal', emoji: '🟩', match: ['optimal'] },
  { title: 'Above recommended', emoji: '🟧', match: ['above', 'excess'] },
];

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-IN') : Math.round(n * 10) / 10);

/** Segmented gauge: fixed track 0→130% with markers at 50 / 100 / 120. */
function Gauge({ pct, color }: { pct: number; color: string }) {
  const width = Math.min(100, (pct / 130) * 100);
  const mark = (at: number) => (
    <span style={{ position: 'absolute', left: `${(at / 130) * 100}%`, top: -1, bottom: -1, width: 1.5, background: 'var(--card)', opacity: 0.9, zIndex: 2 }} />
  );
  return (
    <span style={{ position: 'relative', display: 'block', height: 7, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${width}%`, background: color, borderRadius: 4 }} />
      {mark(50)}{mark(100)}{mark(120)}
    </span>
  );
}

function MicroRow({ mi, open, onToggle }: { mi: MicroIntake; open: boolean; onToggle: () => void }) {
  const st = statusOf(mi.pct);
  const meta = STATUS_META[st];
  const remaining = Math.max(0, mi.target - mi.intake);
  const deficient = st === 'critical' || st === 'needs';
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
      <button type="button" onClick={onToggle}
        style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: 12.5 }}>
          <span style={{ fontWeight: 700, width: 76, flexShrink: 0 }}>{mi.label}</span>
          <span className="muted" style={{ flexShrink: 0 }}>
            <b style={{ color: 'var(--ink)' }}>{fmt(mi.intake)}</b> / {fmt(mi.target)} {mi.unit}
          </span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: meta.color, flexShrink: 0 }}>{mi.pct}%</span>
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: meta.color, border: `1px solid ${meta.color}44`, background: `${meta.color}14`, borderRadius: 999, padding: '2px 8px' }}>
            {meta.badge}
          </span>
          <span className="muted" style={{ fontSize: 10, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
        </div>
        <div style={{ marginTop: 5 }}><Gauge pct={mi.pct} color={meta.color} /></div>
        {deficient && !open && mi.foods.length > 0 && (
          <p className="muted" style={{ fontSize: 10.5, margin: '4px 0 0' }}>
            Increase with: {mi.foods.slice(0, 3).join(' · ')}
          </p>
        )}
      </button>
      {open && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10, fontSize: 11.5, lineHeight: 1.55 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 18px' }}>
            <span><span className="muted">Today:</span> <b>{fmt(mi.intake)} {mi.unit}</b></span>
            <span><span className="muted">Target:</span> <b>{fmt(mi.target)} {mi.unit}</b></span>
            {remaining > 0
              ? <span><span className="muted">Still needed:</span> <b>{fmt(remaining)} {mi.unit}</b></span>
              : <span style={{ color: STATUS_META.optimal.color, fontWeight: 700 }}>Target met ✓</span>}
          </div>
          {mi.topSources.length > 0 && (
            <p style={{ margin: '6px 0 0' }}><span className="muted">From today's meals:</span> {mi.topSources.join(', ')}</p>
          )}
          {st !== 'optimal' && mi.foods.length > 0 && (
            <p style={{ margin: '6px 0 0' }}>
              <span className="muted">{deficient ? 'Best ways to increase:' : st === 'almost' ? 'To close the gap:' : 'Ease off:'}</span>{' '}
              {deficient || st === 'almost' ? mi.foods.join(' · ') : `fewer ${mi.label}-rich servings tomorrow — nothing drastic needed.`}
            </p>
          )}
          {st === 'critical' && (
            <p className="muted" style={{ margin: '6px 0 0' }}>
              If food alone can't reach this consistently, ask your healthcare professional whether a supplement makes sense.
            </p>
          )}
          {mi.markerStatus && (
            <p style={{ margin: '6px 0 0' }}>
              <span className="muted">Blood test:</span>{' '}
              your latest panel marks this <b style={{ color: mi.markerStatus === 'normal' ? STATUS_META.optimal.color : STATUS_META.needs.color }}>{mi.markerStatus}</b>.
            </p>
          )}
          {st === 'optimal' && <p style={{ margin: '6px 0 0', color: STATUS_META.optimal.color, fontWeight: 600 }}>Optimal — no additional {mi.label}-rich foods needed today.</p>}
        </div>
      )}
    </div>
  );
}

/** Micronutrient dashboard: score card → grouped, importance-sorted gauges → summary. */
function MicroDashboard({ micros }: { micros: MicroIntake[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const sorted = [...micros].sort((a, b) => STATUS_META[statusOf(a.pct)].rank - STATUS_META[statusOf(b.pct)].rank || a.pct - b.pct);
  const score = Math.round(micros.reduce((s, m) => s + Math.min(100, m.pct), 0) / Math.max(1, micros.length));
  const nOptimal = micros.filter((m) => statusOf(m.pct) === 'optimal').length;
  const nNeeds = micros.filter((m) => ['critical', 'needs', 'almost'].includes(statusOf(m.pct))).length;
  const nExcess = micros.filter((m) => ['above', 'excess'].includes(statusOf(m.pct))).length;
  const low = sorted.filter((m) => ['critical', 'needs'].includes(statusOf(m.pct))).map((m) => m.label);
  const good = micros.filter((m) => statusOf(m.pct) === 'optimal').map((m) => m.label);

  return (
    <div className="card">
      <h4 style={{ marginBottom: 10 }}>Micronutrient Coverage</h4>

      {/* summary score card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: 'var(--paper)', borderRadius: 12, marginBottom: 10 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{score}</div>
          <div className="muted" style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.06em' }}>/ 100 score</div>
        </div>
        <div style={{ display: 'flex', gap: 14, fontSize: 11.5, flexWrap: 'wrap' }}>
          <span><b style={{ color: STATUS_META.optimal.color }}>{nOptimal}</b> optimal</span>
          <span><b style={{ color: STATUS_META.needs.color }}>{nNeeds}</b> need improvement</span>
          <span><b style={{ color: STATUS_META.above.color }}>{nExcess}</b> above range</span>
        </div>
      </div>

      {/* grouped, importance-sorted rows */}
      {GROUPS.map((g) => {
        const rows = sorted.filter((m) => g.match.includes(statusOf(m.pct)));
        if (!rows.length) return null;
        return (
          <div key={g.title} style={{ marginBottom: 6 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', margin: '10px 0 2px' }}>
              {g.emoji} {g.title}
            </div>
            {rows.map((mi) => (
              <MicroRow key={mi.key} mi={mi} open={open === mi.key} onToggle={() => setOpen(open === mi.key ? null : mi.key)} />
            ))}
          </div>
        );
      })}

      {/* today's nutrition summary */}
      <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Today's nutrition summary</div>
        <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
          Your micronutrient intake is {score}% complete.{' '}
          {low.length > 0 && <>{low.join(', ')} remain{low.length === 1 ? 's' : ''} below target — usually fixable by adjusting tomorrow's meals (tap a nutrient above for the best foods).{' '}</>}
          {good.length > 0 && <>{good.join(', ')} {good.length === 1 ? 'is' : 'are'} already in the optimal range, so no additional sources are needed today.</>}
          {low.length === 0 && good.length === 0 && <>Keep variety high and tomorrow's plan will smooth out the rest.</>}
        </p>
        <p className="muted" style={{ fontSize: 10, margin: '6px 0 0', fontStyle: 'italic' }}>
          Estimated from the ingredients in today's meals · personalised to your age, sex and blood tests
        </p>
      </div>
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
  const limiting = (repair.data as { limiting?: { nutrient: string; side: string } } | undefined)?.limiting;
  const NAME: Record<string, string> = { kcal: 'calories', protein: 'protein', carbs: 'carbohydrates', fat: 'fat', fiber: 'fibre' };
  return (
    <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--paper)', borderRadius: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>
        Recipe library limit reached
      </div>
      <p className="muted" style={{ fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
        After searching every suitable recipe, portion and meal structure, your current recipe library cannot fully satisfy
        your nutritional prescription today. Limiting factor: <b style={{ color: 'var(--ink)' }}>
        {limiting ? `${NAME[limiting.nutrient] ?? limiting.nutrient} (${limiting.side === 'over' ? 'no options low enough' : 'no options rich enough'})`
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

/** Daily Nutrition Overview — Target vs Consumed vs Remaining for every macro. */
export function DailySummary({ day, summary, targets, planKey, dayIndex }: {
  day: string; summary: DaySummary; targets?: NutritionTargets; planKey?: string; dayIndex?: number;
}) {
  // Rich micros from the backend when available; legacy coverage map otherwise.
  const micros: MicroIntake[] = summary.micros?.length
    ? summary.micros
    : MICRO_LABELS.map(([k, label]) => ({
        key: k, label, unit: '%', intake: summary.coverage[k] ?? 0, target: 100,
        pct: summary.coverage[k] ?? 0, foods: [], topSources: [], markerStatus: null,
      }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <h4 style={{ marginBottom: 4 }}>Daily Nutrition Overview — {day}</h4>
        <p className="muted" style={{ fontSize: 11.5, margin: '0 0 8px' }}>Consumed vs your personalised target</p>
        {targets ? (
          <>
            <NutrientRow label="Calories" consumed={summary.kcal} target={targets.kcal} unit="kcal" />
            <NutrientRow label="Protein" consumed={summary.protein} target={targets.protein} unit="g" />
            <NutrientRow label="Carbs" consumed={summary.carbs} target={targets.carb} unit="g" />
            <NutrientRow label="Fat" consumed={summary.fat} target={targets.fat} unit="g" />
            <NutrientRow label="Fibre" consumed={summary.fiber} target={targets.fiber} unit="g" />
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
      <MicroDashboard micros={micros} />
    </div>
  );
}
