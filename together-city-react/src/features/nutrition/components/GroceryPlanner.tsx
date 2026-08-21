import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useGroceryPlan } from '../hooks';
import { ShoppingRange } from './ShoppingRange';
import { nutritionApi } from '../api';
import { ShareIconButton } from '@/components/share/ShareButton';
import { groceryShareCard } from '../shareMeal';
import { useQueryClient } from '@tanstack/react-query';
import type { GroceryPlanItem } from '../api';

/** THE EMPTY LIST IS A CONSTANT, NOT A LITERAL.
 *  `x ?? []` builds a NEW array on every render, so any useMemo that depends
 *  on it recomputes every render and the memo is decoration. One frozen empty
 *  array, shared, makes the dependency stable and the memo real. Behaviour is
 *  identical — this is the same nothing, just the same nothing each time. */
const NONE: never[] = [];

type View = 'grocery' | 'recipe';

/** A week. The longest range offered, and the one most people shop to. */
const DEFAULT_DAYS = 7;

/** One PRINTED row — box, name, a dotted leader, the quantity. The reference
 *  sheet's line, kept functional: the box still checks off (44px target via
 *  relief.css), the name still opens its "used in" split when more than one
 *  recipe needs the item, and the pantry have/buy note rides under the
 *  quantity. */
function SheetRow({ item, checked, onToggle }: { item: GroceryPlanItem; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  const multi = item.usedIn.length > 1;
  return (
    <>
      <div className="gsheet-row">
        <button type="button" className={`gsheet-box${checked ? ' on' : ''}`} onClick={onToggle}
          aria-label={checked ? `Uncheck ${item.name}` : `Check off ${item.name}`}>
          {checked ? '✓' : ''}
        </button>
        <button type="button" className={`gsheet-name${checked ? ' done' : ''}`}
          onClick={() => multi && setOpen((o) => !o)}
          style={{ cursor: multi ? 'pointer' : 'default' }}>
          {item.name}{multi ? ` · ${item.usedIn.length} recipes` : ''}
        </button>
        <span className="gsheet-dots" aria-hidden="true" />
        <span className="gsheet-qty">
          {item.qtyLabel}
          {item.inPantry && (item.haveGrams ?? 0) > 0 && (
            <span className="gsheet-qty-sub">
              {(item.toBuyGrams ?? 0) > 0 ? `have ${item.haveQtyLabel} · buy ${item.toBuyQtyLabel}` : 'in pantry'}
            </span>
          )}
          {item.pack && item.pack !== item.qtyLabel && !item.inPantry && (
            <span className="gsheet-qty-sub">buy {item.pack}</span>
          )}
        </span>
      </div>
      {open && multi && item.usedIn.map((u, i) => (
        <div key={i} className="gsheet-used"><span>· {u.recipe}</span><span>{u.qtyLabel}</span></div>
      ))}
    </>
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
  // HOW MANY PEOPLE IS THIS MENU FOR? Chosen on the sheet, sent to the server,
  // persisted there — undefined until the citizen touches it, so the saved
  // count comes back without being rewritten on every visit.
  const [people, setPeople] = useState<number | undefined>(undefined);
  const plan = useGroceryPlan(mode, days, undefined, people);
  const qc = useQueryClient();
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

  const aisles = plan.data?.aisles ?? NONE;
  const failedNote = saveFailed
    ? 'That tick didn’t save — check your connection and tap it again.'
    : '';
  const recipes = plan.data?.recipes ?? [];
  const itemCount = plan.data?.itemCount ?? 0;
  const summary = plan.data?.summary;
  // The server's answer wins: it clamps, persists, and for family it is the
  // real household. Local state only bridges the round trip.
  const menuFor = summary?.people ?? people ?? 1;
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
        {/* TWO PLANS FEED THIS ONE LIST. The engine's week and the days a
            citizen assembles by hand both write into the same basket, so the
            note has to name both — somebody who only ever builds their own days
            was being told to go and look at a planner they do not use. */}
        This list is built from the days you have locked — in your meal plan, and in the
        days you built yourself.
      </span>
      <Link to="/nutrition/weekly" style={{ fontWeight: 600, color: 'var(--accent-ink)', textDecoration: 'none' }}>
        Open meal plan →
      </Link>
      <Link to="/nutrition/recipes" style={{ fontWeight: 600, color: 'var(--accent-ink)', textDecoration: 'none' }}>
        Build a day →
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
            ? 'Lock a day and its ingredients land here — either a day of your meal plan, or one you built yourself out of the recipe library.'
            : 'The days you locked need nothing you do not already have.'}
        />
      </div>
    );
  }

  return (
    <div>
      {lockedNote}
      <ShoppingRange mode={mode} days={days} onDays={setDays} />
      {/* The delivery-schedule and shopping-summary cards left this page on
          13 Aug (owner's call). Ordering is not live, so a schedule of drops
          nobody can order was a promise; and the family scaling the summary
          described is said once, on the sheet, where the list actually is. */}
      {/* progress + view toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ fontSize: 15 }}>{checkedCount}/{itemCount}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>items checked off</span>
          </div>
          <div style={{ height: 6, borderRadius: 'var(--r-full)', background: 'var(--line)', marginTop: 6, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${itemCount ? (checkedCount / itemCount) * 100 : 0}%`, background: 'var(--accent)', borderRadius: 'var(--r-full)', transition: 'width .2s' }} />
          </div>
        </div>
        <div style={{ display: 'inline-flex', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: 3 }}>
          {(['grocery', 'recipe'] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 'var(--r-full)', padding: '6px 16px', fontSize: 12.5, fontWeight: 700,
                background: view === v ? 'var(--card)' : 'transparent',
                color: view === v ? 'var(--ink)' : 'var(--muted)',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none', transition: 'box-shadow var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease)',
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
          {/* THE LIST IS A PRINTED SHEET — the owner's reference art (13 Aug):
              blue paper, tracked-caps masthead, aisle sections, dotted leaders
              to the quantities. The ink is navy rather than the reference's
              white, which is 1.95:1 against this paper and no veil can fix ink
              lighter than its sheet; the ratios live in tokens.css. Everything
              functional above the sheet keeps the city's white. */}
          <div className="grocery-sheet">
            <header className="gsheet-mast">
              <div className="gsheet-city">TOGETHER CITY</div>
              <div className="gsheet-doc">GROCERY LIST</div>
              {/* SEND THE LIST. Explicit inks rather than `ghost`'s defaults:
                  this sheet re-points its own --grocery-* scale and not the
                  city's, so a button reading root --muted would print grey on
                  blue. The card carries the lines themselves — see
                  groceryShareCard for why it has no link. */}
              <div className="gsheet-acts">
                <ShareIconButton
                  card={groceryShareCard({
                    title: mode === 'family' ? 'Family grocery list' : 'Grocery list',
                    lines: aisles.flatMap((a) => a.items.map((i) => `${i.name} · ${i.qtyLabel}`)),
                    itemCount,
                    people: menuFor,
                    household: mode === 'family',
                  })}
                  label="Send this grocery list"
                  variant="ghost"
                  style={{ border: '2px solid var(--grocery-ink)', color: 'var(--grocery-ink)', fontWeight: 700, letterSpacing: '.04em' }}
                />
                {/* DOWNLOAD IS PRINT, AND THAT IS NOT A SHORTCUT.
                    The list is already a printed checklist — masthead, aisles,
                    tick boxes, leaders — so the file worth having is this
                    sheet, and every print dialog on every platform offers
                    "Save as PDF". A hand-built PDF would have been a second
                    layout to keep in step with this one, a library to carry,
                    and a file that could not be sent to a printer; a .txt would
                    have thrown away the boxes, which are the reason you take a
                    grocery list out of the house. The stylesheet that makes it
                    print well is in relief.css beside the sheet's own rules. */}
                <button type="button" className="gsheet-print" onClick={() => window.print()}
                  aria-label="Download or print this grocery list">
                  <span aria-hidden>⭳</span> Download
                </button>
              </div>
            </header>
            <p className="gsheet-intro">
              Every item below comes from the menus you locked, in the plan you locked them in —
              real quantities, duplicates merged, nothing inferred.
              {' '}This menu is for <strong>{menuFor} {menuFor === 1 ? 'person' : 'people'}</strong>
              {summary?.peopleBasis === 'household' ? ' — your household, portioned to each member' : ''}.
            </p>
            {mode === 'individual' && (
              <div className="gsheet-people">
                <span>Cooking for</span>
                <button type="button" aria-label="One person fewer"
                  disabled={plan.isFetching || menuFor <= 1}
                  onClick={() => setPeople(Math.max(1, menuFor - 1))}>−</button>
                <span className="gsheet-people-n" aria-live="polite">{menuFor}</span>
                <button type="button" aria-label="One person more"
                  disabled={plan.isFetching || menuFor >= 12}
                  onClick={() => setPeople(Math.min(12, menuFor + 1))}>+</button>
                <span>{menuFor === 1 ? 'person' : 'people'} — every quantity scales</span>
              </div>
            )}
            <div className="gsheet-cols">
              {aisles.map((a) => (
                <section key={a.key} className="gsheet-aisle">
                  <h3 className="gsheet-aisle-title">
                    {a.title}{' '}
                    <span className="gsheet-aisle-note">
                      {a.items.filter((i) => checked.has(i.name)).length}/{a.items.length}
                    </span>
                  </h3>
                  {a.items.map((it) => (
                    <SheetRow key={it.name} item={it} checked={checked.has(it.name)} onToggle={() => toggle(it.name)} />
                  ))}
                </section>
              ))}
            </div>
            <footer className="gsheet-foot">TOGETHER CITY</footer>
          </div>
        </>
      ) : (
        <>
          {recipes.map((r, ri) => (
            <div key={ri} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14, borderRadius: 16 }}>
              <div style={{ padding: '13px 16px', background: 'var(--paper)' }}>
                <h3 style={{ fontSize: 15, margin: 0, textTransform: 'capitalize' }}>{r.recipe}</h3>
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
