import { useState, useRef, useEffect, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AllergyNote, Card, Spinner, EmptyState, Button, Chip, Modal } from '@/components/ui';
import {
  useComposedPlan, useMealSettings, useSaveMealSettings,
  useRestoreSkips, useRenewPlan, useLockDay, useUnlockDay,
  type CuisineBucket, type ComposedDay, type ComposedWeek, type Scorecard, type PlanScope,
} from '../composed.api';
import { useHealthScore } from '@/features/profile/hooks';
import { SkippedMealCard } from '../components/ComposedMealCard';
import { PressDay, PressRing, AboutThisMenu } from '../components/PressDay';
import { PlannerModeToggle } from '../components/PlannerModeToggle';
import { usePlannerMode } from '../plannerMode';
import { skippedSlotsFor, skippedRolesFor } from '../skips';
import { SLOT_CUISINES, slotCuisineLabel } from '../cuisineMix';
import { TargetsDisclosure, TargetsRefusal } from '../components/TargetsDisclosure';
import { NIc } from '../components/NIcon';
import { balanceNote, balanceHead, dayBalance } from '../dayBalance';

/** Master-source-of-truth gate: no plan until the Food Preference Profile is saved. */
function ProfileGate() {
  return (
    <div className="page-note centred">
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
      {/* THE PROSE AND THE TWO LISTS ARE GONE, THE DIALS STAY. Removed at the
          owner's word: the paragraph restated both dials in words, and the two
          columns under it printed twelve figures — sodium, saturated fat,
          potassium, phosphorus, protein-source and cuisine ratios — none of
          which the page asks anybody to act on. The scores are the answer to
          "which plan is this"; the audit behind them was not the question.

          `sc.summary`, `sc.healthNotes` and `sc.preferenceNotes` are still on
          the API and still computed. Nothing here reads them, which is the
          cheap way back if they should return somewhere quieter. */}
    </Card>
  );
}

type Totals = { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sodiumMg?: number };

const PROTOCOLS = ['12:12', '14:10', '16:8', '18:6', '20:4', 'omad'];
const BUCKETS: { key: CuisineBucket; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
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
function DayShoppingPanel({ d, dayIndex, locked, skips, bare }: {
  d: ComposedDay; dayIndex: number; locked: boolean; skips: string[]; bare?: boolean;
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
  // BARE is the printed sheet asking for the CONTENTS and nothing else. The
  // recto supplies its own plate and its own heading, and an inline card style
  // beats every stylesheet in Relief — so the card cannot be turned off from
  // the outside, only from here.
  const Shell = bare
    ? ({ children }: { children: ReactNode }) => <div>{children}</div>
    : ({ children }: { children: ReactNode }) => (
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, padding: '16px 18px', boxShadow: 'var(--shadow)' }}>{children}</div>
    );
  return (
    <Shell>
      {bare
        ? <p className="press-lab">This day&rsquo;s shopping</p>
        : (
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'center', marginBottom: 12 }}>
            This day&rsquo;s shopping
          </div>
        )}
      {items.length === 0 ? (
        <p className="muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>
          Nothing to buy for this day beyond what a kitchen already keeps.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {shown.map(([name, grams]) => (
              <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: bare ? 14 : 12.5, lineHeight: bare ? 1.85 : 1.5 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{Math.round(grams)} g</span>
              </div>
            ))}
          </div>
          {items.length > shown.length && (
            <p className="muted" style={{ fontSize: bare ? 13.5 : 11.5, margin: '9px 0 0' }}>
              and {items.length - shown.length} more.
            </p>
          )}
          {pantry > 0 && (
            <p className="muted" style={{ fontSize: bare ? 12.5 : 11.5, margin: '6px 0 0', lineHeight: 1.55 }}>
              {pantry} pantry item{pantry === 1 ? "" : "s"} (salt, oil and the like) left off &mdash; you almost certainly have them.
            </p>
          )}
        </>
      )}
      <p style={{ fontSize: bare ? 12.5 : 11.5, margin: '11px 0 0', lineHeight: 1.6, color: 'var(--ink-soft)' }}>
        {locked
          ? <>This day is locked, so these are already on your{' '}<Link to="/nutrition/grocery" style={{ color: 'var(--accent-ink)', fontWeight: 600 }}>grocery list</Link>.</>
          : <>Not on your grocery list yet &mdash; lock the day to add them.</>}
      </p>
    </Shell>
  );
}

/**
 * Lock this day — and put its shopping in the basket.
 *
 * The two halves are one action on purpose. Locking a day IS the moment a plan
 * becomes a shopping trip, and asking somebody to press a second button to say
 * so is the app failing to notice what they just decided.
 *
 * Then it moves on. Staying on a day you have just locked leaves you looking
 * at a screen with nothing left to do on it; the next unlocked day is where the
 * work is. The server decides which day that is, because the server knows which
 * ones are already locked.
 */
function DayLock({ dayIndex, date, locked, lastDay, onMoveTo, planMode }: {
  dayIndex: number; date: Date; locked: boolean; lastDay: number; onMoveTo: (d: number) => void;
  /** Which plan model is SHOWING — the menu being read is the menu being
   *  locked, and the basket shops that menu for this day. */
  planMode: 'preferred' | 'optimal';
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
        {said && <div style={{ fontSize: 12.5, marginTop: 6, color: 'var(--accent-ink)' }}>{said}</div>}
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
          onClick={() => lock.mutate({ day: dayIndex, planMode }, {
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
        <strong style={{ fontSize: 15 }}>{weekdayFull(date)}'s menu is locked</strong>
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


function DayView({ wk, d, dayIndex, date, readOnly, lock }: { wk: ComposedWeek; d: ComposedDay; dayIndex: number; date: Date; readOnly?: boolean; lock?: ReactNode }) {
  const t = d.totals as Totals;
  const kcal = Math.max(1, t.kcal);
  const pPct = Math.round((t.protein * 4 / kcal) * 100);
  const cPct = Math.round((t.carbs * 4 / kcal) * 100);
  const fPct = Math.round((t.fat * 9 / kcal) * 100);
  const fibPct = Math.min(100, Math.round((t.fiber / Math.max(1, wk.prescription.fiber)) * 100));
  const kcalPct = Math.min(100, Math.round((t.kcal / Math.max(1, wk.prescription.kcal)) * 100));
  // THIS day against the prescription, each macro on its own. It used to be the
  // WEEK's single compliance score against 80 — so a day nothing like the week
  // it came from was told "Great balance of protein, carbs & healthy fats!" on
  // the strength of an average that protein had not contributed to. See
  // dayBalance.ts for why the bands are not symmetric.
  const verdict = dayBalance(t, wk.prescription, wk.prescription.assumed);
  // SEEDED BY THE DAY so a week of similar days does not print one sentence
  // seven times. Same fact, same numbers, different wording — see dayBalance.ts.
  const note = balanceNote(verdict, dayIndex);
  const head = balanceHead(verdict, dayIndex);
  const skips = wk.skips ?? [];
  const n = (v: number) => Math.round(v).toLocaleString('en-IN');

  // THE PRINTED DAY LIVES IN components/PressDay.tsx NOW, because the family
  // planner has to look identical and the only way two pages stay identical is
  // for there to be one of them. What differs between a citizen's day and a
  // household's is passed in as slots; the sheet itself is shared.
  return (
    <PressDay
      d={d} date={date} dayIndex={dayIndex} dayCount={wk.days.length}
      note={note} head={head} readOnly={readOnly} skips={skips}
      sign="nutrition // the printed day"
      summary={<>
        <div><dt>Calories</dt><dd>{n(t.kcal)}<small>kcal</small></dd><span className="press-pc">{kcalPct}% of target</span></div>
        <div><dt>Protein</dt><dd>{n(t.protein)}<small>g</small></dd><span className="press-pc">{pPct}%</span></div>
        <div><dt>Carbohydrate</dt><dd>{n(t.carbs)}<small>g</small></dd><span className="press-pc">{cPct}%</span></div>
        <div><dt>Fat</dt><dd>{n(t.fat)}<small>g</small></dd><span className="press-pc">{fPct}%</span></div>
        <div><dt>Fibre</dt><dd>{n(t.fiber)}<small>g</small></dd><span className="press-pc">{fibPct}%</span></div>
      </>}
      action={lock}
      aboutLeft={<AboutThisMenu d={d} />}
      aboutRight={<DayShoppingPanel d={d} dayIndex={dayIndex} locked={(wk.locks ?? []).includes(dayIndex)} skips={skips} bare />}
      totals={<>
        <div><dt>Calories</dt><dd>{n(t.kcal)}</dd></div>
        <div><dt>Protein</dt><dd>{n(t.protein)}g</dd></div>
        <div><dt>Carbs</dt><dd>{n(t.carbs)}g</dd></div>
        <div><dt>Fat</dt><dd>{n(t.fat)}g</dd></div>
        <div><dt>Fibre</dt><dd>{n(t.fiber)}g</dd></div>
      </>}
      restored={!readOnly && skippedSlotsFor(skips, dayIndex).map((slot) => (
        <SkippedMealCard key={`skipped-${slot}`} dayIndex={dayIndex} slot={slot} />
      ))}
      under={<>
        <div>
          <p className="press-lab">Macro breakdown</p>
          <div className="press-ring">
            <PressRing kcal={t.kcal} p={pPct} c={cPct} f={fPct} />
            <div className="press-key">
              <div><i style={{ background: 'var(--press-macro-1)' }} /><span className="press-l">Protein</span><span className="press-n">{n(t.protein)}g · {pPct}%</span></div>
              <div><i style={{ background: 'var(--press-macro-2)' }} /><span className="press-l">Carbs</span><span className="press-n">{n(t.carbs)}g · {cPct}%</span></div>
              <div><i style={{ background: 'var(--press-macro-3)' }} /><span className="press-l">Fat</span><span className="press-n">{n(t.fat)}g · {fPct}%</span></div>
            </div>
          </div>
          <p className="press-desc" style={{ marginTop: 14 }}>
            Fibre sits outside the ring — {n(t.fiber)}&nbsp;g today, against {n(wk.prescription.fiber)}&nbsp;g.
          </p>
        </div>
        <aside className="press-aside">
          <section>
            <h3>Nutrition summary</h3>
            <div className="press-bar"><span className="press-lab">Calories</span><span className="press-track"><i style={{ width: `${kcalPct}%` }} /></span><span className="press-val">{n(t.kcal)}<em>kcal</em></span></div>
            <div className="press-bar"><span className="press-lab">Protein</span><span className="press-track"><i style={{ width: `${pPct}%` }} /></span><span className="press-val">{n(t.protein)}g<em>{pPct}%</em></span></div>
            <div className="press-bar"><span className="press-lab">Carbs</span><span className="press-track"><i style={{ width: `${cPct}%` }} /></span><span className="press-val">{n(t.carbs)}g<em>{cPct}%</em></span></div>
            <div className="press-bar"><span className="press-lab">Fat</span><span className="press-track"><i style={{ width: `${fPct}%` }} /></span><span className="press-val">{n(t.fat)}g<em>{fPct}%</em></span></div>
            <div className="press-bar"><span className="press-lab">Fibre</span><span className="press-track"><i style={{ width: `${fibPct}%` }} /></span><span className="press-val">{n(t.fiber)}g<em>{fibPct}%</em></span></div>
          </section>
        </aside>
      </>}
    />
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
          <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
            Set which cuisines each meal draws from. Lock a meal to allow only those cuisines —
            and keep &ldquo;Anything&rdquo; on if you still want fruit, nuts and eggs, which belong to no
            cuisine and are excluded by a lock without it.
          </p>
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
                {SLOT_CUISINES.map((c) => {
                  const w = cuisineBySlot[b.key]?.[c] ?? 0;
                  return (
                    <Chip key={c} selected={w > 0} onClick={() => setCuisine(b.key, c, w > 0 ? 0 : 100)}>
                      {slotCuisineLabel(c)}
                    </Chip>
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
  // Family or individual. Everything for this existed and nothing joined it up:
  // `useComposedPlan` has always taken a scope, the server has always answered
  // 'household', `usePlannerMode` knew whether the household offers a shared
  // plan, and `PlannerModeToggle` was built to switch it — and this page called
  // `useComposedPlan(mode)` with no scope, so it always got 'self'. A household
  // with Family Meal Planning switched ON could not reach its shared plan from
  // the planner at all. Not a dead export: an unreachable feature.
  const planner = usePlannerMode();
  // WAIT FOR `ready`. canUseFamily is derived from a query, so on the first
  // paint it is false and the scope resolves to 'self'; a tick later the family
  // query settles, canUseFamily flips true, and the scope becomes 'household'.
  // That is a different query key, so the planner fired TWO composed builds and
  // threw the first away — the expensive one, on every single load. `ready` has
  // been returned by this hook since it was written and nothing read it.
  const scope: PlanScope = planner.ready && planner.canUseFamily && planner.mode === 'family'
    ? 'household' : 'self';
  const plan = useComposedPlan(mode, scope, { enabled: planner.ready });
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
    // A DEAD END WITH A DOOR IN IT.
    //
    // The planner opens on the SHARED plan whenever the household has Family
    // Meal Planning on — that is `usePlannerMode`'s default. So when the
    // household build is the one that fails, this early return replaced the
    // whole page, toggle and all, and a citizen whose own individual plan was
    // building perfectly well had no way to reach it. The only exit was to
    // know that the switch existed, on a page that was no longer rendering it.
    //
    // The switch comes with the error now, and the message says which plan
    // failed rather than guessing at a cause it cannot know.
    const householdFailed = scope === 'household';
    return (
      <div>
        {planner.canUseFamily && (
          <PlannerModeToggle mode={planner.mode} onChange={planner.setMode} busy={plan.isFetching} />
        )}
        <EmptyState
          title={householdFailed ? "Couldn't build your family's plan" : "Couldn't build your plan"}
          hint={householdFailed
            ? 'Your own plan may still be fine — switch to Individual Plan above to check. If the family plan keeps failing, tell us and we will look.'
            : "Either your food preferences aren't filled in yet, or building the week took longer than we allow. Reload to try again — if it keeps happening, tell us and we'll look."}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
          <Button variant="line" size="sm" disabled={plan.isFetching} onClick={() => void plan.refetch()}>
            {plan.isFetching ? 'Trying again…' : 'Try again'}
          </Button>
          {householdFailed && (
            <Button variant="accent" size="sm" onClick={() => planner.setMode('individual')}>
              Show my own plan
            </Button>
          )}
        </div>
      </div>
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
      <div className="page-note">
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
  const planEnded = offset >= wk.days.length;        // today is past the plan's month (timezone edge)
  const endDate = dates[dates.length - 1];
  // Default the strip to today; an explicit ?day= wins so navigation is shareable.
  // THE RAIL STARTS AT TODAY. A planner that opens on the 3rd when it is the
  // 13th is ten mornings nobody can cook again, scrolled past before the day
  // that matters. Past days keep their locks, their history and their place in
  // the basket's arithmetic - they just stop being offered as places to go,
  // and a link that points at one snaps forward to today.
  const dayParam = sp.get('day');
  const day = Math.max(todayIdx, Math.min(wk.days.length - 1, dayParam !== null ? (Number(dayParam) || 0) : todayIdx));
  const d = wk.days[day];
  // THE RAIL IS THE MONTH: today through the month's last day, one scroll by
  // date. The week/two-week window went with the rolling block — a month
  // plan's horizon is the calendar's, not a chosen span.
  const lastVisible = wk.days.length - 1;

  return (
    <div data-press className="press-page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="eyebrow">Nutrition · Meal Plan</div>
          <h1 style={{ fontSize: 26 }}>Weekly Meal Plan</h1>
          <p className="muted" style={{ fontSize: 13, margin: '2px 0 0' }}>Personalized for your goals, preferences &amp; health.</p>
        </div>
        {!wk.readOnly && <Button variant="line" size="sm" onClick={() => setShowSettings(true)}>Meal settings</Button>}
      </div>

      {/* THE FAMILY / INDIVIDUAL SWITCH IS NOT HERE ANY MORE. Removed at the
          owner's word: the hub rail already carries Individual and Family as its
          top two entries, so this was a second door into the same room, sitting
          above a page that had just told you which room you were in.

          IT SURVIVES IN EXACTLY ONE PLACE — the error state further up, where a
          household plan that failed to build would otherwise leave somebody with
          no way back to their own. That instance is not a duplicate of this one;
          it is the only switch reachable when the page has nothing else on it,
          and its own comment says so. Deleting it too would restore a bug that
          was deliberately fixed. */}

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

      {/* THE MEDICAL-GUIDANCE BANNER WAS REMOVED HERE TOO, same word, same
          reason: it named one concern out of the list above it and repeated a
          figure the dial already gave. `wk.compliance.concerns` is untouched on
          the API — MedicalRecs and the medical hub still read it, so the
          information has not left the application, only this page. */}

      <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>
        Complete meals from your prescription ({wk.prescription.kcal} kcal · {wk.prescription.protein} g protein).
        {wk.fasting ? ` Intermittent fasting: ${wk.protocol}.` : ''}
      </p>

      {/* FE-7.1. Directly under the number it explains, because a disclosure
          somewhere else on the page is one nobody connects to the figure they
          are doubting. It also carries the refusal when the profile is missing
          something the equation needs. */}
      <TargetsDisclosure p={wk.prescription} />

      {/* The month's plan window — a new plan is generated on the 1st, same principles. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: planEnded ? 'var(--warn-soft)' : 'var(--accent-soft)', border: `1px solid ${planEnded ? 'var(--warn-line)' : 'var(--line)'}`, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 12.5 }}>
        <span style={{ flex: 1, minWidth: 220 }}>
          {planEnded
            ? <><strong>This month’s plan has ended.</strong> Start a fresh one and we’ll plan the rest of the month from today.</>
            : <><strong>{start.toLocaleDateString('en-IN', { month: 'long' })} plan</strong> · {longDate(start)} – {longDate(endDate)}. A fresh plan begins on {longDate(new Date(endDate.getTime() + 86_400_000))}, built the same way from your profile.</>}
        </span>
        {!wk.readOnly && (
          <Button variant="line" size="sm" disabled={renew.isPending}
            onClick={() => { if (window.confirm('Start a fresh plan for this month? This replaces the current plan and clears your swaps/skips.')) renew.mutate({}); }}>
            {renew.isPending ? 'Planning…' : (planEnded ? 'Start new plan' : 'Start fresh plan')}
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
            <button type="button" aria-label="Previous day" disabled={day <= todayIdx} onClick={() => setDay(Math.max(todayIdx, day - 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day <= todayIdx ? 'default' : 'pointer', opacity: day <= todayIdx ? 0.4 : 1 }}><NIc name="chevL" size={18} /></button>
            <div ref={stripRef} style={{ flex: 1, display: 'flex', gap: 2, overflowX: 'auto', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16, padding: 5, scrollbarWidth: 'none' }}>
              {wk.days.map((_, i) => i).filter((i) => i >= todayIdx && i <= lastVisible).map((i) => {
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
            <button type="button" aria-label="Next day" disabled={day >= lastVisible} onClick={() => setDay(Math.min(lastVisible, day + 1))}
              style={{ display: 'grid', placeItems: 'center', width: 34, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--muted)', cursor: day >= lastVisible ? 'default' : 'pointer', opacity: day >= lastVisible ? 0.4 : 1 }}><NIc name="chevR" size={18} /></button>
          </div>

          {wk.skips && wk.skips.length > 0 && (
            <div className="muted" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '10px 0', fontSize: 12.5 }}>
              {wk.skips.length} meal{wk.skips.length > 1 ? 's' : ''} skipped this week
              <Button variant="line" size="sm" disabled={restore.isPending} onClick={() => restore.mutate({})}>{restore.isPending ? 'Restoring…' : 'Restore all'}</Button>
            </div>
          )}

          {/* THE LOCK MOVED ONTO THE SHEET, for the unlocked day only. It is the
              day sheet's one control and it now sits on it. A LOCKED day has no
              sheet to sit on — it collapses to a summary — so it keeps the lock
              above, which is also the only place its Unlock can be. */}
          {(wk.locks ?? []).includes(day) && (
            <DayLock
              dayIndex={day}
              date={dates[day]}
              locked
              lastDay={wk.days.length - 1}
              onMoveTo={setDay}
              planMode={mode}
            />
          )}

          <div style={{ marginTop: 14 }}>
            {(wk.locks ?? []).includes(day)
              /* Collapsed on purpose: a locked day is a decision already made,
                 and re-reading it is not what you came back for. The summary
                 stays so it is still a menu, not just a padlock. */
              ? <>
                  {(wk.lockModes?.[String(day)] ?? 'preferred') !== mode && (
                    /* The menu below is this tab's composition; the LOCKED one
                       lives on the other tab, and the basket follows the lock.
                       Without this line, the summary silently shows food the
                       citizen did not accept. */
                    <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px', lineHeight: 1.6 }}>
                      This day was locked from your {wk.lockModes?.[String(day)] === 'optimal' ? 'Optimal Health' : 'My Preferences'} plan —
                      that menu is what your grocery list shops. Switch tabs above to read it.
                    </p>
                  )}
                  <LockedDaySummary d={d} date={dates[day]} />
                </>
              : (
                <DayView
                  wk={wk} d={d} dayIndex={day} date={dates[day]} readOnly={wk.readOnly}
                  lock={
                    <DayLock
                      dayIndex={day}
                      date={dates[day]}
                      locked={false}
                      lastDay={wk.days.length - 1}
                      onMoveTo={setDay}
                      planMode={mode}
                    />
                  }
                />
              )}
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
