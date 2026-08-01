import { useState, useRef, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AllergyNote, Card, Spinner, EmptyState, Button, Chip, Modal } from '@/components/ui';
import {
  useComposedPlan, useMealSettings, useSaveMealSettings,
  useRestoreSkips, useRenewPlan, useLockDay, useUnlockDay,
  type CuisineBucket, type ComposedDay, type ComposedWeek, type Scorecard,
} from '../composed.api';
import { useHealthScore } from '@/features/profile/hooks';
import { ComposedMealCard, SkippedMealCard } from '../components/ComposedMealCard';
import { skippedSlotsFor, skippedRolesFor } from '../skips';
import { TargetsDisclosure, TargetsRefusal } from '../components/TargetsDisclosure';
import { NIc } from '../components/NIcon';
import { balanceNote, dayBalance } from '../dayBalance';

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


/* ─────────────────────── Premium day view (weekly + daily redesign) ─────────────────────── */
const WEEKDAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
/** Midnight local for a plan-start ISO date (YYYY-MM-DD); today if absent/invalid. */
function planStart(iso?: string): Date {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return t;
  const d = new Date(iso + 'T00:00:00'); d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? t : d;
}
/** `n` consecutive dates from a start date. */
function datesFrom(start: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => { const dd = new Date(start); dd.setDate(start.getDate() + i); return dd; });
}
/** Whole days between the start date and today (0 = today is the start day). */
function dayOffset(start: Date): number {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - start.getTime()) / 86400000);
}
const weekdayFull = (d: Date) => WEEKDAY_FULL[d.getDay()];
const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase();
const longDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });


/** Left rail — day name, date, daily overview stats, balance note. */
function DailyOverviewPanel({ d, date, note }: { d: ComposedDay; date: Date; note: string }) {
  const t = d.totals as Totals;
  const rows: [string, string, string][] = [
    ['flame', `${Math.round(t.kcal)}`, 'Calories'], ['leaf', `${Math.round(t.protein)}g`, 'Protein'],
    ['wheat', `${Math.round(t.carbs)}g`, 'Carbs'], ['drop', `${Math.round(t.fat)}g`, 'Fat'], ['sprout', `${Math.round(t.fiber)}g`, 'Fibre'],
  ];
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--serif)', fontSize: 30, fontWeight: 600, margin: '0 0 6px', letterSpacing: '-.01em' }}>{weekdayFull(date)}</h2>
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

/**
 * What this day's menu would put in the basket.
 *
 * Built entirely from ingredients already on the page — every component carries
 * its own list — so this is a view of the day, not a second source of truth
 * beside the grocery list. That matters, because the grocery list is built from
 * LOCKED days only, and an unlocked day is a plan, not a decision.
 *
 * So the panel says which of the two it is looking at. Showing an unlocked
 * day's ingredients under a heading that implies they are on the list would be
 * the screen claiming a decision the citizen has not made.
 *
 * Pantry staples are counted and not listed. Nobody shops for salt, and a list
 * whose first four lines are salt, oil, water and sugar buries the four things
 * you actually have to buy.
 */
function DayShoppingPanel({ d, dayIndex, locked, skips }: {
  d: ComposedDay; dayIndex: number; locked: boolean; skips: string[];
}) {
  const merged = new Map<string, number>();
  let pantry = 0;
  for (const meal of d.meals) {
    const off = skippedRolesFor(skips, dayIndex, meal.slot);
    for (const c of meal.components) {
      if (off.has(c.role)) continue;           // a skipped dish is not shopping
      for (const ing of c.ingredients ?? []) {
        if (ing.pantry || ing.toTaste) { pantry += 1; continue; }
        const key = ing.name.trim();
        if (!key) continue;
        merged.set(key, (merged.get(key) ?? 0) + (ing.grams || 0));
      }
    }
  }
  const items = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const shown = items.slice(0, 8);
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 12 }}>
        This day&rsquo;s shopping
      </div>
      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
          Nothing to buy for this day beyond what a kitchen already keeps.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {shown.map(([name, grams]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                <span style={{ color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>{Math.round(grams)} g</span>
              </div>
            ))}
          </div>
          {items.length > shown.length && (
            <p className="muted" style={{ fontSize: 11.5, margin: '9px 0 0' }}>
              and {items.length - shown.length} more.
            </p>
          )}
          {pantry > 0 && (
            <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0', lineHeight: 1.5 }}>
              {pantry} pantry item{pantry === 1 ? "" : "s"} (salt, oil and the like) left off &mdash; you almost certainly have them.
            </p>
          )}
        </>
      )}
      <p style={{ fontSize: 11.5, margin: '11px 0 0', lineHeight: 1.55, color: 'var(--ink-soft)' }}>
        {locked
          ? <>This day is locked, so these are already on your{' '}<Link to="/nutrition/grocery" style={{ color: 'var(--accent)', fontWeight: 600 }}>grocery list</Link>.</>
          : <>Not on your grocery list yet &mdash; lock the day to add them.</>}
      </p>
    </div>
  );
}

/**
 * About this menu — what can be said about the day from the day itself.
 *
 * Deliberately only facts already on the page: how many dishes, how long they
 * take, which cuisines are in it, and how much of the micronutrient picture we
 * could actually compute. That last line is the one worth having. The nutrition
 * panel above prints sodium and potassium, and it prints them only for the
 * dishes whose ingredients we recognise; without a count, a citizen reading a
 * sodium figure has no way to know it is a figure for part of their day.
 */
function AboutThisMenu({ d }: { d: ComposedDay }) {
  const comps = d.meals.flatMap((m) => m.components);
  const cuisines = [...new Set(comps.map((c) => (c.cuisine ?? "").trim()).filter(Boolean))];
  const minutes = d.meals.reduce((t, m) => t + (m.minutes || 0), 0);
  const complete = comps.filter((c) => c.nutrientComplete).length;
  const facts: string[] = [
    `${comps.length} dish${comps.length === 1 ? "" : "es"} across ${d.meals.length} meal${d.meals.length === 1 ? "" : "s"}.`,
    `About ${minutes} minutes of cooking in total.`,
  ];
  if (cuisines.length) {
    facts.push(cuisines.length <= 3
      ? `${cuisines.join(", ")}.`
      : `${cuisines.slice(0, 3).join(", ")} and ${cuisines.length - 3} more.`);
  }
  if (d.fasting) facts.push(`Everything falls inside ${d.window.start}\u2013${d.window.end}.`);
  if (comps.length) {
    facts.push(complete === comps.length
      ? "Sodium and potassium are computed from every dish here."
      : `Sodium and potassium come from ${complete} of these ${comps.length} dishes \u2014 the rest have ingredients we cannot yet measure, so those figures are a floor, not a total.`);
  }
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 12 }}>
        About this menu
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {facts.map((f) => (
          <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
            <span style={{ color: 'var(--accent)', marginTop: 1 }}><NIc name="check" size={14} stroke={2.2} /></span>{f}
          </div>
        ))}
      </div>
    </div>
  );
}

const DAY_TIPS = ['Drink at least 2\u20133 litres of water.', 'Include a variety of colourful vegetables.', 'Choose whole grains over refined grains.', 'Stay active and get good-quality sleep.'];

/** The full premium day layout: left overview · meal grid · right nutrition/donut/tips. */
/**
 * Lock this day — and put its shopping in the basket.
 *
 * The two halves are one action on purpose. Locking a day IS the moment a plan
 * becomes a shopping trip, and asking somebody to press a second button to say
 * so is the app failing to notice what they just decided.
 *
 * Then it moves on. Staying on a day you have just settled leaves you looking
 * at a screen with nothing left to do on it; the next unlocked day is where the
 * work is. The server decides which day that is, because the server knows which
 * ones are already locked.
 */
function DayLock({ dayIndex, date, locked, lastDay, onMoveTo }: {
  dayIndex: number; date: Date; locked: boolean; lastDay: number; onMoveTo: (d: number) => void;
}) {
  const lock = useLockDay();
  const unlock = useUnlockDay();
  const [said, setSaid] = useState<string | null>(null);

  if (locked) {
    return (
      <div className="card" style={{ marginTop: 12, padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderColor: 'var(--accent)' }}>
        <span aria-hidden="true" style={{ fontSize: 18 }}>🔒</span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>This menu is locked</div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            Nothing on {weekdayFull(date)} will change, and its ingredients are on your grocery list.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
            {weekdayFull(date)} {shortDate(date)}
          </span>
          <Button variant="line" size="sm" disabled={unlock.isPending} onClick={() => unlock.mutate({ day: dayIndex })}>
            {unlock.isPending ? 'Unlocking…' : 'Unlock'}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: '13px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span aria-hidden="true" style={{ fontSize: 18 }}>🔓</span>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Happy with {weekdayFull(date)}?</div>
        <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
          Locking stops this day changing and puts its ingredients on your grocery list.
        </div>
        {said && <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--accent)' }}>{said}</div>}
      </div>
      {/* The date sits beside the button, not only in the heading, because the
          button is the thing being pressed and "which day am I committing?" is
          the question worth answering at the point of commitment. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-soft)', whiteSpace: 'nowrap' }}>
          {weekdayFull(date)} {shortDate(date)}
        </span>
        <Button
          variant="accent" size="sm" disabled={lock.isPending}
          onClick={() => lock.mutate({ day: dayIndex }, {
            onSuccess: (r) => {
              // Only ever claim what happened. The basket write is allowed to
              // fail without failing the lock, so the sentence has two versions.
              setSaid(r.groceryAdded
                ? 'Locked, and the ingredients are on your grocery list.'
                : 'Locked. The grocery list didn\'t update just now — you can regenerate it from Grocery.');
              if (r.nextDay !== null && r.nextDay <= lastDay) onMoveTo(r.nextDay);
            },
          })}
        >
          {/* Two things this label gets right, both of them previously wrong.
              It says what the button DOES, both halves — "Lock this menu"
              described only the part you can see, and the groceries were the
              part you would otherwise discover later, in another hub. And the
              padlock is OPEN, because that is the state the day is in right
              now: a closed one showed the destination rather than the fact, and
              contradicted the card's own icon two inches to its left. It closes
              on the locked card and on the day tab, which is where it means
              something. */}
          {lock.isPending ? '🔒 Locking…' : '🔓 Lock menu & add to grocery list'}
        </Button>
      </div>
    </div>
  );
}

/** A locked day, folded down to what it is: a decision, and what you are eating. */
function LockedDaySummary({ d, date }: { d: ComposedDay; date: Date }) {
  const meals = d.meals ?? [];
  return (
    <div className="card" style={{ padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15 }}>{weekdayFull(date)} is settled</strong>
        <span className="muted" style={{ fontSize: 12.5 }}>{meals.length} meal{meals.length === 1 ? '' : 's'}</span>
      </div>
      <ul style={{ margin: '10px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {meals.map((m, i) => (
          <li key={i} style={{ display: 'flex', gap: 10, fontSize: 13.5, alignItems: 'baseline' }}>
            <span className="muted" style={{ minWidth: 74, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.04em' }}>{m.label}</span>
            <span style={{ flex: 1 }}>{m.title}</span>
            <span className="muted" style={{ fontSize: 12 }}>{Math.round(m.totals.kcal)} kcal</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DayView({ wk, d, dayIndex, date, readOnly }: { wk: ComposedWeek; d: ComposedDay; dayIndex: number; date: Date; readOnly?: boolean }) {
  const t = d.totals as Totals;
  const kcal = Math.max(1, t.kcal);
  const pPct = Math.round((t.protein * 4 / kcal) * 100);
  const cPct = Math.round((t.carbs * 4 / kcal) * 100);
  const fPct = Math.round((t.fat * 9 / kcal) * 100);
  const fibPct = Math.min(100, Math.round((t.fiber / Math.max(1, wk.prescription.fiber)) * 100));
  // THIS day against the prescription, each macro on its own. It used to be the
  // WEEK's single compliance score against 80 — so a day nothing like the week
  // it came from was told "Great balance of protein, carbs & healthy fats!" on
  // the strength of an average that protein had not contributed to. See
  // dayBalance.ts for why the bands are not symmetric.
  const note = balanceNote(dayBalance(t, wk.prescription, wk.prescription.assumed));
  const skips = wk.skips ?? [];
  const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow)' };
  const capTitle: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 12 };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 300px', gap: 22, alignItems: 'start' }} className="tc-planday">
      <DailyOverviewPanel d={d} date={date} note={note} />

      <div>
        {d.fasting && <p className="muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>Eating window {d.window.start}–{d.window.end}</p>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))', gap: 16 }} className="tc-mealgrid2">
          {d.meals.map((m) => <ComposedMealCard key={m.slot} meal={m} dayIndex={dayIndex} readOnly={readOnly} skips={skips} />)}
          {/* A skipped meal leaves the composer's output entirely, so without
              this its slot is simply a gap and the only way back is the
              restore-everything banner. The placeholder holds its place. */}
          {!readOnly && skippedSlotsFor(skips, dayIndex).map((slot) => (
            <SkippedMealCard key={`skipped-${slot}`} dayIndex={dayIndex} slot={slot} />
          ))}
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

        {/* The rail carries the day's shopping and what can honestly be said
            about the menu, so the two questions a menu raises — "what do I have
            to buy" and "what am I actually looking at" — are answered beside it
            rather than on another screen. */}
        <DayShoppingPanel d={d} dayIndex={dayIndex} locked={(wk.locks ?? []).includes(dayIndex)} skips={skips} />
        <AboutThisMenu d={d} />

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
            <div style={{ background: s.fastingSafety.level === 'block' ? 'var(--danger-soft)' : 'var(--warn-soft)', border: `1px solid ${s.fastingSafety.level === 'block' ? 'var(--danger-line)' : 'var(--warn-line)'}`, borderRadius: 10, padding: '10px 12px', marginBottom: 10, fontSize: 12.5 }}>
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
  const health = useHealthScore();
  // Selected day + plan MODE live in the URL so returning from a recipe restores them.
  const [sp, setSp] = useSearchParams();
  const mode: 'preferred' | 'optimal' = sp.get('mode') === 'optimal' ? 'optimal' : 'preferred';
  const setMode = (m: 'preferred' | 'optimal') => setSp((p) => { p.set('mode', m); return p; }, { replace: true });
  const plan = useComposedPlan(mode);
  const settingsSave = useSaveMealSettings();
  const setDay = (i: number) => setSp((p) => { p.set('day', String(i)); return p; }, { replace: true });
  const [showSettings, setShowSettings] = useState(false);
  const [tab, setTab] = useState<'plan' | 'grocery'>('plan');
  const restore = useRestoreSkips();
  const renew = useRenewPlan();

  // Keep the selected day visible: scroll the strip so the active tab centres as
  // you move right/left, and on first load so "Today" is in view. (Declared before
  // the early returns so hook order stays stable.)
  const stripRef = useRef<HTMLDivElement>(null);
  const dayKey = sp.get('day');
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [dayKey, plan.data]);

  if (plan.isLoading) return <Spinner label="Composing your plan…" />;
  if (plan.isError || !plan.data) {
    return (
      <EmptyState
        title="Couldn't build your plan"
        hint="Either your food preferences aren't filled in yet, or building the week took longer than we allow. Reload to try again — if it keeps happening, tell us and we'll look."
      />
    );
  }
  if (plan.data.needsProfile) return <ProfileGate />;

  // BE-7.4, the owner's ruling: refuse, don't approximate.
  //
  // Until now this page showed the plan and put the refusal UNDERNEATH it — a
  // week of portioned meals sized from REFERENCE_BODY (70 kg, 172 cm, 30,
  // male) with a note below explaining the body it was sized for was not
  // theirs. A 52 kg woman was served a man's maintenance energy, plated, seven
  // days of it, and asked to read the small print.
  //
  // `readiness` is optional and only an explicit { ok: false } refuses. An
  // older API that does not send it leaves the page exactly as it was, rather
  // than emptying the hub on a field that happens to be missing.
  const readiness = plan.data.prescription?.readiness;
  if (readiness && !readiness.ok) {
    return (
      <div style={{ maxWidth: 560, margin: '48px auto', padding: '0 16px' }}>
        <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>We can’t size a plan for you yet</h1>
        <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.6, margin: '0 0 4px' }}>
          A meal plan is portions, and portions come from a body. We’d rather ask
          than guess — a week of meals measured for somebody else isn’t a plan,
          it’s a plan for somebody else.
        </p>
        <TargetsRefusal r={readiness} />
      </div>
    );
  }

  const wk = plan.data;
  // FE-8.1's gate, decided server-side. `undefined` while the score loads —
  // treated the same as unknown, so the plan is offered rather than hidden.
  const gate = health.data?.optimalHealth;
  const start = planStart(wk.planStartDate);
  const dates = datesFrom(start, wk.days.length);
  const offset = dayOffset(start);
  const todayIdx = Math.max(0, Math.min(wk.days.length - 1, offset));
  const planEnded = offset >= wk.days.length;        // today is past the 3-week block
  const endDate = dates[dates.length - 1];
  // Default the strip to today; an explicit ?day= wins so navigation is shareable.
  const dayParam = sp.get('day');
  const day = Math.max(0, Math.min(wk.days.length - 1, dayParam !== null ? (Number(dayParam) || 0) : todayIdx));
  const d = wk.days[day];

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

      {/*
        FE-8.1 (p9): Optimal Health is offered only when there is something for
        it to improve. Above the threshold the toggle collapses to one line
        rather than presenting a second plan to somebody whose recorded markers
        are already fine.

        The gate is the SERVER'S — the threshold is config, not a literal here,
        and it fails open: an unknown score shows the plan, because absence of
        evidence is not evidence of health.
      */}
      {gate && !gate.show ? (
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 14px', padding: '10px 14px', border: '1px solid var(--line)', borderRadius: 10 }}>
          {gate.confirmation}
        </p>
      ) : (
      <>
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
      </>
      )}

      {/* The plan says what the allergy rule kept out of it. The propagation has
          been silent since BE-8.4 shipped it — a citizen could not tell their
          own rule from the limits of our corpus. (K5.66) */}
      <AllergyNote notice={wk.allergyNotice} />

      {/* Both scores for THIS plan + the one-line difference vs the other mode. */}
      {wk.scorecard && <PlanScorecard sc={wk.scorecard} />}

      {/* Medical-guidance banner (preferred mode) — inform, offer the healthier plan, never force. */}
      {mode === 'preferred' && wk.compliance && wk.compliance.concerns.length > 0 && (
        <div style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok-line)', borderRadius: 10, padding: '11px 14px', marginBottom: 12, fontSize: 12.5 }}>
          {/* Deliberately no percentage here. The scorecard directly above already
              shows the health score, and this banner used to print a SECOND,
              separately-computed number for the same idea — 0/100 in the circle
              and "2% aligned" one line below it. Two numbers answering one
              question, disagreeing, is worse than either alone. This says what
              is wrong and what to do about it; the scorecard says how far off. */}
          <strong>Medical guidance:</strong> {wk.compliance.concerns[0].message} You can keep your preferences, or
          {' '}<button type="button" onClick={() => setMode('optimal')} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>see the Optimal Health plan →</button>
        </div>
      )}

      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
        Complete meals from your prescription ({wk.prescription.kcal} kcal · {wk.prescription.protein} g protein).
        {wk.fasting ? ` Intermittent fasting: ${wk.protocol}.` : ''}
      </p>

      {/* FE-7.1. Directly under the number it explains, because a disclosure
          somewhere else on the page is one nobody connects to the figure they
          are doubting. It also carries the refusal when the profile is missing
          something the equation needs. */}
      <TargetsDisclosure p={wk.prescription} />

      {/* 3-week plan window + review prompt (planned in one go; adjust after it ends). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: planEnded ? 'var(--warn-soft)' : 'var(--accent-soft)', border: `1px solid ${planEnded ? 'var(--warn-line)' : 'var(--line)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5 }}>
        <span style={{ flex: 1, minWidth: 220 }}>
          {planEnded
            ? <><strong>Your 3-week plan has ended.</strong> Start a fresh one and we’ll plan the next three weeks from today.</>
            : <><strong>3-week plan</strong> · {longDate(start)} – {longDate(endDate)}. Follow it through, then come back after {longDate(endDate)} to review &amp; adjust.</>}
        </span>
        {!wk.readOnly && (
          <Button variant="line" size="sm" disabled={renew.isPending}
            onClick={() => { if (window.confirm('Start a fresh 3-week plan from today? This replaces the current plan and clears your swaps/skips.')) renew.mutate({}); }}>
            {renew.isPending ? 'Planning…' : (planEnded ? 'Start new 3-week plan' : 'Start fresh plan')}
          </Button>
        )}
      </div>
      {wk.blocked && (
        <div role="alert" style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-line)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, fontSize: 12.5 }}>
          <strong>⚠ This plan could not be fully certified against your medical limits.</strong>
          <div style={{ marginTop: 4 }}>We couldn’t keep every day within your clinical targets with the recipes available. Please review with your clinician or dietitian before following it.</div>
          {wk.blockReason?.length ? <ul style={{ margin: '6px 0 0 16px' }}>{wk.blockReason.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul> : null}
        </div>
      )}
      {wk.degraded && (
        <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          {wk.degradedReason ?? 'This is a general starter plan — reload to personalise it.'}
        </div>
      )}
      {wk.basedOnFamily && (
        <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
          Based on <strong>{wk.basedOnFamily.ownerName}'s</strong> family meal plan — same dishes and times, portions scaled to your needs ({Math.round(wk.basedOnFamily.factor * 100)}%). This view is read-only.
        </div>
      )}

      {!wk.validation.ok && (
        <div style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn-line)', borderRadius: 10, padding: '10px 12px', marginBottom: 12, fontSize: 12.5 }}>
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
            <div ref={stripRef} style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 5, scrollbarWidth: 'none' }}>
              {wk.days.map((_, i) => {
                const on = i === day;
                const isToday = i === todayIdx && !planEnded;
                return (
                  <button key={i} type="button" onClick={() => setDay(i)} aria-current={on} data-active={on ? 'true' : undefined}
                    style={{ flex: '1 0 auto', minWidth: 84, border: 'none', background: on ? 'var(--accent-soft)' : 'transparent', borderRadius: 11, padding: '8px 12px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center' }}>
                    <div style={{ fontSize: 12, fontWeight: on ? 800 : 700, letterSpacing: '.03em', color: on ? 'var(--accent)' : 'var(--ink-soft)' }}>
                      {(wk.locks ?? []).includes(i) ? '🔒 ' : ''}{isToday ? 'TODAY' : weekdayFull(dates[i]).toUpperCase()}
                    </div>
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

          <DayLock
            dayIndex={day}
            date={dates[day]}
            locked={(wk.locks ?? []).includes(day)}
            lastDay={wk.days.length - 1}
            onMoveTo={setDay}
          />

          <div style={{ marginTop: 14 }}>
            {(wk.locks ?? []).includes(day)
              /* Collapsed on purpose: a locked day is a decision already made,
                 and re-reading it is not what you came back for. The summary
                 stays so it is still a menu, not just a padlock. */
              ? <LockedDaySummary d={d} date={dates[day]} />
              : <DayView wk={wk} d={d} dayIndex={day} date={dates[day]} readOnly={wk.readOnly} />}
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
