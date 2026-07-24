import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Card, Spinner, EmptyState, Button, Chip, Modal } from '@/components/ui';
import {
  useComposedPlan, useMealSettings, useSaveMealSettings,
  useRefreshMeal, useSkipMeal, useRestoreSkips,
  type ComposedMeal, type MealComponent, type CuisineBucket, type ComposedDay, type ComposedWeek, type Scorecard,
} from '../composed.api';
import { VegMark, mealKind } from '../components/VegMark';

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
const CUISINES = ['Indian', 'Chinese', 'Thai', 'Italian', 'Continental', 'Mediterranean', 'Global'];
const PROTOCOLS = ['12:12', '14:10', '16:8', '18:6', '20:4', 'omad'];
const BUCKETS: { key: CuisineBucket; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snacks' },
];

/** Deterministic warm food-toned gradient for a recipe without a photo (always a
 *  gradient — the real photo is layered on top via <img> so a missing/404 image
 *  reveals this instead of a blank box). */
function photoBg(c?: MealComponent): string {
  const key = `${c?.recipeId ?? ''}${c?.name ?? 'meal'}`;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;               // spread across the wheel
  const hue2 = (hue + 28) % 360;
  return `linear-gradient(135deg, hsl(${hue} 55% 62%), hsl(${hue2} 60% 45%))`;
}

/* ─────────────────────── Premium day view (weekly + daily redesign) ─────────────────────── */
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
function weekDates(): Date[] {
  const now = new Date(); const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); monday.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => { const dd = new Date(monday); dd.setDate(monday.getDate() + i); return dd; });
}
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const NPATH: Record<string, string> = {
  flame: 'M13 3c0 3 3 4 3 8a4 4 0 1 1-8 0c0-2 2-3 2-5 0 0 3 1 3-3z', leaf: 'M5 20c7 1 14-4 15-16C11 3 4 9 5 20zM9 16c2-4 5-6 8-7',
  wheat: 'M12 21V8M12 10c-2-1-4-1-5 1 2 1 4 1 5-1zM12 10c2-1 4-1 5 1-2 1-4 1-5-1zM12 15c-2-1-4-1-5 1 2 1 4 1 5-1zM12 15c2-1 4-1 5 1-2 1-4 1-5-1z',
  drop: 'M12 3s6 6 6 10a6 6 0 1 1-12 0c0-4 6-10 6-10z', sprout: 'M12 21v-7M12 14c0-3-2-5-5-5 0 3 2 5 5 5zM12 14c0-3 2-5 5-5 0 3-2 5-5 5z',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z', check: 'M20 6L9 17l-5-5',
  clock: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z', chevL: 'M15 6l-6 6 6 6', chevR: 'M9 6l6 6-6 6',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z',
  refresh: 'M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3', skip: 'M6 6l12 12M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
};
function NIc({ name, size = 18, stroke = 1.7, style }: { name: string; size?: number; stroke?: number; style?: React.CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 auto', ...style }} aria-hidden><path d={NPATH[name] ?? NPATH.leaf} /></svg>;
}

const mainOf = (m: ComposedMeal) => m.components.find((c) => c.role === 'main') ?? m.components.find((c) => c.role === 'dal') ?? m.components.find((c) => c.role === 'breakfast') ?? m.components[0];
const photoOf = (m: ComposedMeal) => m.components.find((c) => c.imageUrl) ?? mainOf(m);
function mealDesc(m: ComposedMeal): string {
  const names = m.components.map((c) => c.name);
  if (!names.length) return 'A balanced meal from your plan.';
  const head = names[0]; const rest = names.slice(1, 4).map((n) => n.toLowerCase());
  if (!rest.length) return `${head}.`;
  const joined = rest.length === 1 ? rest[0] : rest.slice(0, -1).join(', ') + ' & ' + rest[rest.length - 1];
  return `${head} with ${joined}.`;
}

/** A single meal column card (banner · 16:9 photo · title · view recipe · desc · prep/kcal). */
function MealColumn({ meal, dayIndex, readOnly }: { meal: ComposedMeal; dayIndex: number; readOnly?: boolean }) {
  const navigate = useNavigate(); const location = useLocation();
  const [err, setErr] = useState(false);
  const refresh = useRefreshMeal(); const skip = useSkipMeal();
  const busy = refresh.isPending || skip.isPending;
  const main = mainOf(meal); const photo = photoOf(meal);
  const img = photo?.imageUrl && !err ? photo.imageUrl : null;
  const open = () => { if (main?.recipeId) navigate(`/nutrition/recipes/${main.recipeId}`, { state: { from: location.pathname + location.search } }); };
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 20, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)', opacity: busy ? 0.55 : 1 }}>
      <div style={{ padding: '14px 14px 0' }}>
        <span style={{ display: 'inline-block', background: 'var(--ink)', color: '#fff', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', padding: '5px 12px', borderRadius: 8 }}>{meal.label}</span>
      </div>
      <button type="button" onClick={open} aria-label={`Open ${meal.title}`} style={{ margin: '12px 14px 0', border: 'none', padding: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'block', width: 'calc(100% - 28px)' }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', borderRadius: 14, overflow: 'hidden', background: photoBg(photo) }}>
          {img && <img src={img} alt={meal.title} loading="lazy" onError={() => setErr(true)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
          <span style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(255,255,255,.92)', borderRadius: 5, padding: 2, lineHeight: 0, boxShadow: '0 1px 3px rgba(0,0,0,.22)' }}>
            <VegMark diet={mealKind(meal.components.map((c) => c.diet))} size={16} />
          </span>
          {!img && (
            <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '22px 12px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,.6))', color: '#fff', fontSize: 13.5, fontWeight: 700, lineHeight: 1.25, textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,.35)' }}>
              {(main?.name ?? meal.title)}
            </span>
          )}
        </div>
      </button>
      <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontSize: 15.5, margin: '0 0 6px', lineHeight: 1.3, letterSpacing: '-.01em' }}>{meal.title}</h3>
        <button type="button" onClick={open} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
          View recipe <NIc name="chevR" size={14} />
        </button>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.5, margin: '10px 0 14px' }}>{mealDesc(meal)}</p>
        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--muted)', borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><NIc name="clock" size={14} /> Prep: {meal.minutes} min</span>
          <span style={{ width: 1, height: 12, background: 'var(--line)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><NIc name="flame" size={14} /> {Math.round(meal.totals.kcal)} kcal</span>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 16, marginTop: 11 }}>
            <button type="button" disabled={busy} onClick={() => refresh.mutate({ day: dayIndex, slot: meal.slot })} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}><NIc name="refresh" size={13} /> {refresh.isPending ? '…' : 'Refresh'}</button>
            <button type="button" disabled={busy} onClick={() => skip.mutate({ day: dayIndex, slot: meal.slot, skipped: true })} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}><NIc name="skip" size={13} /> {skip.isPending ? '…' : 'Skip'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Left rail — day name, date, daily overview stats, balance note. */
function DailyOverviewPanel({ d, date, note }: { d: ComposedDay; date: Date; note: string }) {
  const t = d.totals as Totals;
  const rows: [string, string, string][] = [
    ['flame', `${Math.round(t.kcal)}`, 'Calories'], ['leaf', `${Math.round(t.protein)}g`, 'Protein'],
    ['wheat', `${Math.round(t.carbs)}g`, 'Carbs'], ['drop', `${Math.round(t.fat)}g`, 'Fat'], ['sprout', `${Math.round(t.fiber)}g`, 'Fibre'],
  ];
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-.01em' }}>{DAY_FULL[d.dayIndex] ?? 'Day'}</h2>
      <div style={{ display: 'inline-block', background: 'var(--ink)', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '4px 12px', borderRadius: 999, marginBottom: 18 }}>{longDate(date)}</div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', background: 'var(--card)', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 15 }}>Daily overview</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rows.map(([ic, v, l]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ color: 'var(--accent)' }}><NIc name={ic} size={20} /></span>
              <div><div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{v}</div><div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{l}</div></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 14, border: '1px dashed var(--line)', borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ color: 'var(--accent)' }}><NIc name="heart" size={16} /></span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.5 }}>{note}</span>
      </div>
    </div>
  );
}

function MacroLine({ ic, label, grams, pct }: { ic: string; label: string; grams: number; pct: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '20px 66px 1fr auto', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--muted)' }}><NIc name={ic} size={16} /></span>
      <span style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{label}</span>
      <span style={{ height: 6, borderRadius: 4, background: 'var(--paper)', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: 'var(--accent)', borderRadius: 4 }} /></span>
      <span style={{ fontSize: 12.5, color: 'var(--ink)', whiteSpace: 'nowrap' }}>{Math.round(grams)}g <span style={{ color: 'var(--muted)' }}>({pct}%)</span></span>
    </div>
  );
}

const DAY_TIPS = ['Drink at least 2–3 litres of water.', 'Include a variety of colourful vegetables.', 'Choose whole grains over refined grains.', 'Stay active and get good-quality sleep.'];

/** The full premium day layout: left overview · meal grid · right nutrition/donut/tips. */
function DayView({ wk, d, dayIndex, date, readOnly }: { wk: ComposedWeek; d: ComposedDay; dayIndex: number; date: Date; readOnly?: boolean }) {
  const t = d.totals as Totals;
  const kcal = Math.max(1, t.kcal);
  const pPct = Math.round((t.protein * 4 / kcal) * 100);
  const cPct = Math.round((t.carbs * 4 / kcal) * 100);
  const fPct = Math.round((t.fat * 9 / kcal) * 100);
  const fibPct = Math.min(100, Math.round((t.fiber / Math.max(1, wk.prescription.fiber)) * 100));
  const note = wk.compliance
    ? (wk.compliance.score >= 80 ? 'Great balance of protein, carbs & healthy fats!' : (wk.compliance.concerns[0]?.message ?? 'A balanced plate for your goals.'))
    : 'A balanced plate for your goals.';
  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow)' };
  const capTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 12 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }} className="tc-planday">
      <DailyOverviewPanel d={d} date={date} note={note} />

      <div>
        {d.fasting && <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>Eating window {d.window.start}–{d.window.end}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 16 }} className="tc-mealgrid2">
          {d.meals.map((m) => <MealColumn key={m.slot} meal={m} dayIndex={dayIndex} readOnly={readOnly} />)}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={card}>
          <div style={capTitle}>Daily nutrition</div>
          <div style={{ textAlign: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1 }}>{Math.round(t.kcal).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Calories</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <MacroLine ic="leaf" label="Protein" grams={t.protein} pct={pPct} />
            <MacroLine ic="wheat" label="Carbs" grams={t.carbs} pct={cPct} />
            <MacroLine ic="drop" label="Fat" grams={t.fat} pct={fPct} />
            <MacroLine ic="sprout" label="Fibre" grams={t.fiber} pct={fibPct} />
          </div>
        </div>

        <div style={card}>
          <div style={capTitle}>Macro breakdown</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Donut t={t} goalPct={Math.round((t.kcal / Math.max(1, wk.prescription.kcal)) * 100)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <Legend color="#3a8a4a" label="Protein" g={t.protein} pct={pPct} />
              <Legend color="#e0a53b" label="Carbs" g={t.carbs} pct={cPct} />
              <Legend color="#7a6ff0" label="Fat" g={t.fat} pct={fPct} />
              <Legend color="#5aa9a0" label="Fibre" g={t.fiber} />
            </div>
          </div>
        </div>

        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--accent)', fontWeight: 800, fontSize: 12.5, letterSpacing: '.06em', textTransform: 'uppercase' }}><NIc name="bulb" size={16} /> Tips for the day</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {DAY_TIPS.map((tip) => (
              <div key={tip} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--accent)', marginTop: 1 }}><NIc name="check" size={14} stroke={2.2} /></span>{tip}
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 1040px){ .tc-planday{ grid-template-columns:1fr !important; } }`}</style>
    </div>
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
  const dates = weekDates();

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 16px 60px' }}>
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
          {/* Premium day tabs — Monday → Sunday with real dates + prev/next. */}
          <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, marginBottom: 8 }}>
            <button type="button" aria-label="Previous day" disabled={day === 0} onClick={() => setDay(Math.max(0, day - 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day === 0 ? 'default' : 'pointer', opacity: day === 0 ? 0.4 : 1 }}><NIc name="chevL" size={18} /></button>
            <div style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 5, scrollbarWidth: 'none' }}>
              {wk.days.map((_, i) => {
                const on = i === day;
                return (
                  <button key={i} type="button" onClick={() => setDay(i)} aria-current={on}
                    style={{ flex: '1 0 auto', minWidth: 84, border: 'none', background: on ? 'var(--accent-soft)' : 'transparent', borderRadius: 11, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: on ? 800 : 700, letterSpacing: '.03em', color: on ? 'var(--accent)' : 'var(--ink-soft)' }}>{DAY_FULL[i].toUpperCase()}</div>
                    <div style={{ fontSize: 10.5, marginTop: 2, color: on ? 'var(--accent)' : 'var(--muted)' }}>{shortDate(dates[i])}</div>
                  </button>
                );
              })}
            </div>
            <button type="button" aria-label="Next day" disabled={day === wk.days.length - 1} onClick={() => setDay(Math.min(wk.days.length - 1, day + 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day === wk.days.length - 1 ? 'default' : 'pointer', opacity: day === wk.days.length - 1 ? 0.4 : 1 }}><NIc name="chevR" size={18} /></button>
          </div>

          {wk.skips && wk.skips.length > 0 && (
            <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', fontSize: 12.5 }}>
              {wk.skips.length} meal{wk.skips.length > 1 ? 's' : ''} skipped this week
              <Button variant="line" size="sm" disabled={restore.isPending} onClick={() => restore.mutate({})}>{restore.isPending ? 'Restoring…' : 'Restore all'}</Button>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <DayView wk={wk} d={d} dayIndex={day} date={dates[day]} readOnly={wk.readOnly} />
          </div>

          <div style={{ marginTop: 22, textAlign: 'center', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 14, padding: '12px 16px', fontSize: 12.5, color: 'var(--muted)' }}>
            Tap any meal to view the full recipe — ingredients &amp; step-by-step instructions.
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
  const date = weekDates()[dailyIdx];

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <div>
          <div className="eyebrow">Nutrition · Today</div>
          <h1 style={{ fontSize: 26 }}>Today's plate</h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="line" size="sm" onClick={() => setShowSettings(true)}>Meal settings</Button>
          <Link to="/nutrition/weekly"><Button variant="line" size="sm">Full week →</Button></Link>
        </div>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: '0 0 16px' }}>
        Your meals for today, on schedule.{wk.fasting ? ` Fasting: ${wk.protocol} (${d.window.start}–${d.window.end}).` : ''}
      </p>
      {wk.blocked && (
        <div role="alert" style={{ background: '#fdecec', border: '1px solid #e0a0a0', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12.5 }}>
          <strong>⚠ This plan could not be fully certified against your medical limits.</strong> Please review with your clinician or dietitian before following it.
        </div>
      )}
      <DayView wk={wk} d={d} dayIndex={dailyIdx} date={date} readOnly={wk.readOnly} />
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
