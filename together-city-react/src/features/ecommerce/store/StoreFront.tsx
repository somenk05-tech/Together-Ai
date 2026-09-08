import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { ProductShot } from '@/features/beauty/components/ProductShot';
import { FloorPage, type Floor } from './Floor';
import type { Shop } from './types';

/**
 * ── THE STOREFRONT ──────────────────────────────────────────────────────────
 *
 * White, edge to edge, with a bar of its own carrying one way back and the bag.
 * No hub rail, no breadcrumb, no district colour: the page calls
 * `useHubTheme(null)` on the way in, so whichever room you arrived from stops
 * lending it a lamp.
 *
 * IT KNOWS NOTHING ABOUT BEAUTY, AND NOTHING ABOUT GEMSTONES EITHER — the
 * dials it draws are a range and a number and a way of writing the number down,
 * which is why the word "carat" appears nowhere in this file.
 * Everything it draws comes off the `Shop` it is
 * handed — title, line, items, bag, till — which is what makes the second and
 * third shelves an adapter file each rather than a second storefront. The one
 * borrowed part is `ProductShot`, and it is borrowed on purpose: it already
 * walks two hotlinked retailer photographs and falls through to a category mark
 * rather than a torn frame, and rewriting that here would be a second copy of a
 * bug already paid for once.
 *
 * NOT ONE INLINE STYLE OBJECT, and that is a constraint rather than taste:
 * `size-system-ceiling.mjs` sits at its ceiling on all four counts, so a shop
 * that shipped with `style={{ }}` on a tile would have grown the debt on the
 * day it opened. Every rule is in the `.st-*` block in layout.css.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

/** The bar every screen of the store wears: back, name, bag. */
export function StoreBar({ shop, back, backLabel, name }: { shop: Shop; back: string; backLabel: string; name?: string }) {
  const count = shop.bag?.count ?? 0;
  return (
    <div className="st-bar">
      <Link to={back} className="st-back"><span aria-hidden>←</span> {backLabel}</Link>
      {/* The bar names the screen you are ON. Defaulting it to the shop's title
          printed the routine's name twice on the bag — once as the way back and
          once as where you are — which says nothing about either. */}
      <span className="st-bar-name">{name ?? shop.title}</span>
      {shop.bag && (
        <Link to={shop.screens.bag} className="st-bar-bag">
          Bag{count > 0 ? ` · ${count}` : ''}
        </Link>
      )}
    </div>
  );
}

/**
 * THE ONE NUMBER THAT DECIDES WHAT IS DRAWN (owner, 5 Sep) — a monthly figure
 * the citizen types, saved when they leave the field or press Enter, and a
 * Clear that means "no cap" rather than zero. The shell prints the shelf's
 * total, the shelf's note and the shelf's list of what the number could not
 * reach; it does not know what any of them are made of. A draft is kept
 * locally so typing "2" on the way to "2000" does not save a ₹2 budget.
 */
function BudgetBar({ budget }: { budget: NonNullable<Shop['budget']> }) {
  const [draft, setDraft] = useState<string>(budget.valueInr === null ? '' : String(budget.valueInr));
  const [seen, setSeen] = useState<number | null>(budget.valueInr);
  if (seen !== budget.valueInr) {
    // The server's number moved under us (saved, or cleared elsewhere): the
    // field follows it. Done as a render-time reconcile rather than an effect
    // so there is no frame where the old draft shows over the new value.
    setSeen(budget.valueInr);
    setDraft(budget.valueInr === null ? '' : String(budget.valueInr));
  }
  const commit = () => {
    const n = draft.trim() === '' ? null : Math.max(0, Math.floor(Number(draft)));
    if (n !== null && !Number.isFinite(n)) return;
    if (n !== budget.valueInr) budget.onChange(n);
  };
  const set = budget.valueInr !== null;
  return (
    <section className="st-budget" aria-label={budget.label}>
      <div className="st-budget-row">
        <label className="st-budget-label" htmlFor="st-budget-input">{budget.label}</label>
        <span className="st-budget-field">
          <span className="st-budget-cur" aria-hidden>₹</span>
          <input id="st-budget-input" className="st-budget-input" type="number" inputMode="numeric" min={0} step={100}
            placeholder="No cap" value={draft} disabled={budget.saving}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
          <span className="st-budget-unit">/ month</span>
        </span>
        <button type="button" className="st-budget-save" disabled={budget.saving} onClick={commit}>
          {budget.saving ? 'Saving…' : 'Set'}
        </button>
        {set && (
          <button type="button" className="st-budget-clear" disabled={budget.saving} onClick={() => budget.onChange(null)}>
            Clear
          </button>
        )}
      </div>
      <p className="st-budget-sum">
        {set
          ? <>Your kit comes to <b>{rupees(budget.totalInr)}</b> of {rupees(budget.valueInr ?? 0)}.</>
          : (budget.unsetHint ?? 'No number set.')}
        {budget.note ? <span className="st-budget-note"> {budget.note}</span> : null}
      </p>
      {budget.dropped.length > 0 && (
        <ul className="st-budget-dropped" aria-label="Not in your kit at this number">
          {budget.dropped.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </section>
  );
}

export function StoreFront({ shop, floor }: { shop: Shop; floor?: Floor }) {
  /* ALL, THEN THE AISLES. The default is everything because that is what the
     Open Market promises on its own card — "every category, nothing ranked for
     you" — and a shop that opens pre-filtered has quietly ranked something. */
  const [group, setGroup] = useState<string>('all');
  const bag = shop.bag;

  /* ON A FLOOR OF THE DISTRICT (owner, 6 Sep) the shop is one tab of a store
     rather than a page of its own: the bar is the floor's, with the store's
     two sections and the one city cart on it, and the tab row under it. Off
     a floor it is exactly what it was — its own bar, its own way back. The
     three states below wear the same frame so a shelf that is loading, or
     could not be read, does not lose the tabs that lead off it. */
  const frame = (children: ReactNode) => (floor ? (
    <FloorPage floor={floor}>{children}</FloorPage>
  ) : (
    <div className="st-page">
      <StoreBar shop={shop} back={shop.back.path} backLabel={shop.back.label} />
      {children}
    </div>
  ));

  if (shop.isLoading) {
    return frame(<div className="st-wait"><Spinner label="Opening the store…" /></div>);
  }

  if (shop.isError) {
    return frame(
      <div className="st-wait">
        <EmptyState
          title="Couldn’t open this shelf"
          hint="Nothing in your bag is affected — we just couldn’t read the list. Try again in a moment."
        />
      </div>,
    );
  }

  return frame(
    <>
      <header className={`st-head${floor ? ' sf-head' : ''}`}>
        <div className="st-eyebrow">{shop.hubName}</div>
        <h1 className="st-title">{shop.title}</h1>
        <p className="st-line">{shop.line}</p>
        {shop.from && (
          <p className="st-from">
            Built from your {shop.from.label} — <Link to={shop.from.path}>update it</Link>
          </p>
        )}
        {shop.items.length > 0 && (
          <p className="st-count">
            {shop.items.length} item{shop.items.length === 1 ? '' : 's'} {shop.countLabel ?? 'shortlisted'}
          </p>
        )}
      </header>

      {/* THE NUMBER BEFORE THE SHELF, and drawn even when the shelf is empty —
          an empty kit is most often a number set too low, and the way to fix
          it must not vanish with the tiles. */}
      {shop.budget && <BudgetBar budget={shop.budget} />}

      {shop.groups && shop.groups.length > 1 && (
        <div className="st-aisles">
          <button type="button" className={`st-aisle${group === 'all' ? ' on' : ''}`}
            aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
            All <span className="st-aisle-n">{shop.items.length}</span>
          </button>
          {shop.groups.map((g) => (
            <button key={g.key} type="button" className={`st-aisle${group === g.key ? ' on' : ''}`}
              aria-pressed={group === g.key} onClick={() => setGroup(g.key)}>
              {g.label} <span className="st-aisle-n">{g.count}</span>
            </button>
          ))}
        </div>
      )}

      {shop.items.length === 0 ? (
        <div className="st-wait">
          {/* THE EMPTY SHELF CARRIES THE WAY OUT OF ITSELF (owner, 23 Aug).
              A first-time citizen was told the one thing they had to do and
              given nothing to press — the place to do it is in another hub,
              behind a back button, on a rail they had just left. `emptyTo` is
              set per REASON rather than per shop; see types.ts. */}
          <EmptyState
            title={shop.emptyTitle ?? 'Nothing on this shelf yet'}
            hint={shop.emptyHint}
            action={shop.emptyTo && (
              <Link className="btn btn-accent btn-sm" to={shop.emptyTo.path}>{shop.emptyTo.label}</Link>
            )}
          />
        </div>
      ) : (
        <div className="st-grid">
          {shop.items.filter((i) => group === 'all' || i.group === group).map((item) => {
            const qty = shop.qtyOf(item.id);
            return (
              <article key={item.id} className="st-card">
                <div className="st-shot">
                  {item.tier && <span className="st-tier">{item.tier}</span>}
                  <ProductShot image={item.image} imageAlt={item.imageAlt} name={item.name} category={item.category} fill />
                </div>
                {item.role && <div className="st-role">{item.role}</div>}
                <h2 className="st-name">{item.name}</h2>
                {item.brand && <div className="st-brand">{item.brand}</div>}
                <div className="st-price">
                  {/* A SHELF MAY HAVE NO NUMBER TO SHOW, and "₹0" is the one
                      answer that would be a lie. `priceLabel` is the shelf's
                      own word for that case — see types.ts. */}
                  {item.priceLabel ?? rupees(item.priceInr)}
                  {item.keepLabel && <span className="st-keep"> {item.keepLabel}</span>}
                </div>
                {item.packLabel && <div className="st-pack">{item.packLabel}</div>}
                {item.priceNote && <div className="st-pricenote">{item.priceNote}</div>}
                {item.why && item.why.length > 0 && <p className="st-why">{item.why.join(' · ')}</p>}

                {/* THE DIALS, WHERE A SHELF HAS ANY. Four of the five shelves
                    sell a finished thing and pass none, so their tiles are
                    exactly what they were. The gem counter passes two, because
                    on that shelf the carats and the grade ARE the product —
                    there is nothing to add to a bag until both are set.

                    `aria-label` on the input rather than a <label for>: the
                    visible label already sits beside the value it names, and a
                    second copy of "Carats" would be read out twice. */}
                {item.dials?.map((d) => (
                  <div key={d.key} className="st-dial">
                    <div className="st-dial-top">
                      <span className="st-dial-name">{d.label}</span>
                      <span className="st-dial-val">{d.format(d.value)}</span>
                    </div>
                    <input
                      type="range" className="st-dial-range"
                      min={d.min} max={d.max} step={d.step} value={d.value}
                      aria-label={`${d.label} for ${item.name}`}
                      onChange={(e) => d.onChange(Number(e.target.value))}
                    />
                    {(d.minLabel || d.maxLabel) && (
                      <div className="st-dial-ends">
                        <span>{d.minLabel}</span>
                        <span>{d.maxLabel}</span>
                      </div>
                    )}
                  </div>
                ))}

                {item.design ? (
                  <Link to={item.design.path} className="st-add st-add-link">{item.design.label}</Link>
                ) : !bag ? null : qty > 0 ? (
                  <div className="st-qty">
                    <button type="button" disabled={shop.isSaving} onClick={() => shop.remove(item.id)} aria-label={`One fewer ${item.name}`}>–</button>
                    <span>{qty} in bag</span>
                    <button type="button" disabled={shop.isSaving} onClick={() => shop.add(item.id)} aria-label={`One more ${item.name}`}>+</button>
                  </div>
                ) : (
                  <button type="button" className="st-add" disabled={shop.isSaving} onClick={() => shop.add(item.id)}>
                    {item.addLabel ?? 'Add to bag'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {shop.note && <p className="st-blocked">{shop.note}</p>}
      {shop.blocked && <p className="st-blocked">{shop.blocked}</p>}

      {/* THE SHOP'S OWN CHECKOUT, OFF A FLOOR ONLY. On a floor the bar and
          the foot carry the city cart (owner, 7 Sep: one checkout for every
          sector), so this shop's bag is not drawn twice. */}
      {!floor && bag && bag.count > 0 && (
        <div className="st-baglet">
          <div className="st-baglet-in">
            <span className="st-baglet-n">{bag.count} item{bag.count === 1 ? '' : 's'}</span>
            <span className="st-total">{rupees(bag.totalInr)}</span>
            <Link to={shop.screens.bag} className="st-cta">Checkout</Link>
          </div>
        </div>
      )}
    </>,
  );
}
