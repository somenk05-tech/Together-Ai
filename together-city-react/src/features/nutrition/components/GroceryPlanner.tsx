import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useGroceryPlan } from '../hooks';
import { ShoppingRange } from './ShoppingRange';
import { nutritionApi } from '../api';
import { useQueryClient } from '@tanstack/react-query';
import type { GroceryAisle, GroceryPlanItem } from '../api';

type View = 'grocery' | 'recipe';

/** A week. The longest range offered, and the one most people shop to. */
const DEFAULT_DAYS = 7;

/** One shopping item row — checkbox, name, real-unit quantity, and an
 *  expandable "used in" breakdown of which recipes need it. */
function ItemRow({ item, checked, onToggle }: { item: GroceryPlanItem; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const multi = item.usedIn.length > 1;
  return (
    // A cell now, not a row: it needs a left edge as well as a top one, or the
    // columns run together into something that reads as one wide line.
    <div style={{ borderTop: '1px solid var(--line)', borderLeft: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
        <button
          onClick={onToggle}
          aria-label={checked ? 'Uncheck' : 'Check off'}
          style={{ minWidth: 44, minHeight: 44, 
            flex: 'none', width: 22, height: 22, borderRadius: 7, cursor: 'pointer',
            border: checked ? 'none' : '1.8px solid var(--line)',
            background: checked ? 'var(--accent)' : 'transparent',
            color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, transition: 'all .12s', padding: 0,
          }}
        >
          {checked ? '✓' : ''}
        </button>

        <button
          onClick={() => multi && setOpen((o) => !o)}
          style={{
            flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0,
            cursor: multi ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', gap: 1,
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize', textDecoration: checked ? 'line-through' : 'none', color: checked ? 'var(--muted)' : 'var(--ink)' }}>
            {item.name}
          </span>
          {multi && (
            <span className="muted" style={{ fontSize: 11.5 }}>
              {open ? '▾' : '▸'} used in {item.usedIn.length} recipes
            </span>
          )}
        </button>

        <span style={{ flex: 'none', textAlign: 'right', whiteSpace: 'nowrap', color: checked ? 'var(--muted)' : 'var(--ink)' }}>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{item.qtyLabel}</span>
          {/* Pantry-aware: don't ask them to re-buy what's already on the shelf. */}
          {item.inPantry && (item.haveGrams ?? 0) > 0 && (
            <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--ok-ink)' }}>
              {(item.toBuyGrams ?? 0) > 0 ? `have ${item.haveQtyLabel} · buy ${item.toBuyQtyLabel}` : '✓ already in pantry'}
            </span>
          )}
          {item.pack && item.pack !== item.qtyLabel && !item.inPantry && (
            <span className="muted" style={{ display: 'block', fontSize: 10.5, fontWeight: 600 }}>buy {item.pack}</span>
          )}
        </span>
      </div>

      {open && multi && (
        <div style={{ padding: '2px 14px 12px 48px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {item.usedIn.map((u, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span className="muted" style={{ textTransform: 'capitalize' }}>· {u.recipe}</span>
              <span className="muted" style={{ whiteSpace: 'nowrap' }}>{u.qtyLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** A supermarket aisle — icon header, shelf life + storage tip, item rows. */
function Aisle({ aisle, checked, toggle }: { aisle: GroceryAisle; checked: Set<string>; toggle: (n: string) => void }) {
  const shelf = aisle.items[0];
  const done = aisle.items.filter((i) => checked.has(i.name)).length;
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'var(--paper)' }}>
        <span style={{ fontSize: 22 }}>{aisle.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <h3 style={{ fontSize: 16, margin: 0 }}>{aisle.title}</h3>
            <span className="muted" style={{ fontSize: 11.5 }}>{aisle.note}</span>
          </div>
          {shelf && (shelf.shelfLife || shelf.storageTip) && (
            <p className="muted" style={{ fontSize: 11.5, margin: '3px 0 0' }}>
              {shelf.shelfLife ? `🕒 Keeps ${shelf.shelfLife}` : ''}{shelf.shelfLife && shelf.storageTip ? ' · ' : ''}{shelf.storageTip ? `📦 ${shelf.storageTip}` : ''}
            </p>
          )}
        </div>
        <span className="muted" style={{ flex: 'none', fontSize: 12, fontWeight: 600 }}>{done}/{aisle.items.length}</span>
      </div>
      {/* Horizontal, not a single column. An aisle is a set of things to pick
          up, not a sequence — one per row turned thirteen vegetables into a
          scroll on a screen with two-thirds of its width empty. auto-fill with
          a min width means it becomes one column on a phone without a media
          query, which matters because this list is read while shopping. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {aisle.items.map((it) => (
          <ItemRow key={it.name} item={it} checked={checked.has(it.name)} onToggle={() => toggle(it.name)} />
        ))}
      </div>
    </div>
  );
}

/**
 * Supermarket-style grocery planner (Grocery Planner redesign). Aisles in
 * shopping order, real-unit quantities, expandable "used in", a Grocery/Recipe
 * view toggle, check-off, and per-aisle shelf life + storage tips.
 */
export function GroceryPlanner({ mode }: { mode: 'individual' | 'family' }) {
  // HOW FAR AHEAD AM I SHOPPING? Today through any day up to a week — the
  // citizen's choice, which they never had, because the web app sent neither
  // `days` nor `startDate` to an endpoint that has always taken both.
  //
  // The basket still follows the LOCKS (server-side, and rightly — see the
  // 1 Aug note in nutrition.service.ts). ShoppingRange is what reconciles the
  // two: choosing a range SETTLES the days in it, so the window is real and
  // the list still cannot churn underneath somebody mid-shop.
  const [days, setDays] = useState(DEFAULT_DAYS);
  const plan = useGroceryPlan(mode, days);
  const qc = useQueryClient();
  const schedule = plan.data?.deliverySchedule;
  const [view, setView] = useState<View>('grocery');
  /**
   * The ticks come from the server now (BE-11.1).
   *
   * They used to live only in this useState, so they survived exactly as long
   * as the page did — somebody halfway round a shop who switched apps or let
   * the screen lock came back to a list with nothing ticked.
   *
   * Kept in local state as well, and updated FIRST: a checkbox that waits for a
   * round trip feels broken in a supermarket aisle, where the signal is bad and
   * the phone is in one hand. The write follows; if it fails the tick is rolled
   * back and the list says so, because a tick that silently did not save is
   * worse than one that visibly failed.
   */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [saveFailed, setSaveFailed] = useState(false);

  // Seed from the server whenever the plan arrives, without discarding a tick
  // made in the last second.
  useEffect(() => {
    const fromServer = (plan.data?.aisles ?? []).flatMap((a) => a.items).filter((i) => i.checked).map((i) => i.name);
    if (fromServer.length) setChecked((s) => new Set([...s, ...fromServer]));
  }, [plan.data]);

  const toggle = (n: string) => {
    const next = new Set(checked);
    const nowChecked = !next.has(n);
    if (nowChecked) next.add(n); else next.delete(n);
    setChecked(next);
    setSaveFailed(false);
    void nutritionApi.groceryCheck(n, nowChecked)
      .then(() => { void qc.invalidateQueries({ queryKey: ['nutrition', 'grocery'] }); })
      .catch(() => {
        setChecked((s) => { const back = new Set(s); if (nowChecked) back.delete(n); else back.add(n); return back; });
        setSaveFailed(true);
      });
  };

  const aisles = plan.data?.aisles ?? [];
  const failedNote = saveFailed
    ? 'That tick didn’t save — check your connection and tap it again.'
    : '';
  const recipes = plan.data?.recipes ?? [];
  const itemCount = plan.data?.itemCount ?? 0;
  const summary = plan.data?.summary;
  const checkedCount = useMemo(() => {
    let c = 0; for (const a of aisles) for (const i of a.items) if (checked.has(i.name)) c++; return c;
  }, [aisles, checked]);

  if (plan.isLoading) return <Spinner label="Building your shopping list…" />;

  // "No shopping list yet — generate a meal plan" is an instruction to redo the
  // planning a citizen may already have done, and the list is derived from the
  // plan, so failing to read the plan says nothing at all about the list.
  if (plan.isError) {
    return (
      <EmptyState
        icon="⚠️"
        title="We couldn’t build your shopping list"
        hint="Your meal plan is safe — this didn’t reach us. There’s no need to plan anything again; try once more in a moment."
      />
    );
  }

  /**
   * There is no window picker any more. (Owner decision, 1 Aug.)
   *
   * "Start: today | tomorrow" and "how many days" described days the citizen
   * had not decided on yet — so the list churned whenever the planner rerolled
   * a meal they were still browsing, and it bought food for a Thursday they
   * might never cook. The basket follows the LOCKS now: locking a day is the
   * act of deciding, and the list says which days it is made of rather than
   * offering a length to choose.
   */
  const lockedNote = (
    <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12.5 }}>
      <span aria-hidden="true" style={{ fontSize: 15 }}>🔒</span>
      <span style={{ flex: 1, minWidth: 200 }}>
        This list is built from the days you have locked in your meal plan.
      </span>
      <Link to="/nutrition/weekly" style={{ fontWeight: 600, color: 'var(--accent-ink)', textDecoration: 'none' }}>
        Open meal plan →
      </Link>
    </div>
  );

  if (itemCount === 0) {
    // Two different nothings, and they need different sentences: a citizen who
    // has locked no days can act, and one whose locked days produced no
    // ingredients is looking at our problem. The server tells us which.
    const nothingLocked = (summary as { lockedDays?: number } | undefined)?.lockedDays === 0
      || (plan.data as { lockedDays?: number } | undefined)?.lockedDays === 0;
    return (
      <div>
        {lockedNote}
        {/* The range panel belongs HERE most of all. This is the state where a
            citizen has nothing to shop for, and it is the only thing on the
            page that says WHICH days are unsettled and links to each of them.
            Returning early without it left them with "lock a day" and no
            indication of which day, or where. */}
        <ShoppingRange mode={mode} days={days} onDays={setDays} />
        <EmptyState
          icon="🔒"
          title={nothingLocked ? 'Lock a day to start your list' : 'Nothing to buy for the days you locked'}
          hint={nothingLocked
            ? 'Open your meal plan, read a day you are happy with, and lock it — its ingredients land here.'
            : 'The days you locked need nothing you do not already have.'}
        />
      </div>
    );
  }

  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

  const deliveryCard = schedule && (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>🚚 Delivery schedule</h3>
        <span className="muted" style={{ fontSize: 12 }}>fresh items arrive the day you cook them</span>
        <label style={{ marginLeft: 'auto', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="muted">Preferred time</span>
          <input type="time" defaultValue={schedule.preferredTime}
            onChange={(e) => {
              const t = e.target.value;
              if (/^\d{2}:\d{2}$/.test(t)) {
                void nutritionApi.setDeliveryTime(t).then(() => qc.invalidateQueries({ queryKey: ['nutrition', 'grocery-plan'] }));
              }
            }}
            style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '5px 8px', fontFamily: 'inherit', fontSize: 12.5 }} />
        </label>
      </div>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 13.5 }}>Now · {fmtDay(schedule.first.date)}</strong>
          <span className="muted" style={{ fontSize: 12 }}>
            {schedule.first.itemCount} item{schedule.first.itemCount === 1 ? '' : 's'} · pantry staples + today's fresh
          </span>
        </div>
        {schedule.first.items.length > 0 && (
          <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>{schedule.first.items.slice(0, 14).join(' · ')}{schedule.first.items.length > 14 ? ' …' : ''}</p>
        )}
      </div>

      {schedule.daily.map((d) => (
        <div key={d.date} style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 13.5 }}>{fmtDay(d.date)} · {d.time}</strong>
            <span className="muted" style={{ fontSize: 12 }}>{d.itemCount} fresh item{d.itemCount === 1 ? '' : 's'}</span>
          </div>
          <p className="muted" style={{ fontSize: 11.5, margin: '4px 0 0' }}>{d.items.slice(0, 14).join(' · ')}{d.items.length > 14 ? ' …' : ''}</p>
        </div>
      ))}
      {schedule.daily.length === 0 && (
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Everything in this basket can arrive in the first delivery.</p>
      )}
    </div>
  );

  return (
    <div>
      {lockedNote}
      <ShoppingRange mode={mode} days={days} onDays={setDays} />
      {deliveryCard}
      {/* Shopping summary — household scaling + estimated cost & waste (family) */}
      {mode === 'family' && summary && summary.householdSize > 1 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Shopping summary</h3>
            <span className="muted" style={{ fontSize: 12 }}>scaled to each member's portion, not headcount</span>
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', marginTop: 12 }}>
            {([
              [`${summary.householdSize}`, 'members'],
              [`${summary.days} days`, 'planned'],
              [`${summary.meals.breakfast + summary.meals.lunch + summary.meals.dinner}`, 'main meals'],
              [`${summary.meals.snacks}`, 'snacks'],
              [`₹${summary.estimatedCostInr.toLocaleString('en-IN')}`, 'est. cost'],
              [`<${Math.max(3, Math.ceil(summary.wastePct))}%`, 'est. waste'],
            ] as [string, string][]).map(([n, l]) => (
              <div key={l}><div style={{ fontSize: 18, fontWeight: 800 }}>{n}</div><div className="muted" style={{ fontSize: 11 }}>{l}</div></div>
            ))}
          </div>
          {summary.members.length > 0 && (
            <p className="muted" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
              Portion multipliers: {summary.members.map((m) => `${m.name.split(' ')[0]} ×${m.multiplier}`).join(' · ')} — a recipe that serves 2 is scaled to {summary.scale} household portions.
            </p>
          )}
        </div>
      )}

      {/* progress + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{checkedCount}/{itemCount}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>items checked off</span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: 'var(--line)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${itemCount ? (checkedCount / itemCount) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 999, transition: 'width .2s' }} />
          </div>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
          {(['grocery', 'recipe'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 16px', fontSize: 12.5, fontWeight: 700,
                background: view === v ? 'var(--card)' : 'transparent',
                color: view === v ? 'var(--ink)' : 'var(--muted)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'all .12s',
              }}
            >
              {v === 'grocery' ? '🛒 Grocery' : '🍳 Recipe'}
            </button>
          ))}
        </div>
      </div>

      {view === 'grocery' ? (
        <>
          {/* A tick that silently did not save is worse than one that visibly
              failed — in a shop you act on what the list says. */}
          {failedNote && (
            <p style={{ fontSize: 12.5, color: 'var(--danger-ink)', margin: '0 0 10px' }}>{failedNote}</p>
          )}
          {aisles.map((a) => <Aisle key={a.key} aisle={a} checked={checked} toggle={toggle} />)}
        </>
      ) : (
        <>
          {recipes.map((r, ri) => (
            <div key={ri} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
              <div style={{ padding: '13px 16px', background: 'var(--paper)' }}>
                <h3 style={{ fontSize: 15.5, margin: 0, textTransform: 'capitalize' }}>{r.recipe}</h3>
                <span className="muted" style={{ fontSize: 11.5 }}>{r.items.length} ingredients</span>
              </div>
              <div>
                {r.items.map((it, ii) => (
                  <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 16px', fontSize: 13.5, borderTop: '1px solid var(--line)' }}>
                    <span style={{ textTransform: 'capitalize' }}>{it.name}</span>
                    <span className="muted" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{it.qtyLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
