import { useMemo, useState } from 'react';
import { useComposedPlan, useLockDay } from '../composed.api';

/**
 * HOW MANY DAYS AM I SHOPPING FOR?
 *
 * The endpoint has always taken `days` and `startDate` — `groceryPlan(userId,
 * mode, days = 7, startDate?)`, clamped to 1–28. The web app never sent either,
 * so the citizen had no say at all. Not a dead parameter: an unreachable
 * control, the same shape of miss as the planner's scope.
 *
 * BUT A WINDOW ALONE WOULD UNDO A DECISION MADE ON PURPOSE. The service note,
 * 1 Aug: "the basket follows the LOCKS, not a window. A start-date-plus-length
 * window meant the list described days the citizen had not decided on yet — so
 * it churned every time the planner rerolled a meal they were still browsing,
 * and it bought food for a Thursday they might never cook."
 *
 * That reasoning still holds, so this does not fight it. Choosing a range here
 * LOCKS the days in it. Locking is the act of deciding; the range is just how
 * many decisions you are making at once. The liberty is real — today through
 * any day up to a week — and the basket still cannot churn underneath you,
 * because every day in it has been settled.
 *
 * Days already locked are left alone. Nothing is ever unlocked here: taking a
 * decision back belongs on the planner, beside the food it is about.
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
  const lock = useLockDay();
  const [busy, setBusy] = useState(false);

  const wk = plan.data;
  const planDays = wk?.days?.length ?? 0;
  const base = offsetOfToday(wk?.planStartDate);
  // Never offer a day the plan does not have. A three-week plan on its last
  // Friday has two days left, and a control that offers seven is lying.
  const maxDays = Math.max(1, Math.min(7, planDays ? planDays - base : 7));
  const chosen = Math.min(Math.max(1, days), maxDays);

  const wanted = useMemo(
    () => Array.from({ length: chosen }, (_, i) => base + i).filter((d) => d < planDays || !planDays),
    [chosen, base, planDays],
  );
  const locks = wk?.locks ?? [];
  const unsettled = wanted.filter((d) => !locks.includes(d));

  const last = new Date(midnight(new Date()).getTime() + (chosen - 1) * DAY_MS);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const settleAll = async () => {
    setBusy(true);
    try {
      // One at a time, in plan order. Each lock returns the whole week, and the
      // server is the only thing that knows what a lock does to the basket —
      // firing them in parallel would race that.
      for (const day of unsettled) await lock.mutateAsync({ day, mode });
    } finally {
      setBusy(false);
    }
  };

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

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Shopping for</h3>
        <span className="muted" style={{ fontSize: 12 }}>from today, up to a week</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: maxDays }, (_, i) => i + 1).map((n) => (
            <button key={n} type="button" onClick={() => onDays(n)}
              aria-pressed={n === chosen}
              className={`pill ${n === chosen ? 'on' : ''}`}
              style={{ cursor: 'pointer', minWidth: 44 }}>
              {n}{n === 1 ? ' day' : ' days'}
            </button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12.5 }}>
          {chosen === 1 ? `Today · ${fmt(new Date())}` : `Today → ${fmt(last)}`}
        </span>
      </div>

      <p className="muted" style={{ fontSize: 12.5, margin: '12px 0 0', lineHeight: 1.6 }}>
        {unsettled.length === 0
          ? `All ${wanted.length} day${wanted.length === 1 ? '' : 's'} in this range are settled, so this list is fixed — nothing in it will change under you.`
          : `${wanted.length - unsettled.length} of ${wanted.length} settled. Settling the other ${unsettled.length} fixes ${unsettled.length === 1 ? 'its menu' : 'their menus'} and puts every ingredient on one list.`}
      </p>

      {unsettled.length > 0 && (
        <button type="button" className="btn btn-accent" style={{ marginTop: 12 }}
          disabled={busy || lock.isPending}
          onClick={() => void settleAll()}>
          {busy || lock.isPending
            ? `Settling ${unsettled.length} day${unsettled.length === 1 ? '' : 's'}…`
            : `Settle ${unsettled.length} day${unsettled.length === 1 ? '' : 's'} & build the list`}
        </button>
      )}
      {unsettled.length > 0 && (
        <p className="muted" style={{ fontSize: 11.5, margin: '8px 0 0' }}>
          Only the days in this range are settled. You can undo any of them from the meal plan.
        </p>
      )}
    </div>
  );
}
