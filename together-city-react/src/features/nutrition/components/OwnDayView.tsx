import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Spinner } from '@/components/ui';
import { VegMark } from './VegMark';
import type { MealComponent, OwnDay, OwnPlan } from '../composed.api';

/**
 * THE DAY A CITIZEN BUILT — ONE DAY OPEN, SET AS A MENU, ON THE CLOCK, INSIDE
 * A MONTH.
 *
 * Everything this page does wrong it does by printing everything at once.
 *
 * ONE DAY IS OPEN. Every day with dishes on it used to print in full — the
 * open one, then "Days you built and did not lock", then "Days you have
 * locked", each a complete press sheet with a hero, five figures, a course
 * table and a footer repeating the five figures. A citizen who had settled a
 * week scrolled past seven newspapers to reach the day they were building.
 * Now the day being built is the sheet and every other day is one row you can
 * open. Nothing is hidden: a row states its date, its calories and whether it
 * is locked, which is what somebody looking back wants before looking closer.
 *
 * A COURSE IS A MENU, NOT A LEDGER. The dishes were a five-column table of
 * numbers. That is right for a plan the engine composed, where you read down
 * checking the arithmetic; it is wrong for a day you are choosing, where the
 * question is whether you want to eat that. The corpus holds the photograph
 * already. A dish with no photograph gets a tinted panel with its name on it —
 * never a picture of something similar.
 *
 * THE DAY KNOWS WHAT TIME IT IS. Each course prints the hour it is eaten at,
 * the course you are in is marked, and the ones that have gone fade. A course
 * counts as gone when the next one's hour arrives — no dish carries an end
 * time, so any other rule would be a duration this page made up.
 *
 * AND THE MONTH IS VISIBLE. The plan was always a calendar month — the server
 * anchors it to the 1st and locking has always moved the next dish to the day
 * after — but the page showed one day and no way to tell how much of the month
 * that was. The strip draws every day of it: locked, holding dishes, today,
 * and the one being built. It navigates rather than edits, which keeps the
 * rule that made this safe: the SERVER decides which day a dish lands on, so
 * two tabs open at once cannot disagree about what "today" means.
 *
 * WHAT DID NOT CHANGE: it still does not top the day up. The totals are the
 * honest sum of what they put on it, and a locked day still offers no way to
 * edit it from inside.
 */

const round = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—';
const grams = (n: number | null | undefined): string =>
  typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}g` : '—';

const dateOf = (iso: string) => new Date(`${iso}T00:00:00`);
const weekday = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', { weekday: 'long' });
const longDate = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', {
  day: 'numeric', month: 'long', year: 'numeric',
});
const shortDate = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const addDays = (iso: string, n: number) => { const d = dateOf(iso); d.setDate(d.getDate() + n); return d; };

/** "20:00" → 1200, minutes past midnight. Null when a slot carries no hour —
 *  which is a fact about the data, not a reason to guess one. */
const atMinute = (hhmm: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
/** "20:00" → "8:00 pm". */
const clock = (hhmm: string | undefined): string => {
  const at = atMinute(hhmm);
  if (at === null) return '';
  return new Date(2000, 0, 1, Math.floor(at / 60), at % 60)
    .toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
};

/**
 * HOW FAR THIS DAY SITS FROM THE PRESCRIPTION, AS A DISTANCE AND A DIRECTION.
 *
 * It used to print "68% of target", which is a number you have to do arithmetic
 * on before it tells you anything: 68% of what, and how much food is the other
 * 32%? "480 under" is the same fact already answered.
 *
 * Absent when there is no prescription on file. A gap measured against a target
 * we do not have is a made-up number — which is why 0% and 100% were both wrong
 * here, and why nothing at all is the honest third option.
 */
const gap = (v: number, of?: number | null): string | null => {
  if (!(typeof of === 'number' && of > 0)) return null;
  const d = Math.round(v - of);
  return d === 0 ? 'on target' : `${Math.abs(d).toLocaleString('en-IN')} ${d > 0 ? 'over' : 'under'}`;
};

/**
 * A clock that ticks once a minute.
 *
 * Two things depend on it and both are wrong without it: the course marker
 * moves through the day on its own, and a tab left open past midnight stops
 * calling yesterday "today". One interval for the whole view — the sheets read
 * the date they are handed.
 */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const dishCount = (day: OwnDay) => day.meals.reduce((n, m) => n + m.components.length, 0);

/** One dish, as a menu plate: the picture, the name, and the calories on the
 *  rule a menu puts a price on. */
function Plate({ c, locked, busy, onRemove }: {
  c: MealComponent;
  locked: boolean;
  busy: boolean;
  onRemove: () => void;
}) {
  return (
    <article className="press-plate">
      {/* The name is directly beneath, so the photograph is decorative and its
          alt is empty on purpose — a screen reader that reads the dish twice
          has been made slower, not more informed. */}
      <figure className="press-plate-fig">
        {c.imageUrl
          ? <img src={c.imageUrl} alt="" loading="lazy" />
          : <figcaption>{c.name}</figcaption>}
      </figure>
      <div className="press-plate-line">
        <span className="press-plate-name">
          <VegMark diet={c.diet} size={14} />
          {/* The dish name is the way to cook it — the recipe page is the only
              place the method exists. */}
          <Link to={`/nutrition/recipes/${c.recipeId}`}>{c.name}</Link>
        </span>
        <span className="press-plate-kcal">{round(c.kcal)}<small>kcal</small></span>
      </div>
      <div className="press-plate-foot">
        <span className="press-plate-macros">P {grams(c.protein)} · C {grams(c.carbs)} · F {grams(c.fat)}</span>
        {/* A locked day has no controls at all — the grocery list has already
            been written from it, and a dish that can leave the day but not the
            basket is a lie either way. */}
        {!locked && (
          <button type="button" disabled={busy}
            aria-label={`Remove ${c.name} from this day`} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
    </article>
  );
}

type Targets = OwnPlan['targets'];

/** One built day, set as a printed page. */
function DaySheet({ day, targets, live, now, busy, people, onPeople, onRemove, onLock, onUnlock }: {
  day: OwnDay;
  targets: Targets;
  /** Is this the day the clock is actually on? Only then does "Now" mean anything. */
  live: boolean;
  now: Date;
  busy: boolean;
  /** Absent on a sheet opened from the month strip: how many people the
   *  shopping is for belongs to the PLAN, so it is set once, on the day being
   *  built, and not repeated on every day it applies to. */
  people?: number;
  onPeople?: (n: number) => void;
  onRemove: (day: number, recipeId: string) => void;
  onLock: (day: number) => void;
  onUnlock: (day: number) => void;
}) {
  const t = day.totals;
  const target = targets ?? undefined;
  const kcalGap = gap(t.kcal, target?.kcal);

  // The course you are in is the LAST one whose hour has come. Everything
  // before it has gone; everything after is still ahead. -1 means the first
  // course of the day has not started yet.
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentIdx = live
    ? day.meals.reduce((found, m, i) => {
      const at = atMinute(m.scheduledTime);
      return at !== null && at <= nowMin ? i : found;
    }, -1)
    : -1;
  const ahead = live ? day.meals.find((_, i) => i > currentIdx) : undefined;
  const last = day.meals[day.meals.length - 1];

  const dishes = dishCount(day);
  const note = day.locked
    ? 'Locked. Its ingredients are on your grocery list, and anything you add now starts the next day.'
    : live && ahead
      ? `${currentIdx < 0 ? 'First up' : 'Next'} · ${ahead.label} at ${clock(ahead.scheduledTime)}.`
      : live && last
        ? `${last.label} was today's last course. Lock the day when you are done with it.`
        : `${dishes} dish${dishes === 1 ? '' : 'es'}, chosen by you.`;

  return (
    <div data-press style={{ padding: '26px 0 8px' }}>
      {/* THE DAY YOU BUILT PRINTS ON THE SAME SHEET AS THE ONE THE ENGINE
          BUILDS. It wears `.press-recto` rather than a class of its own, which
          is the point: the recto is what carries the ground and the ink scale,
          and a second papered class would be a second place to fix a sheet.

          It used to be handed a weekday through `data-paper`, because the week
          had a photograph per day. It has one sky now, so there is nothing to
          hand it. */}
      <div>
        <section className="press-recto">
          <div className="press-sheet">

            <header className="press-hero">
              <div className="press-hero-row">
                <div>
                  <h1 className="press-day">{weekday(day.dayISO)}</h1>
                  {/* THE DATE IS THE RECORD. A settled day is filed under the day
                      it is for, not "day 3" — the only label that still means
                      something a week later. */}
                  <div className="press-date">
                    {day.locked ? `Locked · ${longDate(day.dayISO)}` : longDate(day.dayISO)}
                    {dishes > 0 && ` · ${dishes} dish${dishes === 1 ? '' : 'es'}`}
                  </div>
                </div>
                <p className="press-quote">{note}</p>
              </div>
              {/* OVER OR UNDER, NOT A PERCENTAGE. Each figure says how far this
                  day is from the prescription and which side of it — and says
                  nothing at all where there is no prescription to be a distance
                  from. */}
              <dl className="press-stats">
                <div>
                  <dt>Daily calories</dt><dd>{round(t.kcal)}<small>kcal</small></dd>
                  {kcalGap && <span className="press-pc">{kcalGap}</span>}
                </div>
                <div>
                  <dt>Protein</dt><dd>{round(t.protein)}<small>g</small></dd>
                  {gap(t.protein, target?.protein) && <span className="press-pc">{gap(t.protein, target?.protein)}g</span>}
                </div>
                <div>
                  <dt>Carbohydrate</dt><dd>{round(t.carbs)}<small>g</small></dd>
                  {gap(t.carbs, target?.carb) && <span className="press-pc">{gap(t.carbs, target?.carb)}g</span>}
                </div>
                <div>
                  <dt>Fat</dt><dd>{round(t.fat)}<small>g</small></dd>
                  {gap(t.fat, target?.fat) && <span className="press-pc">{gap(t.fat, target?.fat)}g</span>}
                </div>
                <div>
                  <dt>Fibre</dt><dd>{round(t.fiber)}<small>g</small></dd>
                  {gap(t.fiber, target?.fiber) && <span className="press-pc">{gap(t.fiber, target?.fiber)}g</span>}
                </div>
              </dl>
            </header>

            <main>
              {day.meals.map((m, i) => (
                <section className={`press-course${live && i < currentIdx ? ' is-past' : ''}`} key={m.slot}>
                  <div className="press-course-head">
                    <div className="press-course-title">
                      <h2>{m.label}</h2>
                      {clock(m.scheduledTime) && (
                        <span className={`press-course-when${live && i === currentIdx ? ' is-now' : ''}`}>
                          {live && i === currentIdx ? `Now · ${clock(m.scheduledTime)}` : clock(m.scheduledTime)}
                        </span>
                      )}
                    </div>
                    <span className="press-kcal">{round(m.totals.kcal)}<small>kcal</small></span>
                  </div>
                  <div className="press-menu">
                    {m.components.map((c) => (
                      <Plate key={c.recipeId + c.role} c={c} locked={day.locked} busy={busy}
                        onRemove={() => onRemove(day.dayIndex, c.recipeId)} />
                    ))}
                  </div>
                </section>
              ))}
            </main>

            {/* ONE COLUMN, ONE JOB. This aside used to carry the same five
                figures a second time as bars, and the footer under it carried
                them a third — three copies of one sum on one card, and the
                sticky column sat over the footer while you scrolled past them.
                The figures are in the hero. What is left here is what nothing
                else does: settle the day, and say who it is being cooked for. */}
            <aside className="press-aside">
              <section>
                <h3>This day</h3>
                {day.locked ? (
                  <>
                    <p className="press-note">Locked.</p>
                    <p className="press-desc" style={{ marginTop: 10 }}>
                      Its ingredients are on your grocery list, and the next dish you add starts the
                      following day. Unlocking leaves the grocery list as it is.
                    </p>
                    <div style={{ marginTop: 14 }}>
                      <Button variant="line" size="sm" disabled={busy} onClick={() => onUnlock(day.dayIndex)}>
                        {busy ? 'Working…' : 'Unlock this day'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="press-desc" style={{ margin: 0 }}>
                      Locking fixes the day, adds its ingredients to your grocery list, and moves the
                      next dish you add to tomorrow — which is how the month gets built.
                    </p>
                    <div style={{ marginTop: 14 }}>
                      <Button variant="accent" size="sm" disabled={busy} onClick={() => onLock(day.dayIndex)}>
                        {busy ? 'Working…' : 'Lock this day & add to grocery list'}
                      </Button>
                    </div>
                  </>
                )}
              </section>

              {/* WHO THE SHOPPING IS FOR, BESIDE THE FOOD IT CHANGES.
                  The count lived on the Grocery page, so the citizen chose the
                  dishes here and found out here that the quantities were for
                  one — a page away, after the list had been written. It moves
                  what is BOUGHT and nothing above it: the figures in the hero
                  are one person's intake, and multiplying a citizen's own
                  target by their household would turn it into a number about
                  the kitchen. */}
              {typeof people === 'number' && onPeople && (
                <section>
                  <h3>Cooking for</h3>
                  <div className="own-people">
                    <button type="button" aria-label="One person fewer" disabled={busy || people <= 1}
                      onClick={() => onPeople(Math.max(1, people - 1))}>−</button>
                    <span className="own-people-n" aria-live="polite">{people}</span>
                    <button type="button" aria-label="One person more" disabled={busy || people >= 12}
                      onClick={() => onPeople(Math.min(12, people + 1))}>+</button>
                    <span>{people === 1 ? 'person' : 'people'}</span>
                  </div>
                  <p className="press-desc" style={{ marginTop: 10 }}>
                    Grocery quantities multiply by this; the figures above stay one person's.
                  </p>
                </section>
              )}

              {!kcalGap && (
                <section>
                  <h3>No target on file</h3>
                  <p className="press-desc" style={{ margin: 0 }}>
                    These are your totals and nothing else. Fill in Meal settings and the figures
                    above start saying how far over or under you are.
                  </p>
                </section>
              )}
            </aside>

          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * THE WHOLE MONTH, AS A STRIP.
 *
 * This plan has always been a calendar month — the server anchors day 0 to the
 * 1st and re-anchors when the month turns — and the page showed one day of it
 * with no way to tell whether that was the 2nd or the 30th, or how much of the
 * month was already settled.
 *
 * IT NAVIGATES, IT DOES NOT EDIT. Tapping a day opens it; it does not make it
 * the day dishes land on. That rule belongs to the server, deliberately: `add`
 * sends a recipe id and nothing else, so two tabs open at once cannot each send
 * their own idea of which day this is. Locking is what moves the day being
 * built, and that is the sentence under the strip.
 *
 * A day with nothing on it is not a button. There is nothing to open, and a
 * control that does nothing when pressed teaches people the strip is broken.
 */
function MonthStrip({ plan, openRow, onOpen }: {
  plan: OwnPlan;
  openRow: number | null;
  onOpen: (dayIndex: number) => void;
}) {
  const locks = new Set(plan.locks);
  const filled = new Set(plan.days.filter((d) => d.meals.length > 0).map((d) => d.dayIndex));
  // The server states the month's length. A browser reading a response from a
  // server that predates the field must not draw an empty strip, so it falls
  // back to counting the month itself — the same answer, from the same anchor.
  const total = Math.max(1, Number.isFinite(plan.planDays)
    ? plan.planDays
    : new Date(dateOf(plan.planStartDate).getFullYear(), dateOf(plan.planStartDate).getMonth() + 1, 0).getDate());
  const building = addDays(plan.planStartDate, plan.targetDay);

  return (
    <section className="own-month">
      <div className="wall-rule">
        <span>{dateOf(plan.planStartDate).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
        <span>{plan.locks.length} of {total} locked</span>
      </div>
      <div className="own-month-strip">
        {Array.from({ length: total }, (_, i) => {
          const d = addDays(plan.planStartDate, i);
          const has = locks.has(i) || filled.has(i);
          const cls = ['own-month-day',
            locks.has(i) ? 'is-locked' : filled.has(i) ? 'is-filled' : '',
            i === plan.todayIndex ? 'is-today' : '',
            i === plan.targetDay ? 'is-building' : ''].filter(Boolean).join(' ');
          const said = `${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })} — ${
            locks.has(i) ? 'locked' : filled.has(i) ? 'has dishes on it' : 'nothing on it yet'}`;
          return has ? (
            <button key={i} type="button" className={cls} aria-label={said}
              aria-pressed={openRow === i} onClick={() => onOpen(i)}>{d.getDate()}</button>
          ) : (
            <span key={i} className={cls} title={said}>{d.getDate()}</span>
          );
        })}
      </div>
      <p className="own-month-note">
        Building <strong>{building.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</strong>.
        {' '}Lock it and the next dish you add starts the day after.
      </p>
    </section>
  );
}

/** Any day that is not the one being built: one row, opened on request. */
function DayRow({ day, expanded, onToggle }: {
  day: OwnDay;
  expanded: boolean;
  onToggle: () => void;
}) {
  const dishes = dishCount(day);
  return (
    <button type="button" className="own-day-row" aria-expanded={expanded} onClick={onToggle}>
      <span className="own-day-when">{weekday(day.dayISO)}</span>
      <span className="own-day-meta">{shortDate(day.dayISO)} · {dishes} dish{dishes === 1 ? '' : 'es'}</span>
      <span className="own-day-mark">{day.locked ? 'Locked' : 'Not locked'}</span>
      <span className="own-day-sum">
        {round(day.totals.kcal)} kcal · P {grams(day.totals.protein)} · C {grams(day.totals.carbs)} · F {grams(day.totals.fat)}
      </span>
      <span className="own-day-mark" aria-hidden="true">{expanded ? 'Close' : 'Open'}</span>
    </button>
  );
}

export function OwnDayView({ plan, loading, failed, onRetry, onRemove, onLock, onUnlock, onPeople, busy }: {
  plan?: OwnPlan;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onRemove: (day: number, recipeId: string) => void;
  onLock: (day: number) => void;
  onUnlock: (day: number) => void;
  onPeople: (n: number) => void;
  busy: boolean;
}) {
  const now = useMinute();
  const [openRow, setOpenRow] = useState<number | null>(null);

  if (loading) return <div style={{ padding: 24 }}><Spinner label="Opening your plan…" /></div>;

  // A plan that cannot be read must not render as a plan with nothing in it —
  // "you have added nothing" and "we could not look" are different sentences.
  if (failed || !plan) {
    return (
      <div className="card" style={{ marginBottom: 22 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>We couldn’t open your plan</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 12px', lineHeight: 1.6 }}>
          Anything you added is still there — try again.
        </p>
        <Button variant="line" size="sm" onClick={onRetry}>Try again</Button>
      </div>
    );
  }

  const open = plan.days.find((d) => d.dayIndex === plan.targetDay);

  /**
   * EVERY OTHER DAY THEY HAVE FOOD ON, LOCKED OR NOT, AS ONE LIST.
   *
   * These were two filtered lists under two headings, and anything matching
   * neither was dropped on the floor: a citizen who added three dishes on
   * Thursday and did not lock came back on Friday to a blank page, because
   * Thursday was neither the open day nor a locked one. One filter — "has
   * dishes, is not the day being built" — cannot strand anything, and the row
   * says which kind of day it is instead of a heading saying it for a group.
   *
   * Oldest first: a plan reads forward.
   */
  const rest = plan.days
    .filter((d) => d.dayIndex !== plan.targetDay && d.meals.length > 0)
    .sort((a, b) => a.dayIndex - b.dayIndex);

  const sheet = (day: OwnDay, lead = false) => (
    <DaySheet key={day.dayIndex} day={day} targets={plan.targets}
      live={day.dayIndex === plan.todayIndex} now={now} busy={busy}
      people={lead ? (plan.people ?? 1) : undefined} onPeople={lead ? onPeople : undefined}
      onRemove={onRemove} onLock={onLock} onUnlock={onUnlock} />
  );

  /**
   * Opening a day from the strip has to MOVE you to it.
   *
   * The strip is at the top and the day it opens is below the sheet, so without
   * this a tap changed something off-screen and the control read as dead —
   * which is the same failure as a button that does nothing, arrived at from
   * the other direction. The timeout is one tick, for the row to exist before
   * it is scrolled to.
   */
  const openDay = (dayIndex: number) => {
    const next = dayIndex === plan.targetDay || openRow === dayIndex ? null : dayIndex;
    setOpenRow(next);
    if (next !== null) {
      setTimeout(() => document.getElementById(`own-day-${next}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
    }
  };

  return (
    <div style={{ marginBottom: 26 }}>
      <MonthStrip plan={plan} openRow={openRow} onOpen={openDay} />

      {open && open.meals.length ? sheet(open, true) : (
        <div data-press style={{ padding: '26px 0 8px' }}>
          {/* THE EMPTY DAY IS STILL A SHEET, AND THIS IS WHERE IT STOPPED BEING
              ONE. The built day wraps in `.press-recto`, which is what carries
              the paper AND the 26–56px of padding; the empty state was a bare
              `press-hero`, so on a room the same colour as the sheet it read as
              type running into the frame with no page under it. Reported as
              "cutting from the edge", and it was — one missing wrapper. */}
          <section className="press-recto">
          <header className="press-hero" style={{ marginBottom: 0 }}>
            <div className="press-hero-row">
              <div>
                <h1 className="press-day">{open ? weekday(open.dayISO) : 'Today'}</h1>
                <div className="press-date">{open ? longDate(open.dayISO) : 'Nothing on it yet'}</div>
              </div>
              <p className="press-quote">
                Nothing on it yet. Add a dish below and it lands here, in the course it belongs to.
              </p>
            </div>
            <p className="press-desc" style={{ marginTop: 22 }}>
              When the day looks right, lock it — its ingredients join your grocery list and the
              next dish you add starts the following day.
            </p>
          </header>
          </section>
        </div>
      )}

      {rest.length > 0 && (
        <section className="own-days">
          <div className="wall-rule">
            <span>Days you have locked and days you have not</span>
            <span>{rest.length}</span>
          </div>
          {rest.map((d) => (
            <div key={d.dayIndex} id={`own-day-${d.dayIndex}`}>
              <DayRow day={d} expanded={openRow === d.dayIndex}
                onToggle={() => setOpenRow(openRow === d.dayIndex ? null : d.dayIndex)} />
              {openRow === d.dayIndex && sheet(d)}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.6, maxWidth: '68ch' }}>
            Unlocked days never reach your grocery list — lock a day to shop it.
          </p>
        </section>
      )}
    </div>
  );
}
