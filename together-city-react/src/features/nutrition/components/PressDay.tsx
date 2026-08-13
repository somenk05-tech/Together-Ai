import type { ReactNode } from 'react';
import { PressCourse } from './PressCourse';
import { NIc } from './NIcon';
import type { ComposedDay } from '../composed.api';
import { longDate, weekdayFull } from '../planDates';

/**
 * THE PRINTED DAY, IN TWO SHEETS — AND NOW THREE AUTHORS.
 *
 * This was written inside MealPlan.tsx for the citizen's own plan. It is out
 * here because the FAMILY planner has to look the same, and the only way two
 * pages stay identical is for there to be one of them. A second copy of two
 * hundred lines of markup is a copy that diverges the first time somebody fixes
 * a rule on one sheet.
 *
 * WHAT IS SHARED IS THE SHEET; WHAT DIFFERS IS PASSED IN. The recto and the
 * verso, the papers, the scored rules, the stamped plates and the course table
 * are identical for everybody. Four things are not, and each is a slot:
 *
 *   · `summary` — the five-across row. A citizen has a target and reads
 *     percentages against it. A HOUSEHOLD DOES NOT HAVE ONE, and printing
 *     "100% of target" over a family's day would be a number that looks
 *     authoritative and means nothing. The family page says so itself: per
 *     member targets live on each member's individual plan.
 *   · `action`   — the one control the sheet carries. The citizen's day locks;
 *     the household's builds a list.
 *   · `aboutLeft` / `aboutRight` — the two-up plate.
 *   · `under`    — what sits beneath the menu. The citizen gets the macro ring
 *     and the bars; the household gets the per-member portions, because
 *     "one dish, cooked once, plated to each person" is what its day IS.
 *
 * Nothing here fetches, computes or decides. Both callers hand it a day the
 * composer already built.
 */

/** Sunday-first, to match Date#getDay. The key a paper block is written against. */
const PAPER = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export interface PressDayProps {
  d: ComposedDay;
  date: Date;
  dayIndex: number;
  dayCount: number;
  /** The day's reading, and the same sentence cut to a display line. */
  note: string;
  head: string;
  readOnly?: boolean;
  skips?: string[];
  /** Courses the composer dropped entirely, restored by the caller that has them. */
  restored?: ReactNode;
  summary: ReactNode;
  action?: ReactNode;
  aboutLeft: ReactNode;
  aboutRight: ReactNode;
  /** `<div><dt/><dd/></div>` items, printed once, under the menu. */
  totals: ReactNode;
  under: ReactNode;
  /** The line at the foot of each sheet, right-hand side. */
  sign: string;
}

export function PressDay({
  d, date, dayIndex, dayCount, note, head, readOnly, skips = [],
  restored, summary, action, aboutLeft, aboutRight, totals, under, sign,
}: PressDayProps) {
  return (
    <div data-paper={PAPER[date.getDay()]}>

      <section className="press-recto">
        <div className="press-slug">
          <span>the week&rsquo;s plan</span>
          <span>day {dayIndex + 1} of {dayCount}</span>
        </div>

        <header className="press-masthead">
          <div className="press-oval">{date.getDate()}</div>
          <h1 className="press-day">{weekdayFull(date)}</h1>
          <div className="press-date">{longDate(date)}</div>
          <div className="press-hair" />
          {/* The engine's own reading of this day, not a decoration. */}
          <p className="press-note">{note}</p>
        </header>

        <div className="press-score" style={{ marginTop: 30 }} />

        <div style={{ marginTop: 20 }}>
          <p className="press-lab">Daily summary</p>
          <dl className="press-stats">{summary}</dl>
        </div>

        {/* HANDED IN rather than built here: the sheet owns where the day's one
            control sits, the page owns what it does. */}
        {action && <div className="press-plate" style={{ marginTop: 22, padding: '18px 22px' }}>{action}</div>}

        <div className="press-plate press-two-up">
          <div>{aboutLeft}</div>
          <div>{aboutRight}</div>
        </div>

        {/* No totals plate here. `Daily summary` above already carries the five
            figures AND their percentages, and the verso sums the menu; three
            printings of one row was two too many. */}

        <div className="press-sign"><span>Together City</span><span>{sign}</span></div>
      </section>

      <section className="press-verso">
        <aside className="press-rail">
          <div className="press-rail-top">{weekdayFull(date)}<em>{longDate(date)}</em></div>
          <div className="press-rail-hair" />
          <div className="press-oval">{date.getDate()}</div>
          {/* The same verdict the note is built from, cut to a display line in
              dayBalance.ts rather than sliced out of the sentence below it. */}
          <h2 className="press-verdict">{head}</h2>
          <div className="press-rail-hair" />
          <p className="press-quote">&ldquo;{note}&rdquo;</p>
        </aside>

        <div>
          <div className="press-bill-head">
            <p className="press-lab">Today&rsquo;s menu</p>
            <div className="press-tot">Total calories <b>{Math.round(d.totals.kcal).toLocaleString('en-IN')}<small>&nbsp;kcal</small></b></div>
          </div>

          {d.fasting && (
            <p className="press-desc" style={{ margin: '16px 0 0' }}>
              Eating window {d.window.start}&ndash;{d.window.end}.
            </p>
          )}
          {d.meals.map((m) => (
            <PressCourse key={m.slot} meal={m} dayIndex={dayIndex} readOnly={readOnly} skips={skips} />
          ))}
          {restored}

          <div className="press-score" style={{ marginTop: 24 }} />

          <div style={{ marginTop: 16 }}>
            <p className="press-lab">Total nutrition</p>
            <dl className="press-foot">{totals}</dl>
          </div>

          <div className="press-under">{under}</div>
        </div>

        <div className="press-sign"><span>Together City</span><span>{sign}</span></div>
      </section>
    </div>
  );
}

/** The macro ring: one hue at three values, because it is a proportion and not
 *  a palette. Percentages come in already computed against the day's energy. */
export function PressRing({ kcal, p, c, f }: { kcal: number; p: number; c: number; f: number }) {
  const label = `Of today's energy: protein ${p} per cent, carbohydrate ${c} per cent, fat ${f} per cent`;
  return (
    <svg width="126" height="126" viewBox="0 0 42 42" role="img" aria-label={label}>
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--press-macro-0)" strokeWidth="2.6" />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--press-macro-1)" strokeWidth="2.6"
        strokeDasharray={`${p} ${100 - p}`} strokeDashoffset="25" />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--press-macro-2)" strokeWidth="2.6"
        strokeDasharray={`${c} ${100 - c}`} strokeDashoffset={String(25 - p)} />
      <circle cx="21" cy="21" r="15.9" fill="none" stroke="var(--press-macro-3)" strokeWidth="2.6"
        strokeDasharray={`${f} ${100 - f}`} strokeDashoffset={String(25 - p - c)} />
      <text x="21" y="20.3" textAnchor="middle"
        style={{ fontFamily: 'var(--press-mono)', fontSize: '6px', fill: 'var(--press-ink)' }}>
        {Math.round(kcal).toLocaleString('en-IN')}
      </text>
      <text x="21" y="25" textAnchor="middle"
        style={{ fontFamily: 'var(--sans)', fontSize: '2.9px', fill: 'var(--press-ink-3)', letterSpacing: '.14em' }}>
        KCAL
      </text>
    </svg>
  );
}

/**
 * About this menu — what can be said about the day from the day itself.
 *
 * Moved here from MealPlan when the sheet became shared: both planners print
 * the same plate and neither should own the other's copy of it. Deliberately
 * only facts already on the page — how many dishes, how long they take, which
 * cuisines are in it, and how much of the micronutrient picture we could
 * actually compute. That last line is the one worth having: the panel prints
 * sodium and potassium only for the dishes whose ingredients we recognise, and
 * without a count a citizen reading a sodium figure has no way to know it is a
 * figure for part of their day.
 */
export function AboutThisMenu({ d }: { d: ComposedDay }) {
  const comps = d.meals.flatMap((m) => m.components);
  const cuisines = [...new Set(comps.map((c) => (c.cuisine ?? '').trim()).filter(Boolean))];
  const minutes = d.meals.reduce((t, m) => t + (m.minutes || 0), 0);
  const complete = comps.filter((c) => c.nutrientComplete).length;
  const facts: string[] = [
    `${comps.length} dish${comps.length === 1 ? '' : 'es'} across ${d.meals.length} meal${d.meals.length === 1 ? '' : 's'}.`,
    `About ${minutes} minutes of cooking in total.`,
  ];
  if (cuisines.length) {
    facts.push(cuisines.length <= 3
      ? `${cuisines.join(', ')}.`
      : `${cuisines.slice(0, 3).join(', ')} and ${cuisines.length - 3} more.`);
  }
  if (d.fasting) facts.push(`Everything falls inside ${d.window.start}\u2013${d.window.end}.`);
  if (comps.length) {
    facts.push(complete === comps.length
      ? 'Sodium and potassium are computed from every dish here.'
      : `Sodium and potassium come from ${complete} of these ${comps.length} dishes \u2014 the rest have ingredients we cannot yet measure, so those figures are a floor, not a total.`);
  }
  return (
    <div>
      <p className="press-lab">About this menu</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {facts.map((f) => (
          <div key={f} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5 }}>
            <span style={{ marginTop: 1 }}><NIc name="check" size={14} stroke={2.2} /></span>{f}
          </div>
        ))}
      </div>
    </div>
  );
}
