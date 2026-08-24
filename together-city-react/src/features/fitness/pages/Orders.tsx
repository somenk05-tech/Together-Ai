import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useStore, useBag, useSaveBag, useOrders, usePlaceOrder, serverSaid } from '@/api/store.api';
import { Shot } from '../components/PackShot';

/**
 * My Orders — and, above them, the bag. The Beauty hub's shape, taken whole,
 * at the owner's word (16 Aug): checkout is a PAGE, not a panel parked on top
 * of the shelf.
 *
 * WHY A PAGE. The store used to carry the bag, the refusal acknowledgement
 * and the pay button inline above the products, which asked somebody to
 * authorise a charge while the shop was still trying to sell them more. This
 * is where the bar's link goes now: every line with its photograph, its own
 * price and its quantity, the total at the foot, the wallet under that — and
 * the quantities still editable here, because the last place somebody looks
 * at a list is exactly where they change their mind about it. Nothing is
 * charged before this page.
 *
 * THE REFUSAL FRICTION MOVED WITH THE TILL, because it belongs to paying and
 * not to browsing: a bag holding products the citizen's own plan refuses
 * shows the trial once, here, and the server verifies the acknowledgement
 * rather than trusting the screen to have asked.
 *
 * THE BAG SITS ABOVE THE HISTORY because it is the live thing. Once it is
 * paid it becomes the first row underneath, the bag empties itself, and this
 * page goes back to being what it is called.
 */
const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function Orders() {
  const store = useStore();
  const bagQ = useBag();
  const ordersQ = useOrders();
  const save = useSaveBag();
  const pay = usePlaceOrder();
  const [read, setRead] = useState(false);
  const [placed, setPlaced] = useState(false);

  const items = useMemo(() => store.data?.items ?? [], [store.data]);
  const bagLines = useMemo(() => bagQ.data?.lines ?? [], [bagQ.data]);
  const hasBag = bagLines.length > 0;

  const setQty = (id: string, n: number) => {
    const next = bagLines
      .map((l) => ({ id: l.id, qty: l.id === id ? n : l.qty }))
      .filter((l) => l.qty > 0);
    save.mutate(next);
  };

  /* Which lines this city recommends against — read off the same plan the
     store shows, checked again by the server at payment. */
  const refusedLines = bagLines.filter(
    (l) => items.find((p) => p.id === l.id)?.yours?.bucket === 'not-recommended',
  );
  const busy = save.isPending || pay.isPending;
  const canPay = (bagQ.data?.totalInr ?? 0) > 0 && (refusedLines.length === 0 || read);
  const payError = serverSaid(pay.error);
  const list = ordersQ.data ?? [];

  if (bagQ.isLoading || ordersQ.isLoading) return <Spinner label="Loading your orders…" />;

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <div className="eyebrow">Fitness · 10</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,42px)' }}>{hasBag ? 'Your bag' : 'Your orders'}</h1>
          {hasBag ? (
            <p className="lede" style={{ marginTop: 6 }}>
              Everything you’ve added from the store. Nothing is charged until you pay,
              and it stays here until you remove it.
            </p>
          ) : null}
        </div>
      </div>

      {hasBag && (
        <>
          <section className="card rise" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
            {bagLines.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', borderTop: '1px solid var(--line-2)', flexWrap: 'wrap' }}>
                <span style={{ width: 48, height: 48, flex: 'none', background: 'var(--well)', borderRadius: 'var(--r-1)', overflow: 'hidden' }}>
                  <Shot image={l.image} pack={l.pack} colour={l.colour} />
                </span>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{l.name ?? 'No longer on the shelf'}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {l.gone
                      ? 'This one has left the shelf — remove it to pay for the rest'
                      : l.sellable
                        ? `${l.brand ?? ''}${typeof l.priceInr === 'number' ? ` · ${rupees(l.priceInr)} each` : ''}`
                        : 'Can’t be sold here — it isn’t in the total'}
                  </div>
                </div>
                {/* EDITABLE HERE, deliberately. Sending somebody back to the
                    shop to drop one item is how a bag gets abandoned instead
                    of trimmed. */}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <button type="button" className="btn btn-sm" disabled={busy}
                    aria-label={`One fewer ${l.name ?? 'item'}`} onClick={() => setQty(l.id, l.qty - 1)}>−</button>
                  <b style={{ fontSize: 13.5, minWidth: 16, textAlign: 'center' }}>{l.qty}</b>
                  <button type="button" className="btn btn-sm" disabled={busy || l.qty >= 12}
                    aria-label={`One more ${l.name ?? 'item'}`} onClick={() => setQty(l.id, l.qty + 1)}>+</button>
                </span>
                <b style={{ minWidth: 88, textAlign: 'right', fontSize: 14 }}>
                  {typeof l.lineTotalInr === 'number' ? rupees(l.lineTotalInr) : '—'}
                </b>
              </div>
            ))}

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', padding: '16px 18px', borderTop: '1px solid var(--line-2)', background: 'var(--well)' }}>
              <span className="eyebrow">Total</span>
              <span className="muted" style={{ fontSize: 12 }}>{bagLines.length} item{bagLines.length === 1 ? '' : 's'}</span>
              <b style={{ marginLeft: 'auto', fontSize: 24, letterSpacing: '-.01em' }}>{rupees(bagQ.data?.totalInr ?? 0)}</b>
            </div>
          </section>

          {(bagQ.data?.unsellable ?? 0) > 0 && (
            <p className="muted" style={{ fontSize: 12.5, margin: '0 0 14px', lineHeight: 1.55 }}>
              {bagQ.data?.unsellable} of these can’t go through this checkout and {(bagQ.data?.unsellable ?? 0) === 1 ? 'is' : 'are'} not
              in the total.
            </p>
          )}

          {/* THE ONE PIECE OF FRICTION, and it lives at the till: adding a
              refused product was free, paying for one means reading the trial
              once. The server checks this too — a confirmation nothing
              verifies is decoration. */}
          {refusedLines.length > 0 && (
            <section className="card rise" style={{ padding: '14px 16px', marginBottom: 16 }}>
              <b style={{ display: 'block', fontSize: 14 }}>
                {refusedLines.length === 1 ? 'One of these is on your plan’s do-not-buy list' : `${refusedLines.length} of these are on your plan’s do-not-buy list`}
              </b>
              <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 8 }}>
                {refusedLines.map((l) => {
                  const p = items.find((x) => x.id === l.id);
                  return (
                    <li key={l.id} style={{ fontSize: 13, lineHeight: 1.55 }}>
                      <b>{l.name}</b>
                      {p?.yours?.why ? <span className="muted"> — {p.yours.why}</span> : null}
                      {p?.yours?.source ? <span className="muted" style={{ display: 'block', fontSize: 11.5 }}>{p.yours.source}</span> : null}
                    </li>
                  );
                })}
              </ul>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 10, fontSize: 13 }}>
                <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
                <span>I’ve read that, and I still want to buy it.</span>
              </label>
            </section>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            <button type="button" className="btn" disabled={busy || !canPay}
              onClick={() => pay.mutate(
                {
                  items: bagLines.filter((l) => l.sellable).map((l) => ({ id: l.id, qty: l.qty })),
                  acknowledged: refusedLines.map((l) => l.id),
                },
                { onSuccess: () => { setPlaced(true); setRead(false); } },
              )}>
              {pay.isPending ? 'Paying…' : `Pay ${rupees(bagQ.data?.totalInr ?? 0)}`}
            </button>
            <Link className="btn btn-sm" to="/fitness/store">Keep shopping</Link>
            <button type="button" className="btn btn-sm" disabled={busy} onClick={() => save.mutate([])}>Empty the bag</button>
          </div>

          {payError ? (
            <p style={{ fontSize: 13, margin: '0 0 16px', fontWeight: 600 }}>{payError}</p>
          ) : pay.isError ? (
            <p style={{ fontSize: 13, margin: '0 0 16px', fontWeight: 600 }}>
              That didn’t go through, and nothing was taken. Try again in a moment.
            </p>
          ) : null}
        </>
      )}

      {placed && !hasBag && (
        <p style={{ fontSize: 13.5, fontWeight: 700, margin: '0 0 16px' }}>
          ✓ Paid. It’s the first order below, and it shows in your Financial hub under Fitness.
        </p>
      )}

      {hasBag && list.length > 0 && <h2 style={{ fontSize: 17, margin: '0 0 12px' }}>Earlier orders</h2>}

      {list.length === 0 && !hasBag ? (
        <section className="card rise" style={{ padding: '18px 20px' }}>
          <b style={{ display: 'block', fontSize: 16 }}>No orders yet</b>
          <p className="muted" style={{ margin: '6px 0 12px' }}>
            The store carries everything the evidence review found actually sold in India —
            with your own plan’s verdict on every card.
          </p>
          <Link className="btn btn-sm" to="/fitness/store">Go to the store</Link>
        </section>
      ) : (
        <div>
          {list.map((o) => (
            <article key={o.id} className="card rise" style={{ marginBottom: 12, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: 15 }}>{rupees(o.totalInr)}</b>
                <span className="eyebrow">{o.status}</span>
                <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }}>{o.createdAt.slice(0, 10)}</span>
              </div>
              <span className="muted" style={{ display: 'block', fontSize: 13, marginTop: 6, lineHeight: 1.5 }}>
                {o.items.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(' · ')}
              </span>
            </article>
          ))}
          {list.length > 0 && (
            <p className="muted" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.55 }}>
              Prices are what you paid on the day.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
