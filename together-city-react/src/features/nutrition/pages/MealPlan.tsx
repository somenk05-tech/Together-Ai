import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip, Modal } from '@/components/ui';
import {
  useComposedPlan, useMealSettings, useSaveMealSettings,
  useRefreshMeal, useSkipMeal, useRestoreSkips,
  type ComposedMeal, type MealComponent, type CuisineBucket, type ComplianceReport, type ComposedDay, type Scorecard,
} from '../composed.api';

/** Master-source-of-truth gate: no plan until the Food Preference Profile is saved. */
function ProfileGate() {
  return (
    <div style={{ maxWidth: 560, margin: '48px auto', textAlign: 'center', padding: '0 16px' }}>
      <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Complete your Food Preference Profile</div>
      <p className="muted" style={{ fontSize: 13.5, marginBottom: 18, lineHeight: 1.5 }}>
        Your weekly plan is built from your Food Preference Profile — diet, cuisines, foods you avoid,
        allergies and protein sources — then refined by your health profile and blood reports. Save it
        once and every future plan uses it.
      </p>
      <Link to="/nutrition/preferences"><Button>Complete Food Preference Profile</Button></Link>
    </div>
  );
}

/** Health Score + concerns + optional swaps ("inform, don't force"). */
function HealthScoreCard({ c }: { c: ComplianceReport }) {
  const color = c.score >= 80 ? '#2e7d32' : c.score >= 60 ? '#8a6a1f' : '#c0392b';
  return (
    <Card style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', placeItems: 'center', width: 54, height: 54, borderRadius: '50%', border: `4px solid ${color}`, flex: '0 0 auto' }}>
          <strong style={{ fontSize: 16, color }}>{c.score}</strong>
        </div>
        <div style={{ flex: 1, minWidth: 210 }}>
          <strong style={{ fontSize: 13.5 }}>Health Score · {c.score}/100</strong>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2, lineHeight: 1.45 }}>{c.summary}</div>
        </div>
      </div>
      {c.concerns.length > 0 && (
        <ul style={{ margin: '10px 0 0 16px', fontSize: 12.5, lineHeight: 1.5 }}>
          {c.concerns.slice(0, 4).map((x) => <li key={x.key} style={{ color: x.severity === 'warn' ? '#c0392b' : 'inherit' }}>{x.message}</li>)}
        </ul>
      )}
      {c.swaps.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5 }}>
          <span className="muted" style={{ fontWeight: 700 }}>Optional swaps: </span>{c.swaps.slice(0, 3).join(' ')}
        </div>
      )}
      <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Your preferences come first — these are suggestions, not changes. Tap “Refresh meal” to try a healthier option.</div>
    </Card>
  );
}

/** A single 0–100 score dial with a caption. */
function ScoreDial({ label, value, hint }: { label: string; value: number; hint: string }) {
  const color = value >= 85 ? '#2e7d32' : value >= 65 ? '#8a6a1f' : '#c0392b';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, flex: '1 1 240px', minWidth: 220 }}>
      <div role="img" aria-label={`${label}: ${value} out of 100`} style={{ display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%', border: `4px solid ${color}`, flex: '0 0 auto' }}>
        <strong style={{ fontSize: 14.5, color }}>{value}</strong>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{label}</div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.35 }}>{hint}</div>
      </div>
    </div>
  );
}

/**
 * Two-score card shown on each mode tab: this plan's Health score and its
 * Matches-your-preferences score, plus a one-line difference vs the other plan.
 * "Optimal is the clinically correct plan; My Preferences is yours."
 */
function PlanScorecard({ sc }: { sc: Scorecard }) {
  return (
    <Card style={{ padding: '14px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <ScoreDial label="Health score" value={sc.health} hint="How clinically correct this plan is" />
        <ScoreDial label="Matches your preferences" value={sc.preference} hint="How closely it follows your saved profile" />
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 11, lineHeight: 1.5 }}>{sc.summary}</div>
      {(sc.healthNotes.length > 0 || sc.preferenceNotes.length > 0) && (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 10 }}>
          {sc.healthNotes.length > 0 && (
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: 'var(--muted)', marginBottom: 4 }}>Health gaps</div>
              <ul style={{ margin: '0 0 0 16px', fontSize: 12, lineHeight: 1.5 }}>
                {sc.healthNotes.slice(0, 4).map((n) => <li key={n.key} style={{ color: n.severity === 'warn' ? '#c0392b' : 'inherit' }}>{n.label}: {n.detail}</li>)}
              </ul>
            </div>
          )}
          {sc.preferenceNotes.length > 0 && (
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .3, color: 'var(--muted)', marginBottom: 4 }}>Preference match</div>
              <ul style={{ margin: '0 0 0 16px', fontSize: 12, lineHeight: 1.5 }}>
                {sc.preferenceNotes.slice(0, 4).map((n) => <li key={n.key} style={{ color: n.severity === 'warn' ? '#c0392b' : 'inherit' }}>{n.label}: {n.detail}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

type Totals = { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodiumMg?: number };
function macroKcal(t: Totals) { const p = t.protein * 4, c = t.carbs * 4, f = t.fat * 9; return { p, c, f, tot: p + c + f || 1 }; }

/** Calorie-goal donut with macro segments (carbs/protein/fat). */
function Donut({ t, goalPct }: { t: Totals; goalPct: number }) {
  const { p, c, f, tot } = macroKcal(t);
  const R = 52, C = 2 * Math.PI * R;
  const segs = [{ v: c, color: '#3a8a4a' }, { v: p, color: '#2f6fd0' }, { v: f, color: '#e0a53b' }];
  let off = 0;
  return (
    <svg width="128" height="128" viewBox="0 0 130 130" role="img" aria-label={`${Math.round(t.kcal)} kcal, ${goalPct}% of goal`}>
      <circle cx="65" cy="65" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
      {segs.map((s, i) => { const dash = (s.v / tot) * C; const el = (<circle key={i} cx="65" cy="65" r={R} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-off} transform="rotate(-90 65 65)" strokeLinecap="butt" />); off += dash; return el; })}
      <text x="65" y="62" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--ink)">{Math.round(t.kcal)}</text>
      <text x="65" y="80" textAnchor="middle" fontSize="10.5" fill="var(--muted)">kcal · {goalPct}%</text>
    </svg>
  );
}
function Legend({ color, label, g, pct }: { color: string; label: string; g: number; pct?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5 }}>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: color, flex: '0 0 auto' }} />
      <span style={{ minWidth: 52 }}>{label}</span>
      <strong>{Math.round(g)}g</strong>{pct != null && <span className="muted">({pct}%)</span>}
    </span>
  );
}
function NutrientBar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  const over = value > target * 1.02;
  return (
    <div style={{ marginBottom: 11 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span className="muted">{Math.round(value)} / {Math.round(target)} {unit}</span>
      </div>
      <div style={{ height: 6, borderRadius: 4, background: 'var(--line)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: over ? '#c0392b' : '#2e7d32' }} />
      </div>
    </div>
  );
}

/** Right-hand nutrition sidebar: summary donut, nutrient targets, health score, quick actions. */
function PlannerSidebar({ d, prescription, compliance }: { d: ComposedDay; prescription: { kcal: number; protein: number; carb: number; fat: number; fiber: number; sodiumMaxMg?: number }; compliance?: ComplianceReport }) {
  const t = d.totals as Totals;
  const { p, c, f, tot } = macroKcal(t);
  const goalPct = Math.round((t.kcal / Math.max(1, prescription.kcal)) * 100);
  const pct = (x: number) => Math.round((x / tot) * 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card style={{ padding: '14px 16px' }}>
        <strong style={{ fontSize: 14 }}>Nutrition Summary</strong>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
          <Donut t={t} goalPct={goalPct} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <Legend color="#3a8a4a" label="Carbs" g={t.carbs} pct={pct(c)} />
            <Legend color="#2f6fd0" label="Protein" g={t.protein} pct={pct(p)} />
            <Legend color="#e0a53b" label="Fats" g={t.fat} pct={pct(f)} />
            <Legend color="#7a6ff0" label="Fibre" g={t.fiber} />
          </div>
        </div>
      </Card>
      <Card style={{ padding: '14px 16px' }}>
        <strong style={{ fontSize: 14 }}>Nutrient Targets</strong>
        <div style={{ marginTop: 12 }}>
          <NutrientBar label="Calories" value={t.kcal} target={prescription.kcal} unit="kcal" />
          <NutrientBar label="Protein" value={t.protein} target={prescription.protein} unit="g" />
          <NutrientBar label="Fibre" value={t.fiber} target={prescription.fiber} unit="g" />
          {t.sodiumMg != null && prescription.sodiumMaxMg != null && (
            <NutrientBar label="Sodium" value={t.sodiumMg} target={prescription.sodiumMaxMg} unit="mg" />
          )}
        </div>
      </Card>
      {compliance && <HealthScoreCard c={compliance} />}
      <Card style={{ padding: '14px 16px' }}>
        <strong style={{ fontSize: 14 }}>Quick Actions</strong>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12, fontSize: 13.5 }}>
          <Link to="/nutrition/grocery" style={{ color: 'var(--accent)', textDecoration: 'none' }}>🛒 Generate Grocery List</Link>
          <Link to="/nutrition/supplements" style={{ color: 'var(--accent)', textDecoration: 'none' }}>💊 Add Supplement</Link>
          <Link to="/nutrition/dietitians" style={{ color: 'var(--accent)', textDecoration: 'none' }}>🩺 Consult a Dietitian</Link>
          <Link to="/nutrition/preferences" style={{ color: 'var(--accent)', textDecoration: 'none' }}>✎ Edit Food Preference Profile</Link>
        </div>
      </Card>
    </div>
  );
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CUISINES = ['Indian', 'Chinese', 'Thai', 'Italian', 'Continental', 'Mediterranean', 'Global'];
const PROTOCOLS = ['12:12', '14:10', '16:8', '18:6', '20:4', 'omad'];
const BUCKETS: { key: CuisineBucket; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' },
];

function macroRow(t: { kcal: number; protein: number; carbs: number; fat: number; fiber: number }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
      <span><strong>{Math.round(t.kcal)}</strong> kcal</span>
      <span className="muted">P {Math.round(t.protein)}g</span>
      <span className="muted">C {Math.round(t.carbs)}g</span>
      <span className="muted">F {Math.round(t.fat)}g</span>
      <span className="muted">Fib {Math.round(t.fiber)}g</span>
    </div>
  );
}

type Macros = { kcal: number; protein: number; carbs: number; fat: number; fiber: number };

/** Macro split as a graph: a stacked calorie bar (P/C/F) + a legend with grams and %. */
function MacroGraph({ t }: { t: Macros }) {
  const p = Math.max(0, t.protein), c = Math.max(0, t.carbs), f = Math.max(0, t.fat);
  const pk = p * 4, ck = c * 4, fk = f * 9;
  const tot = pk + ck + fk || 1;
  const pctK = (k: number) => Math.round((k / tot) * 100);
  const bars = [
    { label: 'Protein', g: p, kcal: pk, color: '#3a8a4a' },
    { label: 'Carbs', g: c, kcal: ck, color: '#e0a53b' },
    { label: 'Fat', g: f, kcal: fk, color: '#7a6ff0' },
  ];
  return (
    <div style={{ flex: 1, minWidth: 210, maxWidth: 360 }}>
      <div role="img" aria-label={`Macro split: protein ${pctK(pk)}%, carbs ${pctK(ck)}%, fat ${pctK(fk)}% of calories`}
        style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--line)' }}>
        {bars.map((b) => <div key={b.label} title={`${b.label} ${pctK(b.kcal)}%`} style={{ width: `${(b.kcal / tot) * 100}%`, background: b.color }} />)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 9 }}>
        {bars.map((b) => (
          <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: b.color, flex: '0 0 auto' }} />
            <span><strong>{Math.round(b.g)}g</strong> <span className="muted">{b.label} · {pctK(b.kcal)}%</span></span>
          </span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: '#5aa9a0', flex: '0 0 auto' }} />
          <span><strong>{Math.round(t.fiber)}g</strong> <span className="muted">Fibre</span></span>
        </span>
      </div>
    </div>
  );
}

/** Totals card — big kcal on the left, macro graph on the right. */
function DayTotalCard({ t, label = 'Day total' }: { t: Macros; label?: string }) {
  return (
    <Card style={{ padding: '16px 18px', marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 auto' }}>
          <strong style={{ fontSize: 14 }}>{label}</strong>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.05, marginTop: 3 }}>
            {Math.round(t.kcal)} <span className="muted" style={{ fontSize: 13, fontWeight: 500 }}>kcal</span>
          </div>
        </div>
        <MacroGraph t={t} />
      </div>
    </Card>
  );
}

/** Deterministic warm food-toned gradient for a recipe without a photo. */
function photoBg(c: MealComponent): string {
  if (c.imageUrl) return `center/cover no-repeat url(${c.imageUrl})`;
  let h = 0;
  for (const ch of c.recipeId + c.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;               // spread across the wheel
  const hue2 = (hue + 28) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 62%), hsl(${hue2} 60% 45%))`;
}

/** A 16:9 recipe photo tile — real image when available, gradient + name fallback otherwise. */
function RecipePhotoTile({ c, onClick }: { c: MealComponent; onClick: () => void }) {
  const [err, setErr] = useState(false);
  const showImg = Boolean(c.imageUrl) && !err;
  return (
    <button type="button" role="listitem" onClick={onClick} aria-label={`${c.name} — ${c.kcal} kcal, open recipe`} title={c.name}
      style={{ flex: '0 0 auto', width: 150, border: 'none', padding: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
      <div style={{ position: 'relative', width: 150, aspectRatio: '16 / 9', borderRadius: 12, overflow: 'hidden', background: showImg ? 'var(--line)' : photoBg(c), display: 'grid', alignContent: 'end' }}>
        {showImg && <img src={c.imageUrl ?? ''} alt={c.name} loading="lazy" onError={() => setErr(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <span style={{ position: 'relative', background: 'linear-gradient(transparent, rgba(0,0,0,.68))', color: '#fff', fontSize: 11, fontWeight: 700,
          padding: '16px 7px 6px', lineHeight: 1.15, textAlign: 'left', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.name}</span>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 3, textAlign: 'center' }}>{c.kcal} kcal · <span style={{ textTransform: 'capitalize' }}>{c.role}</span></div>
    </button>
  );
}

/** A composite meal card — title, scheduled time, components; expands to the full meal (Rule 9). */
function MealCardV2({ meal, dayIndex }: { meal: ComposedMeal; dayIndex: number }) {
  const [open, setOpen] = useState<MealComponent | null>(null);
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  // Open the FULL recipe page, remembering where we came from so Back returns
  // to the exact planner state (day preserved in the URL, scroll on POP).
  const openRecipe = (c: MealComponent) => {
    if (!c.recipeId) { setOpen(c); return; }
    navigate(`/nutrition/recipes/${c.recipeId}`, { state: { from: location.pathname + location.search } });
  };
  const refresh = useRefreshMeal();
  const skip = useSkipMeal();
  const busy = refresh.isPending || skip.isPending;
  return (
    <Card style={{ padding: '16px 18px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' }}>
            {meal.label} · {meal.scheduledTime}
          </div>
          <h3 style={{ margin: '2px 0 0', fontSize: 17 }}>{meal.title}</h3>
        </div>
        <Chip tone="accent">{Math.round(meal.energyPct * 100)}% of day</Chip>
      </div>

      {/* Photo card: every recipe in the meal as a 16:9 image tile (real photo or gradient). */}
      <div role="list" aria-label={`${meal.title} recipes`}
        style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '12px -2px 2px', padding: '2px', scrollbarWidth: 'thin', opacity: busy ? 0.55 : 1 }}>
        {meal.components.map((c) => <RecipePhotoTile key={`ph-${c.recipeId}-${c.role}`} c={c} onClick={() => openRecipe(c)} />)}
      </div>

      <div style={{ margin: '10px 0' }}>{macroRow(meal.totals)}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meal.components.map((c) => (
          <button key={c.recipeId + c.role} type="button" onClick={() => openRecipe(c)}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: '1px solid var(--line)',
              borderRadius: 10, padding: '8px 11px', background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit' }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600 }}>{c.name}</span>
              <span className="muted" style={{ fontSize: 11.5, textTransform: 'capitalize' }}>{c.role} · {c.grams} g · {c.kcal} kcal</span>
            </span>
            <span className="muted" style={{ fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="line" size="sm" onClick={() => setExpanded((v) => !v)}>{expanded ? 'Hide full meal' : 'Open full meal'}</Button>
        <Button variant="line" size="sm" disabled={busy} onClick={() => refresh.mutate({ day: dayIndex, slot: meal.slot })}>
          {refresh.isPending ? 'Refreshing…' : '↻ Refresh meal'}
        </Button>
        <Button variant="line" size="sm" disabled={busy} onClick={() => skip.mutate({ day: dayIndex, slot: meal.slot, skipped: true })}>
          {skip.isPending ? 'Skipping…' : '⊘ Skip meal'}
        </Button>
        <span className="muted" style={{ fontSize: 12 }}>⏱ {meal.minutes} min · {meal.components.length} recipes</span>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Complete meal · combined ingredients</div>
          {meal.components.map((c) => (
            <div key={c.recipeId + c.role} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{c.name} <span className="muted" style={{ fontWeight: 400 }}>· {c.minutes} min</span></div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                {c.ingredients.map((i) => i.toTaste ? `${i.name} (to taste)` : `${i.name} ${i.grams}g${i.pantry ? ' (pantry)' : ''}`).join(' · ')}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name} width={520}
        footer={<div className="muted" style={{ fontSize: 12 }}>Prep ~{open?.minutes} min · one standard serving</div>}>
        {open && (
          <div>
            {/* Image or gradient placeholder (HIGH-4) */}
            <div style={{ height: 130, borderRadius: 12, marginBottom: 12, overflow: 'hidden',
              background: open.imageUrl ? `center/cover url(${open.imageUrl})` : 'linear-gradient(135deg, var(--accent-soft), var(--accent))',
              display: 'grid', placeItems: 'center' }}>
              {!open.imageUrl && <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, textShadow: '0 1px 6px rgba(0,0,0,.3)' }}>{open.name}</span>}
            </div>
            {/* Clinical badges derived from the recipe's measured nutrients */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {open.addedSugarG <= 5 && <Chip tone="green">Diabetes-friendly</Chip>}
              {open.potassiumMg <= 250 && open.phosphorusMg <= 220 && <Chip tone="green">Kidney-friendly</Chip>}
              {open.satFatG <= 4 && <Chip tone="green">Heart-friendly</Chip>}
              <Chip tone="default">{open.minutes} min</Chip>
            </div>
            <div style={{ marginBottom: 12 }}>{macroRow(open)}</div>
            {open.steps.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>How to cook</div>
                <ol style={{ margin: '0 0 14px', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
                  {open.steps.map((st, i) => <li key={i} style={{ marginBottom: 4 }}>{st}</li>)}
                </ol>
              </>
            )}
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 6 }}>Ingredients</div>
            {open.ingredients.map((i) => (
              <div key={i.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{i.name}{i.pantry && !i.toTaste && <span className="muted" style={{ fontSize: 11 }}> · pantry</span>}</span>
                <span className="muted">{i.toTaste ? 'to taste' : `${i.grams} g`}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  );
}

/** Meal-settings drawer: intermittent fasting + per-slot cuisine (Rules 11/12, IF). */
function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useMealSettings();
  const save = useSaveMealSettings();
  const s = settings.data;
  if (!open) return null;

  const fasting = s?.fasting ?? { enabled: false, protocol: '16:8' };
  const cuisineBySlot = s?.cuisineBySlot ?? {};
  const locks = s?.cuisineLocks ?? {};

  const setCuisine = (bucket: CuisineBucket, cuisine: string, weight: number) => {
    const cur = { ...(cuisineBySlot[bucket] ?? {}) };
    if (weight <= 0) delete cur[cuisine]; else cur[cuisine] = weight;
    save.mutate({ cuisineBySlot: { ...cuisineBySlot, [bucket]: cur } });
  };

  return (
    <Modal open={open} onClose={onClose} title="Meal settings" width={560}
      footer={<Button variant="accent" onClick={onClose}>Done</Button>}>
      {settings.isLoading && <Spinner label="Loading settings…" />}
      {s && (
        <>
          <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>Intermittent fasting</h3>
          {s.fastingSafety.level !== 'ok' && (
            <div style={{ background: s.fastingSafety.level === 'block' ? '#fdecec' : '#faf3e0', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12.5 }}>
              <strong>{s.fastingSafety.level === 'block' ? 'Not recommended for you.' : 'Please check with your clinician.'}</strong>
              <ul style={{ margin: '6px 0 0 16px' }}>{s.fastingSafety.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13.5 }}>
            <input type="checkbox" checked={Boolean(fasting.enabled)} disabled={s.fastingSafety.level === 'block'}
              onChange={(e) => save.mutate({ fasting: { ...fasting, enabled: e.target.checked } })} />
            Enable intermittent fasting
          </label>
          {fasting.enabled && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {PROTOCOLS.map((p) => (
                <Chip key={p} selected={fasting.protocol === p} onClick={() => save.mutate({ fasting: { ...fasting, protocol: p } })}>
                  {p === 'omad' ? 'OMAD' : p}
                </Chip>
              ))}
            </div>
          )}
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
            Schedule: {s.schedule.meals.map((m) => `${m.label} ${m.scheduledTime}`).join(' · ')}
          </div>

          <h3 style={{ fontSize: 15, margin: '18px 0 8px' }}>Cuisine by meal</h3>
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>Set which cuisines each meal draws from. Lock a meal to allow only those cuisines.</p>
          {BUCKETS.map((b) => (
            <div key={b.key} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <strong style={{ fontSize: 13.5 }}>{b.label}</strong>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <input type="checkbox" checked={Boolean(locks[b.key])} onChange={(e) => save.mutate({ cuisineLocks: { ...locks, [b.key]: e.target.checked } })} />
                  Lock
                </label>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CUISINES.map((c) => {
                  const w = cuisineBySlot[b.key]?.[c] ?? 0;
                  return (
                    <Chip key={c} selected={w > 0} onClick={() => setCuisine(b.key, c, w > 0 ? 0 : 100)}>{c}</Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/**
 * The Meal Plan — the clinical, composite, 5-slot planner (Meal-Planning-Engine-Spec).
 * Every day shows Breakfast · Morning Snack · Lunch · Evening Snack · Dinner (or the
 * fasting-window meals), each a complete titled meal with a scheduled time; the
 * grocery list is derived strictly from the plan's recipes.
 */
export function MealPlan() {
  // Selected day + plan MODE live in the URL so returning from a recipe restores them.
  const [sp, setSp] = useSearchParams();
  const mode: 'preferred' | 'optimal' = sp.get('mode') === 'optimal' ? 'optimal' : 'preferred';
  const setMode = (m: 'preferred' | 'optimal') => setSp((p) => { p.set('mode', m); return p; }, { replace: true });
  const plan = useComposedPlan(mode);
  const settingsSave = useSaveMealSettings();
  const day = Math.max(0, Math.min(6, Number(sp.get('day')) || 0));
  const setDay = (i: number) => setSp((p) => { p.set('day', String(i)); return p; }, { replace: true });
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<'plan' | 'grocery'>('plan');
  const restore = useRestoreSkips();

  if (plan.isLoading) return <Spinner label="Composing your week…" />;
  if (plan.isError || !plan.data) return <EmptyState title="Couldn't build your plan" hint="Add your food preferences, then reload." />;
  if (plan.data.needsProfile) return <ProfileGate />;

  const wk = plan.data;
  const d = wk.days[day];

  return (
    <div style={{ maxWidth: 1140, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Nutrition · Meal Plan</div>
          <h1 style={{ fontSize: 26 }}>Weekly Meal Plan</h1>
          <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>Personalized for your goals, preferences &amp; health.</p>
        </div>
        {!wk.readOnly && <Button variant="line" size="sm" onClick={() => setShowSettings(true)}>Meal settings</Button>}
      </div>

      {/* Two modes: My Preferences (default) vs Optimal Health — switch any time. */}
      <div role="tablist" aria-label="Meal plan mode" style={{ display: 'inline-flex', gap: 4, background: 'var(--line)', borderRadius: 999, padding: 4, margin: '12px 0 4px' }}>
        {([['preferred', 'My Preferences'], ['optimal', 'Optimal Health']] as const).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => setMode(m)}
            style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '7px 16px', borderRadius: 999,
              background: mode === m ? 'var(--card)' : 'transparent', color: mode === m ? 'var(--ink)' : 'var(--muted)', boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,.12)' : 'none' }}>
            {label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 12px' }}>
        {mode === 'preferred'
          ? 'Built from your saved Food Preference Profile — your chosen foods and protein sources, whatever your health profile.'
          : 'The clinically ideal plan for your health profile, blood results and conditions — within your diet and allergies.'}
      </p>

      {/* Both scores for THIS plan + the one-line difference vs the other mode. */}
      {wk.scorecard && <PlanScorecard sc={wk.scorecard} />}

      {/* Medical-guidance banner (preferred mode) — inform, offer the healthier plan, never force. */}
      {mode === 'preferred' && wk.compliance && wk.compliance.concerns.length > 0 && (
        <div style={{ background: '#f4f8f4', border: '1px solid #cfe3cf', borderRadius: 10, padding: '11px 14px', marginBottom: 12, fontSize: 12.5 }}>
          <strong>Medical guidance:</strong> your preferred plan is {wk.compliance.score}% aligned with the clinical ideal.
          {' '}{wk.compliance.concerns[0].message} You can keep your preferences, or
          {' '}<button type="button" onClick={() => setMode('optimal')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>see the Optimal Health plan →</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 13, margin: '0 0 14px' }}>
        Complete meals from your prescription ({wk.prescription.kcal} kcal · {wk.prescription.protein} g protein).
        {wk.fasting ? ` Intermittent fasting: ${wk.protocol}.` : ''}
      </p>
      {wk.blocked && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12.5 }}>
          <strong>⚠ This plan could not be fully certified against your medical limits.</strong>
          <div style={{ marginTop: 4 }}>We couldn’t keep every day within your clinical targets with the recipes available. Please review with your clinician or dietitian before following it.</div>
          {wk.blockReason?.length ? <ul style={{ margin: '6px 0 0 16px' }}>{wk.blockReason.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul> : null}
        </div>
      )}
      {wk.degraded && (
        <div style={{ background: '#faf3e0', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          {wk.degradedReason ?? 'This is a general starter plan — reload to personalise it.'}
        </div>
      )}
      {wk.basedOnFamily && (
        <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          Based on <strong>{wk.basedOnFamily.ownerName}'s</strong> family meal plan — same dishes and times, portions scaled to your needs ({Math.round(wk.basedOnFamily.factor * 100)}%). This view is read-only.
        </div>
      )}

      {!wk.validation.ok && (
        <div style={{ background: '#faf3e0', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          Plan notes: {wk.validation.issues.slice(0, 3).join('; ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {(['plan', 'grocery'] as const).map((t) => (
          <Chip key={t} selected={tab === t} onClick={() => setTab(t)}>{t === 'plan' ? 'Meal Plan' : 'Grocery List'}</Chip>
        ))}
      </div>

      {tab === 'plan' && (
        <>
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 14 }}>
            {wk.days.map((_, i) => (
              <Chip key={i} selected={i === day} onClick={() => setDay(i)}>{DAY_NAMES[i] ?? `Day ${i + 1}`}</Chip>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 460px', minWidth: 0 }}>
              {d.fasting && (
                <p className="muted" style={{ fontSize: 12, marginBottom: 10 }}>Eating window {d.window.start}–{d.window.end}</p>
              )}
              {wk.skips && wk.skips.length > 0 && (
                <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, fontSize: 12.5 }}>
                  {wk.skips.length} meal{wk.skips.length > 1 ? 's' : ''} skipped this week
                  <Button variant="line" size="sm" disabled={restore.isPending} onClick={() => restore.mutate({})}>{restore.isPending ? 'Restoring…' : 'Restore all'}</Button>
                </div>
              )}
              {d.meals.map((m) => <MealCardV2 key={m.slot} meal={m} dayIndex={day} />)}
            </div>
            <div style={{ flex: '1 1 290px', maxWidth: 340, minWidth: 260 }}>
              <PlannerSidebar d={d} prescription={wk.prescription} compliance={wk.compliance} />
            </div>
          </div>
        </>
      )}

      {tab === 'grocery' && (
        <Card style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <strong style={{ fontSize: 15 }}>Weekly grocery ({wk.grocery.length} items)</strong>
            <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" defaultChecked={false}
                onChange={(e) => settingsSave.mutate({ includePantry: e.target.checked })} />
              Include pantry staples
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12, marginBottom: 12 }}>Every item comes only from the recipes in your plan — nothing inferred.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: '6px 16px' }}>
            {wk.grocery.map((g) => (
              <div key={g.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--line)' }}>
                <span>{g.name}</span>
                <span className="muted">{g.grams} {g.unit}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}

/** Monday-indexed weekday (Mon=0 … Sun=6) — matches the composed week's order. */
const todayIndex = (): number => (new Date().getDay() + 6) % 7;

/**
 * Daily Meal Planner — today's plate, sliced live from the composite week
 * (same engine, no duplication). Shows the five scheduled meals for today.
 */
export function MealPlanToday() {
  const plan = useComposedPlan();
  const [showSettings, setShowSettings] = useState(false);

  if (plan.isLoading) return <Spinner label="Plating today…" />;
  if (plan.isError || !plan.data) return <EmptyState title="Couldn't load today's plate" hint="Add your food preferences, then reload." />;
  if (plan.data.needsProfile) return <ProfileGate />;

  const wk = plan.data;
  const dailyIdx = wk.days[todayIndex()] ? todayIndex() : 0;
  const d = wk.days[dailyIdx];

  return (
    <div style={{ maxWidth: 780, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Nutrition · Today</div>
          <h1 style={{ fontSize: 26 }}>Today's plate</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => setShowSettings(true)}>Meal settings</Button>
          <Link to="/nutrition/weekly"><Button variant="line" size="sm">Full week →</Button></Link>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '6px 0 14px' }}>
        Your five meals for today, on schedule.{wk.fasting ? ` Fasting: ${wk.protocol} (${d.window.start}–${d.window.end}).` : ''}
      </p>
      {wk.blocked && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12.5 }}>
          <strong>⚠ This plan could not be fully certified against your medical limits.</strong> Please review with your clinician or dietitian before following it.
        </div>
      )}
      {wk.compliance && <HealthScoreCard c={wk.compliance} />}
      {d.meals.map((m) => <MealCardV2 key={m.slot} meal={m} dayIndex={dailyIdx} />)}
      <DayTotalCard t={d.totals} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
