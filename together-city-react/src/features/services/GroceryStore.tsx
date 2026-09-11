import { useMemo, useState } from 'react';
import { Spinner } from '@/components/ui';
import { Checkout } from './OrderMenu';
import { rupees, useAskAboutMenu, useMenu, type MenuItem, type OrderPick } from './api';

/**
 * THE GROCERY STOREFRONT — a kirana's stock list drawn as a shop, not as a
 * menu (owner, 11 Sep: "change the layout of grocery stores in the local
 * market to this design"). The reference is a grocery e-commerce front: a
 * green hero, a row of round category tiles, and a grid of product cards
 * with the photograph on top, the aisle in small type, the name, the price
 * and one Add. The kitchen's cream menu paper stays for kitchens; a shop that
 * publishes a STOCK list (business-types.ts decides which) gets this instead,
 * on the same business page, with the same cart and the same checkout.
 *
 * The cart mechanics are the menu's own — one line per item, twenty at most,
 * the number on the band an estimate off the rows on screen and the number on
 * the PLACE button the server's quote. Nothing about money changed; only the
 * shelf did. `Checkout` is imported from OrderMenu so there is one checkout in
 * the city, and it opens on the paper it always opened on.
 *
 * PHOTOGRAPHS. `photoUrl` now arrives already resolved by the server — the
 * shop's own upload first, then the catalogue pack shot, then a stock
 * photograph of the kind of thing — and `photoCredit` says which of the last
 * two it was, so a card prints the source under a picture the shop did not
 * take. A row with no photo draws an empty plate with the name's initial and
 * says nothing else; a silhouette of a generic pack would be the store
 * claiming to know what this shop's rice looks like.
 */

interface CartLine { key: string; itemId: string; qty: number }

const failText = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? fallback;

/** The lowest price a row can be had for — the base, or the cheapest size. */
const fromPrice = (item: MenuItem): number | null =>
  item.priceInr == null ? null : item.variants.length ? Math.min(item.priceInr, ...item.variants.map((v) => v.priceInr)) : item.priceInr;

export function GroceryStore({ listingId, businessName, logoUrl, onSent }: {
  listingId: string;
  businessName: string;
  logoUrl?: string | null;
  onSent?: (threadId: string) => void;
}) {
  const q = useMenu(listingId);
  const ask = useAskAboutMenu(listingId);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [aisle, setAisle] = useState<string | null>(null);
  const [find, setFind] = useState('');

  const all = useMemo(() => (q.data?.sections ?? []).flatMap((s) => s.items), [q.data]);
  const items = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);

  if (q.isLoading) return <Spinner label="Loading…" />;
  if (q.isError) return <p className="muted gs-small" role="alert">The shop's list could not be loaded just now.</p>;
  if (!q.data || q.data.count === 0) return null;

  const sections = q.data.sections;
  const needle = find.trim().toLowerCase();
  const shown = sections
    .filter((s) => aisle == null || (s.section ?? '') === aisle)
    .map((s) => ({ ...s, items: needle ? s.items.filter((i) => i.name.toLowerCase().includes(needle) || (i.description ?? '').toLowerCase().includes(needle)) : s.items }))
    .filter((s) => s.items.length > 0);

  const qtyOf = (id: string) => cart.find((l) => l.itemId === id)?.qty ?? 0;
  const add = (item: MenuItem) => {
    setCart((c) => {
      const hit = c.find((l) => l.itemId === item.id);
      if (hit) return c.map((l) => (l.itemId === item.id ? { ...l, qty: Math.min(20, l.qty + 1) } : l));
      return [...c, { key: item.id, itemId: item.id, qty: 1 }];
    });
    setCheckout(false);
  };
  const less = (id: string) => {
    setCart((c) => c.flatMap((l) => (l.itemId !== id ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])));
    setCheckout(false);
  };

  const picks: OrderPick[] = cart.map((l) => ({ itemId: l.itemId, qty: l.qty }));
  const count = cart.reduce((s, l) => s + l.qty, 0);
  const roughTotal = cart.reduce((s, l) => s + l.qty * (fromPrice(items.get(l.itemId) as MenuItem) ?? 0), 0);

  return (
    <div className="gstore">
      {/* ── the hero: the shop's name on the green ───────────────────────── */}
      <div className="gs-hero">
        <div className="gs-hero-words">
          <span className="gs-eyebrow">Together City · Local Market</span>
          <h3 className="gs-hero-name">
            {logoUrl && <img className="gs-hero-logo" src={logoUrl} alt="" />}
            {businessName}
          </h3>
          <p className="gs-hero-line">
            {q.data.count} {q.data.count === 1 ? 'item' : 'items'} · paid from your wallet
            {q.data.scanUrl && <>{' · '}<a href={q.data.scanUrl} target="_blank" rel="noreferrer">the shop's own list</a></>}
          </p>
          <label className="gs-find">
            <input className="gs-find-input" value={find} onChange={(e) => setFind(e.target.value)} maxLength={60}
              placeholder="Search this shop — rice, dal, atta…" aria-label={`Search ${businessName}`}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
            {find && <button type="button" className="gs-find-clear" onClick={() => setFind('')} aria-label="Clear the search">×</button>}
          </label>
        </div>
      </div>

      {/* ── the aisles: one round tile per heading the shop typed ──────────── */}
      {sections.length > 1 && (
        <div className="gs-aisles" role="tablist" aria-label="Aisles">
          <button type="button" role="tab" aria-selected={aisle == null} className={`gs-aisle${aisle == null ? ' is-on' : ''}`} onClick={() => setAisle(null)}>
            <span className="gs-aisle-pic gs-aisle-all" aria-hidden>✦</span>
            <span className="gs-aisle-name">Everything</span>
            <span className="gs-aisle-count">{q.data.count} items</span>
          </button>
          {sections.map((s, i) => {
            const key = s.section ?? '';
            const pic = s.items.find((x) => x.photoUrl)?.photoUrl ?? null;
            return (
              <button key={key || '_'} type="button" role="tab" aria-selected={aisle === key}
                className={`gs-aisle gs-tint-${(i % 5) + 1}${aisle === key ? ' is-on' : ''}`} onClick={() => setAisle(aisle === key ? null : key)}>
                <span className="gs-aisle-pic">{pic ? <img src={pic} alt="" loading="lazy" /> : <i aria-hidden>{(s.section ?? 'Shop').slice(0, 1)}</i>}</span>
                <span className="gs-aisle-name">{s.section ?? 'Everything else'}</span>
                <span className="gs-aisle-count">{s.items.length} {s.items.length === 1 ? 'item' : 'items'}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── the shelves ──────────────────────────────────────────────────── */}
      {shown.length === 0 && <p className="muted gs-small">Nothing on the shelf matches “{find.trim()}”.</p>}
      {shown.map((sec) => (
        <section key={sec.section ?? '_'} className="gs-shelf" aria-label={sec.section ?? 'Products'}>
          {(sec.section || sections.length > 1) && <h4 className="gs-shelf-head">{sec.section ?? 'Everything else'}</h4>}
          <div className="gs-grid">
            {sec.items.map((item) => {
              const price = fromPrice(item);
              const orderable = item.available && price != null;
              const n = qtyOf(item.id);
              return (
                <article key={item.id} className={`gs-card${item.available ? '' : ' is-out'}`}>
                  <div className="gs-pic">
                    {item.photoUrl
                      ? <img src={item.photoUrl} alt={item.name} loading="lazy" />
                      : <span className="gs-pic-empty" aria-hidden>{item.name.slice(0, 1)}</span>}
                    {!item.available && <span className="gs-badge gs-badge-out">Out of stock</span>}
                    {item.available && item.variants.length > 0 && <span className="gs-badge">{item.variants.length} sizes</span>}
                  </div>
                  {item.photoCredit && (
                    <a className="gs-credit" href={item.photoCredit.url} target="_blank" rel="noreferrer"
                      title={`${item.photoCredit.name} · ${item.photoCredit.licence}`}>
                      Photo · {item.photoCredit.name.split(' · ').pop()}
                    </a>
                  )}
                  <div className="gs-card-body">
                    <span className="gs-card-aisle">{sec.section ?? businessName}</span>
                    <span className="gs-card-name">{item.name}</span>
                    {item.description && <span className="gs-card-unit">{item.description}</span>}
                    <div className="gs-card-foot">
                      <span className="gs-price">
                        {price != null ? <>{item.variants.length > 0 && <small>from </small>}{rupees(price)}</> : <small>price on request</small>}
                      </span>
                      {orderable && (n === 0 ? (
                        <button type="button" className="gs-add" onClick={() => add(item)} aria-label={`Add ${item.name}`}>+ Add</button>
                      ) : (
                        <span className="gs-step">
                          <button type="button" className="gs-stepbtn" aria-label={`One less ${item.name}`} onClick={() => less(item.id)}>−</button>
                          <span className="gs-count">{n}</span>
                          <button type="button" className="gs-stepbtn" aria-label={`One more ${item.name}`} onClick={() => add(item)}>+</button>
                        </span>
                      ))}
                      {item.available && price == null && (
                        <button type="button" className="gs-add gs-add-quiet" disabled={ask.isPending}
                          onClick={() => ask.mutate({ itemIds: [item.id] }, { onSuccess: (r) => onSent?.(r.threadId), onError: () => undefined })}>
                          Ask
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      {/* ── the basket band ──────────────────────────────────────────────── */}
      {!checkout && (
        <div className="gs-cart">
          <span className="gs-cart-label">
            Your basket
            <span className="gs-cart-sub">{count === 0 ? 'nothing yet' : `${count} ${count === 1 ? 'item' : 'items'}`}</span>
          </span>
          <span className="gs-cart-label">
            Items
            <span className="gs-cart-total">{rupees(roughTotal)}</span>
            <span className="gs-cart-sub">+ ₹20 platform · ₹50 delivery</span>
          </span>
          <span className="gs-cart-acts">
            {count > 0 && <button type="button" className="gs-quiet" onClick={() => setCart([])}>Clear</button>}
            <button type="button" className="gs-place" disabled={count === 0} onClick={() => setCheckout(true)}>Review & place</button>
          </span>
        </div>
      )}

      {checkout && cart.length > 0 && (
        <div className="mpaper gs-checkout">
          <Checkout listingId={listingId} picks={picks}
            onBack={() => setCheckout(false)}
            onPlaced={(threadId) => { setCart([]); setCheckout(false); onSent?.(threadId); }} />
        </div>
      )}
      {ask.isError && <p className="gs-small" role="alert">{failText(ask.error, 'Could not start that conversation just now.')}</p>}
    </div>
  );
}
