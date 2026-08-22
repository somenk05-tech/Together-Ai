import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { ProductShot } from '@/features/beauty/components/ProductShot';
import type { Shop } from './types';

/**
 * ── THE STOREFRONT ──────────────────────────────────────────────────────────
 *
 * White, edge to edge, with a bar of its own carrying one way back and the bag.
 * No hub rail, no breadcrumb, no district colour: the page calls
 * `useHubTheme(null)` on the way in, so whichever room you arrived from stops
 * lending it a lamp.
 *
 * IT KNOWS NOTHING ABOUT BEAUTY. Everything it draws comes off the `Shop` it is
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
          printed "Your Routine" twice on the bag — once as the way back and
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

export function StoreFront({ shop }: { shop: Shop }) {
  /* ALL, THEN THE AISLES. The default is everything because that is what the
     Open Market promises on its own card — "every category, nothing ranked for
     you" — and a shop that opens pre-filtered has quietly ranked something. */
  const [group, setGroup] = useState<string>('all');

  if (shop.isLoading) {
    return (
      <div className="st-page">
        <StoreBar shop={shop} back={shop.back.path} backLabel={shop.back.label} />
        <div className="st-wait"><Spinner label="Opening the store…" /></div>
      </div>
    );
  }

  if (shop.isError) {
    return (
      <div className="st-page">
        <StoreBar shop={shop} back={shop.back.path} backLabel={shop.back.label} />
        <div className="st-wait">
          <EmptyState
            title="Couldn’t open this shelf"
            hint="Nothing in your bag is affected — we just couldn’t read the list. Try again in a moment."
          />
        </div>
      </div>
    );
  }

  const bag = shop.bag;
  return (
    <div className="st-page">
      <StoreBar shop={shop} back={shop.back.path} backLabel={shop.back.label} />

      <header className="st-head">
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
          <EmptyState title={shop.emptyTitle ?? 'Nothing on this shelf yet'} hint={shop.emptyHint} />
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
                  {rupees(item.priceInr)}
                  {item.keepLabel && <span className="st-keep"> {item.keepLabel}</span>}
                </div>
                {item.packLabel && <div className="st-pack">{item.packLabel}</div>}
                {item.why && item.why.length > 0 && <p className="st-why">{item.why.join(' · ')}</p>}

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
                    Add to bag
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {shop.note && <p className="st-blocked">{shop.note}</p>}
      {shop.blocked && <p className="st-blocked">{shop.blocked}</p>}

      {bag && bag.count > 0 && (
        <div className="st-baglet">
          <div className="st-baglet-in">
            <span className="st-baglet-n">{bag.count} item{bag.count === 1 ? '' : 's'}</span>
            <span className="st-total">{rupees(bag.totalInr)}</span>
            <Link to={shop.screens.bag} className="st-cta">Checkout</Link>
          </div>
        </div>
      )}
    </div>
  );
}
