import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useComposedPlan } from '../composed.api';

/**
 * WHICH DAYS AM I SHOPPING FOR?
 *
 * A week of dates, starting today, showing which of them are settled. The list
 * below is built from the settled ones and from nothing else.
 *
 * WHY THIS ONLY SHOWS AND DOES NOT SETTLE. The basket follows the LOCKS —
 * a deliberate decision, and the reasoning in nutrition.service.ts still holds:
 * "a start-date-plus-length window meant the list described days the citizen had
 * not decided on yet, so it churned every time the planner rerolled a meal they
 * were still browsing, and it bought food for a Thursday they might never cook."
 *
 * Settling a day means reading its menu and accepting it. That belongs on the
 * meal plan, next to the food it is about — not behind one button on a shopping
 * screen that can lock seven days' meals somebody has never seen. So this panel
 * points at the days that need deciding and links to them.
 *
 * The endpoint has always taken `days` and `startDate` — groceryPlan(userId,
 * mode, days = 7, startDate?), clamped 1–28 — and the web app sent neither, so
 * the range was fixed at a week with no say in it. It sends them now.
 */

const DAY_MS = 86_400_000;
const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

/** Plan day 0 is planStartDate; today is that many days in. */
function offsetOfToday(planStartDate?: string): number {
  if (!planStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(planStartDate)) return 0;
  const start = midnight(new Date(`${planStartDate}T00:00:00`)).getTime();
  const today = midnight(new Date()).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((today - start) / DAY_MS));
}

export function ShoppingRange({ mode, days, onDays }: {
  mode: 'individual' | 'family';
  days: number;
  onDays: (n: number) => void;
}) {
  const plan = useComposedPlan('preferred', mode === 'family' ? 'household' : 'self');

  const wk = plan.data;
  const planDays = wk?.days?.length ?? 0;
  const base = offsetOfToday(wk?.planStartDate);
  // Never offer a day the plan does not have. A three-week plan on its last
  // Friday has two days left, and a control that offers seven is lying.
  const maxDays = Math.max(1, Math.min(7, planDays ? planDays - base : 7));
  const chosen = Math.min(Math.max(1, days), maxDays);
  const locks = useMemo(() => new Set(wk?.locks ?? []), [wk]);

  const week = useMemo(() => Array.from({ length: maxDays }, (_, i) => {
    const dayIndex = base + i;
    return {
      i,
      dayIndex,
      date: new Date(midnight(new Date()).getTime() + i * DAY_MS),
      inRange: i < chosen,
      locked: locks.has(dayIndex),
    };
  }), [maxDays, base, chosen, locks]);

  const inRange = week.filter((d) => d.inRange);
  const unsettled = inRange.filter((d) => !d.locked);
  const settled = inRange.length - unsettled.length;

  if (plan.isLoading) return null;
  // A CONTROL THAT VANISHES IS NOT A HANDLED FAILURE. Returning null here meant
  // that when the plan could not be read, the range simply was not on the page
  // — and the list below it went on rendering, describing a window nobody could
  // see or change. Say what happened, and say what the list is still showing.
  if (plan.isError || !wk) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Shopping for</h3>
        <p className="muted" style={{ fontSize: 12.5, margin: '8px 0 0', lineHeight: 1.6 }}>
          We couldn’t read your meal plan just now, so you can’t change the range from here.
          The list below still shows the days you have already settled.
        </p>
        <button type="button" className="btn btn-line btn-sm" style={{ marginTop: 12 }}
          disabled={plan.isFetching} onClick={() => void plan.refetch()}>
          {plan.isFetching ? 'Trying again…' : 'Try again'}
        </button>
      </div>
    );
  }

  const dayLabel = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short' });
  const dateLabel = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const longLabel = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Shopping for</h3>
        <span className="muted" style={{ fontSize: 12 }}>
          from today to {dateLabel(week[week.length - 1].date)}
        </span>
      </div>

      {/* The dates themselves, not a count of them. Tapping one sets how far the
          range reaches; the padlock says whether that day is settled, which is
          the only thing that decides if its ingredients are on the list. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {week.map((d) => (
          <button key={d.dayIndex} type="button" onClick={() => onDays(d.i + 1)}
            aria-pressed={d.inRange}
            aria-label={`${longLabel(d.date)}${d.locked ? ', settled' : ', not settled yet'}`}
            className={`pill ${d.inRange ? 'on' : ''}`}
            style={{ cursor: 'pointer', flexDirection: 'column', height: 'auto', padding: '8px 14px', gap: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.02em' }}>
              {d.i === 0 ? 'Today' : dayLabel(d.date)}
            </span>
            <span style={{ fontSize: 11, opacity: .75 }}>
              {dateLabel(d.date)}{d.locked ? ' · settled' : ''}
            </span>
          </button>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 12.5, margin: '14px 0 0', lineHeight: 1.65 }}>
        Only ingredients from <strong>settled</strong> days appear below — a day you have not
        settled can still change, and buying for it would buy food you may never cook.
      </p>

      {unsettled.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 13, margin: 0, lineHeight: 1.65 }}>
            {settled === 0
              ? `None of these ${inRange.length} day${inRange.length === 1 ? '' : 's'} is settled yet, so there is nothing to shop for.`
              : `${settled} of ${inRange.length} settled. ${unsettled.length} still to go.`}
            {' '}Open the meal plan, read the menu for {unsettled.length === 1 ? 'that day' : 'each of these days'}, and lock the ones you are happy with.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {unsettled.map((d) => (
              <Link key={d.dayIndex} to={`/nutrition/weekly?day=${d.dayIndex}`} className="btn btn-line btn-sm">
                Settle {d.i === 0 ? 'today' : `${dayLabel(d.date)} ${dateLabel(d.date)}`}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, margin: '10px 0 0', lineHeight: 1.65 }}>
          All {inRange.length} day{inRange.length === 1 ? '' : 's'} in this range {inRange.length === 1 ? 'is' : 'are'} settled,
          so this list is fixed — nothing in it will change under you.
        </p>
      )}
    </div>
  );
}
